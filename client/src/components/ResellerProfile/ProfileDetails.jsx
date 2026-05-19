import React from 'react';
import { fmtDate, money, partnerTypeLabel } from '../../utils/formatters';

const DetailRow = ({ label, children }) => (
    <div className="rp-detail-row">
        <span className="text-muted">{label}</span>
        <span className="fw-semibold text-end text-break">{children}</span>
    </div>
);

const ProfileDetails = ({ reseller, can, onEditClick }) => {
    const isChannel = reseller.partner_type === 'channel_partner';

    return (
        <div className="p-2 p-sm-3">
            <div className="d-flex justify-content-between align-items-center mb-3">
                <div className="d-flex align-items-center gap-2">
                    <div
                        className="d-flex align-items-center justify-content-center rounded-3"
                        style={{ width: 42, height: 42, background: 'linear-gradient(135deg, #4318ff 0%, #7c58ff 100%)' }}
                    >
                        <i className="fas fa-id-card text-white" />
                    </div>
                    <div>
                        <h6 className="fw-bold m-0">প্রোফাইল বিস্তারিত</h6>
                        <span className="text-muted small">Basic information and settings</span>
                    </div>
                </div>
                {can.can_edit_profile && (
                    <button type="button" className="btn btn-sm btn-outline-primary rounded-pill px-3" onClick={onEditClick}>
                        <i className="fas fa-edit me-1" /> সম্পাদনা
                    </button>
                )}
            </div>
            <div className="row g-3">
                <div className="col-12 col-md-6">
                    <div className="card border-0 bg-light rounded-3 p-3 h-100">
                        <h6 className="fw-bold small text-muted text-uppercase mb-2">
                            <i className="fas fa-building me-1" /> সাধারণ তথ্য
                        </h6>
                        <div className="rp-details-grid">
                            <DetailRow label="কোম্পানি">{reseller.company_name || '-'}</DetailRow>
                            <DetailRow label="ফোন">{reseller.phone || '-'}</DetailRow>
                            <DetailRow label="ইউজার আইডি">{reseller.reseller_code || '-'}</DetailRow>
                            <DetailRow label="Partner Type">{partnerTypeLabel(reseller.partner_type)}</DetailRow>
                            <DetailRow label="স্ট্যাটাস">
                                <span className={`badge rounded-pill ${reseller.status === 'active' ? 'bg-success-subtle text-success-emphasis border border-success-subtle' : 'bg-danger-subtle text-danger-emphasis border border-danger-subtle'}`}>
                                    {reseller.status}
                                </span>
                            </DetailRow>
                        </div>
                    </div>
                </div>
                <div className="col-12 col-md-6">
                    <div className="card border-0 bg-light rounded-3 p-3 h-100">
                        <h6 className="fw-bold small text-muted text-uppercase mb-2">
                            <i className="fas fa-map-marker-alt me-1" /> ঠিকানা ও সংযোগ
                        </h6>
                        <div className="rp-details-grid">
                            {!isChannel && (
                                <DetailRow label="সংযোগ">
                                    {reseller.nttn_type || '-'}
                                    {reseller.connection_type ? `, ${reseller.connection_type}` : ''}
                                </DetailRow>
                            )}
                            {isChannel && (
                                <>
                                    <DetailRow label="মোট ইউজার">{Number(reseller.channel_user_count || 0).toLocaleString('bn-BD')}</DetailRow>
                                    <DetailRow label="সক্রিয় ইউজার">
                                        {Number((reseller.channel_active_user_count ?? reseller.channel_user_count) || 0).toLocaleString('bn-BD')}
                                    </DetailRow>
                                </>
                            )}
                            {!isChannel && (
                                <DetailRow label="NTTN Link">
                                    {reseller.nttn_link ? (
                                        <a href={reseller.nttn_link} target="_blank" rel="noreferrer" className="text-decoration-none small">
                                            লিংক
                                        </a>
                                    ) : '-'}
                                </DetailRow>
                            )}
                            <DetailRow label="Joining Date">{fmtDate(reseller.joining_date)}</DetailRow>
                            <DetailRow label="লোকেশন">{reseller.pop_location || '-'}</DetailRow>
                            {(reseller.latitude && reseller.longitude) && (
                                <DetailRow label="ম্যাপ">
                                    <a
                                        href={`https://www.google.com/maps?q=${reseller.latitude},${reseller.longitude}`}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="btn btn-xs btn-outline-primary py-0 px-2 rounded-pill"
                                    >
                                        দেখুন
                                    </a>
                                </DetailRow>
                            )}
                            {isChannel && can.can_view_financials && (
                                <DetailRow label="Profit Share">
                                    <span className="badge bg-success bg-opacity-10 text-success border border-success border-opacity-25">
                                        {Number(reseller.profit_share_percentage || 0)}%
                                    </span>
                                </DetailRow>
                            )}
                        </div>
                    </div>
                </div>
            </div>
            {/* Financial extras */}
            {(Number(reseller.security_deposit || 0) > 0 || (can.can_view_financials && Number(reseller.otc_charge || 0) > 0)) && (
                <div className="card border-0 bg-light rounded-3 p-3 mt-3">
                    <h6 className="fw-bold small text-muted text-uppercase mb-2">
                        <i className="fas fa-coins me-1" /> আর্থিক তথ্য
                    </h6>
                    <div className="rp-details-grid rp-details-2col">
                        {Number(reseller.security_deposit || 0) > 0 && (
                            <DetailRow label="সিকিউরিটি ডিপোজিট">{money(reseller.security_deposit)}</DetailRow>
                        )}
                        {can.can_view_financials && Number(reseller.otc_charge || 0) > 0 && (
                            <DetailRow label="OTC Charge">{money(reseller.otc_charge)}</DetailRow>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default ProfileDetails;
