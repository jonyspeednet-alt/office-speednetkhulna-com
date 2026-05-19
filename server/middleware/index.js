// middleware/index.js — Middleware registration
const express = require('express');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const compression = require('compression');
const path = require('path');
const corsMiddleware = require('../config/cors');
const { requestLogEnabled } = require('../config/env');
const { auditLogMiddleware } = require('../utilities/auditLogger');

function applyMiddleware(app) {
    // Gzip compression
    app.use(compression());

    // Security headers
    app.use((req, res, next) => {
        res.setHeader('X-Frame-Options', 'DENY');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('X-XSS-Protection', '1; mode=block');
        res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
        res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
        res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
        next();
    });

    // CORS
    app.use(corsMiddleware);

    // Cookie & body parsing
    app.use(cookieParser());
    app.use(bodyParser.urlencoded({ extended: true, limit: '20mb' }));
    app.use(bodyParser.json({ limit: '20mb' }));

    // Static uploads
    app.use('/uploads', express.static(path.join(__dirname, '../../uploads'), {
        maxAge: '1d',
        etag: true,
    }));

    // Request logger (disabled in production by default)
    if (requestLogEnabled) {
        app.use((req, res, next) => {
            if (req.path.startsWith('/assets/') || req.path.startsWith('/uploads/')) return next();
            console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
            next();
        });
    }

    // API cache control
    app.use('/api', (req, res, next) => {
        res.set('Cache-Control', req.method === 'GET'
            ? 'private, max-age=15, must-revalidate'
            : 'no-store');
        next();
    });

    // Audit logging
    app.use('/api', auditLogMiddleware);
}

module.exports = { applyMiddleware };
