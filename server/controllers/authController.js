const pool = require("../utilities/db");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const { getAuthSecret } = require("../utilities/authSecret");
const { isMasterAdminUser } = require("../utilities/permissionRegistry");

/**
 * Login User
 * Replaces logic in login_action.php
 */
const login = async (req, res) => {
  try {
    // 0. Input Validation & Debugging
    console.log("--- Login Request Received ---");
    console.log("Request Body:", {
      ...req.body,
      password: req.body?.password ? "[REDACTED]" : undefined,
    });

    const { identifier, password } = req.body;

    if (!identifier || !password) {
      res.locals.auditAction = "LOGIN_FAILED_VALIDATION";
      res.locals.auditError = "Missing identifier or password";
      console.log("Error: Missing identifier or password");
      return res
        .status(400)
        .json({ message: "Email/ID and Password are required" });
    }
    const inputPassword =
      typeof password === "string" ? password : String(password);

    const cleanIdentifier = identifier.trim();
    const normalizedEmployeeIdentifier = cleanIdentifier
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "");
    console.log(`Processing Login for: '${cleanIdentifier}'`);

    // 1. Fast-path lookup (index-friendly)
    const fastQuery = `
      SELECT * FROM users
      WHERE email = $1
      OR email = $2
      OR CAST(employee_id AS TEXT) = $3
      LIMIT 1
    `;
    let result = await pool.query(fastQuery, [
      cleanIdentifier,
      cleanIdentifier.toLowerCase(),
      cleanIdentifier,
    ]);
    let user = result.rows[0];

    // 1b. Fallback lookup (case-insensitive & normalized)
    const query = `
      SELECT * FROM users
      WHERE LOWER(TRIM(COALESCE(email, ''))) = LOWER($1)
      OR LOWER(TRIM(COALESCE(CAST(employee_id AS TEXT), ''))) = LOWER($1)
      OR LOWER(REGEXP_REPLACE(COALESCE(CAST(employee_id AS TEXT), ''), '[^a-z0-9]+', '', 'g')) = $2
      ORDER BY id ASC
      LIMIT 1
    `;
    if (!user) {
      result = await pool.query(query, [
        cleanIdentifier,
        normalizedEmployeeIdentifier,
      ]);
      user = result.rows[0];
    }

    if (!user) {
      res.locals.auditAction = "LOGIN_FAILED_USER_NOT_FOUND";
      res.locals.auditError = "User not found";
      console.log(`Login Failed: User '${cleanIdentifier}' not found in DB`);
      return res.status(401).json({ message: "User not found" });
    }

    // 2. Verify Password
    let isMatch = false;
    // ডাটাবেস পাসওয়ার্ড ক্লিন করা (স্পেস রিমুভ)
    const dbPassword = user.password ? user.password.trim() : "";

    // ডিবাগিং লগ: সার্ভার কনসোলে পাসওয়ার্ড চেক করার জন্য
    console.log("--- Password Verification ---");

    // First try bcrypt if it looks like a hash
    if (dbPassword.startsWith("$2")) {
      try {
        isMatch = await bcrypt.compare(inputPassword, dbPassword);
        console.log(`Method: Bcrypt | Match: ${isMatch}`);
      } catch (err) {
        console.error("Bcrypt Error:", err);
        isMatch = false;
      }
    }

    // If still not matched, try plain text fallback
    if (!isMatch) {
      isMatch = inputPassword === dbPassword;
      console.log(`Method: Plain Text | Match: ${isMatch}`);
    }
    console.log("-------------------");

    if (!isMatch) {
      res.locals.auditAction = "LOGIN_FAILED_INVALID_PASSWORD";
      res.locals.auditError = "Invalid password";
      console.log("Login Failed: Password mismatch");
      return res.status(401).json({ message: "Invalid password" });
    }

    // 3. Generate Token
    const authSecret = getAuthSecret();
    if (!authSecret) {
      console.error(
        "Login Error: JWT_SECRET/SESSION_SECRET is missing in environment",
      );
      return res.status(500).json({
        message: "Server configuration error",
        error: "JWT secret is not configured",
      });
    }

    const isMasterAdmin = isMasterAdminUser(user);
    const effectiveRole = isMasterAdmin ? "Super Admin" : user.role;
    const TOKEN_EXPIRY = "7d"; // 7 days for better user experience
    const COOKIE_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days in ms

    const token = jwt.sign(
      {
        id: user.id,
        role: effectiveRole,
        emp_id: user.employee_id,
        full_name: user.full_name,
      },
      authSecret,
      { expiresIn: TOKEN_EXPIRY },
    );

    // 4. Set Cookie
    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: COOKIE_MAX_AGE,
    });

    // 5. Build Enriched User Info (Including Permissions)
    // Fetch permissions (Role + Overrides)
    let rolePermissions = {};
    if (user.role_id) {
      const roleRes = await pool.query(
        "SELECT permissions FROM roles WHERE id = $1",
        [user.role_id],
      );
      if (roleRes.rows.length > 0 && roleRes.rows[0].permissions) {
        rolePermissions = roleRes.rows[0].permissions;
      }
    }

    const permQuery =
      "SELECT permission_key FROM user_permissions WHERE user_id = $1";
    const permResult = await pool.query(permQuery, [user.id]);

    const permissions = { ...rolePermissions };
    permResult.rows.forEach((row) => {
      permissions[row.permission_key] = true;
    });

    if (isMasterAdmin || effectiveRole.toLowerCase().includes("super admin")) {
      permissions.all_access = true;
    }

    // Add legacy smallint flags from users table to permissions map
    const legacyKeys = [
      "can_take_action",
      "can_approve_bw",
      "can_tech_task",
      "can_view_billing",
      "can_manage_users",
      "p_reseller_list",
      "p_approve_request",
      "p_tech_task",
      "p_billing_logs",
      "p_manage_users",
      "p_manage_leaves",
      "p_reports",
      "p_apply_leave",
      "p_my_leaves",
      "p_manage_procurement",
    ];
    legacyKeys.forEach((key) => {
      if (user[key] === 1) permissions[key] = true;
    });

    const { password: _, ...userInfo } = user;
    const enrichedUser = {
      ...userInfo,
      ...permissions, // Merge flags to top-level for direct access
      role: effectiveRole,
      role_name: effectiveRole,
      is_super_admin: isMasterAdmin,
      permissions, // Also keep the permissions object
    };

    res.locals.auditAction = "LOGIN_SUCCESS";
    res.locals.auditUserId = user.id;
    res.locals.auditUserName = user.full_name || null;
    res.locals.auditRoleName = effectiveRole || null;

    res.json({
      message: "Login successful",
      user: enrichedUser,
      token,
    });
  } catch (error) {
    res.locals.auditAction = "LOGIN_FAILED_SERVER_ERROR";
    res.locals.auditError = error.message;
    console.error("Login Error:", error);
    res.status(500).json({
      message: "Server Error",
      error: error.message,
      detail: error.detail || "No additional details available",
    });
  }
};

/**
 * Change Password (own account only - plain text storage)
 */
const changePassword = async (req, res) => {
  try {
    const userId = req.user.id;
    const { current_password, new_password } = req.body;

    if (!current_password || !new_password) {
      return res
        .status(400)
        .json({ message: "বর্তমান ও নতুন পাসওয়ার্ড প্রয়োজন" });
    }
    if (String(new_password).length < 4) {
      return res
        .status(400)
        .json({ message: "নতুন পাসওয়ার্ড কমপক্ষে ৪ অক্ষরের হতে হবে" });
    }

    // Fetch current password from DB
    const result = await pool.query(
      "SELECT password FROM users WHERE id = $1",
      [userId],
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ message: "ব্যবহারকারী পাওয়া যায়নি" });
    }

    const dbPassword = result.rows[0].password
      ? result.rows[0].password.trim()
      : "";
    const inputCurrent =
      typeof current_password === "string"
        ? current_password
        : String(current_password);
    const inputNew =
      typeof new_password === "string" ? new_password : String(new_password);

    // Verify current password (bcrypt first, then plain text fallback)
    let isMatch = false;
    if (dbPassword.startsWith("$2")) {
      try {
        isMatch = await bcrypt.compare(inputCurrent, dbPassword);
      } catch (_) {
        isMatch = false;
      }
    }
    if (!isMatch) {
      isMatch = inputCurrent === dbPassword;
    }

    if (!isMatch) {
      return res.status(401).json({ message: "বর্তমান পাসওয়ার্ড ভুল" });
    }

    // Save new password as plain text (system policy: passwords are plain text)
    await pool.query("UPDATE users SET password = $1 WHERE id = $2", [
      inputNew,
      userId,
    ]);

    res.locals.auditAction = "PASSWORD_CHANGED";
    res.locals.auditUserId = userId;
    res.json({ message: "পাসওয়ার্ড সফলভাবে পরিবর্তন হয়েছে" });
  } catch (error) {
    console.error("changePassword Error:", error);
    res.status(500).json({ message: "সার্ভার ত্রুটি", error: error.message });
  }
};

/**
 * Refresh Token — issue a fresh 7-day token for a still-valid session
 */
const refreshToken = async (req, res) => {
  try {
    const userId = req.user.id;
    const authSecret = getAuthSecret();
    if (!authSecret) {
      return res.status(500).json({ message: "Server configuration error" });
    }

    const effectiveRole = req.user.role || req.user.role_name || "Staff";
    const token = jwt.sign(
      {
        id: userId,
        role: effectiveRole,
        emp_id: req.user.employee_id,
        full_name: req.user.full_name,
      },
      authSecret,
      { expiresIn: "7d" },
    );

    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.locals.auditAction = "TOKEN_REFRESHED";
    res.locals.auditUserId = userId;
    res.json({ message: "Token refreshed", token });
  } catch (error) {
    console.error("refreshToken Error:", error);
    res.status(500).json({ message: "Server Error" });
  }
};

/**
 * Logout User
 * Replaces logic in logout.php
 */
const logout = (req, res) => {
  // Clear the authentication cookie (assuming 'token' is used)
  res.clearCookie("token", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
  });

  res.locals.auditAction = "LOGOUT";
  if (req.user?.id) {
    res.locals.auditUserId = req.user.id;
    res.locals.auditUserName = req.user.full_name || null;
    res.locals.auditRoleName = req.user.role || null;
  }
  res.status(200).json({ message: "Logged out successfully" });
};

module.exports = { login, logout, changePassword, refreshToken };
