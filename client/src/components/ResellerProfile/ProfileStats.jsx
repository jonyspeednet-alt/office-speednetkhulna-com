import React from 'react';
import { money } from '../../utils/formatters';

const ProfileStats = ({ isChannel, can, stats, reseller, cpCommission, onBillHistoryClick }) => {
    if (isChannel && can.can_view_financials && cpCommission) {
        return (
            <div className="row g-3 mb-3">
                <div className="col-md-3">
                    <div className="card p-3">
                        <small className="text-muted text-uppercase">মোট ইউজার</small>
                        <h4 className="fw-bold m-0">{Number(cpCommission.total_users || 0).toLocaleString('bn-BD')}</h4>
                        <small className="text-success">{Number(cpCommission.active_users || 0).toLocaleString('bn-BD')} সক্রিয়</small>
                    </div>
                </div>
                <div className="col-md-3">
                    <div className="card p-3">
                        <small className="text-muted text-uppercase">এই মাসের কালেকশন</small>
                        <h4 className="fw-bold m-0 text-primary">{money(cpCommission.total_collected)}</h4>
                        <small className="text-muted">{Number(cpCommission.paying_users || 0).toLocaleString('bn-BD')} ইউজার পেমেন্ট দিয়েছে</small>
                    </div>
                </div>
                <div className="col-md-3">
                    <div className="card p-3">
                        <small className="text-muted text-uppercase">কমিশন ({Number(cpCommission.profit_share_percentage || 0)}%)</small>
                        <h4 className="fw-bold m-0 text-success">{money(cpCommission.gross_commission)}</h4>
                        <small className="text-muted">Net: {money(cpCommission.net_commission)}</small>
                    </div>
                </div>
                <div className="col-md-3">
                    <div className="card p-3">
                        <small className="text-muted text-uppercase">বকেয়া ব্যালেন্স</small>
                        <h4 className={`fw-bold m-0 ${Number(cpCommission.closing_balance || 0) > 0 ? 'text-danger' : 'text-success'}`}>
                            {money(cpCommission.closing_balance)}
                        </h4>
                        <small className="text-muted">পরিশোধিত: {money(cpCommission.paid_to_partner)}</small>
                    </div>
                </div>
            </div>
        );
    }

    if (can.can_view_financials && !isChannel) {
        return (
            <div className="row g-3 mb-3">
                <div className="col-md-3">
                    <div className="card p-3">
                        <small className="text-muted text-uppercase">বর্তমান মোট ডিউ</small>
                        <h4 title={stats.calc_tooltip || ''} className={`fw-bold m-0 ${Number(stats.net_due || 0) > 0 ? 'text-danger' : 'text-success'}`}>
                            {money(stats.net_due)}
                        </h4>
                    </div>
                </div>
                <div className="col-md-3">
                    <div className="card p-3" style={{ cursor: 'pointer' }} onClick={onBillHistoryClick}>
                        <small className="text-muted text-uppercase">Previous Due</small>
                        <h5 className="fw-bold m-0">{money(reseller.previous_month_due)}</h5>
                    </div>
                </div>
                <div className="col-md-3">
                    <div className="card p-3">
                        <small className="text-muted text-uppercase">Projected Bill</small>
                        <h5 className="fw-bold m-0">{money(reseller.current_projected_bill)}</h5>
                    </div>
                </div>
                <div className="col-md-3">
                    <div className="card p-3">
                        <small className="text-muted text-uppercase">Paid This Month</small>
                        <h5 className="fw-bold m-0 text-success">{money(stats.total_paid_current_month)}</h5>
                    </div>
                </div>
                <div className="col-md-3">
                    <div className="card p-3">
                        <small className="text-muted text-uppercase">সমন্বয় (এই মাস)</small>
                        <h5 className="fw-bold m-0 text-info">{money(stats.total_discount_current_month)}</h5>
                    </div>
                </div>
            </div>
        );
    }

    return null;
};

export default ProfileStats;
