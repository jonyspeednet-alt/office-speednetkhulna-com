import React from 'react';
import ModalWrap from '../ModalWrap';

const DiscountModal = ({
    discountAmount,
    setDiscountAmount,
    discountDate,
    setDiscountDate,
    discountNote,
    setDiscountNote,
    onSubmit,
    onClose
}) => {
    return (
        <ModalWrap title="Discount যুক্ত করুন" onClose={onClose}>
            <form className="row g-3" onSubmit={onSubmit}>
                <div className="col-md-4">
                    <label className="form-label fw-bold">Discount Amount (Tk)</label>
                    <input
                        type="number"
                        step="0.01"
                        min="0.01"
                        className="form-control form-control-lg fw-bold text-info"
                        value={discountAmount}
                        onChange={(e) => setDiscountAmount(e.target.value)}
                        required
                    />
                </div>
                <div className="col-md-4">
                    <label className="form-label fw-bold">তারিখ</label>
                    <input
                        type="date"
                        className="form-control"
                        value={discountDate}
                        onChange={(e) => setDiscountDate(e.target.value)}
                        required
                    />
                </div>
                <div className="col-12">
                    <label className="form-label fw-bold">কারণ/নোট</label>
                    <textarea
                        className="form-control"
                        rows="2"
                        value={discountNote}
                        onChange={(e) => setDiscountNote(e.target.value)}
                        required
                    />
                </div>
                <div className="col-12 text-end">
                    <button type="button" className="btn btn-light rounded-pill me-2" onClick={onClose}>বাতিল</button>
                    <button className="btn btn-info text-white fw-bold rounded-pill px-4">Discount সেভ করুন</button>
                </div>
            </form>
        </ModalWrap>
    );
};

export default DiscountModal;
