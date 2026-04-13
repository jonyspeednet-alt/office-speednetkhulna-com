import React, { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import '../styles/AdminDashboard.css';

const getSidebarIdentity = () => {
  const user = localStorage.getItem('user');
  if (!user) return 'default';

  try {
    const parsed = JSON.parse(user);
    const id = parsed?.id ?? 'default';
    const role = (parsed?.role || 'staff').toLowerCase();
    return `${id}:${role}`;
  } catch (error) {
    return 'default';
  }
};

const Layout = () => {
  const [sidebarKey, setSidebarKey] = useState(getSidebarIdentity);

  useEffect(() => {
    const syncSidebarKey = () => {
      const nextKey = getSidebarIdentity();
      setSidebarKey((prev) => (prev === nextKey ? prev : nextKey));
    };

    const handleStorageChange = (e) => {
      if (!e || e.key === 'user' || e.key === 'token') {
        syncSidebarKey();
      }
    };

    syncSidebarKey();
    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('auth-change', syncSidebarKey);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('auth-change', syncSidebarKey);
    };
  }, []);

  return (
    <div className="admin-wrapper">
      <Sidebar key={sidebarKey} />
      <main className="main-content admin-dashboard-page">
        <Outlet />
      </main>
    </div>
  );
};

export default Layout;