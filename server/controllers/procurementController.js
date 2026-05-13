const pool = require('../utilities/db');
const { resolvePermission } = require('../utilities/permissionRegistry');

const normalizeText = (value) => String(value ?? '').trim();
const parseNum = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const requireProcurementAccess = (req, res, mode = 'view') => {
  if (resolvePermission(req.user, 'procurement.manage')) return true;
  res.status(403).json({ message: `Unauthorized: missing procurement permission` });
  return false;
};

const ensureProcurementSchema = async () => {
  // Similar to asset schema, we could auto-create tables here if needed.
  // For now, we assume migrations are run.
};

const listPurchaseOrders = async (req, res) => {
  try {
    if (!requireProcurementAccess(req, res, 'view')) return;

    const result = await pool.query(`
      SELECT 
        po.*, 
        v.name AS vendor_name,
        u.full_name AS creator_name,
        (SELECT COUNT(*)::int FROM purchase_order_items poi WHERE poi.po_id = po.id) AS item_count
      FROM purchase_orders po
      LEFT JOIN asset_vendors v ON v.id = po.vendor_id
      LEFT JOIN users u ON u.id = po.created_by
      ORDER BY po.order_date DESC, po.id DESC
    `);

    res.json(result.rows);
  } catch (error) {
    console.error('listPurchaseOrders:', error);
    res.status(500).json({ message: 'Failed to load purchase orders' });
  }
};

const getPurchaseOrderDetails = async (req, res) => {
  try {
    if (!requireProcurementAccess(req, res, 'view')) return;

    const poId = parseNum(req.params.id, 0);
    if (!poId) return res.status(400).json({ message: 'Invalid PO ID' });

    const poResult = await pool.query(`
      SELECT po.*, v.name AS vendor_name, u.full_name AS creator_name
      FROM purchase_orders po
      LEFT JOIN asset_vendors v ON v.id = po.vendor_id
      LEFT JOIN users u ON u.id = po.created_by
      WHERE po.id = $1
    `, [poId]);

    if (!poResult.rows.length) return res.status(404).json({ message: 'Purchase Order not found' });

    const itemsResult = await pool.query(`
      SELECT * FROM purchase_order_items WHERE po_id = $1 ORDER BY id ASC
    `, [poId]);

    res.json({
      ...poResult.rows[0],
      items: itemsResult.rows
    });
  } catch (error) {
    console.error('getPurchaseOrderDetails:', error);
    res.status(500).json({ message: 'Failed to load purchase order details' });
  }
};

const createPurchaseOrder = async (req, res) => {
  const client = await pool.connect();
  try {
    if (!requireProcurementAccess(req, res, 'manage')) return;

    const { vendor_id, order_date, expected_delivery_date, notes, items } = req.body;
    
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: 'At least one item is required' });
    }

    const totalAmount = items.reduce((sum, item) => sum + (parseNum(item.quantity) * parseNum(item.unit_price)), 0);
    const poNumber = `PO-${Date.now()}`;

    await client.query('BEGIN');

    const poResult = await client.query(`
      INSERT INTO purchase_orders (
        po_number, vendor_id, order_date, expected_delivery_date, total_amount, status, created_by, notes
      ) VALUES ($1, $2, $3, $4, $5, 'pending', $6, $7)
      RETURNING *
    `, [
      poNumber, 
      parseNum(vendor_id, null), 
      order_date || new Date(), 
      expected_delivery_date || null, 
      totalAmount,
      req.user?.id || null,
      normalizeText(notes)
    ]);

    const poId = poResult.rows[0].id;

    for (const item of items) {
      await client.query(`
        INSERT INTO purchase_order_items (
          po_id, item_name, description, quantity, unit_price, total_price
        ) VALUES ($1, $2, $3, $4, $5, $6)
      `, [
        poId,
        normalizeText(item.item_name),
        normalizeText(item.description),
        parseNum(item.quantity, 1),
        parseNum(item.unit_price, 0),
        parseNum(item.quantity, 1) * parseNum(item.unit_price, 0)
      ]);
    }

    await client.query('COMMIT');
    res.status(201).json(poResult.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('createPurchaseOrder:', error);
    res.status(500).json({ message: 'Failed to create purchase order' });
  } finally {
    client.release();
  }
};

const updatePOStatus = async (req, res) => {
  try {
    if (!requireProcurementAccess(req, res, 'manage')) return;

    const poId = parseNum(req.params.id, 0);
    const { status } = req.body;

    if (!poId || !status) return res.status(400).json({ message: 'PO ID and status are required' });

    const result = await pool.query(`
      UPDATE purchase_orders 
      SET status = $1, updated_at = NOW() 
      WHERE id = $2 
      RETURNING *
    `, [status, poId]);

    if (!result.rows.length) return res.status(404).json({ message: 'Purchase Order not found' });

    res.json(result.rows[0]);
  } catch (error) {
    console.error('updatePOStatus:', error);
    res.status(500).json({ message: 'Failed to update purchase order status' });
  }
};

module.exports = {
  listPurchaseOrders,
  getPurchaseOrderDetails,
  createPurchaseOrder,
  updatePOStatus
};
