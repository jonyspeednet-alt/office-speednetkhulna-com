const { loadEnv } = require('../utilities/envLoader');

// Initialize environment
const { appEnv } = loadEnv();

const PORT = process.env.PORT || 5000;
const authSecretConfigured = Boolean(process.env.JWT_SECRET || process.env.SESSION_SECRET);
const requestLogEnabled =
    String(process.env.REQUEST_LOG_ENABLED || '').toLowerCase() === 'true' ||
    process.env.NODE_ENV !== 'production';
const fatalOnUnhandled = String(process.env.FATAL_ON_UNHANDLED || 'false').toLowerCase() === 'true';
const readyGracePeriodMs = Math.max(0, Number(process.env.READY_GRACE_PERIOD_MS || 45000));
const readyProbeRetries = Math.max(1, Number(process.env.READY_PROBE_RETRIES || 2));
const serverKeepAliveTimeoutMs = Math.max(5000, Number(process.env.SERVER_KEEPALIVE_TIMEOUT_MS || 65000));
const serverHeadersTimeoutMs = Math.max(serverKeepAliveTimeoutMs + 1000, Number(process.env.SERVER_HEADERS_TIMEOUT_MS || 70000));
const serverRequestTimeoutMs = Math.max(10000, Number(process.env.SERVER_REQUEST_TIMEOUT_MS || 120000));

if (!authSecretConfigured) {
    console.warn('⚠️  JWT_SECRET/SESSION_SECRET is missing. Login/auth will fail until one is configured.');
}

module.exports = {
    PORT,
    appEnv,
    authSecretConfigured,
    requestLogEnabled,
    fatalOnUnhandled,
    readyGracePeriodMs,
    readyProbeRetries,
    serverKeepAliveTimeoutMs,
    serverHeadersTimeoutMs,
    serverRequestTimeoutMs,
};
