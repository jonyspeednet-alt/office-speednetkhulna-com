const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

// Route: POST /api/auth/login
router.post('/login', authController.login);

// Route: POST /api/auth/logout
router.post('/logout', authController.logout);

module.exports = router;