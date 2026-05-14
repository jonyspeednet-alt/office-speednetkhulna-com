import React from 'react';
import ModalWrap from '../ModalWrap';

const AdjustmentModal = ({ adjForm, setAdjForm, onSubmit, onClose }) => {
    return (
        <ModalWrap title="কমিশন সমন্বয়/কর্তন" onClose={onClose}>
            <form className="row g-3" onSubmit={onSubmit}>
                <div className="col-md-6">
                    <label className="form-label fw-bold">টাইপ</label>
                    <select
                        className="form-select"
                        value={adjForm.type}
                        onChange={(e) => setAdjForm({ ...adjForm, type: e.target.value })}
                    >
                        <option value="adjustment">সমন্বয় (Adjustment)</option>
                        <option value="deduction">কর্তন (Deduction)</option>
                    </select>
                </div>
                <div className="col-md-6">
                    <label className="form-label fw-bold">পরিমাণ (Tk)</label>
                    <input
                        type="number"
                        step="0.01"
                        min="0.01"
                        className="form-control"
                        value={adjForm.amount}
                        onChange={(e) => setAdjForm({ ...adjForm, amount: e.target.value })}
                        required
                    />
                </div>
                <div className="col-12">
                    <label className="form-label fw-bold">কারণ/নোট</label>
                    <textarea
                        className="form-control"
                        rows="2"
                        value={adjForm.note}
                        onChange={(e) => setAdjForm({ ...adjForm, note: e.target.value })}
                    />
                </div>
                <div className="col-12 text-end">
                    <button type="button" className="btn btn-light rounded-pill me-2" onClick={onClose}>বাতিল</button>
                    <button className="btn btn-info text-white fw-bold rounded-pill px-4">সেভ করুন</button>
                </div>
            </form>
        </ModalWrap>
    );
};

export default AdjustmentModal;
