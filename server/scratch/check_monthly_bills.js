const pool = require('../utilities/db');
async function run() {
    try {
        const r = await pool.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'monthly_bills' AND table_schema = 'public'");
        console.log('Columns in monthly_bills:');
        r.rows.forEach(row => console.log(`${row.column_name}: ${row.data_type}`));
    } catch (e) {
        console.error(e);
    }
    process.exit(0);
}
run();
