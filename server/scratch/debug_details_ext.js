const pool = require('../utilities/db');
const { initialize } = require('../controllers/reseller/dbSetup');

async function test() {
  const id = 11;
  try {
    await initialize();
    console.log('Testing statementResult query...');
    const statementResult = await pool.query(
        `SELECT 'invoice'::text AS type, id, COALESCE(amount,0)::numeric AS amount, created_at AS date, TO_CHAR(bill_month, 'FMMonth YYYY') AS description
         FROM monthly_bills
         WHERE reseller_id = $1
         UNION ALL
         SELECT COALESCE(to_jsonb(billing_logs)->>'log_type', CASE WHEN LOWER(COALESCE(change_desc,'')) LIKE 'discount:%' THEN 'discount' WHEN COALESCE(transaction_amount,0) > 0 THEN 'payment' ELSE 'adjustment' END)::text AS type, id, COALESCE(transaction_amount,0)::numeric AS amount, effective_date AS date, COALESCE(change_desc, CASE WHEN COALESCE(to_jsonb(billing_logs)->>'log_type', CASE WHEN LOWER(COALESCE(change_desc,'')) LIKE 'discount:%' THEN 'discount' WHEN COALESCE(transaction_amount,0) > 0 THEN 'payment' ELSE 'adjustment' END) = 'discount' THEN 'Discount' ELSE 'Payment Received' END) AS description
         FROM billing_logs
         WHERE reseller_id = $1 AND COALESCE(transaction_amount,0) > 0 AND COALESCE(to_jsonb(billing_logs)->>'log_type', CASE WHEN LOWER(COALESCE(change_desc,'')) LIKE 'discount:%' THEN 'discount' WHEN COALESCE(transaction_amount,0) > 0 THEN 'payment' ELSE 'adjustment' END) IN ('payment','discount')
         ORDER BY date DESC
         LIMIT 20`,
        [id],
      );
    console.log('  statementResult OK, rows:', statementResult.rows.length);

    console.log('Testing recentBillsResult query...');
    const recentBillsResult = await pool.query(
        `SELECT id, bill_month, amount AS final_amount, adjustment, previous_due, created_at
         FROM monthly_bills
         WHERE reseller_id = $1
         ORDER BY bill_month DESC
         LIMIT 5`,
        [id],
      );
    console.log('  recentBillsResult OK, rows:', recentBillsResult.rows.length);

    for (const bill of recentBillsResult.rows) {
        const ym = String(bill.bill_month).slice(0, 7);
        const paidResult = await pool.query(
            `SELECT COALESCE(SUM(transaction_amount),0)::numeric AS paid
             FROM billing_logs
             WHERE reseller_id = $1 AND TO_CHAR(COALESCE(effective_date, created_at), 'YYYY-MM') = $2 AND COALESCE(to_jsonb(billing_logs)->>'log_type', CASE WHEN LOWER(COALESCE(change_desc,'')) LIKE 'discount:%' THEN 'discount' WHEN COALESCE(transaction_amount,0) > 0 THEN 'payment' ELSE 'adjustment' END) IN ('payment','discount')`,
            [id, ym],
          );
        console.log(`  Bill ${bill.id} (${ym}) paid:`, paidResult.rows[0].paid);
    }

    console.log('✅ Extension tests passed!');
  } catch(e) {
    console.error('❌ FAILED:', e.message);
    console.error(e.stack);
  }
  process.exit(0);
}
test();
