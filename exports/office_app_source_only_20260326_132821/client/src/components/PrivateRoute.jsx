import React from 'react';
import { Navigate, useLocation, Outlet } from 'react-router-dom';

/**
 * Private Route Wrapper
 * Replaces: auth_check.php (Frontend Logic)
 */
const PrivateRoute = () => {
  const location = useLocation();
  // Check for user in localStorage (set during login)
  const isAuthenticated = localStorage.getItem('user');

  if (!isAuthenticated) {
    // Redirect to login, saving the current location in state.from
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <Outlet />;
};

export default PrivateRoute;