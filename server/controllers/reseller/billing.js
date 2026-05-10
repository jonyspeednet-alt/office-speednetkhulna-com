const pool = require("../../utilities/db");
const {
    getActor,
    getReqMeta,
    logResellerFinancialChange,
} = require("../../utilities/resellerFinancialAudit");
const { calculateMonthlyBillBreakdown } = require("./service");
const {
    parseAmount,
    getDhakaMonthYm,
    monthStartDateFromYm,
    nextMonthYm,
    extractYm,
} = require("./utils");
const { initialize, joiningDateExpr } = require("./dbSetup");

const monthlySummaryCache = new Map();
const isProdEnv = String(process.env.APP_ENV || process.env.NODE_ENV || "").toLowerCase() === "production";
const MONTHLY_SUMMARY_CACHE_TTL_MS = Math.max(
    Number.parseInt(process.env.MONTHLY_SUMMARY_CACHE_TTL_MS || (isProdEnv ? "120000" : "30000"), 10) || (isProdEnv ? 120000 : 30000),
    5000,
);

const cacheKeyMonthlySummary = (month) => `monthly_summary:${String(month || "").slice(0, 7)}`;
const cacheKeyMonthlySummaryByPartner = (month, partnerType = "") => `${cacheKeyMonthlySummary(month)}:${partnerType || "all"}`;

const getMonthlySummaryCachedByPartner = (month, partnerType = "") => {
    const key = cacheKeyMonthlySummaryByPartner(month, partnerType);
    const hit = monthlySummaryCache.get(key);
    if (!hit) return null;
    if (hit.expiresAt <= Date.now()) {
        monthlySummaryCache.delete(key);
        return null;
    }
    return hit.payload;
};

const setMonthlySummaryCachedByPartner = (month, partnerType, payload) => {
    const key = cacheKeyMonthlySummaryByPartner(month, partnerType);
    monthlySummaryCache.set(key, {
        payload,
        expiresAt: Date.now() + MONTHLY_SUMMARY_CACHE_TTL_MS,
    });
};

const invalidateMonthlySummaryCache = (month = null) => {
    const ym = extractYm(month);
    if (!ym) {
        monthlySummaryCache.clear();
        return;
    }
    monthlySummaryCache.delete(cacheKeyMonthlySummary(ym));
    for (const key of monthlySummaryCache.keys()) {
        if (key.startsWith(`${cacheKeyMonthlySummary(ym)}:`)) {
            monthlySummaryCache.delete(key);
        }
    }
};

const getBillingLogs = async (req, res) => {
    try {
        await initialize();
        const resellerId = req.query.reseller_id;
        const params = [];
        let where = "";

        if (resellerId) {
            params.push(resellerId);
            where = "WHERE bl.reseller_id = $1";
        }

        const result = await pool.query(
            `SELECT
        bl.id,
        bl.reseller_id,
        r.user_id AS reseller_code,
        COALESCE(r.reseller_name, r.company_name) AS reseller_name,
        COALESCE(to_jsonb(bl)->>'log_type', CASE WHEN LOWER(COALESCE(bl.change_desc,'')) LIKE 'discount:%' THEN 'discount' WHEN COALESCE(bl.transaction_amount,0) > 0 THEN 'payment' ELSE 'adjustment' END) AS log_type,
        bl.transaction_amount AS amount,
        bl.change_desc AS note,
        bl.effective_date,
        bl.created_at
       FROM billing_logs bl
       JOIN resellers r ON r.id = bl.reseller_id
       ${where}
       ORDER BY bl.id DESC
       LIMIT 500`,
            params,
        );

        res.json(result.rows);
    } catch (error) {
        console.error("getBillingLogs:", error);
        res.status(500).json({ message: "Failed to load billing logs" });
    }
};

const addBillingLog = async (req, res) => {
    const client = await pool.connect();
    try {
        await initialize();
        const { reseller_id, log_type, amount, note, effective_date } = req.body;
        if (!reseller_id) {
            return res.status(400).json({ message: "reseller_id is required" });
        }

        const normalizedType = String(log_type || "payment").trim().toLowerCase();
        const parsedAmount = parseAmount(amount, 0);
        if (!["payment", "discount", "adjustment"].includes(normalizedType)) {
            return res.status(400).json({ message: "Invalid log_type" });
        }
        if ((normalizedType === "payment" || normalizedType === "discount") && parsedAmount <= 0) {
            return res.status(400).json({ message: "amount must be greater than 0" });
        }
        const effDate = effective_date || new Date().toISOString();
        await client.query("BEGIN");
        const actor = getActor(req);
        const reqMeta = getReqMeta(req);

        const dueBeforeResult = await client.query(`SELECT COALESCE(previous_month_due,0)::numeric AS due FROM resellers WHERE id = $1 FOR UPDATE`, [reseller_id]);
        const dueBefore = parseAmount(dueBeforeResult.rows[0]?.due, 0);

        const hasLogTypeResult = await client.query(
            `SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'billing_logs'
          AND column_name = 'log_type'
      ) AS has_log_type`,
        );
        const hasLogTypeColumn = !!hasLogTypeResult.rows[0]?.has_log_type;

        const result = hasLogTypeColumn
            ? await client.query(
                  `INSERT INTO billing_logs (reseller_id, request_id, log_type, change_desc, transaction_amount, effective_date, created_at)
           VALUES ($1, NULL, $2, $3, $4, $5, NOW()) RETURNING *`,
                  [reseller_id, normalizedType, note || normalizedType, parsedAmount, effDate],
              )
            : await client.query(
                  `INSERT INTO billing_logs (reseller_id, request_id, change_desc, transaction_amount, effective_date, created_at)
           VALUES ($1, NULL, $2, $3, $4, NOW()) RETURNING *`,
                  [reseller_id, note || normalizedType, parsedAmount, effDate],
              );

        await logResellerFinancialChange(client, {
            reseller_id: Number(reseller_id),
            ...actor,
            ...reqMeta,
            action_type: normalizedType === "discount" ? "ADD_BILLING_DISCOUNT_ENTRY" : "ADD_BILLING_LOG_ENTRY",
            reference_table: "billing_logs",
            reference_id: result.rows[0]?.id || null,
            amount_before: 0,
            amount_after: parsedAmount,
            amount_delta: parsedAmount,
            due_before: dueBefore,
            due_after: dueBefore,
            due_delta: 0,
            field_changes: {
                log_type: normalizedType,
                transaction_amount: parsedAmount,
            },
            note: note || null,
            request_payload: { reseller_id, log_type, amount, effective_date },
        });

        await client.query("COMMIT");
        invalidateMonthlySummaryCache(extractYm(effDate));
        res.status(201).json(result.rows[0]);
    } catch (error) {
        await client.query("ROLLBACK");
        console.error("addBillingLog:", error);
        res.status(500).json({ message: "Failed to add billing log" });
    } finally {
        client.release();
    }
};

const addDiscount = async (req, res) => {
    try {
        await initialize();
        const resellerId = Number(req.params?.id || req.body?.reseller_id || 0);
        const amount = parseAmount(req.body?.amount, 0);
        const note = String(req.body?.note || "").trim();
        const effectiveDateRaw = String(req.body?.effective_date || "").trim();

        if (!resellerId) return res.status(400).json({ message: "Invalid reseller id" });
        if (amount <= 0) return res.status(400).json({ message: "Discount amount must be greater than 0" });
        if (note.length < 3) return res.status(400).json({ message: "Discount note is required" });

        req.body = {
            reseller_id: resellerId,
            log_type: "discount",
            amount,
            note: `Discount: ${note}`,
            effective_date: effectiveDateRaw || new Date().toISOString(),
        };
        return addBillingLog(req, res);
    } catch (error) {
        console.error("addDiscount:", error);
        return res.status(500).json({ message: "Failed to add discount" });
    }
};

const getMonthlySummary = async (req, res) => {
    try {
        await initialize();
        const startedAt = Date.now();
        const rawMonth = String(req.query.month || getDhakaMonthYm());
        const selectedMonth = rawMonth.slice(0, 7);
        const monthStart = `${selectedMonth}-01`;
        const partnerTypeFilter = normalizePartnerType(req.query.partner_type || "");
        const cached = getMonthlySummaryCachedByPartner(selectedMonth, partnerTypeFilter);
        if (cached) {
            const elapsedMs = Date.now() - startedAt;
            console.log(`[MonthlySummary] month=${selectedMonth} row_count=${cached.rows?.length || 0} cache_hit=true monthly_summary_ms=${elapsedMs}`);
            return res.json({
                ...cached,
                meta: {
                    generated_at: new Date().toISOString(),
                    cache_hit: true,
                },
            });
        }

        const dataResult = await pool.query(
            `WITH active_resellers AS (
         SELECT
           r.id,
           COALESCE(r.reseller_name, r.company_name) AS name,
           r.company_name,
           r.contact_no,
           ${hasResellerPartnerTypeColumn() ? `${normalizedPartnerTypeSql("COALESCE(r.partner_type, '')")}` : `'distribution_partner'`} AS partner_type,
           COALESCE(r.previous_month_due, 0)::numeric AS previous_month_due,
           COALESCE(r.current_projected_bill, 0)::numeric AS current_projected_bill,
           r.next_pay_date
         FROM resellers r
         WHERE COALESCE(r.status, 'active') = 'active'
           ${partnerTypeFilter ? `AND ${hasResellerPartnerTypeColumn() ? normalizedPartnerTypeSql("COALESCE(r.partner_type, '')") : `'distribution_partner'`} = $3` : ""}
       ),
       month_bills AS (
         SELECT
           mb.reseller_id,
           COALESCE(mb.amount, 0)::numeric AS amount,
           COALESCE(mb.previous_due, 0)::numeric AS previous_due,
           COALESCE(mb.adjustment, 0)::numeric AS adjustment
         FROM monthly_bills mb
         WHERE mb.bill_month = $1::date
       ),
       latest_bills AS (
         SELECT DISTINCT ON (mb.reseller_id)
           mb.reseller_id,
           COALESCE(mb.amount, 0)::numeric AS amount,
           COALESCE(mb.adjustment, 0)::numeric AS adjustment
         FROM monthly_bills mb
         WHERE mb.bill_month < $1::date
         ORDER BY mb.reseller_id, mb.bill_month DESC
       ),
       month_logs AS (
         SELECT
           bl.reseller_id,
           COALESCE(SUM(bl.transaction_amount) FILTER (WHERE COALESCE(to_jsonb(bl)->>'log_type', CASE WHEN LOWER(COALESCE(bl.change_desc,'')) LIKE 'discount:%' THEN 'discount' WHEN COALESCE(bl.transaction_amount,0) > 0 THEN 'payment' ELSE 'adjustment' END) = 'payment'), 0)::numeric AS paid,
           COALESCE(SUM(bl.transaction_amount) FILTER (WHERE COALESCE(to_jsonb(bl)->>'log_type', CASE WHEN LOWER(COALESCE(bl.change_desc,'')) LIKE 'discount:%' THEN 'discount' WHEN COALESCE(bl.transaction_amount,0) > 0 THEN 'payment' ELSE 'adjustment' END) = 'discount'), 0)::numeric AS discount
         FROM billing_logs bl
         WHERE TO_CHAR(COALESCE(bl.effective_date, bl.created_at), 'YYYY-MM') = $2
         GROUP BY bl.reseller_id
       )
       SELECT
         ar.id,
         ar.name,
         ar.company_name AS company,
         ar.contact_no AS contact,
         ar.partner_type,
         CASE
           WHEN mb.reseller_id IS NOT NULL THEN COALESCE(mb.amount, 0) + COALESCE(mb.adjustment, 0)
           ELSE COALESCE(NULLIF(ar.current_projected_bill, 0), COALESCE(lb.amount, 0) + COALESCE(lb.adjustment, 0), 0)
         END::numeric AS projected,
         COALESCE(mb.previous_due, ar.previous_month_due, 0)::numeric AS prev_due,
         (COALESCE(mb.previous_due, ar.previous_month_due, 0) + CASE WHEN mb.reseller_id IS NOT NULL THEN COALESCE(mb.amount, 0) + COALESCE(mb.adjustment, 0) ELSE COALESCE(NULLIF(ar.current_projected_bill, 0), COALESCE(lb.amount, 0) + COALESCE(lb.adjustment, 0), 0) END)::numeric AS total_bill,
         COALESCE(ml.paid, 0)::numeric AS paid,
         COALESCE(ml.discount, 0)::numeric AS discount,
         (COALESCE(mb.previous_due, ar.previous_month_due, 0) + CASE WHEN mb.reseller_id IS NOT NULL THEN COALESCE(mb.amount, 0) + COALESCE(mb.adjustment, 0) ELSE COALESCE(NULLIF(ar.current_projected_bill, 0), COALESCE(lb.amount, 0) + COALESCE(lb.adjustment, 0), 0) END - COALESCE(ml.paid, 0) - COALESCE(ml.discount, 0))::numeric AS new_due,
         ar.next_pay_date,
         (mb.reseller_id IS NOT NULL) AS is_generated
       FROM active_resellers ar
       LEFT JOIN month_bills mb ON mb.reseller_id = ar.id
      LEFT JOIN latest_bills lb ON lb.reseller_id = ar.id
      LEFT JOIN month_logs ml ON ml.reseller_id = ar.id
      ORDER BY ar.name ASC`,
            partnerTypeFilter ? [monthStart, selectedMonth, partnerTypeFilter] : [monthStart, selectedMonth],
        );

        let rows = dataResult.rows.map((r) => ({
            id: r.id,
            name: r.name,
            company: r.company,
            contact: r.contact,
            partner_type: r.partner_type,
            projected: Math.round(parseAmount(r.projected, 0) * 100) / 100,
            prev_due: Math.round(parseAmount(r.prev_due, 0) * 100) / 100,
            total_bill: Math.round(parseAmount(r.total_bill, 0) * 100) / 100,
            paid: Math.round(parseAmount(r.paid, 0) * 100) / 100,
            discount: Math.round(parseAmount(r.discount, 0) * 100) / 100,
            new_due: Math.round(parseAmount(r.new_due, 0) * 100) / 100,
            next_pay_date: r.next_pay_date,
            is_generated: Boolean(r.is_generated),
        }));

        const fallbackCandidates = rows.filter((row) => !row.is_generated);
        if (fallbackCandidates.length) {
            const fallbackResults = await Promise.all(
                fallbackCandidates.map(async (row) => {
                    try {
                        const breakdown = await calculateMonthlyBillBreakdown(row.id, selectedMonth);
                        return { id: row.id, projected: Math.round(parseAmount(breakdown.total, 0) * 100) / 100 };
                    } catch (err) {
                        console.warn(`[MonthlySummary] fallback breakdown failed for reseller=${row.id} month=${selectedMonth}: ${err.message}`);
                        return null;
                    }
                }),
            );

            const projectedById = new Map(fallbackResults.filter((item) => item && parseAmount(item.projected, 0) > 0).map((item) => [Number(item.id), Number(item.projected)]));

            if (projectedById.size > 0) {
                rows = rows.map((row) => {
                    const projectedFallback = projectedById.get(Number(row.id));
                    if (!projectedFallback) return row;

                    const prevDue = parseAmount(row.prev_due, 0);
                    const paid = parseAmount(row.paid, 0);
                    const discount = parseAmount(row.discount, 0);
                    const totalBill = prevDue + projectedFallback;
                    const newDue = totalBill - paid - discount;

                    return {
                        ...row,
                        projected: Math.round(projectedFallback * 100) / 100,
                        total_bill: Math.round(totalBill * 100) / 100,
                        new_due: Math.round(newDue * 100) / 100,
                    };
                });
            }
        }

        const totals = rows.reduce(
            (acc, row) => ({
                projected: acc.projected + parseAmount(row.projected, 0),
                paid: acc.paid + parseAmount(row.paid, 0),
                discount: acc.discount + parseAmount(row.discount, 0),
                due: acc.due + parseAmount(row.new_due, 0),
            }),
            { projected: 0, paid: 0, discount: 0, due: 0 },
        );

        const payload = {
            month: selectedMonth,
            partner_type: partnerTypeFilter || "all",
            totals: {
                projected: Math.round(totals.projected * 100) / 100,
                paid: Math.round(totals.paid * 100) / 100,
                discount: Math.round(totals.discount * 100) / 100,
                due: Math.round(totals.due * 100) / 100,
            },
            rows,
        };
        setMonthlySummaryCachedByPartner(selectedMonth, partnerTypeFilter, payload);

        const elapsedMs = Date.now() - startedAt;
        const warnThreshold = isProdEnv ? 2000 : 5000;
        if (elapsedMs > warnThreshold) {
            console.warn(`[MonthlySummary] month=${selectedMonth} row_count=${rows.length} cache_hit=false monthly_summary_ms=${elapsedMs}`);
        } else {
            console.log(`[MonthlySummary] month=${selectedMonth} row_count=${rows.length} cache_hit=false monthly_summary_ms=${elapsedMs}`);
        }

        res.json({
            ...payload,
            meta: {
                generated_at: new Date().toISOString(),
                cache_hit: false,
            },
        });
    } catch (error) {
        console.error("getMonthlySummary:", error);
        res.status(500).json({ message: "Failed to load monthly summary" });
    }
};

const updateMonthlySummaryPayDate = async (req, res) => {
    try {
        await initialize();
        const resellerId = Number(req.body.reseller_id || req.body.id || 0);
        if (!resellerId) return res.status(400).json({ message: "reseller_id is required" });

        const rawDate = (req.body.date || "").trim();
        const nextPayDate = rawDate || null;

        const result = await pool.query(`UPDATE resellers SET next_pay_date = $1 WHERE id = $2 RETURNING id, next_pay_date`, [nextPayDate, resellerId]);

        if (!result.rows.length) {
            return res.status(404).json({ message: "Reseller not found" });
        }

        invalidateMonthlySummaryCache();
        res.json({ message: "success", row: result.rows[0] });
    } catch (error) {
        console.error("updateMonthlySummaryPayDate:", error);
        res.status(500).json({ message: "Failed to update pay date" });
    }
};

const getCreditedAmountForMonth = async (client, resellerId, monthYm) => {
    const creditedResult = await client.query(
        `SELECT COALESCE(SUM(transaction_amount),0)::numeric AS credited
     FROM billing_logs
     WHERE reseller_id = $1
       AND TO_CHAR(COALESCE(effective_date, created_at), 'YYYY-MM') = $2
       AND COALESCE(to_jsonb(billing_logs)->>'log_type', CASE WHEN LOWER(COALESCE(change_desc,'')) LIKE 'discount:%' THEN 'discount' WHEN COALESCE(transaction_amount,0) > 0 THEN 'payment' ELSE 'adjustment' END) IN ('payment','discount')`,
        [resellerId, monthYm],
    );
    return parseAmount(creditedResult.rows[0]?.credited, 0);
};

const finalizeResellerBill = async (client, params) => {
    const {
        resellerId,
        monthYm,
        adjustment = 0,
        adjustmentNote = null,
        actor,
        reqMeta,
        source = "manual",
        requestPayload = {},
    } = params;

    const billDate = monthStartDateFromYm(monthYm);
    const existingBill = await client.query(`SELECT id FROM monthly_bills WHERE reseller_id = $1 AND bill_month = $2::date LIMIT 1`, [resellerId, billDate]);
    if (existingBill.rows.length) {
        return {
            status: "already_finalized",
            bill_id: existingBill.rows[0].id,
            month: billDate,
        };
    }

    const resellerResult = await client.query(
        `SELECT id, ${joiningDateExpr()} AS joining_date, COALESCE(previous_month_due,0)::numeric AS previous_month_due, COALESCE(current_projected_bill,0)::numeric AS current_projected_bill, COALESCE(iig_bw,0)::numeric AS iig_bw, COALESCE(bdix_bw,0)::numeric AS bdix_bw, COALESCE(ggc_bw,0)::numeric AS ggc_bw, COALESCE(fna_bw,0)::numeric AS fna_bw, COALESCE(cdn_bw,0)::numeric AS cdn_bw, COALESCE(bcdn_bw,0)::numeric AS bcdn_bw, COALESCE(nttn_capacity,0)::numeric AS nttn_capacity, COALESCE(rate_iig,0)::numeric AS rate_iig, COALESCE(rate_bdix,0)::numeric AS rate_bdix, COALESCE(rate_ggc,0)::numeric AS rate_ggc, COALESCE(rate_fna,0)::numeric AS rate_fna, COALESCE(rate_cdn,0)::numeric AS rate_cdn, COALESCE(rate_bcdn,0)::numeric AS rate_bcdn, COALESCE(rate_nttn,0)::numeric AS rate_nttn FROM resellers WHERE id = $1 FOR UPDATE`,
        [resellerId],
    );
    if (!resellerResult.rows.length) {
        return { status: "not_found", message: "Reseller not found" };
    }
    const reseller = resellerResult.rows[0];

    const breakdown = await calculateMonthlyBillBreakdown(resellerId, monthYm, reseller);
    const amount = parseAmount(breakdown.total, 0);
    const credited = await getCreditedAmountForMonth(client, resellerId, monthYm);
    const prevDue = parseAmount(reseller.previous_month_due, 0);
    const adj = parseAmount(adjustment, 0);
    const adjNote = adjustmentNote ? String(adjustmentNote).trim() : null;

    const insertResult = await client.query(
        `INSERT INTO monthly_bills (reseller_id, bill_month, amount, adjustment, adjustment_note, bill_details, previous_due, created_at)
     VALUES ($1,$2::date,$3,$4,$5,$6,$7,NOW())
     ON CONFLICT (reseller_id, bill_month)
     DO NOTHING
     RETURNING id`,
        [resellerId, billDate, amount, adj, adjNote, JSON.stringify(breakdown.items || []), prevDue],
    );

    if (!insertResult.rows.length) {
        const existingAfterInsert = await client.query(`SELECT id FROM monthly_bills WHERE reseller_id = $1 AND bill_month = $2::date LIMIT 1`, [resellerId, billDate]);
        return {
            status: "already_finalized",
            bill_id: existingAfterInsert.rows[0]?.id || null,
            month: billDate,
        };
    }

    const billId = insertResult.rows[0].id;
    const newDue = prevDue + amount + adj - credited;
    let nextProjected = 0;
    try {
        const nextMonth = nextMonthYm(monthYm);
        const nextBreakdown = await calculateMonthlyBillBreakdown(resellerId, nextMonth, reseller);
        nextProjected = Math.round(parseAmount(nextBreakdown.total, 0) * 100) / 100;
    } catch (e) {
        nextProjected = Math.round(parseAmount(reseller.current_projected_bill, 0) * 100) / 100;
    }
    await client.query(`UPDATE resellers SET previous_month_due = $1, current_projected_bill = $2, last_activity_date = NOW() WHERE id = $3`, [newDue, nextProjected, resellerId]);

    await logResellerFinancialChange(client, {
        reseller_id: Number(resellerId),
        ...actor,
        ...reqMeta,
        action_type: source === "auto" ? "AUTO_FINALIZE_MONTHLY_BILL" : "FINALIZE_MONTHLY_BILL",
        reference_table: "monthly_bills",
        reference_id: billId,
        amount_before: 0,
        amount_after: amount + adj,
        amount_delta: amount + adj,
        due_before: prevDue,
        due_after: newDue,
        due_delta: newDue - prevDue,
        field_changes: {
            month: billDate,
            base_amount: amount,
            adjustment: adj,
            paid_this_month: credited,
            source,
        },
        note: source === "auto" ? "Auto final invoice generated" : "Final invoice generated",
        request_payload: requestPayload,
    });

    invalidateMonthlySummaryCache(monthYm);

    return {
        status: "finalized",
        bill_id: billId,
        month: billDate,
        amount,
        adjustment: adj,
        paid: credited,
        new_due: newDue,
    };
};

const refreshProjectedBillForCurrentMonth = async (resellerId) => {
    const monthYm = getDhakaMonthYm();
    const monthStart = `${monthYm}-01`;

    const existingBill = await pool.query(`SELECT id FROM monthly_bills WHERE reseller_id = $1 AND bill_month = $2::date LIMIT 1`, [resellerId, monthStart]);

    if (existingBill.rows.length) {
        const snapshot = await pool.query(`SELECT COALESCE(current_projected_bill,0)::numeric AS projected FROM resellers WHERE id = $1`, [resellerId]);
        return Math.round(parseAmount(snapshot.rows[0]?.projected, 0) * 100) / 100;
    }

    const breakdown = await calculateMonthlyBillBreakdown(resellerId, monthYm);
    const projected = Math.round(parseAmount(breakdown.total, 0) * 100) / 100;

    await pool.query(`UPDATE resellers SET current_projected_bill = $1, last_activity_date = NOW() WHERE id = $2`, [projected, resellerId]);

    return projected;
};

module.exports = {
    getBillingLogs,
    addBillingLog,
    addDiscount,
    getMonthlySummary,
    updateMonthlySummaryPayDate,
    finalizeResellerBill,
    refreshProjectedBillForCurrentMonth,
    invalidateMonthlySummaryCache,
    getCreditedAmountForMonth,
};