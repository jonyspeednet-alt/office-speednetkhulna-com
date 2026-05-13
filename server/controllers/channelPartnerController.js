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
      .catch(() => {});

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
      .catch(() => {});

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
      .catch(() => {});

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
       WHERE cup.reseller_id = $1 AND cup.month = $2
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

    const users = await pool.query(
      `SELECT id, monthly_rate FROM channel_partner_users
       WHERE reseller_id = $1 AND status = 'active'`,
      [resellerId]
    );

    if (users.rows.length === 0) {
      return res
        .status(400)
        .json({ message: "No active users found for this partner" });
    }

    const values = users.rows
      .map(
        (u) =>
          `(${resellerId}, ${u.id}, '${month}', ${parseAmount(u.monthly_rate, 0)}, 0, 'unpaid')`
      )
      .join(", ");

    await pool.query(
      `INSERT INTO channel_user_payments (reseller_id, user_id, month, amount_due, amount_paid, payment_status)
       VALUES ${values}
       ON CONFLICT (user_id, month) DO NOTHING`
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

    const result = await pool.query(
      `INSERT INTO channel_user_payments (reseller_id, user_id, month, amount_due, amount_paid, payment_date, payment_status, note)
       VALUES ($1, $2, $3,
         COALESCE((SELECT monthly_rate FROM channel_partner_users WHERE id = $2), 0),
         $4, $5,
         CASE WHEN $4 > 0 THEN 'paid' ELSE 'unpaid' END,
         $6
       )
       ON CONFLICT (user_id, month) DO UPDATE SET
         amount_paid = $4,
         payment_date = $5,
         payment_status = CASE WHEN $4 > 0 THEN 'paid' ELSE 'unpaid' END,
         note = COALESCE($6, channel_user_payments.note),
         updated_at = NOW()
       RETURNING *`,
      [resellerId, user_id, month, paid, payment_date || null, note || ""]
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
        await client.query(
          `INSERT INTO channel_user_payments (reseller_id, user_id, month, amount_due, amount_paid, payment_date, payment_status, note)
           VALUES ($1, $2, $3,
             COALESCE((SELECT monthly_rate FROM channel_partner_users WHERE id = $2), 0),
             $4, $5,
             CASE WHEN $4 > 0 THEN 'paid' ELSE 'unpaid' END,
             $6
           )
           ON CONFLICT (user_id, month) DO UPDATE SET
             amount_paid = $4,
             payment_date = $5,
             payment_status = CASE WHEN $4 > 0 THEN 'paid' ELSE 'unpaid' END,
             note = COALESCE($6, channel_user_payments.note),
             updated_at = NOW()`,
          [
            resellerId,
            p.user_id,
            month,
            paid,
            p.payment_date || null,
            p.note || "",
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
        COALESCE(SUM(amount_paid), 0)::numeric AS total_collected
       FROM channel_user_payments
       WHERE reseller_id = $1 AND month = $2`,
      [resellerId, month]
    );
    const collection = collectionResult.rows[0] || {};
    const totalCollected = Number(collection.total_collected || 0);
    const payingUsers = Number(collection.paying_users || 0);
    const profitPct = Number(reseller.profit_share_percentage || 0);
    const grossCommission =
      Math.round(totalCollected * (profitPct / 100) * 100) / 100;

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
      gross_commission: grossCommission,
      adjustments: Number(commissionLog?.adjustments || 0),
      deductions: Number(commissionLog?.deductions || 0),
      net_commission: commissionLog
        ? Number(commissionLog.net_commission)
        : grossCommission,
      previous_balance: previousBalance,
      total_payable: commissionLog
        ? Number(commissionLog.total_payable)
        : grossCommission + previousBalance,
      paid_to_partner: totalPaidToPartner,
      closing_balance: commissionLog
        ? Number(commissionLog.closing_balance)
        : grossCommission + previousBalance - totalPaidToPartner,
      commission_status: commissionLog?.status || "not_generated",
      payment_status: commissionLog?.payment_status || "pending",
    });
  } catch (error) {
    console.error("channelPartner.getCommissionSummary:", error);
    res.status(500).json({ message: "Failed to load commission summary" });
  }
};

const generateCommission = async (req, res) => {
  try {
    await initChannelPartnerTables();
    const { resellerId } = req.params;
    const month = req.body.month || getDhakaMonthYm();

    const resellerResult = await pool.query(
      `SELECT id, COALESCE(profit_share_percentage, 0)::numeric AS profit_share_percentage
       FROM resellers WHERE id = $1`,
      [resellerId]
    );
    if (!resellerResult.rows.length) {
      return res.status(404).json({ message: "Reseller not found" });
    }

    const profitPct = Number(
      resellerResult.rows[0].profit_share_percentage || 0
    );

    const collectionResult = await pool.query(
      `SELECT
        COUNT(*) AS total_users,
        COUNT(*) FILTER (WHERE amount_paid > 0) AS paying_users,
        COALESCE(SUM(amount_paid), 0)::numeric AS total_collected
       FROM channel_user_payments
       WHERE reseller_id = $1 AND month = $2`,
      [resellerId, month]
    );
    const stats = collectionResult.rows[0] || {};
    const totalCollected = Number(stats.total_collected || 0);
    const grossCommission =
      Math.round(totalCollected * (profitPct / 100) * 100) / 100;

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

    const existingPaidResult = await pool.query(
      `SELECT COALESCE(SUM(amount), 0)::numeric AS total
       FROM channel_commission_payments
       WHERE reseller_id = $1 AND commission_log_id IN (
         SELECT id FROM channel_commission_logs WHERE reseller_id = $1 AND month = $2
       )`,
      [resellerId, month]
    );
    const alreadyPaid = Number(existingPaidResult.rows[0]?.total || 0);

    const netCommission = grossCommission;
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
       VALUES ($1, $2, $3, $4, $5, $6, $7, 0, 0, $7, $8, $9, $10, $11, $12, 'draft')
       ON CONFLICT (reseller_id, month) DO UPDATE SET
         total_users = EXCLUDED.total_users,
         paying_users = EXCLUDED.paying_users,
         total_collection = EXCLUDED.total_collection,
         profit_share_pct = EXCLUDED.profit_share_pct,
         gross_commission = EXCLUDED.gross_commission,
         net_commission = EXCLUDED.gross_commission + channel_commission_logs.adjustments - channel_commission_logs.deductions,
         previous_balance = EXCLUDED.previous_balance,
         total_payable = EXCLUDED.gross_commission + channel_commission_logs.adjustments - channel_commission_logs.deductions + EXCLUDED.previous_balance,
         paid_amount = $10,
         closing_balance = EXCLUDED.gross_commission + channel_commission_logs.adjustments - channel_commission_logs.deductions + EXCLUDED.previous_balance - $10,
         payment_status = $12,
         updated_at = NOW()
       RETURNING *`,
      [
        resellerId,
        month,
        Number(stats.total_users || 0),
        Number(stats.paying_users || 0),
        totalCollected,
        profitPct,
        grossCommission,
        previousBalance,
        totalPayable,
        alreadyPaid,
        closingBalance,
        paymentStatus,
      ]
    );

    res.json(result.rows[0]);
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
        await client.query(
          `INSERT INTO channel_user_payments (reseller_id, user_id, month, amount_due, amount_paid, payment_status, payment_date)
           VALUES ($1, $2, $3, $4, $4, 'paid', NOW())
           ON CONFLICT (user_id, month) DO UPDATE SET
             amount_paid = EXCLUDED.amount_paid,
             amount_due = EXCLUDED.amount_due,
             payment_status = 'paid',
             payment_date = NOW(),
             updated_at = NOW()`,
          [resellerId, userId, month, receiveAmount]
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
};

