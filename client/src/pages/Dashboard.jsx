import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

const Dashboard = () => {
  const navigate = useNavigate();

  useEffect(() => {
    // Retrieve user data from local storage (set during login)
    const userString = localStorage.getItem('user');
    
    if (!userString) {
      navigate('/login');
      return;
    }

    const user = JSON.parse(userString);
    const role = user.role ? user.role.toLowerCase() : '';

    if (role === 'admin' || role === 'super admin') {
      navigate('/admin-dashboard', { replace: true });
    } else {
      navigate('/user-dashboard', { replace: true });
    }
  }, [navigate]);

  // Show a loading state while redirecting
  return null;
};

export default Dashboard;