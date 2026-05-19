const express = require('express');
const router = express.Router();
const { getRoles, saveRole, deleteRole, assignRoleToUser } = require('../controllers/roleController');
const authMiddleware = require('../middleware/auth');
const { requirePermission } = require('../middleware/checkPermission');

router.use(authMiddleware, requirePermission('permissions.manage'));

router.get('/', getRoles);
router.post('/save', saveRole);
router.delete('/:id', deleteRole);
router.post('/assign', assignRoleToUser);

module.exports = router;
