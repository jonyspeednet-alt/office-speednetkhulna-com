const pool = require("../../utilities/db");
const { initialize } = require("./dbSetup");
const { finalizeResellerBill, refreshProjectedBillForCurrentMonth } = require("./billing");
const { normalizeMonthYm, getDefaultAutoFinalizeMonthYm } = require("./utils");

const INTERNAL_AUTOMATION_TOKEN = String(process.env.INTERNAL_AUTOMATION_TOKEN || "").trim();
const AUTO_FINALIZE_DEFAULT_BATCH = Math.max(Number.parseInt(process.env.AUTO_FINALIZE_BATCH_SIZE || "200", 10) || 200, 1);

const isInternalLocalRequest = (req) => {
    const ip = String(req.ip || req.connection?.remoteAddress || "").trim();
    if (ip === "127.0.0.1" || ip === "::1") return true;
    if (ip.endsWith(":127.0.0.1")) return true;
    return false;
};

const syncProjectedBillsForCurrentMonth = async () => {
    await initialize();
    const monthYm = getDhakaMonthYm();
    const monthStart = `${monthYm}-01`;
    const monthBillCheck = await pool.query(`SELECT reseller_id FROM monthly_bills WHERE bill_month = $1::date`, [monthStart]);
    const finalizedResellerIds = new Set(monthBillCheck.rows.map((row) => Number(row.reseller_id)));

    const resellersResult = await pool.query(`SELECT id FROM resellers ORDER BY id ASC`);

    const results = [];
    for (const row of resellersResult.rows) {
        const resellerId = Number(row.id);
        try {
            const projected = await refreshProjectedBillForCurrentMonth(resellerId);
            results.push({
                reseller_id: resellerId,
                status: "ok",
                finalized: finalizedResellerIds.has(resellerId),
                projected_bill: projected,
            });
        } catch (error) {
            results.push({
                reseller_id: resellerId,
                status: "failed",
                finalized: finalizedResellerIds.has(resellerId),
                error: error.message,
            });
        }
    }

    return {
        month: monthYm,
        total: results.length,
        updated: results.filter((item) => item.status === "ok").length,
        failed: results.filter((item) => item.status !== "ok").length,
        results,
    };
};

const runAutoFinalizeMonth = async ({ monthYm, initiator = "system", source = "scheduler", actor = null, reqMeta = null }) => {
    const client = await pool.connect();
    const summary = {
        run_id: null,
        month: monthStartDateFromYm(monthYm),
        processed_count: 0,
        success_count: 0,
        failed_count: 0,
        already_count: 0,
        failures: [],
    };

    try {
        await initialize();

        const lockResult = await client.query(`SELECT pg_try_advisory_lock(hashtext($1)) AS locked`, [`billing-auto-finalize:${monthYm}`]);
        if (!lockResult.rows[0]?.locked) {
            throw new Error(`Another auto-finalize process is active for ${monthYm}`);
        }

        const completedRun = await client.query(
            `SELECT id FROM billing_finalize_runs WHERE run_month = $1::date AND status = 'completed' ORDER BY id DESC LIMIT 1`,
            [monthStartDateFromYm(monthYm)],
        );
        if (completedRun.rows.length) {
            summary.run_id = completedRun.rows[0].id;
            return { ...summary, status: "already_completed" };
        }

        const runInsert = await client.query(
            `INSERT INTO billing_finalize_runs (run_month, status, initiator, source, started_at) VALUES ($1::date, 'running', $2, $3, NOW()) RETURNING id`,
            [monthStartDateFromYm(monthYm), initiator, source],
        );
        summary.run_id = runInsert.rows[0].id;

        const activeResellers = await client.query(`SELECT id FROM resellers WHERE LOWER(COALESCE(status, 'active')) = 'active' ORDER BY id ASC`);

        for (let i = 0; i < activeResellers.rows.length; i += AUTO_FINALIZE_DEFAULT_BATCH) {
            const chunk = activeResellers.rows.slice(i, i + AUTO_FINALIZE_DEFAULT_BATCH);
            for (const row of chunk) {
                summary.processed_count += 1;
                try {
                    await client.query("BEGIN");
                    const result = await finalizeResellerBill(client, {
                        resellerId: row.id,
                        monthYm,
                        adjustment: 0,
                        adjustmentNote: null,
                        actor: actor || { actor_user_id: null, actor_user_name: initiator, actor_role: source },
                        reqMeta: reqMeta || {},
                        source: "auto",
                        requestPayload: { month: monthYm, source },
                    });

                    if (result.status === "finalized") {
                        summary.success_count += 1;
                        await client.query(
                            `INSERT INTO billing_finalize_run_items (run_id, reseller_id, status, bill_id, message) VALUES ($1, $2, $3, $4, $5)`,
                            [summary.run_id, row.id, "success", result.bill_id, "Finalized"],
                        );
                    } else if (result.status === "already_finalized") {
                        summary.already_count += 1;
                        await client.query(
                            `INSERT INTO billing_finalize_run_items (run_id, reseller_id, status, bill_id, message) VALUES ($1, $2, $3, $4, $5)`,
                            [summary.run_id, row.id, "already", result.bill_id || null, result.message || "Already finalized"],
                        );
                    } else {
                        summary.failed_count += 1;
                        const failMessage = result.message || result.status || "Failed";
                        summary.failures.push({ reseller_id: row.id, message: failMessage });
                        await client.query(
                            `INSERT INTO billing_finalize_run_items (run_id, reseller_id, status, bill_id, message) VALUES ($1, $2, $3, NULL, $4)`,
                            [summary.run_id, row.id, "failed", failMessage],
                        );
                    }
                    await client.query("COMMIT");
                } catch (itemError) {
                    await client.query("ROLLBACK");
                    summary.failed_count += 1;
                    summary.failures.push({ reseller_id: row.id, message: itemError.message });
                    await client.query(
                        `INSERT INTO billing_finalize_run_items (run_id, reseller_id, status, bill_id, message) VALUES ($1, $2, $3, NULL, $4)`,
                        [summary.run_id, row.id, "failed", itemError.message],
                    );
                }
            }
        }

        await client.query(
            `UPDATE billing_finalize_runs
       SET status = $2,
           processed = $3,
           success = $4,
           failed = $5,
           ended_at = NOW(),
           error_summary = $6
       WHERE id = $1`,
            [
                summary.run_id,
                summary.failed_count > 0 ? "partial" : "completed",
                summary.processed_count,
                summary.success_count,
                summary.failed_count,
                summary.failures.length ? JSON.stringify(summary.failures.slice(0, 20)) : null,
            ],
        );

        return summary;
    } finally {
        try {
            await client.query(`SELECT pg_advisory_unlock(hashtext($1))`, [`billing-auto-finalize:${monthYm}`]);
        } catch (_) {}
        client.release();
    }
};

const internalAutoFinalize = async (req, res) => {
    try {
        await initialize();
        if (!INTERNAL_AUTOMATION_TOKEN) {
            return res.status(503).json({ message: "Internal automation token is not configured" });
        }
        const token = String(req.headers["x-internal-token"] || "").trim();
        if (!token || token !== INTERNAL_AUTOMATION_TOKEN) {
            return res.status(401).json({ message: "Invalid internal token" });
        }
        if (!isInternalLocalRequest(req)) {
            return res.status(403).json({ message: "Only localhost requests are allowed" });
        }

        const requestedMonth = normalizeMonthYm(req.body?.month || req.query?.month);
        const monthYm = requestedMonth || getDefaultAutoFinalizeMonthYm();
        const summary = await runAutoFinalizeMonth({
            monthYm,
            initiator: "internal-api",
            source: "scheduler",
            actor: { actor_user_id: null, actor_user_name: "system", actor_role: "system" },
            reqMeta: { ip_address: req.ip || null, user_agent: req.headers["user-agent"] || null, request_id: null },
        });

        res.json({
            run_id: summary.run_id,
            month: summary.month,
            processed_count: summary.processed_count,
            success_count: summary.success_count,
            failed_count: summary.failed_count,
            already_count: summary.already_count,
            failures: summary.failures.slice(0, 10),
        });
    } catch (error) {
        console.error("internalAutoFinalize:", error);
        res.status(500).json({ message: "Auto finalize failed", error: error.message });
    }
};

const internalAutoFinalizeStatus = async (req, res) => {
    try {
        await initialize();
        if (!INTERNAL_AUTOMATION_TOKEN) {
            return res.status(503).json({ message: "Internal automation token is not configured" });
        }
        const token = String(req.headers["x-internal-token"] || "").trim();
        if (!token || token !== INTERNAL_AUTOMATION_TOKEN) {
            return res.status(401).json({ message: "Invalid internal token" });
        }
        if (!isInternalLocalRequest(req)) {
            return res.status(403).json({ message: "Only localhost requests are allowed" });
        }

        const runId = Number(req.query?.run_id || req.params?.runId || 0);
        if (!runId) return res.status(400).json({ message: "run_id is required" });

        const runResult = await pool.query(
            `SELECT id, run_month, started_at, ended_at, status, processed, success, failed, initiator, source, error_summary
       FROM billing_finalize_runs
       WHERE id = $1
       LIMIT 1`,
            [runId],
        );
        if (!runResult.rows.length) return res.status(404).json({ message: "Run not found" });

        const itemsResult = await pool.query(
            `SELECT reseller_id, status, bill_id, message, created_at
       FROM billing_finalize_run_items
       WHERE run_id = $1
       ORDER BY id DESC
       LIMIT 100`,
            [runId],
        );

        res.json({
            run: runResult.rows[0],
            items: itemsResult.rows,
        });
    } catch (error) {
        console.error("internalAutoFinalizeStatus:", error);
        res.status(500).json({ message: "Failed to load auto finalize status" });
    }
};


module.exports = {
    syncProjectedBillsForCurrentMonth,
    internalAutoFinalize,
    internalAutoFinalizeStatus,
};