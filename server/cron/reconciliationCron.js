const cron = require('node-cron');
const db = require('../utilities/db');

/**
 * Auto-reconciliation cron job
 * Runs on the 5th of every month at 9:00 AM
 * Initiates reconciliation for the previous month for all active resellers
 */
function startReconciliationCron() {
  // Schedule: '0 9 5 * *' = At 9:00 AM on the 5th day of every month
  cron.schedule('0 9 5 * *', async () => {
    console.log('=== Auto-Reconciliation Cron Job Started ===');
    console.log('Time:', new Date().toISOString());

    try {
      // Calculate previous month
      const now = new Date();
      const previousMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const monthStr = previousMonth.toISOString().slice(0, 7); // YYYY-MM format

      console.log(`Processing reconciliation for month: ${monthStr}`);

      // Get all active resellers
      const resellersResult = await db.query(`
        SELECT id, name FROM channel_partners WHERE status = 'active'
      `);

      console.log(`Found ${resellersResult.rows.length} active resellers`);

      let successCount = 0;
      let skipCount = 0;
      let errorCount = 0;

      // Process each reseller
      for (const reseller of resellersResult.rows) {
        try {
          // Check if reconciliation already exists
          const existingResult = await db.query(`
            SELECT id, reconciliation_status 
            FROM billing_reconciliation_logs
            WHERE reseller_id = $1 AND reconciliation_month = $2
          `, [reseller.id, monthStr]);

          if (existingResult.rows.length > 0) {
            console.log(`Skipping reseller ${reseller.id} (${reseller.name}) - Already reconciled`);
            skipCount++;
            continue;
          }

          // Get commission summary for the month
          const summaryResult = await db.query(`
            SELECT 
              COALESCE(SUM(amount_paid), 0) AS total_collected,
              COALESCE(SUM(realized_amount), 0) AS total_realized,
              COALESCE(SUM(deferred_amount), 0) AS total_deferred
            FROM channel_user_payments
            WHERE reseller_id = $1 
              AND service_period >= $2 
              AND service_period < $3
              AND deleted_at IS NULL
          `, [reseller.id, monthStr + '-01', getNextMonth(monthStr) + '-01']);

          const summary = summaryResult.rows[0];

          // Get partner profit share percentage
          const partnerResult = await db.query(`
            SELECT profit_share_pct FROM channel_partners WHERE id = $1
          `, [reseller.id]);

          const profitPct = partnerResult.rows[0]?.profit_share_pct || 0;

          // Calculate gross commission
          const grossCommission = (parseFloat(summary.total_realized) * profitPct) / 100;

          // Get partner advances for the month
          const advancesResult = await db.query(`
            SELECT COALESCE(SUM(advance_amount), 0) AS total_advances
            FROM channel_partner_advances
            WHERE reseller_id = $1 
              AND advance_month >= $2 
              AND advance_month < $3
              AND settlement_status IN ('pending_adjustment', 'adjusted')
          `, [reseller.id, monthStr + '-01', getNextMonth(monthStr) + '-01']);

          const partnerAdvances = parseFloat(advancesResult.rows[0].total_advances);

          // Calculate net commission
          const netCommission = grossCommission - partnerAdvances;

          // Get snapshot data
          const paymentsResult = await db.query(`
            SELECT 
              cup.id, cup.user_id, cpu.user_name,
              cup.amount_paid, cup.realized_amount, cup.deferred_amount,
              cup.billing_status, cup.service_period
            FROM channel_user_payments cup
            LEFT JOIN channel_partner_users cpu ON cpu.id = cup.user_id
            WHERE cup.reseller_id = $1 
              AND cup.service_period >= $2 
              AND cup.service_period < $3
              AND cup.deleted_at IS NULL
            ORDER BY cup.service_period, cpu.user_name
          `, [reseller.id, monthStr + '-01', getNextMonth(monthStr) + '-01']);

          const advancesListResult = await db.query(`
            SELECT 
              cpa.id, cpa.user_id, cpu.user_name,
              cpa.advance_amount, cpa.advance_type, cpa.notes,
              cpa.advance_month, cpa.settlement_status
            FROM channel_partner_advances cpa
            LEFT JOIN channel_partner_users cpu ON cpu.id = cpa.user_id
            WHERE cpa.reseller_id = $1 
              AND cpa.advance_month >= $2 
              AND cpa.advance_month < $3
              AND cpa.settlement_status IN ('pending_adjustment', 'adjusted')
            ORDER BY cpa.advance_month, cpu.user_name
          `, [reseller.id, monthStr + '-01', getNextMonth(monthStr) + '-01']);

          const snapshot = {
            payments: paymentsResult.rows,
            advances: advancesListResult.rows,
            summary: {
              total_collected: summary.total_collected,
              total_realized: summary.total_realized,
              total_deferred: summary.total_deferred,
              gross_commission: grossCommission,
              partner_advances: partnerAdvances,
              net_commission: netCommission
            }
          };

          // Insert reconciliation record
          await db.query(`
            INSERT INTO billing_reconciliation_logs (
              reseller_id, reconciliation_month,
              total_collected, total_realized, total_deferred,
              gross_commission, partner_advances, net_commission,
              reconciliation_status, initiated_by, snapshot_data
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending', 1, $9)
          `, [
            reseller.id, monthStr + '-01',
            summary.total_collected, summary.total_realized, summary.total_deferred,
            grossCommission, partnerAdvances, netCommission,
            JSON.stringify(snapshot)
          ]);

          console.log(`✓ Reconciliation initiated for reseller ${reseller.id} (${reseller.name})`);
          successCount++;

        } catch (error) {
          console.error(`✗ Error processing reseller ${reseller.id} (${reseller.name}):`, error.message);
          errorCount++;
        }
      }

      console.log('=== Auto-Reconciliation Cron Job Completed ===');
      console.log(`Success: ${successCount}, Skipped: ${skipCount}, Errors: ${errorCount}`);

    } catch (error) {
      console.error('=== Auto-Reconciliation Cron Job Failed ===');
      console.error('Error:', error);
    }
  });

  console.log('Reconciliation cron job scheduled: Runs at 9:00 AM on the 5th of every month');
}

/**
 * Get next month in YYYY-MM format
 */
function getNextMonth(monthStr) {
  const date = new Date(monthStr + '-01');
  date.setMonth(date.getMonth() + 1);
  return date.toISOString().slice(0, 7);
}

module.exports = { startReconciliationCron };
