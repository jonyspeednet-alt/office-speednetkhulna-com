import React, { useRef, useState } from "react";
import html2canvas from "html2canvas";
import ModalWrap from "../ModalWrap";
import { money } from "../../../utils/formatters";
import BrandLogo from "../../BrandLogo";

const CPCommissionInvoiceModal = ({ reseller, summary, onClose }) => {
  const [downloading, setDownloading] = useState(false);
  const invoiceRef = useRef(null);

  const gross        = Number(summary.gross_commission   || 0);
  const advances     = Number(summary.partner_advances   || 0);
  const prodDed      = Number(summary.product_deduction  || 0);
  const adj          = Number(summary.adjustments        || 0);
  const ded          = Number(summary.deductions         || 0);
  const net          = Number(summary.net_commission     || 0);
  const prevBal      = Number(summary.previous_balance   || 0);
  const totalPayable = Number(summary.total_payable      || 0);
  const paid         = Number(summary.paid_to_partner    || 0);
  const closing      = Number(summary.closing_balance    || 0);
  const profitPct    = Number(summary.profit_share_percentage ?? reseller.profit_share_percentage ?? 0);
  const status       = summary.commission_status || 'draft';

  const formatMonthLabel = (ym) => {
    if (!ym || !/^\d{4}-\d{2}$/.test(String(ym))) return '';
    const [y, m] = String(ym).split('-');
    const d = new Date(Number(y), Number(m) - 1, 1);
    return d.toLocaleDateString('bn-BD', { month: 'long', year: 'numeric' });
  };

  const getDhakaDateStr = () => {
    return new Date().toLocaleDateString('bn-BD', { day: '2-digit', month: 'long', year: 'numeric' });
  };

  const downloadPNG = async () => {
    if (!invoiceRef.current || downloading) return;
    setDownloading(true);
    try {
      const canvas = await html2canvas(invoiceRef.current, { scale: 2, useCORS: true, backgroundColor: "#ffffff" });
      const link = document.createElement("a");
      link.download = `Commission_Invoice_${reseller?.name || "reseller"}_${summary.month}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    } catch (e) {
      console.error("[Invoice] html2canvas failed:", e);
    } finally {
      setDownloading(false);
    }
  };

  const handleShareWhatsApp = () => {
    try {
      const resName = reseller?.name || `Reseller ${reseller?.id}`;
      const text = `Speed Net Khulna - Commission Invoice\nPartner: ${resName}\nMonth: ${formatMonthLabel(summary.month)}\nTotal Payable: ${money(totalPayable)}\nClosing Due: ${money(closing)}\nStatus: ${status.toUpperCase()}`;
      window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
    } catch (e) {
      window.alert("WhatsApp share failed");
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <ModalWrap title="কমিশন চালান (Commission Invoice)" onClose={onClose} size="lg">
      <style dangerouslySetInnerHTML={{__html: `
        @media print {
          body > #root, 
          .navbar, 
          .sidebar, 
          .modal-backdrop,
          .rp-modal-backdrop,
          .no-print {
            display: none !important;
          }
          
          body {
            background: #ffffff !important;
            margin: 0 !important;
            padding: 0 !important;
          }
          
          #commissionInvoicePrintArea {
            display: block !important;
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            background: #ffffff !important;
            box-shadow: none !important;
            border: none !important;
            z-index: 9999999 !important;
          }
          
          .inv-container {
            box-shadow: none !important;
            border: none !important;
            border-radius: 0 !important;
          }
        }
      `}} />

      <div className="no-print d-flex gap-2 justify-content-end mb-3">
        <button className="btn btn-dark btn-sm rounded-pill px-3" onClick={handlePrint}>
          <i className="fas fa-print me-1" /> প্রিন্ট করুন
        </button>
        <button className="btn btn-outline-dark btn-sm rounded-pill px-3" onClick={downloadPNG} disabled={downloading}>
          {downloading ? <span className="spinner-border spinner-border-sm me-1" /> : <i className="fas fa-download me-1" />}
          PNG ডাউনলোড
        </button>
        <button className="btn btn-success btn-sm rounded-pill px-3" onClick={handleShareWhatsApp}>
          <i className="fab fa-whatsapp me-1" /> WhatsApp শেয়ার
        </button>
      </div>

      <div id="commissionInvoicePrintArea">
        <div className={`inv-container ${closing <= 0 ? 'status-paid' : 'status-due'} p-0`} ref={invoiceRef} style={{ border: '1px solid #cbd5e1' }}>
          
          <div className={`inv-watermark ${closing <= 0 ? 'paid' : ''}`}>
            {closing <= 0 ? 'PAID / পরিশোধিত' : 'DUE / বকেয়া'}
          </div>

          <div className="inv-header d-flex justify-content-between align-items-center py-4 px-5">
            <div>
              <div className="inv-brand">
                <BrandLogo className="inv-logo" alt="Speed Net Khulna" />
              </div>
              <p className="text-muted small mb-0 mt-1">খুলনা বিভাগের শীর্ষস্থানীয় ইন্টারনেট সার্ভিস প্রোভাইডার</p>
            </div>
            <div className="text-end">
              <div className="inv-label">কমিশন মাস (Month)</div>
              <div className="inv-number text-primary">{formatMonthLabel(summary.month)}</div>
            </div>
          </div>

          <div className="inv-body p-5">
            <div className="row mb-4">
              <div className="col-6">
                <div className="inv-info-label">কমিশন কার থেকে (From)</div>
                <div className="inv-info-text">
                  <strong className="text-dark">Speed Net Khulna</strong><br />
                  Khulna, Bangladesh<br />
                  ফোন: +880 1910365577<br />
                  ইমেইল: billing@speednetkhulna.com
                </div>
              </div>
              <div className="col-6 text-end">
                <div className="inv-info-label">রিসেলার পার্টনার (Partner)</div>
                <div className="inv-info-text">
                  <strong>{reseller.name || reseller.reseller_name}</strong><br />
                  {reseller.company_name && <>{reseller.company_name}<br /></>}
                  {reseller.pop_location && <>{reseller.pop_location}<br /></>}
                  {reseller.phone && <>ফোন: {reseller.phone}</>}
                </div>
              </div>
            </div>

            <div className="inv-meta row mb-4 mx-0 bg-light rounded py-3">
              <div className="col-4 border-end"><small>চালান তারিখ (Invoice Date)</small><div className="inv-meta-val">{getDhakaDateStr()}</div></div>
              <div className="col-4 border-end text-center"><small>অংশীদারিত্ব হার (Profit Share)</small><div className="inv-meta-val text-primary-custom">{profitPct}%</div></div>
              <div className="col-4 text-end"><small>নিট কমিশন (Net Commission)</small><div className="inv-meta-val text-success">{money(net)}</div></div>
            </div>

            <div className="table-responsive">
              <table className="inv-table w-100">
                <thead>
                  <tr className="bg-light">
                    <th className="py-2 px-3 border-bottom border-end">বিবরণ (Description)</th>
                    <th className="py-2 px-3 border-bottom text-end">পরিমাণ (Amount)</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="py-3 px-3 border-bottom border-end fw-semibold">
                      কমিশন (গ্রাহক বিল কালেকশন {money(summary.total_collected)} × {profitPct}%)
                    </td>
                    <td className="py-3 px-3 border-bottom text-end text-success fw-bold font-monospace">
                      {money(gross)}
                    </td>
                  </tr>

                  {advances > 0 && (
                    <tr>
                      <td className="py-3 px-3 border-bottom border-end text-muted ps-4">
                        (−) অগ্রিম সমন্বয়
                      </td>
                      <td className="py-3 px-3 border-bottom text-end text-danger font-monospace">
                        (-) {money(advances)}
                      </td>
                    </tr>
                  )}

                  {prodDed > 0 && (
                    <tr>
                      <td className="py-3 px-3 border-bottom border-end text-muted ps-4">
                        (−) প্রোডাক্ট চার্জ কর্তন
                      </td>
                      <td className="py-3 px-3 border-bottom text-end text-danger font-monospace">
                        (-) {money(prodDed)}
                      </td>
                    </tr>
                  )}

                  {ded > 0 && (
                    <tr>
                      <td className="py-3 px-3 border-bottom border-end text-muted ps-4">
                        {summary.deduction_note?.startsWith('[পার্টনার বিল কালেকশন]') 
                          ? '(−) পার্টনার সরাসরি গ্রাহক বিল সংগ্রহ' 
                          : `(−) কর্তন: ${summary.deduction_note || 'ম্যানুয়াল কর্তন'}`}
                      </td>
                      <td className="py-3 px-3 border-bottom text-end text-danger font-monospace">
                        (-) {money(ded)}
                      </td>
                    </tr>
                  )}

                  {adj > 0 && (
                    <tr>
                      <td className="py-3 px-3 border-bottom border-end text-muted ps-4">
                        (+) সমন্বয় বোনাস: {summary.adjustment_note || 'ম্যানুয়াল সমন্বয়'}
                      </td>
                      <td className="py-3 px-3 border-bottom text-end text-success font-monospace">
                        (+) {money(adj)}
                      </td>
                    </tr>
                  )}

                  <tr className="table-light">
                    <td className="py-3 px-3 border-bottom border-end fw-bold">
                      নেট কমিশন (Net Commission)
                    </td>
                    <td className="py-3 px-3 border-bottom text-end fw-bold text-success font-monospace">
                      {money(net)}
                    </td>
                  </tr>

                  {prevBal !== 0 && (
                    <tr>
                      <td className="py-3 px-3 border-bottom border-end text-muted ps-4">
                        {prevBal > 0 ? '(+) পূর্ববর্তী বকেয়া ব্যালেন্স' : '(−) পূর্ববর্তী ক্রেডিট ব্যালেন্স'}
                      </td>
                      <td className={`py-3 px-3 border-bottom text-end font-monospace ${prevBal > 0 ? 'text-danger' : 'text-success'}`}>
                        {prevBal > 0 ? '+' : '-'} {money(Math.abs(prevBal))}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="row mt-4 justify-content-end">
              <div className="col-md-6">
                <table className="table table-borderless inv-summary mb-0">
                  <tbody>
                    <tr>
                      <td className="text-end text-muted">নেট কমিশন (Net Commission)</td>
                      <td className="text-end text-muted fw-semibold font-monospace">{money(net)}</td>
                    </tr>
                    {prevBal !== 0 && (
                      <tr>
                        <td className="text-end text-muted">পূর্ববর্তী ব্যালেন্স (Carry Forward)</td>
                        <td className="text-end text-muted fw-semibold font-monospace">
                          {prevBal > 0 ? '' : '-'}{money(prevBal)}
                        </td>
                      </tr>
                    )}
                    <tr>
                      <td className="text-end fw-bold" style={{ borderTop: '1px solid #e2e8f0', paddingTop: 10 }}>
                        মোট প্রদেয় (Total Payable)
                      </td>
                      <td className="text-end fw-bold font-monospace" style={{ borderTop: '1px solid #e2e8f0', paddingTop: 10 }}>
                        {money(totalPayable)}
                      </td>
                    </tr>
                    {paid > 0 && (
                      <tr>
                        <td className="text-end text-success">পরিশোধিত (Paid)</td>
                        <td className="text-end fw-bold text-success font-monospace">
                          (-) {money(paid)}
                        </td>
                      </tr>
                    )}
                    <tr className="inv-total-row">
                      <td className="text-end fw-bold fs-6">বকেয়া ব্যালেন্স (Closing Due)</td>
                      <td className={`text-end fw-bold fs-6 font-monospace ${closing > 0 ? 'text-danger' : 'text-success'}`}>
                        {money(closing)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="inv-footer text-center py-4 px-5 bg-light">
            <p className="m-0 fw-semibold">কমিশন এবং নিষ্পত্তি সংক্রান্ত যেকোনো তথ্যের জন্য স্পিড নেট বিলিং বিভাগে যোগাযোগ করুন।</p>
            <p className="m-0 mt-1 small text-muted">স্পিড নেট খুলনা - অংশীদারিত্বে সমৃদ্ধি!</p>
          </div>

        </div>
      </div>
    </ModalWrap>
  );
};

export default CPCommissionInvoiceModal;
