const pool = require('../utilities/db');
const { resolvePermission, LEGACY_TO_CANONICAL } = require('../utilities/permissionRegistry');

const toTitle = (value) =>
  String(value || '')
    .replace(/^p_/, '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (ch) => ch.toUpperCase());

/**
 * Update User Permission
 * Replaces: update_permission_ajax.php
 */
const updatePermission = async (req, res) => {
  try {
    // 1. Security Check
    if (!resolvePermission(req.user, 'permissions.manage')) {
      return res.status(403).json({ message: 'Unauthorized Access' });
    }

    const { user_id, column, value } = req.body;

    // 2. Dynamic Validation
    // Check if key starts with 'p_' and contains only alphanumeric/underscores
    if (column.startsWith('p_') && /^[a-zA-Z0-9_]+$/.test(column)) {
      
      if (parseInt(value) === 1) {
        // Grant Permission (Insert)
        // Postgres equivalent of INSERT IGNORE requires a unique constraint on (user_id, permission_key)
        const insertQuery = `
          INSERT INTO user_permissions (user_id, permission_key) 
          VALUES ($1, $2) 
          ON CONFLICT (user_id, permission_key) DO NOTHING
        `;
        await pool.query(insertQuery, [user_id, column]);
      } else {
        // Revoke Permission (Delete)
        const deleteQuery = `
          DELETE FROM user_permissions 
          WHERE user_id = $1 AND permission_key = $2
        `;
        await pool.query(deleteQuery, [user_id, column]);
      }

      return res.status(200).json({ message: 'Success' });
    } else {
      return res.status(400).json({ message: 'Invalid Permission Key' });
    }

  } catch (error) {
    console.error('Database Error:', error);
    return res.status(500).json({ message: 'Database Error' });
  }
};

/**
 * Get Data for Permission Management Page
 * Replaces logic in manage_permissions.php
 */
const getManagePermissionsData = async (req, res) => {
  try {
    const currentUserId = req.user.id;
    if (!resolvePermission(req.user, 'permissions.manage')) {
      return res.status(403).json({ message: 'Unauthorized Access' });
    }

    // 2. Build a complete permission catalog.
    //    Sidebar menus alone is not enough (some permissions may not have a menu yet),
    //    so we union: sidebar_menus + role JSON permissions + user overrides + registry.
    const menuPermQuery = `
      SELECT permission_column, MAX(menu_name) AS menu_name
      FROM sidebar_menus
      WHERE permission_column LIKE 'p_%'
      GROUP BY permission_column
    `;
    const menuPermResult = await pool.query(menuPermQuery);

    const rolePermsQuery = `
      SELECT permissions
      FROM roles
      WHERE permissions IS NOT NULL
    `;
    const rolePermsResult = await pool.query(rolePermsQuery);

    const overrideKeysQuery = `
      SELECT DISTINCT permission_key
      FROM user_permissions
      WHERE permission_key LIKE 'p_%'
    `;
    const overrideKeysResult = await pool.query(overrideKeysQuery);

    const permissionMap = new Map();

    // Registry-defined legacy permission keys (source-of-truth for app checks).
    Object.keys(LEGACY_TO_CANONICAL || {}).forEach((key) => {
      if (String(key).startsWith('p_')) {
        permissionMap.set(key, toTitle(key));
      }
    });

    // Menu-derived names.
    menuPermResult.rows.forEach((row) => {
      if (!row?.permission_column) return;
      permissionMap.set(row.permission_column, row.menu_name || permissionMap.get(row.permission_column) || toTitle(row.permission_column));
    });

    // Role JSON keys.
    rolePermsResult.rows.forEach((row) => {
      const perms = row?.permissions && typeof row.permissions === 'object' ? row.permissions : {};
      Object.keys(perms).forEach((key) => {
        if (String(key).startsWith('p_')) {
          if (!permissionMap.has(key)) permissionMap.set(key, toTitle(key));
        }
      });
    });

    // User override keys.
    overrideKeysResult.rows.forEach((row) => {
      const key = row?.permission_key;
      if (key && String(key).startsWith('p_') && !permissionMap.has(key)) {
        permissionMap.set(key, toTitle(key));
      }
    });

    const permissionColumns = Array.from(permissionMap.entries())
      .map(([permission_column, menu_name]) => ({ permission_column, menu_name }))
      .sort((a, b) => a.permission_column.localeCompare(b.permission_column));

    // 3. Fetch Users (Include role_id)
    const userQuery = `
      SELECT id, employee_id, full_name, role, role_id 
      FROM users 
      WHERE role NOT ILIKE 'super admin' AND id != $1
      ORDER BY full_name ASC
    `;
    const userResult = await pool.query(userQuery, [currentUserId]);

    // 4. Fetch Active Permissions Map (for legacy or direct user overrides)
    const activePermQuery = `SELECT user_id, permission_key FROM user_permissions`;
    const activePermResult = await pool.query(activePermQuery);

    const activePermissions = {};
    activePermResult.rows.forEach(row => {
      if (!activePermissions[row.user_id]) activePermissions[row.user_id] = {};
      activePermissions[row.user_id][row.permission_key] = true;
    });

    res.json({ columns: permissionColumns, users: userResult.rows, activePermissions });
  } catch (error) {
    console.error('Get Permissions Data Error:', error);
    res.status(500).json({ message: 'Server Error' });
  }
};

module.exports = { updatePermission, getManagePermissionsData };
