const { loadEnv } = require('./server/utilities/envLoader');
loadEnv();

process.env.DB_PORT = '5433';
process.env.MAIN_DB_PORT = '5433';

const pool = require('./server/utilities/db');

async function listAll() {
  try {
    const res = await pool.query('SELECT id, reseller_name, partner_type, status FROM resellers');
    console.table(res.rows);
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

listAll();
