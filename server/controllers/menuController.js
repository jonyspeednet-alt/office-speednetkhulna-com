const pool = require('../utilities/db');

const normalizeMenuLink = (link) => {
  if (link === null || link === undefined) return '';
  let cleanPath = String(link).trim().replace(/\\/g, '/');
  if (!cleanPath) return '';

  if (/^https?:\/\//i.test(cleanPath)) return cleanPath;

  if (!cleanPath.startsWith('/')) cleanPath = `/${cleanPath}`;
  cleanPath = cleanPath.replace(/_/g, '-');

  if (cleanPath === '/' || cleanPath === '/index' || cleanPath === '/dashboard') return '/dashboard';
  return cleanPath;
};

const migrateLegacyMenuLinks = async () => {
  const result = await pool.query('SELECT id, link FROM sidebar_menus');
  const updates = [];

  for (const row of result.rows) {
    const normalized = normalizeMenuLink(row.link);
    if (normalized && normalized !== row.link) {
      updates.push(pool.query('UPDATE sidebar_menus SET link = $1 WHERE id = $2', [normalized, row.id]));
    }
  }

  if (updates.length > 0) await Promise.all(updates);
};

// Get all menus
const getMenus = async (req, res) => {
  try {
    await migrateLegacyMenuLinks();
    const result = await pool.query('SELECT * FROM sidebar_menus ORDER BY sort_order ASC');
    res.json(result.rows);
  } catch (error) {
    console.error('Get Menus Error:', error);
    res.status(500).json({ message: 'Server Error' });
  }
};

// Save (Add/Update) Menu
const saveMenu = async (req, res) => {
  try {
    const { id, menu_name, link, permission_column, category, sort_order, parent_id, is_visible } = req.body;
    let { icon } = req.body;
    const normalizedLink = normalizeMenuLink(link);

    // Auto-icon logic (replicating PHP logic)
    if (!icon || icon.trim() === '') {
       const nameLower = menu_name.toLowerCase();
       if (nameLower.includes('user') || nameLower.includes('employee') || nameLower.includes('staff')) icon = 'fa-users';
       else if (nameLower.includes('report') || nameLower.includes('chart')) icon = 'fa-chart-line';
       else if (nameLower.includes('setting') || nameLower.includes('config')) icon = 'fa-cogs';
       else if (nameLower.includes('bill') || nameLower.includes('invoice') || nameLower.includes('payment')) icon = 'fa-file-invoice-dollar';
       else if (nameLower.includes('leave') || nameLower.includes('holiday')) icon = 'fa-calendar-alt';
       else if (nameLower.includes('reseller')) icon = 'fa-network-wired';
       else icon = 'fa-circle';
    }

    const pId = parent_id ? parseInt(parent_id) : null;
    const visible = is_visible ? 1 : 0;
    const menuId = id ? parseInt(id) : null;

    if (menuId) {
      // Update
      const updateQuery = `
        UPDATE sidebar_menus 
        SET menu_name=$1, link=$2, icon=$3, permission_column=$4, category=$5, sort_order=$6, parent_id=$7, is_visible=$8 
        WHERE id=$9
      `;
      const result = await pool.query(updateQuery, [menu_name, normalizedLink, icon, permission_column, category, sort_order, pId, visible, menuId]);
      
      if (result.rowCount === 0) {
        return res.status(404).json({ message: 'Menu not found' });
      }
      
      res.json({ message: 'Menu updated successfully' });
    } else {
      // Insert
      const insertQuery = `
        INSERT INTO sidebar_menus (menu_name, link, icon, permission_column, category, sort_order, parent_id, is_visible) 
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `;
      await pool.query(insertQuery, [menu_name, normalizedLink, icon, permission_column, category, sort_order, pId, visible]);
      res.json({ message: 'Menu created successfully' });
    }
  } catch (error) {
    console.error('Save Menu Error:', error);
    res.status(500).json({ message: 'Database Error' });
  }
};

// Delete Menu
const deleteMenu = async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM sidebar_menus WHERE id = $1', [id]);
    res.json({ message: 'Menu deleted successfully' });
  } catch (error) {
    console.error('Delete Menu Error:', error);
    res.status(500).json({ message: 'Database Error' });
  }
};

// Update Order (Batch Update)
const updateMenuOrder = async (req, res) => {
  const client = await pool.connect();
  try {
    const items = req.body; // Expecting array of { id, parent_id, sort_order }
    
    if (!Array.isArray(items)) {
      return res.status(400).json({ message: 'Invalid data format' });
    }

    await client.query('BEGIN');
    const updateQuery = 'UPDATE sidebar_menus SET parent_id = $1, sort_order = $2 WHERE id = $3';
    
    for (const item of items) {
      const pId = item.parent_id ? parseInt(item.parent_id) : null;
      const itemId = item.id ? parseInt(item.id) : null;
      if (itemId) {
        await client.query(updateQuery, [pId, item.sort_order, itemId]);
      }
    }
    
    await client.query('COMMIT');
    res.json({ message: 'Order updated successfully' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Update Order Error:', error);
    res.status(500).json({ message: 'Database Error' });
  } finally {
    client.release();
  }
};

module.exports = { getMenus, saveMenu, deleteMenu, updateMenuOrder };
