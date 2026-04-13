const pool = require('../utilities/db');

const sql = `
-- Add permission for office work tracker
INSERT INTO permissions (code, legacy_key, name, description, module)
VALUES 
  ('office_work.manage', 'p_office_work', 'Office Work Tracker', 'Track and manage daily office work', 'staff')
ON CONFLICT (code) DO NOTHING;

-- Add sidebar menu for Office Work Tracker
INSERT INTO sidebar_menus (menu_name, link, icon, category, parent_id, permission_column, is_visible, sort_order)
VALUES 
  ('Office Work Tracker', '/office-work-tracker', 'fa-clipboard-list', 'Administration', NULL, '', 1, 11)
ON CONFLICT (link) DO NOTHING;

-- Make menu visible to all authenticated users
UPDATE sidebar_menus
SET permission_column = '',
    is_visible = 1
WHERE link = '/office-work-tracker'
  ;
`;

async function run() {
  try {
    console.log('Connecting...');
    const dbInfo = await pool.query('SELECT current_database() as db');
    console.log('DB:', dbInfo.rows[0].db);
    
    console.log('Adding permission and menu...');
    await pool.query(sql);
    console.log('Done!');
    
    // Verify
    const perm = await pool.query("SELECT code FROM permissions WHERE code = 'office_work.manage'");
    if (perm.rows.length > 0) console.log('✓ Permission created');
    
    const menu = await pool.query("SELECT menu_name FROM sidebar_menus WHERE link = '/office-work-tracker'");
    if (menu.rows.length > 0) console.log('✓ Menu created');
    
    process.exit(0);
  } catch (e) {
    console.error('Error:', e.message);
    process.exit(1);
  }
}

run();
