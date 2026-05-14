import React from "react";
import { money } from "../../../utils/formatters";

const CollectionTab = ({
  cpUserPayments,
  cpMonth,
  setCpMonth,
  onInitPayments,
  onRecordPayment,
  onBulkFullPaid,
  onImportClick,
}) => {
  const getPending = (p) =>
    Math.max(0, Number(p.amount_due || 0) - Number(p.amount_paid || 0));
  const totalCollection = cpUserPayments.reduce(
    (s, p) => s + Number(p.amount_paid || 0),
    0,
  );
  const totalDue = cpUserPayments.reduce(
    (s, p) => s + Number(p.amount_due || 0),
    0,
  );
  const totalPending = cpUserPayments.reduce((s, p) => s + getPending(p), 0);
  const pendingUsers = cpUserPayments.filter((p) => getPending(p) > 0).length;
  const collectionRate = Math.round((totalCollection / (totalDue || 1)) * 100);

  return (
    <div className="p-3">
      {/* Dashboard Header for Channel Partner */}
      <div className="row g-3 mb-4 mt-1">
        <div className="col-md-3">
          <div
            className="card border-0 shadow-sm rounded-4 h-100 overflow-hidden position-relative"
            style={{
              background: "linear-gradient(135deg, #4318ff 0%, #7c58ff 100%)",
            }}
          >
            <div className="card-body p-3 text-white">
              <div className="d-flex justify-content-between align-items-center mb-2">
                <div
                  className="rounded-circle bg-white bg-opacity-20 p-2"
                  style={{
                    width: 35,
                    height: 35,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <i className="fas fa-users" />
                </div>
                <span className="small opacity-75">মোট ইউজার</span>
              </div>
              <h4 className="fw-bold mb-0">{cpUserPayments.length} জন</h4>
              <div className="small opacity-75 mt-1">সক্রিয় ইউজার</div>
            </div>
          </div>
        </div>
        <div className="col-md-3">
          <div
            className="card border-0 shadow-sm rounded-4 h-100 overflow-hidden"
            style={{
              background: "linear-gradient(135deg, #05cd99 0%, #00a38d 100%)",
            }}
          >
            <div className="card-body p-3 text-white">
              <div className="d-flex justify-content-between align-items-center mb-2">
                <div
                  className="rounded-circle bg-white bg-opacity-20 p-2"
                  style={{
                    width: 35,
                    height: 35,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <i className="fas fa-money-bill-wave" />
                </div>
                <span className="small opacity-75">মোট কালেকশন</span>
              </div>
              <h4 className="fw-bold mb-0">{money(totalCollection)}</h4>
              <div
                className="progress mt-2"
                style={{ height: 4, backgroundColor: "rgba(255,255,255,0.2)" }}
              >
                <div
                  className="progress-bar bg-white"
                  style={{
                    width: `${Math.min(100, (totalCollection / (totalDue || 1)) * 100)}%`,
                  }}
                ></div>
              </div>
            </div>
          </div>
        </div>
        <div className="col-md-3">
          <div
            className="card border-0 shadow-sm rounded-4 h-100 overflow-hidden"
            style={{
              background: "linear-gradient(135deg, #ffb547 0%, #ff8f00 100%)",
            }}
          >
            <div className="card-body p-3 text-white">
              <div className="d-flex justify-content-between align-items-center mb-2">
                <div
                  className="rounded-circle bg-white bg-opacity-20 p-2"
                  style={{
                    width: 35,
                    height: 35,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <i className="fas fa-hand-holding-usd" />
                </div>
                <span className="small opacity-75">বকেয়া বিল</span>
              </div>
              <h4 className="fw-bold mb-0">{money(totalPending)}</h4>
              <div className="small opacity-75 mt-1">
                {pendingUsers} জনের বাকি আছে
              </div>
            </div>
          </div>
        </div>
        <div className="col-md-3">
          <div
            className="card border-0 shadow-sm rounded-4 h-100 overflow-hidden"
            style={{
              background: "linear-gradient(135deg, #111 0%, #333 100%)",
            }}
          >
            <div className="card-body p-3 text-white">
              <div className="d-flex justify-content-between align-items-center mb-2">
                <div
                  className="rounded-circle bg-white bg-opacity-20 p-2"
                  style={{
                    width: 35,
                    height: 35,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <i className="fas fa-chart-line" />
                </div>
                <span className="small opacity-75">কালেকশন হার</span>
              </div>
              <h4 className="fw-bold mb-0">{collectionRate}%</h4>
              <div className="small opacity-75 mt-1">পারফরম্যান্স</div>
            </div>
          </div>
        </div>
      </div>

      <div className="d-flex justify-content-between align-items-center mb-3">
        <div className="d-flex gap-2 align-items-center bg-light p-2 rounded-3 border">
          <i className="far fa-calendar-alt text-primary ms-1" />
          <input
            type="month"
            className="form-control form-control-sm border-0 bg-transparent fw-bold"
            value={cpMonth}
            onChange={(e) => setCpMonth(e.target.value)}
            style={{ width: 150 }}
          />
        </div>
        <div className="d-flex gap-2">
          <button
            className="btn btn-sm btn-outline-success rounded-pill px-3 shadow-sm"
            onClick={() =>
              import("../../../utils/excelGenerator").then((m) =>
                m.downloadUserImportSample(),
              )
            }
          >
            <i className="fas fa-download me-1" /> Sample Excel
          </button>
          <button
            className="btn btn-sm btn-info text-white rounded-pill px-3 shadow-sm"
            onClick={onImportClick}
          >
            <i className="fas fa-file-excel me-1" /> Excel Import
          </button>
          <button
            className="btn btn-sm btn-primary rounded-pill px-3 shadow-sm"
            onClick={onInitPayments}
          >
            <i className="fas fa-sync me-1" /> ইনিশিয়ালাইজ
          </button>
        </div>
      </div>

      <div className="table-responsive" style={{ maxHeight: 380 }}>
        <table className="table table-hover align-middle mb-0 table-sm">
          <thead className="table-light">
            <tr>
              <th>ইউজার</th>
              <th>আইডি</th>
              <th>প্যাকেজ</th>
              <th>মোট বিল</th>
              <th>Receive Amount</th>
              <th>Not Paid</th>
              <th>স্ট্যাটাস</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {cpUserPayments.length === 0 ? (
              <tr>
                <td colSpan="8" className="text-center text-muted py-4">
                  এই মাসের জন্য কোনো রেকর্ড নেই। &quot;ইনিশিয়ালাইজ&quot; বাটনে
                  ক্লিক করুন।
                </td>
              </tr>
            ) : (
              cpUserPayments.map((p) => (
                <tr key={p.id}>
                  <td className="fw-bold">{p.user_name}</td>
                  <td>
                    <span className="badge bg-light text-dark border">
                      {p.user_id_code || "-"}
                    </span>
                  </td>
                  <td>{p.package_name || "-"}</td>
                  <td>{money(p.amount_due)}</td>
                  <td>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      className="form-control form-control-sm"
                      style={{ width: 110 }}
                      defaultValue={Number(p.amount_paid || 0)}
                      onBlur={(e) => {
                        const val = Number(e.target.value || 0);
                        if (val !== Number(p.amount_paid || 0)) {
                          onRecordPayment(p.user_id, val);
                        }
                      }}
                    />
                  </td>
                  <td
                    className={
                      getPending(p) > 0 ? "text-danger fw-bold" : "text-success"
                    }
                  >
                    {money(getPending(p))}
                  </td>
                  <td>
                    <span
                      className={`badge ${getPending(p) <= 0 ? "bg-success" : Number(p.amount_paid) > 0 ? "bg-info" : "bg-warning"} bg-opacity-10 text-dark border`}
                    >
                      {getPending(p) <= 0
                        ? "Paid"
                        : Number(p.amount_paid) > 0
                          ? "Partial"
                          : "Unpaid"}
                    </span>
                  </td>
                  <td>
                    {getPending(p) > 0 && (
                      <button
                        className="btn btn-xs btn-outline-success"
                        onClick={() =>
                          onRecordPayment(p.user_id, Number(p.amount_due))
                        }
                      >
                        Full Pay
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {cpUserPayments.length > 0 && (
        <div className="mt-3 text-end">
          <button className="btn btn-sm btn-success" onClick={onBulkFullPaid}>
            <i className="fas fa-check-double me-1" />
            সবাই Full Paid
          </button>
        </div>
      )}
    </div>
  );
};

export default CollectionTab;
