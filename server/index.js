// server/index.js — PERN Stack Express API Server (entry point)
// Full logic is split into: config/env.js, config/cors.js,
//   middleware/index.js, routes/index.js
// This file wires everything together and starts the HTTP server.

const express = require('express');
const path = require('path');
const fs = require('fs');

const {
    PORT,
    fatalOnUnhandled,
    readyGracePeriodMs,
    readyProbeRetries,
    serverKeepAliveTimeoutMs,
    serverHeadersTimeoutMs,
    serverRequestTimeoutMs,
} = require('./config/env');

const db = require('./utilities/db');
const { initAuditLogTable } = require('./utilities/auditLogger');
const { initWhatsAppWorkerTables } = require('./utilities/whatsappWorkerQueue');
const { ensureClient: ensureWhatsAppClient } = require('./services/whatsappNotificationService');
const { applyMiddleware } = require('./middleware/index');
const apiRoutes = require('./routes/index');

// ── Helpers ────────────────────────────────────────────────
const isTransientDbError = (err) => {
    const msg = String(err?.message || '').toLowerCase();
    const code = String(err?.code || '');
    if (['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', '57P01', '08006', '08001'].includes(code)) return true;
    return msg.includes('connection terminated') || msg.includes('timeout') || msg.includes('database is not reachable');
};
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let lastReadySuccessAt = Date.now();
const probeDatabaseReady = async () => {
    let lastError = null;
    for (let attempt = 1; attempt <= readyProbeRetries; attempt += 1) {
        const startedAt = Date.now();
        try {
            await db.query('SELECT 1');
            return { ok: true, latencyMs: Date.now() - startedAt, attempts: attempt };
        } catch (error) {
            lastError = error;
            if (attempt < readyProbeRetries) await wait(120 * attempt);
        }
    }
    return { ok: false, error: lastError };
};

// ── App Setup ──────────────────────────────────────────────
const app = express();

// Init DB tables (best-effort)
initAuditLogTable();
initWhatsAppWorkerTables();

// Apply all middleware
applyMiddleware(app);

// Mount all API routes
app.use('/api', apiRoutes);

// ── Health Checks ──────────────────────────────────────────
app.get('/api/health/live', (req, res) => {
    res.json({ status: 'OK', check: 'live', pid: process.pid, port: PORT, timestamp: new Date().toISOString() });
});

app.get('/api/health/ready', async (req, res) => {
    const probe = await probeDatabaseReady();
    if (probe.ok) {
        lastReadySuccessAt = Date.now();
        return res.json({ status: 'OK', check: 'ready', pid: process.pid, port: PORT, db_latency_ms: probe.latencyMs, attempts: probe.attempts, timestamp: new Date().toISOString() });
    }
    const elapsed = Date.now() - lastReadySuccessAt;
    if (elapsed <= readyGracePeriodMs) {
        return res.json({ status: 'DEGRADED', check: 'ready', pid: process.pid, port: PORT, message: 'Database probe failed, serving within readiness grace window', grace_remaining_ms: Math.max(0, readyGracePeriodMs - elapsed), error: probe.error?.message || 'Database probe failed', code: probe.error?.code || null, timestamp: new Date().toISOString() });
    }
    return res.status(503).json({ status: 'Error', check: 'ready', message: 'Database is not reachable', error: probe.error?.message || 'Database probe failed', code: probe.error?.code || null, timestamp: new Date().toISOString() });
});

app.get('/api/health', async (req, res) => {
    try {
        const dbStart = Date.now();
        await db.query('SELECT 1');
        const dbLatency = Date.now() - dbStart;
        const { rows: [{ current_db }] } = await db.query('SELECT current_database() AS current_db');
        const { rows: [{ users_table }] } = await db.query("SELECT to_regclass('public.users') AS users_table");
        let usersCount = null;
        if (users_table) {
            const { rows: [{ count }] } = await db.query('SELECT COUNT(*) FROM users');
            usersCount = count;
        }
        res.json({ status: 'OK', message: 'Server is running', database: { status: 'Connected', latency: `${dbLatency}ms`, current_database: current_db, pool: { total: db.totalCount, idle: db.idleCount, waiting: db.waitingCount } }, users_table_exists: Boolean(users_table), users_count: usersCount, environment: process.env.NODE_ENV || 'development', timestamp: new Date().toISOString() });
    } catch (err) {
        res.status(500).json({ status: 'Error', message: 'Database not reachable', error: err.message, code: err.code || null, timestamp: new Date().toISOString() });
    }
});

// ── Frontend SPA Fallback ──────────────────────────────────
const frontendIndexPath = path.join(__dirname, '../client/dist/index.html');
app.use((req, res, next) => {
    if (!['GET', 'HEAD'].includes(req.method)) return next();
    if (req.path.startsWith('/api')) return next();
    if (fs.existsSync(frontendIndexPath)) {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
        return res.sendFile(frontendIndexPath, (err) => { if (err) next(err); });
    }
    res.status(req.path === '/' ? 200 : 404).json({
        status: req.path === '/' ? 'OK' : 'Not Found',
        message: req.path === '/' ? 'Speednet Office Management API is running' : 'Endpoint not found',
        health_check: '/api/health',
    });
});

// ── Error Handlers ─────────────────────────────────────────
app.use((req, res) => res.status(404).json({ error: 'Not Found', path: req.path }));
app.use((err, req, res, next) => {
    console.error('Server Error:', err);
    res.locals.auditError = err.message || 'Unhandled server error';
    res.status(err.status || 500).json({ error: 'Internal Server Error', message: err.message || 'Something went wrong' });
});

// ── Process Error Handling ─────────────────────────────────
process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
    if (isTransientDbError(err)) return console.warn('Transient DB error; process kept alive.');
    if (fatalOnUnhandled) setTimeout(() => process.exit(1), 50);
});
process.on('unhandledRejection', (reason) => {
    console.error('Unhandled Rejection:', reason);
    if (isTransientDbError(reason)) return console.warn('Transient DB rejection; process kept alive.');
    if (fatalOnUnhandled) setTimeout(() => process.exit(1), 50);
});

// ── Start Server ───────────────────────────────────────────
const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n✅ Express API Server running on http://localhost:${PORT}`);
    console.log(`📊 Health Check: http://localhost:${PORT}/api/health`);
    console.log(`⚛️  React Frontend: http://localhost:5173\n`);
});

server.keepAliveTimeout = serverKeepAliveTimeoutMs;
server.headersTimeout = serverHeadersTimeoutMs;
if ('requestTimeout' in server) server.requestTimeout = serverRequestTimeoutMs;

if (String(process.env.WHATSAPP_GROUP_NOTIFICATIONS_ENABLED || 'false').toLowerCase() === 'true') {
    console.log('[WhatsApp] Auto-init enabled. Starting approval notification client...');
    ensureWhatsAppClient().catch((err) => console.error('[WhatsApp] Startup init failed:', err.message));
}
