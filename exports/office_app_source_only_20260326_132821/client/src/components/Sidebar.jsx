import React, { useEffect, useMemo, useState, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getSidebarMenus } from '../services/sidebarService';
import { getBandwidthRequests } from '../services/resellerService';
import ImageWithFallback from './ImageWithFallback';
import BrandLogo from './BrandLogo';
import { t } from '../i18n';
import '../styles/Sidebar.css';

const Sidebar = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(() => {
    return localStorage.getItem('sidebarCollapsed') === 'true';
  });
  const [isDarkMode, setIsDarkMode] = useState(() => {
    return localStorage.getItem('darkMode') === 'true';
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [openSubMenus, setOpenSubMenus] = useState({});
  const [showSearch, setShowSearch] = useState(false);
  const [notificationCount, setNotificationCount] = useState(0);
  const [pendingToast, setPendingToast] = useState(null);
  const searchRef = useRef(null);
  const mismatchRetriedRef = useRef(false);
  const pendingCountRef = useRef(0);
  const toastTimerRef = useRef(null);
  const location = useLocation();

  const user = (() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      try {
        const parsedUser = JSON.parse(storedUser);
        return {
          id: parsedUser.id,
          name: parsedUser.full_name || t('sidebar.defaultUser'),
          role: parsedUser.role || t('sidebar.defaultRole'),
        };
      } catch (e) {
        console.error('Error parsing user data', e);
      }
    }
    return { id: null, name: t('sidebar.defaultUser'), role: t('sidebar.defaultRole') };
  })();
  const userKey = `${user?.id ?? 'default'}:${(user?.role || 'staff').toLowerCase()}`;

  const { data: sidebarData, refetch } = useQuery({
    queryKey: ['sidebarMenus', userKey],
    queryFn: getSidebarMenus,
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 30,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    enabled: !!user?.id,
  });

  const userRoleFromStorage = (user?.role || '').trim().toLowerCase();
  const userRoleFromApi = (sidebarData?.role || '').trim().toLowerCase();
  const isRoleMismatch = Boolean(
    sidebarData &&
    userRoleFromStorage &&
    userRoleFromApi &&
    userRoleFromStorage !== userRoleFromApi
  );

  const rawMenuData = isRoleMismatch ? {} : (sidebarData?.menuData || {});
  const userRole = isRoleMismatch ? user.role : (sidebarData?.role || '');

  useEffect(() => {
    document.body.setAttribute('data-theme', isDarkMode ? 'dark' : 'light');
    localStorage.setItem('darkMode', isDarkMode);
  }, [isDarkMode]);

  useEffect(() => {
    localStorage.setItem('sidebarCollapsed', isCollapsed);
  }, [isCollapsed]);

  useEffect(() => {
    if (showSearch && searchRef.current) {
      searchRef.current.focus();
    }
  }, [showSearch]);

  useEffect(() => {
    if (isRoleMismatch && !mismatchRetriedRef.current) {
      mismatchRetriedRef.current = true;
      refetch();
    }
    if (!isRoleMismatch) {
      mismatchRetriedRef.current = false;
    }
  }, [isRoleMismatch, refetch]);

  useEffect(() => {
    if (!user?.id) return undefined;

    let cancelled = false;

    const loadPendingNotifications = async ({ silent } = { silent: false }) => {
      try {
        const data = await getBandwidthRequests('pending');
        if (cancelled) return;
        const count = Array.isArray(data) ? data.length : 0;
        const previousCount = pendingCountRef.current;
        pendingCountRef.current = count;
        setNotificationCount(count);

        if (!silent && count > previousCount) {
          const diff = count - previousCount;
          setPendingToast({
            count,
            message: `${diff}টি নতুন pending request এসেছে`
          });
          if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
          toastTimerRef.current = setTimeout(() => {
            setPendingToast(null);
          }, 5000);
        }
      } catch (error) {
        // Ignore notification polling errors to keep sidebar stable.
      }
    };

    loadPendingNotifications({ silent: true });
    const intervalId = setInterval(() => loadPendingNotifications({ silent: false }), 30000);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, [user?.id]);

  const isActive = (path) => {
    if (!path) return false;
    const currentPath = location.pathname;
    const targetPath = getCleanLink(path);
    return currentPath === targetPath || (targetPath !== '/' && currentPath.startsWith(targetPath));
  };

  const getCleanLink = (link) => {
    if (!link) return '#!';
    if (link.startsWith('http')) return link;

    let cleanPath = link.trim().replace(/\\/g, '/');

    if (!cleanPath.startsWith('/')) {
      cleanPath = `/${cleanPath}`;
    }

    cleanPath = cleanPath.replace(/_/g, '-');

    if (cleanPath === '/dashboard' || cleanPath === '/index' || cleanPath === '/') return '/dashboard';

    return cleanPath;
  };

  const dedupeMenus = (menus = []) => {
    const seen = new Set();
    const out = [];
    const currentRole = String(userRole || user?.role || '').trim().toLowerCase();
    const isSuperAdmin = currentRole === 'super admin' || currentRole === 'superadmin';

    for (const menu of menus) {
      if (!menu) continue;

      const normalizedLink = getCleanLink(menu.link || '').toLowerCase();
      if (normalizedLink === '/system-logs' && !isSuperAdmin) continue;
      if (normalizedLink === '/dashboard' || normalizedLink === '/profile' || normalizedLink === '/logout') continue;

      const dedupeKey = `${String(menu.menu_name || '').trim().toLowerCase()}|${normalizedLink}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);

      let children = Array.isArray(menu.children) ? menu.children : [];
      if (children.length > 0) {
        const childSeen = new Set();
        children = children.filter((child) => {
          const childKey = `${String(child?.menu_name || '').trim().toLowerCase()}|${getCleanLink(child?.link || '').toLowerCase()}`;
          if (childSeen.has(childKey)) return false;
          childSeen.add(childKey);
          return true;
        });
      }

      out.push({ ...menu, children });
    }

    return out;
  };

  const menuData = useMemo(() => {
    const normalized = {};
    Object.keys(rawMenuData || {}).forEach((category) => {
      normalized[category] = dedupeMenus(rawMenuData[category]);
    });
    return normalized;
  }, [rawMenuData]);

  const toggleSidebar = () => setIsOpen(!isOpen);

  const toggleCollapse = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsCollapsed(!isCollapsed);
  };

  const toggleTheme = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDarkMode(!isDarkMode);
  };

  const toggleSubMenu = (id) => {
    setOpenSubMenus((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const toggleSearch = () => {
    setShowSearch(!showSearch);
    if (!showSearch) {
      setTimeout(() => searchRef.current?.focus(), 100);
    }
  };

  const filterMenus = (menus, query) => {
    if (!query) return menus;
    const filtered = {};
    Object.keys(menus).forEach((category) => {
      const categoryMenus = menus[category].filter((menu) =>
        menu.menu_name.toLowerCase().includes(query.toLowerCase()) ||
        (menu.children && menu.children.some((child) => child.menu_name.toLowerCase().includes(query.toLowerCase())))
      );
      if (categoryMenus.length > 0) {
        filtered[category] = categoryMenus;
      }
    });
    return filtered;
  };

  const filteredMenuData = filterMenus(menuData, searchQuery);

  const renderSideLink = (item, isSub = false) => {
    const hasChildren = item.children && item.children.length > 0;
    const isChildActive = hasChildren && item.children.some((child) => isActive(child.link));
    const isMenuOpen = openSubMenus[item.id] || isChildActive;

    if (hasChildren) {
      return (
        <React.Fragment key={item.id}>
          <a
            href="#!"
            className={`side-link d-flex justify-content-between align-items-center ${isChildActive ? 'active' : ''} ${isCollapsed ? 'collapsed-link' : ''}`}
            onClick={(e) => { e.preventDefault(); toggleSubMenu(item.id); }}
            title={isCollapsed ? item.menu_name : undefined}
          >
            <span>
              <i className={`fa-solid ${item.icon}`}></i>
              {!isCollapsed && <span>{item.menu_name}</span>}
            </span>
            {!isCollapsed && (
              <i className={`fa-solid fa-chevron-${isMenuOpen ? 'up' : 'down'}`} style={{ fontSize: '10px', opacity: 0.5 }}></i>
            )}
          </a>
          {!isCollapsed && (
            <div
              className={`collapse-wrapper ${isMenuOpen ? 'show' : ''}`}
              style={{ maxHeight: isMenuOpen ? '500px' : '0', overflow: 'hidden', transition: 'max-height 0.4s ease-in-out' }}
            >
              <div className="sub-menu-container">
                {item.children.map((child) => (
                  <Link key={child.id} to={getCleanLink(child.link)} className={`side-link sub-link ${isActive(child.link) ? 'active' : ''}`}>
                    <i className={`fa-solid ${child.icon}`} style={{ fontSize: '10px' }}></i>
                    {child.menu_name}
                  </Link>
                ))}
              </div>
            </div>
          )}
        </React.Fragment>
      );
    }

    return (
      <Link
        key={item.id}
        to={getCleanLink(item.link)}
        className={`side-link ${isActive(item.link) ? 'active' : ''} ${isCollapsed ? 'collapsed-link' : ''} ${isSub ? 'sub-link' : ''}`}
        title={isCollapsed ? item.menu_name : undefined}
      >
        <i className={`fa-solid ${item.icon}`}></i>
        {!isCollapsed && (
          <>
            <span>{item.menu_name}</span>
            {getCleanLink(item.link) === '/requests-admin' && notificationCount > 0 && (
              <span className="menu-notification-pill">{notificationCount}</span>
            )}
          </>
        )}
      </Link>
    );
  };

  return (
    <>
      {pendingToast && (
        <Link to="/requests-admin" className="pending-toast" onClick={() => setPendingToast(null)}>
          <div className="pending-toast-icon">
            <i className="fa-solid fa-bell"></i>
          </div>
          <div className="pending-toast-copy">
            <strong>New Pending Request</strong>
            <span>{pendingToast.message}</span>
          </div>
        </Link>
      )}

      <button className="mobile-toggle" onClick={toggleSidebar}>
        <i className="fa-solid fa-bars"></i>
      </button>

      <div className={`sidebar-overlay ${isOpen ? 'active' : ''}`} onClick={toggleSidebar}></div>

      <div className={`sidebar ${isOpen ? 'active' : ''} ${isCollapsed ? 'collapsed' : ''} ${isDarkMode ? 'dark-mode' : ''}`} id="sidebar">
        <button className="collapse-toggle" onClick={toggleCollapse} title={isCollapsed ? t('sidebar.expand') : t('sidebar.collapse')}>
          <i className={`fa-solid fa-chevron-${isCollapsed ? 'right' : 'left'}`}></i>
        </button>

        <div className="sidebar-brand">
          <BrandLogo className="brand-logo" alt="Speed Net" />
          {!isCollapsed && <div className="role-badge">{userRole || 'Speed Net'} {t('sidebar.portal')}</div>}
        </div>

        {!isCollapsed && (
          <div className="user-profile-section">
            <div className="user-avatar-container">
              <ImageWithFallback
                src={null}
                fallbackName={user.name}
                className="user-avatar"
                alt={user.name}
                width="40px"
                height="40px"
              />
              <span className="status-indicator online"></span>
            </div>
            <div className="user-info">
              <p className="user-name">{user.name}</p>
              <p className="user-role">{user.role}</p>
            </div>
          </div>
        )}

        <div className={`search-container ${isCollapsed ? 'collapsed' : ''}`}>
          {isCollapsed ? (
            <button className="quick-action-btn" onClick={toggleSearch} title={t('sidebar.search')}>
              <i className="fa-solid fa-magnifying-glass"></i>
            </button>
          ) : (
            <div className="search-input-wrapper">
              <i className="fa-solid fa-magnifying-glass search-icon"></i>
              <input
                ref={searchRef}
                type="text"
                className="search-input"
                placeholder={t('sidebar.searchPlaceholder')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <button className="search-clear-btn" onClick={() => setSearchQuery('')}>
                  <i className="fa-solid fa-times"></i>
                </button>
              )}
            </div>
          )}
        </div>

        <div className="nav-menu">
          {!isCollapsed && searchQuery && (
            <div className="search-results-info" style={{ fontSize: '12px', color: 'var(--side-text)', padding: '0 12px 10px', opacity: 0.7 }}>
              {Object.keys(filteredMenuData).length > 0
                ? t('sidebar.found', { query: searchQuery })
                : t('sidebar.notFound', { query: searchQuery })}
            </div>
          )}

          <Link to="/dashboard" className={`side-link ${isActive('dashboard') ? 'active' : ''} ${isCollapsed ? 'collapsed-link' : ''}`} title={t('sidebar.dashboard')}>
            <i className="fa-solid fa-chart-pie"></i>
            {!isCollapsed && <span>{t('sidebar.dashboard')}</span>}
          </Link>

          {Object.keys((isCollapsed ? menuData : filteredMenuData) || {}).map((category) => (
            <div key={category}>
              {!isCollapsed && <div className="nav-label">{category}</div>}
              {(isCollapsed ? menuData[category] : filteredMenuData[category]).map((menu) => renderSideLink(menu))}
            </div>
          ))}

          {!isCollapsed && <div className="nav-label">{t('sidebar.account')}</div>}
          <Link to="/profile" className={`side-link ${isActive('profile') ? 'active' : ''} ${isCollapsed ? 'collapsed-link' : ''}`} title={isCollapsed ? t('sidebar.profile') : undefined}>
            <i className="fa-solid fa-user-astronaut"></i>
            {!isCollapsed && <span>{t('sidebar.profile')}</span>}
          </Link>
          <Link to="/logout" className={`side-link text-danger ${isCollapsed ? 'collapsed-link' : ''}`} title={isCollapsed ? t('sidebar.logout') : undefined}>
            <i className="fa-solid fa-power-off"></i>
            {!isCollapsed && <span>{t('sidebar.logout')}</span>}
          </Link>
        </div>

        <div className="quick-actions">
          <button className="quick-action-btn" title={t('sidebar.notifications')}>
            <i className="fa-solid fa-bell"></i>
            {notificationCount > 0 && <span className="notification-badge">{notificationCount}</span>}
          </button>
          <button className="quick-action-btn" title={t('sidebar.themeToggle')} onClick={toggleTheme}>
            <i className={`fa-solid fa-${isDarkMode ? 'sun' : 'moon'}`}></i>
          </button>
          {!isCollapsed && (
            <button className="quick-action-btn" title={t('sidebar.settings')}>
              <i className="fa-solid fa-cog"></i>
            </button>
          )}
        </div>

        {!isCollapsed && (
          <div className="sidebar-footer">
            <p className="footer-text">� 2024 Speed Net Khulna</p>
          </div>
        )}
      </div>
    </>
  );
};

export default Sidebar;
