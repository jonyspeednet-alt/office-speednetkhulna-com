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
  try {
    if (id) {
      // Update
      const result = await pool.query(
        'UPDATE roles SET name = $1, permissions = $2 WHERE id = $3 RETURNING *',
        [name, JSON.stringify(permissions), id]
      );
      if (result.rowCount === 0) return res.status(404).json({ message: 'Role not found' });
      res.json({ message: 'Role updated successfully', role: result.rows[0] });
    } else {
      // Create
      const result = await pool.query(
        'INSERT INTO roles (name, permissions) VALUES ($1, $2) RETURNING *',
        [name, JSON.stringify(permissions)]
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
const assignRoleToUser = async (req, res) => {
  const { user_id, role_id } = req.body;
  try {
    await pool.query('UPDATE users SET role_id = $1 WHERE id = $2', [role_id, user_id]);
    res.json({ message: 'Role assigned successfully' });
  } catch (error) {
    console.error('Assign Role Error:', error);
    res.status(500).json({ message: 'Database Error' });
  }
};

module.exports = { getRoles, saveRole, deleteRole, assignRoleToUser };
