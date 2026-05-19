const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const controller = require('../controllers/internetRegistrationController');

router.get('/', authMiddleware, controller.getRegistrations);
router.get('/branches', authMiddleware, controller.getBranches);
router.get('/packages', authMiddleware, controller.getPackages);
router.get('/free-ids', authMiddleware, controller.getAvailableFreeIds);
router.post('/free-ids/bulk', authMiddleware, controller.createFreeIdsBulk);
router.post('/free-ids', authMiddleware, controller.createFreeIds);
router.post('/', authMiddleware, controller.createRegistration);

module.exports = router;
