import React from 'react';

const ModalWrap = ({ title, children, onClose }) => (
    <div
        className="position-fixed top-0 start-0 w-100 h-100 d-flex rp-modal-backdrop"
        role="dialog"
        aria-modal="true"
        aria-labelledby="rp-modal-title"
        onClick={(e) => e.target === e.currentTarget && onClose?.()}
    >
        <div className="card shadow rp-modal-panel" onClick={(e) => e.stopPropagation()}>
            <div className="card-header d-flex justify-content-between align-items-center py-3 sticky-top bg-white border-bottom">
                <h5 id="rp-modal-title" className="m-0 fw-bold pe-2">{title}</h5>
                <button type="button" className="btn btn-sm btn-light rounded-circle flex-shrink-0" onClick={onClose} aria-label="বন্ধ করুন">
                    <i className="fas fa-times" />
                </button>
            </div>
            <div className="card-body p-3 p-sm-4">{children}</div>
        </div>
    </div>
);

export default ModalWrap;
