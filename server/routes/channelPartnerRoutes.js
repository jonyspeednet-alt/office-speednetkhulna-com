const express = require("express");
const authMiddleware = require("../middleware/auth");
const controller = require("../controllers/channelPartnerController");
const {
  requirePermission,
  requireAnyPermission,
} = require("../middleware/checkPermission");

const router = express.Router();
router.use(authMiddleware);

const canView = requireAnyPermission([
  "reseller.profile",
  "reseller.list",
  "reseller.tasks.manage",
]);
const canManage = requireAnyPermission([
  "reseller.profile",
  "billing.logs.view",
]);
const canFinancials = requireAnyPermission([
  "billing.logs.view",
  "billing.monthly_summary.view",
  "billing.generate_bill",
]);

// User management
router.get("/:resellerId/users", canView, controller.listUsers);
router.post("/:resellerId/users", canManage, controller.addUser);
router.put("/:resellerId/users/:userId", canManage, controller.updateUser);
router.delete("/:resellerId/users/:userId", canManage, controller.deleteUser);

// User payment collection tracking
router.get(
  "/:resellerId/user-payments",
  canFinancials,
  controller.getUserPayments
);
router.post(
  "/:resellerId/user-payments/init",
  canFinancials,
  controller.initMonthlyPayments
);
router.post(
  "/:resellerId/user-payments/record",
  canFinancials,
  controller.recordUserPayment
);
router.post(
  "/:resellerId/user-payments/bulk",
  canFinancials,
  controller.bulkRecordPayments
);

// Commission
router.get(
  "/:resellerId/commission-summary",
  canFinancials,
  controller.getCommissionSummary
);
router.post(
  "/:resellerId/commission-generate",
  canFinancials,
  controller.generateCommission
);
router.patch(
  "/:resellerId/commission/:logId/adjust",
  canFinancials,
  controller.adjustCommission
);
router.patch(
  "/:resellerId/commission/:logId/finalize",
  canFinancials,
  controller.finalizeCommission
);
router.get(
  "/:resellerId/commission-history",
  canFinancials,
  controller.getCommissionHistory
);

// Commission payments (to partner)
router.post(
  "/:resellerId/commission-payments",
  canFinancials,
  controller.recordCommissionPayment
);
router.get(
  "/:resellerId/commission-payments",
  canFinancials,
  controller.getCommissionPayments
);

// Statement
router.get("/:resellerId/statement", canFinancials, controller.getStatement);

module.exports = router;
