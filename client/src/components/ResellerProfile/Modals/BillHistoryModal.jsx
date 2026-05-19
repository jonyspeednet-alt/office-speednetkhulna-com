import React from 'react';
import { Link } from 'react-router-dom';
import ModalWrap from '../ModalWrap';

const BillHistoryModal = ({ billHistory, onClose }) => {
    return (
        <ModalWrap title="বিগত ৫ মাসের বিলিং ও বকেয়া হিসাব" onClose={onClose}>
            <div className="table-responsive">
                <table className="table table-bordered table-hover align-middle" style={{ fontSize: 13 }}>
                    <thead className="table-light">
                        <tr>
                            <th>মাস</th>
                            <th className="text-end">সাবেক বকেয়া</th>
                            <th className="text-end">বিল (+)</th>
                            <th className="text-end">জমা (-)</th>
                            <th className="text-end">মাস শেষে বকেয়া</th>
                            <th className="text-center">অ্যাকশন</th>
                        </tr>
                    </thead>
                    <tbody>
                        {billHistory.length === 0 ? (
                            <tr><td colSpan="6" className="text-center text-muted">কোনো বিল পাওয়া যায়নি।</td></tr>
                        ) : billHistory.map((b) => (
                            <tr key={b.id}>
                                <td>
                                    <div className="fw-bold">{new Date(b.bill_month).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}</div>
                                    <small className="text-muted">{new Date(b.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}</small>
                                </td>
                                <td className="text-end text-muted">{Number(b.previous_due || 0).toFixed(2)}</td>
                                <td className="text-end">
                                    <div className="fw-bold">{Number(b.final_amount || 0).toFixed(2)}</div>
                                    {Number(b.adjustment || 0) !== 0 ? (
                                        <small className={Number(b.adjustment) < 0 ? 'text-success' : 'text-danger'}>
                                            (Adj: {Number(b.adjustment)})
                                        </small>
                                    ) : ''}
                                </td>
                                <td className="text-end text-success">{Number(b.paid || 0).toFixed(2)}</td>
                                <td className="text-end fw-bold text-danger">{Number(b.closing_due || 0).toFixed(2)}</td>
                                <td className="text-center">
                                    <Link to={`/view-static-invoice?id=${b.id}`} target="_blank" className="btn btn-sm btn-outline-primary rounded-circle">
                                        <i className="fas fa-file-invoice" />
                                    </Link>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </ModalWrap>
    );
};

export default BillHistoryModal;
