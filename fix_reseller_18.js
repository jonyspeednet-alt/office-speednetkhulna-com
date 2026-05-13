const { loadEnv } = require('./server/utilities/envLoader');
loadEnv();

// Force DB port if it's acting weird
process.env.DB_PORT = '5432';
process.env.MAIN_DB_PORT = '5432';

const pool = require('./server/utilities/db');

async function fixReseller() {
  try {
    // 1. Check current status
    const before = await pool.query('SELECT id, reseller_name, partner_type FROM resellers WHERE id = 18');
    if (before.rows.length === 0) {
        console.error('Reseller ID 18 not found');
        process.exit(1);
    }
    console.log('Before update:', before.rows[0]);

    // 2. Update to channel_partner
    await pool.query("UPDATE resellers SET partner_type = 'channel_partner' WHERE id = 18");
    
    // 3. Verify
    const after = await pool.query('SELECT id, reseller_name, partner_type FROM resellers WHERE id = 18');
    console.log('After update:', after.rows[0]);
    
    console.log('\n--- SUCCESS ---');
    console.log('Now refresh the page at https://office.speednetkhulna.com/reseller-profile/18');
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

fixReseller();
