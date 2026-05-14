import React from 'react';
import { money } from '../../../utils/formatters';

const UsersTab = ({ cpUsers, cpUserSearch, setCpUserSearch, onAddUser, onEditUser, onDeleteUser }) => {
    const filteredUsers = cpUsers.filter(u =>
        !cpUserSearch ||
        u.user_name?.toLowerCase().includes(cpUserSearch.toLowerCase()) ||
        u.user_id_code?.toLowerCase().includes(cpUserSearch.toLowerCase()) ||
        u.phone?.includes(cpUserSearch)
    );

    return (
        <div className="p-3">
            <div className="d-flex justify-content-between align-items-center mb-3">
                <div className="d-flex gap-2 align-items-center">
                    <input
                        type="text"
                        className="form-control form-control-sm"
                        placeholder="ইউজার খুঁজুন..."
                        value={cpUserSearch}
                        onChange={(e) => setCpUserSearch(e.target.value)}
                        style={{ width: 200 }}
                    />
                    <span className="badge bg-primary">{cpUsers.length} জন</span>
                </div>
                <button className="btn btn-sm btn-primary" onClick={onAddUser}>
                    <i className="fas fa-plus me-1" />ইউজার যোগ
                </button>
            </div>
            <div className="table-responsive" style={{ maxHeight: 400 }}>
                <table className="table table-hover align-middle mb-0 table-sm">
                    <thead className="table-light">
                        <tr>
                            <th>নাম</th>
                            <th>আইডি</th>
                            <th>ফোন</th>
                            <th>প্যাকেজ</th>
                            <th>রেট</th>
                            <th>স্ট্যাটাস</th>
                            <th></th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredUsers.length === 0 ? (
                            <tr><td colSpan="7" className="text-center text-muted py-4">কোনো ইউজার নেই</td></tr>
                        ) : filteredUsers.map((u) => (
                            <tr key={u.id}>
                                <td className="fw-bold">{u.user_name}</td>
                                <td><span className="badge bg-light text-dark border">{u.user_id_code || '-'}</span></td>
                                <td>{u.phone || '-'}</td>
                                <td>{u.package_name || '-'}</td>
                                <td>{money(u.monthly_rate)}</td>
                                <td>
                                    <span className={`badge ${u.status === 'active' ? 'bg-success' : 'bg-danger'} bg-opacity-10 text-dark border`}>
                                        {u.status}
                                    </span>
                                </td>
                                <td>
                                    <div className="btn-group btn-group-sm">
                                        <button className="btn btn-outline-primary btn-sm" onClick={() => onEditUser(u)} title="সম্পাদনা">
                                            <i className="fas fa-edit" />
                                        </button>
                                        <button className="btn btn-outline-danger btn-sm" onClick={() => onDeleteUser(u.id)} title="মুছুন">
                                            <i className="fas fa-trash" />
                                        </button>
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

export default UsersTab;
