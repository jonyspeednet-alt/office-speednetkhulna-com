const pool = require('../utilities/db');
const fs = require('fs');
const path = require('path');
const { resolvePermission } = require('../utilities/permissionRegistry');

const canManageUsers = (user) => resolvePermission(user, 'users.manage');
const allowProfileEditOverride = String(process.env.ALLOW_PROFILE_EDIT_OVERRIDE || 'true').toLowerCase() === 'true';
const canEditAnyProfile = (user) => allowProfileEditOverride && resolvePermission(user, 'users.edit.any');

const generateID = async () => {
  const prefix = 'SNKHL-';
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const numbers = '23456789';
  let exists = true;
  let finalID = '';
  while (exists) {
    const digitPart = numbers.charAt(Math.floor(Math.random() * numbers.length));
    let randomPart = '';
    const combinedChars = letters + numbers;
    for (let i = 0; i < 3; i++) randomPart += combinedChars.charAt(Math.floor(Math.random() * combinedChars.length));
    const mixed = (digitPart + randomPart).split('').sort(() => 0.5 - Math.random()).join('');
    finalID = prefix + mixed;
    const res = await pool.query('SELECT id FROM users WHERE employee_id = $1', [finalID]);
    if (res.rows.length === 0) exists = false;
  }
  return finalID;
};

const getNextEmployeeId = async (req, res) => {
  try { const id = await generateID(); res.json({ id }); }
  catch (error) { res.status(500).json({ message: 'Error generating ID' }); }
};

const getEmployees = async (req, res) => {
  try {
    const { search, dept } = req.query;
    let query = 'SELECT id, employee_id, full_name, designation, email, role, department, status, phone, blood_group, profile_pic FROM users';
    const params = [];
    const conditions = [];
    if (search) { conditions.push(`(full_name ILIKE $${params.length + 1} OR employee_id ILIKE $${params.length + 1})`); params.push(`%${search}%`); }
    if (dept && dept.trim() !== '') { conditions.push(`department = $${params.length + 1}`); params.push(dept); }
    if (conditions.length > 0) query += ' WHERE ' + conditions.join(' AND ');
    query += ' ORDER BY id DESC';
    const result = await pool.query(query, params);
    const currentUserId = Number(req.user?.id || 0);
    const employees = result.rows.map(user => {
      const { password, ...userInfo } = user;
      if (Number(userInfo.id) !== currentUserId) userInfo.employee_id = null;
      return userInfo;
    });
    res.json(employees);
  } catch (error) {
    console.error('getEmployees Error:', error);
    res.status(500).json({ message: 'Database Error: ' + error.message });
  }
};

const getDepartments = async (req, res) => {
  try { const result = await pool.query('SELECT * FROM departments ORDER BY dept_name ASC'); res.json(result.rows); }
  catch (error) { res.status(500).json({ message: 'Server Error' }); }
};

const addEmployee = async (req, res) => {
  try {
    if (!canManageUsers(req.user)) return res.status(403).json({ message: 'Unauthorized' });
    const { full_name, designation, email, phone, emergency_phone, present_address, permanent_address, blood_group, nid_number, joining_date, password, department, role: employeeRole, status } = req.body;
    const employee_id = req.body.employee_id || await generateID();
    const profile_pic = req.files?.profile_pic ? req.files.profile_pic[0].filename : 'default.png';
    const nid_pic = req.files?.nid_pic ? req.files.nid_pic[0].filename : null;
    const can_take_action = (employeeRole === 'Admin' || employeeRole === 'HR') ? 1 : 0;
    const j_date = joining_date || new Date().toISOString().split('T')[0];
    const userStatus = status || 'Active';
    const pass = password || '123456';
    const roleIdRes = await pool.query('SELECT id FROM roles WHERE LOWER(name) = LOWER($1) LIMIT 1', [employeeRole || 'Staff']);
    const role_id = roleIdRes.rows[0]?.id || null;
    const query = 'INSERT INTO users (employee_id, full_name, designation, email, phone, emergency_phone, present_address, permanent_address, blood_group, nid_number, nid_pic, joining_date, password, role, role_id, department, can_take_action, profile_pic, status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19) RETURNING id, employee_id';
    const values = [employee_id, full_name, designation, email, phone, emergency_phone, present_address, permanent_address, blood_group, nid_number, nid_pic, j_date, pass, employeeRole, role_id, department, can_take_action, profile_pic, userStatus];
    const result = await pool.query(query, values);
    res.status(201).json({ message: 'Employee added successfully', employee_id: result.rows[0].employee_id });
  } catch (error) {
    console.error('addEmployee Error:', error);
    res.status(500).json({ message: 'Database Error' });
  }
};

const getEmployeeById = async (req, res) => {
  try {
    const { id } = req.params;
    const { id: currentUserId } = req.user;
    const targetUserId = parseInt(id, 10);
    if (targetUserId !== currentUserId && !canEditAnyProfile(req.user)) return res.status(403).json({ message: 'Unauthorized' });
    const result = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
    if (result.rows.length === 0) return res.status(404).json({ message: 'User not found' });
    const user = result.rows[0];
    delete user.password;
    res.json(user);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server Error' });
  }
};

const updateEmployee = async (req, res) => {
  try {
    const { id } = req.params;
    const currentUserId = req.user?.id;
    const targetUserId = parseInt(id, 10);
    const hasOverrideEdit = canEditAnyProfile(req.user);
    if (targetUserId !== currentUserId && !hasOverrideEdit) return res.status(403).json({ message: 'Unauthorized' });
    const currentDataRes = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
    if (currentDataRes.rows.length === 0) return res.status(404).json({ message: 'User not found' });
    const currentUserData = currentDataRes.rows[0];
    let { full_name, designation, email, phone, joining_date, password, role, department, emergency_phone, nid_number, blood_group, present_address, permanent_address, status } = req.body;
    full_name = full_name !== undefined ? full_name : currentUserData.full_name;
    designation = designation !== undefined ? designation : currentUserData.designation;
    email = email !== undefined ? email : currentUserData.email;
    phone = phone !== undefined ? phone : currentUserData.phone;
    joining_date = (joining_date !== undefined && joining_date !== '') ? joining_date : currentUserData.joining_date;
    role = role !== undefined ? role : currentUserData.role;
    department = department !== undefined ? department : currentUserData.department;
    emergency_phone = emergency_phone !== undefined ? emergency_phone : currentUserData.emergency_phone;
    nid_number = nid_number !== undefined ? nid_number : currentUserData.nid_number;
    blood_group = blood_group !== undefined ? blood_group : currentUserData.blood_group;
    present_address = present_address !== undefined ? present_address : currentUserData.present_address;
    permanent_address = permanent_address !== undefined ? permanent_address : currentUserData.permanent_address;
    status = status !== undefined ? status : currentUserData.status;
    let profile_pic = currentUserData.profile_pic;
    let nid_pic = currentUserData.nid_pic;
    if (req.files?.profile_pic) {
      if (profile_pic && profile_pic !== 'default.png') { 
        const oldPath = path.join(__dirname, '../../uploads', profile_pic); 
        if (fs.existsSync(oldPath)) { 
          try { fs.unlinkSync(oldPath); } catch (err) { console.error(err); } 
        } 
      }
      profile_pic = req.files.profile_pic[0].filename;
    }
    if (req.files?.nid_pic) {
      if (nid_pic) { 
        const oldPath = path.join(__dirname, '../../uploads', nid_pic); 
        if (fs.existsSync(oldPath)) { 
          try { fs.unlinkSync(oldPath); } catch (err) { console.error(err); } 
        } 
      }
      nid_pic = req.files.nid_pic[0].filename;
    }
    const newPassword = (password && password.trim() !== '') ? password : currentUserData.password;
    let query, values;
    if (canManageUsers(req.user) || hasOverrideEdit) {
      const can_take_action = ['admin', 'super admin'].includes(role.toLowerCase()) ? 1 : 0;
      const updatedStatus = status || 'Active';
      const roleIdRes = await pool.query('SELECT id FROM roles WHERE LOWER(name) = LOWER($1) LIMIT 1', [role || 'Staff']);
      const role_id = roleIdRes.rows[0]?.id || currentUserData.role_id || null;
      query = 'UPDATE users SET full_name=$1, designation=$2, email=$3, phone=$4, joining_date=$5, password=$6, role=$7, role_id=$8, department=$9, can_take_action=$10, profile_pic=$11, emergency_phone=$12, nid_number=$13, nid_pic=$14, blood_group=$15, present_address=$16, permanent_address=$17, status=$18 WHERE id=$19';
      values = [full_name, designation, email, phone, joining_date, newPassword, role, role_id, department, can_take_action, profile_pic, emergency_phone, nid_number, nid_pic, blood_group, present_address, permanent_address, updatedStatus, id];
    } else {
      query = 'UPDATE users SET password=$1 WHERE id=$2';
      values = [newPassword, id];
    }
    await pool.query(query, values);
    res.json({ message: 'Profile updated successfully' });
  } catch (error) {
    console.error('updateEmployee Error:', error);
    res.status(500).json({ message: 'Database Error' });
  }
};

// NEW: Toggle employee active/inactive
const toggleEmployeeStatus = async (req, res) => {
  try {
    if (!canManageUsers(req.user)) return res.status(403).json({ message: 'Unauthorized: Only admins can change employee status' });
    const { id } = req.params;
    const targetUserId = parseInt(id, 10);
    if (targetUserId === Number(req.user?.id)) return res.status(400).json({ message: 'You cannot change your own status' });
    const currentRes = await pool.query('SELECT id, full_name, status FROM users WHERE id = $1', [id]);
    if (currentRes.rows.length === 0) return res.status(404).json({ message: 'Employee not found' });
    const currentStatus = String(currentRes.rows[0].status || 'Active').toLowerCase();
    const newStatus = currentStatus === 'active' ? 'Inactive' : 'Active';
    await pool.query('UPDATE users SET status = $1 WHERE id = $2', [newStatus, id]);
    res.json({ message: `Employee status updated to ${newStatus}`, id: targetUserId, name: currentRes.rows[0].full_name, old_status: currentStatus === 'active' ? 'Active' : 'Inactive', new_status: newStatus });
  } catch (error) {
    console.error('toggleEmployeeStatus Error:', error);
    res.status(500).json({ message: 'Database Error' });
  }
};

module.exports = { getEmployees, getDepartments, getNextEmployeeId, addEmployee, getEmployeeById, updateEmployee, toggleEmployeeStatus };
