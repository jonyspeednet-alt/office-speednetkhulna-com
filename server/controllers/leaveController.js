const pool = require('../utilities/db'); // Your PostgreSQL connection pool
const { getCleanDays } = require('../utilities/leaveUtils');
const { sendLeaveApprovalNotification } = require('../services/whatsappNotificationService');

const hasPermission = (value) => value === true || value === 1 || value === '1';

/**
 * Update Leave Status
 * Replaces: update_status.php
 */
const updateLeaveStatus = async (req, res) => {
  try {
    // 1. Permission Check
    // Assuming auth middleware populates req.user with { id, role, permissions }
    const { id: adminId, role, p_manage_leaves, permissions } = req.user;
    const roleLower = (role || '').toLowerCase();
    const isPrivileged = roleLower === 'admin' || roleLower === 'super admin' || roleLower === 'superadmin' || (permissions && permissions.all_access);
    const canManageLeaves = isPrivileged || hasPermission(p_manage_leaves) || hasPermission(permissions?.p_manage_leaves);
    if (!adminId || !canManageLeaves) {
      return res.status(403).json({ message: 'Unauthorized access.' });
    }

    // 2. Collect Data
    const requestId = parseInt(req.params.id);
    const { status: newStatus, note: adminNote } = req.body;

    // 3. Validate Status
    const validStatuses = ['Approved', 'Rejected', 'Pending'];
    if (!validStatuses.includes(newStatus)) {
      return res.status(400).json({ message: 'Invalid status request.' });
    }

    // 4. Fetch Request Info (to get user_id and applied_at)
    const infoQuery = 'SELECT user_id, applied_at, group_id FROM leave_requests WHERE id = $1';
    const infoResult = await pool.query(infoQuery, [requestId]);

    if (infoResult.rows.length === 0) {
      return res.status(404).json({ message: 'Leave request not found.' });
    }

    const { user_id, applied_at, group_id } = infoResult.rows[0];

    // 5. Update Query Logic
    let updateQuery;
    let queryParams;

    if (newStatus === 'Pending') {
      // Revert to pending: clear approval info
      if (group_id) {
        updateQuery = `
          UPDATE leave_requests 
          SET status = $1, approved_by = NULL, action_at = NULL, admin_remark = NULL 
          WHERE group_id = $2
        `;
        queryParams = [newStatus, group_id];
      } else {
        updateQuery = `
          UPDATE leave_requests 
          SET status = $1, approved_by = NULL, action_at = NULL, admin_remark = NULL 
          WHERE user_id = $2 AND applied_at = $3
        `;
        queryParams = [newStatus, user_id, applied_at];
      }
    } else {
      // Approve or Reject: set approval info
      if (group_id) {
        updateQuery = `
          UPDATE leave_requests 
          SET status = $1, approved_by = $2, action_at = NOW(), admin_remark = $3 
          WHERE group_id = $4
        `;
        queryParams = [newStatus, adminId, adminNote || null, group_id];
      } else {
        updateQuery = `
          UPDATE leave_requests 
          SET status = $1, approved_by = $2, action_at = NOW(), admin_remark = $3 
          WHERE user_id = $4 AND applied_at = $5
        `;
        queryParams = [newStatus, adminId, adminNote || null, user_id, applied_at];
      }
    }

    const result = await pool.query(updateQuery, queryParams);

    if (result.rowCount > 0) {
      if (newStatus === 'Approved') {
        sendLeaveApprovalNotification(requestId).catch((notificationError) => {
          console.error('WhatsApp leave approval notification failed:', notificationError.message);
        });
      }

      const statusMsg = newStatus === 'Approved' ? 'Approved' 
        : (newStatus === 'Rejected' ? 'Rejected' : 'Pending Review');
      
      return res.status(200).json({ 
        success: true, 
        message: `Successfully updated to ${statusMsg}.` 
      });
    } else {
      return res.status(500).json({ message: 'Update failed. No records modified.' });
    }

  } catch (error) {
    console.error('Database Error:', error);
    return res.status(500).json({ message: 'Internal server error.' });
  }
};

/**
 * Get Leave Requests (Grouped)
 * Replaces logic in manage_leaves.php
 */
const getLeaveRequests = async (req, res) => {
  try {
    // 1. Permission Check
    const { role, p_manage_leaves, permissions } = req.user;
    const roleLower = (role || '').toLowerCase();
    const isPrivileged = roleLower === 'admin' || roleLower === 'super admin' || roleLower === 'superadmin' || (permissions && permissions.all_access);
    const canManageLeaves = isPrivileged || hasPermission(p_manage_leaves) || hasPermission(permissions?.p_manage_leaves);
    console.log(`[GetLeaves] User: ${req.user.id}, Role: ${role}, PBit: ${p_manage_leaves}`);
    
    if (!canManageLeaves) {
      console.warn(`[GetLeaves] Unauthorized access attempt by ${req.user.id}`);
      return res.status(403).json({ message: 'Unauthorized access.' });
    }

    // 2. Filters
    const { search, month, year, status, page, limit } = req.query;
    console.log('[GetLeaves] req.query:', req.query);
    console.log(`[GetLeaves] Raw filters: search="${search}", month="${month}", year="${year}"`);
    
    const now = new Date();
    const defaultMonth = now.getMonth() + 1;
    const defaultYear = now.getFullYear();
    const selectedMonth = Math.min(Math.max(parseInt(month, 10) || defaultMonth, 1), 12);
    const selectedYear = Math.min(Math.max(parseInt(year, 10) || defaultYear, 2000), 2100);

    const params = [];
    let paramCount = 1;
    let whereClauses = [];
    const normalizedStatus = String(status || 'All').trim();
    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const pageSize = Math.min(Math.max(parseInt(limit, 10) || 20, 5), 100);

    if (search && search.trim() !== '') {
      whereClauses.push(`(u.full_name ILIKE $${paramCount} OR u.employee_id ILIKE $${paramCount})`);
      params.push(`%${search.trim()}%`);
      paramCount++;
    }

    // Period logic:
    // - All tab: selected month/year + any pending from any month.
    // - Pending tab: all pending (any month).
    // - Approved/Rejected tab: selected month/year only for that status.
    if (normalizedStatus === 'Pending') {
      whereClauses.push(`LOWER(COALESCE(lr.status,'')) = 'pending'`);
    } else if (normalizedStatus === 'All') {
      const monthParam = paramCount++;
      params.push(selectedMonth);
      const yearParam = paramCount++;
      params.push(selectedYear);
      whereClauses.push(
        `(
          (
            EXTRACT(MONTH FROM lr.start_date)::INTEGER = $${monthParam}
            AND EXTRACT(YEAR FROM lr.start_date)::INTEGER = $${yearParam}
          )
          OR LOWER(COALESCE(lr.status,'')) = 'pending'
        )`
      );
    } else {
      const statusParam = paramCount++;
      params.push(normalizedStatus);
      const monthParam = paramCount++;
      params.push(selectedMonth);
      const yearParam = paramCount++;
      params.push(selectedYear);
      whereClauses.push(`lr.status = $${statusParam}`);
      whereClauses.push(`EXTRACT(MONTH FROM lr.start_date)::INTEGER = $${monthParam}`);
      whereClauses.push(`EXTRACT(YEAR FROM lr.start_date)::INTEGER = $${yearParam}`);
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    // 3. Query
    const query = `
      SELECT lr.*, u.full_name, u.employee_id, u.profile_pic, u.weekly_off, lt.name as leave_type_name,
             adm.full_name as approver_name, adm.employee_id as approver_emp_id, adm.designation as approver_desig
      FROM leave_requests lr 
      JOIN users u ON lr.user_id = u.id 
      LEFT JOIN leave_types lt ON lr.leave_type_id = lt.id 
      LEFT JOIN users adm ON lr.approved_by = adm.id
      ${whereSql}
      ORDER BY lr.applied_at DESC, lr.id ASC
    `;

    const result = await pool.query(query, params);
    console.log(`[GetLeaves] Found ${result.rows.length} raw records.`);
    
    const allRequests = result.rows;

    // 4. Grouping Logic
    const groupedRequests = {};
    
    allRequests.forEach(req => {
        let groupKey;
        if (req.group_id && req.group_id.trim() !== '') {
            groupKey = req.group_id;
        } else {
            // Use a simpler string key for grouping if group_id is missing
            const appliedStr = req.applied_at ? req.applied_at.toString() : 'no-date';
            groupKey = `${req.user_id}_${appliedStr}`;
        }

        if (!groupedRequests[groupKey]) {
            groupedRequests[groupKey] = {
                user_info: {
                    id: req.user_id,
                    full_name: req.full_name,
                    employee_id: req.employee_id,
                    profile_pic: req.profile_pic,
                    weekly_off: req.weekly_off || 'Friday'
                },
                applied_at: req.applied_at,
                status: req.status,
                approver_name: req.approver_name,
                reason: req.reason,
                user_id: req.user_id,
                first_id: req.id,
                leaves: []
            };
        }
        
        // Calculate actual days
        let actualDays = 0;
        if (parseInt(req.leave_type_id) === 3) { // Half Day
            actualDays = 0.5;
        } else {
            actualDays = getCleanDays(req.start_date, req.end_date, req.weekly_off || 'Friday');
        }
        
        groupedRequests[groupKey].leaves.push({
            ...req,
            actual_days: actualDays
        });
    });

    const groupedArray = Object.values(groupedRequests).sort((a, b) => {
        return new Date(b.applied_at) - new Date(a.applied_at);
    });

    const totalItems = groupedArray.length;
    const totalPages = Math.max(Math.ceil(totalItems / pageSize), 1);
    const safePage = Math.min(pageNum, totalPages);
    const offset = (safePage - 1) * pageSize;
    const pagedItems = groupedArray.slice(offset, offset + pageSize);

    console.log(`[GetLeaves] Returning ${pagedItems.length}/${totalItems} groups (page ${safePage}/${totalPages}, limit ${pageSize}).`);
    res.json({
      items: pagedItems,
      pagination: {
        page: safePage,
        limit: pageSize,
        total_items: totalItems,
        total_pages: totalPages
      },
      filters: {
        month: selectedMonth,
        year: selectedYear,
        status: normalizedStatus
      }
    });

  } catch (error) {
    console.error('[GetLeaves] Error:', error);
    res.status(500).json({ message: 'Server Error' });
  }
};

module.exports = { updateLeaveStatus, getLeaveRequests };
