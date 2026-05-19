const { loadEnv } = require('./server/utilities/envLoader');
loadEnv();

const pool = require('./server/utilities/db');

async function checkReseller() {
  try {
    const res = await pool.query('SELECT id, reseller_name, partner_type FROM resellers WHERE id = 18');
    console.log(res.rows[0]);
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

checkReseller();
