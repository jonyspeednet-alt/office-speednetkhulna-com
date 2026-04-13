import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { loginUser } from '../services/authService';
import BrandLogo from '../components/BrandLogo';
import { t } from '../i18n';
import '../styles/Login.css';

const EyeIcon = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
    <circle cx="12" cy="12" r="3"></circle>
  </svg>
);

const EyeOffIcon = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
    <line x1="1" y1="1" x2="23" y2="23"></line>
  </svg>
);

const UserIcon = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
    <circle cx="12" cy="7" r="4"></circle>
  </svg>
);

const Login = () => {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const ROLES = { ADMIN: 'admin', SUPER_ADMIN: 'super admin' };
  const PATHS = { ADMIN_DASHBOARD: '/admin-dashboard', DASHBOARD: '/dashboard' };

  useEffect(() => {
    const savedId = localStorage.getItem('rememberedIdentifier');
    if (savedId) {
      setIdentifier(savedId);
      setRememberMe(true);
    }
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const data = await loginUser(identifier.trim(), password);
      const user = data.user;

      queryClient.clear();

      if (rememberMe) {
        localStorage.setItem('rememberedIdentifier', identifier);
      } else {
        localStorage.removeItem('rememberedIdentifier');
      }

      const role = user?.role?.toLowerCase() ?? '';
      if (role === ROLES.ADMIN || role === ROLES.SUPER_ADMIN) {
        navigate(PATHS.ADMIN_DASHBOARD);
      } else {
        navigate(PATHS.DASHBOARD);
      }
    } catch (err) {
      setError(err.message || t('login.invalidCreds'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-card text-center animate-fade-in-up">
        <BrandLogo className="logo" alt="Speed Net Khulna" />
        <h4 className="fw-bold text-dark">{t('login.welcomeBack')}</h4>
        <p className="text-muted small mb-4">{t('login.subtitle')}</p>

        {error && (
          <div className="alert alert-danger py-2 small rounded-3 text-center mb-3">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="text-start">
          <div className="mb-3">
            <label htmlFor="identifier" className="form-label small fw-bold">{t('login.identifierLabel')}</label>
            <div className="input-wrapper">
              <UserIcon className="input-icon" />
              <input
                type="text"
                id="identifier"
                className="form-control with-icon"
                placeholder={t('login.identifierPlaceholder')}
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                required
              />
            </div>
          </div>
          <div className="mb-3">
            <label htmlFor="password" className="form-label small fw-bold">{t('login.passwordLabel')}</label>
            <div className="input-wrapper">
              <input
                type={showPassword ? 'text' : 'password'}
                id="password"
                className="form-control"
                placeholder={t('login.passwordPlaceholder')}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <span className="password-toggle-icon" onClick={() => setShowPassword(!showPassword)}>
                {showPassword ? <EyeOffIcon /> : <EyeIcon />}
              </span>
            </div>
          </div>
          <div className="d-flex justify-content-between align-items-center mb-4">
            <div className="form-check">
              <input
                className="form-check-input"
                type="checkbox"
                id="rememberMe"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
              />
              <label className="form-check-label" htmlFor="rememberMe">
                {t('login.rememberMe')}
              </label>
            </div>
            <Link to="/forgot-password" className="forgot-password-link">{t('login.forgotPassword')}</Link>
          </div>
          <button type="submit" className="btn btn-primary w-100" disabled={loading}>
            {loading ? t('login.loggingIn') : t('login.loginNow')}
          </button>
        </form>
        <p className="mt-4 small text-muted">&copy; 2025 Speed Net Khulna</p>
      </div>
    </div>
  );
};

export default Login;