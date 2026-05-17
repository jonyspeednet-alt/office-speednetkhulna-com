import React from "react";
import { money } from "../../../utils/formatters";

const CommissionTab = ({
  cpMonth,
  setCpMonth,
  cpCommission,
  cpHistory,
  onGenerateCommission,
  onCommissionPayment,
  onAdjustment,
  onFinalize,
  onDownloadReport,
}) => {
  const payableLogs = (cpHistory || []).filter(
    (h) => h.status === "finalized" && Number(h.closing_balance || 0) > 0,
  );
  const latestPayable = payableLogs[0] || null;
  const showMonthSummary =
    cpCommission && String(cpCommission.month || "") === String(cpMonth || "");

  return (
    <div className="p-2 p-sm-3">
      {showMonthSummary && Number(cpCommission.product_deduction || 0) > 0 && (
        <div className="alert alert-warning border-0 py-2 small mb-3">
          <i className="fas fa-box me-2" />
          {cpMonth} মাসে প্রোডাক্ট কাটা:{" "}
          <strong>{money(cpCommission.product_deduction)}</strong>
          {Number(cpCommission.partner_advances || 0) > 0 && (
            <>
              {" "}
              · অগ্রিম: <strong>{money(cpCommission.partner_advances)}</strong>
            </>
          )}
        </div>
      )}
      <div className="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
        <div className="d-flex gap-2 align-items-center">
          <h6 className="fw-bold m-0">কমিশন ইতিহাস</h6>
          {cpMonth && setCpMonth && (
            <div className="rp-month-picker">
              <i className="far fa-calendar-alt text-primary" />
              <input
                type="month"
                value={cpMonth}
                onChange={(e) => setCpMonth(e.target.value)}
                aria-label="কমিশন মাস"
              />
            </div>
          )}
        </div>
        <div className="rp-toolbar-actions">
          <button
            type="button"
            className="btn btn-sm btn-outline-primary rounded-pill px-3 shadow-sm"
            onClick={onGenerateCommission}
          >
            <i className="fas fa-sync-alt me-1" />
            <span>পুনরায় হিসাব করুন</span>
          </button>
          <button
            className="btn btn-sm btn-success"
            onClick={() => latestPayable && onCommissionPayment(latestPayable)}
            disabled={!latestPayable}
            title={
              latestPayable
                ? `${latestPayable.month} মাসের বকেয়া কমিশন দিন`
                : "Finalized payable commission নেই"
            }
          >
            <i className="fas fa-money-bill me-1" />
            কমিশন দিন
          </button>
        </div>
      </div>
      <div className="rp-table-wrap rp-table-wide d-none d-md-block">
        <table className="table table-hover align-middle mb-0 table-sm">
          <thead className="table-light">
            <tr>
              <th>মাস</th>
              <th>ইউজার</th>
              <th>কালেকশন</th>
              <th>%</th>
              <th>Gross</th>
              <th>Product</th>
              <th>Adj</th>
              <th>Ded</th>
              <th>Net</th>
              <th>Paid</th>
              <th>Balance</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {cpHistory.length === 0 ? (
              <tr>
                <td colSpan="13" className="text-center text-muted py-4">
                  কোনো কমিশন ইতিহাস নেই
                </td>
              </tr>
            ) : (
              cpHistory.map((h) => (
                <tr key={h.id}>
                  <td className="fw-bold text-primary">{h.month}</td>
                  <td>
                    <div className="fw-bold">
                      {h.paying_users}/{h.total_users}
                    </div>
                    <div className="text-muted" style={{ fontSize: 10 }}>
                      Paid Users
                    </div>
                  </td>
                  <td>
                    <div className="fw-bold">{money(h.total_collection)}</div>
                  </td>
                  <td>
                    <span className="badge bg-light text-dark border">
                      {Number(h.profit_share_pct)}%
                    </span>
                  </td>
                  <td>{money(h.gross_commission)}</td>
                  <td
                    className={
                      Number(h.product_deduction || 0) !== 0 ? "text-danger" : ""
                    }
                  >
                    {Number(h.product_deduction || 0) !== 0 ? (
                      <div className="d-flex align-items-center">
                        <span className="me-1">-</span>
                        {money(h.product_deduction)}
                      </div>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td
                    className={Number(h.adjustments) !== 0 ? "text-info" : ""}
                  >
                    {Number(h.adjustments) !== 0 ? (
                      <div className="d-flex align-items-center">
                        <span className="me-1 text-success">+</span>
                        {money(h.adjustments)}
                      </div>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td
                    className={Number(h.deductions) !== 0 ? "text-danger" : ""}
                  >
                    {Number(h.deductions) !== 0 ? (
                      <div className="d-flex align-items-center">
                        <span className="me-1">-</span>
                        {money(h.deductions)}
                      </div>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td className="fw-bold text-dark">
                    {money(h.net_commission)}
                  </td>
                  <td className="text-success fw-bold">
                    {money(h.paid_amount)}
                  </td>
                  <td
                    className={
                      Number(h.closing_balance) > 0
                        ? "text-danger fw-bold"
                        : "text-success"
                    }
                  >
                    {money(h.closing_balance)}
                    {Number(h.closing_balance) > 0 && (
                      <i className="fas fa-exclamation-circle ms-1 small" />
                    )}
                  </td>
                  <td>
                    <span
                      className={`badge rounded-pill ${h.status === "finalized" ? "bg-success" : "bg-warning"} bg-opacity-10 text-dark border px-2`}
                    >
                      {h.status === "finalized" ? "Finalized" : "Draft"}
                    </span>
                  </td>
                  <td>
                    <div className="btn-group shadow-sm rounded-pill overflow-hidden">
                      {h.status === "draft" && (
                        <>
                          <button
                            className="btn btn-white btn-sm border"
                            onClick={() => onAdjustment(h)}
                            title="সমন্বয়"
                          >
                            <i className="fas fa-sliders-h text-info" />
                          </button>
                          <button
                            className="btn btn-white btn-sm border"
                            onClick={() => onFinalize(h.id)}
                            title="Finalize"
                          >
                            <i className="fas fa-check text-success" />
                          </button>
                        </>
                      )}
                      {h.status === "finalized" && (
                        <>
                          {Number(h.closing_balance || 0) > 0 && (
                            <button
                              className="btn btn-white btn-sm border"
                              onClick={() => onCommissionPayment(h)}
                              title="এই মাসের কমিশন পেমেন্ট দিন"
                            >
                              <i className="fas fa-money-bill text-success" />
                            </button>
                          )}
                          <button
                            className="btn btn-white btn-sm border"
                            onClick={() => onDownloadReport(h)}
                            title="Download Report"
                          >
                            <i className="fas fa-file-pdf text-danger" />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default CommissionTab;
