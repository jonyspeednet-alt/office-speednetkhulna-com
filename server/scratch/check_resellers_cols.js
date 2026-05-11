const pool = require('../utilities/db');
async function run() {
    try {
        const r = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'resellers' AND table_schema = 'public'");
        console.log('Columns in resellers:');
        console.log(r.rows.map(row => row.column_name).join(', '));
    } catch (e) {
        console.error(e);
    }
    process.exit(0);
}
run();
