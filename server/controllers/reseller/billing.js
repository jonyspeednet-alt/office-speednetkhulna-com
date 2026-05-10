const pool = require("../../utilities/db");
const { getDhakaDate, getDhakaMonthYm, parseAmount, getMonthYear, getStartOfMonth, getEndOfMonth } = require("./utils");
const { getActor, getReqMeta } = require("../../utilities/resellerFinancialAudit");


const addBillingLog = async (req, res) => {
    try {
        const { reseller_id, amount, description, type, category } = req.body;

        if (!reseller_id || !amount || !description || !type || !category) {
            return res.status(400).json({ message: "Missing required fields" });
        }

        const parsedAmount = parseAmount(amount);
        if (isNaN(parsedAmount)) {
            return res.status(400).json({ message: "Invalid amount" });
        }

        const actor = getActor(req);
        const reqMeta = getReqMeta(req);

        const client = await pool.connect();
        try {
            await client.query("BEGIN");
            const result = await client.query(
                `INSERT INTO reseller_billing_log (reseller_id, amount, description, type, category, actor_id, actor_name, created_at, ip, user_agent)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), $8, $9) RETURNING *`,
                [reseller_id, parsedAmount, description, type, category, actor.actorId, actor.actorName, reqMeta.ip, reqMeta.ua]
            );
            await client.query("COMMIT");
            res.status(201).json(result.rows[0]);
        } catch (error) {
            await client.query("ROLLBACK");
            throw error;
        } finally {
            client.release();
        }
    } catch (error) {
        console.error("Error in addBillingLog:", error);
        res.status(500).json({ message: "Internal Server Error" });
    }
};

const addDiscount = async (req, res) => {
    req.body.type = 'credit';
    req.body.category = 'discount';
    // Ensure description is not empty or use a default
    if (!req.body.description) {
        req.body.description = 'Discount applied';
    }
    return addBillingLog(req, res);
};


const getBillingLogs = async (req, res) => {
    try {
        const { resellerId } = req.params;
        const { start, end } = req.query;
        let query = 'SELECT * FROM reseller_billing_log WHERE reseller_id = $1';
        const params = [resellerId];

        if (start && end) {
            query += ' AND created_at BETWEEN $2 AND $3';
            params.push(start, end);
        }

        query += ' ORDER BY created_at DESC';

        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching billing logs:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};


const getMonthlySummary = async (req, res) => {
    try {
        const { resellerId } = req.params;
        const { month } = req.query; // YYYY-MM format

        if (!month) {
            return res.status(400).json({ message: "Month query parameter is required" });
        }

        const { y, m } = getMonthYear(month);
        const startDate = getStartOfMonth(y, m).toISOString();
        const endDate = getEndOfMonth(y, m).toISOString();

        const summaryQuery = `
            SELECT
                (SELECT COALESCE(SUM(amount), 0) FROM reseller_billing_log WHERE reseller_id = $1 AND type = 'debit' AND category = 'mrc' AND created_at >= $2 AND created_at <= $3) AS monthly_bill,
                (SELECT COALESCE(SUM(amount), 0) FROM reseller_billing_log WHERE reseller_id = $1 AND type = 'debit' AND category = 'previous_due' AND created_at >= $2 AND created_at <= $3) AS previous_due,
                (SELECT COALESCE(SUM(amount), 0) FROM reseller_billing_log WHERE reseller_id = $1 AND type = 'credit' AND category = 'payment' AND created_at >= $2 AND created_at <= $3) AS total_paid,
                (SELECT COALESCE(SUM(amount), 0) FROM reseller_billing_log WHERE reseller_id = $1 AND type = 'credit' AND category = 'discount' AND created_at >= $2 AND created_at <= $3) AS total_discount,
                (SELECT pay_date FROM reseller_monthly_bill_summary WHERE reseller_id = $1 AND month_ym = $4) AS pay_date
        `;

        const summaryResult = await pool.query(summaryQuery, [resellerId, startDate, endDate, `${y}-${m}`]);

        const summary = summaryResult.rows[0];
        const netPayable = (parseFloat(summary.monthly_bill) || 0) + (parseFloat(summary.previous_due) || 0);
        const totalCredit = (parseFloat(summary.total_paid) || 0) + (parseFloat(summary.total_discount) || 0);
        const currentDue = netPayable - totalCredit;

        res.json({
            ...summary,
            net_payable: netPayable,
            current_due: currentDue
        });

    } catch (error) {
        console.error('Error fetching monthly summary:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};

const updateMonthlySummaryPayDate = async (req, res) => {
    try {
        const { resellerId, month, pay_date } = req.body;
        if (!resellerId || !month || !pay_date) {
            return res.status(400).json({ message: "resellerId, month, and pay_date are required" });
        }

        const { y, m } = getMonthYear(month);
        const monthYm = `${y}-${m}`;

        // Upsert logic
        const query = `
            INSERT INTO reseller_monthly_bill_summary (reseller_id, month_ym, pay_date)
            VALUES ($1, $2, $3)
            ON CONFLICT (reseller_id, month_ym)
            DO UPDATE SET pay_date = $3, updated_at = NOW();
        `;
        await pool.query(query, [resellerId, monthYm, pay_date]);

        res.json({ success: true, message: 'Pay date updated successfully.' });

    } catch (error) {
        console.error('Error updating pay date:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};


const finalizeResellerBill = async (client, { resellerId, monthYm, adjustment, adjustmentNote, actor, reqMeta, source, requestPayload = {} }) => {

    const { y, m } = getMonthYear(monthYm);
    const startOfMonth = getStartOfMonth(y, m);
    const endOfMonth = getEndOfMonth(y, m);

    // 1. Check if bill for this month is already finalized
    const checkFinalized = await client.query(
        `SELECT 1 FROM reseller_billing_log WHERE reseller_id = $1 AND category = 'mrc_finalized' AND created_at BETWEEN $2 AND $3`,
        [resellerId, startOfMonth.toISOString(), endOfMonth.toISOString()]
    );
    if (checkFinalized.rows.length > 0) {
        throw new Error(`Bill for ${monthYm} is already finalized.`);
    }

    // 2. Calculate projected MRC
    const mrcResult = await client.query(
        `SELECT COALESCE(SUM(monthly_mrc), 0) AS total_mrc FROM packages WHERE reseller_id = $1 AND status = 'active'`,
        [resellerId]
    );
    const projectedMrc = parseFloat(mrcResult.rows[0].total_mrc);

    // 3. Calculate previous due (Net due from all time up to the start of the billing month)
    const dueResult = await client.query(
        `SELECT
            (SELECT COALESCE(SUM(amount), 0) FROM reseller_billing_log WHERE reseller_id = $1 AND type = 'debit' AND created_at < $2) -
            (SELECT COALESCE(SUM(amount), 0) FROM reseller_billing_log WHERE reseller_id = $1 AND type = 'credit' AND created_at < $2) AS previous_due`,
        [resellerId, startOfMonth.toISOString()]
    );
    const previousDue = parseFloat(dueResult.rows[0].previous_due);

    // 4. Log the finalization event
    await client.query(
        `INSERT INTO reseller_bill_finalization_log (reseller_id, month_ym, projected_mrc, previous_due, adjustment, adjustment_note, actor_id, actor_name, ip, user_agent, source, request_payload)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [resellerId, monthYm, projectedMrc, previousDue, adjustment, adjustmentNote, actor.actorId, actor.actorName, reqMeta.ip, reqMeta.ua, source, requestPayload]
    );

    const logTimestamp = endOfMonth.toISOString();

    // 5. Insert billing log for MRC (Debit)
    if (projectedMrc > 0) {
        await client.query(
            `INSERT INTO reseller_billing_log (reseller_id, amount, description, type, category, actor_id, actor_name, created_at, ip, user_agent)
             VALUES ($1, $2, $3, 'debit', 'mrc_finalized', $4, $5, $6, $7, $8)`,
            [resellerId, projectedMrc, `Monthly Bill for ${monthYm}`, actor.actorId, actor.actorName, logTimestamp, reqMeta.ip, reqMeta.ua]
        );
    }

    // 6. Insert billing log for Previous Due (Debit)
    if (previousDue > 0) {
        await client.query(
            `INSERT INTO reseller_billing_log (reseller_id, amount, description, type, category, actor_id, actor_name, created_at, ip, user_agent)
             VALUES ($1, $2, $3, 'debit', 'previous_due', $4, $5, $6, $7, $8)`,
            [resellerId, previousDue, `Previous due carried over to ${monthYm}`, actor.actorId, actor.actorName, logTimestamp, reqMeta.ip, reqMeta.ua]
        );
    }

    // 7. Insert billing log for Adjustment (Debit/Credit)
    if (adjustment !== 0) {
        const adjType = adjustment > 0 ? 'debit' : 'credit';
        const adjAmount = Math.abs(adjustment);
        await client.query(
            `INSERT INTO reseller_billing_log (reseller_id, amount, description, type, category, actor_id, actor_name, created_at, ip, user_agent)
             VALUES ($1, $2, $3, $4, 'adjustment', $5, $6, $7, $8, $9)`,
            [resellerId, adjAmount, adjustmentNote, adjType, actor.actorId, actor.actorName, logTimestamp, reqMeta.ip, reqMeta.ua]
        );
    }

    // 8. Upsert monthly summary
    await client.query(
        `INSERT INTO reseller_monthly_bill_summary (reseller_id, month_ym, final_mrc, previous_due, adjustment)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (reseller_id, month_ym)
         DO UPDATE SET final_mrc = $3, previous_due = $4, adjustment = $5, updated_at = NOW()`,
        [resellerId, monthYm, projectedMrc, previousDue, adjustment]
    );

    return { success: true, message: `Bill for ${monthYm} finalized successfully.` };
};


module.exports = {
    addBillingLog,
    addDiscount,
    getBillingLogs,
    getMonthlySummary,
    updateMonthlySummaryPayDate,
    finalizeResellerBill
};