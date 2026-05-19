import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { partnerTypeLabel } from '../../utils/formatters';

const ProfileHeader = ({ reseller, can, isChannel, onPaymentClick, onDiscountClick, onProductChargeClick, onCommissionPayClick }) => {
    const navigate = useNavigate();
    return (
        <div className="d-flex flex-column flex-sm-row justify-content-between align-items-stretch align-items-sm-center mb-3 rp-profile-header">
            <div className="d-flex align-items-center gap-2 rp-title-block min-w-0">
                <button type="button" onClick={() => navigate(-1)} className="btn btn-light rounded-circle shadow-sm flex-shrink-0" aria-label="রিসেলার তালিকায় ফিরুন">
                    <i className="fas fa-arrow-left" />
                </button>
                <div className="min-w-0">
                    <h4 className="fw-bold m-0 text-truncate">{reseller.name}</h4>
                    <div className="d-flex flex-wrap align-items-center gap-1 mt-1">
                        <small className="text-muted">{reseller.reseller_code}</small>
                        <span className="badge bg-light text-dark border">{partnerTypeLabel(reseller.partner_type)}</span>
                    </div>
                </div>
            </div>
            <div className="d-flex flex-wrap gap-2 rp-actions">
                {isChannel && can.can_view_financials && onCommissionPayClick && (
                    <button type="button" className="btn btn-sm btn-success rounded-pill px-3 shadow-sm" onClick={onCommissionPayClick}>
                        <i className="fas fa-money-bill me-1 d-none d-sm-inline" />
                        <span>কমিশন পেমেন্ট</span>
                    </button>
                )}

                {!isChannel && can.can_add_payment && (
                    <button type="button" className="btn btn-sm btn-warning text-dark rounded-pill px-3 shadow-sm" onClick={onPaymentClick}>
                        <i className="fas fa-hand-holding-usd me-1 d-none d-sm-inline" />
                        <span>পেমেন্ট</span>
                    </button>
                )}
                {!isChannel && can.can_add_discount && (
                    <button type="button" className="btn btn-sm btn-info text-white rounded-pill px-3 shadow-sm" onClick={onDiscountClick}>
                        <i className="fas fa-percent me-1 d-none d-sm-inline" />
                        <span>Discount</span>
                    </button>
                )}
                {((!isChannel && can.can_view_invoice) || (isChannel && can.can_view_financials)) && (
                    <Link to={`/invoice?resellerId=${reseller.id}`} className="btn btn-sm btn-primary rounded-pill px-3 shadow-sm">
                        <i className="fas fa-file-invoice me-1 d-none d-sm-inline" />
                        <span>ইনভয়েস</span>
                    </Link>
                )}
            </div>
        </div>
    );
};

export default ProfileHeader;
