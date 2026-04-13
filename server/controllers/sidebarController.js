const pool = require('../utilities/db');
const ALWAYS_VISIBLE_LINKS = new Set(['/employees']);
const normalizeMenuLink = (link) => {
  if (!link) return '';
  let cleanPath = String(link).trim().replace(/\\/g, '/');
  if (!cleanPath.startsWith('/')) cleanPath = `/${cleanPath}`;
  cleanPath = cleanPath.replace(/_/g, '-');
  if (cleanPath === '/' || cleanPath === '/index' || cleanPath === '/dashboard') return '/dashboard';
  return cleanPath;
};

/**
 * Get Sidebar Data
 * Replaces logic in sidebar.php
 */
const getSidebarData = async (req, res) => {
  try {
    // Prevent any intermediary/browser cache from reusing sidebar data across users.
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Surrogate-Control', 'no-store');

    // 1. User Context from auth middleware
    const { id: userId, role_name, permissions } = req.user;
    const isSuperAdmin = ['super admin', 'superadmin'].includes((role_name || '').toLowerCase());

    // 2. Fetch menus from DB (Super Admin sees all, others only visible)
    const menuQuery = isSuperAdmin
      ? 'SELECT * FROM sidebar_menus ORDER BY sort_order ASC'
      : 'SELECT * FROM sidebar_menus WHERE is_visible = 1 ORDER BY sort_order ASC';
    const menuResult = await pool.query(menuQuery);
    const allMenus = menuResult.rows;

    // Fallback: if DB menus are empty, provide a default set for Super Admin.
    if (isSuperAdmin && allMenus.length === 0) {
      return res.json({
        role: role_name || 'Super Admin',
        menuData: {
          Administration: [
            { id: 1001, menu_name: 'Admin Dashboard', link: '/admin-dashboard', icon: 'fa-gauge-high', children: [] },
            { id: 1002, menu_name: 'Employees', link: '/employees', icon: 'fa-users', children: [] },
            { id: 1003, menu_name: 'Manage Leaves', link: '/manage-leaves', icon: 'fa-calendar-check', children: [] },
            { id: 1004, menu_name: 'Entitlements', link: '/manage-entitlements', icon: 'fa-layer-group', children: [] },
            { id: 1005, menu_name: 'Permissions', link: '/manage-permissions', icon: 'fa-user-shield', children: [] },
            { id: 1006, menu_name: 'Menus', link: '/manage-menus', icon: 'fa-bars', children: [] },
            { id: 1007, menu_name: 'Leave Report', link: '/leave-report', icon: 'fa-chart-line', children: [] },
            { id: 1008, menu_name: 'Phone Directory', link: '/phone-directory', icon: 'fa-address-book', children: [] },
            { id: 1009, menu_name: 'Leave Calendar', link: '/leave-calendar', icon: 'fa-calendar-days', children: [] },
            { id: 1010, menu_name: 'Apply Leave', link: '/apply-leave', icon: 'fa-paper-plane', children: [] },
            { id: 1011, menu_name: 'Office Work Tracker', link: '/office-work-tracker', icon: 'fa-clipboard-list', children: [] },
            { id: 1012, menu_name: 'Internet Registration', link: '/internet-registration', icon: 'fa-wifi', children: [] }
          ]
        }
      });
    }

    // 3. Filter Menus based on RBAC permissions
    const visibleMenus = allMenus.filter(menu => {
      if (isSuperAdmin || (permissions && permissions['all_access'])) return true;
      if (ALWAYS_VISIBLE_LINKS.has(normalizeMenuLink(menu.link))) return true;
      if (!menu.permission_column) return true;
      return permissions && permissions[menu.permission_column];
    });

    const hasEmployeesMenu = visibleMenus.some((m) => normalizeMenuLink(m.link) === '/employees');
    if (!hasEmployeesMenu) {
      visibleMenus.push({
        id: 1002,
        menu_name: 'Employees',
        link: '/employees',
        icon: 'fa-users',
        category: 'Administration',
        parent_id: null,
        sort_order: 2,
      });
    }

    const hasOfficeWorkTracker = visibleMenus.some((m) => normalizeMenuLink(m.link) === '/office-work-tracker');
    if (!hasOfficeWorkTracker) {
      visibleMenus.push({
        id: 1011,
        menu_name: 'Office Work Tracker',
        link: '/office-work-tracker',
        icon: 'fa-clipboard-list',
        category: 'Administration',
        parent_id: null,
        sort_order: 11,
      });
    }

    const hasInternetRegistration = visibleMenus.some((m) => normalizeMenuLink(m.link) === '/internet-registration');
    if (!hasInternetRegistration) {
      visibleMenus.push({
        id: 1012,
        menu_name: 'Internet Registration',
        link: '/internet-registration',
        icon: 'fa-wifi',
        category: 'Administration',
        parent_id: null,
        sort_order: 12,
      });
    }

    const hasAssetManagement = visibleMenus.some((m) => normalizeMenuLink(m.link) === '/asset-management');
    if (!hasAssetManagement) {
      visibleMenus.push({
        id: 1013,
        menu_name: 'Asset Management',
        link: '/asset-management',
        icon: 'fa-boxes-stacked',
        category: 'Administration',
        parent_id: null,
        sort_order: 14,
      });
    }

    // 4. Structure Data
    const groupedMenus = {};
    const subMenusMap = {};

    // First pass: Identify submenus (children)
    visibleMenus.forEach(menu => {
      if (menu.parent_id) {
        if (!subMenusMap[menu.parent_id]) {
          subMenusMap[menu.parent_id] = [];
        }
        subMenusMap[menu.parent_id].push(menu);
      }
    });

    // Second pass: Group top-level menus by category and filter out parents without permissions (if children have permissions)
    visibleMenus.forEach(menu => {
      if (!menu.parent_id) {
        const category = menu.category || 'General';
        
        // Attach children if any
        const children = subMenusMap[menu.id] || [];
        
        // If it's not a super admin, we should only show the parent if it has permission OR if it has children that are visible
        // However, visibleMenus already contains only menus the user has permission for (including children)
        // So if a parent is in visibleMenus, the user has permission for it.
        // If it's NOT in visibleMenus but has children that ARE (though children usually require parent's category), 
        // we might need to adjust logic. In the PHP version, it seems parents are checked individually.
        
        if (!groupedMenus[category]) {
          groupedMenus[category] = [];
        }

        groupedMenus[category].push({
          ...menu,
          children
        });
      }
    });

    // Final pass: Remove empty categories
    const finalGroupedMenus = {};
    Object.keys(groupedMenus).forEach(cat => {
      if (groupedMenus[cat].length > 0) {
        finalGroupedMenus[cat] = groupedMenus[cat];
      }
    });

    res.json({
      role: role_name || 'Staff',
      menuData: finalGroupedMenus
    });

  } catch (error) {
    console.error('Sidebar Data Error:', error);
    res.status(500).json({ message: 'Server Error' });
  }
};

module.exports = { getSidebarData };
