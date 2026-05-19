const { isSuperAdmin, resolvePermission } = require('../utilities/permissionRegistry');

const normalizeRole = (role) => String(role || '').trim().toLowerCase();

const requireRole = (roleName) => {
  const expected = normalizeRole(roleName);
  return (req, res, next) => {
    const actual = normalizeRole(req.user?.role_name || req.user?.role);
    if (actual === expected) return next();
    return res.status(403).json({ message: `Unauthorized: role ${roleName} required` });
  };
};

const requirePermission = (permission) => {
  return (req, res, next) => {
    if (resolvePermission(req.user, permission)) return next();
    return res.status(403).json({ message: `Unauthorized: missing permission (${permission})` });
  };
};

const requireAnyPermission = (permissions = []) => {
  return (req, res, next) => {
    if (isSuperAdmin(req.user)) return next();
    for (const p of permissions) {
      if (resolvePermission(req.user, p)) return next();
    }
    return res.status(403).json({ message: `Unauthorized: requires one of [${permissions.join(', ')}]` });
  };
};

module.exports = {
  requireRole,
  requirePermission,
  requireAnyPermission,
};

