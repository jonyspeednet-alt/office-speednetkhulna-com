const express = require('express');
const router = express.Router();
const leaveSubmissionController = require('../controllers/leaveSubmissionController');
const authMiddleware = require('../middleware/auth');

// Route: POST /api/leaves/apply
router.post('/apply', authMiddleware, leaveSubmissionController.submitLeave);

// Route: GET /api/leaves/form-data
router.get('/form-data', authMiddleware, leaveSubmissionController.getLeaveFormData);

module.exports = router;