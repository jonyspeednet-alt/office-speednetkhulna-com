import React, { useEffect, useState } from "react";
import ModalWrap from "../ModalWrap";
import { money } from "../../../utils/formatters";

const UserProductsModal = ({
  user,
  month,
  catalog,
  initialUsage,
  onSave,
  onClose,
  saving,
}) => {
  const [qtyByProduct, setQtyByProduct] = useState({});

  useEffect(() => {
    const map = {};
    (initialUsage || []).forEach((u) => {
      map[u.product_id] = Number(u.quantity || 0);
    });
    setQtyByProduct(map);
  }, [initialUsage, user?.id]);

  const lineTotal = (catalog || []).reduce((sum, p) => {
    const qty = Number(qtyByProduct[p.id] || 0);
    if (qty <= 0) return sum;
    return sum + qty * Number(p.unit_price || 0);
  }, 0);

  const handleSubmit = (e) => {
    e.preventDefault();
    const items = (catalog || [])
      .map((p) => ({
        product_id: p.id,
        quantity: Number(qtyByProduct[p.id] || 0),
      }))
      .filter((i) => i.quantity > 0);
    onSave({ month, items });
  };

  const hasCatalog = (catalog || []).length > 0;

  return (
    <ModalWrap
      title={`প্রোডাক্ট — ${user?.user_name || ""} (${month})`}
      onClose={onClose}
    >
      <form onSubmit={handleSubmit}>
        <section className="alert alert-info py-2 small">
          মোট প্রোডাক্ট চার্জ: <strong>{money(lineTotal)}</strong> — এই টাকা
          পার্টনারের মাসিক কমিশন থেকে কাটা হবে।
        </section>
        {!hasCatalog ? (
          <section className="alert alert-warning py-2 small mb-0">
            কোনো প্রোডাক্ট ক্যাটালগ নেই। প্রথমে প্রোডাক্ট ট্যাবে Excel ইম্পোর্ট করুন।
          </section>
        ) : (
          <section className="table-responsive" style={{ maxHeight: 360 }}>
            <table className="table table-sm align-middle">
              <thead className="table-light">
                <tr>
                  <th>প্রোডাক্ট</th>
                  <th>দাম</th>
                  <th style={{ width: 100 }}>পরিমাণ</th>
                  <th>মোট</th>
                </tr>
              </thead>
              <tbody>
                {(catalog || []).map((p) => {
                  const qty = Number(qtyByProduct[p.id] || 0);
                  return (
                    <tr key={p.id}>
                      <td>
                        <section className="fw-semibold">{p.name}</section>
                        <small className="text-muted">{p.product_code}</small>
                      </td>
                      <td>{money(p.unit_price)}</td>
                      <td>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          className="form-control form-control-sm"
                          value={qty || ""}
                          onChange={(e) =>
                            setQtyByProduct({
                              ...qtyByProduct,
                              [p.id]: e.target.value,
                            })
                          }
                        />
                      </td>
                      <td className="fw-bold">
                        {money(qty * Number(p.unit_price || 0))}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        )}
        <section className="text-end mt-3">
          <button
            type="button"
            className="btn btn-light rounded-pill me-2"
            onClick={onClose}
          >
            বাতিল
          </button>
          <button
            type="submit"
            className="btn btn-primary rounded-pill px-4"
            disabled={saving || !hasCatalog}
          >
            {saving ? "সেভ হচ্ছে..." : "সেভ করুন"}
          </button>
        </section>
      </form>
    </ModalWrap>
  );
};

export default UserProductsModal;
