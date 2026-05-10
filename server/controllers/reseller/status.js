const pool = require("../../utilities/db");
const {
    canViewResellerFinancials,
    hasAnyPermission,
    isAdminRole,
} = require("./utils");
const { initialize } = require("./dbSetup");

const getStatusNoc = async (req, res) => {
    try {
        await initialize();
        const canViewNoc = hasAnyPermission(req.user, ["reseller.status_noc.view"]) || isAdminRole(req.user);
        if (!canViewNoc) {
            return res.status(403).json({ message: "Access denied" });
        }
        const canViewFinancials = canViewResellerFinancials(req.user);
        const rawStatus = String(req.query.status || "active").trim().toLowerCase();
        const statusFilter = ["active", "inactive", "suspended", "all"].includes(rawStatus) ? rawStatus : "active";
        const params = [];
        const whereParts = [];
        if (statusFilter !== "all") {
            params.push(statusFilter);
            whereParts.push(`LOWER(COALESCE(status, 'active')) = $${params.length}`);
        }
        const where = whereParts.length ? `WHERE ${whereParts.join(" AND ")}` : "";

        const result = await pool.query(
            `SELECT
        id,
        user_id AS reseller_code,
        company_name,
        COALESCE(reseller_name, company_name) AS name,
        contact_no AS phone,
        pop_location,
        pop_location AS ip_address,
        COALESCE(iig_bw,0)::numeric AS iig_bw,
        COALESCE(bdix_bw,0)::numeric AS bdix_bw,
        COALESCE(ggc_bw,0)::numeric AS ggc_bw,
        COALESCE(fna_bw,0)::numeric AS fna_bw,
        COALESCE(cdn_bw,0)::numeric AS cdn_bw,
        COALESCE(bcdn_bw,0)::numeric AS bcdn_bw,
        COALESCE(nttn_capacity,0)::numeric AS nttn_capacity,
        (COALESCE(iig_bw,0) + COALESCE(bdix_bw,0) + COALESCE(ggc_bw,0) + COALESCE(fna_bw,0) + COALESCE(cdn_bw,0) + COALESCE(bcdn_bw,0))::numeric AS current_bw_mbps,
        COALESCE(current_projected_bill,0) AS monthly_rate,
        COALESCE(status, 'active') AS status,
        last_activity_date AS updated_at
      FROM resellers
      ${where}
      ORDER BY COALESCE(reseller_name, company_name) ASC`,
            params,
        );
        const rows = canViewFinancials
            ? result.rows
            : result.rows.map((r) => ({
                  ...r,
                  monthly_rate: null,
              }));

        res.json(rows);
    } catch (error) {
        console.error("getStatusNoc:", error);
        res.status(500).json({ message: "Failed to load NOC status" });
    }
};

module.exports = {
    getStatusNoc
}
