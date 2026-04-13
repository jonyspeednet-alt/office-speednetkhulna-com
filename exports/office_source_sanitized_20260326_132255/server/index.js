// PERN Stack Express API Server
const express = require('express');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const compression = require('compression');
const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');

// Environment loading order:
// 1) mode-specific file (.env.local / .env.production)
// 2) fallback .env
const envRoot = path.resolve(__dirname, '..');
const appEnvRaw = String(process.env.APP_ENV || process.env.NODE_ENV || '').toLowerCase();
const appEnv = appEnvRaw === 'production' ? 'production' : 'local';
const modeEnvPath = path.join(envRoot, appEnv === 'production' ? '.env.production' : '.env.local');
const fallbackEnvPath = path.join(envRoot, '.env');

if (fs.existsSync(modeEnvPath)) {
    dotenv.config({ path: modeEnvPath });
}
if (fs.existsSync(fallbackEnvPath)) {
    dotenv.config({ path: fallbackEnvPath, override: false });
}

const db = require('./utilities/db');
const { initAuditLogTable, auditLogMiddleware } = require('./utilities/auditLogger');
const { initWhatsAppWorkerTables } = require('./utilities/whatsappWorkerQueue');
const { ensureClient: ensureWhatsAppClient } = require('./services/whatsappNotificationService');

const app = express();
const PORT = process.env.PORT || 5000;
const authSecretConfigured = Boolean(process.env.JWT_SECRET || process.env.SESSION_SECRET);
const requestLogEnabled = String(process.env.REQUEST_LOG_ENABLED || '').toLowerCase() === 'true'
    || process.env.NODE_ENV !== 'production';
const fatalOnUnhandled = String(process.env.FATAL_ON_UNHANDLED || 'false').toLowerCase() === 'true';
const readyGracePeriodMs = Math.max(0, Number(process.env.READY_GRACE_PERIOD_MS || 45000));
const readyProbeRetries = Math.max(1, Number(process.env.READY_PROBE_RETRIES || 2));
const serverKeepAliveTimeoutMs = Math.max(5000, Number(process.env.SERVER_KEEPALIVE_TIMEOUT_MS || 65000));
const serverHeadersTimeoutMs = Math.max(serverKeepAliveTimeoutMs + 1000, Number(process.env.SERVER_HEADERS_TIMEOUT_MS || 70000));
const serverRequestTimeoutMs = Math.max(10000, Number(process.env.SERVER_REQUEST_TIMEOUT_MS || 120000));
let lastReadySuccessAt = Date.now();

const isTransientDbError = (err) => {
    const msg = String(err?.message || '').toLowerCase();
    const code = String(err?.code || '');
    if (['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', '57P01', '08006', '08001'].includes(code)) return true;
    return msg.includes('connection terminated')
        || msg.includes('timeout')
        || msg.includes('database is not reachable');
};
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const probeDatabaseReady = async () => {
    let lastError = null;
    for (let attempt = 1; attempt <= readyProbeRetries; attempt += 1) {
        const startedAt = Date.now();
        try {
            await db.query('SELECT 1');
            return { ok: true, latencyMs: Date.now() - startedAt, attempts: attempt };
        } catch (error) {
            lastError = error;
            if (attempt < readyProbeRetries) {
                await wait(120 * attempt);
            }
        }
    }
    return { ok: false, error: lastError };
};

if (!authSecretConfigured) {
    console.warn('⚠️  JWT_SECRET/SESSION_SECRET is missing. Login/auth will fail until one is configured.');
}

// ============================================
// MIDDLEWARE SETUP
// ============================================

// Enable Gzip compression
app.use(compression());

// CORS Configuration
const exactAllowedOrigins = new Set([
    'http://localhost:3000',
    'http://localhost:5173',
    'http://localhost:5174',
    'http://127.0.0.1:5173',
    'http://127.0.0.1:5174',
    process.env.FRONTEND_URL
].filter(Boolean));

// Optional comma-separated env override for extra origins.
if (process.env.CORS_ALLOWED_ORIGINS) {
    process.env.CORS_ALLOWED_ORIGINS
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean)
        .forEach((value) => exactAllowedOrigins.add(value));
}

const normalizeOrigin = (origin) => {
    if (!origin) return '';
    return String(origin).trim().replace(/\/+$/, '').toLowerCase();
};

const speednetDomainPattern = /^https?:\/\/([a-z0-9-]+\.)*speednetkhulna\.com(?::\d+)?$/i;

const isAllowedOrigin = (origin) => {
    if (!origin) return true; // allow curl/server-to-server requests with no Origin header
    const normalized = normalizeOrigin(origin);
    if (exactAllowedOrigins.has(origin) || exactAllowedOrigins.has(normalized)) return true;
    if (speednetDomainPattern.test(normalized)) return true;
    return false;
};

app.use(cors({
    origin: (origin, callback) => {
        if (isAllowedOrigin(origin)) {
            return callback(null, true);
        }
        console.error(`CORS blocked for origin: ${origin}`);
        return callback(new Error('CORS blocked for this origin'));
    },
    credentials: true
}));

app.use(cookieParser());
// Body Parser Middleware
app.use(bodyParser.urlencoded({ extended: true, limit: '20mb' }));
app.use(bodyParser.json({ limit: '20mb' }));

// Ensure DB audit table exists (best effort).
initAuditLogTable();
initWhatsAppWorkerTables();

// Serve Static Files (Uploads)
app.use('/uploads', express.static(path.join(__dirname, '../uploads'), {
    maxAge: '1d',
    etag: true
}));

// Simple request logger (disabled by default in production for lower overhead)
if (requestLogEnabled) {
    app.use((req, res, next) => {
        // Skip hashed static assets and uploads to reduce noisy I/O
        if (req.path.startsWith('/assets/') || req.path.startsWith('/uploads/')) {
            return next();
        }
        console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
        next();
    });
}

// API Cache Control
app.use('/api', (req, res, next) => {
    if (req.method === 'GET') {
        // Very short private cache reduces repeated identical fetches during quick navigation.
        res.set('Cache-Control', 'private, max-age=15, must-revalidate');
    } else {
        res.set('Cache-Control', 'no-store');
    }
    next();
});

// API request audit log middleware (DB-backed).
app.use('/api', auditLogMiddleware);

// ============================================
// API ROUTES
// ============================================

// Import API routes
// ফাইলের নাম অনুযায়ী সঠিক ইম্পোর্ট
const authRoutes = require('./routes/auth'); 
const adminDashboardRoutes = require('./routes/adminDashboardRoutes');
const userDashboardRoutes = require('./routes/userDashboardRoutes');
const sidebarRoutes = require('./routes/sidebarRoutes');
const menuRoutes = require('./routes/menuRoutes');
const employeeRoutes = require('./routes/employeeRoutes');
const profileRoutes = require('./routes/profileRoutes');
const leaveRoutes = require('./routes/leaveRoutes');
const leaveSubmissionRoutes = require('./routes/leaveSubmissionRoutes');
const myLeavesRoutes = require('./routes/myLeavesRoutes');
const approvalRoutes = require('./routes/approvalRoutes');
const whatsappRoutes = require('./routes/whatsappRoutes');
const whatsappWorkerRoutes = require('./routes/whatsappWorkerRoutes');
const calendarRoutes = require('./routes/calendarRoutes');
const entitlementRoutes = require('./routes/entitlementRoutes');
const permissionRoutes = require('./routes/permissionRoutes');
const phoneDirectoryRoutes = require('./routes/phoneDirectoryRoutes');
const reportRoutes = require('./routes/reportRoutes');
const noticeRoutes = require('./routes/noticeRoutes');
const roleRoutes = require('./routes/roleRoutes');
const resellerRoutes = require('./routes/resellerRoutes');
const auditLogRoutes = require('./routes/auditLogRoutes');
const systemLogRoutes = require('./routes/systemLogRoutes');
const officeWorkRoutes = require('./routes/officeWorkRoutes');
const internetRegistrationRoutes = require('./routes/internetRegistrationRoutes');
const resellerController = require('./controllers/resellerController');

// Mount API routes with /api prefix
app.use('/api/auth', authRoutes);
app.use('/api/dashboard/admin', adminDashboardRoutes);
app.use('/api/dashboard', userDashboardRoutes);
app.use('/api/sidebar', sidebarRoutes);
app.use('/api/admin/menus', menuRoutes);
app.use('/api/employees', employeeRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/leaves', leaveRoutes);
app.use('/api/leaves', leaveSubmissionRoutes);
app.use('/api/my-leaves', myLeavesRoutes);
app.use('/api/approvals', approvalRoutes);
app.use('/api/internal/whatsapp', whatsappRoutes);
app.use('/api/internal/whatsapp-worker', whatsappWorkerRoutes);
app.use('/api/calendar', calendarRoutes);
app.use('/api/entitlements', entitlementRoutes);
app.use('/api/permissions', permissionRoutes);
app.use('/api/phone-directory', phoneDirectoryRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/notices', noticeRoutes);
app.use('/api/roles', roleRoutes);
app.use('/api/resellers', resellerRoutes);
app.use('/api/audit-logs', auditLogRoutes);
app.use('/api/system-logs', systemLogRoutes);
app.use('/api/office-work', officeWorkRoutes);
app.use('/api/internet-registrations', internetRegistrationRoutes);
app.post('/api/internal/billing/auto-finalize', resellerController.internalAutoFinalize);
app.get('/api/internal/billing/auto-finalize/status', resellerController.internalAutoFinalizeStatus);

// Serve frontend bundle when available (same-domain deployment).
const frontendDistPath = path.resolve(__dirname, '../client/dist');
const frontendIndexPath = path.join(frontendDistPath, 'index.html');

// Serve static files if directory exists
if (fs.existsSync(frontendDistPath)) {
    app.use(express.static(frontendDistPath, {
        etag: false,
        lastModified: false,
        setHeaders: (res, filePath) => {
            if (filePath.endsWith('.html')) {
                res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
                res.setHeader('Pragma', 'no-cache');
                res.setHeader('Expires', '0');
                return;
            }
            // Built assets are hash-named; safe for long cache.
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        }
    }));
}

// Handle all non-API routes by serving the frontend or providing a clear error
app.get(/^\/(?!api\/).*/, (req, res, next) => {
    // Re-check existence to handle cases where dist is created after server starts
    if (fs.existsSync(frontendIndexPath)) {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
        res.sendFile(frontendIndexPath, (err) => {
            if (err) next(err);
        });
    } else {
        // If it's just the root path, we can provide a more friendly message
        if (req.path === '/') {
            return res.status(200).json({
                status: 'OK',
                message: 'Speednet Office Management API is running',
                frontend: 'Frontend bundle not found. Please run "npm run build" in the client directory to serve the UI.',
                check_path: frontendIndexPath,
                health_check: '/api/health'
            });
        }
        
        // For other paths, return 404 with a helpful message
        res.status(404).json({ 
            error: 'Not Found',
            message: 'The requested endpoint does not exist',
            path: req.path,
            frontend_status: 'Missing client/dist/index.html'
        });
    }
});

// ============================================
// HEALTH CHECK ENDPOINTS
// ============================================

app.get('/api/health/live', (req, res) => {
    res.json({
        status: 'OK',
        check: 'live',
        pid: process.pid,
        port: PORT,
        timestamp: new Date().toISOString()
    });
});

app.get('/api/health/ready', async (req, res) => {
    const probe = await probeDatabaseReady();
    if (probe.ok) {
        lastReadySuccessAt = Date.now();
        return res.json({
            status: 'OK',
            check: 'ready',
            pid: process.pid,
            port: PORT,
            db_latency_ms: probe.latencyMs,
            attempts: probe.attempts,
            timestamp: new Date().toISOString()
        });
    }

    const elapsedSinceLastReadyMs = Date.now() - lastReadySuccessAt;
    if (elapsedSinceLastReadyMs <= readyGracePeriodMs) {
        return res.json({
            status: 'DEGRADED',
            check: 'ready',
            pid: process.pid,
            port: PORT,
            message: 'Database probe failed, serving within readiness grace window',
            grace_remaining_ms: Math.max(0, readyGracePeriodMs - elapsedSinceLastReadyMs),
            error: probe.error?.message || 'Database probe failed',
            code: probe.error?.code || null,
            timestamp: new Date().toISOString()
        });
    }

    return res.status(503).json({
        status: 'Error',
        check: 'ready',
        message: 'Database is not reachable',
        error: probe.error?.message || 'Database probe failed',
        code: probe.error?.code || null,
        timestamp: new Date().toISOString()
    });
});

app.get('/api/health', async (req, res) => {
    try {
        const dbStart = Date.now();
        await db.query('SELECT 1');
        const dbLatency = Date.now() - dbStart;
        const currentDbResult = await db.query('SELECT current_database() AS current_db');
        const currentDatabase = currentDbResult.rows[0]?.current_db || null;

        const usersTableCheck = await db.query(
            "SELECT to_regclass('public.users') AS users_table"
        );
        const hasUsersTable = Boolean(usersTableCheck.rows[0]?.users_table);
        let usersCount = null;

        if (hasUsersTable) {
            const userCountResult = await db.query('SELECT COUNT(*) FROM users');
            usersCount = userCountResult.rows[0].count;
        }

        res.json({ 
            status: 'OK',
            message: 'Server is running',
            database: {
                status: 'Connected',
                latency: `${dbLatency}ms`,
                current_database: currentDatabase,
                expected_database: db.expectedDatabase || null,
                pool: {
                    total: db.totalCount,
                    idle: db.idleCount,
                    waiting: db.waitingCount
                }
            },
            users_table_exists: hasUsersTable,
            users_count: usersCount,
            environment: process.env.NODE_ENV || 'development',
            timestamp: new Date().toISOString()
        });
    } catch (err) {
        res.status(500).json({ 
            status: 'Error',
            message: 'Server is running but database is not reachable',
            error: err.message,
            code: err.code || null,
            detail: err.detail || null,
            timestamp: new Date().toISOString()
        });
    }
});

// ============================================
// ERROR HANDLING - 404
// ============================================

app.use((req, res) => {
    res.status(404).json({ 
        error: 'Not Found',
        message: 'The requested endpoint does not exist',
        path: req.path
    });
});

// ============================================
// ERROR HANDLING - Global Error Handler
// ============================================

app.use((err, req, res, next) => {
    console.error('Server Error:', err);
    res.locals.auditError = err.message || 'Unhandled server error';
    res.status(err.status || 500).json({ 
        error: 'Internal Server Error',
        message: err.message || 'Something went wrong'
    });
});

// ============================================
// SERVER START
// ============================================

process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
    if (isTransientDbError(err)) {
        console.warn('Uncaught transient DB error detected; process kept alive.');
        return;
    }
    if (fatalOnUnhandled) {
        setTimeout(() => process.exit(1), 50);
    }
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    if (isTransientDbError(reason)) {
        console.warn('Unhandled transient DB rejection detected; process kept alive.');
        return;
    }
    if (fatalOnUnhandled) {
        setTimeout(() => process.exit(1), 50);
    }
});

const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n✅ Express API Server running on http://localhost:${PORT}`);
    console.log(`📊 Health Check: http://localhost:${PORT}/api/health`);
    console.log(`⚛️  React Frontend: http://localhost:5173`);
    console.log(`\n🔗 CORS enabled for localhost:3000, localhost:5173\n`);
});
server.keepAliveTimeout = serverKeepAliveTimeoutMs;
if (String(process.env.WHATSAPP_GROUP_NOTIFICATIONS_ENABLED || 'false').toLowerCase() === 'true') {
    console.log('[WhatsApp] Auto-init enabled. Attempting to start approval notification client...');
    ensureWhatsAppClient().catch((error) => {
        console.error('[WhatsApp] Startup init failed:', error.message);
    });
}
server.headersTimeout = serverHeadersTimeoutMs;
if ('requestTimeout' in server) {
    server.requestTimeout = serverRequestTimeoutMs;
}
