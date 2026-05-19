require('./config/env');
const pool = require('./utilities/db');

(async () => {
  const result = await pool.query(`
    SELECT
      current_user = (
        SELECT tableowner FROM pg_tables
        WHERE schemaname = 'public' AND tablename = 'resellers'
      ) AS current_user_owns_resellers
  `);
  console.log(JSON.stringify(result.rows[0]));
  await pool.end();
})().catch(async (error) => {
  console.error(error.message);
  try { await pool.end(); } catch (_) {}
  process.exit(1);
});
