import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { getUserDashboardData } from '../services/userDashboardService';
import NoticeTicker from '../components/NoticeTicker';
import moment from 'moment';

const UserDashboard = () => {
  const user = JSON.parse(localStorage.getItem('user') || '{}');

  const { data, isLoading: loading } = useQuery({
    queryKey: ['userDashboard'],
    queryFn: getUserDashboardData,
  });

  // Configuration for quota cards (Colors & Labels)
  const quotaConfig = [
    { key: 'Holiday', label: 'Holiday', color: '#4318ff', defaultLimit: 12 },
    { key: 'Festival', label: 'Festival', color: '#00b5ad', defaultLimit: 8 },
    { key: 'Half Day', label: 'Half Day', color: '#ff9800', defaultLimit: 0 },
    { key: 'Unpaid', label: 'Unpaid', color: '#f44336', defaultLimit: 0 }
  ];

  const renderQuotaCard = (config) => {
    if (!data) return null;
    
    const used = data.quotaUsage[config.key] || 0;
    const entitlement = data.entitlements[config.key];
    
    let limitText = "";
    
    if (entitlement !== undefined && entitlement > 0) {
      const remaining = Math.max(0, entitlement - used);
      limitText = ` / ${entitlement} দিন (বাকি: ${remaining} দিন)`;
    } else if (entitlement === 0) {
      limitText = " (কোনো কোটা নেই)";
    } else {
      // Fallback if no entitlement record found but config has default (mostly for display)
      if (config.defaultLimit > 0) {
         limitText = ` / ${config.defaultLimit} দিন`;
      } else {
         limitText = " দিন";
      }
    }

    return (
      <div className="col-md-6 col-xl-3" key={config.key}>
        <div className="card border-0 shadow-sm h-100" style={{ borderLeft: `5px solid ${config.color}`, borderRadius: '15px' }}>
          <div className="card-body d-flex align-items-center justify-content-between">
            <div>
              <h6 className="text-muted fw-bold mb-1">{config.label}</h6>
              <h5 className="fw-bold mb-0 text-dark">
                {used}{limitText}
              </h5>
            </div>
            <div className="rounded-circle p-3 d-flex align-items-center justify-content-center" 
                 style={{ width: '50px', height: '50px', backgroundColor: `${config.color}20`, color: config.color }}>
              <i className="fas fa-chart-pie fa-lg"></i>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="container-fluid p-4">
      <NoticeTicker />
      
      <div className="d-flex justify-content-between align-items-center mb-4">
        <div>
          <h4 className="fw-bold text-dark mb-1">স্বাগতম, {user.full_name}</h4>
          <p className="text-muted small mb-0">{moment().format('dddd, D MMMM YYYY')}</p>
        </div>
        <div className="d-none d-md-block">
          <span className="badge bg-white text-primary shadow-sm px-3 py-2 rounded-pill border">
            <i className="fas fa-id-badge me-2"></i>{user.emp_id || user.employee_id}
          </span>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-5">
          <div className="spinner-border text-primary" role="status"></div>
        </div>
      ) : (
        <div className="row g-4 mb-4">
          {quotaConfig.map(conf => renderQuotaCard(conf))}
        </div>
      )}

      {/* Quick Actions */}
      <div className="row g-4">
        <div className="col-md-4">
          <a href="/apply-leave" className="card border-0 shadow-sm h-100 text-decoration-none card-hover">
            <div className="card-body text-center p-4">
              <div className="icon-box bg-primary bg-opacity-10 text-primary mx-auto mb-3 rounded-circle d-flex align-items-center justify-content-center" style={{width: '60px', height: '60px', fontSize: '24px'}}>
                <i className="fas fa-plus"></i>
              </div>
              <h6 className="fw-bold text-dark">নতুন ছুটির আবেদন</h6>
              <p className="text-muted small mb-0">ছুটির জন্য আবেদন করতে এখানে ক্লিক করুন</p>
            </div>
          </a>
        </div>
        <div className="col-md-4">
          <a href="/my-leaves" className="card border-0 shadow-sm h-100 text-decoration-none card-hover">
            <div className="card-body text-center p-4">
              <div className="icon-box bg-success bg-opacity-10 text-success mx-auto mb-3 rounded-circle d-flex align-items-center justify-content-center" style={{width: '60px', height: '60px', fontSize: '24px'}}>
                <i className="fas fa-list-ul"></i>
              </div>
              <h6 className="fw-bold text-dark">আমার আবেদনসমূহ</h6>
              <p className="text-muted small mb-0">পূর্বের আবেদনের অবস্থা দেখুন</p>
            </div>
          </a>
        </div>
        <div className="col-md-4">
          <a href="/profile" className="card border-0 shadow-sm h-100 text-decoration-none card-hover">
            <div className="card-body text-center p-4">
              <div className="icon-box bg-info bg-opacity-10 text-info mx-auto mb-3 rounded-circle d-flex align-items-center justify-content-center" style={{width: '60px', height: '60px', fontSize: '24px'}}>
                <i className="fas fa-user"></i>
              </div>
              <h6 className="fw-bold text-dark">প্রোফাইল</h6>
              <p className="text-muted small mb-0">আপনার ব্যক্তিগত তথ্য দেখুন</p>
            </div>
          </a>
        </div>
      </div>
    </div>
  );
};

export default UserDashboard;