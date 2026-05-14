import React from 'react';
import { Link } from 'react-router-dom';
import { partnerTypeLabel } from '../../utils/formatters';

const ProfileHeader = ({ reseller, can, onPaymentClick, onDiscountClick }) => {
    return (
        <div className="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
            <div className="d-flex align-items-center gap-2">
                <Link to="/reseller-list" className="btn btn-light rounded-circle shadow-sm me-1">
                    <i className="fas fa-arrow-left" />
                </Link>
                <div>
                    <h4 className="fw-bold m-0">{reseller.name}</h4>
                    <small className="text-muted">{reseller.reseller_code}</small>
                    <span className="badge bg-light text-dark border ms-2">{partnerTypeLabel(reseller.partner_type)}</span>
                </div>
            </div>
            <div className="d-flex gap-2">
                {can.can_add_payment && (
                    <button type="button" className="btn btn-sm btn-warning text-dark rounded-pill px-3 shadow-sm" onClick={onPaymentClick}>
                        <i className="fas fa-hand-holding-usd me-1" />পেমেন্ট যোগ করুন
                    </button>
                )}
                {can.can_add_discount && (
                    <button type="button" className="btn btn-sm btn-info text-white rounded-pill px-3 shadow-sm" onClick={onDiscountClick}>
                        <i className="fas fa-percent me-1" />Discount
                    </button>
                )}
                {can.can_view_invoice && (
                    <Link to={`/invoice?resellerId=${reseller.id}`} className="btn btn-sm btn-primary rounded-pill px-3 shadow-sm">
                        <i className="fas fa-file-invoice me-1" />ইনভয়েস
                    </Link>
                )}
            </div>
        </div>
    );
};

export default ProfileHeader;
