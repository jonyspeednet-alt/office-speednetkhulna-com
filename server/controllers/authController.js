const pool = require('../utilities/db');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const { getAuthSecret } = require('../utilities/authSecret');

/**
 * Login User
 * Replaces logic in login_action.php
 */
const login = async (req, res) => {
  try {
    // 0. Input Validation & Debugging
    console.log('--- Login Request Received ---');
    console.log('Request Body:', {
      ...req.body,
      password: req.body?.password ? '[REDACTED]' : undefined
    });

    const { identifier, password } = req.body;

    if (!identifier || !password) {
      res.locals.auditAction = 'LOGIN_FAILED_VALIDATION';
      res.locals.auditError = 'Missing identifier or password';
      console.log('Error: Missing identifier or password');
      return res.status(400).json({ message: 'Email/ID and Password are required' });
    }
    const inputPassword = typeof password === 'string' ? password : String(password);

    const cleanIdentifier = identifier.trim();
    const normalizedEmployeeIdentifier = cleanIdentifier
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '');
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
      cleanIdentifier
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
        normalizedEmployeeIdentifier
      ]);
      user = result.rows[0];
    }

    if (!user) {
      res.locals.auditAction = 'LOGIN_FAILED_USER_NOT_FOUND';
      res.locals.auditError = 'User not found';
      console.log(`Login Failed: User '${cleanIdentifier}' not found in DB`); 
      return res.status(401).json({ message: 'User not found' });
    }

    // 2. Verify Password
    let isMatch = false;
    // ডাটাবেস পাসওয়ার্ড ক্লিন করা (স্পেস রিমুভ)
    const dbPassword = user.password ? user.password.trim() : '';

    // ডিবাগিং লগ: সার্ভার কনসোলে পাসওয়ার্ড চেক করার জন্য
    console.log('--- Password Verification ---');

    // First try bcrypt if it looks like a hash
    if (dbPassword.startsWith('$2')) {
      try {
        isMatch = await bcrypt.compare(inputPassword, dbPassword);
        console.log(`Method: Bcrypt | Match: ${isMatch}`);
      } catch (err) {
        console.error('Bcrypt Error:', err);
        isMatch = false;
      }
    }

    // If still not matched, try plain text fallback
    if (!isMatch) {
      isMatch = (inputPassword === dbPassword);
      console.log(`Method: Plain Text | Match: ${isMatch}`);
    }
    console.log('-------------------');

    if (!isMatch) {
      res.locals.auditAction = 'LOGIN_FAILED_INVALID_PASSWORD';
      res.locals.auditError = 'Invalid password';
      console.log('Login Failed: Password mismatch'); 
      return res.status(401).json({ message: 'Invalid password' });
    }

    // 3. Generate Token
    const authSecret = getAuthSecret();
    if (!authSecret) {
      console.error('Login Error: JWT_SECRET/SESSION_SECRET is missing in environment');
      return res.status(500).json({
        message: 'Server configuration error',
        error: 'JWT secret is not configured'
      });
    }

    const token = jwt.sign(
      { id: user.id, role: user.role, emp_id: user.employee_id, full_name: user.full_name },
      authSecret,
      { expiresIn: '1d' }
    );

    // 4. Set Cookie
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 24 * 60 * 60 * 1000 // 1 day
    });

    // 5. Return User Info (excluding password)
    const { password: _, ...userInfo } = user;
    res.locals.auditAction = 'LOGIN_SUCCESS';
    res.locals.auditUserId = user.id;
    res.locals.auditUserName = user.full_name || null;
    res.locals.auditRoleName = user.role || null;
    res.json({ 
      message: 'Login successful',
      user: userInfo,
      token // টোকেন পাঠানো হলো যাতে ফ্রন্টএন্ড localStorage এ রাখতে পারে
    });

  } catch (error) {
    res.locals.auditAction = 'LOGIN_FAILED_SERVER_ERROR';
    res.locals.auditError = error.message;
    console.error('Login Error:', error);
    res.status(500).json({ 
      message: 'Server Error',
      error: error.message,
      detail: error.detail || 'No additional details available'
    });
  }
};

/**
 * Logout User
 * Replaces logic in logout.php
 */
const logout = (req, res) => {
  // Clear the authentication cookie (assuming 'token' is used)
  res.clearCookie('token', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/'
  });
  
  res.locals.auditAction = 'LOGOUT';
  if (req.user?.id) {
    res.locals.auditUserId = req.user.id;
    res.locals.auditUserName = req.user.full_name || null;
    res.locals.auditRoleName = req.user.role || null;
  }
  res.status(200).json({ message: 'Logged out successfully' });
};

module.exports = { login, logout };
