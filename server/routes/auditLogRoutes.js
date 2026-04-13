const express = require('express');
const authMiddleware = require('../middleware/auth');
const { listAuditLogs } = require('../controllers/auditLogController');

const router = express.Router();

router.get('/', authMiddleware, listAuditLogs);

module.exports = router;
