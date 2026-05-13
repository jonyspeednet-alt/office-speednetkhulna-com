const pool = require("../../utilities/db");
const { 
  parseAmount, 
  getDhakaMonthYm, 
  monthInfo, 
  toDateOnlyString, 
  parseYMD 
} = require("./utils");
const { getActor, getReqMeta } = require("../../utilities/resellerFinancialAudit");

/**
 * Add a payment or billing log entry
 */
const addBillingLog = async (req, res) => {
    try {
        const { 
            reseller_id, 
            amount, 
            note, 
            description, // fallback
            log_type, 
            type, // fallback
            effective_date 
        } = req.body;

        const finalResellerId = parseInt(reseller_id || req.params.resellerId, 10);
        const finalAmount = parseAmount(amount || req.body.transaction_amount, 0);
        const finalNote = String(note || description || req.body.change_desc || "").trim();
        const finalLogType = String(log_type || type || "payment").toLowerCase();
        const finalEffectiveDate = effective_date || new Date();

        if (!finalResellerId || finalAmount <= 0) {
            return res.status(400).json({ message: "Invalid reseller_id or amount" });
        }

        const actor = getActor(req);
        const reqMeta = getReqMeta(req);

        const client = await pool.connect();
        try {
            await client.query("BEGIN");

            // 1. Insert into billing_logs (the primary table for transactions)
            const logResult = await client.query(
                `INSERT INTO billing_logs (reseller_id, transaction_amount, change_desc, effective_date, created_at, log_type)
                 VALUES ($1, $2, $3, $4, NOW(), $5)
                 RETURNING *`,
                [finalResellerId, finalAmount, finalNote, finalEffectiveDate, finalLogType]
            );

            // 2. Insert into reseller_financial_audit_logs
            await client.query(
                `INSERT INTO reseller_financial_audit_logs 
                 (reseller_id, actor_user_id, actor_user_name, actor_role, action_type, reference_table, reference_id, amount_delta, note, request_payload, route_path, http_method, ip_address)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
                [
                    finalResellerId, 
                    actor.actorId, 
                    actor.actorName, 
                    actor.actorRole, 
                    finalLogType === 'discount' ? 'add_discount' : 'add_payment',
                    'billing_logs',
                    logResult.rows[0].id,
                    finalAmount,
                    finalNote,
                    JSON.stringify(req.body),
                    req.originalUrl,
                    req.method,
                    reqMeta.ip
                ]
            );

            await client.query("COMMIT");
            res.status(201).json(logResult.rows[0]);
        } catch (error) {
            await client.query("ROLLBACK");
            throw error;
        } finally {
            client.release();
        }
    } catch (error) {
        console.error("Error in addBillingLog:", error);
        res.status(500).json({ message: error.message || "Internal Server Error" });
    }
};

/**
 * Add a discount (alias for addBillingLog with log_type=discount)
 */
const addDiscount = async (req, res) => {
    req.body.log_type = 'discount';
    if (!req.body.note && req.body.description) req.body.note = req.body.description;
    return addBillingLog(req, res);
};

/**
 * Get billing logs for a reseller
 */
const getBillingLogs = async (req, res) => {
    try {
        const resellerId = req.params.resellerId || req.query.reseller_id;
        if (!resellerId) return res.status(400).json({ message: "resellerId is required" });

        const { start, end, limit = 50, offset = 0 } = req.query;
        let query = `SELECT * FROM billing_logs WHERE reseller_id = $1`;
        const params = [resellerId];

        if (start && end) {
            params.push(start, end);
            query += ` AND effective_date BETWEEN $${params.length - 1} AND $${params.length}`;
        }

        query += ` ORDER BY effective_date DESC, created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
        params.push(parseInt(limit, 10), parseInt(offset, 10));

        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching billing logs:', error);
        res.status(500).json({ message: error.message || 'Internal Server Error' });
    }
};

/**
 * Finalize a reseller's bill for a specific month
 * (Used by resellerController handlers)
 */
const finalizeResellerBill = async (client, { resellerId, monthYm, adjustment, adjustmentNote, actor, reqMeta, source, requestPayload = {} }) => {
    const info = monthInfo(monthYm);
    
    // 1. Check if already finalized in monthly_bills
    const checkResult = await client.query(
        `SELECT id FROM monthly_bills WHERE reseller_id = $1 AND bill_month = $2::date`,
        [resellerId, info.monthStartStr]
    );
    if (checkResult.rows.length > 0) {
        throw new Error(`Bill for ${monthYm} is already finalized (Bill ID: ${checkResult.rows[0].id}).`);
    }

    // 2. Get Reseller Details for calculation
    const resellerResult = await client.query(`SELECT * FROM resellers WHERE id = $1`, [resellerId]);
    const reseller = resellerResult.rows[0];
    if (!reseller) throw new Error("Reseller not found");

    // 3. Calculate Bill Breakdown
    const { calculateMonthlyBillBreakdown } = require("./service");
    let breakdown;

    if (reseller.partner_type === 'channel_partner') {
        const commLogResult = await client.query(
            `SELECT total_collection, net_commission, month FROM channel_commission_logs WHERE reseller_id = $1 AND month = $2`,
            [resellerId, monthYm]
        );
        if (commLogResult.rows.length > 0) {
            const cLog = commLogResult.rows[0];
            const netPayable = Number(cLog.total_collection || 0) - Number(cLog.net_commission || 0);
            breakdown = {
                total: netPayable,
                items: [
                    {
                        desc: `Channel Collection Share (${cLog.month})`,
                        total: netPayable,
                        collection: Number(cLog.total_collection),
                        commission: Number(cLog.net_commission)
                    }
                ]
            };
        } else {
            // Default to bandwidth breakdown or 0
            breakdown = await calculateMonthlyBillBreakdown(resellerId, monthYm, reseller);
        }
    } else {
        breakdown = await calculateMonthlyBillBreakdown(resellerId, monthYm, reseller);
    }

    // 4. Calculate Previous Due
    // Sum of all monthly_bills + adjustments - Sum of all payments/discounts BEFORE this month
    const financialSummary = await client.query(
        `SELECT 
            (SELECT COALESCE(SUM(amount + adjustment), 0) FROM monthly_bills WHERE reseller_id = $1 AND bill_month < $2::date) AS total_billed,
            (SELECT COALESCE(SUM(transaction_amount), 0) FROM billing_logs WHERE reseller_id = $1 AND effective_date < $2::date AND log_type IN ('payment', 'discount')) AS total_paid`,
        [resellerId, info.monthStartStr]
    );
    const previousDue = Number(financialSummary.rows[0].total_billed) - Number(financialSummary.rows[0].total_paid);

    // 5. Insert into monthly_bills
    const billResult = await client.query(
        `INSERT INTO monthly_bills (reseller_id, bill_month, amount, adjustment, adjustment_note, bill_details, previous_due, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
         RETURNING *`,
        [
            resellerId,
            info.monthStartStr,
            breakdown.total,
            adjustment,
            adjustmentNote,
            JSON.stringify(breakdown.items),
            previousDue
        ]
    );

    // 6. Audit Log
    await client.query(
        `INSERT INTO reseller_financial_audit_logs 
         (reseller_id, actor_user_id, actor_user_name, actor_role, action_type, reference_table, reference_id, amount_after, due_before, due_after, note, request_payload, ip_address)
         VALUES ($1, $2, $3, $4, 'finalize_bill', 'monthly_bills', $5, $6, $7, $8, $9, $10, $11)`,
        [
            resellerId,
            actor.actorId,
            actor.actorName,
            actor.actorRole,
            billResult.rows[0].id,
            breakdown.total,
            previousDue,
            previousDue + breakdown.total + adjustment,
            `Finalized bill for ${monthYm}. Source: ${source}`,
            JSON.stringify(requestPayload),
            reqMeta.ip
        ]
    );

    return { 
        success: true, 
        message: `Bill for ${monthYm} finalized successfully.`, 
        bill_id: billResult.rows[0].id,
        amount: breakdown.total 
    };
};

/**
 * Get financial audit logs
 */
const getFinancialAuditLogs = async (req, res) => {
    try {
        const { reseller_id, action_type, start, end, page = 1, limit = 50 } = req.query;
        const params = [];
        const conditions = [];

        if (reseller_id) {
            params.push(parseInt(reseller_id, 10));
            conditions.push(`reseller_id = $${params.length}`);
        }
        if (action_type) {
            params.push(action_type);
            conditions.push(`action_type = $${params.length}`);
        }
        if (start) {
            params.push(start);
            conditions.push(`created_at >= $${params.length}`);
        }
        if (end) {
            params.push(end);
            conditions.push(`created_at <= $${params.length}`);
        }

        const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
        const offset = (Math.max(1, parseInt(page, 10)) - 1) * parseInt(limit, 10);

        const countResult = await pool.query(
            `SELECT COUNT(*)::int AS total FROM reseller_financial_audit_logs ${where}`,
            params
        );

        params.push(parseInt(limit, 10));
        params.push(offset);
        const dataResult = await pool.query(
            `SELECT * FROM reseller_financial_audit_logs ${where}
             ORDER BY created_at DESC
             LIMIT $${params.length - 1} OFFSET $${params.length}`,
            params
        );

        res.json({
            total: countResult.rows[0].total,
            page: parseInt(page, 10),
            limit: parseInt(limit, 10),
            rows: dataResult.rows,
        });
    } catch (error) {
        console.error('Error fetching financial audit logs:', error);
        res.status(500).json({ message: error.message || 'Internal Server Error' });
    }
};

/**
 * Get monthly summary for all resellers
 */
const getMonthlySummary = async (req, res) => {
    try {
        const { month, partner_type } = req.query;
        const targetMonthYm = month ? String(month).slice(0, 7) : getDhakaMonthYm();
        const targetMonthDate = `${targetMonthYm}-01`;
        const info = monthInfo(targetMonthYm);

        // 1. Fetch active resellers with all billing-related columns
        let resellerQuery = `
            SELECT *, 
                   COALESCE(reseller_name, company_name) AS name,
                   COALESCE(previous_month_due, 0)::numeric AS previous_month_due,
                   COALESCE(current_projected_bill, 0)::numeric AS current_projected_bill
            FROM resellers
            WHERE status = 'active'
        `;

        const queryParams = [];
        if (partner_type && partner_type !== 'all') {
            resellerQuery += ` AND partner_type = $1`;
            queryParams.push(partner_type);
        }

        const resellersResult = await pool.query(resellerQuery, queryParams);
        const resellers = resellersResult.rows;

        if (resellers.length === 0) {
            return res.json({ month: targetMonthYm, rows: [], totals: { projected: 0, paid: 0, discount: 0, due: 0 } });
        }

        // 2. Fetch finalized bills for the target month
        const billsResult = await pool.query(
            `SELECT reseller_id, amount, adjustment, previous_due 
             FROM monthly_bills 
             WHERE bill_month = $1`,
            [targetMonthDate]
        );
        const billsMap = billsResult.rows.reduce((acc, b) => {
            acc[b.reseller_id] = b;
            return acc;
        }, {});

        // 3. Fetch payments and discounts from billing_logs for the target month
        const logsResult = await pool.query(
            `SELECT reseller_id, 
                    SUM(CASE WHEN log_type IN ('payment', 'collection') THEN transaction_amount ELSE 0 END) AS paid,
                    SUM(CASE WHEN log_type = 'discount' THEN transaction_amount ELSE 0 END) AS discount
             FROM billing_logs 
             WHERE TO_CHAR(effective_date, 'YYYY-MM') = $1
             GROUP BY reseller_id`,
            [targetMonthYm]
        );
        const logsMap = logsResult.rows.reduce((acc, l) => {
            acc[l.reseller_id] = l;
            return acc;
        }, {});

        // 3.1 Fetch channel partner commission logs for the month
        const channelCommResult = await pool.query(
            `SELECT reseller_id, total_collection, net_commission 
             FROM channel_commission_logs 
             WHERE month = $1`,
            [targetMonthYm]
        );
        const channelCommMap = channelCommResult.rows.reduce((acc, c) => {
            acc[c.reseller_id] = c;
            return acc;
        }, {});

        // 4. Process each reseller in parallel
        const { calculateMonthlyBillBreakdown } = require("./service");
        const isCurrentMonth = targetMonthYm === getDhakaMonthYm();

        const rowPromises = resellers.map(async (r) => {
            const bill = billsMap[r.id];
            const logs = logsMap[r.id] || { paid: 0, discount: 0 };

            let projected = 0;
            let prevDue = 0;

            if (bill) {
                projected = Number(bill.amount || 0) + Number(bill.adjustment || 0);
                prevDue = Number(bill.previous_due || 0);
            } else {
                if (r.partner_type === 'channel_partner') {
                    const cLog = channelCommMap[r.id];
                    if (cLog) {
                        // For Channel Partners, projected bill is (Collection - Partner's Share)
                        projected = Number(cLog.total_collection || 0) - Number(cLog.net_commission || 0);
                    } else {
                        projected = 0;
                    }
                } else if (isCurrentMonth) {
                    try {
                        const breakdown = await calculateMonthlyBillBreakdown(r.id, targetMonthYm, r);
                        projected = Number(breakdown.total || 0);
                    } catch (e) {
                        projected = Number(r.current_projected_bill || 0);
                    }
                } else {
                    projected = Number(r.current_projected_bill || 0);
                }
                prevDue = Number(r.previous_month_due || 0);
            }


            const paid = Number(logs.paid || 0);
            const discount = Number(logs.discount || 0);
            const totalBill = prevDue + projected;
            const newDue = totalBill - paid - discount;

            return {
                id: r.id,
                name: r.name,
                company: r.company_name,
                contact: r.contact,
                projected: projected,
                prev_due: prevDue,
                total_bill: totalBill,
                paid: paid,
                discount: discount,
                new_due: newDue,
                next_pay_date: r.next_pay_date,
            };
        });

        const rows = await Promise.all(rowPromises);
        
        // Calculate grand totals
        const totals = rows.reduce((acc, row) => {
            acc.projected += row.projected;
            acc.paid += row.paid;
            acc.discount += row.discount;
            acc.due += row.new_due;
            return acc;
        }, { projected: 0, paid: 0, discount: 0, due: 0 });

        res.json({
            month: targetMonthYm,
            rows,
            totals
        });
    } catch (error) {
        console.error("getMonthlySummary error:", error);
        res.status(500).json({ message: error.message || "Internal Server Error" });
    }
};

/**
 * Update next pay date from monthly summary
 */
const updateMonthlySummaryPayDate = async (req, res) => {
    try {
        const { reseller_id, date } = req.body;
        if (!reseller_id) return res.status(400).json({ message: "reseller_id is required" });

        await pool.query(
            `UPDATE resellers SET next_pay_date = $1, updated_at = NOW() WHERE id = $2`,
            [date || null, reseller_id]
        );

        res.json({ success: true, message: "Pay date updated" });
    } catch (error) {
        console.error("updateMonthlySummaryPayDate error:", error);
        res.status(500).json({ message: error.message || "Internal Server Error" });
    }
};

module.exports = {
    addBillingLog,
    addDiscount,
    getBillingLogs,
    getMonthlySummary,
    updateMonthlySummaryPayDate,
    finalizeResellerBill,
    getFinancialAuditLogs,
};