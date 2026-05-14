const express = require("express");
const authMiddleware = require("../middleware/auth");
const controller = require("../controllers/channelPartnerController");
const {
  requirePermission,
  requireAnyPermission,
} = require("../middleware/checkPermission");
const { upload } = require("../middleware/uploadMiddleware");
const pool = require("../utilities/db");

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

// Excel Import
router.post(
  "/:resellerId/import-user-list",
  upload.single("file"),
  canFinancials,
  controller.importChannelData,
);

// Partner Advances Excel Import
router.post(
  "/:resellerId/import-partner-advances",
  upload.single("file"),
  canFinancials,
  controller.importPartnerAdvances,
);

// User payment collection tracking
router.get(
  "/:resellerId/user-payments",
  canFinancials,
  controller.getUserPayments,
);
router.post(
  "/:resellerId/user-payments/init",
  canFinancials,
  controller.initMonthlyPayments,
);

// ============================================================================
// Phase 4: Reconciliation Workflow - Apply lock middleware
// ============================================================================

const {
  checkReconciliationLock,
  checkReconciliationModifiable,
} = require("../middleware/reconciliationLock");

router.post(
  "/:resellerId/user-payments/record",
  checkReconciliationLock,
  canFinancials,
  controller.recordUserPayment,
);
router.post(
  "/:resellerId/user-payments/bulk",
  checkReconciliationLock,
  canFinancials,
  controller.bulkRecordPayments,
);

// Commission
router.get(
  "/:resellerId/commission-summary",
  canFinancials,
  controller.getCommissionSummary,
);
router.post(
  "/:resellerId/commission-generate",
  canFinancials,
  controller.generateCommission,
);
router.patch(
  "/:resellerId/commission/:logId/adjust",
  canFinancials,
  controller.adjustCommission,
);
router.patch(
  "/:resellerId/commission/:logId/finalize",
  canFinancials,
  controller.finalizeCommission,
);
router.get(
  "/:resellerId/commission-history",
  canFinancials,
  controller.getCommissionHistory,
);

// Commission payments (to partner)
router.post(
  "/:resellerId/commission-payments",
  canFinancials,
  controller.recordCommissionPayment,
);
router.get(
  "/:resellerId/commission-payments",
  canFinancials,
  controller.getCommissionPayments,
);

// Statement
router.get("/:resellerId/statement", canFinancials, controller.getStatement);

// ============================================================================
// Phase 1: Billing Standardization - Partner Advances & Reconciliation
// ============================================================================

const BillingReconciliation = require("../utilities/billingReconciliation");
const PartnerAdvanceManager = require("../utilities/partnerAdvanceManager");

// Partner Advances
router.post(
  "/:resellerId/advances",
  checkReconciliationLock,
  canFinancials,
  async (req, res) => {
    try {
      const { resellerId } = req.params;
      const { user_id, advance_amount, advance_type, notes } = req.body;

      if (!user_id || !advance_amount || !advance_type) {
        return res.status(400).json({
          error:
            "Missing required fields: user_id, advance_amount, advance_type",
        });
      }

      const advanceMonth = new Date();
      advanceMonth.setDate(1);

      const advance = await PartnerAdvanceManager.recordAdvance(
        parseInt(resellerId),
        parseInt(user_id),
        advanceMonth,
        parseFloat(advance_amount),
        advance_type,
        req.user.id,
        notes || null,
      );

      res.status(201).json({
        success: true,
        data: advance,
        message: "Partner advance recorded successfully",
      });
    } catch (error) {
      console.error("[PartnerAdvances] Error:", error.message);
      res.status(500).json({ error: error.message });
    }
  },
);

router.post(
  "/:resellerId/advances/bulk",
  checkReconciliationLock,
  canFinancials,
  async (req, res) => {
    try {
      const { resellerId } = req.params;
      const { advances } = req.body;

      if (!Array.isArray(advances) || advances.length === 0) {
        return res.status(400).json({
          error: "advances must be a non-empty array",
        });
      }

      const createdAdvances = await PartnerAdvanceManager.recordBulkAdvances(
        parseInt(resellerId),
        advances,
        req.user.id,
      );

      res.status(201).json({
        success: true,
        data: createdAdvances,
        count: createdAdvances.length,
        message: `${createdAdvances.length} partner advances recorded`,
      });
    } catch (error) {
      console.error("[PartnerAdvances] Bulk error:", error.message);
      res.status(500).json({ error: error.message });
    }
  },
);

router.get("/:resellerId/advances/pending", canFinancials, async (req, res) => {
  try {
    const { resellerId } = req.params;
    const advances = await PartnerAdvanceManager.getPendingAdvances(
      parseInt(resellerId),
      "pending_adjustment",
    );

    res.status(200).json({
      success: true,
      data: advances,
      count: advances.length,
    });
  } catch (error) {
    console.error("[PartnerAdvances] Error getting pending:", error.message);
    res.status(500).json({ error: error.message });
  }
});

router.patch(
  "/:resellerId/advances/:advanceId/apply",
  canFinancials,
  async (req, res) => {
    try {
      const { advanceId } = req.params;
      const updated = await PartnerAdvanceManager.applyAdvanceAdjustment(
        parseInt(advanceId),
        req.user.id,
      );

      res.status(200).json({
        success: true,
        data: updated,
        message: "Partner advance applied to settlement",
      });
    } catch (error) {
      console.error("[PartnerAdvances] Error applying:", error.message);
      res.status(500).json({ error: error.message });
    }
  },
);

router.patch(
  "/:resellerId/advances/:advanceId/dispute",
  canFinancials,
  async (req, res) => {
    try {
      const { advanceId } = req.params;
      const { reason } = req.body;

      if (!reason) {
        return res.status(400).json({ error: "reason is required" });
      }

      const updated = await PartnerAdvanceManager.disputeAdvance(
        parseInt(advanceId),
        req.user.id,
        reason,
      );

      res.status(200).json({
        success: true,
        data: updated,
        message: "Partner advance marked as disputed",
      });
    } catch (error) {
      console.error("[PartnerAdvances] Error disputing:", error.message);
      res.status(500).json({ error: error.message });
    }
  },
);

router.patch(
  "/:resellerId/advances/:advanceId/reverse",
  canFinancials,
  async (req, res) => {
    try {
      const { advanceId } = req.params;
      const { reason } = req.body;

      if (!reason) {
        return res.status(400).json({ error: "reason is required" });
      }

      const updated = await PartnerAdvanceManager.reverseAdvance(
        parseInt(advanceId),
        req.user.id,
        reason,
      );

      res.status(200).json({
        success: true,
        data: updated,
        message: "Partner advance reversed",
      });
    } catch (error) {
      console.error("[PartnerAdvances] Error reversing:", error.message);
      res.status(500).json({ error: error.message });
    }
  },
);

router.get("/:resellerId/advances/history", canFinancials, async (req, res) => {
  try {
    const { resellerId } = req.params;
    const { month, status } = req.query;

    let query = `
        SELECT
          cpa.id,
          cpa.user_id,
          cpu.user_name,
          cpa.advance_month,
          cpa.advance_amount,
          cpa.advance_type,
          cpa.settlement_status,
          cpa.notes,
          cpa.created_by,
          cpa.created_at,
          cpa.resolved_by,
          cpa.resolved_at
        FROM channel_partner_advances cpa
        LEFT JOIN channel_partner_users cpu ON cpu.id = cpa.user_id
        WHERE cpa.reseller_id = $1
      `;

    const params = [parseInt(resellerId)];
    let paramIndex = 2;

    if (month) {
      query += ` AND cpa.advance_month = TO_DATE($${paramIndex} || '-01', 'YYYY-MM-DD')`;
      params.push(month);
      paramIndex++;
    }

    if (status) {
      query += ` AND cpa.settlement_status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    query += ` ORDER BY cpa.created_at DESC LIMIT 100`;

    const result = await pool.query(query, params);

    const totalResult = await pool.query(
      `SELECT COALESCE(SUM(advance_amount), 0) AS total
         FROM channel_partner_advances
         WHERE reseller_id = $1 ${month ? `AND advance_month = TO_DATE($2 || '-01', 'YYYY-MM-DD')` : ""}
         ${status ? `AND settlement_status = $${month ? 3 : 2}` : ""}`,
      month && status
        ? [parseInt(resellerId), month, status]
        : month
          ? [parseInt(resellerId), month]
          : status
            ? [parseInt(resellerId), status]
            : [parseInt(resellerId)],
    );

    res.status(200).json({
      success: true,
      data: result.rows,
      count: result.rows.length,
      total_amount: Number(totalResult.rows[0].total),
    });
  } catch (error) {
    console.error("[PartnerAdvances] Error getting history:", error.message);
    res.status(500).json({ error: error.message });
  }
});

// Reconciliation (Phase 1 - Old endpoints, kept for backward compatibility)
router.post(
  "/:resellerId/reconciliation-old/initiate",
  canFinancials,
  async (req, res) => {
    try {
      const { resellerId } = req.params;
      const { reconciliation_period } = req.body;

      if (!reconciliation_period) {
        return res.status(400).json({
          error: "reconciliation_period is required (YYYY-MM-01 format)",
        });
      }

      const period = new Date(reconciliation_period);
      const reconciliation = await BillingReconciliation.initiateReconciliation(
        parseInt(resellerId),
        period,
        req.user.id,
      );

      res.status(201).json({
        success: true,
        data: reconciliation,
        message: "Reconciliation initiated",
      });
    } catch (error) {
      console.error("[Reconciliation] Error initiating:", error.message);
      res.status(500).json({ error: error.message });
    }
  },
);

router.get(
  "/:resellerId/reconciliation-old/:reconciliationLogId",
  canFinancials,
  async (req, res) => {
    try {
      const { reconciliationLogId } = req.params;
      const status = await BillingReconciliation.getReconciliationStatus(
        parseInt(reconciliationLogId),
      );

      res.status(200).json({
        success: true,
        data: status,
      });
    } catch (error) {
      console.error("[Reconciliation] Error getting status:", error.message);
      res.status(500).json({ error: error.message });
    }
  },
);

router.patch(
  "/:resellerId/reconciliation-old/:reconciliationLogId/approve",
  canFinancials,
  async (req, res) => {
    try {
      const { reconciliationLogId } = req.params;
      const reconciliation = await BillingReconciliation.approveReconciliation(
        parseInt(reconciliationLogId),
        req.user.id,
      );

      res.status(200).json({
        success: true,
        data: reconciliation,
        message: "Reconciliation approved and finalized",
      });
    } catch (error) {
      console.error("[Reconciliation] Error approving:", error.message);
      res.status(500).json({ error: error.message });
    }
  },
);

router.get(
  "/:resellerId/reconciliation-old/report/:period",
  canFinancials,
  async (req, res) => {
    try {
      const { resellerId, period } = req.params;
      const periodDate = new Date(period + "-01");

      const report = await BillingReconciliation.getReconciliationReport(
        parseInt(resellerId),
        periodDate,
      );

      res.status(200).json({
        success: true,
        data: report,
      });
    } catch (error) {
      console.error("[Reconciliation] Error getting report:", error.message);
      res.status(500).json({ error: error.message });
    }
  },
);

router.get(
  "/:resellerId/settlement/statement/:period",
  canFinancials,
  async (req, res) => {
    try {
      const { resellerId, period } = req.params;
      const periodDate = new Date(period + "-01");

      const statement = await BillingReconciliation.getReconciliationReport(
        parseInt(resellerId),
        periodDate,
      );

      const format = req.query.format || "json";

      if (format === "json") {
        res.status(200).json({
          success: true,
          data: statement,
          format: "json",
        });
      } else if (format === "pdf") {
        res.status(501).json({
          error: "PDF export not yet implemented",
        });
      } else {
        res.status(400).json({
          error: "format must be json or pdf",
        });
      }
    } catch (error) {
      console.error("[Settlement] Error getting statement:", error.message);
      res.status(500).json({ error: error.message });
    }
  },
);

// ============================================================================
// Phase 4: Reconciliation Workflow (New Endpoints)
// ============================================================================

// Reconciliation endpoints
router.post(
  "/:resellerId/reconciliation/initiate",
  canFinancials,
  controller.initiateReconciliation,
);

router.get(
  "/:resellerId/reconciliation/list",
  canFinancials,
  controller.getReconciliations,
);

router.get(
  "/:resellerId/reconciliation/:reconciliationId",
  canFinancials,
  controller.getReconciliationDetails,
);

router.post(
  "/:resellerId/reconciliation/:reconciliationId/approve",
  checkReconciliationModifiable,
  canFinancials,
  controller.approveReconciliation,
);

router.post(
  "/:resellerId/reconciliation/:reconciliationId/reject",
  checkReconciliationModifiable,
  canFinancials,
  controller.rejectReconciliation,
);

router.get(
  "/:resellerId/reconciliation/:reconciliationId/report",
  canFinancials,
  controller.downloadReconciliationReport,
);

module.exports = router;
