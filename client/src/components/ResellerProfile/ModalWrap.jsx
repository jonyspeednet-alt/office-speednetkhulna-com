import React from 'react';

const ModalWrap = ({ title, children, onClose }) => (
    <div className="position-fixed top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center" style={{ zIndex: 1080, background: 'rgba(0,0,0,.5)' }}>
        <div className="card shadow" style={{ width: 'min(920px,95vw)', maxHeight: '90vh', overflow: 'auto' }}>
            <div className="card-header d-flex justify-content-between align-items-center">
                <h5 className="m-0 fw-bold">{title}</h5>
                <button className="btn btn-sm btn-light" onClick={onClose}><i className="fas fa-times" /></button>
            </div>
            <div className="card-body">{children}</div>
        </div>
    </div>
);

export default ModalWrap;
