const express = require("express");
const router = express.Router();
const employeeController = require("../controllers/employeeController");
const authMiddleware = require("../middleware/auth");
const { requirePermission } = require("../middleware/checkPermission");
const multer = require("multer");
const path = require("path");

// Configure Multer storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/");
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, file.fieldname + "-" + uniqueSuffix + ext);
  },
});
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB max per file
    files: 2, // max 2 files at once
  },
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|gif|webp/i;
    const ext = allowed.test(file.originalname.split(".").pop());
    const mime = allowed.test(file.mimetype.split("/")[1]);
    if (ext && mime) return cb(null, true);
    cb(new Error("শুধুমাত্র ছবি ফাইল আপলোড করা যাবে (JPEG, PNG, GIF, WebP)"));
  },
});

router.get("/", authMiddleware, employeeController.getEmployees);
router.get("/departments", authMiddleware, employeeController.getDepartments);
router.get(
  "/next-id",
  authMiddleware,
  requirePermission("users.manage"),
  employeeController.getNextEmployeeId,
);
router.post(
  "/",
  authMiddleware,
  requirePermission("users.manage"),
  upload.fields([
    { name: "profile_pic", maxCount: 1 },
    { name: "nid_pic", maxCount: 1 },
  ]),
  employeeController.addEmployee,
);
// Self access is allowed at controller level for these two routes.
router.get("/:id", authMiddleware, employeeController.getEmployeeById);
router.put(
  "/:id",
  authMiddleware,
  upload.fields([
    { name: "profile_pic", maxCount: 1 },
    { name: "nid_pic", maxCount: 1 },
  ]),
  employeeController.updateEmployee,
);

module.exports = router;
