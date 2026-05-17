import React, { useState } from 'react';
import { money } from '../../utils/formatters';
import CPCommissionInvoiceModal from './Modals/CPCommissionInvoiceModal';

const formatMonthLabel = (ym) => {
    if (!ym || !/^\d{4}-\d{2}$/.test(String(ym))) return '';
    const [y, m] = String(ym).split('-');
    const d = new Date(Number(y), Number(m) - 1, 1);
    return d.toLocaleDateString('bn-BD', { month: 'long', year: 'numeric' });
};

const StatCard = ({ label, value, sub, valueClass = '', icon }) => (
    <div className="col-6 col-lg-3">
        <div className="card p-3 rp-stat-card h-100">
            {icon && <i className={`${icon} rp-stat-icon mb-1`} />}
            <small className="rp-stat-label d-block">{label}</small>
            <div className={`rp-stat-value ${valueClass}`}>{value}</div>
            {sub ? <small className="text-muted d-block mt-1">{sub}</small> : null}
        </div>
    </div>
);

/** A single row in the ledger breakdown */
const LedgerRow = ({ label, amount, isTotal, isResult, positive, negative, dimmed, indent }) => {
    const amtNum = Number(amount || 0);
    let amtClass = 'text-body';
    if (isResult) amtClass = amtNum > 0 ? 'text-danger fw-bold' : 'text-success fw-bold';
    else if (positive) amtClass = 'text-success';
    else if (negative) amtClass = 'text-danger';
    else if (dimmed) amtClass = 'text-muted';

    return (
        <tr className={isTotal || isResult ? 'table-active' : ''}>
            <td className={`ps-3 py-1 ${indent ? 'ps-4 text-muted' : ''} ${isResult ? 'fw-semibold' : ''}`}
                style={{ fontSize: indent ? '0.82rem' : '0.88rem' }}>
                {label}
            </td>
            <td className={`text-end pe-3 py-1 ${amtClass}`}
                style={{ fontSize: isResult ? '0.95rem' : '0.88rem', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                {money(amtNum)}
            </td>
        </tr>
    );
};

/** Divider row */
const LedgerDivider = ({ label }) => (
    <tr>
        <td colSpan={2} className="pt-2 pb-0 px-3">
            <div className="d-flex align-items-center gap-2">
                <hr className="flex-grow-1 my-0 opacity-25" />
                {label && <small className="text-muted" style={{ fontSize: '0.75rem', whiteSpace: 'nowrap' }}>{label}</small>}
                <hr className="flex-grow-1 my-0 opacity-25" />
            </div>
        </td>
    </tr>
);

const CommissionLedger = ({ summary, profitPct, reseller }) => {
    const [open, setOpen] = useState(true);
    const [showInvoice, setShowInvoice] = useState(false);

    const gross        = Number(summary.gross_commission   || 0);
    const advances     = Number(summary.partner_advances   || 0);
    const prodDed      = Number(summary.product_deduction  || 0);
    const adj          = Number(summary.adjustments        || 0);
    const ded          = Number(summary.deductions         || 0);
    const net          = Number(summary.net_commission     || 0);
    const prevBal      = Number(summary.previous_balance   || 0);
    const totalPayable = Number(summary.total_payable      || 0);
    const paid         = Number(summary.paid_to_partner    || 0);
    const closing      = Number(summary.closing_balance    || 0);
    const status       = summary.commission_status || 'not_generated';

    const statusBadge = {
        not_generated: { cls: 'bg-secondary',  label: 'হিসাব হয়নি' },
        draft:         { cls: 'bg-warning text-dark', label: 'Draft' },
        finalized:     { cls: 'bg-success',    label: 'Finalized' },
    }[status] || { cls: 'bg-secondary', label: status };

    return (
        <div className="card mt-3 border-0 shadow-sm overflow-hidden">
            {/* Header */}
            <div
                className="card-header d-flex align-items-center justify-content-between py-2 px-3"
                style={{ cursor: 'pointer', background: 'var(--bs-tertiary-bg, #f8f9fa)' }}
                onClick={() => setOpen(o => !o)}
                role="button"
                aria-expanded={open}
            >
                <span className="fw-semibold" style={{ fontSize: '0.9rem' }}>
                    <i className="fas fa-calculator me-2 text-primary opacity-75" />
                    হিসাব বিবরণ
                </span>
                <div className="d-flex align-items-center gap-2" onClick={e => e.stopPropagation()}>
                    <button
                        type="button"
                        className="btn btn-sm btn-outline-primary rounded-pill px-2.5 py-0.5 fw-semibold d-flex align-items-center gap-1 shadow-none border border-primary border-opacity-25 bg-primary bg-opacity-10 text-primary"
                        style={{ fontSize: '0.75rem' }}
                        onClick={() => setShowInvoice(true)}
                    >
                        <i className="fas fa-file-invoice" />
                        ইনভয়েস ভিউ
                    </button>
                    <span className={`badge ${statusBadge.cls}`} style={{ fontSize: '0.72rem' }}>
                        {statusBadge.label}
                    </span>
                    <i className={`fas fa-chevron-${open ? 'up' : 'down'} text-muted`} style={{ fontSize: '0.75rem', cursor: 'pointer' }} onClick={() => setOpen(o => !o)} />
                </div>
            </div>

            {open && (
                <div className="card-body p-0">
                    <table className="table table-borderless mb-0 align-middle">
                        <tbody>
                            {/* Collection → Commission */}
                            <LedgerRow
                                label={`কমিশন (কালেকশন × ${profitPct}%)`}
                                amount={gross}
                                positive
                            />

                            {/* Deductions group */}
                            {(advances > 0 || prodDed > 0 || ded > 0) && (
                                <>
                                    <LedgerDivider label="কর্তন" />
                                    {advances > 0 && (
                                        <LedgerRow label="(−) অগ্রিম সমন্বয়" amount={advances} negative indent />
                                    )}
                                    {prodDed > 0 && (
                                        <LedgerRow label="(−) প্রোডাক্ট চার্জ" amount={prodDed} negative indent />
                                    )}
                                    {ded > 0 && (
                                        <LedgerRow
                                            label={summary.deduction_note?.startsWith('[পার্টনার বিল কালেকশন]') ? '(−) পার্টনার সরাসরি কালেকশন' : '(−) ম্যানুয়াল কর্তন'}
                                            amount={ded}
                                            negative
                                            indent
                                        />
                                    )}
                                </>
                            )}

                            {/* Additions group */}
                            {adj > 0 && (
                                <>
                                    <LedgerDivider label="সংযোজন" />
                                    <LedgerRow label="(+) সমন্বয় বোনাস" amount={adj} positive indent />
                                </>
                            )}

                            {/* Net commission subtotal */}
                            <LedgerDivider />
                            <LedgerRow label="নেট কমিশন" amount={net} isTotal />

                            {/* Previous balance carry-forward */}
                            {prevBal !== 0 && (
                                <>
                                    <LedgerRow
                                        label={prevBal > 0 ? '(+) আগের বকেয়া' : '(−) আগের ক্রেডিট'}
                                        amount={Math.abs(prevBal)}
                                        positive={prevBal > 0}
                                        negative={prevBal < 0}
                                        indent
                                    />
                                </>
                            )}

                            {/* Total payable */}
                            <LedgerDivider />
                            <LedgerRow label="মোট প্রদেয়" amount={totalPayable} isTotal />

                            {/* Paid */}
                            {paid > 0 && (
                                <LedgerRow label="(−) পরিশোধিত" amount={paid} dimmed indent />
                            )}

                            {/* Closing balance — the big result */}
                            <LedgerDivider />
                            <tr style={{ background: closing > 0 ? 'rgba(220,53,69,0.06)' : 'rgba(25,135,84,0.06)' }}>
                                <td className="ps-3 py-2 fw-bold" style={{ fontSize: '0.95rem' }}>
                                    <i className={`fas fa-${closing > 0 ? 'exclamation-circle text-danger' : 'check-circle text-success'} me-1`} />
                                    বকেয়া ব্যালেন্স
                                </td>
                                <td className={`text-end pe-3 py-2 fw-bold fs-6 ${closing > 0 ? 'text-danger' : 'text-success'}`}
                                    style={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                                    {money(closing)}
                                </td>
                            </tr>
                        </tbody>
                    </table>

                    {/* Status chips */}
                    {paid === 0 && closing > 0 && (
                        <div className="px-3 pb-2">
                            <small className="text-danger">
                                <i className="fas fa-info-circle me-1" />
                                এখনও কোনো কমিশন পরিশোধ হয়নি।
                            </small>
                        </div>
                    )}
                    {paid > 0 && closing > 0 && (
                        <div className="px-3 pb-2">
                            <small className="text-warning">
                                <i className="fas fa-info-circle me-1" />
                                আংশিক পরিশোধিত — বাকি {money(closing)} এখনও বকেয়া।
                            </small>
                        </div>
                    )}
                    {closing <= 0 && paid > 0 && (
                        <div className="px-3 pb-2">
                            <small className="text-success">
                                <i className="fas fa-check me-1" />
                                সম্পূর্ণ পরিশোধিত।
                            </small>
                        </div>
                    )}
                </div>
            )}
            
            {showInvoice && (
                <CPCommissionInvoiceModal
                    reseller={reseller}
                    summary={summary}
                    onClose={() => setShowInvoice(false)}
                />
            )}
        </div>
    );
};

const ProfileStats = ({ isChannel, can, stats, reseller, cpCommission, cpLoading, onBillHistoryClick }) => {
    if (isChannel && can.can_view_financials) {
        if (cpLoading && !cpCommission) {
            return (
                <div className="mb-3">
                    <div className="row g-2 g-md-3">
                        {[1, 2, 3, 4].map((i) => (
                            <div key={i} className="col-6 col-lg-3">
                                <div className="card p-3 rp-stat-card placeholder-glow">
                                    <span className="placeholder col-6 mb-2" />
                                    <span className="placeholder col-8" />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            );
        }

        const summary     = cpCommission || {};
        const totalUsers  = Number(summary.total_users  ?? reseller.channel_user_count          ?? 0);
        const activeUsers = Number(summary.active_users ?? reseller.channel_active_user_count   ?? 0);
        const profitPct   = Number(summary.profit_share_percentage ?? reseller.profit_share_percentage ?? 0);
        const monthLabel  = formatMonthLabel(summary.month);
        const closing     = Number(summary.closing_balance || 0);

        return (
            <div className="mb-3">
                {/* Month badge */}
                {monthLabel && (
                    <div className="mb-2 px-1">
                        <span className="badge bg-primary bg-opacity-10 text-primary border border-primary border-opacity-25 rounded-pill px-3 py-2">
                            <i className="far fa-calendar-alt me-1" />
                            হিসাব মাস: {monthLabel}
                        </span>
                    </div>
                )}

                {/* Top stat cards */}
                <div className="row g-2 g-md-3">
                    <StatCard
                        label="মোট ইউজার"
                        value={totalUsers.toLocaleString('bn-BD')}
                        sub={`${activeUsers.toLocaleString('bn-BD')} সক্রিয়`}
                        icon="fas fa-users"
                    />
                    <StatCard
                        label="কালেকশন"
                        value={money(summary.total_collected)}
                        sub={`${Number(summary.paying_users || 0).toLocaleString('bn-BD')} জন পেমেন্ট`}
                        valueClass="text-primary"
                        icon="fas fa-money-bill-wave"
                    />
                    <StatCard
                        label={`কমিশন (${profitPct}%)`}
                        value={money(summary.gross_commission)}
                        sub={`নেট: ${money(summary.net_commission)}`}
                        valueClass="text-success"
                        icon="fas fa-percentage"
                    />
                    <StatCard
                        label="বকেয়া ব্যালেন্স"
                        value={money(closing)}
                        sub={`পরিশোধিত: ${money(summary.paid_to_partner)}`}
                        valueClass={closing > 0 ? 'text-danger' : 'text-success'}
                        icon={closing > 0 ? 'fas fa-exclamation-triangle' : 'fas fa-check-circle'}
                    />
                </div>

                {/* Ledger breakdown */}
                <CommissionLedger summary={summary} profitPct={profitPct} reseller={reseller} />
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
                    <div
                        className="card p-3 rp-stat-card h-100"
                        style={{ cursor: 'pointer' }}
                        onClick={onBillHistoryClick}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => e.key === 'Enter' && onBillHistoryClick?.()}
                    >
                        <small className="rp-stat-label d-block">Previous Due</small>
                        <div className="rp-stat-value">{money(reseller.previous_month_due)}</div>
                    </div>
                </div>
                <StatCard label="Projected Bill"   value={money(reseller.current_projected_bill)} />
                <StatCard label="Paid This Month"  value={money(stats.total_paid_current_month)} valueClass="text-success" />
                <StatCard label="সমন্বয় (এই মাস)" value={money(stats.total_discount_current_month)} valueClass="text-info" />
            </div>
        );
    }

    return null;
};

export default ProfileStats;
