const pool = require('../utilities/db');
async function run() {
    try {
        const r = await pool.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'billing_logs' AND table_schema = 'public'");
        console.log('Columns in billing_logs:');
        r.rows.forEach(row => console.log(`${row.column_name}: ${row.data_type}`));
    } catch (e) {
        console.error(e);
    }
    process.exit(0);
}
run();
