const express = require('express');
const router = express.Router();

const resellerHandlers = require('./resellerHandlers');
const packageHandlers = require('./packageHandlers');
const billing = require('./billing');
const report = require('./report');
const automation = require('./automation');
const status = require('./status');

// Reseller CRUD
router.post('/', resellerHandlers.createReseller);
router.get('/', resellerHandlers.getResellers);
router.get('/:id', resellerHandlers.getResellerById);
router.put('/:id', resellerHandlers.updateReseller);

// Packages under a reseller
router.get('/:resellerId/packages', packageHandlers.getPackagesByReseller);
router.post('/packages', packageHandlers.createPackage);
router.put('/packages/:id', packageHandlers.updatePackage);
router.delete('/packages/:id', packageHandlers.deletePackage);

// Billing and financial
router.post('/billing/log', billing.addBillingLog);
router.post('/billing/discount', billing.addDiscount);
router.get('/:resellerId/billing-logs', billing.getBillingLogs);
router.get('/:resellerId/monthly-summary', billing.getMonthlySummary);
router.post('/billing/summary/pay-date', billing.updateMonthlySummaryPayDate)


// Reports
router.get('/:resellerId/reports/detailed-monthly', report.getDetailedMonthlyReport);

// Status
router.get('/status/noc', status.getStatusNoc);


// Internal Automation API
router.post('/internal/auto-finalize', automation.internalAutoFinalize);
router.get('/internal/auto-finalize/status', automation.internalAutoFinalizeStatus);

module.exports = router; 