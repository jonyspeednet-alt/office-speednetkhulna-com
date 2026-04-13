const jwt = require('jsonwebtoken');
const pool = require('../utilities/db');
const { getAuthSecret } = require('../utilities/authSecret');
const RETRYABLE_DB_CODES = new Set(['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', '57P01']);
const AUTH_CACHE_TTL_MS = Math.max(30000, Number(process.env.AUTH_CACHE_TTL_MS || 10 * 60 * 1000));
const authUserCache = new Map();

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const queryWithRetry = async (sql, params, maxRetries = 1) => {
  let attempt = 0;
  while (true) {
    try {
      return await pool.query(sql, params);
    } catch (error) {
      const canRetry = attempt < maxRetries && (
        RETRYABLE_DB_CODES.has(String(error.code || ''))
        || String(error.message || '').toLowerCase().includes('timeout')
        || String(error.message || '').toLowerCase().includes('connection terminated')
      );
      if (!canRetry) throw error;
      attempt += 1;
      await wait(120 * attempt);
    }
  }
};

const cacheAuthUser = (userId, user) => {
  if (!userId || !user) return;
  authUserCache.set(String(userId), {
    user,
    expiresAt: Date.now() + AUTH_CACHE_TTL_MS
  });
};

const getCachedAuthUser = (userId) => {
  const key = String(userId || '');
  if (!key) return null;
  const cached = authUserCache.get(key);
  if (!cached) return null;
  if (Date.now() > Number(cached.expiresAt || 0)) {
    authUserCache.delete(key);
    return null;
  }
  return cached.user || null;
};

const buildUserFromDb = (userData, permissions, isSuperAdmin) => {
  const { password, role_permissions, ...user } = userData;
  const permissionFlags = {};
  Object.keys(permissions).forEach((key) => {
    permissionFlags[key] = permissions[key] === true || permissions[key] === 1 || permissions[key] === '1';
  });
  return {
    ...user,
    ...permissionFlags,
    role: user.role_name || user.role || '',
    role_name: user.role_name || user.role || '',
    is_super_admin: isSuperAdmin,
    permissions
  };
};

const buildUserFromDecodedToken = (decoded) => {
  const effectiveRole = String(decoded?.role || '').trim();
  const permissions = getDefaultRolePermissions(effectiveRole);
  const permissionFlags = {};
  Object.keys(permissions).forEach((key) => {
    permissionFlags[key] = permissions[key] === true || permissions[key] === 1 || permissions[key] === '1';
  });
  return {
    id: decoded?.id,
    employee_id: decoded?.emp_id || null,
    full_name: decoded?.full_name || 'Unknown User',
    role: effectiveRole,
    role_name: effectiveRole,
    is_super_admin: ['super admin', 'superadmin'].includes(effectiveRole.toLowerCase()),
    permissions,
    ...permissionFlags,
    _degraded_auth: true
  };
};

const ALL_MENU_PERMISSIONS = [
  'p_add_reseller',
  'p_apply_leave',
  'p_billing_logs',
  'p_add_discount',
  'p_generate_bill',
  'p_invoice',
  'p_manage_leaves',
  'p_manage_menus',
  'p_manage_permissions',
  'p_manage_procurement',
  'p_manage_users',
  'p_monthly_summary',
  'p_my_leaves',
  'p_noc_view',
  'p_reports',
  'p_request_bw',
  'p_requests_admin',
  'p_reseller_list',
  'p_system_logs',
  'p_tech_task',
  'p_view_static_invoice',
  'p_office_work'
];

const getDefaultRolePermissions = (roleNameRaw) => {
  const roleName = String(roleNameRaw || '').trim().toLowerCase();

  if (roleName === 'super admin' || roleName === 'superadmin') {
    const full = { all_access: true };
    for (const key of ALL_MENU_PERMISSIONS) full[key] = true;
    return full;
  }

  if (roleName === 'admin') {
    const adminPerms = {
      all_access: true,
      p_manage_users: true,
      p_manage_leaves: true,
      p_reports: true,
      p_manage_permissions: true,
      p_manage_menus: true,
      p_manage_procurement: true,
      p_reseller_list: true,
      p_tech_task: true,
      p_billing_logs: true,
      p_add_discount: true,
      p_request_bw: true,
      p_requests_admin: true,
      p_system_logs: true,
      p_monthly_summary: true,
      p_generate_bill: true,
      p_invoice: true,
      p_view_static_invoice: true,
      p_office_work: true,
      p_add_reseller: true,
      p_noc_view: true,
      p_apply_leave: true,
      p_my_leaves: true
    };
    return adminPerms;
  }

  // Staff defaults: self-service only.
  return {
    p_apply_leave: true,
    p_my_leaves: true
  };
};

/**
 * Authentication Middleware
 * Replaces: auth_check.php (Backend Logic)
 */
const authMiddleware = async (req, res, next) => {
  let decoded = null;
  try {
    // 1. Get token from Authorization header first, then fallback to cookie.
    // This prevents stale cookie token from overriding a fresh bearer token after account switch.
    const authHeader = req.headers.authorization || '';
    const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;
    const cookieToken = req.cookies && req.cookies.token;
    const token = bearerToken || cookieToken;

    if (!token) {
      console.log('Auth Failed: No token found');
      return res.status(401).json({ message: 'Authentication required' });
    }

    // 2. Verify Token
    const authSecret = getAuthSecret();
    if (!authSecret) {
      console.error('Auth Middleware Error: JWT_SECRET/SESSION_SECRET is missing in environment');
      return res.status(500).json({ message: 'Server configuration error: JWT secret missing' });
    }

    decoded = jwt.verify(token, authSecret);

    // 3. Fetch User, Role and Permissions
    const userQuery = `
      SELECT u.*, r.name as role_name, r.permissions as role_permissions 
      FROM users u 
      LEFT JOIN roles r ON u.role_id = r.id 
      WHERE u.id = $1
    `;
    const userResult = await queryWithRetry(userQuery, [decoded.id], 1);
    
    if (userResult.rows.length === 0) {
      console.log('Auth Failed: User not found in DB for ID:', decoded.id);
      return res.status(401).json({ message: 'User no longer exists' });
    }

    const userData = userResult.rows[0];
    const effectiveRole = userData.role_name || userData.role || '';
    const rolePermissions =
      userData.role_permissions && typeof userData.role_permissions === 'object' && !Array.isArray(userData.role_permissions)
        ? userData.role_permissions
        : {};

    // Legacy support for user_permissions table
    const permQuery = 'SELECT permission_key FROM user_permissions WHERE user_id = $1';
    const permResult = await queryWithRetry(permQuery, [decoded.id], 1);
    
    const isSuperAdmin = ['super admin', 'superadmin'].includes(effectiveRole.toLowerCase());

    const permissions = {
      ...getDefaultRolePermissions(effectiveRole),
      ...rolePermissions
    };
    permResult.rows.forEach(row => {
      permissions[row.permission_key] = true;
    });
    if (isSuperAdmin) {
      permissions.all_access = true;
    }
    // 4. Attach to request
    req.user = buildUserFromDb(userData, permissions, isSuperAdmin);
    cacheAuthUser(req.user.id, req.user);
    console.log(`[Auth] User: ${req.user.full_name} (${req.user.id}), Role: ${effectiveRole}, Permissions Keys: ${Object.keys(permissions)}`);
    next();

  } catch (error) {
    console.error('Auth Middleware Error:', error);
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Invalid or expired token. Please login again.' });
    }
    const transientDbError = RETRYABLE_DB_CODES.has(String(error.code || ''))
      || String(error.message || '').toLowerCase().includes('timeout')
      || String(error.message || '').toLowerCase().includes('connection terminated');
    if (transientDbError) {
      const cachedUser = decoded?.id ? getCachedAuthUser(decoded.id) : null;
      if (cachedUser) {
        req.user = { ...cachedUser, _degraded_auth: true };
        console.warn(`[Auth] Using cached auth for user ${cachedUser.id} due to transient DB error`);
        return next();
      }

      if (decoded?.id) {
        req.user = buildUserFromDecodedToken(decoded);
        console.warn(`[Auth] Using token-fallback auth for user ${decoded.id} due to transient DB error`);
        return next();
      }

      return res.status(503).json({ message: 'Service temporarily unavailable, please retry' });
    }
    return res.status(500).json({ message: 'Internal Server Error during Authentication' });
  }
};

module.exports = authMiddleware;
