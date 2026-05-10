const pool = require("../../utilities/db");
const bcrypt = require("bcrypt");
const {
  getActor,
  getReqMeta,
  logResellerFinancialChange,
} = require("../../utilities/resellerFinancialAudit");
const {
  calculateResellerMonthProjectedTotal,
} = require("./service");
const {
  normalizePartnerType,
  canViewResellerFinancials,
  hasAnyPermission,
  isAdminRole,
  parseAmount,
  parseWholeNumber,
  getDhakaMonthYm,
  normalizedPartnerTypeSql,
} = require("./utils");
const {
  initialize,
  detectPartnerTypeColumn,
  detectOtcAppliedMonthColumn,
  joiningDateExpr,
  hasResellerPartnerTypeColumn,
  hasResellerOtcAppliedMonthColumn,
  detectChannelPartnerColumns,
  hasChannelPartnerColumns,
} = require("./dbSetup");
const { refreshProjectedBillForCurrentMonth, invalidateMonthlySummaryCache } = require("./billing");

const listResellers = async (req, res) => {
  try {
    await initialize();
    const canViewFinancials = canViewResellerFinancials(req.user);
    const search = (req.query.search || "").trim();
    const partnerTypeFilter = normalizePartnerType(req.query.partner_type || "");
    const rawStatus = String(req.query.status || "active").trim().toLowerCase();
    const statusFilter = ["active", "inactive", "suspended", "all"].includes(rawStatus) ? rawStatus : "active";
    const params = [];
    const whereParts = [];

    if (search) {
      params.push(`%${search}%`);
      whereParts.push(`(COALESCE(r.reseller_name, r.company_name) ILIKE $${params.length} OR r.user_id ILIKE $${params.length} OR r.contact_no ILIKE $${params.length})`);
    }

    if (statusFilter !== "all") {
      params.push(statusFilter);
      whereParts.push(`LOWER(COALESCE(r.status, 'active')) = $${params.length}`);
    }
    if (partnerTypeFilter) {
      params.push(partnerTypeFilter);
      if (hasResellerPartnerTypeColumn()) {
        whereParts.push(`${normalizedPartnerTypeSql("COALESCE(r.partner_type, '')")} = $${params.length}`);
      } else {
        whereParts.push(`'distribution_partner' = $${params.length}`);
      }
    }

    const where = whereParts.length ? `WHERE ${whereParts.join(" AND ")}` : "";

    const result = await pool.query(
      `SELECT
        r.id,
        r.user_id AS reseller_code,
        r.company_name,
        COALESCE(r.reseller_name, r.company_name) AS name,
        r.contact_no AS phone,
        r.pop_location,
        r.pop_location AS ip_address,
        ${hasResellerPartnerTypeColumn() ? `${normalizedPartnerTypeSql("COALESCE(r.partner_type, '')")} AS partner_type,` : `'distribution_partner' AS partner_type,`}
        COALESCE(r.iig_bw,0)::numeric AS iig_bw,
        COALESCE(r.bdix_bw,0)::numeric AS bdix_bw,
        COALESCE(r.ggc_bw,0)::numeric AS ggc_bw,
        COALESCE(r.fna_bw,0)::numeric AS fna_bw,
        COALESCE(r.cdn_bw,0)::numeric AS cdn_bw,
        COALESCE(r.bcdn_bw,0)::numeric AS bcdn_bw,
        COALESCE(r.nttn_capacity,0)::numeric AS nttn_capacity,
        COALESCE(r.nttn_link, '') AS nttn_link,
        (COALESCE(r.iig_bw,0) + COALESCE(r.bdix_bw,0) + COALESCE(r.ggc_bw,0) + COALESCE(r.fna_bw,0) + COALESCE(r.cdn_bw,0) + COALESCE(r.bcdn_bw,0))::numeric AS current_bw_mbps,
        COALESCE(r.current_projected_bill,0) AS monthly_rate,
        COALESCE(r.otc_charge,0)::numeric AS otc_charge,
        COALESCE(r.real_ip_count,0)::int AS real_ip_count,
        COALESCE(r.real_ip_price,0)::numeric AS real_ip_price,
        COALESCE(r.previous_month_due,0) AS due_amount,
        r.next_pay_date,
        COALESCE(r.status, 'active') AS status,
        (
          SELECT COUNT(*)::int
          FROM bandwidth_requests br
          WHERE br.reseller_id = r.id AND COALESCE(br.admin_status, 'pending') = 'pending'
        ) AS pending_requests
      FROM resellers r
      ${where}
      ORDER BY r.id DESC`,
      params,
    );

    const rows = canViewFinancials
      ? result.rows
      : result.rows.map((r) => ({
        ...r,
        monthly_rate: null,
        due_amount: null,
        next_pay_date: null,
      }));

    res.json(rows);
  } catch (error) {
    console.error("listResellers:", error);
    res.status(500).json({ message: "Failed to load resellers" });
  }
};

const createReseller = async (req, res) => {
  const client = await pool.connect();
  try {
    await initialize();
    const {
      reseller_name,
      name,
      company_name,
      reseller_code,
      user_id,
      phone,
      contact_no,
      pop_location,
      ip_address,
      latitude,
      longitude,
      joining_date,
      iig_bw,
      bdix_bw,
      ggc_bw,
      fna_bw,
      cdn_bw,
      bcdn_bw,
      nttn_bw,
      nttn_capacity,
      rate_iig,
      rate_bdix,
      rate_ggc,
      rate_fna,
      rate_cdn,
      rate_bcdn,
      rate_nttn,
      nttn_type,
      nttn_link,
      connection_type,
      security_deposit,
      otc_charge,
      real_ip_count,
      real_ip_price,
      initial_payment,
      status,
      due_amount,
      next_pay_date,
      partner_type,
      channel_user_count,
    } = req.body || {};

    const resellerName = String(reseller_name || name || "").trim();
    if (!resellerName) return res.status(400).json({ message: "Reseller name is required" });

    const manualUserId = String(user_id || reseller_code || "").trim();
    const baseUserId = resellerName.toLowerCase().replace(/[^a-z0-9]/g, "");
    const generatedUserId = `${baseUserId || "reseller"}_${Math.floor(1000 + Math.random() * 9000)}`;
    const finalUserId = manualUserId || generatedUserId;
    const companyName = String(company_name || resellerName).trim();
    const rawResellerPassword = String(req.body?.password || contact_no || phone || finalUserId || "123456").trim() || "123456";
    const resellerPassword = await bcrypt.hash(rawResellerPassword, 10);
    const normalizedPartnerType = normalizePartnerType(partner_type) || "distribution_partner";

    const joinDate = String(joining_date || new Date().toISOString().slice(0, 10)).slice(0, 10);
    const otcAppliedMonth = `${getDhakaMonthYm()}-01`;
    const bw = {
      iig_bw: parseAmount(iig_bw, 0),
      bdix_bw: parseAmount(bdix_bw, 0),
      ggc_bw: parseAmount(ggc_bw, 0),
      fna_bw: parseAmount(fna_bw, 0),
      cdn_bw: parseAmount(cdn_bw, 0),
      bcdn_bw: parseAmount(bcdn_bw, 0),
      nttn_capacity: parseAmount(nttn_capacity ?? nttn_bw, 0),
    };

    const rate = {
      rate_iig: parseAmount(rate_iig, 0),
      rate_bdix: parseAmount(rate_bdix, 0),
      rate_ggc: parseAmount(rate_ggc, 0),
      rate_fna: parseAmount(rate_fna, 0),
      rate_cdn: parseAmount(rate_cdn, 0),
      rate_bcdn: parseAmount(rate_bcdn, 0),
      rate_nttn: parseAmount(rate_nttn, 0),
    };
    const otcCharge = parseAmount(otc_charge, 0);
    const realIpCount = Math.max(0, parseWholeNumber(real_ip_count, 0));
    const realIpPrice = parseAmount(real_ip_price, 0);
    const projectedBill = calculateResellerMonthProjectedTotal({
      ...bw,
      ...rate,
      joining_date: joinDate,
      otc_charge: otcCharge,
      otc_charge_applied_month: otcAppliedMonth,
      real_ip_count: realIpCount,
      real_ip_price: realIpPrice,
    });

    const nttnTypeText = Array.isArray(nttn_type) ? nttn_type.join(", ") : String(nttn_type || "").trim();
    const connectionTypeText = Array.isArray(connection_type) ? connection_type.join(", ") : String(connection_type || "").trim();

    await client.query("BEGIN");

    const insertValuesBase = [
      finalUserId,
      resellerName,
      companyName,
      pop_location || ip_address || null,
      contact_no || phone || null,
      bw.iig_bw,
      bw.bdix_bw,
      bw.ggc_bw,
      bw.fna_bw,
      bw.cdn_bw,
      bw.bcdn_bw,
      bw.nttn_capacity,
      nttnTypeText || null,
      nttn_link || null,
      connectionTypeText || null,
      latitude || null,
      longitude || null,
      rate.rate_iig,
      rate.rate_bdix,
      rate.rate_ggc,
      rate.rate_fna,
      rate.rate_cdn,
      rate.rate_bcdn,
      rate.rate_nttn,
      Math.round(projectedBill * 100) / 100,
      parseAmount(due_amount, 0),
      next_pay_date || null,
      String(status || "active").toLowerCase(),
      parseAmount(security_deposit, 0),
      otcCharge,
      realIpCount,
      realIpPrice,
    ];

    const ins = await client.query(
      hasResellerJoiningDateColumn()
        ? hasResellerPartnerTypeColumn() && hasResellerOtcAppliedMonthColumn()
          ? `INSERT INTO resellers (
              user_id, reseller_name, company_name, pop_location, contact_no,
              iig_bw, bdix_bw, ggc_bw, fna_bw, cdn_bw, bcdn_bw, nttn_capacity,
              nttn_type, nttn_link, connection_type, latitude, longitude,
              rate_iig, rate_bdix, rate_ggc, rate_fna, rate_cdn, rate_bcdn, rate_nttn,
              current_projected_bill, previous_month_due, next_pay_date, status, security_deposit, otc_charge, real_ip_count, real_ip_price, otc_charge_applied_month, partner_type, password, joining_date, created_at, last_activity_date
            ) VALUES (
              $1,$2,$3,$4,$5,
              $6,$7,$8,$9,$10,$11,$12,
              $13,$14,$15,$16,$17,
              $18,$19,$20,$21,$22,$23,$24,
              $25,$26,$27,$28,$29,$30,$31,$32,$33::date,$34,$35,$36::date,NOW(),NOW()
            ) RETURNING id`
          : hasResellerPartnerTypeColumn()
            ? `INSERT INTO resellers (
                user_id, reseller_name, company_name, pop_location, contact_no,
                iig_bw, bdix_bw, ggc_bw, fna_bw, cdn_bw, bcdn_bw, nttn_capacity,
                nttn_type, nttn_link, connection_type, latitude, longitude,
                rate_iig, rate_bdix, rate_ggc, rate_fna, rate_cdn, rate_bcdn, rate_nttn,
                current_projected_bill, previous_month_due, next_pay_date, status, security_deposit, otc_charge, real_ip_count, real_ip_price, partner_type, password, joining_date, created_at, last_activity_date
              ) VALUES (
                $1,$2,$3,$4,$5,
                $6,$7,$8,$9,$10,$11,$12,
                $13,$14,$15,$16,$17,
                $18,$19,$20,$21,$22,$23,$24,
                $25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35::date,NOW(),NOW()
              ) RETURNING id`
            : `INSERT INTO resellers (
              user_id, reseller_name, company_name, pop_location, contact_no,
              iig_bw, bdix_bw, ggc_bw, fna_bw, cdn_bw, bcdn_bw, nttn_capacity,
              nttn_type, nttn_link, connection_type, latitude, longitude,
              rate_iig, rate_bdix, rate_ggc, rate_fna, rate_cdn, rate_bcdn, rate_nttn,
              current_projected_bill, previous_month_due, next_pay_date, status, security_deposit, otc_charge, real_ip_count, real_ip_price, password, joining_date, created_at, last_activity_date
            ) VALUES (
              $1,$2,$3,$4,$5,
              $6,$7,$8,$9,$10,$11,$12,
              $13,$14,$15,$16,$17,
              $18,$19,$20,$21,$22,$23,$24,
              $25,$26,$27,$28,$29,$30,$31,$32,$33,$34::date,NOW(),NOW()
            ) RETURNING id`
        : hasResellerPartnerTypeColumn() && hasResellerOtcAppliedMonthColumn()
          ? `INSERT INTO resellers (
              user_id, reseller_name, company_name, pop_location, contact_no,
              iig_bw, bdix_bw, ggc_bw, fna_bw, cdn_bw, bcdn_bw, nttn_capacity,
              nttn_type, nttn_link, connection_type, latitude, longitude,
              rate_iig, rate_bdix, rate_ggc, rate_fna, rate_cdn, rate_bcdn, rate_nttn,
              current_projected_bill, previous_month_due, next_pay_date, status, security_deposit, otc_charge, real_ip_count, real_ip_price, otc_charge_applied_month, partner_type, password, created_at, last_activity_date
            ) VALUES (
              $1,$2,$3,$4,$5,
              $6,$7,$8,$9,$10,$11,$12,
              $13,$14,$15,$16,$17,
              $18,$19,$20,$21,$22,$23,$24,
              $25,$26,$27,$28,$29,$30,$31,$32,$33::date,$34,$35,$36::timestamp,NOW()
            ) RETURNING id`
          : hasResellerPartnerTypeColumn()
            ? `INSERT INTO resellers (
              user_id, reseller_name, company_name, pop_location, contact_no,
              iig_bw, bdix_bw, ggc_bw, fna_bw, cdn_bw, bcdn_bw, nttn_capacity,
              nttn_type, nttn_link, connection_type, latitude, longitude,
              rate_iig, rate_bdix, rate_ggc, rate_fna, rate_cdn, rate_bcdn, rate_nttn,
              current_projected_bill, previous_month_due, next_pay_date, status, security_deposit, otc_charge, real_ip_count, real_ip_price, partner_type, password, created_at, last_activity_date
            ) VALUES (
              $1,$2,$3,$4,$5,
              $6,$7,$8,$9,$10,$11,$12,
              $13,$14,$15,$16,$17,
              $18,$19,$20,$21,$22,$23,$24,
              $25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35::timestamp,NOW()
            ) RETURNING id`
            : `INSERT INTO resellers (
              user_id, reseller_name, company_name, pop_location, contact_no,
              iig_bw, bdix_bw, ggc_bw, fna_bw, cdn_bw, bcdn_bw, nttn_capacity,
              nttn_type, nttn_link, connection_type, latitude, longitude,
              rate_iig, rate_bdix, rate_ggc, rate_fna, rate_cdn, rate_bcdn, rate_nttn,
              current_projected_bill, previous_month_due, next_pay_date, status, security_deposit, otc_charge, real_ip_count, real_ip_price, password, created_at, last_activity_date
            ) VALUES (
              $1,$2,$3,$4,$5,
              $6,$7,$8,$9,$10,$11,$12,
              $13,$14,$15,$16,$17,
              $18,$19,$20,$21,$22,$23,$24,
              $25,$26,$27,$28,$29,$30,$31,$32,$33,$34::timestamp,NOW()
            ) RETURNING id`,
      hasResellerPartnerTypeColumn() && hasResellerOtcAppliedMonthColumn()
        ? [
          ...insertValuesBase,
          otcAppliedMonth,
          normalizedPartnerType,
          resellerPassword,
          joinDate,
        ]
        : hasResellerPartnerTypeColumn()
          ? [
            ...insertValuesBase,
            normalizedPartnerType,
            resellerPassword,
            joinDate,
          ]
          : [...insertValuesBase, resellerPassword, joinDate],
    );

    const newResellerId = ins.rows[0].id;

    const channelUserCount = Math.max(0, parseInt(channel_user_count || 0, 10) || 0);
    if (channelUserCount > 0 || normalizedPartnerType === "channel_partner") {
      try {
        await client.query("UPDATE resellers SET channel_user_count = $1 WHERE id = $2", [channelUserCount, newResellerId]);
      } catch (_) {}
    }

    const initPayment = parseAmount(initial_payment, 0);
    const createdAt = `${joinDate}T00:00:00`;
    const actor = getActor(req);
    const reqMeta = getReqMeta(req);

    await logResellerFinancialChange(client, {
      reseller_id: newResellerId,
      ...actor,
      ...reqMeta,
      action_type: "CREATE_RESELLER_FINANCIAL_BASELINE",
      reference_table: "resellers",
      reference_id: newResellerId,
      amount_before: 0,
      amount_after: Math.round(projectedBill * 100) / 100,
      amount_delta: Math.round(projectedBill * 100) / 100,
      due_before: 0,
      due_after: parseAmount(due_amount, 0),
      due_delta: parseAmount(due_amount, 0),
      field_changes: {
        current_projected_bill: { old: 0, new: Math.round(projectedBill * 100) / 100 },
        previous_month_due: { old: 0, new: parseAmount(due_amount, 0) },
        security_deposit: { old: 0, new: parseAmount(security_deposit, 0) },
        otc_charge: { old: 0, new: otcCharge },
        real_ip_count: { old: 0, new: realIpCount },
        real_ip_price: { old: 0, new: realIpPrice },
      },
      note: "Reseller created with financial baseline",
      request_payload: { due_amount, security_deposit, initial_payment, otc_charge: otcCharge, real_ip_count: realIpCount, real_ip_price: realIpPrice },
    });

    if (initPayment > 0) {
      const paymentInsert = await client.query(
        `INSERT INTO billing_logs (reseller_id, change_desc, effective_date, transaction_amount, created_at)
         VALUES ($1,$2,$3::timestamp,$4,NOW())
         RETURNING id`,
        [newResellerId, `Initial Payment: ${initPayment.toFixed(2)} Tk.`, createdAt, initPayment],
      );

      await logResellerFinancialChange(client, {
        reseller_id: newResellerId,
        ...actor,
        ...reqMeta,
        action_type: "ADD_INITIAL_PAYMENT",
        reference_table: "billing_logs",
        reference_id: paymentInsert.rows?.[0]?.id || null,
        amount_before: 0,
        amount_after: initPayment,
        amount_delta: initPayment,
        due_before: parseAmount(due_amount, 0),
        due_after: parseAmount(due_amount, 0),
        due_delta: 0,
        field_changes: { payment_amount: initPayment },
        note: `Initial payment logged for reseller ${newResellerId}`,
        request_payload: { initial_payment: initPayment, effective_date: createdAt },
      });
    }

    await client.query("COMMIT");
    res.status(201).json({ id: newResellerId });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("createReseller:", error);
    res.status(500).json({ message: "Failed to create reseller", detail: error.message });
  } finally {
    client.release();
  }
};

const getResellerProfile = async (req, res) => {
  try {
    await initialize();
    const { id } = req.params;

    const resellerResult = await pool.query(
      `SELECT
        r.id,
        r.user_id AS reseller_code,
        r.company_name,
        COALESCE(r.reseller_name, r.company_name) AS name,
        r.contact_no AS phone,
        r.pop_location,
        r.pop_location AS ip_address,
        'distribution_partner' AS partner_type,
        COALESCE(r.iig_bw,0)::numeric AS iig_bw,
        COALESCE(r.bdix_bw,0)::numeric AS bdix_bw,
        COALESCE(r.ggc_bw,0)::numeric AS ggc_bw,
        COALESCE(r.fna_bw,0)::numeric AS fna_bw,
        COALESCE(r.cdn_bw,0)::numeric AS cdn_bw,
        COALESCE(r.bcdn_bw,0)::numeric AS bcdn_bw,
        COALESCE(r.nttn_capacity,0)::numeric AS nttn_capacity,
        (COALESCE(r.iig_bw,0) + COALESCE(r.bdix_bw,0) + COALESCE(r.ggc_bw,0) + COALESCE(r.fna_bw,0) + COALESCE(r.cdn_bw,0) + COALESCE(r.bcdn_bw,0))::numeric AS current_bw_mbps,
        COALESCE(r.current_projected_bill,0) AS monthly_rate,
        COALESCE(r.previous_month_due,0) AS due_amount,
        r.next_pay_date,
        COALESCE(r.status, 'active') AS status,
        r.created_at,
        ${joiningDateExpr("r")} AS joining_date
      FROM resellers r
      WHERE r.id = $1`,
      [id],
    );

    if (!resellerResult.rows.length) {
      return res.status(404).json({ message: "Reseller not found" });
    }

    const logs = await pool.query(
      `SELECT id, reseller_id, request_id, change_desc AS note, transaction_amount AS amount, effective_date, created_at,
              COALESCE(
                to_jsonb(billing_logs)->>'log_type',
                CASE
                  WHEN LOWER(COALESCE(change_desc,'')) LIKE 'discount:%' THEN 'discount'
                  WHEN COALESCE(transaction_amount,0) > 0 THEN 'payment'
                  ELSE 'adjustment'
                END
              ) AS log_type
       FROM billing_logs WHERE reseller_id = $1 ORDER BY created_at DESC LIMIT 200`,
      [id],
    );

    const requests = await pool.query(
      `SELECT id, reseller_id, bw_type, change_type, amount AS requested_bw_mbps, requested_effective_date,
              reseller_note AS reason,
              COALESCE(engineer_status, admin_status, 'pending') AS status,
              created_at, implementation_date AS applied_at
       FROM bandwidth_requests WHERE reseller_id = $1 ORDER BY created_at DESC LIMIT 200`,
      [id],
    );

    const bills = await pool.query(
      `SELECT id, reseller_id, bill_month, amount AS final_amount, adjustment, previous_due, created_at
       FROM monthly_bills WHERE reseller_id = $1 ORDER BY bill_month DESC LIMIT 24`,
      [id],
    );

    res.json({
      reseller: resellerResult.rows[0],
      billingLogs: logs.rows,
      bandwidthRequests: requests.rows,
      monthlyBills: bills.rows,
    });
  } catch (error) {
    console.error("getResellerProfile:", error);
    res.status(500).json({ message: "Failed to load reseller profile" });
  }
};



module.exports = {
    listResellers,
    createReseller,
    getResellerProfile
}
