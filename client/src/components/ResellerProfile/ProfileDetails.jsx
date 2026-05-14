import React from 'react';
import { fmtDate, money, partnerTypeLabel } from '../../utils/formatters';

const ProfileDetails = ({ reseller, can, onEditClick }) => {
    const realIpMonthly = Number(reseller.real_ip_count || 0) * Number(reseller.real_ip_price || 0);

    return (
        <>
            <div className="card p-3 mb-3">
                <div className="d-flex justify-content-between align-items-center mb-2">
                    <h6 className="fw-bold text-muted text-uppercase small m-0">প্রোফাইল বিস্তারিত</h6>
                    {can.can_edit_profile && (
                        <button className="btn btn-sm btn-light text-primary rounded-circle" onClick={onEditClick} title="প্রোফাইল সম্পাদনা">
                            <i className="fas fa-edit" />
                        </button>
                    )}
                </div>
                <ul className="list-group list-group-flush small">
                    <li className="list-group-item px-0"><strong>কোম্পানি:</strong> {reseller.company_name || '-'}</li>
                    <li className="list-group-item px-0"><strong>সংযোগ:</strong> {reseller.nttn_type || '-'} {reseller.connection_type ? `, ${reseller.connection_type}` : ''}</li>
                    {reseller.partner_type === 'channel_partner' ? (
                        <>
                            <li className="list-group-item px-0"><strong>Total Users:</strong> {Number(reseller.channel_user_count || 0).toLocaleString('bn-BD')}</li>
                            {can.can_view_financials && <li className="list-group-item px-0"><strong>Profit Share:</strong> <span className="badge bg-success bg-opacity-10 text-success border border-success border-opacity-25">{Number(reseller.profit_share_percentage || 0)}%</span></li>}
                        </>
                    ) : (
                        <li className="list-group-item px-0">
                            <strong>NTTN Link:</strong>{' '}
                            {reseller.nttn_link ? (
                                <a href={reseller.nttn_link} target="_blank" rel="noreferrer" className="text-decoration-none">
                                    {reseller.nttn_link}
                                </a>
                            ) : (
                                '-'
                            )}
                        </li>
                    )}
                    <li className="list-group-item px-0"><strong>ফোন:</strong> {reseller.phone || '-'}</li>
                    <li className="list-group-item px-0"><strong>Joining Date:</strong> {fmtDate(reseller.joining_date)}</li>
                    <li className="list-group-item px-0"><strong>লোকেশন:</strong> {reseller.pop_location || '-'}</li>
                    {(reseller.latitude && reseller.longitude) ? (
                        <li className="list-group-item px-0">
                            <strong>কো-অর্ডিনেট:</strong>{' '}
                            <a href={`https://www.google.com/maps?q=${reseller.latitude},${reseller.longitude}`} target="_blank" rel="noreferrer" className="btn btn-xs btn-outline-primary py-0 px-2 rounded-pill ms-2">
                                ম্যাপে দেখুন
                            </a>
                        </li>
                    ) : null}
                    <li className="list-group-item px-0"><strong>ইউজার আইডি:</strong> {reseller.reseller_code || '-'}</li>
                    <li className="list-group-item px-0"><strong>Partner Type:</strong> {partnerTypeLabel(reseller.partner_type)}</li>
                    {Number(reseller.security_deposit || 0) > 0 && <li className="list-group-item px-0"><strong>সিকিউরিটি ডিপোজিট:</strong> {money(reseller.security_deposit)}</li>}
                    {can.can_view_financials && Number(reseller.otc_charge || 0) > 0 && <li className="list-group-item px-0"><strong>OTC Charge:</strong> {money(reseller.otc_charge)}</li>}
                    <li className="list-group-item px-0">
                        <strong>স্ট্যাটাস:</strong>{' '}
                        <span className={`badge rounded-pill ${reseller.status === 'active' ? 'bg-success-subtle text-success-emphasis border border-success-subtle' : 'bg-danger-subtle text-danger-emphasis border border-danger-subtle'}`}>
                            {reseller.status}
                        </span>
                    </li>
                </ul>
            </div>
            <div className="card p-3 mb-3">
                <h6 className="fw-bold text-muted text-uppercase small m-0 mb-2">Real IP</h6>
                <ul className="list-group list-group-flush small">
                    <li className="list-group-item px-0"><strong>Quantity:</strong> {Number(reseller.real_ip_count || 0).toLocaleString('bn-BD')}</li>
                    <li className="list-group-item px-0"><strong>Unit Price:</strong> {can.can_view_financials ? money(reseller.real_ip_price) : '-'}</li>
                    <li className="list-group-item px-0"><strong>Monthly Total:</strong> {can.can_view_financials ? money(realIpMonthly) : '-'}</li>
                </ul>
            </div>
        </>
    );
};

export default ProfileDetails;
