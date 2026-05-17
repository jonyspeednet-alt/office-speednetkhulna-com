import React, { useMemo, useState } from "react";
import { money } from "../../../utils/formatters";

const ProductsTab = ({
  cpUsers,
  cpMonth,
  setCpMonth,
  cpProductSummary,
  onEditUserProducts,
  onImportCatalog,
  importingCatalog,
  showManualProductCharge,
  setShowManualProductCharge,
  manualProductChargeForm,
  setManualProductChargeForm,
  manualProductChargeLoading,
  handleSaveManualProductCharge,
}) => {
  const [search, setSearch] = useState("");
  
  const isOverridden = manualProductChargeForm?.amount !== "" && manualProductChargeForm?.amount !== null;

  const userTotals = useMemo(() => {
    const map = {};
    (cpProductSummary?.by_user || []).forEach((row) => {
      map[row.user_id] = row;
    });
    return map;
  }, [cpProductSummary]);

  const filteredUsers = cpUsers.filter(
    (u) =>
      !search ||
      u.user_name?.toLowerCase().includes(search.toLowerCase()) ||
      u.user_id_code?.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <section className="p-2 p-sm-3">
      <section className="row g-2 g-md-3 mb-3">
        <section className="col-12 col-md-4">
          <section className="card p-3 border-0 bg-primary bg-opacity-10 position-relative">
            <div className="d-flex justify-content-between align-items-center mb-1">
              <small className="text-muted text-uppercase">মোট প্রোডাক্ট কাটা</small>
              <button
                className="btn btn-sm btn-link text-primary p-0 text-decoration-none shadow-none"
                onClick={() => setShowManualProductCharge(true)}
              >
                <i className="fa-solid fa-pen-to-square me-1" />
                এডিট
              </button>
            </div>
            <h4 className="fw-bold text-primary m-0 d-flex align-items-center gap-2">
              {money(cpProductSummary?.total_product_deduction)}
              {isOverridden && (
                <span className="badge bg-warning text-dark border fw-normal" style={{ fontSize: '0.65rem' }}>
                  ম্যানুয়াল ওভাররাইড
                </span>
              )}
            </h4>
            <small className="text-muted mt-1">পার্টনার কমিশন থেকে বিয়োগ হবে</small>
          </section>
        </section>
        <section className="col-12 col-md-8">
          <section className="card p-3 h-100">
            <small className="text-muted d-block mb-2">শীর্ষ প্রোডাক্ট (এই মাস)</small>
            {(cpProductSummary?.by_product || []).length === 0 ? (
              <span className="text-muted small">এখনো কোনো প্রোডাক্ট বরাদ্দ নেই</span>
            ) : (
              <section className="d-flex flex-wrap gap-2">
                {cpProductSummary.by_product.slice(0, 6).map((p) => (
                  <span
                    key={p.id}
                    className="badge bg-light text-dark border"
                    title={p.product_code}
                  >
                    {p.name}: {money(p.total_amount)}
                  </span>
                ))}
              </section>
            )}
          </section>
        </section>
      </section>

      <section className="rp-toolbar mb-3">
        <section className="d-flex flex-wrap gap-2 align-items-center flex-grow-1">
          <section className="rp-month-picker">
            <i className="far fa-calendar-alt text-primary" />
            <input
              type="month"
              value={cpMonth}
              onChange={(e) => setCpMonth(e.target.value)}
              aria-label="প্রোডাক্ট মাস"
            />
          </section>
          <input
            type="search"
            className="form-control form-control-sm"
            placeholder="ইউজার খুঁজুন..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ maxWidth: 220 }}
          />
        </section>
        <section className="rp-toolbar-actions d-flex gap-2">
          <button
            type="button"
            className="btn btn-sm btn-success text-white rounded-pill px-3"
            onClick={() =>
              import("../../../utils/excelGenerator").then((m) =>
                m.downloadProductImportSample(),
              )
            }
          >
            <i className="fas fa-download me-1" />
            Sample Excel
          </button>
          <button
            type="button"
            className="btn btn-sm btn-outline-success rounded-pill px-3"
            onClick={onImportCatalog}
            disabled={importingCatalog}
          >
            <i className="fas fa-file-excel me-1" />
            {importingCatalog ? "ইম্পোর্ট..." : "product.xlsx ইম্পোর্ট"}
          </button>
        </section>
      </section>

      <section className="rp-table-wrap">
        <table className="table table-hover table-sm align-middle mb-0">
          <thead className="table-light">
            <tr>
              <th>ইউজার</th>
              <th>আইডি</th>
              <th className="d-none d-md-table-cell">প্রোডাক্ট সংখ্যা</th>
              <th>মোট চার্জ</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filteredUsers.length === 0 ? (
              <tr>
                <td colSpan="5" className="text-center text-muted py-4">
                  কোনো ইউজার নেই
                </td>
              </tr>
            ) : (
              filteredUsers.map((u) => {
                const t = userTotals[u.id];
                return (
                  <tr key={u.id}>
                    <td className="fw-bold">{u.user_name}</td>
                    <td>
                      <span className="badge bg-light text-dark border">
                        {u.user_id_code || "-"}
                      </span>
                    </td>
                    <td className="d-none d-md-table-cell">
                      {Number(t?.product_count || 0).toLocaleString("bn-BD")}
                    </td>
                    <td className="fw-bold text-danger">
                      {money(t?.total_amount || 0)}
                    </td>
                    <td className="text-end">
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-primary rounded-pill"
                        onClick={() => onEditUserProducts(u)}
                      >
                        <i className="fas fa-box me-1" />
                        প্রোডাক্ট
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </section>
      {/* Manual Product Charge Modal */}
      {showManualProductCharge && (
        <div className="modal show d-block" style={{ backgroundColor: "rgba(0,0,0,0.5)" }}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content border-0 shadow">
              <div className="modal-header bg-light border-bottom-0">
                <h5 className="modal-title fw-bold text-dark">
                  ম্যানুয়াল প্রোডাক্ট চার্জ
                </h5>
                <button
                  type="button"
                  className="btn-close shadow-none"
                  onClick={() => setShowManualProductCharge(false)}
                />
              </div>
              <div className="modal-body p-4">
                <form id="manualProductChargeForm" onSubmit={handleSaveManualProductCharge}>
                  <div className="mb-3">
                    <label className="form-label text-muted small fw-medium">
                      মোট প্রোডাক্ট চার্জ (টাকা)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      className="form-control shadow-none"
                      placeholder="যেমন: 2500"
                      value={manualProductChargeForm.amount}
                      onChange={(e) =>
                        setManualProductChargeForm({ ...manualProductChargeForm, amount: e.target.value })
                      }
                    />
                    <small className="text-muted d-block mt-1">
                      {isOverridden ? "ফাঁকা রাখলে পুনরায় অটো-ক্যালকুলেট সিস্টেমে ফিরে যাবে।" : "কোনো অ্যামাউন্ট দিলে ইউজার প্রোডাক্টের মোট হিসাব ওভাররাইড হবে।"}
                    </small>
                  </div>
                  <div className="mb-0">
                    <label className="form-label text-muted small fw-medium">
                      মন্তব্য (ঐচ্ছিক)
                    </label>
                    <input
                      type="text"
                      className="form-control shadow-none"
                      placeholder="যেমন: অতিরিক্ত ক্যাবল চার্জ..."
                      value={manualProductChargeForm.note}
                      onChange={(e) =>
                        setManualProductChargeForm({ ...manualProductChargeForm, note: e.target.value })
                      }
                    />
                  </div>
                </form>
              </div>
              <div className="modal-footer border-top-0 bg-light">
                <button
                  type="button"
                  className="btn btn-light border px-4"
                  onClick={() => setShowManualProductCharge(false)}
                  disabled={manualProductChargeLoading}
                >
                  বাতিল করুন
                </button>
                <button
                  type="submit"
                  form="manualProductChargeForm"
                  className="btn btn-primary px-4 d-flex align-items-center gap-2"
                  disabled={manualProductChargeLoading}
                >
                  {manualProductChargeLoading ? (
                    <>
                      <span className="spinner-border spinner-border-sm" />
                      সেভ হচ্ছে...
                    </>
                  ) : (
                    "সংরক্ষণ করুন"
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};

export default ProductsTab;
