const { CronJob } = require("cron");
const pool = require("../../utilities/db");
const { getDhakaDate, getDhakaMonthYm } = require("./utils");
const { finalizeResellerBill } = require("./billing");

let job = null;
let status = "idle";
let lastRun = null;
let lastError = null;

const internalAutoFinalize = async (req, res) => {
    if (req.query.secret !== process.env.CRON_SECRET) {
        return res.status(403).json({ message: "Forbidden" });
    }

    console.log("[Cron] internalAutoFinalize: Manual trigger received");
    try {
        await runAutoFinalize();
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

const internalAutoFinalizeStatus = (req, res) => {
    res.json({ status, lastRun, lastError });
};

const runAutoFinalize = async () => {
    const currentStatus = status;
    if (currentStatus === "running") {
        console.log("[Cron] runAutoFinalize: Job is already running. Skipping.");
        return;
    }

    console.log("[Cron] runAutoFinalize: Starting job");
    status = "running";
    lastError = null;

    try {
        const monthYm = getDhakaMonthYm(getDhakaDate().subtract(1, "month"));
        console.log(`[Cron] runAutoFinalize: Processing for month ${monthYm}`)

        const resellers = await pool.query(
            `SELECT id FROM resellers WHERE status = 'active' AND auto_finalize_bill IS TRUE`
        );

        console.log(`[Cron] runAutoFinalize: Found ${resellers.rows.length} resellers to process`);

        const client = await pool.connect();
        try {
            for (const reseller of resellers.rows) {
                try {
                    await client.query("BEGIN");
                    await finalizeResellerBill(client, {
                        resellerId: reseller.id,
                        monthYm,
                        adjustment: 0,
                        adjustmentNote: null,
                        actor: { actorId: null, actorName: "SYSTEM_AUTO", actorRole: "system" },
                        reqMeta: { ip: "127.0.0.1", ua: "system-cron" },
                        source: "auto",
                    });
                    await client.query("COMMIT");
                } catch (error) {
                    await client.query("ROLLBACK");
                    console.error(`[Cron] runAutoFinalize: Failed to finalize bill for reseller ${reseller.id}:`, error.message);
                }
            }
        } finally {
            client.release();
        }

        lastRun = new Date().toISOString();
        status = "idle";
        console.log("[Cron] runAutoFinalize: Job finished");

    } catch (error) {
        console.error("[Cron] runAutoFinalize: Unhandled error in job:", error);
        lastError = error.message;
        status = "error";
    }
};

const syncProjectedBillsForCurrentMonth = async () => {
    // Implementation for syncProjectedBillsForCurrentMonth
};

module.exports = {
    internalAutoFinalize,
    internalAutoFinalizeStatus,
    syncProjectedBillsForCurrentMonth,
};