import React from 'react';
import ModalWrap from '../ModalWrap';

const AddUserModal = ({ newUser, setNewUser, onSubmit, onClose }) => {
    return (
        <ModalWrap title="নতুন ইউজার যোগ করুন" onClose={onClose}>
            <form className="row g-3" onSubmit={onSubmit}>
                <div className="col-md-6">
                    <label className="form-label fw-bold">ইউজারের নাম</label>
                    <input
                        className="form-control"
                        value={newUser.user_name}
                        onChange={(e) => setNewUser({ ...newUser, user_name: e.target.value })}
                        required
                    />
                </div>
                <div className="col-md-6">
                    <label className="form-label fw-bold">ইউজার আইডি</label>
                    <input
                        className="form-control"
                        value={newUser.user_id_code}
                        onChange={(e) => setNewUser({ ...newUser, user_id_code: e.target.value })}
                    />
                </div>
                <div className="col-md-4">
                    <label className="form-label fw-bold">ফোন</label>
                    <input
                        className="form-control"
                        value={newUser.phone}
                        onChange={(e) => setNewUser({ ...newUser, phone: e.target.value })}
                    />
                </div>
                <div className="col-md-4">
                    <label className="form-label fw-bold">প্যাকেজ</label>
                    <input
                        className="form-control"
                        value={newUser.package_name}
                        onChange={(e) => setNewUser({ ...newUser, package_name: e.target.value })}
                    />
                </div>
                <div className="col-md-4">
                    <label className="form-label fw-bold">মাসিক রেট (Tk)</label>
                    <input
                        type="number"
                        step="0.01"
                        min="0"
                        className="form-control"
                        value={newUser.monthly_rate}
                        onChange={(e) => setNewUser({ ...newUser, monthly_rate: e.target.value })}
                    />
                </div>
                <div className="col-12 text-end">
                    <button type="button" className="btn btn-light rounded-pill me-2" onClick={onClose}>বাতিল</button>
                    <button className="btn btn-primary fw-bold rounded-pill px-4">যোগ করুন</button>
                </div>
            </form>
        </ModalWrap>
    );
};

export default AddUserModal;
