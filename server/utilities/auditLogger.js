const pool = require('./db');

const MAX_STRING_LENGTH = 500;
const MAX_ARRAY_LENGTH = 30;
const MAX_OBJECT_KEYS = 60;
const MAX_DEPTH = 4;

const SENSITIVE_KEYS = new Set([
  'password',
  'new_password',
  'current_password',
  'confirm_password',
  'token',
  'authorization',
  'cookie',
  'jwt',
  'secret',
]);

const safeJson = (value) => {
  try {
    return JSON.stringify(value);
  } catch (_) {
    return JSON.stringify({ _note: 'non-serializable payload' });
  }
};

const redactByKey = (key, value) => {
  if (!key) return value;
  const normalized = String(key).toLowerCase();
  if (SENSITIVE_KEYS.has(normalized)) return '[REDACTED]';
  return value;
};

const sanitizeValue = (value, depth = 0) => {
  if (value == null) return value;
  if (depth > MAX_DEPTH) return '[TRUNCATED_DEPTH]';

  if (typeof value === 'string') {
    return value.length > MAX_STRING_LENGTH
      ? `${value.slice(0, MAX_STRING_LENGTH)}...[TRUNCATED]`
      : value;
  }

  if (typeof value === 'number' || typeof value === 'boolean') return value;

  if (Array.isArray(value)) {
    return value.slice(0, MAX_ARRAY_LENGTH).map((item) => sanitizeValue(item, depth + 1));
  }

  if (Buffer.isBuffer(value)) return '[BINARY]';
  if (value instanceof Date) return value.toISOString();

  if (typeof value === 'object') {
    const output = {};
    const keys = Object.keys(value).slice(0, MAX_OBJECT_KEYS);
    for (const key of keys) {
      const redacted = redactByKey(key, value[key]);
      output[key] = sanitizeValue(redacted, depth + 1);
    }
    if (Object.keys(value).length > MAX_OBJECT_KEYS) {
      output._truncated_keys = true;
    }
    return output;
  }

  return String(value);
};

const getIpAddress = (req) => {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    return String(forwarded).split(',')[0].trim();
  }
  return req.ip || req.socket?.remoteAddress || null;
};

const deriveActionType = (req, res) => {
  if (res.locals?.auditAction) return String(res.locals.auditAction).slice(0, 80);
  const normalizedPath = String(req.path || '/')
    .replace(/^\/+/, '')
    .replace(/\/+/g, '_')
    .replace(/[^a-zA-Z0-9_]/g, '')
    .slice(0, 60);
  return `${String(req.method || 'REQ').toUpperCase()}_${normalizedPath || 'root'}`;
};

let initDone = false;

const isOwnershipError = (error) =>
  error && (error.code === '42501' || String(error.message || '').toLowerCase().includes('must be owner'));

const initAuditLogTable = async () => {
  if (initDone) return;
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id BIGSERIAL PRIMARY KEY,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        user_id INTEGER NULL,
        user_name TEXT NULL,
        role_name TEXT NULL,
        action_type VARCHAR(80) NOT NULL,
        http_method VARCHAR(10) NOT NULL,
        route_path TEXT NOT NULL,
        query_params JSONB NULL,
        request_body JSONB NULL,
        response_status INTEGER NOT NULL,
        response_body JSONB NULL,
        ip_address VARCHAR(64) NULL,
        user_agent TEXT NULL,
        duration_ms INTEGER NOT NULL DEFAULT 0,
        success BOOLEAN NOT NULL DEFAULT FALSE,
        error_message TEXT NULL
      )
    `);

    const ownerCheck = await pool.query(`
      SELECT
        current_user AS current_user,
        (SELECT tableowner FROM pg_tables WHERE schemaname = 'public' AND tablename = 'audit_logs') AS table_owner
    `);
    const currentUser = ownerCheck.rows[0]?.current_user || '';
    const tableOwner = ownerCheck.rows[0]?.table_owner || '';

    if (tableOwner && currentUser && tableOwner !== currentUser) {
      console.warn('[AuditLog] index create skipped (table owner privilege required)');
    } else {
      const indexSql = [
        'CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs (created_at DESC)',
        'CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs (user_id)',
        'CREATE INDEX IF NOT EXISTS idx_audit_logs_action_type ON audit_logs (action_type)',
        'CREATE INDEX IF NOT EXISTS idx_audit_logs_route_path ON audit_logs (route_path)',
      ];
      for (const sql of indexSql) {
        await pool.query(sql);
      }
    }
    initDone = true;
    console.log('[AuditLog] audit_logs table ready');
  } catch (error) {
    // Do not crash app if audit table initialization fails.
    if (isOwnershipError(error)) {
      initDone = true;
      console.warn('[AuditLog] init uses existing table (owner-only DDL skipped)');
      return;
    }
    console.error('[AuditLog] init failed:', error.message);
  }
};

const shouldSkipRequest = (req) => {
  const path = String(req.path || '');
  if (path === '/health') return true;
  if (path.startsWith('/audit-logs')) return true;
  return false;
};

const auditLogMiddleware = (req, res, next) => {
  if (shouldSkipRequest(req)) return next();

  const startedAt = Date.now();
  const originalJson = res.json.bind(res);
  const originalSend = res.send.bind(res);
  let responsePayload;

  res.json = (body) => {
    responsePayload = body;
    return originalJson(body);
  };

  res.send = (body) => {
    if (responsePayload === undefined) responsePayload = body;
    return originalSend(body);
  };

  res.on('finish', () => {
    const durationMs = Date.now() - startedAt;
    const userId = req.user?.id || res.locals?.auditUserId || null;
    const userName = req.user?.full_name || res.locals?.auditUserName || null;
    const roleName = req.user?.role_name || req.user?.role || res.locals?.auditRoleName || null;
    const responseStatus = Number(res.statusCode || 0);
    const success = responseStatus >= 200 && responseStatus < 400;
    const method = String(req.method || '').toUpperCase();

    const requestBody =
      method === 'GET' || method === 'HEAD'
        ? null
        : sanitizeValue({
            ...(req.body || {}),
            ...(req.files ? { _files: Object.keys(req.files) } : {}),
          });

    const queryParams = sanitizeValue(req.query || {});
    const responseBody = sanitizeValue(responsePayload);
    const errorMessage =
      res.locals?.auditError
      || (!success && responseBody && typeof responseBody === 'object' ? responseBody.message : null)
      || null;

    const payload = {
      user_id: userId,
      user_name: userName,
      role_name: roleName,
      action_type: deriveActionType(req, res),
      http_method: method,
      route_path: req.originalUrl || req.url || req.path || '',
      query_params: queryParams,
      request_body: requestBody,
      response_status: responseStatus,
      response_body: responseBody,
      ip_address: getIpAddress(req),
      user_agent: req.headers['user-agent'] ? String(req.headers['user-agent']).slice(0, 1000) : null,
      duration_ms: durationMs,
      success,
      error_message: errorMessage,
    };

    pool.query(
      `INSERT INTO audit_logs (
        user_id, user_name, role_name, action_type, http_method, route_path,
        query_params, request_body, response_status, response_body, ip_address,
        user_agent, duration_ms, success, error_message
      ) VALUES (
        $1,$2,$3,$4,$5,$6,
        $7::jsonb,$8::jsonb,$9,$10::jsonb,$11,
        $12,$13,$14,$15
      )`,
      [
        payload.user_id,
        payload.user_name,
        payload.role_name,
        payload.action_type,
        payload.http_method,
        payload.route_path,
        safeJson(payload.query_params),
        safeJson(payload.request_body),
        payload.response_status,
        safeJson(payload.response_body),
        payload.ip_address,
        payload.user_agent,
        payload.duration_ms,
        payload.success,
        payload.error_message,
      ]
    ).catch((err) => {
      console.error('[AuditLog] insert failed:', err.message);
    });
  });

  next();
};

module.exports = {
  initAuditLogTable,
  auditLogMiddleware,
};
