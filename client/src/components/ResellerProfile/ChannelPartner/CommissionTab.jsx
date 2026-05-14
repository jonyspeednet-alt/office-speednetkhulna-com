import React from 'react';
import { money } from '../../../utils/formatters';

const CommissionTab = ({
    cpHistory,
    onGenerateCommission,
    onCommissionPayment,
    onAdjustment,
    onFinalize
}) => {
    return (
        <div className="p-3">
            <div className="d-flex justify-content-between align-items-center mb-3">
                <h6 className="fw-bold m-0">কমিশন ইতিহাস</h6>
                <div className="d-flex gap-2">
                    <button className="btn btn-sm btn-primary" onClick={onGenerateCommission}>
                        <i className="fas fa-calculator me-1" />কমিশন Generate
                    </button>
                    <button className="btn btn-sm btn-success" onClick={onCommissionPayment}>
                        <i className="fas fa-money-bill me-1" />কমিশন দিন
                    </button>
                </div>
            </div>
            <div className="table-responsive">
                <table className="table table-hover align-middle mb-0 table-sm">
                    <thead className="table-light">
                        <tr>
                            <th>মাস</th>
                            <th>ইউজার</th>
                            <th>কালেকশন</th>
                            <th>%</th>
                            <th>Gross</th>
                            <th>Adj</th>
                            <th>Ded</th>
                            <th>Net</th>
                            <th>Paid</th>
                            <th>Balance</th>
                            <th>Status</th>
                            <th></th>
                        </tr>
                    </thead>
                    <tbody>
                        {cpHistory.length === 0 ? (
                            <tr><td colSpan="12" className="text-center text-muted py-4">কোনো কমিশন ইতিহাস নেই</td></tr>
                        ) : cpHistory.map((h) => (
                            <tr key={h.id}>
                                <td className="fw-bold text-primary">{h.month}</td>
                                <td>
                                    <div className="fw-bold">{h.paying_users}/{h.total_users}</div>
                                    <div className="text-muted" style={{ fontSize: 10 }}>Paid Users</div>
                                </td>
                                <td><div className="fw-bold">{money(h.total_collection)}</div></td>
                                <td><span className="badge bg-light text-dark border">{Number(h.profit_share_pct)}%</span></td>
                                <td>{money(h.gross_commission)}</td>
                                <td className={Number(h.adjustments) !== 0 ? 'text-info' : ''}>
                                    {Number(h.adjustments) !== 0 ? (
                                        <div className="d-flex align-items-center">
                                            <span className="me-1 text-success">+</span>{money(h.adjustments)}
                                        </div>
                                    ) : '-'}
                                </td>
                                <td className={Number(h.deductions) !== 0 ? 'text-danger' : ''}>
                                    {Number(h.deductions) !== 0 ? (
                                        <div className="d-flex align-items-center">
                                            <span className="me-1">-</span>{money(h.deductions)}
                                        </div>
                                    ) : '-'}
                                </td>
                                <td className="fw-bold text-dark">{money(h.net_commission)}</td>
                                <td className="text-success fw-bold">{money(h.paid_amount)}</td>
                                <td className={Number(h.closing_balance) > 0 ? 'text-danger fw-bold' : 'text-success'}>
                                    {money(h.closing_balance)}
                                    {Number(h.closing_balance) > 0 && <i className="fas fa-exclamation-circle ms-1 small" />}
                                </td>
                                <td>
                                    <span className={`badge rounded-pill ${h.status === 'finalized' ? 'bg-success' : 'bg-warning'} bg-opacity-10 text-dark border px-2`}>
                                        {h.status === 'finalized' ? 'Finalized' : 'Draft'}
                                    </span>
                                </td>
                                <td>
                                    <div className="btn-group shadow-sm rounded-pill overflow-hidden">
                                        {h.status === 'draft' && (
                                            <>
                                                <button className="btn btn-white btn-sm border" onClick={() => onAdjustment(h)} title="সমন্বয়">
                                                    <i className="fas fa-sliders-h text-info" />
                                                </button>
                                                <button className="btn btn-white btn-sm border" onClick={() => onFinalize(h.id)} title="Finalize">
                                                    <i className="fas fa-check text-success" />
                                                </button>
                                            </>
                                        )}
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default CommissionTab;
