const pool = require("../../utilities/db");
const { getMonthYear, getStartOfMonth, getEndOfMonth, parseAmount } = require("./utils");

/**
 * Get detailed monthly report for a reseller
 * This report shows the ledger of transactions (payments, adjustments, bill finalization)
 */
const getDetailedMonthlyReport = async (req, res) => {
    try {
        const { resellerId } = req.params;
        const { month } = req.query; // YYYY-MM

        if (!month) {
            return res.status(400).json({ message: "Month query parameter (YYYY-MM) is required" });
        }

        const { y, m } = getMonthYear(month);
        const startDate = getStartOfMonth(y, m).toISOString();
        const endDate = getEndOfMonth(y, m).toISOString();

        // 1. Fetch transactions from billing_logs
        const billingLogs = await pool.query(
            `SELECT * FROM billing_logs 
             WHERE reseller_id = $1 AND effective_date >= $2 AND effective_date <= $3 
             ORDER BY effective_date ASC, created_at ASC`,
            [resellerId, startDate, endDate]
        );

        // 2. Fetch monthly bill if finalized in this month
        // In this system, bill finalization is a separate event. 
        // We might want to show it in the ledger if it has a financial impact.
        
        // 3. Calculate Previous Due (Balance before startDate)
        // Sum of all billed amounts - Sum of all payments/discounts
        const previousSummary = await pool.query(
            `SELECT 
                (SELECT COALESCE(SUM(amount + adjustment), 0) FROM monthly_bills WHERE reseller_id = $1 AND bill_month < $2::date) AS total_billed,
                (SELECT COALESCE(SUM(transaction_amount), 0) FROM billing_logs WHERE reseller_id = $1 AND effective_date < $2::date AND log_type IN ('payment', 'discount')) AS total_paid`,
            [resellerId, startDate]
        );
        
        const totalBilled = parseAmount(previousSummary.rows[0].total_billed, 0);
        const totalPaid = parseAmount(previousSummary.rows[0].total_paid, 0);
        const previousDue = totalBilled - totalPaid;

        let runningBalance = previousDue;
        const report = billingLogs.rows.map(log => {
            const amount = parseAmount(log.transaction_amount, 0);
            
            // Logic: payments/discounts reduce balance (credit), anything else increases?
            // Actually, in billing_logs, 'payment' and 'discount' are reductions.
            let credit = 0;
            let debit = 0;
            
            if (log.log_type === 'payment' || log.log_type === 'discount') {
                credit = amount;
                runningBalance -= amount;
            } else {
                debit = amount;
                runningBalance += amount;
            }

            return {
                date: log.effective_date,
                description: log.change_desc,
                debit,
                credit,
                balance: runningBalance,
                category: log.log_type,
                log_id: log.id
            };
        });

        res.json({ 
            summary: { previous_due: previousDue, current_balance: runningBalance }, 
            report 
        });

    } catch (error) {
        console.error("Error fetching detailed monthly report:", error);
        res.status(500).json({ message: "Internal Server Error" });
    }
};

module.exports = { getDetailedMonthlyReport };