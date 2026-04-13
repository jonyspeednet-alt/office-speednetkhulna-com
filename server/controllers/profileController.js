const pool = require('../utilities/db');

/**
 * Helper: Calculate actual leave days excluding the weekly off-day.
 */
const getCleanDays = (startStr, endStr, weeklyOffDay) => {
  const start = new Date(startStr);
  const end = new Date(endStr);
  start.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);

  if (end < start) return 0;

  let days = 0;
  const current = new Date(start);

  while (current <= end) {
    const dayName = current.toLocaleDateString('en-US', { weekday: 'long' });
    if (dayName !== weeklyOffDay) {
      days++;
    }
    current.setDate(current.getDate() + 1);
  }
  return days;
};

/**
 * Get User Profile & Leave History
 * Replaces logic in profile.php
 */
const getUserProfile = async (req, res) => {
  try {
    // Determine target user ID: provided in params or from auth token
    let targetUserId = req.params.id ? parseInt(req.params.id) : req.user.id;
    
    // 1. Fetch User Details
    const userQuery = 'SELECT * FROM users WHERE id = $1';
    const userResult = await pool.query(userQuery, [targetUserId]);

    if (userResult.rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    const user = userResult.rows[0];
    delete user.password; // Security: remove password hash

    // 2. Filter Parameters for Leaves
    const { month, year } = req.query;
    const currentYear = new Date().getFullYear();
    const filterYear = year || currentYear;
    
    // 3. Fetch Leave History
    let leaveQuery = `
      SELECT lr.*, lt.name as type_name 
      FROM leave_requests lr 
      LEFT JOIN leave_types lt ON lr.leave_type_id = lt.id 
      WHERE lr.user_id = $1
    `;
    const queryParams = [targetUserId];
    let paramCount = 1;

    if (month) {
      paramCount++;
      leaveQuery += ` AND EXTRACT(MONTH FROM lr.start_date) = $${paramCount}`;
      queryParams.push(month);
    }
    
    if (filterYear) {
      paramCount++;
      leaveQuery += ` AND EXTRACT(YEAR FROM lr.start_date) = $${paramCount}`;
      queryParams.push(filterYear);
    }

    leaveQuery += ' ORDER BY lr.start_date DESC';

    const leaveResult = await pool.query(leaveQuery, queryParams);
    const leaves = leaveResult.rows;

    // 4. Calculate Filtered Total Days (Approved only)
    let filteredTotalDays = 0;
    const weeklyOff = user.weekly_off || 'Friday';

    leaves.forEach(leave => {
      if (leave.status === 'Approved') {
        if (parseInt(leave.leave_type_id) === 3) { // Half Day
          filteredTotalDays += 0.5;
        } else {
          filteredTotalDays += getCleanDays(leave.start_date, leave.end_date, weeklyOff);
        }
      }
    });

    res.json({
      user,
      leaves,
      filteredTotalDays,
      filters: { month, year: filterYear }
    });

  } catch (error) {
    console.error('Profile Error:', error);
    res.status(500).json({ message: 'Server Error' });
  }
};

module.exports = { getUserProfile };