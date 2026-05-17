import React from 'react';
import { money } from '../../utils/formatters';

const formatMonthLabel = (ym) => {
    if (!ym || !/^\d{4}-\d{2}$/.test(String(ym))) return '';
    const [y, m] = String(ym).split('-');
    const d = new Date(Number(y), Number(m) - 1, 1);
    return d.toLocaleDateString('bn-BD', { month: 'long', year: 'numeric' });
};

const StatCard = ({ label, value, sub, valueClass = '' }) => (
    <div className="col-6 col-lg-3">
        <div className="card p-3 rp-stat-card">
            <small className="rp-stat-label d-block">{label}</small>
            <div className={`rp-stat-value ${valueClass}`}>{value}</div>
            {sub ? <small className="text-muted d-block mt-1">{sub}</small> : null}
        </div>
    </div>
);

const ProfileStats = ({ isChannel, can, stats, reseller, cpCommission, cpLoading, onBillHistoryClick }) => {
    if (isChannel && can.can_view_financials) {
        if (cpLoading && !cpCommission) {
            return (
                <div className="row g-2 g-md-3 mb-3">
                    {[1, 2, 3, 4].map((i) => (
                        <div key={i} className="col-6 col-lg-3">
                            <div className="card p-3 rp-stat-card placeholder-glow">
                                <span className="placeholder col-6 mb-2" />
                                <span className="placeholder col-8" />
                            </div>
                        </div>
                    ))}
                </div>
            );
        }

        const summary = cpCommission || {};
        const totalUsers = Number(summary.total_users ?? reseller.channel_user_count ?? 0);
        const activeUsers = Number(summary.active_users ?? reseller.channel_active_user_count ?? 0);
        const profitPct = Number(summary.profit_share_percentage ?? reseller.profit_share_percentage ?? 0);
        const monthLabel = formatMonthLabel(summary.month);

        return (
            <div className="mb-3">
                {monthLabel && (
                    <div className="mb-2 px-1">
                        <span className="badge bg-primary bg-opacity-10 text-primary border border-primary border-opacity-25 rounded-pill px-3 py-2">
                            <i className="far fa-calendar-alt me-1" />
                            হিসাব মাস: {monthLabel}
                        </span>
                    </div>
                )}
                <div className="row g-2 g-md-3">
                    <StatCard
                        label="মোট ইউজার"
                        value={totalUsers.toLocaleString('bn-BD')}
                        sub={`${activeUsers.toLocaleString('bn-BD')} সক্রিয়`}
                    />
                    <StatCard
                        label="এই মাসের কালেকশন"
                        value={money(summary.total_collected)}
                        sub={`${Number(summary.paying_users || 0).toLocaleString('bn-BD')} জন পেমেন্ট`}
                        valueClass="text-primary"
                    />
                    <StatCard
                        label={`কমিশন (${profitPct}%)`}
                        value={money(summary.gross_commission)}
                        sub={`প্রোডাক্ট: ${money(summary.product_deduction)} · Net: ${money(summary.net_commission)}`}
                        valueClass="text-success"
                    />
                    <StatCard
                        label="বকেয়া ব্যালেন্স"
                        value={money(summary.closing_balance)}
                        sub={`পরিশোধিত: ${money(summary.paid_to_partner)}`}
                        valueClass={Number(summary.closing_balance || 0) > 0 ? 'text-danger' : 'text-success'}
                    />
                </div>
            </div>
        );
    }

    if (can.can_view_financials && !isChannel) {
        return (
            <div className="row g-2 g-md-3 mb-3">
                <StatCard
                    label="বর্তমান মোট ডিউ"
                    value={money(stats.net_due)}
                    valueClass={Number(stats.net_due || 0) > 0 ? 'text-danger' : 'text-success'}
                />
                <div className="col-6 col-lg-3">
                    <div className="card p-3 rp-stat-card" style={{ cursor: 'pointer' }} onClick={onBillHistoryClick} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && onBillHistoryClick?.()}>
                        <small className="rp-stat-label d-block">Previous Due</small>
                        <div className="rp-stat-value">{money(reseller.previous_month_due)}</div>
                    </div>
                </div>
                <StatCard label="Projected Bill" value={money(reseller.current_projected_bill)} />
                <StatCard label="Paid This Month" value={money(stats.total_paid_current_month)} valueClass="text-success" />
                <StatCard label="সমন্বয় (এই মাস)" value={money(stats.total_discount_current_month)} valueClass="text-info" />
            </div>
        );
    }

    return null;
};

export default ProfileStats;
