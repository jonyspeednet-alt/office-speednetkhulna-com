const pool = require("../../utilities/db");
const { getDhakaDate, getDhakaMonthYm, parseAmount, getMonthYear, getStartOfMonth, getEndOfMonth } = require("./utils");

const getDetailedMonthlyReport = async (req, res) => {
    try {
        const { resellerId } = req.params;
        const { month } = req.query;

        if (!month) {
            return res.status(400).json({ message: "Month query parameter (YYYY-MM) is required" });
        }

        const { y, m } = getMonthYear(month);
        const startDate = getStartOfMonth(y, m).toISOString();
        const endDate = getEndOfMonth(y, m).toISOString();

        const billingLogs = await pool.query(
            'SELECT * FROM reseller_billing_log WHERE reseller_id = $1 AND created_at >= $2 AND created_at <= $3 ORDER BY created_at ASC, id ASC',
            [resellerId, startDate, endDate]
        );

        const previousDueResult = await pool.query(
            `SELECT
                (SELECT COALESCE(SUM(amount), 0) FROM reseller_billing_log WHERE reseller_id = $1 AND type = 'debit' AND created_at < $2) -
                (SELECT COALESCE(SUM(amount), 0) FROM reseller_billing_log WHERE reseller_id = $1 AND type = 'credit' AND created_at < $2) AS net_due`,
            [resellerId, startDate]
        );
        const previousDue = parseAmount(previousDueResult.rows[0].net_due);

        let runningBalance = previousDue;
        const report = billingLogs.rows.map(log => {
            const credit = log.type === 'credit' ? parseAmount(log.amount) : 0;
            const debit = log.type === 'debit' ? parseAmount(log.amount) : 0;
            runningBalance += debit - credit;

            return {
                date: log.created_at,
                description: log.description,
                debit,
                credit,
                balance: runningBalance,
                category: log.category,
                actor: log.actor_name,
                log_id: log.id
            };
        });

        const summary = {
            previous_due: previousDue
        };

        res.json({ summary, report });

    } catch (error) {
        console.error("Error fetching detailed monthly report:", error);
        res.status(500).json({ message: "Internal Server Error" });
    }
};

module.exports = { getDetailedMonthlyReport };