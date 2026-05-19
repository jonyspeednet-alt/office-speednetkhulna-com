require('dotenv').config({ path: 'server/.env' });
const pool = require('./server/utilities/db');

async function check() {
    try {
        const reseller = await pool.query(`SELECT id, nttn_capacity, rate_nttn FROM resellers WHERE id = 4`);
        console.log("Reseller current state:", reseller.rows[0]);

        const bwChanges = await pool.query(`SELECT * FROM bandwidth_requests WHERE reseller_id = 4 AND UPPER(COALESCE(bw_type,'')) = 'NTTN' ORDER BY implementation_date ASC`);
        console.log("NTTN Bandwidth Changes:", bwChanges.rows);

        const rateChanges = await pool.query(`SELECT * FROM reseller_rate_history WHERE reseller_id = 4 AND UPPER(COALESCE(bw_type,'')) = 'NTTN' ORDER BY effective_date ASC`);
        console.log("NTTN Rate Changes (History):", rateChanges.rows);

        const rateChangeLogs = await pool.query(`SELECT * FROM reseller_rate_change_logs WHERE reseller_id = 4 ORDER BY effective_date ASC`);
        console.log("Rate Change Logs:", rateChangeLogs.rows.map(r => ({id: r.id, date: r.effective_date, prev_nttn: r.prev_rate_nttn, new_nttn: r.rate_nttn})));

        const aprilBill = await pool.query(`SELECT * FROM monthly_bills WHERE reseller_id = 4 AND bill_month = '2026-04-01'`);
        console.log("April Bill Details:", aprilBill.rows[0] ? aprilBill.rows[0].bill_details : 'None');

        const mayBill = await pool.query(`SELECT * FROM monthly_bills WHERE reseller_id = 4 AND bill_month = '2026-05-01'`);
        console.log("May Bill Details:", mayBill.rows[0] ? mayBill.rows[0].bill_details : 'None');

    } catch (e) {
        console.error(e);
    } finally {
        await pool.end();
    }
}
check();
