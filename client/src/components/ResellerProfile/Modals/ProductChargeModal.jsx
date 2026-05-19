import React from 'react';
import ModalWrap from '../ModalWrap';

const ProductChargeModal = ({
    productChargeAmount,
    setProductChargeAmount,
    productChargeDate,
    setProductChargeDate,
    productChargeNote,
    setProductChargeNote,
    onSubmit,
    onClose
}) => {
    return (
        <ModalWrap title="ম্যানুয়াল প্রোডাক্ট চার্জ যুক্ত করুন" onClose={onClose}>
            <form className="row g-3" onSubmit={onSubmit}>
                <div className="col-md-6">
                    <label className="form-label fw-bold">প্রোডাক্টের মোট দাম (Tk)</label>
                    <input
                        type="number"
                        step="0.01"
                        min="0.01"
                        className="form-control form-control-lg fw-bold text-danger"
                        value={productChargeAmount}
                        onChange={(e) => setProductChargeAmount(e.target.value)}
                        required
                        placeholder="যেমন: 500.00"
                    />
                </div>
                <div className="col-md-6">
                    <label className="form-label fw-bold">তারিখ</label>
                    <input
                        type="date"
                        className="form-control form-control-lg"
                        value={productChargeDate}
                        onChange={(e) => setProductChargeDate(e.target.value)}
                        required
                    />
                </div>
                <div className="col-12">
                    <label className="form-label fw-bold">প্রোডাক্টের বিবরণ / নোট</label>
                    <textarea
                        className="form-control"
                        rows="3"
                        placeholder="যেমন: 5টি অনু এবং ওনু বক্স সরবরাহ করা হয়েছে।"
                        value={productChargeNote}
                        onChange={(e) => setProductChargeNote(e.target.value)}
                        required
                    />
                </div>
                <div className="col-12 text-end mt-4">
                    <button type="button" className="btn btn-light rounded-pill me-2 px-3" onClick={onClose}>বাতিল</button>
                    <button className="btn btn-danger text-white fw-bold rounded-pill px-4">চার্জ সেভ করুন</button>
                </div>
            </form>
        </ModalWrap>
    );
};

export default ProductChargeModal;
