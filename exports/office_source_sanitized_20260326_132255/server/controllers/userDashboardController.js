const pool = require('../utilities/db');
const { getYearlyQuota } = require('../utilities/leaveUtils');

/**
 * Get User Dashboard Data
 * Provides data for the main user dashboard, including leave quotas.
 */
const getUserDashboardData = async (req, res) => {
  try {
    const userId = req.user.id;
    const currentYear = new Date().getFullYear();

    // Fetch user's weekly off day
    const userRes = await pool.query('SELECT weekly_off FROM users WHERE id = $1', [userId]);
    const weeklyOff = userRes.rows[0]?.weekly_off || 'Friday';

    // Fetch yearly quota usage
    const quotaUsage = await getYearlyQuota(pool, userId, currentYear, weeklyOff);

    // Fetch leave entitlements for the current year
    const entRes = await pool.query(
      'SELECT lt.name, le.total_days FROM leave_entitlements le JOIN leave_types lt ON le.leave_type_id = lt.id WHERE le.user_id = $1 AND le.year = $2',
      [userId, currentYear]
    );

    const entitlements = {};
    entRes.rows.forEach(row => {
      entitlements[row.name] = parseFloat(row.total_days);
    });

    // --- Missing Logic from PHP: Leave Planner Overview ---
    // Calculate dates for Previous, Current, and Next month
    const date = new Date();
    const months = [
      { key: 'prev', d: new Date(date.getFullYear(), date.getMonth() - 1, 1) },
      { key: 'curr', d: new Date(date.getFullYear(), date.getMonth(), 1) },
      { key: 'next', d: new Date(date.getFullYear(), date.getMonth() + 1, 1) }
    ];

    const plannerData = {};

    // Loop through months and fetch approved leave count
    for (const m of months) {
      const yearMonth = m.d.toISOString().slice(0, 7); // YYYY-MM
      const monthName = m.d.toLocaleString('en-US', { month: 'long', year: 'numeric' });

      // Query to sum up leave days for that specific month
      // Note: This is a simplified count. For exact "Clean Days" logic like PHP, 
      // you might need a more complex DB function or JS calculation loop.
      const planQuery = `
        SELECT SUM(
          CASE 
            WHEN leave_type_id = 3 THEN 0.5 
            ELSE (DATE_PART('day', end_date::timestamp - start_date::timestamp) + 1) 
          END
        ) as total_days
        FROM leave_requests 
        WHERE user_id = $1 
        AND status = 'Approved' 
        AND TO_CHAR(start_date, 'YYYY-MM') = $2
      `;
      
      const planRes = await pool.query(planQuery, [userId, yearMonth]);
      plannerData[m.key] = { month_name: monthName, spent: parseFloat(planRes.rows[0].total_days || 0) };
    }

    res.json({ quotaUsage, entitlements, plannerData });

  } catch (error) {
    console.error('User Dashboard Error:', error);
    res.status(500).json({ message: 'Server Error' });
  }
};

module.exports = { getUserDashboardData };