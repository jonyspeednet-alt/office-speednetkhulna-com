const pool = require("../../utilities/db");

const getStatusNoc = async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT
                r.id AS reseller_id,
                r.name AS reseller_name,
                COALESCE(SUM(p.monthly_mrc), 0) AS total_mrc,
                COUNT(p.id) AS total_packages,
                r.status
            FROM
                resellers r
            LEFT JOIN
                packages p ON r.id = p.reseller_id AND p.status = 'active'
            GROUP BY
                r.id, r.name, r.status
            ORDER BY
                total_mrc DESC
        `);
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching NOC status:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};

module.exports = {
    getStatusNoc
};