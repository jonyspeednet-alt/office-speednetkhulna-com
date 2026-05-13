// routes/index.js — Centralized API route registry
const express = require('express');
const router = express.Router();

// ── Auth ────────────────────────────────────────────────────
router.use('/auth', require('./auth'));

// ── Dashboard ───────────────────────────────────────────────
router.use('/dashboard/admin', require('./adminDashboardRoutes'));
router.use('/dashboard', require('./userDashboardRoutes'));

// ── Navigation ──────────────────────────────────────────────
router.use('/sidebar', require('./sidebarRoutes'));
router.use('/admin/menus', require('./menuRoutes'));

// ── People ──────────────────────────────────────────────────
router.use('/employees', require('./employeeRoutes'));
router.use('/profile', require('./profileRoutes'));
router.use('/roles', require('./roleRoutes'));
router.use('/permissions', require('./permissionRoutes'));
router.use('/phone-directory', require('./phoneDirectoryRoutes'));

// ── Leave Management ────────────────────────────────────────
router.use('/leaves', require('./leaveRoutes'));
router.use('/leaves', require('./leaveSubmissionRoutes'));
router.use('/my-leaves', require('./myLeavesRoutes'));
router.use('/approvals', require('./approvalRoutes'));
router.use('/entitlements', require('./entitlementRoutes'));

// ── Communication ───────────────────────────────────────────
router.use('/internal/whatsapp', require('./whatsappRoutes'));
router.use('/internal/whatsapp-worker', require('./whatsappWorkerRoutes'));
router.use('/notices', require('./noticeRoutes'));

// ── Calendar & Scheduling ───────────────────────────────────
router.use('/calendar', require('./calendarRoutes'));

// ── Business ────────────────────────────────────────────────
router.use('/reports', require('./reportRoutes'));
router.use('/resellers', require('./resellerRoutes'));
router.use('/channel-partners', require('./channelPartnerRoutes'));
router.use('/assets', require('./assetManagementRoutes'));
router.use('/procurement', require('./procurementRoutes'));
router.use('/office-work', require('./officeWorkRoutes'));
router.use('/internet-registrations', require('./internetRegistrationRoutes'));

// ── Logs & Audit ────────────────────────────────────────────
router.use('/audit-logs', require('./auditLogRoutes'));
router.use('/system-logs', require('./systemLogRoutes'));

module.exports = router;
