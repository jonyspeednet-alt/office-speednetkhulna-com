const pool = require('../utilities/db');
const { initialize, detectChannelPartnerColumns, joiningDateExpr,
        hasChannelPartnerColumns, normalizedPartnerTypeSql,
        hasResellerPartnerTypeColumn, hasResellerOtcAppliedMonthColumn } = require('../controllers/reseller/dbSetup');

async function test() {
  const id = 11;
  try {
    console.log('Step 1: initialize...');
    await initialize();
    await detectChannelPartnerColumns();
    console.log('  hasChannelPartnerColumns:', hasChannelPartnerColumns());
    console.log('  hasResellerPartnerTypeColumn:', hasResellerPartnerTypeColumn());
    console.log('  hasResellerOtcAppliedMonthColumn:', hasResellerOtcAppliedMonthColumn());

    console.log('Step 2: reseller query...');
    const r = await pool.query(
      `SELECT r.id,
        r.user_id AS reseller_code,
        COALESCE(r.reseller_name, r.company_name) AS name,
        ${hasResellerPartnerTypeColumn() ? `COALESCE(r.partner_type, 'distribution_partner') AS partner_type,` : `'distribution_partner' AS partner_type,`}
        ${hasResellerOtcAppliedMonthColumn() ? `r.otc_charge_applied_month,` : `NULL::date AS otc_charge_applied_month,`}
        ${hasChannelPartnerColumns() ? `COALESCE(r.channel_user_count,0)::int AS channel_user_count,` : `0::int AS channel_user_count,`}
        ${hasChannelPartnerColumns() ? `COALESCE(r.profit_share_percentage,0)::numeric AS profit_share_percentage,` : `0::numeric AS profit_share_percentage,`}
        r.created_at
       FROM resellers r WHERE r.id = $1`, [id]);
    console.log('  Reseller found:', r.rows.length > 0);

    console.log('Step 3: billing_logs query (paidCurrentMonth)...');
    const currentMonth = '2026-05';
    const bl = await pool.query(
      `SELECT COALESCE(SUM(transaction_amount),0)::numeric AS total
       FROM billing_logs
       WHERE reseller_id = $1
         AND TO_CHAR(COALESCE(effective_date, created_at), 'YYYY-MM') = $2
         AND COALESCE(to_jsonb(billing_logs)->>'log_type',
               CASE WHEN LOWER(COALESCE(change_desc,'')) LIKE 'discount:%' THEN 'discount'
                    WHEN COALESCE(transaction_amount,0) > 0 THEN 'payment' ELSE 'adjustment' END) = 'payment'`,
      [id, currentMonth]);
    console.log('  billing_logs paid OK:', bl.rows[0]);

    console.log('Step 4: monthly_bills query...');
    const mb = await pool.query(
      `SELECT id, bill_month, created_at, COALESCE(amount,0)::numeric AS amount,
              COALESCE(adjustment,0)::numeric AS adjustment,
              COALESCE(previous_due,0)::numeric AS previous_due
       FROM monthly_bills WHERE reseller_id = $1 AND bill_month = $2::date LIMIT 1`,
      [id, `${currentMonth}-01`]);
    console.log('  monthly_bills OK, found:', mb.rows.length);

    console.log('Step 5: bandwidth_requests query...');
    const cols = await pool.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema='public' AND table_name='bandwidth_requests'`);
    console.log('  bandwidth_requests columns:', cols.rows.map(c=>c.column_name).join(', '));

    const bw = await pool.query(
      `SELECT id, bw_type, change_type, amount AS requested_bw_mbps,
              requested_effective_date, created_at,
              COALESCE(admin_status,'pending') AS admin_status
       FROM bandwidth_requests WHERE reseller_id = $1 ORDER BY created_at DESC LIMIT 5`, [id]);
    console.log('  bandwidth_requests OK, rows:', bw.rows.length);

    console.log('✅ All queries passed!');
  } catch(e) {
    console.error('❌ FAILED:', e.message);
    console.error(e.stack);
  }
  process.exit(0);
}
test();
