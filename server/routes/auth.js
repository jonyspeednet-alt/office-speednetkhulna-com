const express = require("express");
const {
  login,
  logout,
  changePassword,
  refreshToken,
} = require("../controllers/authController");
const authMiddleware = require("../middleware/auth");

const router = express.Router();

// Simple in-memory rate limiter for login (no extra package needed)
const loginAttempts = new Map();
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const RATE_LIMIT_MAX = 10; // max 10 attempts per window

const loginRateLimiter = (req, res, next) => {
  const ip =
    req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
    req.ip ||
    "unknown";
  const now = Date.now();
  const key = ip;

  if (!loginAttempts.has(key)) {
    loginAttempts.set(key, { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS });
  }

  const record = loginAttempts.get(key);

  // Reset window if expired
  if (now > record.resetAt) {
    record.count = 0;
    record.resetAt = now + RATE_LIMIT_WINDOW_MS;
  }

  record.count += 1;

  if (record.count > RATE_LIMIT_MAX) {
    const retryAfterSec = Math.ceil((record.resetAt - now) / 1000);
    res.setHeader("Retry-After", retryAfterSec);
    res.setHeader("Cache-Control", "no-store");
    return res.status(429).json({
      message: `অনেক বেশি login চেষ্টা হয়েছে। ${Math.ceil(retryAfterSec / 60)} মিনিট পরে আবার চেষ্টা করুন।`,
      retryAfterSeconds: retryAfterSec,
    });
  }

  // Clean up old entries every 100 requests (lightweight GC)
  if (loginAttempts.size > 1000) {
    for (const [k, v] of loginAttempts) {
      if (now > v.resetAt) loginAttempts.delete(k);
    }
  }

  next();
};

router.post("/login", loginRateLimiter, login);
router.post("/logout", logout);
router.post("/change-password", authMiddleware, changePassword);
router.post("/refresh", authMiddleware, refreshToken);

module.exports = router;
