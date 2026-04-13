const express = require('express');
const authMiddleware = require('../middleware/auth');
const controller = require('../controllers/resellerController');
const { requirePermission, requireAnyPermission } = require('../middleware/checkPermission');

const router = express.Router();

router.post('/partner-sheets/webhook', controller.ingestPartnerSheetWebhook);
router.use(authMiddleware);

router.get('/resellers', requireAnyPermission(['reseller.list', 'reseller.tasks.manage']), controller.listResellers);
router.get('/partner-sheets', requireAnyPermission(['reseller.list', 'reseller.tasks.manage']), controller.getPartnerSheetList);
router.post('/resellers', requirePermission('reseller.add'), controller.createReseller);
router.get('/resellers/:id', requireAnyPermission(['reseller.profile', 'reseller.list']), controller.getResellerProfile);
router.get('/resellers/:id/details', requireAnyPermission(['reseller.profile', 'reseller.list', 'reseller.tasks.manage', 'reseller.status_noc.view']), controller.getResellerProfileDetails);
router.put('/resellers/:id', requirePermission('reseller.profile'), controller.updateReseller);
router.get('/reseller-status-noc', requirePermission('reseller.status_noc.view'), controller.getStatusNoc);

router.post('/bandwidth-requests', requirePermission('reseller.requests.create'), controller.createBandwidthRequest);
router.get('/bandwidth-requests', requireAnyPermission(['reseller.requests.review', 'reseller.tasks.manage']), controller.listBandwidthRequests);
router.patch('/bandwidth-requests/:id/review', requirePermission('reseller.requests.review'), controller.reviewBandwidthRequest);
router.post('/bandwidth-requests/:id/apply', requireAnyPermission(['reseller.requests.review', 'reseller.tasks.manage']), controller.applyApprovedRequest);

router.get('/billing-logs', requireAnyPermission(['billing.logs.view', 'reseller.list']), controller.getBillingLogs);
router.get('/financial-audit-logs', requireAnyPermission(['billing.logs.view', 'reseller.list', 'audit.system_logs.view']), controller.getFinancialAuditLogs);
router.post('/billing-logs', requirePermission('billing.logs.view'), controller.addBillingLog);
router.post('/resellers/:id/discounts', requireAnyPermission(['billing.discount.add', 'billing.logs.view']), controller.addDiscount);

router.get('/monthly-summary', requirePermission('billing.monthly_summary.view'), controller.getMonthlySummary);
router.patch('/monthly-summary/next-pay-date', requirePermission('billing.monthly_summary.view'), controller.updateMonthlySummaryPayDate);
router.post('/generate-bills', requirePermission('billing.generate_bill'), controller.generateMonthlyBills);
router.post('/invoice/:resellerId/finalize', requireAnyPermission(['billing.logs.view', 'billing.generate_bill']), controller.finalizeInvoice);

router.get('/invoice/by-bill/:billId', requireAnyPermission(['billing.invoice.static_view', 'billing.invoice.view']), controller.getInvoiceByBillId);
router.post('/invoice/by-bill/:billId/send-email', requireAnyPermission(['billing.invoice.static_view', 'billing.invoice.view']), controller.sendInvoiceEmailByBillId);
router.get('/invoice/:resellerId', requirePermission('billing.invoice.view'), controller.getInvoice);
router.post('/invoice/:resellerId/send-email', requirePermission('billing.invoice.view'), controller.sendInvoiceEmailByReseller);

module.exports = router;



