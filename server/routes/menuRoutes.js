const express = require('express');
const router = express.Router();
const menuController = require('../controllers/menuController');
const authMiddleware = require('../middleware/auth');
const { requireRole } = require('../middleware/checkPermission');

router.get('/', authMiddleware, requireRole('super admin'), menuController.getMenus);
router.post('/', authMiddleware, requireRole('super admin'), menuController.saveMenu);
router.post('/order', authMiddleware, requireRole('super admin'), menuController.updateMenuOrder);
router.delete('/:id', authMiddleware, requireRole('super admin'), menuController.deleteMenu);

module.exports = router;
