const pool = require("../../utilities/db");
const { getActor, getReqMeta } = require("../../utilities/resellerFinancialAudit");
const { listResellers, createReseller, getResellerProfile } = require("./reseller/profile");
const { getResellerProfileDetails } = require("./reseller/details");
const { updateReseller } = require("./reseller/update");
const { getStatusNoc } = require("./reseller/status");
const { createBandwidthRequest, listBandwidthRequests, reviewBandwidthRequest, applyApprovedRequest } = require("./reseller/bandwidth");
const { getBillingLogs, addBillingLog, addDiscount, getMonthlySummary, updateMonthlySummaryPayDate, finalizeResellerBill } = require("./reseller/billing");
const { getInvoice, getInvoiceByBillId, sendInvoiceEmailByReseller, sendInvoiceEmailByBillId } = require("./reseller/invoice");
const { getPartnerSheetList, ingestPartnerSheetWebhook } = require("./reseller/sheets");
const { syncProjectedBillsForCurrentMonth, internalAutoFinalize, internalAutoFinalizeStatus } = require("./reseller/automation");
const { changeResellerRate, getResellerRateChangeLogs } = require("./reseller/rateChange");
const { initialize } = require("./reseller/dbSetup");
const { getDhakaMonthYm, parseAmount } = require("./reseller/utils");

const runFinalize = async (req, res) => {
    try {
        await initialize();
        const resellerId = req.params.resellerId;
        const monthYm = String(req.body.month || getDhakaMonthYm()).slice(0, 7);
        const adjustment = parseAmount(req.body.adjustment, 0);
        const adjustmentNote = adjustment !== 0 ? String(req.body.adjustment_note || "").trim() : null;
        if (adjustment !== 0 && !adjustmentNote) {
            return res.status(400).json({ message: "Adjustment note is required for non-zero adjustment" });
        }

        const actor = getActor(req);
        const reqMeta = getReqMeta(req);

        const client = await pool.connect();
        try {
            await client.query("BEGIN");
            const result = await finalizeResellerBill(client, {
                resellerId,
                monthYm,
                adjustment,
                adjustmentNote,
                actor,
                reqMeta,
                source: "manual",
                requestPayload: { ...req.body },
            });
            await client.query("COMMIT");
            res.json(result);
        } catch (error) {
            await client.query("ROLLBACK");
            throw error;
        } finally {
            client.release();
        }
    } catch (error) {
        console.error("runFinalize POST handler:", error);
        res.status(500).json({ message: error.message });
    }
};

module.exports = {
    listResellers,
    createReseller,
    getResellerProfile,
    getResellerProfileDetails,
    updateReseller,
    getStatusNoc,
    createBandwidthRequest,
    listBandwidthRequests,
    reviewBandwidthRequest,
    applyApprovedRequest,
    getBillingLogs,
    addBillingLog,
    addDiscount,
    getMonthlySummary,
    updateMonthlySummaryPayDate,
    runFinalize,
    getInvoice,
    getInvoiceByBillId,
    sendInvoiceEmailByReseller,
    sendInvoiceEmailByBillId,
    getPartnerSheetList,
    ingestPartnerSheetWebhook,
    syncProjectedBillsForCurrentMonth,
    internalAutoFinalize,
    internalAutoFinalizeStatus,
    changeResellerRate,
    getResellerRateChangeLogs,
    initialize,
};