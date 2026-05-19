import React from "react";
import { Navigate, useLocation, Outlet } from "react-router-dom";

/**
 * Check if a JWT token is expired (client-side check, without verification).
 * Returns true if the token is expired or malformed.
 */
const isTokenExpired = (token) => {
  if (!token) return true;
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return true;
    // Base64url decode the payload
    const payload = JSON.parse(
      atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")),
    );
    if (!payload.exp) return false; // No expiry = never expires
    // Add a 30-second buffer to prevent edge-case race conditions
    return Date.now() / 1000 > payload.exp - 30;
  } catch {
    return true; // Malformed token = treat as expired
  }
};

/**
 * Private Route Wrapper
 * Replaces: auth_check.php (Backend Logic)
 */
const PrivateRoute = () => {
  const location = useLocation();

  const userString = localStorage.getItem("user");
  const token = localStorage.getItem("token");

  // If no user data in localStorage, redirect to login
  if (!userString) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // If token is expired, clear stale data and redirect to login
  if (isTokenExpired(token)) {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <Outlet />;
};

export default PrivateRoute;
