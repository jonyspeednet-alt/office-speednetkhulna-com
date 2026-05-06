const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const db = require('../utilities/db');

// ============================================
// Simple in-memory rate limiter for login
// Max 10 attempts per IP per 15 minutes
// ============================================
const loginAttempts = new Map();
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const RATE_LIMIT_MAX = 10;

const loginRateLimiter = (req, res, next) => {
    const ip = req.ip || req.connection.remoteAddress || 'unknown';
    const now = Date.now();
    const key = `login:${ip}`;
    const entry = loginAttempts.get(key) || { count: 0, firstAttempt: now };

    // Reset window if expired
    if (now - entry.firstAttempt > RATE_LIMIT_WINDOW_MS) {
        loginAttempts.set(key, { count: 1, firstAttempt: now });
        return next();
    }

    entry.count += 1;
    loginAttempts.set(key, entry);

    if (entry.count > RATE_LIMIT_MAX) {
        const retryAfterSec = Math.ceil((RATE_LIMIT_WINDOW_MS - (now - entry.firstAttempt)) / 1000);
        res.setHeader('Retry-After', retryAfterSec);
        return res.status(429).json({
            success: false,
            message: `অনেক বেশি চেষ্টা করা হয়েছে। ${Math.ceil(retryAfterSec / 60)} মিনিট পরে আবার চেষ্টা করুন।`
        });
    }

    next();
};

// Cleanup stale entries every 30 minutes to prevent memory leak
setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of loginAttempts.entries()) {
        if (now - entry.firstAttempt > RATE_LIMIT_WINDOW_MS) {
            loginAttempts.delete(key);
        }
    }
}, 30 * 60 * 1000);

router.post('/login_action', loginRateLimiter, async (req, res) => {
    // ১. ইনপুট ডাটা সংগ্রহ
    const identifier = req.body.identifier ? req.body.identifier.trim() : '';
    const password = req.body.password;

    // Basic input validation
    if (!identifier || !password) {
        return res.status(400).json({ success: false, message: 'ইমেইল/আইডি এবং পাসওয়ার্ড আবশ্যক।' });
    }

    try {
        // ২. ডাটাবেস থেকে ইউজার খোঁজা (ইমেইল অথবা এমপ্লয়ী আইডি দিয়ে)
        const sql = "SELECT * FROM users WHERE (email = $1 OR employee_id = $2) LIMIT 1";

        // ডাটাবেস থেকে ইউজার খোঁজা
        const result = await db.query(sql, [identifier, identifier]);
        const user = result.rows && result.rows.length > 0 ? result.rows[0] : null;

        if (user) {
            // ৩. পাসওয়ার্ড যাচাই (hashed এবং plain text উভয়ই সাপোর্ট করে)
            let isMatch = false;
            const dbPassword = user.password ? user.password.trim() : '';

            // First try bcrypt if it looks like a hash
            if (dbPassword.startsWith('$2')) {
                try {
                    isMatch = await bcrypt.compare(password, dbPassword);
                } catch (err) {
                    console.error('Bcrypt Error:', err);
                    isMatch = false;
                }
            }

            // If still not matched, try plain text fallback
            if (!isMatch) {
                isMatch = (password === dbPassword);
            }

            if (isMatch) {
                // ৪. সেশন ভেরিয়েবল সেট করা
                req.session.user_id = user.id;
                req.session.full_name = user.full_name;
                req.session.role = user.role;
                req.session.can_action = user.can_take_action;
                req.session.emp_id = user.employee_id;

                // ৫. রিডাইরেক্ট লজিক
                const redirectUrl = req.session.redirect_url || '/dashboard';

                // রিডাইরেক্ট URL সেশন থেকে মুছে ফেলা (যদি থাকে)
                if (req.session.redirect_url) {
                    delete req.session.redirect_url;
                }

                // Reset rate limit on successful login
                const ip = req.ip || req.connection.remoteAddress || 'unknown';
                loginAttempts.delete(`login:${ip}`);

                // সফল লগইন শেষে ড্যাশবোর্ডে পাঠানো
                return res.redirect(redirectUrl);
            } else {
                // ভুল পাসওয়ার্ড এলার্ট এবং রিডাইরেক্ট
                return res.send("<script>alert('ভুল পাসওয়ার্ড!'); window.location.href='/';</script>");
            }
        } else {
            // ইউজার পাওয়া না গেলে এলার্ট এবং রিডাইরেক্ট
            return res.send("<script>alert('ইউজার পাওয়া যায়নি!'); window.location.href='/';</script>");
        }

    } catch (error) {
        console.error("Login Error:", error);
        return res.status(500).json({ success: false, message: 'সার্ভার ত্রুটি। পরে আবার চেষ্টা করুন।' });
    }
});

module.exports = router;
