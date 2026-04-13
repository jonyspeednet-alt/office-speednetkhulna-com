const express = require('express');
const router = express.Router();
const employeeController = require('../controllers/employeeController');
const authMiddleware = require('../middleware/auth');
const { requirePermission } = require('../middleware/checkPermission');
const multer = require('multer');
const path = require('path');

// Configure Multer storage
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + ext);
    }
});
const upload = multer({ storage: storage });

router.get('/', authMiddleware, employeeController.getEmployees);
router.get('/departments', authMiddleware, employeeController.getDepartments);
router.get('/next-id', authMiddleware, requirePermission('users.manage'), employeeController.getNextEmployeeId);
router.post('/', authMiddleware, requirePermission('users.manage'), upload.fields([{ name: 'profile_pic', maxCount: 1 }, { name: 'nid_pic', maxCount: 1 }]), employeeController.addEmployee);
// Self access is allowed at controller level for these two routes.
router.get('/:id', authMiddleware, employeeController.getEmployeeById);
router.put('/:id', authMiddleware, upload.fields([{ name: 'profile_pic', maxCount: 1 }, { name: 'nid_pic', maxCount: 1 }]), employeeController.updateEmployee);

module.exports = router;
