const pool = require('../utilities/db');

// Get all roles
const getRoles = async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM roles ORDER BY name ASC');
    res.json(result.rows);
  } catch (error) {
    console.error('Get Roles Error:', error);
    res.status(500).json({ message: 'Server Error' });
  }
};

// Create or update role
const saveRole = async (req, res) => {
  const { id, name, permissions } = req.body;

  // Input validation
  if (!name || !String(name).trim()) {
    return res.status(400).json({ message: 'Role name is required' });
  }
  const trimmedName = String(name).trim();

  try {
    if (id) {
      // FIX: Check duplicate name on UPDATE (exclude self)
      const dupCheck = await pool.query(
        'SELECT id FROM roles WHERE LOWER(name) = LOWER($1) AND id != $2 LIMIT 1',
        [trimmedName, id]
      );
      if (dupCheck.rowCount > 0) {
        return res.status(409).json({ message: `Role "${trimmedName}" already exists` });
      }

      const result = await pool.query(
        'UPDATE roles SET name = $1, permissions = $2 WHERE id = $3 RETURNING *',
        [trimmedName, JSON.stringify(permissions || {}), id]
      );
      if (result.rowCount === 0) return res.status(404).json({ message: 'Role not found' });
      res.json({ message: 'Role updated successfully', role: result.rows[0] });
    } else {
      // FIX: Check duplicate name on CREATE
      const dupCheck = await pool.query(
        'SELECT id FROM roles WHERE LOWER(name) = LOWER($1) LIMIT 1',
        [trimmedName]
      );
      if (dupCheck.rowCount > 0) {
        return res.status(409).json({ message: `Role "${trimmedName}" already exists` });
      }

      const result = await pool.query(
        'INSERT INTO roles (name, permissions) VALUES ($1, $2) RETURNING *',
        [trimmedName, JSON.stringify(permissions || {})]
      );
      res.status(201).json({ message: 'Role created successfully', role: result.rows[0] });
    }
  } catch (error) {
    console.error('Save Role Error:', error);
    res.status(500).json({ message: 'Database Error' });
  }
};

// Delete role
const deleteRole = async (req, res) => {
  const { id } = req.params;
  try {
    // Check if role is assigned to any user
    const userCheck = await pool.query('SELECT 1 FROM users WHERE role_id = $1 LIMIT 1', [id]);
    if (userCheck.rowCount > 0) {
      return res.status(400).json({ message: 'Cannot delete role assigned to users' });
    }
    
    await pool.query('DELETE FROM roles WHERE id = $1', [id]);
    res.json({ message: 'Role deleted successfully' });
  } catch (error) {
    console.error('Delete Role Error:', error);
    res.status(500).json({ message: 'Database Error' });
  }
};

// Assign role to user
// FIX: Added rowCount check + input validation
const assignRoleToUser = async (req, res) => {
  const { user_id, role_id } = req.body;

  if (!user_id) {
    return res.status(400).json({ message: 'user_id is required' });
  }

  try {
    const result = await pool.query(
      'UPDATE users SET role_id = $1 WHERE id = $2',
      [role_id || null, user_id]
    );

    // FIX: If user not found, return 404 instead of silent success
    if (result.rowCount === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({ message: 'Role assigned successfully' });
  } catch (error) {
    console.error('Assign Role Error:', error);
    res.status(500).json({ message: 'Database Error' });
  }
};

module.exports = { getRoles, saveRole, deleteRole, assignRoleToUser };
