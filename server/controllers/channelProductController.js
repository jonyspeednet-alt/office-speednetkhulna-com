const XLSX = require("xlsx");
const pool = require("../utilities/db");
const { initChannelPartnerTables } = require("../utilities/channelPartnerInit");
const {
  roundAmount,
  monthToServiceDate,
  sumProductDeduction,
  isCommissionMonthLocked,
} = require("../utilities/channelProductHelpers");

const parseAmount = (v, d = 0) => {
  if (v === null || v === undefined || v === "") return d;
  if (typeof v === "number") return Number.isFinite(v) ? v : d;
  const cleaned = String(v)
    .replace(/[,৳$]/g, "")
    .replace(/[^0-9.-]/g, "")
    .trim();
  if (!cleaned) return d;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : d;
};

const normalizeSheetHeader = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, "");

const getSheetValue = (row, aliases) => {
  for (const alias of aliases) {
    if (Object.prototype.hasOwnProperty.call(row, alias)) return row[alias];
  }
  const normalizedAliases = aliases.map(normalizeSheetHeader);
  for (const [key, value] of Object.entries(row)) {
    if (normalizedAliases.includes(normalizeSheetHeader(key))) return value;
  }
  return undefined;
};

const listProducts = async (req, res) => {
  try {
    await initChannelPartnerTables();
    const activeOnly = String(req.query.active_only || "1") !== "0";
    const result = await pool.query(
      `SELECT * FROM channel_products
       WHERE ($1::boolean IS FALSE OR is_active = TRUE)
       ORDER BY sort_order ASC NULLS LAST, name ASC`,
      [activeOnly],
    );
    res.json(result.rows);
  } catch (error) {
    console.error("channelProduct.listProducts:", error);
    res.status(500).json({ message: "Failed to load products" });
  }
};

const createProduct = async (req, res) => {
  try {
    await initChannelPartnerTables();
    const {
      product_code,
      name,
      category,
      unit_price,
      unit,
      sort_order,
      is_active,
    } = req.body;
    if (!String(name || "").trim()) {
      return res.status(400).json({ message: "name is required" });
    }
    const code = String(product_code || name)
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "_")
      .slice(0, 100);
    const result = await pool.query(
      `INSERT INTO channel_products
        (product_code, name, category, unit_price, unit, sort_order, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (product_code) DO UPDATE SET
         name = EXCLUDED.name,
         category = EXCLUDED.category,
         unit_price = EXCLUDED.unit_price,
         unit = EXCLUDED.unit,
         sort_order = EXCLUDED.sort_order,
         is_active = EXCLUDED.is_active,
         updated_at = NOW()
       RETURNING *`,
      [
        code,
        String(name).trim(),
        String(category || "").trim(),
        roundAmount(parseAmount(unit_price, 0)),
        String(unit || "pcs").trim(),
        parseInt(sort_order || 0, 10) || 0,
        is_active !== false,
      ],
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error("channelProduct.createProduct:", error);
    res.status(500).json({ message: "Failed to save product" });
  }
};

const updateProduct = async (req, res) => {
  try {
    await initChannelPartnerTables();
    const { productId } = req.params;
    const { name, category, unit_price, unit, sort_order, is_active } = req.body;
    const result = await pool.query(
      `UPDATE channel_products SET
        name = COALESCE($1, name),
        category = COALESCE($2, category),
        unit_price = COALESCE($3, unit_price),
        unit = COALESCE($4, unit),
        sort_order = COALESCE($5, sort_order),
        is_active = COALESCE($6, is_active),
        updated_at = NOW()
       WHERE id = $7
       RETURNING *`,
      [
        name != null ? String(name).trim() : null,
        category != null ? String(category).trim() : null,
        unit_price != null ? roundAmount(parseAmount(unit_price, 0)) : null,
        unit != null ? String(unit).trim() : null,
        sort_order != null ? parseInt(sort_order, 10) : null,
        is_active != null ? Boolean(is_active) : null,
        productId,
      ],
    );
    if (!result.rows.length) {
      return res.status(404).json({ message: "Product not found" });
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error("channelProduct.updateProduct:", error);
    res.status(500).json({ message: "Failed to update product" });
  }
};

const importProducts = async (req, res) => {
  try {
    await initChannelPartnerTables();
    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }
    const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
      defval: "",
    });

    let created = 0;
    let updated = 0;
    let skipped = 0;

    for (const row of rows) {
      const name = getSheetValue(row, [
        "name",
        "product_name",
        "product",
        "পণ্য",
        "প্রোডাক্ট",
      ]);
      if (!String(name || "").trim()) {
        skipped += 1;
        continue;
      }
      const codeRaw = getSheetValue(row, [
        "product_code",
        "code",
        "sku",
        "id",
        "কোড",
      ]);
      const code = String(codeRaw || name)
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "_")
        .slice(0, 100);
      const price = roundAmount(
        parseAmount(
          getSheetValue(row, [
            "unit_price",
            "price",
            "rate",
            "amount",
            "দাম",
            "মূল্য",
          ]),
          0,
        ),
      );
      const category = String(
        getSheetValue(row, ["category", "type", "ক্যাটাগরি"]) || "",
      ).trim();
      const unit = String(
        getSheetValue(row, ["unit", "ইউনিট"]) || "pcs",
      ).trim();

      const existing = await pool.query(
        `SELECT id FROM channel_products WHERE product_code = $1`,
        [code],
      );
      await pool.query(
        `INSERT INTO channel_products
          (product_code, name, category, unit_price, unit, is_active)
         VALUES ($1, $2, $3, $4, $5, TRUE)
         ON CONFLICT (product_code) DO UPDATE SET
           name = EXCLUDED.name,
           category = EXCLUDED.category,
           unit_price = EXCLUDED.unit_price,
           unit = EXCLUDED.unit,
           updated_at = NOW()`,
        [code, String(name).trim(), category, price, unit],
      );
      if (existing.rows.length) updated += 1;
      else created += 1;
    }

    res.json({
      total: rows.length,
      created,
      updated,
      skipped,
    });
  } catch (error) {
    console.error("channelProduct.importProducts:", error);
    res.status(500).json({ message: "Failed to import products" });
  }
};

const getUserProducts = async (req, res) => {
  try {
    await initChannelPartnerTables();
    const { resellerId, userId } = req.params;
    const month = req.query.month;
    const serviceMonth = monthToServiceDate(month);
    if (!serviceMonth) {
      return res.status(400).json({ message: "Valid month (YYYY-MM) required" });
    }

    const [catalog, usage] = await Promise.all([
      pool.query(
        `SELECT * FROM channel_products WHERE is_active = TRUE ORDER BY sort_order ASC NULLS LAST, name ASC`,
      ),
      pool.query(
        `SELECT u.*, p.name AS product_name, p.product_code
         FROM channel_user_product_usage u
         JOIN channel_products p ON p.id = u.product_id
         WHERE u.reseller_id = $1 AND u.user_id = $2 AND u.service_month = $3::date`,
        [resellerId, userId, serviceMonth],
      ),
    ]);

    res.json({
      month,
      catalog: catalog.rows,
      usage: usage.rows,
      line_total: roundAmount(
        usage.rows.reduce((s, r) => s + Number(r.line_total || 0), 0),
      ),
    });
  } catch (error) {
    console.error("channelProduct.getUserProducts:", error);
    res.status(500).json({ message: "Failed to load user products" });
  }
};

const saveUserProducts = async (req, res) => {
  const client = await pool.connect();
  try {
    await initChannelPartnerTables();
    const { resellerId, userId } = req.params;
    const { month, items } = req.body;
    const serviceMonth = monthToServiceDate(month);
    if (!serviceMonth) {
      return res.status(400).json({ message: "Valid month (YYYY-MM) required" });
    }
    if (await isCommissionMonthLocked(resellerId, month)) {
      return res.status(403).json({
        message: "This month is finalized. Product usage cannot be changed.",
      });
    }

    const userCheck = await pool.query(
      `SELECT id FROM channel_partner_users WHERE id = $1 AND reseller_id = $2`,
      [userId, resellerId],
    );
    if (!userCheck.rows.length) {
      return res.status(404).json({ message: "User not found" });
    }

    const normalizedItems = Array.isArray(items) ? items : [];
    const activeIds = normalizedItems
      .filter((i) => Number(i.quantity || 0) > 0)
      .map((i) => Number(i.product_id))
      .filter(Boolean);

    await client.query("BEGIN");

    if (activeIds.length === 0) {
      await client.query(
        `DELETE FROM channel_user_product_usage
         WHERE reseller_id = $1 AND user_id = $2 AND service_month = $3::date`,
        [resellerId, userId, serviceMonth],
      );
    } else {
      await client.query(
        `DELETE FROM channel_user_product_usage
         WHERE reseller_id = $1 AND user_id = $2 AND service_month = $3::date
           AND product_id <> ALL($4::int[])`,
        [resellerId, userId, serviceMonth, activeIds],
      );
    }

    for (const item of normalizedItems) {
      const productId = Number(item.product_id);
      const qty = roundAmount(parseAmount(item.quantity, 0));
      if (!productId || qty <= 0) continue;

      const productResult = await client.query(
        `SELECT id, unit_price FROM channel_products WHERE id = $1 AND is_active = TRUE`,
        [productId],
      );
      if (!productResult.rows.length) continue;

      const unitPrice = roundAmount(productResult.rows[0].unit_price);
      const lineTotal = roundAmount(qty * unitPrice);

      await client.query(
        `INSERT INTO channel_user_product_usage
          (reseller_id, user_id, product_id, service_month, quantity, unit_price_snapshot, line_total, note, created_by)
         VALUES ($1, $2, $3, $4::date, $5, $6, $7, $8, $9)
         ON CONFLICT (user_id, product_id, service_month) DO UPDATE SET
           quantity = EXCLUDED.quantity,
           unit_price_snapshot = EXCLUDED.unit_price_snapshot,
           line_total = EXCLUDED.line_total,
           note = EXCLUDED.note,
           updated_at = NOW()`,
        [
          resellerId,
          userId,
          productId,
          serviceMonth,
          qty,
          unitPrice,
          lineTotal,
          String(item.note || "").trim(),
          req.user?.id || null,
        ],
      );
    }

    await client.query("COMMIT");

    const total = await sumProductDeduction(resellerId, month);
    res.json({ success: true, product_deduction_month: total });
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (_) {
      /* ignore */
    }
    console.error("channelProduct.saveUserProducts:", error);
    res.status(500).json({ message: "Failed to save user products" });
  } finally {
    client.release();
  }
};

const getPartnerProductUsage = async (req, res) => {
  try {
    await initChannelPartnerTables();
    const { resellerId } = req.params;
    const month = req.query.month;
    const serviceMonth = monthToServiceDate(month);
    if (!serviceMonth) {
      return res.status(400).json({ message: "Valid month (YYYY-MM) required" });
    }

    const result = await pool.query(
      `SELECT
        u.id AS usage_id,
        u.user_id,
        cpu.user_name,
        cpu.user_id_code,
        u.product_id,
        p.name AS product_name,
        p.product_code,
        u.quantity,
        u.unit_price_snapshot,
        u.line_total
       FROM channel_user_product_usage u
       JOIN channel_partner_users cpu ON cpu.id = u.user_id
       JOIN channel_products p ON p.id = u.product_id
       WHERE u.reseller_id = $1 AND u.service_month = $2::date
       ORDER BY cpu.user_name ASC, p.name ASC`,
      [resellerId, serviceMonth],
    );

    const total = roundAmount(
      result.rows.reduce((s, r) => s + Number(r.line_total || 0), 0),
    );

    res.json({ month, items: result.rows, total_product_deduction: total });
  } catch (error) {
    console.error("channelProduct.getPartnerProductUsage:", error);
    res.status(500).json({ message: "Failed to load product usage" });
  }
};

const getProductSummary = async (req, res) => {
  try {
    await initChannelPartnerTables();
    const { resellerId } = req.params;
    const month = req.query.month;
    const serviceMonth = monthToServiceDate(month);
    if (!serviceMonth) {
      return res.status(400).json({ message: "Valid month (YYYY-MM) required" });
    }

    const [byProduct, byUser, total] = await Promise.all([
      pool.query(
        `SELECT p.id, p.name, p.product_code,
                COALESCE(SUM(u.quantity), 0)::numeric AS total_qty,
                COALESCE(SUM(u.line_total), 0)::numeric AS total_amount
         FROM channel_user_product_usage u
         JOIN channel_products p ON p.id = u.product_id
         WHERE u.reseller_id = $1 AND u.service_month = $2::date
         GROUP BY p.id, p.name, p.product_code
         ORDER BY total_amount DESC`,
        [resellerId, serviceMonth],
      ),
      pool.query(
        `SELECT cpu.id AS user_id, cpu.user_name, cpu.user_id_code,
                COALESCE(SUM(u.line_total), 0)::numeric AS total_amount,
                COUNT(u.id)::int AS product_count
         FROM channel_partner_users cpu
         LEFT JOIN channel_user_product_usage u
           ON u.user_id = cpu.id AND u.reseller_id = cpu.reseller_id
          AND u.service_month = $2::date
         WHERE cpu.reseller_id = $1
         GROUP BY cpu.id, cpu.user_name, cpu.user_id_code
         HAVING COALESCE(SUM(u.line_total), 0) > 0
         ORDER BY total_amount DESC`,
        [resellerId, serviceMonth],
      ),
      sumProductDeduction(resellerId, month),
    ]);

    res.json({
      month,
      total_product_deduction: total,
      by_product: byProduct.rows,
      by_user: byUser.rows,
    });
  } catch (error) {
    console.error("channelProduct.getProductSummary:", error);
    res.status(500).json({ message: "Failed to load product summary" });
  }
};

module.exports = {
  listProducts,
  createProduct,
  updateProduct,
  importProducts,
  getUserProducts,
  saveUserProducts,
  getPartnerProductUsage,
  getProductSummary,
};
