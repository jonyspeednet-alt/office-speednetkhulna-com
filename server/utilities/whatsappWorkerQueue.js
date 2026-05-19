const pool = require('./db');

let initDone = false;

const DEFAULT_STATE = {
  enabled: true,
  connected: false,
  ready: false,
  state: 'disconnected',
  headless: true,
  hasQr: false,
  qr: null,
  error: null,
  account: null,
  mode: 'worker_pull',
  updatedAt: null,
  lastSeenAt: null
};

const initWhatsAppWorkerTables = async () => {
  if (initDone) return;
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS whatsapp_worker_jobs (
        id BIGSERIAL PRIMARY KEY,
        job_type VARCHAR(50) NOT NULL,
        payload JSONB NOT NULL DEFAULT '{}'::jsonb,
        status VARCHAR(20) NOT NULL DEFAULT 'pending',
        attempts INTEGER NOT NULL DEFAULT 0,
        worker_name TEXT NULL,
        last_error TEXT NULL,
        claimed_at TIMESTAMPTZ NULL,
        completed_at TIMESTAMPTZ NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS whatsapp_worker_state (
        id INTEGER PRIMARY KEY DEFAULT 1,
        connected BOOLEAN NOT NULL DEFAULT FALSE,
        ready BOOLEAN NOT NULL DEFAULT FALSE,
        state VARCHAR(40) NOT NULL DEFAULT 'disconnected',
        headless BOOLEAN NOT NULL DEFAULT TRUE,
        has_qr BOOLEAN NOT NULL DEFAULT FALSE,
        qr TEXT NULL,
        error TEXT NULL,
        account_name TEXT NULL,
        account_number TEXT NULL,
        account_platform TEXT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CHECK (id = 1)
      )
    `);

    const indexSql = [
      'CREATE INDEX IF NOT EXISTS idx_whatsapp_worker_jobs_status_created ON whatsapp_worker_jobs (status, created_at)',
      'CREATE INDEX IF NOT EXISTS idx_whatsapp_worker_jobs_type_status ON whatsapp_worker_jobs (job_type, status)'
    ];
    for (const sql of indexSql) {
      await pool.query(sql);
    }

    initDone = true;
    console.log('[WhatsAppWorkerQueue] tables ready');
  } catch (error) {
    console.error('[WhatsAppWorkerQueue] init failed:', error.message);
  }
};

const enqueueJob = async (jobType, payload = {}) => {
  const result = await pool.query(
    `INSERT INTO whatsapp_worker_jobs (job_type, payload, status, created_at, updated_at)
     VALUES ($1, $2::jsonb, 'pending', NOW(), NOW())
     RETURNING *`,
    [jobType, JSON.stringify(payload || {})]
  );
  return result.rows[0];
};

const claimNextJob = async (workerName = 'worker') => {
  const result = await pool.query(
    `WITH next_job AS (
       SELECT id
       FROM whatsapp_worker_jobs
       WHERE status = 'pending'
       ORDER BY created_at ASC
       LIMIT 1
       FOR UPDATE SKIP LOCKED
     )
     UPDATE whatsapp_worker_jobs AS j
     SET status = 'processing',
         attempts = j.attempts + 1,
         worker_name = $1,
         claimed_at = NOW(),
         updated_at = NOW()
     FROM next_job
     WHERE j.id = next_job.id
     RETURNING j.*`,
    [workerName]
  );
  return result.rows[0] || null;
};

const markJobCompleted = async (jobId) => {
  await pool.query(
    `UPDATE whatsapp_worker_jobs
     SET status = 'completed',
         completed_at = NOW(),
         updated_at = NOW(),
         last_error = NULL
     WHERE id = $1`,
    [jobId]
  );
};

const markJobFailed = async (jobId, errorMessage, retry = false) => {
  await pool.query(
    `UPDATE whatsapp_worker_jobs
     SET status = $2,
         last_error = $3,
         updated_at = NOW()
     WHERE id = $1`,
    [jobId, retry ? 'pending' : 'failed', String(errorMessage || 'Unknown worker error').slice(0, 2000)]
  );
};

const updateWorkerState = async (state = {}) => {
  const account = state.account || {};
  const result = await pool.query(
    `INSERT INTO whatsapp_worker_state (
       id, connected, ready, state, headless, has_qr, qr, error,
       account_name, account_number, account_platform, updated_at, last_seen_at
     ) VALUES (
       1, $1, $2, $3, $4, $5, $6, $7,
       $8, $9, $10, NOW(), NOW()
     )
     ON CONFLICT (id) DO UPDATE SET
       connected = EXCLUDED.connected,
       ready = EXCLUDED.ready,
       state = EXCLUDED.state,
       headless = EXCLUDED.headless,
       has_qr = EXCLUDED.has_qr,
       qr = EXCLUDED.qr,
       error = EXCLUDED.error,
       account_name = EXCLUDED.account_name,
       account_number = EXCLUDED.account_number,
       account_platform = EXCLUDED.account_platform,
       updated_at = NOW(),
       last_seen_at = NOW()
     RETURNING *`,
    [
      Boolean(state.connected),
      Boolean(state.ready),
      String(state.state || 'disconnected'),
      state.headless !== false,
      Boolean(state.hasQr),
      state.qr || null,
      state.error || null,
      account.name || null,
      account.number || null,
      account.platform || null
    ]
  );
  return result.rows[0] || null;
};

const getWorkerState = async () => {
  const result = await pool.query('SELECT * FROM whatsapp_worker_state WHERE id = 1');
  const row = result.rows[0];
  if (!row) return { ...DEFAULT_STATE };
  return {
    enabled: true,
    connected: Boolean(row.connected),
    ready: Boolean(row.ready),
    state: row.state || 'disconnected',
    headless: Boolean(row.headless),
    hasQr: Boolean(row.has_qr),
    qr: row.qr || null,
    error: row.error || null,
    account: row.account_name || row.account_number || row.account_platform ? {
      name: row.account_name || 'Office sender',
      number: row.account_number || '',
      platform: row.account_platform || ''
    } : null,
    mode: 'worker_pull',
    updatedAt: row.updated_at || null,
    lastSeenAt: row.last_seen_at || null
  };
};

const getWorkerDiagnostics = async () => {
  const lastDeliveryResult = await pool.query(
    `SELECT id, job_type, completed_at, created_at,
            payload->>'approvalId' AS approval_id,
            payload->'payload'->'info'->>'full_name' AS employee_name,
            payload->>'groupName' AS group_name
     FROM whatsapp_worker_jobs
     WHERE status = 'completed'
       AND job_type IN ('send_approval', 'send_test')
     ORDER BY completed_at DESC NULLS LAST, created_at DESC
     LIMIT 1`
  );

  const lastApprovalResult = await pool.query(
    `SELECT id, job_type, completed_at, created_at,
            payload->>'approvalId' AS approval_id,
            payload->'payload'->'info'->>'full_name' AS employee_name,
            payload->>'groupName' AS group_name
     FROM whatsapp_worker_jobs
     WHERE status = 'completed'
       AND job_type = 'send_approval'
     ORDER BY completed_at DESC NULLS LAST, created_at DESC
     LIMIT 1`
  );

  const pendingJobResult = await pool.query(
    `SELECT COUNT(*)::int AS pending_count
     FROM whatsapp_worker_jobs
     WHERE status IN ('pending', 'processing')`
  );

  const recentEventsResult = await pool.query(
    `SELECT job_type, status, created_at, completed_at, updated_at, last_error,
            payload->>'approvalId' AS approval_id,
            payload->'payload'->'info'->>'full_name' AS employee_name
     FROM whatsapp_worker_jobs
     WHERE job_type IN ('start', 'reconnect', 'stop', 'send_approval', 'send_test', 'send_test_image')
     ORDER BY updated_at DESC, created_at DESC
     LIMIT 5`
  );

  return {
    lastDelivery: lastDeliveryResult.rows[0]
      ? {
          jobType: lastDeliveryResult.rows[0].job_type,
          completedAt: lastDeliveryResult.rows[0].completed_at || null,
          createdAt: lastDeliveryResult.rows[0].created_at || null,
          approvalId: lastDeliveryResult.rows[0].approval_id || null,
          employeeName: lastDeliveryResult.rows[0].employee_name || null,
          groupName: lastDeliveryResult.rows[0].group_name || null
        }
      : null,
    lastApproval: lastApprovalResult.rows[0]
      ? {
          completedAt: lastApprovalResult.rows[0].completed_at || null,
          createdAt: lastApprovalResult.rows[0].created_at || null,
          approvalId: lastApprovalResult.rows[0].approval_id || null,
          employeeName: lastApprovalResult.rows[0].employee_name || null,
          groupName: lastApprovalResult.rows[0].group_name || null
        }
      : null,
    pendingJobs: pendingJobResult.rows[0]?.pending_count || 0
    ,
    recentEvents: recentEventsResult.rows.map((row) => ({
      jobType: row.job_type,
      status: row.status,
      createdAt: row.created_at || null,
      completedAt: row.completed_at || null,
      updatedAt: row.updated_at || null,
      lastError: row.last_error || null,
      approvalId: row.approval_id || null,
      employeeName: row.employee_name || null
    }))
  };
};

module.exports = {
  initWhatsAppWorkerTables,
  enqueueJob,
  claimNextJob,
  markJobCompleted,
  markJobFailed,
  updateWorkerState,
  getWorkerState,
  getWorkerDiagnostics
};
