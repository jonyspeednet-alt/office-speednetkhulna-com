process.env.DB_HOST = '127.0.0.1';
process.env.DB_PORT = '5433';
process.env.DB_USER = 'speeuvmq_speeuvmq';
process.env.DB_PASSWORD = 'speednet_office';
process.env.DB_NAME = 'speeuvmq_speednet_office';
process.env.USE_MAIN_DB_IN_LOCAL = 'false';
process.env.NODE_ENV = 'development';

const pool = require('./utilities/db');

async function check() {
    try {
        const billingLogs = await pool.query(`
            SELECT id, request_id, change_desc, effective_date, created_at, log_type
            FROM billing_logs 
            WHERE reseller_id = 4 AND (log_type = 'bandwidth_change' OR change_desc ILIKE '%NTTN%')
            ORDER BY created_at ASC
        `);
        console.log("Billing Logs (Bandwidth changes & NTTN):");
        console.log(billingLogs.rows);
    } catch (e) {
        console.error(e);
    } finally {
        await pool.end();
    }
}
check();
