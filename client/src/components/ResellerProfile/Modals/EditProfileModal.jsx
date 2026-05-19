import React from 'react';
import ModalWrap from '../ModalWrap';
import { splitCsv } from '../../../utils/formatters';

const EditProfileModal = ({ editForm, setEditForm, saving, onSubmit, onClose }) => {
    if (!editForm) return null;

    const toggleCsvValue = (key, value) => {
        const current = new Set(splitCsv(editForm?.[key]));
        if (current.has(value)) current.delete(value);
        else current.add(value);
        setEditForm({ ...editForm, [key]: Array.from(current).join(', ') });
    };

    return (
        <ModalWrap title="প্রোফাইল এডিট করুন" onClose={onClose}>
            <form className="row g-3" onSubmit={onSubmit}>
                <h6 className="text-primary fw-bold mb-1 border-bottom pb-2">সাধারণ তথ্য</h6>
                <div className="col-md-4">
                    <label className="form-label fw-semibold">পার্টনার নাম</label>
                    <input
                        className="form-control"
                        value={editForm.name}
                        onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                        required
                    />
                </div>
                <div className="col-md-4">
                    <label className="form-label fw-semibold">কোম্পানির নাম</label>
                    <input
                        className="form-control"
                        value={editForm.company_name}
                        onChange={(e) => setEditForm({ ...editForm, company_name: e.target.value })}
                    />
                </div>
                <div className="col-md-4">
                    <label className="form-label fw-semibold">User ID</label>
                    <input
                        className="form-control"
                        value={editForm.reseller_code}
                        onChange={(e) => setEditForm({ ...editForm, reseller_code: e.target.value })}
                    />
                </div>
                <div className="col-md-4">
                    <label className="form-label fw-semibold">Partner Type</label>
                    <select
                        className="form-select"
                        value={editForm.partner_type}
                        onChange={(e) => setEditForm({ ...editForm, partner_type: e.target.value })}
                    >
                        <option value="mac_partner">Mac Partner</option>
                        <option value="distribution_partner">Distribution Partner</option>
                        <option value="channel_partner">Channel Partner</option>
                    </select>
                </div>
                <div className="col-md-4">
                    <label className="form-label fw-semibold">কন্টাক্ট নাম্বার</label>
                    <input
                        className="form-control"
                        value={editForm.phone}
                        onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                    />
                </div>
                <div className="col-md-4">
                    <label className="form-label fw-semibold">POP লোকেশন</label>
                    <input
                        className="form-control"
                        value={editForm.pop_location}
                        onChange={(e) => setEditForm({ ...editForm, pop_location: e.target.value })}
                    />
                </div>
                <div className="col-md-4">
                    <label className="form-label fw-semibold">সিকিউরিটি ডিপোজিট</label>
                    <input
                        type="number"
                        className="form-control"
                        value={editForm.security_deposit}
                        onChange={(e) => setEditForm({ ...editForm, security_deposit: e.target.value })}
                    />
                </div>
                <div className="col-md-4">
                    <label className="form-label fw-semibold">OTC Charge</label>
                    <input
                        type="number"
                        step="0.01"
                        className="form-control"
                        value={editForm.otc_charge}
                        onChange={(e) => setEditForm({ ...editForm, otc_charge: e.target.value })}
                    />
                </div>
                <div className="col-md-4">
                    <label className="form-label fw-semibold">Latitude</label>
                    <input
                        className="form-control"
                        value={editForm.latitude}
                        onChange={(e) => setEditForm({ ...editForm, latitude: e.target.value })}
                    />
                </div>
                <div className="col-md-4">
                    <label className="form-label fw-semibold">Longitude</label>
                    <input
                        className="form-control"
                        value={editForm.longitude}
                        onChange={(e) => setEditForm({ ...editForm, longitude: e.target.value })}
                    />
                </div>
                <div className="col-md-4">
                    <label className="form-label fw-semibold">Joining Date</label>
                    <input
                        type="date"
                        className="form-control"
                        value={editForm.joining_date || ''}
                        onChange={(e) => setEditForm({ ...editForm, joining_date: e.target.value })}
                    />
                </div>
                <div className="col-md-6">
                    <label className="form-label fw-semibold">রিসেলার স্ট্যাটাস</label>
                    <select
                        className="form-select"
                        value={editForm.status}
                        onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
                    >
                        <option value="active">Active</option>
                        <option value="suspended">Suspended</option>
                        <option value="inactive">Inactive</option>
                    </select>
                </div>
                <div className="col-md-6">
                    <label className="form-label fw-semibold text-danger">নতুন পাসওয়ার্ড (ঐচ্ছিক)</label>
                    <input
                        type="password"
                        className="form-control"
                        value={editForm.password || ''}
                        onChange={(e) => setEditForm({ ...editForm, password: e.target.value })}
                        placeholder="ফাঁকা রাখলে অপরিবর্তিত থাকবে"
                    />
                </div>

                {editForm.partner_type === 'channel_partner' ? (
                    <>
                        <h6 className="text-primary fw-bold mt-2 mb-1 border-bottom pb-2">ইউজার ও কমিশন তথ্য</h6>
                        <div className="col-md-4">
                            <label className="form-label fw-semibold">Total Users</label>
                            <input
                                type="number"
                                min="0"
                                className="form-control"
                                value={editForm.channel_user_count}
                                onChange={(e) => setEditForm({ ...editForm, channel_user_count: e.target.value })}
                            />
                        </div>
                        <div className="col-md-4">
                            <label className="form-label fw-semibold">Profit Share (%)</label>
                            <input
                                type="number"
                                step="0.01"
                                min="0"
                                max="100"
                                className="form-control"
                                value={editForm.profit_share_percentage}
                                onChange={(e) => setEditForm({ ...editForm, profit_share_percentage: e.target.value })}
                            />
                        </div>
                    </>
                ) : (
                    <>
                        <h6 className="text-primary fw-bold mt-2 mb-1 border-bottom pb-2">ব্যান্ডউইথ বরাদ্দ (Mbps)</h6>
                        <div className="col-12">
                            <div className="alert alert-info border-0 py-2 small mb-2">
                                <i className="fas fa-info-circle me-1" />
                                <strong>রেট পরিবর্তন করতে</strong> এই ফর্ম বন্ধ করে Bandwidth ট্যাবে <strong>"ব্যান্ডউইথ রেট পরিবর্তন"</strong> বাটন ব্যবহার করুন — সেখানে কার্যকর তারিখ ও log সহ পরিবর্তন করা যাবে।
                            </div>
                        </div>

                        {['iig', 'bdix', 'ggc', 'fna', 'cdn', 'bcdn', 'nttn'].map((k) => (
                            <React.Fragment key={k}>
                                <div className="col-md-3">
                                    <label className="form-label text-uppercase">{k === 'bcdn' ? 'Other' : k} BW (Mbps)</label>
                                    <input
                                        type="number"
                                        className="form-control"
                                        value={editForm[`${k === 'nttn' ? 'nttn_capacity' : `${k}_bw`}`]}
                                        onChange={(e) => setEditForm({ ...editForm, [`${k === 'nttn' ? 'nttn_capacity' : `${k}_bw`}`]: e.target.value })}
                                    />
                                </div>
                                <div className="col-md-3">
                                    <label className="form-label text-uppercase text-muted">{k === 'bcdn' ? 'Other' : k} Rate (Tk) <small className="text-warning">→ আলাদা বাটন</small></label>
                                    <input
                                        type="number"
                                        className="form-control form-control-sm bg-light text-muted"
                                        value={editForm[`rate_${k}`]}
                                        onChange={(e) => setEditForm({ ...editForm, [`rate_${k}`]: e.target.value })}
                                    />
                                </div>
                            </React.Fragment>
                        ))}
                    </>
                )}

                <div className="col-md-4">
                    <label className="form-label fw-semibold">Projected Bill</label>
                    <input
                        type="number"
                        className="form-control"
                        value={editForm.monthly_rate}
                        onChange={(e) => setEditForm({ ...editForm, monthly_rate: e.target.value })}
                    />
                </div>
                <div className="col-md-4">
                    <label className="form-label fw-semibold">Previous Due</label>
                    <input
                        type="number"
                        className="form-control"
                        value={editForm.due_amount}
                        onChange={(e) => setEditForm({ ...editForm, due_amount: e.target.value })}
                    />
                </div>
                {editForm.partner_type !== 'channel_partner' && (
                    <div className="col-md-4">
                        <label className="form-label fw-semibold">NTTN Link</label>
                        <input
                            className="form-control"
                            value={editForm.nttn_link}
                            onChange={(e) => setEditForm({ ...editForm, nttn_link: e.target.value })}
                        />
                    </div>
                )}
                <div className="col-md-6">
                    <label className="form-label fw-semibold">Real IP Quantity</label>
                    <input
                        type="number"
                        min="0"
                        className="form-control"
                        value={editForm.real_ip_count}
                        onChange={(e) => setEditForm({ ...editForm, real_ip_count: e.target.value })}
                    />
                </div>
                <div className="col-md-6">
                    <label className="form-label fw-semibold">Real IP Unit Price</label>
                    <input
                        type="number"
                        step="0.01"
                        min="0"
                        className="form-control"
                        value={editForm.real_ip_price}
                        onChange={(e) => setEditForm({ ...editForm, real_ip_price: e.target.value })}
                    />
                </div>
                {editForm.partner_type !== 'channel_partner' && (
                    <>
                        <div className="col-md-6">
                            <label className="form-label fw-semibold d-block">NTTN Type</label>
                            {['D2D', 'OHF', 'Longhaul'].map((item) => {
                                const checked = splitCsv(editForm.nttn_type).includes(item);
                                return (
                                    <div key={item} className="form-check form-check-inline">
                                        <input
                                            className="form-check-input"
                                            type="checkbox"
                                            id={`nttn_${item}`}
                                            checked={checked}
                                            onChange={() => toggleCsvValue('nttn_type', item)}
                                        />
                                        <label className="form-check-label" htmlFor={`nttn_${item}`}>{item}</label>
                                    </div>
                                );
                            })}
                        </div>
                        <div className="col-md-6">
                            <label className="form-label fw-semibold d-block">Connection Type</label>
                            {['Speed Net', 'L3'].map((item) => {
                                const checked = splitCsv(editForm.connection_type).includes(item);
                                return (
                                    <div key={item} className="form-check form-check-inline">
                                        <input
                                            className="form-check-input"
                                            type="checkbox"
                                            id={`con_${item}`}
                                            checked={checked}
                                            onChange={() => toggleCsvValue('connection_type', item)}
                                        />
                                        <label className="form-check-label" htmlFor={`con_${item}`}>{item}</label>
                                    </div>
                                );
                            })}
                        </div>
                    </>
                )}

                <div className="col-12 text-end">
                    <button type="button" className="btn btn-light me-2" onClick={onClose}>বন্ধ করুন</button>
                    <button className="btn btn-primary" disabled={saving}>
                        {saving ? 'সেভ হচ্ছে...' : 'আপডেট করুন'}
                    </button>
                </div>
            </form>
        </ModalWrap>
    );
};

export default EditProfileModal;
