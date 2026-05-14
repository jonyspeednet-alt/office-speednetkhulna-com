import React from 'react';
import { money } from '../../../utils/formatters';

const CPStatementTab = ({ cpStatement }) => {
    return (
        <div className="p-3">
            <h6 className="fw-bold mb-3">স্টেটমেন্ট</h6>
            <div className="table-responsive" style={{ maxHeight: 420 }}>
                <table className="table table-hover align-middle mb-0 table-sm">
                    <thead className="table-light">
                        <tr>
                            <th>তারিখ</th>
                            <th>বিবরণ</th>
                            <th>টাইপ</th>
                            <th>পরিমাণ</th>
                        </tr>
                    </thead>
                    <tbody>
                        {cpStatement.length === 0 ? (
                            <tr><td colSpan="4" className="text-center text-muted py-4">কোনো স্টেটমেন্ট এন্ট্রি নেই</td></tr>
                        ) : cpStatement.map((s, i) => (
                            <tr key={`${s.type}-${s.id}-${i}`}>
                                <td>{s.date ? new Date(s.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' }) : '-'}</td>
                                <td>{s.description}</td>
                                <td>
                                    <span className={`badge ${s.type === 'commission' ? 'bg-success' : s.type === 'payment' ? 'bg-primary' : s.type === 'deduction' ? 'bg-danger' : 'bg-info'} bg-opacity-10 text-dark border`}>
                                        {s.type === 'commission' ? 'Credit' : s.type === 'payment' ? 'Payment' : s.type === 'deduction' ? 'কর্তন' : 'সমন্বয়'}
                                    </span>
                                </td>
                                <td className={`fw-bold ${s.type === 'commission' || s.type === 'adjustment' ? 'text-success' : 'text-danger'}`}>
                                    {s.type === 'payment' || s.type === 'deduction' ? '-' : '+'}{money(s.amount)}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default CPStatementTab;
