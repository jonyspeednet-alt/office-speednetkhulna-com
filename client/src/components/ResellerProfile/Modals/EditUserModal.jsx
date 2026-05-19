import React from 'react';
import ModalWrap from '../ModalWrap';

const EditUserModal = ({ showEditUser, setShowEditUser, onSubmit, onClose }) => {
    if (!showEditUser) return null;

    return (
        <ModalWrap title="ইউজার সম্পাদনা" onClose={onClose}>
            <form className="row g-3" onSubmit={onSubmit}>
                <div className="col-md-6">
                    <label className="form-label fw-bold">ইউজারের নাম</label>
                    <input
                        className="form-control"
                        value={showEditUser.user_name || ''}
                        onChange={(e) => setShowEditUser({ ...showEditUser, user_name: e.target.value })}
                        required
                    />
                </div>
                <div className="col-md-6">
                    <label className="form-label fw-bold">ইউজার আইডি</label>
                    <input
                        className="form-control"
                        value={showEditUser.user_id_code || ''}
                        onChange={(e) => setShowEditUser({ ...showEditUser, user_id_code: e.target.value })}
                    />
                </div>
                <div className="col-md-4">
                    <label className="form-label fw-bold">ফোন</label>
                    <input
                        className="form-control"
                        value={showEditUser.phone || ''}
                        onChange={(e) => setShowEditUser({ ...showEditUser, phone: e.target.value })}
                    />
                </div>
                <div className="col-md-4">
                    <label className="form-label fw-bold">প্যাকেজ</label>
                    <input
                        className="form-control"
                        value={showEditUser.package_name || ''}
                        onChange={(e) => setShowEditUser({ ...showEditUser, package_name: e.target.value })}
                    />
                </div>
                <div className="col-md-4">
                    <label className="form-label fw-bold">মাসিক রেট (Tk)</label>
                    <input
                        type="number"
                        step="0.01"
                        min="0"
                        className="form-control"
                        value={showEditUser.monthly_rate || ''}
                        onChange={(e) => setShowEditUser({ ...showEditUser, monthly_rate: e.target.value })}
                    />
                </div>
                <div className="col-md-6">
                    <label className="form-label fw-bold">স্ট্যাটাস</label>
                    <select
                        className="form-select"
                        value={showEditUser.status || 'active'}
                        onChange={(e) => setShowEditUser({ ...showEditUser, status: e.target.value })}
                    >
                        <option value="active">Active</option>
                        <option value="inactive">Inactive</option>
                    </select>
                </div>
                <div className="col-12 text-end">
                    <button type="button" className="btn btn-light rounded-pill me-2" onClick={onClose}>বাতিল</button>
                    <button className="btn btn-primary fw-bold rounded-pill px-4">আপডেট করুন</button>
                </div>
            </form>
        </ModalWrap>
    );
};

export default EditUserModal;
