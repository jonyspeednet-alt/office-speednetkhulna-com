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
        <div className="p-2 p-sm-3">
            <div className="rp-toolbar mb-3">
                <div className="d-flex gap-2 align-items-center flex-grow-1">
                    <input
                        type="search"
                        className="form-control form-control-sm"
                        placeholder="ইউজার খুঁজুন..."
                        value={cpUserSearch}
                        onChange={(e) => setCpUserSearch(e.target.value)}
                        aria-label="ইউজার খুঁজুন"
                    />
                    <span className="badge bg-primary text-nowrap">{cpUsers.length} জন</span>
                </div>
                <button type="button" className="btn btn-sm btn-primary rounded-pill px-3" onClick={onAddUser}>
                    <i className="fas fa-plus me-1" />ইউজার যোগ
                </button>
            </div>

            {filteredUsers.length === 0 ? (
                <div className="text-center text-muted py-5">কোনো ইউজার নেই</div>
            ) : (
                <>
                    <div className="rp-mobile-list d-md-none">
                        {filteredUsers.map((u) => (
                            <article key={u.id} className="rp-mobile-card">
                                <div className="rp-mobile-card-head">
                                    <div>
                                        <div className="fw-bold">{u.user_name}</div>
                                        <span className="badge bg-light text-dark border mt-1">{u.user_id_code || '-'}</span>
                                    </div>
                                    <span className={`badge ${u.status === 'active' ? 'bg-success' : 'bg-danger'} bg-opacity-10 text-dark border`}>
                                        {u.status}
                                    </span>
                                </div>
                                <div className="rp-kv mt-2">
                                    <div><span className="label">ফোন</span><br />{u.phone || '-'}</div>
                                    <div><span className="label">প্যাকেজ</span><br />{u.package_name || '-'}</div>
                                    <div><span className="label">রেট</span><br />{money(u.monthly_rate)}</div>
                                </div>
                                <div className="d-flex gap-2 mt-2">
                                    <button type="button" className="btn btn-outline-primary btn-sm flex-fill" onClick={() => onEditUser(u)}>
                                        <i className="fas fa-edit me-1" />সম্পাদনা
                                    </button>
                                    <button type="button" className="btn btn-outline-danger btn-sm" onClick={() => onDeleteUser(u.id)} aria-label="মুছুন">
                                        <i className="fas fa-trash" />
                                    </button>
                                </div>
                            </article>
                        ))}
                    </div>

                    <div className="rp-table-wrap d-none d-md-block">
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
                                {filteredUsers.map((u) => (
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
                                                <button type="button" className="btn btn-outline-primary btn-sm" onClick={() => onEditUser(u)} title="সম্পাদনা">
                                                    <i className="fas fa-edit" />
                                                </button>
                                                <button type="button" className="btn btn-outline-danger btn-sm" onClick={() => onDeleteUser(u.id)} title="মুছুন">
                                                    <i className="fas fa-trash" />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </>
            )}
        </div>
    );
};

export default UsersTab;
