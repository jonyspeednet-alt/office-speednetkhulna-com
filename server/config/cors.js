// config/cors.js — CORS configuration
const cors = require('cors');

const exactAllowedOrigins = new Set([
    'http://localhost:3000',
    'http://localhost:5173',
    'http://localhost:5174',
    'http://127.0.0.1:5173',
    'http://127.0.0.1:5174',
    process.env.FRONTEND_URL,
].filter(Boolean));

if (process.env.CORS_ALLOWED_ORIGINS) {
    process.env.CORS_ALLOWED_ORIGINS
        .split(',')
        .map((v) => v.trim())
        .filter(Boolean)
        .forEach((v) => exactAllowedOrigins.add(v));
}

const normalizeOrigin = (origin) =>
    !origin ? '' : String(origin).trim().replace(/\/+$/, '').toLowerCase();

const speednetDomainPattern = /^https?:\/\/([a-z0-9-]+\.)*speednetkhulna\.com(?::\d+)?$/i;

const isAllowedOrigin = (origin) => {
    if (!origin) return true;
    const normalized = normalizeOrigin(origin);
    if (exactAllowedOrigins.has(origin) || exactAllowedOrigins.has(normalized)) return true;
    if (speednetDomainPattern.test(normalized)) return true;
    return false;
};

const corsMiddleware = cors({
    origin: (origin, callback) => {
        if (isAllowedOrigin(origin)) return callback(null, true);
        console.error(`CORS blocked for origin: ${origin}`);
        return callback(new Error('CORS blocked for this origin'));
    },
    credentials: true,
});

module.exports = corsMiddleware;
