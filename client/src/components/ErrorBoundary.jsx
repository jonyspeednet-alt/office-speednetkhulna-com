import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary] Caught error:', error, info);
  }

  handleReload = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  handleGoHome = () => {
    this.setState({ hasError: false, error: null });
    window.location.href = '/';
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: '#f8f9fa',
            padding: '2rem',
          }}
        >
          <div
            style={{
              background: '#fff',
              borderRadius: '16px',
              boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
              padding: '3rem',
              maxWidth: '480px',
              width: '100%',
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>⚠️</div>
            <h2 style={{ color: '#dc3545', fontWeight: 700, marginBottom: '0.5rem' }}>
              কিছু একটা ভুল হয়েছে
            </h2>
            <p style={{ color: '#6c757d', marginBottom: '1.5rem' }}>
              পেজটি লোড করতে সমস্যা হচ্ছে। পেজ রিলোড করুন অথবা হোম পেজে ফিরে যান।
            </p>
            {this.state.error && (
              <details
                style={{
                  background: '#f8d7da',
                  borderRadius: '8px',
                  padding: '0.75rem 1rem',
                  marginBottom: '1.5rem',
                  textAlign: 'left',
                  fontSize: '0.8rem',
                  color: '#721c24',
                }}
              >
                <summary style={{ cursor: 'pointer', fontWeight: 600 }}>বিস্তারিত দেখুন</summary>
                <pre style={{ marginTop: '0.5rem', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                  {this.state.error.toString()}
                </pre>
              </details>
            )}
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
              <button
                onClick={this.handleReload}
                style={{
                  background: '#0d6efd',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '0.6rem 1.5rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontSize: '0.95rem',
                }}
              >
                🔄 পেজ রিলোড করুন
              </button>
              <button
                onClick={this.handleGoHome}
                style={{
                  background: '#f8f9fa',
                  color: '#495057',
                  border: '1px solid #dee2e6',
                  borderRadius: '8px',
                  padding: '0.6rem 1.5rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontSize: '0.95rem',
                }}
              >
                🏠 হোম পেজ
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
