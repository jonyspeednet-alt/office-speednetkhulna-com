import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import BrandLogo from '../components/BrandLogo';
import { t } from '../i18n';
import '../styles/Login.css';

const UserIcon = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
    <circle cx="12" cy="7" r="4"></circle>
  </svg>
);

const ForgotPassword = () => {
  const [identifier, setIdentifier] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setLoading(true);

    try {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      setMessage(t('forgotPassword.success'));
      setIdentifier('');
    } catch (err) {
      setError(t('forgotPassword.failure'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-card text-center animate-fade-in-up">
        <BrandLogo className="logo" alt="Speed Net Khulna" />
        <h4 className="fw-bold text-dark">{t('forgotPassword.title')}</h4>
        <p className="text-muted small mb-4">{t('forgotPassword.subtitle')}</p>

        {error && (
          <div className="alert alert-danger py-2 small rounded-3 text-center mb-3">
            {error}
          </div>
        )}

        {message ? (
          <div className="alert alert-success py-2 small rounded-3 text-center mb-3">
            {message}
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="text-start">
            <div className="mb-4">
              <label htmlFor="identifier" className="form-label small fw-bold">{t('forgotPassword.identifierLabel')}</label>
              <div className="input-wrapper">
                <UserIcon className="input-icon" />
                <input
                  type="text"
                  id="identifier"
                  className="form-control with-icon"
                  placeholder={t('forgotPassword.identifierPlaceholder')}
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  required
                />
              </div>
            </div>
            <button type="submit" className="btn btn-primary w-100" disabled={loading}>
              {loading ? t('forgotPassword.sending') : t('forgotPassword.send')}
            </button>
          </form>
        )}

        <div className="mt-4">
          <Link to="/" className="forgot-password-link">{t('forgotPassword.backToLogin')}</Link>
        </div>
        <p className="mt-4 small text-muted">&copy; 2025 Speed Net Khulna</p>
      </div>
    </div>
  );
};

export default ForgotPassword;