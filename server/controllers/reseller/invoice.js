const pool = require("../../utilities/db");
const nodemailer = require("nodemailer");
const { getDhakaMonthYm, parseBillDetailsSnapshot, parseYMD } = require("./utils");
const { initialize, joiningDateExpr, hasResellerOtcAppliedMonthColumn } = require("./dbSetup");
const { calculateMonthlyBillBreakdown } = require("./service");

const getInvoice = async (req, res) => {
    try {
        await initialize();
        const { resellerId } = req.params;
        const monthParam = String(req.query.month || "").slice(0, 7) || getDhakaMonthYm();

        const resellerResult = await pool.query(
            `SELECT
        id,
        user_id AS reseller_code,
        COALESCE(reseller_name, company_name) AS name,
        reseller_name,
        company_name,
        contact_no AS phone,
        pop_location,
        COALESCE(previous_month_due, 0)::numeric AS due_amount,
        COALESCE(current_projected_bill, 0)::numeric AS projected_bill,
        COALESCE(iig_bw,0)::numeric AS iig_bw,
        COALESCE(bdix_bw,0)::numeric AS bdix_bw,
        COALESCE(ggc_bw,0)::numeric AS ggc_bw,
        COALESCE(fna_bw,0)::numeric AS fna_bw,
        COALESCE(cdn_bw,0)::numeric AS cdn_bw,
        COALESCE(bcdn_bw,0)::numeric AS bcdn_bw,
        COALESCE(nttn_capacity,0)::numeric AS nttn_capacity,
        COALESCE(rate_iig,0)::numeric AS rate_iig,
        COALESCE(rate_bdix,0)::numeric AS rate_bdix,
        COALESCE(rate_ggc,0)::numeric AS rate_ggc,
        COALESCE(rate_fna,0)::numeric AS rate_fna,
        COALESCE(rate_cdn,0)::numeric AS rate_cdn,
        COALESCE(rate_bcdn,0)::numeric AS rate_bcdn,
        COALESCE(rate_nttn,0)::numeric AS rate_nttn,
        COALESCE(otc_charge,0)::numeric AS otc_charge,
        ${hasResellerOtcAppliedMonthColumn() ? `otc_charge_applied_month,` : `NULL::date AS otc_charge_applied_month,`}
        COALESCE(real_ip_count,0)::int AS real_ip_count,
        COALESCE(real_ip_price,0)::numeric AS real_ip_price,
        COALESCE(status, 'active') AS status,
        created_at,
        ${joiningDateExpr()} AS joining_date
       FROM resellers WHERE id = $1`,
            [resellerId],
        );

        if (!resellerResult.rows.length) {
            return res.status(404).json({ message: "Reseller not found" });
        }

        const reseller = resellerResult.rows[0];
        const created = parseYMD(reseller.joining_date || reseller.created_at);
        const createdYM = created ? `${created.getFullYear()}-${String(created.getMonth() + 1).padStart(2, "0")}` : monthParam;
        const effectiveYM = monthParam < createdYM ? createdYM : monthParam;
        const monthStart = `${effectiveYM}-01`;

        const billResult = await pool.query(
            `SELECT id, reseller_id, bill_month,
              amount AS final_amount, adjustment, adjustment_note,
              bill_details, previous_due, created_at
       FROM monthly_bills
       WHERE reseller_id = $1 AND bill_month = $2::date`,
            [resellerId, monthStart],
        );

        const paidResult = await pool.query(
            `SELECT
         COALESCE(SUM(transaction_amount) FILTER (WHERE COALESCE(to_jsonb(billing_logs)->>'log_type', CASE WHEN LOWER(COALESCE(change_desc,'')) LIKE 'discount:%' THEN 'discount' WHEN COALESCE(transaction_amount,0) > 0 THEN 'payment' ELSE 'adjustment' END) = 'payment'),0)::numeric AS total_paid,
         COALESCE(SUM(transaction_amount) FILTER (WHERE COALESCE(to_jsonb(billing_logs)->>'log_type', CASE WHEN LOWER(COALESCE(change_desc,'')) LIKE 'discount:%' THEN 'discount' WHEN COALESCE(transaction_amount,0) > 0 THEN 'payment' ELSE 'adjustment' END) = 'discount'),0)::numeric AS total_discount
       FROM billing_logs
       WHERE reseller_id = $1
         AND TO_CHAR(COALESCE(effective_date, created_at), 'YYYY-MM') = $2
         AND COALESCE(to_jsonb(billing_logs)->>'log_type', CASE WHEN LOWER(COALESCE(change_desc,'')) LIKE 'discount:%' THEN 'discount' WHEN COALESCE(transaction_amount,0) > 0 THEN 'payment' ELSE 'adjustment' END) IN ('payment','discount')`,
            [resellerId, effectiveYM],
        );

        const logResult = await pool.query(
            `SELECT id, reseller_id, change_desc AS note,
              transaction_amount AS amount, effective_date, created_at
       FROM billing_logs
       WHERE reseller_id = $1
         AND DATE_TRUNC('month', COALESCE(effective_date, created_at)) = DATE_TRUNC('month', $2::date)
       ORDER BY created_at DESC`,
            [resellerId, monthStart],
        );

        const bill = billResult.rows[0] || null;
        let items = [];
        let itemSource = "calculated_fallback";
        if (bill) {
            const snapshot = parseBillDetailsSnapshot(bill.bill_details, `bill_id=${bill.id}`);
            if (snapshot.valid) {
                items = snapshot.items;
                itemSource = "snapshot";
            } else {
                const recalculated = await calculateMonthlyBillBreakdown(resellerId, effectiveYM, reseller);
                items = recalculated.items || [];
            }
        } else {
            const recalculated = await calculateMonthlyBillBreakdown(resellerId, effectiveYM, reseller);
            items = recalculated.items || [];
        }

        res.json({
            reseller,
            month: monthStart,
            bill,
            items,
            total_paid: parseFloat(paidResult.rows[0]?.total_paid || 0),
            total_discount: parseFloat(paidResult.rows[0]?.total_discount || 0),
            logs: logResult.rows,
            meta: { item_source: itemSource },
        });
    } catch (error) {
        console.error("getInvoice:", error);
        res.status(500).json({ message: "Failed to load invoice" });
    }
};

const getInvoiceByBillId = async (req, res) => {
    try {
        await initialize();
        const { billId } = req.params;

        const billResult = await pool.query(
            `SELECT id, reseller_id, bill_month,
              amount AS final_amount, adjustment, adjustment_note,
              bill_details, previous_due, created_at
       FROM monthly_bills
       WHERE id = $1`,
            [billId],
        );

        if (!billResult.rows.length) {
            return res.status(404).json({ message: "Bill not found" });
        }

        const bill = billResult.rows[0];
        const resellerId = bill.reseller_id;
        const billMonthDate = parseYMD(bill.bill_month);
        const monthStart = billMonthDate ? `${billMonthDate.getFullYear()}-${String(billMonthDate.getMonth() + 1).padStart(2, "0")}-${String(billMonthDate.getDate()).padStart(2, "0")}` : String(bill.bill_month).slice(0, 10);
        const monthYM = monthStart.slice(0, 7);

        const resellerResult = await pool.query(
            `SELECT
        id,
        user_id AS reseller_code,
        COALESCE(reseller_name, company_name) AS name,
        reseller_name,
        company_name,
        contact_no AS phone,
        pop_location,
        COALESCE(previous_month_due, 0)::numeric AS due_amount,
        COALESCE(current_projected_bill, 0)::numeric AS projected_bill,
        COALESCE(iig_bw,0)::numeric AS iig_bw,
        COALESCE(bdix_bw,0)::numeric AS bdix_bw,
        COALESCE(ggc_bw,0)::numeric AS ggc_bw,
        COALESCE(fna_bw,0)::numeric AS fna_bw,
        COALESCE(cdn_bw,0)::numeric AS cdn_bw,
        COALESCE(bcdn_bw,0)::numeric AS bcdn_bw,
        COALESCE(nttn_capacity,0)::numeric AS nttn_capacity,
        COALESCE(rate_iig,0)::numeric AS rate_iig,
        COALESCE(rate_bdix,0)::numeric AS rate_bdix,
        COALESCE(rate_ggc,0)::numeric AS rate_ggc,
        COALESCE(rate_fna,0)::numeric AS rate_fna,
        COALESCE(rate_cdn,0)::numeric AS rate_cdn,
        COALESCE(rate_bcdn,0)::numeric AS rate_bcdn,
        COALESCE(rate_nttn,0)::numeric AS rate_nttn,
        COALESCE(otc_charge,0)::numeric AS otc_charge,
        ${hasResellerOtcAppliedMonthColumn() ? `otc_charge_applied_month,` : `NULL::date AS otc_charge_applied_month,`}
        COALESCE(real_ip_count,0)::int AS real_ip_count,
        COALESCE(real_ip_price,0)::numeric AS real_ip_price,
        COALESCE(status, 'active') AS status,
        created_at,
        ${joiningDateExpr()} AS joining_date
       FROM resellers WHERE id = $1`,
            [resellerId],
        );

        if (!resellerResult.rows.length) {
            return res.status(404).json({ message: "Reseller not found" });
        }

        const paidResult = await pool.query(
            `SELECT
         COALESCE(SUM(transaction_amount) FILTER (WHERE COALESCE(to_jsonb(billing_logs)->>'log_type', CASE WHEN LOWER(COALESCE(change_desc,'')) LIKE 'discount:%' THEN 'discount' WHEN COALESCE(transaction_amount,0) > 0 THEN 'payment' ELSE 'adjustment' END) = 'payment'),0)::numeric AS total_paid,
         COALESCE(SUM(transaction_amount) FILTER (WHERE COALESCE(to_jsonb(billing_logs)->>'log_type', CASE WHEN LOWER(COALESCE(change_desc,'')) LIKE 'discount:%' THEN 'discount' WHEN COALESCE(transaction_amount,0) > 0 THEN 'payment' ELSE 'adjustment' END) = 'discount'),0)::numeric AS total_discount
       FROM billing_logs
       WHERE reseller_id = $1
         AND TO_CHAR(COALESCE(effective_date, created_at), 'YYYY-MM') = $2
         AND COALESCE(to_jsonb(billing_logs)->>'log_type', CASE WHEN LOWER(COALESCE(change_desc,'')) LIKE 'discount:%' THEN 'discount' WHEN COALESCE(transaction_amount,0) > 0 THEN 'payment' ELSE 'adjustment' END) IN ('payment','discount')`,
            [resellerId, monthYM],
        );

        const logResult = await pool.query(
            `SELECT id, reseller_id, change_desc AS note,
              transaction_amount AS amount, effective_date, created_at
       FROM billing_logs
       WHERE reseller_id = $1
         AND DATE_TRUNC('month', COALESCE(effective_date, created_at)) = DATE_TRUNC('month', $2::date)
       ORDER BY created_at DESC`,
            [resellerId, monthStart],
        );

        const snapshot = parseBillDetailsSnapshot(bill.bill_details, `bill_id=${bill.id}`);
        let items = snapshot.items;
        let itemSource = "snapshot";
        if (!snapshot.valid) {
            const recalculated = await calculateMonthlyBillBreakdown(resellerId, monthYM, resellerResult.rows[0]);
            items = recalculated.items || [];
            itemSource = "calculated_fallback";
        }

        res.json({
            reseller: resellerResult.rows[0],
            month: monthStart,
            bill,
            items,
            total_paid: parseFloat(paidResult.rows[0]?.total_paid || 0),
            total_discount: parseFloat(paidResult.rows[0]?.total_discount || 0),
            logs: logResult.rows,
            meta: { item_source: itemSource },
        });
    } catch (error) {
        console.error("getInvoiceByBillId:", error);
        res.status(500).json({ message: "Failed to load static invoice" });
    }
};

const getMailTransport = () => {
    const host = String(process.env.SMTP_HOST || "").trim();
    const port = Number.parseInt(process.env.SMTP_PORT || "587", 10);
    const user = String(process.env.SMTP_USER || "").trim();
    const pass = String(process.env.SMTP_PASS || "").trim();
    const secure = String(process.env.SMTP_SECURE || "").toLowerCase() === "true" || port === 465;

    if (!host || !port || !user || !pass) {
        return null;
    }

    return nodemailer.createTransport({
        host,
        port,
        secure,
        auth: { user, pass },
    });
};

const getFrontendBaseUrl = () => {
    const candidate = String(process.env.FRONTEND_URL || "").trim().replace(/\/+$/, "");
    if (!candidate) return "https://office.speednetkhulna.com";
    return candidate;
};

const parseSnapshotDataUrl = (raw) => {
    const dataUrl = String(raw || "").trim();
    if (!dataUrl) return null;
    const match = dataUrl.match(/^data:(image\/png|image\/jpeg);base64,([A-Za-z0-9+/=\n\r]+)$/);
    if (!match) return null;
    const mime = match[1];
    const base64Data = match[2].replace(/\s+/g, "");
    const buffer = Buffer.from(base64Data, "base64");
    if (!buffer.length) return null;
    if (buffer.length > 12 * 1024 * 1024) return null;
    const ext = mime === "image/jpeg" ? "jpg" : "png";
    return { mime, ext, buffer };
};

const sendInvoiceEmailByReseller = async (req, res) => {
    try {
        await initialize();
        const { resellerId } = req.params;
        const toEmail = String(req.body?.to_email || "").trim();
        const monthParam = String(req.body?.month || "").slice(0, 7) || getDhakaMonthYm();

        if (!toEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(toEmail)) {
            return res.status(400).json({ message: "Valid to_email is required" });
        }

        const resellerResult = await pool.query(`SELECT id, COALESCE(reseller_name, company_name) AS name FROM resellers WHERE id = $1 LIMIT 1`, [resellerId]);
        if (!resellerResult.rows.length) {
            return res.status(404).json({ message: "Reseller not found" });
        }

        const monthStart = `${monthParam}-01`;
        const billResult = await pool.query(`SELECT id FROM monthly_bills WHERE reseller_id = $1 AND bill_month = $2::date LIMIT 1`, [resellerId, monthStart]);
        const billId = billResult.rows[0]?.id || null;

        const transport = getMailTransport();
        if (!transport) {
            return res.status(503).json({
                message: "SMTP is not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS and optional SMTP_SECURE.",
            });
        }

        const frontend = getFrontendBaseUrl();
        const dynamicLink = `${frontend}/invoice?resellerId=${encodeURIComponent(resellerId)}&month=${encodeURIComponent(monthParam)}`;
        const staticLink = billId ? `${frontend}/view-static-invoice?id=${encodeURIComponent(billId)}` : null;
        const resellerName = resellerResult.rows[0].name || `Reseller #${resellerId}`;
        const fromAddress = String(process.env.SMTP_FROM || process.env.SMTP_USER || "billing@speednetkhulna.com").trim();
        const snapshot = parseSnapshotDataUrl(req.body?.snapshot_data_url);
        if (req.body?.snapshot_data_url && !snapshot) {
            return res.status(400).json({
                message: "Invalid snapshot_data_url (expected data:image/png;base64,...)",
            });
        }
        const attachmentName = `invoice_${resellerId}_${monthParam}.${snapshot?.ext || "png"}`;

        const html = `
      <div style="font-family:Arial,sans-serif;line-height:1.5;color:#1f2937">
        <h2 style="margin:0 0 12px">Invoice Link - ${resellerName}</h2>
        <p style="margin:0 0 8px">Billing Month: <strong>${monthParam}</strong></p>
        <p style="margin:0 0 8px"><a href="${dynamicLink}">Open Invoice</a></p>
        ${staticLink ? `<p style="margin:0 0 8px"><a href="${staticLink}">Open Final Static Invoice</a></p>` : ""}
        ${snapshot ? `<p style="margin:0 0 8px">Attached: full invoice snapshot (${attachmentName})</p>` : ""}
        <p style="margin-top:16px;color:#6b7280">Generated from Speed Net Khulna billing system.</p>
      </div>
    `;

        await transport.sendMail({
            from: fromAddress,
            to: toEmail,
            subject: `Invoice ${monthParam} - ${resellerName}`,
            html,
            attachments: snapshot ? [{ filename: attachmentName, content: snapshot.buffer, contentType: snapshot.mime }] : [],
        });

        res.json({
            message: "Invoice email sent successfully",
            to_email: toEmail,
            month: monthParam,
            links: { dynamic: dynamicLink, static: staticLink },
            attached_snapshot: Boolean(snapshot),
        });
    } catch (error) {
        console.error("sendInvoiceEmailByReseller:", error);
        res.status(500).json({ message: "Failed to send invoice email" });
    }
};

const sendInvoiceEmailByBillId = async (req, res) => {
    try {
        await initialize();
        const { billId } = req.params;
        const toEmail = String(req.body?.to_email || "").trim();
        if (!toEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(toEmail)) {
            return res.status(400).json({ message: "Valid to_email is required" });
        }

        const billResult = await pool.query(
            `SELECT mb.id, mb.bill_month, mb.reseller_id, COALESCE(r.reseller_name, r.company_name) AS reseller_name
       FROM monthly_bills mb
       JOIN resellers r ON r.id = mb.reseller_id
       WHERE mb.id = $1
       LIMIT 1`,
            [billId],
        );
        if (!billResult.rows.length) {
            return res.status(404).json({ message: "Bill not found" });
        }

        const bill = billResult.rows[0];
        const monthYm = String(bill.bill_month).slice(0, 7);
        const frontend = getFrontendBaseUrl();
        const staticLink = `${frontend}/view-static-invoice?id=${encodeURIComponent(billId)}`;
        const dynamicLink = `${frontend}/invoice?resellerId=${encodeURIComponent(bill.reseller_id)}&month=${encodeURIComponent(monthYm)}`;

        const transport = getMailTransport();
        if (!transport) {
            return res.status(503).json({
                message: "SMTP is not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS and optional SMTP_SECURE.",
            });
        }

        const resellerName = bill.reseller_name || `Reseller #${bill.reseller_id}`;
        const fromAddress = String(process.env.SMTP_FROM || process.env.SMTP_USER || "billing@speednetkhulna.com").trim();
        const snapshot = parseSnapshotDataUrl(req.body?.snapshot_data_url);
        if (req.body?.snapshot_data_url && !snapshot) {
            return res.status(400).json({
                message: "Invalid snapshot_data_url (expected data:image/png;base64,...)",
            });
        }
        const attachmentName = `invoice_bill_${billId}_${monthYm}.${snapshot?.ext || "png"}`;
        const html = `
      <div style="font-family:Arial,sans-serif;line-height:1.5;color:#1f2937">
        <h2 style="margin:0 0 12px">Final Static Invoice - ${resellerName}</h2>
        <p style="margin:0 0 8px">Billing Month: <strong>${monthYm}</strong></p>
        <p style="margin:0 0 8px"><a href="${staticLink}">Open Final Static Invoice</a></p>
        <p style="margin:0 0 8px"><a href="${dynamicLink}">Open Invoice Page</a></p>
        ${snapshot ? `<p style="margin:0 0 8px">Attached: full invoice snapshot (${attachmentName})</p>` : ""}
        <p style="margin-top:16px;color:#6b7280">Generated from Speed Net Khulna billing system.</p>
      </div>
    `;

        await transport.sendMail({
            from: fromAddress,
            to: toEmail,
            subject: `Final Invoice ${monthYm} - ${resellerName}`,
            html,
            attachments: snapshot ? [{ filename: attachmentName, content: snapshot.buffer, contentType: snapshot.mime }] : [],
        });

        res.json({
            message: "Static invoice email sent successfully",
            to_email: toEmail,
            bill_id: Number(billId),
            links: { static: staticLink, dynamic: dynamicLink },
            attached_snapshot: Boolean(snapshot),
        });
    } catch (error) {
        console.error("sendInvoiceEmailByBillId:", error);
        res.status(500).json({ message: "Failed to send static invoice email" });
    }
};

module.exports = {
    getInvoice,
    getInvoiceByBillId,
    sendInvoiceEmailByReseller,
    sendInvoiceEmailByBillId,
};