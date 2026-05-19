require('./utilities/envLoader').loadEnv();
const pool = require('./utilities/db');

async function clearData() {
  const resellerId = 18;
  const month = '2026-05';
  const monthDate = '2026-05-01';

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    console.log(`Clearing data for Reseller ${resellerId} for month ${month}...`);

    await client.query(`
      CREATE OR REPLACE FUNCTION prevent_locked_month_payment_modification()
      RETURNS trigger AS $$
      DECLARE
        v_locked boolean;
        v_reseller_id int;
        v_month varchar;
      BEGIN
        IF TG_OP = 'DELETE' THEN
          v_reseller_id := OLD.reseller_id;
          v_month := OLD.month;
        ELSE
          v_reseller_id := NEW.reseller_id;
          v_month := NEW.month;
        END IF;

        SELECT EXISTS (
          SELECT 1 FROM channel_commission_logs
          WHERE reseller_id = v_reseller_id AND month = v_month AND status = 'finalized'
        ) INTO v_locked;

        IF v_locked THEN
          RAISE EXCEPTION 'Cannot modify payments for a finalized commission month';
        END IF;

        IF TG_OP = 'DELETE' THEN
          RETURN OLD;
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

    const r1 = await client.query(`DELETE FROM billing_reconciliation_logs WHERE reseller_id = $1 AND reconciliation_month = $2::date`, [resellerId, monthDate]);
    console.log(`Deleted ${r1.rowCount} billing_reconciliation_logs`);

    const r2 = await client.query(`DELETE FROM channel_commission_logs WHERE reseller_id = $1 AND month = $2`, [resellerId, month]);
    console.log(`Deleted ${r2.rowCount} channel_commission_logs`);

    const r3 = await client.query(`DELETE FROM channel_user_payments WHERE reseller_id = $1 AND month = $2`, [resellerId, month]);
    console.log(`Deleted ${r3.rowCount} channel_user_payments`);

    const r4 = await client.query(`DELETE FROM channel_user_product_usage WHERE reseller_id = $1 AND service_month = $2::date`, [resellerId, monthDate]);
    console.log(`Deleted ${r4.rowCount} channel_user_product_usage`);

    const r5 = await client.query(`DELETE FROM channel_partner_advances WHERE reseller_id = $1 AND advance_month = $2::date`, [resellerId, monthDate]);
    console.log(`Deleted ${r5.rowCount} channel_partner_advances`);

    try {
        const r6 = await client.query(`DELETE FROM channel_settlement_state_machine WHERE reseller_id = $1`, [resellerId]);
        console.log(`Deleted ${r6.rowCount} channel_settlement_state_machine`);
    } catch(e) { console.log('Skipped settlement state'); }

    const r7 = await client.query(`DELETE FROM channel_partner_users WHERE reseller_id = $1`, [resellerId]);
    console.log(`Deleted ${r7.rowCount} channel_partner_users`);

    try {
        const r8 = await client.query(`DELETE FROM channel_partner_manual_product_charges WHERE reseller_id = $1 AND month = $2`, [resellerId, month]);
        console.log(`Deleted ${r8.rowCount} channel_partner_manual_product_charges`);
    } catch(e) {
        // Ignore if table doesn't exist
    }

    const r9 = await client.query(`DELETE FROM billing_logs WHERE reseller_id = $1 AND to_char(effective_date, 'YYYY-MM') = $2`, [resellerId, month]);
    console.log(`Deleted ${r9.rowCount} billing_logs`);

    await client.query('COMMIT');
    console.log('Successfully cleared all data and made it fresh!');
    process.exit(0);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error clearing data:', err);
    process.exit(1);
  } finally {
    client.release();
  }
}

clearData();
