import React, { useState } from 'react';
import { fmtDate, money, partnerTypeLabel } from '../../utils/formatters';

const DetailRow = ({ label, children }) => (
    <div className="rp-detail-row">
        <span className="text-muted">{label}</span>
        <span className="fw-semibold text-end text-break">{children}</span>
    </div>
);

/* Collapsible section wrapper */
const CollapsibleSection = ({ title, icon, defaultOpen = false, extraHeader, children }) => {
    const [open, setOpen] = useState(defaultOpen);
    return (
        <div className="card p-2 p-sm-3 mb-3 rp-collapsible">
            <div
                className="d-flex justify-content-between align-items-center rp-collapsible-header"
                onClick={() => setOpen(!open)}
                role="button"
                tabIndex={0}
                aria-expanded={open}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setOpen(!open); }}
            >
                <h6 className="fw-bold text-muted text-uppercase small m-0 d-flex align-items-center gap-2">
                    {icon && <i className={`${icon} text-primary`} />}
                    {title}
                    <i className={`fas fa-chevron-down rp-collapse-icon ${open ? 'rp-collapse-open' : ''}`} />
                </h6>
                {extraHeader}
            </div>
            <div className={`rp-collapsible-body ${open ? 'rp-collapse-show' : ''}`}>
                {children}
            </div>
        </div>
    );
};

const ProfileDetails = ({ reseller, can, onEditClick }) => {
    const realIpMonthly = Number(reseller.real_ip_count || 0) * Number(reseller.real_ip_price || 0);
    const isChannel = reseller.partner_type === 'channel_partner';

    return (
        <>
            <CollapsibleSection
                title="প্রোফাইল বিস্তারিত"
                icon="fas fa-id-card"
                defaultOpen={true}
                extraHeader={
                    can.can_edit_profile ? (
                        <button
                            type="button"
                            className="btn btn-sm btn-light text-primary rounded-circle"
                            onClick={(e) => { e.stopPropagation(); onEditClick(); }}
                            title="প্রোফাইল সম্পাদনা"
                            aria-label="প্রোফাইল সম্পাদনা"
                        >
                            <i className="fas fa-edit" />
                        </button>
                    ) : undefined
                }
            >
                <div className={`rp-details-grid ${isChannel ? '' : 'rp-details-2col'}`}>
                    <DetailRow label="কোম্পানি">{reseller.company_name || '-'}</DetailRow>
                    <DetailRow label="ফোন">{reseller.phone || '-'}</DetailRow>
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
                            {can.can_view_financials && (
                                <DetailRow label="Profit Share">
                                    <span className="badge bg-success bg-opacity-10 text-success border border-success border-opacity-25">
                                        {Number(reseller.profit_share_percentage || 0)}%
                                    </span>
                                </DetailRow>
                            )}
                        </>
                    )}
                    {!isChannel && (
                        <DetailRow label="NTTN Link">
                            {reseller.nttn_link ? (
                                <a href={reseller.nttn_link} target="_blank" rel="noreferrer" className="text-decoration-none small">
                                    লিংক
                                </a>
                            ) : (
                                '-'
                            )}
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
                    <DetailRow label="ইউজার আইডি">{reseller.reseller_code || '-'}</DetailRow>
                    <DetailRow label="Partner Type">{partnerTypeLabel(reseller.partner_type)}</DetailRow>
                    {Number(reseller.security_deposit || 0) > 0 && (
                        <DetailRow label="সিকিউরিটি ডিপোজিট">{money(reseller.security_deposit)}</DetailRow>
                    )}
                    {can.can_view_financials && Number(reseller.otc_charge || 0) > 0 && (
                        <DetailRow label="OTC Charge">{money(reseller.otc_charge)}</DetailRow>
                    )}
                    <DetailRow label="স্ট্যাটাস">
                        <span className={`badge rounded-pill ${reseller.status === 'active' ? 'bg-success-subtle text-success-emphasis border border-success-subtle' : 'bg-danger-subtle text-danger-emphasis border border-danger-subtle'}`}>
                            {reseller.status}
                        </span>
                    </DetailRow>
                </div>
            </CollapsibleSection>

            <CollapsibleSection
                title="Real IP প্রোফাইল বিস্তারিত"
                icon="fas fa-network-wired"
                defaultOpen={false}
            >
                <div className="rp-details-grid rp-details-2col">
                    <DetailRow label="Quantity">{Number(reseller.real_ip_count || 0).toLocaleString('bn-BD')}</DetailRow>
                    <DetailRow label="Unit Price">{can.can_view_financials ? money(reseller.real_ip_price) : '-'}</DetailRow>
                    <DetailRow label="Monthly Total">{can.can_view_financials ? money(realIpMonthly) : '-'}</DetailRow>
                </div>
            </CollapsibleSection>
        </>
    );
};

export default ProfileDetails;
