const pool = require('../utilities/db');

const toInt = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const isSuperAdmin = (user) => {
  const role = String(user?.role_name || user?.role || '').trim().toLowerCase();
  return role === 'super admin' || role === 'superadmin';
};

const getTableColumns = async (tableName) => {
  const q = `
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = $1
  `;
  const result = await pool.query(q, [tableName]);
  return new Set(result.rows.map((r) => String(r.column_name)));
};

const getSystemLogs = async (req, res) => {
  try {
    if (!isSuperAdmin(req.user)) {
      return res.status(403).json({ message: 'Access denied: Super Admin only' });
    }

    const limit = Math.min(Math.max(toInt(req.query.limit, 50), 1), 200);
    const source = String(req.query.source || 'all').trim().toLowerCase();

    const auditWhere = [];
    const auditParams = [];

    if (req.query.from) {
      auditParams.push(String(req.query.from));
      auditWhere.push(`created_at >= $${auditParams.length}::timestamptz`);
    }
    if (req.query.to) {
      auditParams.push(String(req.query.to));
      auditWhere.push(`created_at <= $${auditParams.length}::timestamptz`);
    }
    if (req.query.action_type) {
      auditParams.push(`%${String(req.query.action_type).trim()}%`);
      auditWhere.push(`action_type ILIKE $${auditParams.length}`);
    }
    if (req.query.user_id) {
      auditParams.push(toInt(req.query.user_id, 0));
      auditWhere.push(`user_id = $${auditParams.length}`);
    }

    const auditWhereSql = auditWhere.length ? `WHERE ${auditWhere.join(' AND ')}` : '';
    const auditCountSql = `SELECT COUNT(*)::int AS total FROM audit_logs ${auditWhereSql}`;
    const auditRowsSql = `
      SELECT
        id, created_at, user_id, user_name, role_name, action_type, http_method,
        route_path, response_status, duration_ms, success, error_message
      FROM audit_logs
      ${auditWhereSql}
      ORDER BY id DESC
      LIMIT $${auditParams.length + 1}
    `;
    const auditRowsParams = [...auditParams, limit];

    const finWhere = [];
    const finParams = [];

    if (req.query.from) {
      finParams.push(String(req.query.from));
      finWhere.push(`l.created_at >= $${finParams.length}::timestamptz`);
    }
    if (req.query.to) {
      finParams.push(String(req.query.to));
      finWhere.push(`l.created_at <= $${finParams.length}::timestamptz`);
    }
    if (req.query.action_type) {
      finParams.push(`%${String(req.query.action_type).trim()}%`);
      finWhere.push(`l.action_type ILIKE $${finParams.length}`);
    }
    if (req.query.reseller_id) {
      finParams.push(toInt(req.query.reseller_id, 0));
      finWhere.push(`l.reseller_id = $${finParams.length}`);
    }
    if (req.query.actor_user_id) {
      finParams.push(toInt(req.query.actor_user_id, 0));
      finWhere.push(`l.actor_user_id = $${finParams.length}`);
    }

    const finWhereSql = finWhere.length ? `WHERE ${finWhere.join(' AND ')}` : '';
    let audit = { total: 0, rows: [] };
    let financial = { total: 0, rows: [] };

    if (source === 'all' || source === 'audit') {
      try {
        const [auditCount, auditRows] = await Promise.all([
          pool.query(auditCountSql, auditParams),
          pool.query(auditRowsSql, auditRowsParams),
        ]);
        audit = {
          total: auditCount.rows[0]?.total || 0,
          rows: auditRows.rows,
        };
      } catch (auditError) {
        console.warn('getSystemLogs audit section warning:', auditError.message);
      }
    }

    if (source === 'all' || source === 'financial') {
      try {
        const finColumns = await getTableColumns('reseller_financial_audit_logs');
        if (finColumns.size > 0) {
          const col = (name, fallback = 'NULL') => (finColumns.has(name) ? `l.${name}` : fallback);

          const finCountSql = `SELECT COUNT(*)::int AS total FROM reseller_financial_audit_logs l ${finWhereSql}`;
          const finRowsSql = `
            SELECT
              ${col('id', 'NULL')} AS id,
              ${col('created_at', 'NULL')} AS created_at,
              ${col('reseller_id', 'NULL')} AS reseller_id,
              COALESCE(r.reseller_name, r.company_name) AS reseller_name,
              ${col('actor_user_id', 'NULL')} AS actor_user_id,
              ${col('actor_user_name', 'NULL')} AS actor_user_name,
              ${col('actor_role', 'NULL')} AS actor_role,
              ${col('action_type', 'NULL')} AS action_type,
              ${col('field_name', 'NULL')} AS field_name,
              ${col('old_value', 'NULL')} AS old_value,
              ${col('new_value', 'NULL')} AS new_value,
              ${col('amount_delta', 'NULL')} AS amount_delta,
              ${col('note', 'NULL')} AS note
            FROM reseller_financial_audit_logs l
            LEFT JOIN resellers r ON r.id = l.reseller_id
            ${finWhereSql}
            ORDER BY ${finColumns.has('id') ? 'l.id' : 'l.created_at'} DESC
            LIMIT $${finParams.length + 1}
          `;
          const finRowsParams = [...finParams, limit];
          const [finCount, finRows] = await Promise.all([
            pool.query(finCountSql, finParams),
            pool.query(finRowsSql, finRowsParams),
          ]);
          financial = {
            total: finCount.rows[0]?.total || 0,
            rows: finRows.rows,
          };
        }
      } catch (finError) {
        console.warn('getSystemLogs financial section warning:', finError.message);
      }
    }

    return res.json({
      source,
      limit,
      filters: {
        from: req.query.from || null,
        to: req.query.to || null,
        action_type: req.query.action_type || null,
        user_id: req.query.user_id || null,
        actor_user_id: req.query.actor_user_id || null,
        reseller_id: req.query.reseller_id || null,
      },
      audit,
      financial,
    });
  } catch (error) {
    console.error('getSystemLogs error:', error);
    return res.status(500).json({ message: 'Failed to fetch system logs' });
  }
};

module.exports = { getSystemLogs };
