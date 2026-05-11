const pool = require("../../utilities/db");
const { normalizedPartnerTypeSql } = require("./utils");

let initPromise = null;
let hasResellerJoiningDateColumn = false;
let joiningDateColumnChecked = false;
let hasResellerPartnerTypeColumn = false;
let partnerTypeColumnChecked = false;
let hasResellerOtcAppliedMonthColumn = false;
let otcAppliedMonthColumnChecked = false;
let hasChannelPartnerColumns = false;
let channelPartnerColumnsChecked = false;

const detectJoiningDateColumn = async () => {
  try {
    const result = await pool.query(
      `SELECT 1
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'resellers' AND column_name = 'joining_date'
       LIMIT 1`,
    );
    hasResellerJoiningDateColumn = result.rows.length > 0;
    joiningDateColumnChecked = true;
  } catch (err) {
    hasResellerJoiningDateColumn = false;
    joiningDateColumnChecked = true;
    console.warn("joining_date schema detect warning:", err.message);
  }
};

const detectPartnerTypeColumn = async () => {
  try {
    const result = await pool.query(
      `SELECT 1
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'resellers' AND column_name = 'partner_type'
       LIMIT 1`,
    );
    hasResellerPartnerTypeColumn = result.rows.length > 0;
    partnerTypeColumnChecked = true;
  } catch (err) {
    hasResellerPartnerTypeColumn = false;
    partnerTypeColumnChecked = true;
    console.warn("partner_type schema detect warning:", err.message);
  }
};

const detectOtcAppliedMonthColumn = async () => {
  try {
    const result = await pool.query(
      `SELECT 1
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'resellers' AND column_name = 'otc_charge_applied_month'
       LIMIT 1`,
    );
    hasResellerOtcAppliedMonthColumn = result.rows.length > 0;
    otcAppliedMonthColumnChecked = true;
  } catch (err) {
    hasResellerOtcAppliedMonthColumn = false;
    otcAppliedMonthColumnChecked = true;
    console.warn("otc_charge_applied_month schema detect warning:", err.message);
  }
};

const detectChannelPartnerColumns = async () => {
  if (channelPartnerColumnsChecked) return;
  try {
    const result = await pool.query(
      `SELECT column_name
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'resellers'
         AND column_name IN ('channel_user_count', 'profit_share_percentage')`,
    );
    const found = result.rows.map((r) => r.column_name);
    hasChannelPartnerColumns = found.includes('channel_user_count') && found.includes('profit_share_percentage');
    channelPartnerColumnsChecked = true;
  } catch (err) {
    hasChannelPartnerColumns = false;
    channelPartnerColumnsChecked = true;
    console.warn("channel partner columns detect warning:", err.message);
  }
};

const joiningDateExpr = (alias = "") => {
  const p = alias ? `${alias}.` : "";
  return hasResellerJoiningDateColumn
    ? `COALESCE(${p}joining_date::date, ${p}created_at::date)`
    : `${p}created_at::date`;
};

const initBillingAutomationSchema = async () => {
  await pool.query(`ALTER TABLE billing_logs ADD COLUMN IF NOT EXISTS log_type VARCHAR(30)`);
  await pool.query(
    `UPDATE billing_logs
     SET log_type = CASE
       WHEN COALESCE(transaction_amount,0) > 0 THEN 'payment'
       ELSE 'adjustment'
     END
     WHERE log_type IS NULL`,
  );
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_billing_logs_reseller_date ON billing_logs (reseller_id, effective_date)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_billing_logs_type_date ON billing_logs (log_type, effective_date)`);
  await pool.query(
    `CREATE TABLE IF NOT EXISTS billing_finalize_runs (
      id BIGSERIAL PRIMARY KEY,
      run_month DATE NOT NULL,
      started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      ended_at TIMESTAMPTZ NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'running',
      processed INTEGER NOT NULL DEFAULT 0,
      success INTEGER NOT NULL DEFAULT 0,
      failed INTEGER NOT NULL DEFAULT 0,
      initiator VARCHAR(80) NOT NULL DEFAULT 'system',
      source VARCHAR(40) NOT NULL DEFAULT 'scheduler',
      error_summary TEXT NULL
    )`,
  );
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_billing_finalize_runs_month ON billing_finalize_runs (run_month DESC, started_at DESC)`);
  await pool.query(
    `CREATE TABLE IF NOT EXISTS billing_finalize_run_items (
      id BIGSERIAL PRIMARY KEY,
      run_id BIGINT NOT NULL REFERENCES billing_finalize_runs(id) ON DELETE CASCADE,
      reseller_id INTEGER NOT NULL,
      status VARCHAR(20) NOT NULL,
      bill_id BIGINT NULL,
      message TEXT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
  );
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_billing_finalize_run_items_run ON billing_finalize_run_items (run_id, reseller_id)`);
};

const initPartnerSheetSchema = async () => {
  await pool.query(
    `CREATE TABLE IF NOT EXISTS partner_sheet_snapshots (
      tab_key VARCHAR(80) PRIMARY KEY,
      title VARCHAR(120) NOT NULL,
      headers JSONB NOT NULL DEFAULT '[]'::jsonb,
      rows JSONB NOT NULL DEFAULT '[]'::jsonb,
      source_meta JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
  );
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_partner_sheet_snapshots_updated_at ON partner_sheet_snapshots (updated_at DESC)`);
};

let rateChangeLogTableReady = false;

const initRateChangeLogTable = async () => {
  if (rateChangeLogTableReady) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS reseller_rate_change_logs (
      id            BIGSERIAL PRIMARY KEY,
      reseller_id   INTEGER NOT NULL,
      changed_by_id INTEGER NULL,
      changed_by    TEXT NULL,
      changed_by_role TEXT NULL,
      effective_date DATE NOT NULL,
      note          TEXT NULL,
      rate_iig      NUMERIC(14,2) NULL,
      rate_bdix     NUMERIC(14,2) NULL,
      rate_ggc      NUMERIC(14,2) NULL,
      rate_fna      NUMERIC(14,2) NULL,
      rate_cdn      NUMERIC(14,2) NULL,
      rate_bcdn     NUMERIC(14,2) NULL,
      rate_nttn     NUMERIC(14,2) NULL,
      prev_rate_iig  NUMERIC(14,2) NULL,
      prev_rate_bdix NUMERIC(14,2) NULL,
      prev_rate_ggc  NUMERIC(14,2) NULL,
      prev_rate_fna  NUMERIC(14,2) NULL,
      prev_rate_cdn  NUMERIC(14,2) NULL,
      prev_rate_bcdn NUMERIC(14,2) NULL,
      prev_rate_nttn NUMERIC(14,2) NULL,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_reseller_rate_change_logs_reseller ON reseller_rate_change_logs (reseller_id, effective_date DESC)`);
  rateChangeLogTableReady = true;
};

const initialize = async () => {
  if (!initPromise) {
    initPromise = (async () => {
      if (!joiningDateColumnChecked) await detectJoiningDateColumn();
      if (!partnerTypeColumnChecked) await detectPartnerTypeColumn();
      if (!otcAppliedMonthColumnChecked) await detectOtcAppliedMonthColumn();
      if (!channelPartnerColumnsChecked) await detectChannelPartnerColumns();

      try {
        await pool.query(`ALTER TABLE resellers ADD COLUMN IF NOT EXISTS joining_date DATE`);
        await pool.query(`ALTER TABLE resellers ADD COLUMN IF NOT EXISTS partner_type VARCHAR(40) NOT NULL DEFAULT 'distribution_partner'`);
        await pool.query(
          `UPDATE resellers
           SET partner_type = ${normalizedPartnerTypeSql("COALESCE(partner_type, '')")}
           WHERE partner_type IS NULL OR partner_type = '' OR partner_type <> ${normalizedPartnerTypeSql("COALESCE(partner_type, '')")}`
        );
      } catch (err) {
        console.warn("resellers joining_date/partner_type init warning:", err.message);
      }

      try {
        await pool.query(`ALTER TABLE resellers ADD COLUMN IF NOT EXISTS otc_charge NUMERIC(12,2) NOT NULL DEFAULT 0`);
        await pool.query(`ALTER TABLE resellers ADD COLUMN IF NOT EXISTS real_ip_count INTEGER NOT NULL DEFAULT 0`);
        await pool.query(`ALTER TABLE resellers ADD COLUMN IF NOT EXISTS real_ip_price NUMERIC(12,2) NOT NULL DEFAULT 0`);
        await pool.query(`ALTER TABLE resellers ADD COLUMN IF NOT EXISTS otc_charge_applied_month DATE`);
        await pool.query(
          `UPDATE resellers
           SET otc_charge_applied_month = DATE_TRUNC('month', COALESCE(joining_date, created_at))::date
           WHERE otc_charge_applied_month IS NULL AND COALESCE(otc_charge,0) > 0`,
        );
      } catch (err) {
        console.warn("resellers otc/real_ip init warning:", err.message);
      }

      try {
        await pool.query(`ALTER TABLE resellers ADD COLUMN IF NOT EXISTS channel_user_count INTEGER DEFAULT 0`);
        await pool.query(`ALTER TABLE resellers ADD COLUMN IF NOT EXISTS profit_share_percentage NUMERIC(5,2) DEFAULT 0`);
        await pool.query(`ALTER TABLE resellers ADD COLUMN IF NOT EXISTS auto_finalize_bill BOOLEAN NOT NULL DEFAULT FALSE`);
        await detectChannelPartnerColumns();
      } catch (err) {
        console.warn("resellers channel_partner/auto_finalize columns init warning:", err.message);
      }

      try {
        await pool.query(`
          CREATE TABLE IF NOT EXISTS reseller_rate_history (
            id            BIGSERIAL PRIMARY KEY,
            reseller_id   INTEGER NOT NULL,
            bw_type       VARCHAR(20) NOT NULL,
            rate          NUMERIC(14,2) NOT NULL,
            effective_date DATE NOT NULL,
            source        VARCHAR(40) DEFAULT 'rate_change',
            note          TEXT NULL,
            created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
          )
        `);
        await pool.query(`ALTER TABLE reseller_rate_history ADD COLUMN IF NOT EXISTS source VARCHAR(40) DEFAULT 'rate_change'`);
        await pool.query(`ALTER TABLE reseller_rate_history ADD COLUMN IF NOT EXISTS note TEXT NULL`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_reseller_rate_history_reseller ON reseller_rate_history (reseller_id, effective_date ASC)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_reseller_rate_history_type ON reseller_rate_history (reseller_id, bw_type, effective_date ASC)`);
      } catch (err) {
        console.warn("reseller_rate_history init warning:", err.message);
      }

      await detectJoiningDateColumn();
      await detectPartnerTypeColumn();
      await detectOtcAppliedMonthColumn();

      try {
        await initBillingAutomationSchema();
      } catch (err) {
        console.warn("initBillingAutomationSchema warning:", err.message);
      }

      try {
        await initPartnerSheetSchema();
      } catch (err) {
        console.warn("initPartnerSheetSchema warning:", err.message);
      }

      try {
        await initRateChangeLogTable();
      } catch (err) {
        console.warn("initRateChangeLogTable warning:", err.message);
      }
    })();
  }
  return initPromise;
};

module.exports = {
  initialize,
  detectJoiningDateColumn,
  detectPartnerTypeColumn,
  detectOtcAppliedMonthColumn,
  detectChannelPartnerColumns,
  joiningDateExpr,
  initRateChangeLogTable,
  hasResellerJoiningDateColumn: () => hasResellerJoiningDateColumn,
  hasResellerPartnerTypeColumn: () => hasResellerPartnerTypeColumn,
  hasResellerOtcAppliedMonthColumn: () => hasResellerOtcAppliedMonthColumn,
  hasChannelPartnerColumns: () => hasChannelPartnerColumns,
};
