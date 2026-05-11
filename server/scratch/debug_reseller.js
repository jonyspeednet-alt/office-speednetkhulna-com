const pool = require('../utilities/db');

async function test() {
  try {
    // Check if reseller 11 exists
    const r = await pool.query('SELECT id, user_id FROM resellers WHERE id = $1 LIMIT 1', [11]);
    console.log('Reseller 11 found:', r.rows.length > 0, r.rows[0] || '');

    // Check columns
    const cols = await pool.query(
      "SELECT column_name FROM information_schema.columns WHERE table_name = 'resellers' AND table_schema = 'public'"
    );
    const colNames = cols.rows.map(c => c.column_name).sort();
    console.log('Resellers columns:', colNames.join(', '));

    // Check if billing_logs table exists
    const bl = await pool.query(
      "SELECT to_regclass('public.billing_logs') AS tbl"
    );
    console.log('billing_logs exists:', bl.rows[0].tbl);

    // Check monthly_bills
    const mb = await pool.query(
      "SELECT to_regclass('public.monthly_bills') AS tbl"
    );
    console.log('monthly_bills exists:', mb.rows[0].tbl);

    // Check bandwidth_requests
    const bwt = await pool.query(
      "SELECT to_regclass('public.bandwidth_requests') AS tbl"
    );
    console.log('bandwidth_requests exists:', bwt.rows[0].tbl);

  } catch (e) {
    console.error('FATAL ERROR:', e.message);
    console.error(e.stack);
  }
  process.exit(0);
}

test();
