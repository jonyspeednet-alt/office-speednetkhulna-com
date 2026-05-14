const XLSX = require("xlsx");
const pool = require("../utilities/db");

const { initChannelPartnerTables } = require("../utilities/channelPartnerInit");
const {
  logResellerFinancialChange,
  getActor,
  getReqMeta,
} = require("../utilities/resellerFinancialAudit");

const parseAmount = (v, d = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};

/**
 * Calculate billing status based on amounts
 * @param {number} amountDue - Total amount due
 * @param {number} amountPaid - Amount paid
 * @returns {string} - 'realized', 'partial_deferred', or 'deferred'
 */
const calculateBillingStatus = (amountDue, amountPaid) => {
  const due = parseAmount(amountDue, 0);
  const paid = parseAmount(amountPaid, 0);

  if (paid >= due && due > 0) return 'realized';
  if (paid > 0 && paid < due) return 'partial_deferred';
  return 'deferred';
};

/**
 * Calculate realized and deferred amounts
 * @param {number} amountDue - Total amount due
 * @param {number} amountPaid - Amount paid
 * @returns {{realized: number, deferred: number}}
 */
const calculateRealizedDeferred = (amountDue, amountPaid) => {
  const due = parseAmount(amountDue, 0);
  const paid = parseAmount(amountPaid, 0);

  return {
    realized: paid,
    deferred: Math.max(0, due - paid)
  };
};

const getDhakaMonthYm = (date = new Date()) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Dhaka",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(date);
  const y = parts.find((p) => p.type === "year")?.value;
  const m = parts.find((p) => p.type === "month")?.value;
  return y && m ? `${y}-${m}` : `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
};

// ─── Channel Partner Users ─────────────────────────────────

const listUsers = async (req, res) => {
  try {
    await initChannelPartnerTables();
    const { resellerId } = req.params;
    const { status, search } = req.query;

    let sql = `SELECT * FROM channel_partner_users WHERE reseller_id = $1`;
    const params = [resellerId];
    let idx = 2;

    if (status) {
      sql += ` AND status = $${idx}`;
      params.push(status);
      idx++;
    }
    if (search) {
      sql += ` AND (user_name ILIKE $${idx} OR user_id_code ILIKE $${idx} OR phone ILIKE $${idx})`;
      params.push(`%${search}%`);
      idx++;
    }

    sql += ` ORDER BY user_name ASC`;
    const result = await pool.query(sql, params);
    res.json(result.rows);
  } catch (error) {
    console.error("channelPartner.listUsers:", error);
    res.status(500).json({ message: "Failed to list users" });
  }
};

const addUser = async (req, res) => {
  try {
    await initChannelPartnerTables();
    const { resellerId } = req.params;
    const { user_name, user_id_code, phone, package_name, monthly_rate } =
      req.body;

    if (!user_name) {
      return res.status(400).json({ message: "user_name is required" });
    }

    const result = await pool.query(
      `INSERT INTO channel_partner_users
        (reseller_id, user_name, user_id_code, phone, package_name, monthly_rate, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'active')
       RETURNING *`,
      [
        resellerId,
        user_name,
        user_id_code || "",
        phone || "",
        package_name || "",
        parseAmount(monthly_rate, 0),
      ]
    );

    await pool
      .query(
        `UPDATE resellers SET channel_user_count = (
        SELECT COUNT(*) FROM channel_partner_users
        WHERE reseller_id = $1 AND status = 'active'
      ) WHERE id = $1`,
        [resellerId]
      )
      .catch(() => { });

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error("channelPartner.addUser:", error);
    res.status(500).json({ message: "Failed to add user" });
  }
};

const updateUser = async (req, res) => {
  try {
    await initChannelPartnerTables();
    const { resellerId, userId } = req.params;
    const { user_name, user_id_code, phone, package_name, monthly_rate, status } =
      req.body;

    const result = await pool.query(
      `UPDATE channel_partner_users
       SET user_name = COALESCE($1, user_name),
           user_id_code = COALESCE($2, user_id_code),
           phone = COALESCE($3, phone),
           package_name = COALESCE($4, package_name),
           monthly_rate = COALESCE($5, monthly_rate),
           status = COALESCE($6, status),
           updated_at = NOW()
       WHERE id = $7 AND reseller_id = $8
       RETURNING *`,
      [
        user_name,
        user_id_code,
        phone,
        package_name,
        monthly_rate != null ? parseAmount(monthly_rate, 0) : null,
        status,
        userId,
        resellerId,
      ]
    );

    if (!result.rows.length) {
      return res.status(404).json({ message: "User not found" });
    }

    await pool
      .query(
        `UPDATE resellers SET channel_user_count = (
        SELECT COUNT(*) FROM channel_partner_users
        WHERE reseller_id = $1 AND status = 'active'
      ) WHERE id = $1`,
        [resellerId]
      )
      .catch(() => { });

    res.json(result.rows[0]);
  } catch (error) {
    console.error("channelPartner.updateUser:", error);
    res.status(500).json({ message: "Failed to update user" });
  }
};

const deleteUser = async (req, res) => {
  try {
    await initChannelPartnerTables();
    const { resellerId, userId } = req.params;

    await pool.query(
      `DELETE FROM channel_user_payments WHERE user_id = $1 AND reseller_id = $2`,
      [userId, resellerId]
    );

    const result = await pool.query(
      `DELETE FROM channel_partner_users WHERE id = $1 AND reseller_id = $2 RETURNING id`,
      [userId, resellerId]
    );

    if (!result.rows.length) {
      return res.status(404).json({ message: "User not found" });
    }

    await pool
      .query(
        `UPDATE resellers SET channel_user_count = (
        SELECT COUNT(*) FROM channel_partner_users
        WHERE reseller_id = $1 AND status = 'active'
      ) WHERE id = $1`,
        [resellerId]
      )
      .catch(() => { });

    res.json({ message: "User deleted" });
  } catch (error) {
    console.error("channelPartner.deleteUser:", error);
    res.status(500).json({ message: "Failed to delete user" });
  }
};

// ─── User Payments (Collection Tracking) ───────────────────

const getUserPayments = async (req, res) => {
  try {
    await initChannelPartnerTables();
    const { resellerId } = req.params;
    const month = req.query.month || getDhakaMonthYm();

    const result = await pool.query(
      `SELECT
        cup.id,
        cup.user_id,
        cpu.user_name,
        cpu.user_id_code,
        cpu.package_name,
        cpu.monthly_rate,
        cpu.phone,
        cpu.status AS user_status,
        cup.month,
        cup.amount_due,
        cup.amount_paid,
        cup.payment_date,
        cup.payment_status,
        cup.note
       FROM channel_user_payments cup
       JOIN channel_partner_users cpu ON cpu.id = cup.user_id
       WHERE cup.reseller_id = $1 AND cup.service_period = $2
       ORDER BY cpu.user_name ASC`,
      [resellerId, month]
    );

    res.json(result.rows);
  } catch (error) {
    console.error("channelPartner.getUserPayments:", error);
    res.status(500).json({ message: "Failed to load user payments" });
  }
};

const initMonthlyPayments = async (req, res) => {
  try {
    await initChannelPartnerTables();
    const { resellerId } = req.params;
    const month = req.body.month || getDhakaMonthYm();

    const existing = await pool.query(
      `SELECT COUNT(*) FROM channel_user_payments WHERE reseller_id = $1 AND month = $2`,
      [resellerId, month]
    );

    if (Number(existing.rows[0].count) > 0) {
      return res.json({ message: "Already initialized", month });
    }

    // Fetch users and their previous dues
    const prevMonth = (() => {
      const [y, m] = month.split("-");
      const d = new Date(parseInt(y), parseInt(m) - 2, 1);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    })();

    const users = await pool.query(
      `SELECT
        cpu.id,
        COALESCE(cpu.monthly_rate, 0)::numeric AS monthly_rate,
        COALESCE(prev.amount_due - prev.amount_paid, 0)::numeric AS prev_due
       FROM channel_partner_users cpu
       LEFT JOIN channel_user_payments prev ON prev.user_id = cpu.id AND prev.month = $2
       WHERE cpu.reseller_id = $1 AND cpu.status = 'active'`,
      [resellerId, prevMonth]
    );

    if (users.rows.length === 0) {
      return res.status(400).json({ message: "No active users found for this partner" });
    }

    const values = users.rows
      .map(
        (u) => {
          const amountDue = Number(u.monthly_rate) + Number(u.prev_due);
          return `(${resellerId}, ${u.id}, '${month}', '${month}', NOW(), 'deferred', ${amountDue}, 0, 0, ${amountDue}, 'unpaid')`;
        }
      )
      .join(", ");

    await pool.query(
      `INSERT INTO channel_user_payments (
        reseller_id, user_id, month, service_period, bill_issued_date, 
        billing_status, amount_due, amount_paid, realized_amount, 
        deferred_amount, payment_status
      )
       VALUES ${values}
       ON CONFLICT (user_id, month) DO UPDATE SET
         amount_due = EXCLUDED.amount_due,
         service_period = EXCLUDED.service_period,
         bill_issued_date = COALESCE(channel_user_payments.bill_issued_date, EXCLUDED.bill_issued_date),
         billing_status = EXCLUDED.billing_status,
         deferred_amount = EXCLUDED.deferred_amount,
         updated_at = NOW()`
    );


    res.json({ message: "Monthly payments initialized", month, count: users.rows.length });
  } catch (error) {
    console.error("channelPartner.initMonthlyPayments:", error);
    res.status(500).json({ message: "Failed to initialize monthly payments" });
  }
};

const recordUserPayment = async (req, res) => {
  try {
    await initChannelPartnerTables();
    const { resellerId } = req.params;
    const { user_id, month, amount_paid, payment_date, note } = req.body;

    if (!user_id || !month) {
      return res
        .status(400)
        .json({ message: "user_id and month are required" });
    }

    const paid = parseAmount(amount_paid, 0);

    // Get monthly rate to calculate amount_due
    const userRate = await pool.query(
      `SELECT COALESCE(monthly_rate, 0)::numeric AS monthly_rate FROM channel_partner_users WHERE id = $1`,
      [user_id]
    );
    const amountDue = Number(userRate.rows[0]?.monthly_rate || 0);

    const billingStatus = calculateBillingStatus(amountDue, paid);
    const { realized, deferred } = calculateRealizedDeferred(amountDue, paid);
    const paymentStatus = paid > 0 ? 'paid' : 'unpaid';

    const result = await pool.query(
      `INSERT INTO channel_user_payments (
        reseller_id, user_id, month, service_period, bill_issued_date,
        billing_status, amount_due, amount_paid, realized_amount, 
        deferred_amount, payment_date, payment_status, note
      )
       VALUES ($1, $2, $3, $3, NOW(), $4, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT (user_id, month) DO UPDATE SET
         amount_paid = $6,
         realized_amount = $7,
         deferred_amount = $8,
         payment_date = $9,
         billing_status = $4,
         payment_status = $10,
         note = COALESCE($11, channel_user_payments.note),
         updated_at = NOW()
       RETURNING *`,
      [
        resellerId, user_id, month, billingStatus, amountDue, paid,
        realized, deferred, payment_date || null, paymentStatus, note || ""
      ]
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error("channelPartner.recordUserPayment:", error);
    res.status(500).json({ message: "Failed to record payment" });
  }
};

const bulkRecordPayments = async (req, res) => {
  try {
    await initChannelPartnerTables();
    const { resellerId } = req.params;
    const { month, payments } = req.body;

    if (!month || !Array.isArray(payments)) {
      return res
        .status(400)
        .json({ message: "month and payments array are required" });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      for (const p of payments) {
        const paid = parseAmount(p.amount_paid, 0);

        // Get monthly rate to calculate amount_due
        const userRate = await client.query(
          `SELECT COALESCE(monthly_rate, 0)::numeric AS monthly_rate FROM channel_partner_users WHERE id = $1`,
          [p.user_id]
        );
        const amountDue = Number(userRate.rows[0]?.monthly_rate || 0);

        const billingStatus = calculateBillingStatus(amountDue, paid);
        const { realized, deferred } = calculateRealizedDeferred(amountDue, paid);
        const paymentStatus = paid > 0 ? 'paid' : 'unpaid';

        await client.query(
          `INSERT INTO channel_user_payments (
            reseller_id, user_id, month, service_period, bill_issued_date,
            billing_status, amount_due, amount_paid, realized_amount,
            deferred_amount, payment_date, payment_status, note
          )
           VALUES ($1, $2, $3, $3, NOW(), $4, $5, $6, $7, $8, $9, $10, $11)
           ON CONFLICT (user_id, month) DO UPDATE SET
             amount_paid = $6,
             realized_amount = $7,
             deferred_amount = $8,
             payment_date = $9,
             billing_status = $4,
             payment_status = $10,
             note = COALESCE($11, channel_user_payments.note),
             updated_at = NOW()`,
          [
            resellerId, p.user_id, month, billingStatus, amountDue, paid,
            realized, deferred, p.payment_date || null, paymentStatus, p.note || ""
          ]
        );
      }

      await client.query("COMMIT");
      res.json({ message: "Payments recorded", count: payments.length });
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("channelPartner.bulkRecordPayments:", error);
    res.status(500).json({ message: "Failed to record payments" });
  }
};

// ─── Commission ────────────────────────────────────────────

const getCommissionSummary = async (req, res) => {
  try {
    await initChannelPartnerTables();
    const { resellerId } = req.params;
    const month = req.query.month || getDhakaMonthYm();

    const resellerResult = await pool.query(
      `SELECT id, COALESCE(profit_share_percentage, 0)::numeric AS profit_share_percentage,
              COALESCE(channel_user_count, 0)::int AS channel_user_count
       FROM resellers WHERE id = $1`,
      [resellerId]
    );

    if (!resellerResult.rows.length) {
      return res.status(404).json({ message: "Reseller not found" });
    }

    const reseller = resellerResult.rows[0];

    const totalUsersResult = await pool.query(
      `SELECT COUNT(*) AS total,
              COUNT(*) FILTER (WHERE status = 'active') AS active
       FROM channel_partner_users WHERE reseller_id = $1`,
      [resellerId]
    );
    const totalUsers = Number(totalUsersResult.rows[0]?.total || 0);
    const activeUsers = Number(totalUsersResult.rows[0]?.active || 0);

    const collectionResult = await pool.query(
      `SELECT
        COUNT(*) FILTER (WHERE amount_paid > 0) AS paying_users,
        COUNT(*) FILTER (WHERE amount_paid = 0 OR amount_paid IS NULL) AS non_paying_users,
        COALESCE(SUM(amount_due), 0)::numeric AS total_due,
        COALESCE(SUM(amount_paid), 0)::numeric AS total_collected,
        COALESCE(SUM(realized_amount), 0)::numeric AS total_realized,
        COALESCE(SUM(deferred_amount), 0)::numeric AS total_deferred
       FROM channel_user_payments
       WHERE reseller_id = $1 AND service_period = $2`,
      [resellerId, month]
    );
    const collection = collectionResult.rows[0] || {};
    const totalCollected = Number(collection.total_collected || 0);
    const totalRealized = Number(collection.total_realized || 0);
    const totalDeferred = Number(collection.total_deferred || 0);
    const payingUsers = Number(collection.paying_users || 0);
    const profitPct = Number(reseller.profit_share_percentage || 0);
    // Commission calculated on realized amount only (actually paid)
    const grossCommission = totalRealized * (profitPct / 100);

    // Get partner advances for this month
    const advancesResult = await pool.query(
      `SELECT COALESCE(SUM(advance_amount), 0)::numeric AS total_advances
       FROM channel_partner_advances
       WHERE reseller_id = $1 
       AND advance_month = TO_DATE($2 || '-01', 'YYYY-MM-DD')
       AND settlement_status IN ('pending_adjustment', 'adjusted')`,
      [resellerId, month]
    );
    const partnerAdvances = Number(advancesResult.rows[0]?.total_advances || 0);

    const existingLog = await pool.query(
      `SELECT * FROM channel_commission_logs WHERE reseller_id = $1 AND month = $2`,
      [resellerId, month]
    );

    const commissionLog = existingLog.rows[0] || null;

    const totalPaidResult = await pool.query(
      `SELECT COALESCE(SUM(amount), 0)::numeric AS total
       FROM channel_commission_payments
       WHERE reseller_id = $1 AND commission_log_id IN (
         SELECT id FROM channel_commission_logs WHERE reseller_id = $1 AND month = $2
       )`,
      [resellerId, month]
    );
    const totalPaidToPartner = Number(totalPaidResult.rows[0]?.total || 0);

    const prevBalanceResult = await pool.query(
      `SELECT COALESCE(closing_balance, 0)::numeric AS balance
       FROM channel_commission_logs
       WHERE reseller_id = $1 AND month < $2
       ORDER BY month DESC LIMIT 1`,
      [resellerId, month]
    );
    const previousBalance = Number(
      prevBalanceResult.rows[0]?.balance || 0
    );

    res.json({
      month,
      profit_share_percentage: profitPct,
      total_users: totalUsers,
      active_users: activeUsers,
      paying_users: payingUsers,
      non_paying_users: Number(collection.non_paying_users || 0),
      total_due: Number(collection.total_due || 0),
      total_collected: totalCollected,
      total_realized: totalRealized,
      total_deferred: totalDeferred,
      gross_commission: grossCommission,
      partner_advances: partnerAdvances,
      adjustments: Number(commissionLog?.adjustments || 0),
      deductions: Number(commissionLog?.deductions || 0),
      net_commission: commissionLog
        ? Number(commissionLog.net_commission)
        : grossCommission - partnerAdvances,
      previous_balance: previousBalance,
      total_payable: commissionLog
        ? Number(commissionLog.total_payable)
        : grossCommission - partnerAdvances + previousBalance,
      paid_to_partner: totalPaidToPartner,
      closing_balance: commissionLog
        ? Number(commissionLog.closing_balance)
        : grossCommission - partnerAdvances + previousBalance - totalPaidToPartner,
      commission_status: commissionLog?.status || "not_generated",
      payment_status: commissionLog?.payment_status || "pending",
    });
  } catch (error) {
    console.error("channelPartner.getCommissionSummary:", error);
    res.status(500).json({ message: "Failed to load commission summary" });
  }
};

const generateCommissionInternal = async (resellerId, month) => {
  const resellerResult = await pool.query(
    `SELECT id, COALESCE(profit_share_percentage, 0)::numeric AS profit_share_percentage
     FROM resellers WHERE id = $1`,
    [resellerId]
  );
  if (!resellerResult.rows.length) return null;

  const profitPct = Number(resellerResult.rows[0].profit_share_percentage || 0);

  const collectionResult = await pool.query(
    `SELECT
      COUNT(*) AS total_users,
      COUNT(*) FILTER (WHERE amount_paid > 0) AS paying_users,
      COALESCE(SUM(amount_paid), 0)::numeric AS total_collected,
      COALESCE(SUM(realized_amount), 0)::numeric AS total_realized
     FROM channel_user_payments
     WHERE reseller_id = $1 AND service_period = $2`,
    [resellerId, month]
  );
  const stats = collectionResult.rows[0] || {};
  const totalCollected = Number(stats.total_collected || 0);
  const totalRealized = Number(stats.total_realized || 0);
  // Commission calculated on realized amount (actually paid), not total collected
  const grossCommission = totalRealized * (profitPct / 100);

  // Get partner advances for this month
  const advancesResult = await pool.query(
    `SELECT COALESCE(SUM(advance_amount), 0)::numeric AS total_advances
     FROM channel_partner_advances
     WHERE reseller_id = $1 
     AND advance_month = TO_DATE($2 || '-01', 'YYYY-MM-DD')
     AND settlement_status IN ('pending_adjustment', 'adjusted')`,
    [resellerId, month]
  );
  const partnerAdvances = Number(advancesResult.rows[0]?.total_advances || 0);

  const prevBalanceResult = await pool.query(
    `SELECT COALESCE(closing_balance, 0)::numeric AS balance
     FROM channel_commission_logs
     WHERE reseller_id = $1 AND month < $2
     ORDER BY month DESC LIMIT 1`,
    [resellerId, month]
  );
  const previousBalance = Number(prevBalanceResult.rows[0]?.balance || 0);

  const existingPaidResult = await pool.query(
    `SELECT COALESCE(SUM(amount), 0)::numeric AS total
     FROM channel_commission_payments
     WHERE reseller_id = $1 AND commission_log_id IN (
       SELECT id FROM channel_commission_logs WHERE reseller_id = $1 AND month = $2
     )`,
    [resellerId, month]
  );
  const alreadyPaid = Number(existingPaidResult.rows[0]?.total || 0);

  // Net commission = gross - partner advances (deduct advances from commission)
  const netCommission = grossCommission - partnerAdvances;
  const totalPayable = netCommission + previousBalance;
  const closingBalance = totalPayable - alreadyPaid;

  const paymentStatus =
    alreadyPaid >= totalPayable && totalPayable > 0
      ? "paid"
      : alreadyPaid > 0
        ? "partial"
        : "pending";

  const result = await pool.query(
    `INSERT INTO channel_commission_logs
      (reseller_id, month, total_users, paying_users, total_collection,
       profit_share_pct, gross_commission, adjustments, deductions,
       net_commission, previous_balance, total_payable,
       paid_amount, closing_balance, payment_status, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 0, $9, $10, $11, $12, $13, $14, 'draft')
     ON CONFLICT (reseller_id, month) DO UPDATE SET
       total_users = EXCLUDED.total_users,
       paying_users = EXCLUDED.paying_users,
       total_collection = EXCLUDED.total_collection,
       profit_share_pct = EXCLUDED.profit_share_pct,
       gross_commission = EXCLUDED.gross_commission,
       net_commission = EXCLUDED.gross_commission - $8 + COALESCE(channel_commission_logs.adjustments, 0) - COALESCE(channel_commission_logs.deductions, 0),
       previous_balance = EXCLUDED.previous_balance,
       total_payable = EXCLUDED.gross_commission - $8 + COALESCE(channel_commission_logs.adjustments, 0) - COALESCE(channel_commission_logs.deductions, 0) + EXCLUDED.previous_balance,
       paid_amount = $12,
       closing_balance = EXCLUDED.gross_commission - $8 + COALESCE(channel_commission_logs.adjustments, 0) - COALESCE(channel_commission_logs.deductions, 0) + EXCLUDED.previous_balance - $12,
       payment_status = $14,
       updated_at = NOW()
     RETURNING *`,
    [
      resellerId, month, Number(stats.total_users || 0), Number(stats.paying_users || 0),
      totalCollected, profitPct, grossCommission, partnerAdvances, netCommission, previousBalance, totalPayable,
      alreadyPaid, closingBalance, paymentStatus,
    ]
  );
  return result.rows[0];
};

const generateCommission = async (req, res) => {
  try {
    await initChannelPartnerTables();
    const { resellerId } = req.params;
    const month = req.body.month || getDhakaMonthYm();
    const result = await generateCommissionInternal(resellerId, month);
    if (!result) return res.status(404).json({ message: "Reseller not found" });
    res.json(result);
  } catch (error) {
    console.error("channelPartner.generateCommission:", error);
    res.status(500).json({ message: "Failed to generate commission" });
  }
};


const adjustCommission = async (req, res) => {
  try {
    await initChannelPartnerTables();
    const { resellerId, logId } = req.params;
    const { type, amount, note } = req.body;

    if (!type || !amount) {
      return res
        .status(400)
        .json({ message: "type and amount are required" });
    }

    const amt = parseAmount(amount, 0);
    const isDeduction = type === "deduction";

    const updateField = isDeduction ? "deductions" : "adjustments";
    const noteField = isDeduction ? "deduction_note" : "adjustment_note";

    const result = await pool.query(
      `UPDATE channel_commission_logs
       SET ${updateField} = $1,
           ${noteField} = $2,
           net_commission = gross_commission + CASE WHEN '${updateField}' = 'adjustments' THEN $1 ELSE adjustments END - CASE WHEN '${updateField}' = 'deductions' THEN $1 ELSE deductions END,
           total_payable = gross_commission + CASE WHEN '${updateField}' = 'adjustments' THEN $1 ELSE adjustments END - CASE WHEN '${updateField}' = 'deductions' THEN $1 ELSE deductions END + previous_balance,
           closing_balance = gross_commission + CASE WHEN '${updateField}' = 'adjustments' THEN $1 ELSE adjustments END - CASE WHEN '${updateField}' = 'deductions' THEN $1 ELSE deductions END + previous_balance - paid_amount,
           updated_at = NOW()
       WHERE id = $3 AND reseller_id = $4 AND status = 'draft'
       RETURNING *`,
      [amt, note || "", logId, resellerId]
    );

    if (!result.rows.length) {
      return res
        .status(404)
        .json({ message: "Commission log not found or already finalized" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error("channelPartner.adjustCommission:", error);
    res.status(500).json({ message: "Failed to adjust commission" });
  }
};

const finalizeCommission = async (req, res) => {
  try {
    await initChannelPartnerTables();
    const { resellerId, logId } = req.params;

    const result = await pool.query(
      `UPDATE channel_commission_logs
       SET status = 'finalized',
           finalized_at = NOW(),
           finalized_by = $1,
           updated_at = NOW()
       WHERE id = $2 AND reseller_id = $3 AND status = 'draft'
       RETURNING *`,
      [req.user?.id || null, logId, resellerId]
    );

    if (!result.rows.length) {
      return res
        .status(404)
        .json({ message: "Commission log not found or already finalized" });
    }

    await logResellerFinancialChange(pool, {
      reseller_id: Number(resellerId),
      ...getActor(req),
      ...getReqMeta(req),
      action_type: "FINALIZE_CHANNEL_COMMISSION",
      reference_table: "channel_commission_logs",
      reference_id: Number(logId),
      amount_before: 0,
      amount_after: Number(result.rows[0].net_commission),
      amount_delta: Number(result.rows[0].net_commission),
      note: `Commission finalized for month ${result.rows[0].month}`,
    });

    res.json(result.rows[0]);
  } catch (error) {
    console.error("channelPartner.finalizeCommission:", error);
    res.status(500).json({ message: "Failed to finalize commission" });
  }
};

const getCommissionHistory = async (req, res) => {
  try {
    await initChannelPartnerTables();
    const { resellerId } = req.params;

    const result = await pool.query(
      `SELECT * FROM channel_commission_logs
       WHERE reseller_id = $1
       ORDER BY month DESC
       LIMIT 12`,
      [resellerId]
    );

    res.json(result.rows);
  } catch (error) {
    console.error("channelPartner.getCommissionHistory:", error);
    res.status(500).json({ message: "Failed to load commission history" });
  }
};

// ─── Commission Payments (to partner) ──────────────────────

const recordCommissionPayment = async (req, res) => {
  try {
    await initChannelPartnerTables();
    const { resellerId } = req.params;
    const {
      commission_log_id,
      amount,
      payment_method,
      payment_date,
      reference_no,
      note,
    } = req.body;

    if (!amount || !payment_date) {
      return res
        .status(400)
        .json({ message: "amount and payment_date are required" });
    }

    const paid = parseAmount(amount, 0);
    if (paid <= 0) {
      return res.status(400).json({ message: "amount must be positive" });
    }

    const result = await pool.query(
      `INSERT INTO channel_commission_payments
        (reseller_id, commission_log_id, amount, payment_method, payment_date, reference_no, note, recorded_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        resellerId,
        commission_log_id || null,
        paid,
        payment_method || "Cash",
        payment_date,
        reference_no || "",
        note || "",
        req.user?.id || null,
      ]
    );

    if (commission_log_id) {
      const totalPaidResult = await pool.query(
        `SELECT COALESCE(SUM(amount), 0)::numeric AS total
         FROM channel_commission_payments
         WHERE commission_log_id = $1`,
        [commission_log_id]
      );
      const totalPaid = Number(totalPaidResult.rows[0]?.total || 0);

      await pool.query(
        `UPDATE channel_commission_logs
         SET paid_amount = $1,
             closing_balance = total_payable - $1,
             payment_status = CASE
               WHEN $1 >= total_payable AND total_payable > 0 THEN 'paid'
               WHEN $1 > 0 THEN 'partial'
               ELSE 'pending'
             END,
             updated_at = NOW()
         WHERE id = $2`,
        [totalPaid, commission_log_id]
      );
    }

    await logResellerFinancialChange(pool, {
      reseller_id: Number(resellerId),
      ...getActor(req),
      ...getReqMeta(req),
      action_type: "CHANNEL_COMMISSION_PAYMENT",
      reference_table: "channel_commission_payments",
      reference_id: result.rows[0].id,
      amount_before: 0,
      amount_after: paid,
      amount_delta: paid,
      note: `Commission payment: ${paid} via ${payment_method || "Cash"}`,
    });

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error("channelPartner.recordCommissionPayment:", error);
    res.status(500).json({ message: "Failed to record commission payment" });
  }
};

const getCommissionPayments = async (req, res) => {
  try {
    await initChannelPartnerTables();
    const { resellerId } = req.params;

    const result = await pool.query(
      `SELECT ccp.*, ccl.month AS commission_month
       FROM channel_commission_payments ccp
       LEFT JOIN channel_commission_logs ccl ON ccl.id = ccp.commission_log_id
       WHERE ccp.reseller_id = $1
       ORDER BY ccp.created_at DESC
       LIMIT 50`,
      [resellerId]
    );

    res.json(result.rows);
  } catch (error) {
    console.error("channelPartner.getCommissionPayments:", error);
    res.status(500).json({ message: "Failed to load commission payments" });
  }
};

// ─── Statement (combined view) ─────────────────────────────

const getStatement = async (req, res) => {
  try {
    await initChannelPartnerTables();
    const { resellerId } = req.params;

    const result = await pool.query(
      `SELECT
        'commission'::text AS type,
        ccl.id,
        ccl.net_commission AS amount,
        (ccl.month || '-01')::date AS date,
        'কমিশন - ' || ccl.month || ' (ইউজার: ' || ccl.paying_users || ', কালেকশন: ' || ccl.total_collection || ', ' || ccl.profit_share_pct || '%)' AS description,
        ccl.month
       FROM channel_commission_logs ccl
       WHERE ccl.reseller_id = $1 AND ccl.status = 'finalized'
       UNION ALL
       SELECT
        'payment'::text AS type,
        ccp.id,
        ccp.amount,
        ccp.payment_date AS date,
        'পেমেন্ট - ' || ccp.payment_method || CASE WHEN ccp.reference_no != '' THEN ' (Ref: ' || ccp.reference_no || ')' ELSE '' END AS description,
        COALESCE(ccl.month, TO_CHAR(ccp.payment_date, 'YYYY-MM')) AS month
       FROM channel_commission_payments ccp
       LEFT JOIN channel_commission_logs ccl ON ccl.id = ccp.commission_log_id
       WHERE ccp.reseller_id = $1
       UNION ALL
       SELECT
        'adjustment'::text AS type,
        ccl.id,
        ccl.adjustments AS amount,
        (ccl.month || '-01')::date AS date,
        'সমন্বয় - ' || COALESCE(ccl.adjustment_note, '') AS description,
        ccl.month
       FROM channel_commission_logs ccl
       WHERE ccl.reseller_id = $1 AND ccl.adjustments != 0
       UNION ALL
       SELECT
        'deduction'::text AS type,
        ccl.id,
        ccl.deductions AS amount,
        (ccl.month || '-01')::date AS date,
        'কর্তন - ' || COALESCE(ccl.deduction_note, '') AS description,
        ccl.month
       FROM channel_commission_logs ccl
       WHERE ccl.reseller_id = $1 AND ccl.deductions != 0
       UNION ALL
       SELECT
        'advance'::text AS type,
        cpa.id,
        cpa.advance_amount AS amount,
        cpa.advance_month AS date,
        'অগ্রিম পেমেন্ট - ' || COALESCE(cpu.user_name, 'Unknown') || ' (' || cpa.advance_type || ')' AS description,
        TO_CHAR(cpa.advance_month, 'YYYY-MM') AS month
       FROM channel_partner_advances cpa
       LEFT JOIN channel_partner_users cpu ON cpu.id = cpa.user_id
       WHERE cpa.reseller_id = $1 AND cpa.settlement_status IN ('adjusted', 'pending_adjustment')
       ORDER BY date DESC
       LIMIT 50`,
      [resellerId]
    );

    res.json(result.rows);
  } catch (error) {
    console.error("channelPartner.getStatement:", error);
    res.status(500).json({ message: "Failed to load statement" });
  }
};

// ─── Excel Import ──────────────────────────────────────────

const importChannelData = async (req, res) => {
  try {
    await initChannelPartnerTables();
    const { resellerId } = req.params;
    const { month } = req.body;

    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }
    if (!month) {
      return res.status(400).json({ message: "Month is required" });
    }

    const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet);

    if (data.length === 0) {
      return res.status(400).json({ message: "Excel file is empty" });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      let updatedCount = 0;
      let createdCount = 0;

      for (const row of data) {
        // Map columns based on user request (Customer Name, Receive Amount)
        const userName = row["Customer Name"] || row["customer_name"];
        const receiveAmount = parseAmount(row["Receive Amount"] || row["receive_amount"], 0);

        if (!userName) continue;

        // 1. Find or create user
        let userResult = await client.query(
          `SELECT id FROM channel_partner_users WHERE reseller_id = $1 AND user_name = $2`,
          [resellerId, userName]
        );

        let userId;
        if (userResult.rows.length > 0) {
          userId = userResult.rows[0].id;
          updatedCount++;
        } else {
          const newUser = await client.query(
            `INSERT INTO channel_partner_users (reseller_id, user_name, status, monthly_rate)
             VALUES ($1, $2, 'active', $3)
             RETURNING id`,
            [resellerId, userName, receiveAmount] // Assuming initial receive amount as monthly rate if new
          );
          userId = newUser.rows[0].id;
          createdCount++;
        }

        // 2. Upsert payment for the month
        const billingStatus = calculateBillingStatus(receiveAmount, receiveAmount);
        const { realized, deferred } = calculateRealizedDeferred(receiveAmount, receiveAmount);

        await client.query(
          `INSERT INTO channel_user_payments (
            reseller_id, user_id, month, service_period, bill_issued_date,
            billing_status, amount_due, amount_paid, realized_amount,
            deferred_amount, payment_status, payment_date
          )
           VALUES ($1, $2, $3, $3, NOW(), $4, $5, $5, $6, $7, 'paid', NOW())
           ON CONFLICT (user_id, month) DO UPDATE SET
             amount_paid = EXCLUDED.amount_paid,
             amount_due = EXCLUDED.amount_due,
             realized_amount = EXCLUDED.realized_amount,
             deferred_amount = EXCLUDED.deferred_amount,
             billing_status = EXCLUDED.billing_status,
             payment_status = 'paid',
             payment_date = NOW(),
             updated_at = NOW()`,
          [resellerId, userId, month, billingStatus, receiveAmount, realized, deferred]
        );
      }

      // 3. Update aggregate count
      await client.query(
        `UPDATE resellers SET channel_user_count = (
          SELECT COUNT(*) FROM channel_partner_users
          WHERE reseller_id = $1 AND status = 'active'
        ) WHERE id = $1`,
        [resellerId]
      );

      await client.query("COMMIT");

      // Auto-trigger commission sync for the month
      try {
        await generateCommissionInternal(resellerId, month);
      } catch (ce) {
        console.warn("Commission sync after import failed:", ce.message);
      }

      res.json({
        message: "Import successful",
        created: createdCount,
        updated: updatedCount,
        total: data.length
      });

    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("channelPartner.importChannelData:", error);
    res.status(500).json({ message: "Failed to import data: " + error.message });
  }
};

// ─── Partner Advance Import (Excel) ────────────────────────

const importPartnerAdvances = async (req, res) => {
  try {
    await initChannelPartnerTables();
    const { resellerId } = req.params;
    const { month } = req.body;

    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }
    if (!month) {
      return res.status(400).json({ message: "Month is required (YYYY-MM format)" });
    }

    const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet);

    if (data.length === 0) {
      return res.status(400).json({ message: "Excel file is empty" });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      let createdCount = 0;
      let totalAmount = 0;

      for (const row of data) {
        const userName = row["User Name"] || row["user_name"];
        const advanceAmount = parseAmount(row["Advance Amount"] || row["advance_amount"], 0);
        const advanceType = row["Advance Type"] || row["advance_type"] || "direct_payment";
        const notes = row["Notes"] || row["notes"] || "";

        if (!userName || advanceAmount <= 0) continue;

        // Find user by name
        const userResult = await client.query(
          `SELECT id FROM channel_partner_users WHERE reseller_id = $1 AND user_name ILIKE $2`,
          [resellerId, userName]
        );

        if (userResult.rows.length === 0) {
          console.warn(`User not found: ${userName}`);
          continue;
        }

        const userId = userResult.rows[0].id;
        const advanceMonth = new Date(month + "-01");

        // Insert advance
        await client.query(
          `INSERT INTO channel_partner_advances 
            (reseller_id, user_id, advance_month, advance_amount, advance_type, settlement_status, notes, created_by, created_at)
           VALUES ($1, $2, $3, $4, $5, 'pending_adjustment', $6, $7, NOW())
           ON CONFLICT DO NOTHING`,
          [resellerId, userId, advanceMonth, advanceAmount, advanceType, notes, req.user?.id || null]
        );

        createdCount++;
        totalAmount += advanceAmount;
      }

      await client.query("COMMIT");

      res.json({
        message: "Partner advances imported successfully",
        created: createdCount,
        total_amount: totalAmount,
        total_rows: data.length
      });

    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("channelPartner.importPartnerAdvances:", error);
    res.status(500).json({ message: "Failed to import partner advances: " + error.message });
  }
};

// ─── Reconciliation Workflow (Phase 4) ─────────────────────

const { generateReconciliationReport } = require('../utilities/reportGenerator');

/**
 * Initiate reconciliation for a month
 * Creates a reconciliation record with snapshot of all data
 */
const initiateReconciliation = async (req, res) => {
  try {
    await initChannelPartnerTables();
    const { resellerId } = req.params;
    const { month } = req.body; // YYYY-MM format
    const userId = req.user?.id || 1;

    if (!month) {
      return res.status(400).json({
        success: false,
        error: 'Month is required',
        message: 'Please provide month in YYYY-MM format'
      });
    }

    // Validate month format
    if (!/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid month format',
        message: 'Month must be in YYYY-MM format'
      });
    }

    // Check if month is in the future
    const monthDate = new Date(month + '-01');
    const now = new Date();
    if (monthDate > now) {
      return res.status(400).json({
        success: false,
        error: 'Cannot reconcile future month',
        message: 'Reconciliation can only be done for past or current months'
      });
    }

    // Check if already reconciled
    const existingResult = await pool.query(`
      SELECT id, reconciliation_status, approved_at
      FROM billing_reconciliation_logs
      WHERE reseller_id = $1 AND reconciliation_month = $2
    `, [resellerId, monthDate]);

    if (existingResult.rows.length > 0) {
      const existing = existingResult.rows[0];
      if (existing.reconciliation_status === 'approved') {
        return res.status(400).json({
          success: false,
          error: 'Month already reconciled',
          message: 'This month has already been approved and locked',
          reconciliation_id: existing.id,
          approved_at: existing.approved_at
        });
      }
      // If pending or rejected, allow re-initiation
    }

    // Get commission summary
    const summaryResult = await pool.query(`
      SELECT 
        COALESCE(SUM(amount_paid), 0)::numeric AS total_collected,
        COALESCE(SUM(realized_amount), 0)::numeric AS total_realized,
        COALESCE(SUM(deferred_amount), 0)::numeric AS total_deferred
      FROM channel_user_payments
      WHERE reseller_id = $1 
        AND service_period = $2
        AND deleted_at IS NULL
    `, [resellerId, month]);

    const summary = summaryResult.rows[0];

    // Get partner profit share percentage
    const partnerResult = await pool.query(`
      SELECT profit_share_percentage FROM resellers WHERE id = $1
    `, [resellerId]);

    if (partnerResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Reseller not found'
      });
    }

    const profitPct = Number(partnerResult.rows[0].profit_share_percentage || 0);

    // Calculate gross commission
    const totalRealized = Number(summary.total_realized || 0);
    const grossCommission = totalRealized * (profitPct / 100);

    // Get partner advances
    const advancesResult = await pool.query(`
      SELECT COALESCE(SUM(advance_amount), 0)::numeric AS total_advances
      FROM channel_partner_advances
      WHERE reseller_id = $1 
        AND advance_month = $2
        AND settlement_status IN ('pending_adjustment', 'adjusted')
    `, [resellerId, monthDate]);

    const partnerAdvances = Number(advancesResult.rows[0].total_advances || 0);

    // Calculate net commission
    const netCommission = grossCommission - partnerAdvances;

    // Get snapshot data
    const paymentsResult = await pool.query(`
      SELECT 
        cup.id, cup.user_id, cpu.user_name,
        cup.amount_paid, cup.realized_amount, cup.deferred_amount,
        cup.billing_status, cup.service_period
      FROM channel_user_payments cup
      LEFT JOIN channel_partner_users cpu ON cpu.id = cup.user_id
      WHERE cup.reseller_id = $1 
        AND cup.service_period = $2
        AND cup.deleted_at IS NULL
      ORDER BY cpu.user_name
    `, [resellerId, month]);

    const advancesListResult = await pool.query(`
      SELECT 
        cpa.id, cpa.user_id, cpu.user_name,
        cpa.advance_amount, cpa.advance_type, cpa.notes,
        cpa.advance_month, cpa.settlement_status
      FROM channel_partner_advances cpa
      LEFT JOIN channel_partner_users cpu ON cpu.id = cpa.user_id
      WHERE cpa.reseller_id = $1 
        AND cpa.advance_month = $2
        AND cpa.settlement_status IN ('pending_adjustment', 'adjusted')
      ORDER BY cpu.user_name
    `, [resellerId, monthDate]);

    const snapshot = {
      payments: paymentsResult.rows,
      advances: advancesListResult.rows,
      summary: {
        total_collected: summary.total_collected,
        total_realized: summary.total_realized,
        total_deferred: summary.total_deferred,
        gross_commission: grossCommission,
        partner_advances: partnerAdvances,
        net_commission: netCommission
      }
    };

    // Insert or update reconciliation record
    const reconciliationResult = await pool.query(`
      INSERT INTO billing_reconciliation_logs (
        reseller_id, reconciliation_month,
        total_collected, total_realized, total_deferred,
        gross_commission, partner_advances, net_commission,
        reconciliation_status, initiated_by, snapshot_data
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending', $9, $10)
      ON CONFLICT (reseller_id, reconciliation_month) 
      DO UPDATE SET
        total_collected = EXCLUDED.total_collected,
        total_realized = EXCLUDED.total_realized,
        total_deferred = EXCLUDED.total_deferred,
        gross_commission = EXCLUDED.gross_commission,
        partner_advances = EXCLUDED.partner_advances,
        net_commission = EXCLUDED.net_commission,
        reconciliation_status = 'pending',
        initiated_by = EXCLUDED.initiated_by,
        snapshot_data = EXCLUDED.snapshot_data,
        updated_at = NOW()
      RETURNING *
    `, [
      resellerId, monthDate,
      summary.total_collected, summary.total_realized, summary.total_deferred,
      grossCommission, partnerAdvances, netCommission,
      userId, JSON.stringify(snapshot)
    ]);

    res.json({
      success: true,
      message: 'Reconciliation initiated successfully',
      data: reconciliationResult.rows[0]
    });

  } catch (error) {
    console.error('channelPartner.initiateReconciliation:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to initiate reconciliation',
      message: error.message
    });
  }
};

/**
 * Approve reconciliation
 * Locks the month and generates PDF report
 */
const approveReconciliation = async (req, res) => {
  try {
    await initChannelPartnerTables();
    const { resellerId, reconciliationId } = req.params;
    const { notes } = req.body;
    const userId = req.user?.id || 1;

    // Get reconciliation
    const reconciliationResult = await pool.query(`
      SELECT brl.*, cp.name AS partner_name, cp.profit_share_percentage AS profit_share_pct
      FROM billing_reconciliation_logs brl
      JOIN resellers cp ON cp.id = brl.reseller_id
      WHERE brl.id = $1 AND brl.reseller_id = $2
    `, [reconciliationId, resellerId]);

    if (reconciliationResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Reconciliation not found'
      });
    }

    const reconciliation = reconciliationResult.rows[0];

    // Check if already approved
    if (reconciliation.reconciliation_status === 'approved') {
      return res.status(400).json({
        success: false,
        error: 'Already approved',
        message: 'This reconciliation has already been approved',
        approved_at: reconciliation.approved_at
      });
    }

    // Check if pending
    if (reconciliation.reconciliation_status !== 'pending') {
      return res.status(400).json({
        success: false,
        error: 'Cannot approve',
        message: `Reconciliation status is ${reconciliation.reconciliation_status}. Only pending reconciliations can be approved.`
      });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Update reconciliation status
      await client.query(`
        UPDATE billing_reconciliation_logs
        SET reconciliation_status = 'approved',
            approved_by = $1,
            approved_at = NOW(),
            updated_at = NOW()
        WHERE id = $2
      `, [userId, reconciliationId]);

      // Lock the month in state machine
      await client.query(`
        INSERT INTO channel_settlement_state_machine (
          reseller_id, settlement_month, current_state, locked_at
        ) VALUES ($1, $2, 'approved', NOW())
        ON CONFLICT (reseller_id, settlement_month) 
        DO UPDATE SET 
          current_state = 'approved', 
          locked_at = NOW(),
          updated_at = NOW()
      `, [resellerId, reconciliation.reconciliation_month]);

      await client.query('COMMIT');

      // Generate PDF report (async, don't wait)
      generateReconciliationReport(reconciliation)
        .then(pdfPath => {
          console.log(`PDF report generated: ${pdfPath}`);
        })
        .catch(error => {
          console.error('Error generating PDF report:', error);
        });

      res.json({
        success: true,
        message: 'Reconciliation approved successfully',
        message_bn: 'নিষ্পত্তি সফলভাবে অনুমোদিত হয়েছে',
        reconciliation_id: reconciliationId,
        status: 'approved'
      });

    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

  } catch (error) {
    console.error('channelPartner.approveReconciliation:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to approve reconciliation',
      message: error.message
    });
  }
};

/**
 * Reject reconciliation
 * Returns to pending status with reason
 */
const rejectReconciliation = async (req, res) => {
  try {
    await initChannelPartnerTables();
    const { resellerId, reconciliationId } = req.params;
    const { reason } = req.body;
    const userId = req.user?.id || 1;

    if (!reason) {
      return res.status(400).json({
        success: false,
        error: 'Reason is required',
        message: 'Please provide a reason for rejection'
      });
    }

    // Get reconciliation
    const reconciliationResult = await pool.query(`
      SELECT * FROM billing_reconciliation_logs
      WHERE id = $1 AND reseller_id = $2
    `, [reconciliationId, resellerId]);

    if (reconciliationResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Reconciliation not found'
      });
    }

    const reconciliation = reconciliationResult.rows[0];

    // Check if can be rejected
    if (reconciliation.reconciliation_status === 'approved') {
      return res.status(400).json({
        success: false,
        error: 'Cannot reject approved reconciliation',
        message: 'Approved reconciliations cannot be rejected'
      });
    }

    // Update status
    await pool.query(`
      UPDATE billing_reconciliation_logs
      SET reconciliation_status = 'rejected',
          rejection_reason = $1,
          updated_at = NOW()
      WHERE id = $2
    `, [reason, reconciliationId]);

    res.json({
      success: true,
      message: 'Reconciliation rejected',
      message_bn: 'নিষ্পত্তি প্রত্যাখ্যাত হয়েছে',
      reconciliation_id: reconciliationId,
      status: 'rejected',
      reason: reason
    });

  } catch (error) {
    console.error('channelPartner.rejectReconciliation:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to reject reconciliation',
      message: error.message
    });
  }
};

/**
 * Get list of reconciliations
 */
const getReconciliations = async (req, res) => {
  try {
    await initChannelPartnerTables();
    const { resellerId } = req.params;
    const { status, limit = 10 } = req.query;

    let query = `
      SELECT 
        brl.*,
        u1.name AS initiated_by_name,
        u2.name AS approved_by_name
      FROM billing_reconciliation_logs brl
      LEFT JOIN users u1 ON u1.id = brl.initiated_by
      LEFT JOIN users u2 ON u2.id = brl.approved_by
      WHERE brl.reseller_id = $1
    `;

    const params = [resellerId];

    if (status) {
      query += ` AND brl.reconciliation_status = $2`;
      params.push(status);
    }

    query += ` ORDER BY brl.reconciliation_month DESC LIMIT $${params.length + 1}`;
    params.push(parseInt(limit));

    const result = await pool.query(query, params);

    res.json({
      success: true,
      data: result.rows,
      count: result.rows.length
    });

  } catch (error) {
    console.error('channelPartner.getReconciliations:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to load reconciliations',
      message: error.message
    });
  }
};

/**
 * Get reconciliation details
 */
const getReconciliationDetails = async (req, res) => {
  try {
    await initChannelPartnerTables();
    const { reconciliationId } = req.params;

    const result = await pool.query(`
      SELECT 
        brl.*,
        cp.name AS partner_name,
        cp.profit_share_percentage AS profit_share_pct,
        u1.name AS initiated_by_name,
        u2.name AS approved_by_name
      FROM billing_reconciliation_logs brl
      JOIN resellers cp ON cp.id = brl.reseller_id
      LEFT JOIN users u1 ON u1.id = brl.initiated_by
      LEFT JOIN users u2 ON u2.id = brl.approved_by
      WHERE brl.id = $1
    `, [reconciliationId]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Reconciliation not found'
      });
    }

    res.json({
      success: true,
      data: result.rows[0]
    });

  } catch (error) {
    console.error('channelPartner.getReconciliationDetails:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to load reconciliation details',
      message: error.message
    });
  }
};

/**
 * Download reconciliation report (PDF)
 */
const downloadReconciliationReport = async (req, res) => {
  try {
    await initChannelPartnerTables();
    const { reconciliationId } = req.params;

    // Get reconciliation with partner details
    const result = await pool.query(`
      SELECT 
        brl.*,
        cp.name AS partner_name,
        cp.profit_share_percentage AS profit_share_pct,
        u1.name AS initiated_by_name,
        u2.name AS approved_by_name
      FROM billing_reconciliation_logs brl
      JOIN resellers cp ON cp.id = brl.reseller_id
      LEFT JOIN users u1 ON u1.id = brl.initiated_by
      LEFT JOIN users u2 ON u2.id = brl.approved_by
      WHERE brl.id = $1
    `, [reconciliationId]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Reconciliation not found'
      });
    }

    const reconciliation = result.rows[0];

    // Generate PDF
    const pdfPath = await generateReconciliationReport(reconciliation);

    res.json({
      success: true,
      pdf_url: pdfPath,
      message: 'Report generated successfully'
    });

  } catch (error) {
    console.error('channelPartner.downloadReconciliationReport:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate report',
      message: error.message
    });
  }
};

module.exports = {
  listUsers,
  addUser,
  updateUser,
  deleteUser,
  getUserPayments,
  initMonthlyPayments,
  recordUserPayment,
  bulkRecordPayments,
  getCommissionSummary,
  generateCommission,
  adjustCommission,
  finalizeCommission,
  getCommissionHistory,
  recordCommissionPayment,
  getCommissionPayments,
  getStatement,
  importChannelData,
  importPartnerAdvances,
  // Phase 4: Reconciliation
  initiateReconciliation,
  approveReconciliation,
  rejectReconciliation,
  getReconciliations,
  getReconciliationDetails,
  downloadReconciliationReport,
};

