const pool = require("./db");

let tablesInitialized = false;

const initChannelPartnerTables = async () => {
  if (tablesInitialized) return;
  try {
    await pool.query(`
      ALTER TABLE resellers
        ADD COLUMN IF NOT EXISTS profit_share_percentage NUMERIC(5,2) DEFAULT 0
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS channel_partner_users (
        id SERIAL PRIMARY KEY,
        reseller_id INT NOT NULL,
        user_name VARCHAR(255) NOT NULL,
        user_id_code VARCHAR(100) DEFAULT '',
        phone VARCHAR(30) DEFAULT '',
        package_name VARCHAR(100) DEFAULT '',
        monthly_rate NUMERIC(10,2) DEFAULT 0,
        status VARCHAR(20) DEFAULT 'active',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await pool.query(
      "CREATE INDEX IF NOT EXISTS idx_cpu_reseller_id ON channel_partner_users (reseller_id)"
    );
    await pool.query(
      "CREATE INDEX IF NOT EXISTS idx_cpu_status ON channel_partner_users (status)"
    );

    await pool.query(`
      CREATE TABLE IF NOT EXISTS channel_user_payments (
        id SERIAL PRIMARY KEY,
        reseller_id INT NOT NULL,
        user_id INT NOT NULL,
        month VARCHAR(7) NOT NULL,
        amount_due NUMERIC(10,2) DEFAULT 0,
        amount_paid NUMERIC(10,2) DEFAULT 0,
        payment_date DATE,
        payment_status VARCHAR(20) DEFAULT 'unpaid',
        note TEXT DEFAULT '',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await pool.query(
      "CREATE INDEX IF NOT EXISTS idx_cup_reseller_month ON channel_user_payments (reseller_id, month)"
    );
    await pool.query(
      "CREATE INDEX IF NOT EXISTS idx_cup_user_month ON channel_user_payments (user_id, month)"
    );
    await pool.query(
      "CREATE UNIQUE INDEX IF NOT EXISTS idx_cup_unique_user_month ON channel_user_payments (user_id, month)"
    );

    await pool.query(`
      CREATE TABLE IF NOT EXISTS channel_commission_logs (
        id SERIAL PRIMARY KEY,
        reseller_id INT NOT NULL,
        month VARCHAR(7) NOT NULL,
        total_users INT DEFAULT 0,
        paying_users INT DEFAULT 0,
        total_collection NUMERIC(12,2) DEFAULT 0,
        profit_share_pct NUMERIC(5,2) DEFAULT 0,
        gross_commission NUMERIC(12,2) DEFAULT 0,
        adjustments NUMERIC(12,2) DEFAULT 0,
        adjustment_note TEXT DEFAULT '',
        deductions NUMERIC(12,2) DEFAULT 0,
        deduction_note TEXT DEFAULT '',
        net_commission NUMERIC(12,2) DEFAULT 0,
        previous_balance NUMERIC(12,2) DEFAULT 0,
        total_payable NUMERIC(12,2) DEFAULT 0,
        paid_amount NUMERIC(12,2) DEFAULT 0,
        closing_balance NUMERIC(12,2) DEFAULT 0,
        payment_status VARCHAR(20) DEFAULT 'pending',
        status VARCHAR(20) DEFAULT 'draft',
        finalized_at TIMESTAMP,
        finalized_by INT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(reseller_id, month)
      )
    `);
    await pool.query(
      "CREATE INDEX IF NOT EXISTS idx_ccl_reseller_id ON channel_commission_logs (reseller_id)"
    );

    await pool.query(`
      CREATE TABLE IF NOT EXISTS channel_commission_payments (
        id SERIAL PRIMARY KEY,
        reseller_id INT NOT NULL,
        commission_log_id INT,
        amount NUMERIC(12,2) NOT NULL,
        payment_method VARCHAR(30) DEFAULT 'Cash',
        payment_date DATE NOT NULL,
        reference_no VARCHAR(100) DEFAULT '',
        note TEXT DEFAULT '',
        recorded_by INT,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await pool.query(
      "CREATE INDEX IF NOT EXISTS idx_ccp_reseller_id ON channel_commission_payments (reseller_id)"
    );
    await pool.query(
      "CREATE INDEX IF NOT EXISTS idx_ccp_log_id ON channel_commission_payments (commission_log_id)"
    );

    tablesInitialized = true;
    console.log("[ChannelPartner] tables ready");
  } catch (error) {
    if (
      error?.code === "42501" ||
      String(error?.message || "")
        .toLowerCase()
        .includes("must be owner")
    ) {
      tablesInitialized = true;
      console.warn(
        "[ChannelPartner] init uses existing tables (owner-only DDL skipped)"
      );
      return;
    }
    console.error("[ChannelPartner] init failed:", error.message);
  }
};

module.exports = { initChannelPartnerTables };
