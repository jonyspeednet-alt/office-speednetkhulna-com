require('./config/env');
const pool = require('./utilities/db');

const required = {
  channel_partner_users: ['id','reseller_id','user_name','monthly_rate','status','created_at','updated_at'],
  channel_user_payments: ['id','reseller_id','user_id','month','service_period','amount_due','amount_paid','realized_amount','deferred_amount','billing_status','payment_status','deleted_at'],
  channel_commission_logs: ['id','reseller_id','month','total_users','paying_users','total_collection','profit_share_pct','gross_commission','adjustments','deductions','net_commission','previous_balance','total_payable','paid_amount','closing_balance','payment_status','status'],
  channel_commission_payments: ['id','reseller_id','commission_log_id','amount','payment_date'],
  channel_partner_profile_settings: ['reseller_id','profit_share_percentage','updated_at'],
  channel_partner_advances: ['id','reseller_id','user_id','advance_month','advance_amount','advance_type','settlement_status'],
  billing_reconciliation_logs: ['id','reseller_id','reconciliation_month','total_collected','total_realized','total_deferred','gross_commission','partner_advances','net_commission','reconciliation_status'],
  channel_settlement_state_machine: ['id','reseller_id','settlement_month','current_state'],
  channel_adjustment_audit: ['id','reseller_id','adjustment_month','adjustment_type','adjustment_amount'],
};

(async () => {
  const schema = {};
  for (const [table, cols] of Object.entries(required)) {
    const exists = await pool.query(`SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=$1) AS ok`, [table]);
    const present = exists.rows[0].ok;
    let missing = cols;
    if (present) {
      const colResult = await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1`, [table]);
      const set = new Set(colResult.rows.map(r => r.column_name));
      missing = cols.filter(c => !set.has(c));
    }
    schema[table] = { exists: present, missing };
  }

  const counts = await pool.query(`
    SELECT
      (SELECT COUNT(*)::int FROM resellers WHERE COALESCE(partner_type,'')='channel_partner') AS channel_partners,
      (SELECT COUNT(*)::int FROM channel_partner_users) AS users,
      (SELECT COUNT(*)::int FROM channel_user_payments) AS payments,
      (SELECT COUNT(*)::int FROM channel_commission_logs) AS commission_logs,
      (SELECT COUNT(*)::int FROM channel_commission_payments) AS commission_payments,
      (SELECT COUNT(*)::int FROM channel_partner_advances) AS advances,
      (SELECT COUNT(*)::int FROM billing_reconciliation_logs) AS reconciliations
  `);

  const paymentIssues = await pool.query(`
    SELECT
      COUNT(*) FILTER (WHERE service_period IS NULL) AS service_period_null,
      COUNT(*) FILTER (WHERE realized_amount > amount_due) AS realized_gt_due,
      COUNT(*) FILTER (WHERE deferred_amount <> GREATEST(0, amount_due - realized_amount)) AS deferred_mismatch,
      COUNT(*) FILTER (WHERE amount_paid > 0 AND payment_status = 'unpaid') AS paid_marked_unpaid,
      COUNT(*) FILTER (WHERE amount_paid > 0 AND amount_paid < amount_due AND payment_status = 'paid') AS partial_marked_paid
    FROM channel_user_payments
    WHERE deleted_at IS NULL OR deleted_at IS NULL
  `);

  const calcMismatch = await pool.query(`
    WITH recomputed AS (
      SELECT
        ccl.id,
        ccl.reseller_id,
        ccl.month,
        COALESCE(SUM(cup.amount_paid),0)::numeric AS total_collected,
        COALESCE(SUM(cup.realized_amount),0)::numeric AS total_realized,
        COALESCE((SELECT SUM(amount) FROM channel_commission_payments ccp WHERE ccp.commission_log_id = ccl.id),0)::numeric AS paid_amount
      FROM channel_commission_logs ccl
      LEFT JOIN channel_user_payments cup
        ON cup.reseller_id = ccl.reseller_id AND cup.service_period = (ccl.month || '-01')::date
      GROUP BY ccl.id, ccl.reseller_id, ccl.month
    )
    SELECT COUNT(*)::int AS mismatch_count
    FROM recomputed r
    JOIN channel_commission_logs ccl ON ccl.id = r.id
    WHERE ABS(COALESCE(ccl.total_collection,0) - r.total_collected) > 0.01
       OR ABS(COALESCE(ccl.paid_amount,0) - r.paid_amount) > 0.01
  `);

  console.log(JSON.stringify({
    schema,
    counts: counts.rows[0],
    payment_issues: paymentIssues.rows[0],
    commission_mismatch: calcMismatch.rows[0]
  }, null, 2));
  await pool.end();
})().catch(async error => {
  console.error(error.message);
  try { await pool.end(); } catch (_) {}
  process.exit(1);
});
