const db = require('../utilities/db');

/**
 * Middleware to check if a month is locked due to approved reconciliation
 * Prevents modifications to data after reconciliation is approved
 */
async function checkReconciliationLock(req, res, next) {
    try {
        const { resellerId } = req.params;
        const { month } = req.body || req.query;

        // If no month specified, skip check
        if (!month) {
            return next();
        }

        // Check if month is locked (has approved reconciliation)
        const result = await db.query(`
      SELECT id, reconciliation_status, approved_at
      FROM billing_reconciliation_logs
      WHERE reseller_id = $1 
        AND reconciliation_month = $2
        AND reconciliation_status = 'approved'
    `, [resellerId, month]);

        if (result.rows.length > 0) {
            const reconciliation = result.rows[0];
            return res.status(403).json({
                success: false,
                error: 'Month is locked',
                message: 'Cannot modify data for approved reconciliation. This month has been finalized.',
                message_bn: 'অনুমোদিত নিষ্পত্তির জন্য ডেটা পরিবর্তন করা যাবে না। এই মাসটি চূড়ান্ত করা হয়েছে।',
                reconciliation_id: reconciliation.id,
                approved_at: reconciliation.approved_at
            });
        }

        // Month is not locked, proceed
        next();

    } catch (error) {
        console.error('Error checking reconciliation lock:', error);
        // Don't block the request if check fails, just log the error
        next();
    }
}

/**
 * Check if a specific reconciliation can be modified
 * Used for approval/rejection operations
 */
async function checkReconciliationModifiable(req, res, next) {
    try {
        const { reconciliationId } = req.params;

        const result = await db.query(`
      SELECT id, reconciliation_status, approved_at
      FROM billing_reconciliation_logs
      WHERE id = $1
    `, [reconciliationId]);

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Reconciliation not found'
            });
        }

        const reconciliation = result.rows[0];

        // Only pending reconciliations can be modified
        if (reconciliation.reconciliation_status !== 'pending') {
            return res.status(403).json({
                success: false,
                error: 'Reconciliation cannot be modified',
                message: `Reconciliation is already ${reconciliation.reconciliation_status}`,
                current_status: reconciliation.reconciliation_status
            });
        }

        // Reconciliation is modifiable, proceed
        next();

    } catch (error) {
        console.error('Error checking reconciliation modifiable:', error);
        return res.status(500).json({
            success: false,
            error: 'Internal server error',
            message: error.message
        });
    }
}

module.exports = {
    checkReconciliationLock,
    checkReconciliationModifiable
};
