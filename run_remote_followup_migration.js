require('./config/env');
const fs = require('fs');
const pool = require('./utilities/db');

(async () => {
  const sqlPath = process.argv[2] || '/tmp/20260514_channel_partner_profile_settings_fix.sql';
  await pool.query(fs.readFileSync(sqlPath, 'utf8'));
  const result = await pool.query(`
    SELECT
      EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'channel_partner_profile_settings'
      ) AS has_profile_settings,
      EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'resellers' AND column_name = 'profit_share_percentage'
      ) AS has_profit_share_column,
      EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'resellers' AND column_name = 'channel_user_count'
      ) AS has_channel_user_count_column
  `);
  console.log(JSON.stringify(result.rows[0]));
  await pool.end();
})().catch(async (error) => {
  console.error(error.message);
  try {
    await pool.end();
  } catch (_) {}
  process.exit(1);
});
