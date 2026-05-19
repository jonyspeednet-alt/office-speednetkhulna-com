import React, { useState, useEffect } from "react";
import * as XLSX from "xlsx";
import ModalWrap from "../ModalWrap";

const ImportModal = ({
  importMonth,
  setImportMonth,
  importFile,
  setImportFile,
  importing,
  onImport,
  onClose,
}) => {
  const [parsedRows, setParsedRows] = useState([]);
  const [showOnlyDuplicates, setShowOnlyDuplicates] = useState(false);
  const [parseError, setParseError] = useState("");

  const getRowName = (row) => {
    const keys = ["Customer Name", "Customer", "User Name", "customer_name", "user_name"];
    for (const key of keys) {
      if (row[key] !== undefined) return String(row[key]).trim();
    }
    return "";
  };

  const getRowValue = (row, keys) => {
    for (const key of keys) {
      if (row[key] !== undefined) return row[key];
    }
    return "";
  };

  useEffect(() => {
    if (!importFile) {
      setParsedRows([]);
      setParseError("");
      return;
    }

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target.result;
        const wb = XLSX.read(bstr, { type: "binary" });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws);

        if (data.length === 0) {
          setParseError("ফাইলটিতে কোনো ডাটা পাওয়া যায়নি।");
          return;
        }

        // Count occurrences of each Customer Name to detect duplicates
        const nameCounts = {};
        data.forEach((row) => {
          const name = getRowName(row);
          if (name) {
            nameCounts[name] = (nameCounts[name] || 0) + 1;
          }
        });

        const rows = data.map((row, idx) => {
          const name = getRowName(row);
          const rxAmt = getRowValue(row, ["Receive Amount", "Received Amount", "Receive", "Paid Amount", "amount_paid", "receive_amount"]);
          const npAmt = getRowValue(row, ["Not Paid", "Unpaid", "Due", "Due Amount", "not_paid", "due_amount"]);

          return {
            id: idx,
            name,
            receiveAmount: rxAmt !== undefined ? Number(rxAmt) || 0 : "",
            notPaidAmount: npAmt !== undefined ? Number(npAmt) || 0 : "",
            isDuplicate: name ? nameCounts[name] > 1 : false,
            checked: true, // Checked by default
            rawRow: row,
          };
        });

        setParsedRows(rows);
        setParseError("");
      } catch (err) {
        console.error("Excel parse error:", err);
        setParseError("Excel ফাইলটি পড়া যায়নি। দয়া করে সঠিক ফাইল আপলোড করুন।");
      }
    };
    reader.readAsBinaryString(importFile);
  }, [importFile]);

  const handleStartImport = () => {
    const checkedRows = parsedRows.filter((r) => r.checked);
    if (checkedRows.length === 0) {
      window.alert("দয়া করে অন্তত একটি রেকর্ড সিলেক্ট করুন।");
      return;
    }

    // Rebuild Excel from checked rawRows
    const ws = XLSX.utils.json_to_sheet(checkedRows.map((r) => r.rawRow));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
    const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    
    // Create new File object
    const filteredFile = new File([wbout], importFile.name, {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });

    onImport(filteredFile);
  };

  const duplicatesCount = parsedRows.filter((r) => r.isDuplicate).length;
  const displayedRows = showOnlyDuplicates
    ? parsedRows.filter((r) => r.isDuplicate)
    : parsedRows;

  return (
    <ModalWrap
      title="Excel ডাটা ইম্পোর্ট করুন"
      onClose={() => {
        if (!importing) onClose();
      }}
      size={parsedRows.length > 0 ? "lg" : "md"}
    >
      <div className="p-2">
        <div className="alert alert-info py-2 small mb-3">
          <div className="d-flex justify-content-between align-items-center mb-1">
            <span>
              <i className="fas fa-info-circle me-2" />
              Excel ফাইলে <strong>&quot;Customer Name&quot;</strong>,{" "}
              <strong>&quot;Receive Amount&quot;</strong> এবং optional{" "}
              <strong>&quot;Not Paid&quot;</strong> কলাম থাকবে।{" "}
              <strong>&quot;Not Paid&quot;</strong> দিলে সেটি next month due
              হিসেবে carry হবে।
            </span>
            <button
              className="btn btn-sm btn-success rounded-pill px-3 ms-2 flex-shrink-0"
              onClick={() =>
                import("../../../utils/excelGenerator").then((m) =>
                  m.downloadUserImportSample(),
                )
              }
            >
              <i className="fas fa-download me-1" />
              Sample Excel
            </button>
          </div>
        </div>

        <div className="row">
          <div className={parsedRows.length > 0 ? "col-md-4" : "col-12"}>
            <div className="mb-3">
              <label className="form-label small fw-bold">মাস নির্বাচন করুন</label>
              <input
                type="month"
                className="form-control form-control-sm"
                value={importMonth}
                onChange={(e) => setImportMonth(e.target.value)}
                disabled={importing}
              />
            </div>
            <div className="mb-3">
              <label className="form-label small fw-bold">
                Excel ফাইল আপলোড করুন (.xlsx, .xls)
              </label>
              <input
                type="file"
                className="form-control form-control-sm"
                accept=".xlsx, .xls"
                onChange={(e) => setImportFile(e.target.files[0])}
                disabled={importing}
              />
            </div>
          </div>

          {parsedRows.length > 0 && (
            <div className="col-md-8">
              <div className="d-flex justify-content-between align-items-center mb-2">
                <span className="small fw-bold">
                  ফাইল প্রিভিউ (মোট রেকর্ড: {parsedRows.length} টি)
                </span>
                {duplicatesCount > 0 && (
                  <div className="form-check form-switch mb-0">
                    <input
                      className="form-check-input"
                      type="checkbox"
                      role="switch"
                      id="showOnlyDupSwitch"
                      checked={showOnlyDuplicates}
                      onChange={(e) => setShowOnlyDuplicates(e.target.checked)}
                    />
                    <label className="form-check-label small fw-semibold text-danger" htmlFor="showOnlyDupSwitch">
                      শুধু ডুপ্লিকেট দেখান ({duplicatesCount} টি)
                    </label>
                  </div>
                )}
              </div>

              {parseError && <div className="alert alert-danger py-1 small">{parseError}</div>}

              {duplicatesCount > 0 && (
                <div className="alert alert-warning py-1 px-2 mb-2 small d-flex align-items-center" style={{ fontSize: "0.78rem" }}>
                  <i className="fas fa-exclamation-triangle me-2 text-danger" />
                  <span>
                    <strong>সতর্কতা:</strong> ফাইলে ডুপ্লিকেট কাস্টমার পাওয়া গেছে (লাল হাইলাইট করা)। যে রো-গুলো সিস্টেমে আপলোড করতে চান, সেগুলো চেক মার্ক করুন।
                  </span>
                </div>
              )}

              <div
                style={{
                  maxHeight: "260px",
                  overflowY: "auto",
                  border: "1px solid var(--bs-border-color, #dee2e6)",
                  borderRadius: "8px",
                }}
                className="mb-3 shadow-sm bg-body"
              >
                <table className="table table-sm table-hover mb-0 align-middle" style={{ fontSize: "0.82rem" }}>
                  <thead className="table-light sticky-top">
                    <tr>
                      <th style={{ width: "40px" }} className="text-center">
                        <input
                          type="checkbox"
                          className="form-check-input"
                          checked={displayedRows.length > 0 && displayedRows.every((r) => r.checked)}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            setParsedRows((prev) =>
                              prev.map((r) => {
                                if (showOnlyDuplicates && !r.isDuplicate) return r;
                                return { ...r, checked };
                              })
                            );
                          }}
                        />
                      </th>
                      <th>কাস্টমার নাম</th>
                      <th className="text-end">পরিশোধিত (Receive)</th>
                      <th className="text-end">বকেয়া (Not Paid)</th>
                      <th style={{ width: "95px" }} className="text-center">স্ট্যাটাস</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayedRows.map((row) => (
                      <tr
                        key={row.id}
                        style={{
                          backgroundColor: row.isDuplicate ? "rgba(220, 53, 69, 0.08)" : "transparent",
                        }}
                      >
                        <td className="text-center">
                          <input
                            type="checkbox"
                            className="form-check-input"
                            checked={row.checked}
                            onChange={(e) => {
                              const checked = e.target.checked;
                              setParsedRows((prev) =>
                                prev.map((r) => (r.id === row.id ? { ...r, checked } : r))
                              );
                            }}
                          />
                        </td>
                        <td className={row.isDuplicate ? "text-danger fw-semibold" : ""}>
                          {row.name || <em className="text-muted">নামহীন</em>}
                        </td>
                        <td className="text-end font-monospace">
                          {row.receiveAmount !== "" ? `${row.receiveAmount} ৳` : "-"}
                        </td>
                        <td className="text-end font-monospace">
                          {row.notPaidAmount !== "" ? `${row.notPaidAmount} ৳` : "-"}
                        </td>
                        <td className="text-center">
                          {row.isDuplicate ? (
                            <span className="badge bg-danger-subtle text-danger border border-danger-subtle rounded-pill py-0.5 px-2" style={{ fontSize: "0.68rem" }}>
                              ডুপ্লিকেট
                            </span>
                          ) : (
                            <span className="badge bg-success-subtle text-success border border-success-subtle rounded-pill py-0.5 px-2" style={{ fontSize: "0.68rem" }}>
                              সঠিক
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        <div className="text-end pt-2 border-top">
          <button
            className="btn btn-sm btn-light me-2 rounded-pill px-3"
            onClick={onClose}
            disabled={importing}
          >
            বাতিল
          </button>
          <button
            className="btn btn-sm btn-primary rounded-pill px-4"
            disabled={importing || !importFile || parsedRows.filter(r => r.checked).length === 0}
            onClick={handleStartImport}
          >
            {importing ? (
              <>
                <span className="spinner-border spinner-border-sm me-2" />
                প্রসেস হচ্ছে...
              </>
            ) : (
              <>
                <i className="fas fa-upload me-1" />
                ইম্পোর্ট শুরু করুন
              </>
            )}
          </button>
        </div>
      </div>
    </ModalWrap>
  );
};

export default ImportModal;
