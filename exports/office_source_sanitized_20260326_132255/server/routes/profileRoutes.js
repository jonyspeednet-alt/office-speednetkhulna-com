const express = require('express');
const router = express.Router();
const profileController = require('../controllers/profileController');
const authMiddleware = require('../middleware/auth');

// Route: GET /api/profile (Logged in user)
router.get('/', authMiddleware, profileController.getUserProfile);

// Route: GET /api/profile/:id (Specific user)
router.get('/:id', authMiddleware, profileController.getUserProfile);

module.exports = router;