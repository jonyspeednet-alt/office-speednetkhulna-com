process.env.DB_HOST = '127.0.0.1';
process.env.DB_PORT = '5433';
process.env.DB_USER = 'speeuvmq_speeuvmq';
process.env.DB_PASSWORD = 'speednet_office';
process.env.DB_NAME = 'speeuvmq_speednet_office';
process.env.USE_MAIN_DB_IN_LOCAL = 'false';
process.env.NODE_ENV = 'development';

const pool = require('./utilities/db');
const { refreshProjectedBillForCurrentMonth } = require('./controllers/reseller/service');

async function fix() {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        
        // Fix NTTN capacity for reseller 4 (remove the duplicate 30)
        await client.query(`UPDATE resellers SET nttn_capacity = GREATEST(0, COALESCE(nttn_capacity, 0) - 30) WHERE id = 4`);
        
        // Delete duplicate billing log ID 214
        await client.query(`DELETE FROM billing_logs WHERE id = 214 AND request_id = 82`);
        
        await client.query('COMMIT');
        
        console.log("DB Fixed successfully.");
        
        // Refresh projected bill for current month
        const bill = await refreshProjectedBillForCurrentMonth(4);
        console.log("Refreshed projected bill to:", bill);
    } catch (e) {
        await client.query('ROLLBACK');
        console.error(e);
    } finally {
        client.release();
        await pool.end();
    }
}
fix();
