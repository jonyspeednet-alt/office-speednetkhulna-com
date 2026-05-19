const pool = require('../utilities/db');
const { resolvePermission } = require('../utilities/permissionRegistry');

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
 * Get Leave Summary Report
 * Replaces logic in reports.php
 */
const getLeaveSummaryReport = async (req, res) => {
  try {
    // 1. Permission Check
    if (!resolvePermission(req.user, 'reports.view')) {
      return res.status(403).json({ message: 'Unauthorized access.' });
    }

    // 2. Parse Query Parameters
    const { employee_id, start_date, end_date } = req.query;

    // 3. Fetch Metadata (Employees & Leave Types)
    const empQuery = 'SELECT id, full_name, employee_id FROM users ORDER BY full_name ASC';
    const typeQuery = 'SELECT id, name FROM leave_types ORDER BY id ASC';
    
    const [empResult, typeResult] = await Promise.all([
      pool.query(empQuery),
      pool.query(typeQuery)
    ]);

    const employeesList = empResult.rows;
    const leaveTypes = typeResult.rows;

    // 4. Build Main Query
    let query = `
      SELECT lr.*, u.full_name, u.employee_id, u.designation, u.department, u.weekly_off 
      FROM leave_requests lr 
      JOIN users u ON lr.user_id = u.id 
      WHERE lr.status = 'Approved'
    `;
    const params = [];
    let paramCount = 1;

    if (employee_id) {
      query += ` AND lr.user_id = $${paramCount++}`;
      params.push(employee_id);
    }
    if (start_date) {
      query += ` AND lr.start_date >= $${paramCount++}`;
      params.push(start_date);
    }
    if (end_date) {
      query += ` AND lr.end_date <= $${paramCount++}`;
      params.push(end_date);
    }

    query += ` ORDER BY u.full_name ASC`;

    const reportResult = await pool.query(query, params);
    const rawReports = reportResult.rows;

    // 5. Process Data (Aggregation)
    const summaryReport = {};
    const grandTypeCounts = {};
    let grandTotalDays = 0;

    // Initialize grand counts
    leaveTypes.forEach(lt => grandTypeCounts[lt.id] = 0);

    rawReports.forEach(r => {
      const uid = r.user_id;
      
      // Initialize user entry if not exists
      if (!summaryReport[uid]) {
        summaryReport[uid] = {
          user_id: uid,
          name: r.full_name,
          emp_id: r.employee_id,
          designation: r.designation,
          total_days: 0,
          type_counts: {}
        };
        leaveTypes.forEach(lt => summaryReport[uid].type_counts[lt.id] = 0);
      }

      // Calculate Days
      let dCount = 0;
      if (parseInt(r.leave_type_id) === 3) { // Half Day
        dCount = 0.5;
      } else {
        const wOff = r.weekly_off || 'Friday';
        dCount = getCleanDays(r.start_date, r.end_date, wOff);
      }

      // Update User Totals
      summaryReport[uid].total_days += dCount;
      if (summaryReport[uid].type_counts[r.leave_type_id] !== undefined) {
        summaryReport[uid].type_counts[r.leave_type_id] += dCount;
      }

      // Update Grand Totals
      if (grandTypeCounts[r.leave_type_id] !== undefined) {
        grandTypeCounts[r.leave_type_id] += dCount;
      }
      grandTotalDays += dCount;
    });

    res.json({
      employeesList,
      leaveTypes,
      summaryReport: Object.values(summaryReport), // Convert object to array
      grandTypeCounts,
      grandTotalDays
    });

  } catch (error) {
    console.error('Report Error:', error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
};

module.exports = { getLeaveSummaryReport };
