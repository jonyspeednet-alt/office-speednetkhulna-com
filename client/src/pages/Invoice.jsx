import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import html2canvas from 'html2canvas';
import { getInvoice, getInvoiceByBillId, getResellers, sendInvoiceEmail, sendInvoiceEmailByBillId, getResellerRateChangeLogs } from '../services/resellerService';
import BrandLogo from '../components/BrandLogo';
import { t } from '../i18n';
import '../styles/Invoice.css';

const fmt = (n, decimals = 2) => {
  const num = Number(n || 0);
  return num.toFixed(decimals).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
};
const fmtTk = (n, decimals = 2) => `${fmt(n, decimals)} ৳`;

const toMonthName = (monthStr) => {
  if (!monthStr) return '';
  const d = new Date(monthStr.slice(0, 7) + '-15');
  return d.toLocaleDateString('bn-BD', { month: 'long', year: 'numeric' });
};

const todayStr = () =>
  new Date().toLocaleDateString('bn-BD', { day: '2-digit', month: 'short', year: 'numeric' });
const getDhakaMonth = () => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Dhaka',
    year: 'numeric',
    month: '2-digit'
  }).formatToParts(new Date());
  const year = parts.find((p) => p.type === 'year')?.value;
  const month = parts.find((p) => p.type === 'month')?.value;
  return year && month ? `${year}-${month}` : new Date().toISOString().slice(0, 7);
};

const StatusBadge = ({ type }) => {
  if (type === 'increase') return <span className="inv-badge badge-increase">{t('invoice.increase')}</span>;
  if (type === 'decrease') return <span className="inv-badge badge-decrease">{t('invoice.decrease')}</span>;
  if (type === 'standard') return <span className="inv-badge badge-standard">{t('invoice.currentPkg')}</span>;
  return <span className="inv-badge badge-standard">-</span>;
};

const Invoice = () => {
  const [searchParams] = useSearchParams();
  const initialResellerId = searchParams.get('resellerId') || '';
  const initialMonth = (searchParams.get('month') || '').slice(0, 7);
  const initialBillId = searchParams.get('id') || searchParams.get('billId') || '';

  const [resellers, setResellers] = useState([]);
  const [resellersLoaded, setResellersLoaded] = useState(false);
  const [resellerId, setResellerId] = useState(initialResellerId);
  const [month, setMonth] = useState(initialMonth || getDhakaMonth());
  const [billId, setBillId] = useState(initialBillId);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [rateChangeLogs, setRateChangeLogs] = useState([]);
  const invoiceRef = useRef(null);

  useEffect(() => {
    if (resellersLoaded) return;
    getResellers()
      .then((list) => {
        setResellers(Array.isArray(list) ? list : []);
        setResellersLoaded(true);
      })
      .catch((e) => console.error('[Invoice] getResellers:', e));
  }, [resellersLoaded]);

  const loadInvoice = useCallback(async () => {
    setLoading(true);
    try {
      if (billId) {
        const result = await getInvoiceByBillId(billId);
        setData(result);
        setResellerId(String(result?.reseller?.id || ''));
        if (result?.month) setMonth(String(result.month).slice(0, 7));
        return;
      }

      if (!resellerId) return;
      const result = await getInvoice(resellerId, `${month}-01`);
      setData(result);
    } catch (e) {
      console.error('[Invoice] getInvoice:', e);
    } finally {
      setLoading(false);
    }
  }, [resellerId, month, billId]);

  useEffect(() => {
    if (billId) {
      loadInvoice();
      return;
    }
    if (resellerId && month) {
      loadInvoice();
    }
  }, [billId, resellerId, month, loadInvoice]);

  // Load rate change logs when reseller is known
  useEffect(() => {
    const rid = resellerId || data?.reseller?.id;
    if (!rid) return;
    getResellerRateChangeLogs(rid).then(setRateChangeLogs).catch(() => { });
  }, [resellerId, data?.reseller?.id]);

  const downloadPNG = async () => {
    if (!invoiceRef.current || downloading) return;
    setDownloading(true);
    try {
      const canvas = await html2canvas(invoiceRef.current, { scale: 2, useCORS: true });
      const link = document.createElement('a');
      link.download = `Invoice_${data?.reseller?.name || 'reseller'}_${month}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch (e) {
      console.error('[Invoice] html2canvas:', e);
    } finally {
      setDownloading(false);
    }
  };

  const captureInvoiceDataUrl = async () => {
    if (!invoiceRef.current) throw new Error('Invoice content not ready');
    const canvas = await html2canvas(invoiceRef.current, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });
    return canvas.toDataURL('image/png');
  };

  const handleSendEmail = async () => {
    const target = window.prompt('ইমেইল ঠিকানা দিন (invoice পাঠাতে):');
    if (!target) return;
    const toEmail = target.trim();
    if (!toEmail) return;

    setSendingEmail(true);
    try {
      const snapshotDataUrl = await captureInvoiceDataUrl();
      if (bill?.id) {
        await sendInvoiceEmailByBillId(bill.id, { to_email: toEmail, snapshot_data_url: snapshotDataUrl });
      } else if (resellerId) {
        await sendInvoiceEmail(resellerId, { to_email: toEmail, month, snapshot_data_url: snapshotDataUrl });
      } else {
        window.alert('রিসেলার নির্বাচন করুন');
        return;
      }
      window.alert('Invoice email সফলভাবে পাঠানো হয়েছে।');
    } catch (e) {
      window.alert(e?.response?.data?.message || 'Invoice email পাঠানো যায়নি');
    } finally {
      setSendingEmail(false);
    }
  };

  const handleShareWhatsApp = async () => {
    try {
      const snapshotDataUrl = await captureInvoiceDataUrl();
      const resName = data?.reseller?.name || data?.reseller?.reseller_name || `Reseller ${resellerId}`;
      const directLink = bill?.id
        ? `${window.location.origin}/view-static-invoice?id=${bill.id}`
        : `${window.location.origin}/invoice?resellerId=${encodeURIComponent(resellerId)}&month=${encodeURIComponent(month)}`;
      const text = `Invoice: ${resName} (${month})\n${directLink}`;

      const response = await fetch(snapshotDataUrl);
      const blob = await response.blob();
      const file = new File([blob], `invoice_${resellerId || 'reseller'}_${month}.png`, { type: 'image/png' });

      if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], text, title: 'Invoice Snapshot' });
        return;
      }

      window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
      window.alert('আপনার ব্রাউজারে direct file share সাপোর্ট নেই। WhatsApp-এ invoice link open করা হয়েছে।');
    } catch (e) {
      window.alert('WhatsApp share ব্যর্থ হয়েছে');
    }
  };

  const SelectorBar = () => (
    <div className="d-flex flex-wrap align-items-center gap-2">
      <select
        className="form-select form-select-sm shadow-sm border-0"
        style={{ width: 'auto', minWidth: 180 }}
        value={resellerId}
        onChange={(e) => { setResellerId(e.target.value); setBillId(''); setData(null); }}
      >
        <option value="">{t('invoice.selectReseller')}</option>
        {resellers.map((r) => (
          <option key={r.id} value={r.id}>{r.name}</option>
        ))}
      </select>

      <input
        type="month"
        className="form-control form-control-sm shadow-sm border-0"
        style={{ width: 'auto' }}
        value={month}
        onChange={(e) => { setMonth(e.target.value); setBillId(''); setData(null); }}
      />
    </div>
  );

  if (!data) {
    return (
      <div className="container-fluid py-3 reseller-page">
        <div className="card p-4">
          <h5 className="fw-bold mb-3">
            <i className="fas fa-file-invoice me-2 text-primary" />{t('invoice.title')}
          </h5>
          {loading && <div className="small text-muted mb-2"><span className="spinner-border spinner-border-sm me-1" />{t('invoice.loading')}</div>}
          <SelectorBar />
        </div>
      </div>
    );
  }

  const { reseller, bill, items = [], total_paid = 0, total_discount = 0 } = data;

  const dynamicTotal = Array.isArray(items) ? items.reduce((sum, row) => sum + Number(row?.total || 0), 0) : 0;
  const totalAmount = parseFloat(bill?.final_amount ?? (dynamicTotal > 0 ? dynamicTotal : (reseller?.projected_bill ?? 0)));
  const otcItems = Array.isArray(items) ? items.filter((item) => item?.desc === 'OTC') : [];
  const displayItems = Array.isArray(items) ? items.filter((item) => item?.desc !== 'OTC') : [];
  const otcAmount = otcItems.reduce((sum, item) => sum + Number(item?.total || 0), 0);
  const runningBillAmount = Math.max(0, Number(totalAmount || 0) - otcAmount);
  const adj = parseFloat(bill?.adjustment ?? 0);
  const adjNote = bill?.adjustment_note ?? '';
  const prevDue = parseFloat(bill?.previous_due ?? reseller?.due_amount ?? 0);
  const netPayable = prevDue + totalAmount + adj - total_paid - total_discount;
  const netPayableRounded = Number(netPayable.toFixed(2));
  const hasLegacyAdjustment = Math.abs(adj) > 0.0001;

  return (
    <div className="container-fluid py-3 reseller-page">
      <div className="d-flex justify-content-between align-items-center mb-3 no-print" style={{ maxWidth: 850, margin: '0 auto 16px' }}>
        <SelectorBar />

        <div className="d-flex gap-2 align-items-center">
          {bill ? (
            <a href={`/view-static-invoice?id=${bill.id}`} target="_blank" rel="noreferrer" className="btn btn-success btn-sm rounded-pill shadow-sm">
              <i className="fas fa-check-circle me-1" />{t('invoice.finalBillView')}
            </a>
          ) : (
            <span className="badge bg-warning text-dark rounded-pill px-3 py-2"><i className="fas fa-clock me-1" />{t('invoice.projectedView')}</span>
          )}

          <button className="btn btn-dark btn-sm rounded-pill shadow-sm" onClick={() => window.print()}>
            <i className="fas fa-print me-1" />{t('invoice.print')}
          </button>
          <button className="btn btn-outline-dark btn-sm rounded-pill shadow-sm" onClick={downloadPNG} disabled={downloading}>
            {downloading ? <span className="spinner-border spinner-border-sm me-1" /> : <i className="fas fa-download me-1" />}
            PNG
          </button>
          <button className="btn btn-primary btn-sm rounded-pill shadow-sm" onClick={handleSendEmail} disabled={sendingEmail}>
            {sendingEmail ? <span className="spinner-border spinner-border-sm me-1" /> : <i className="fas fa-envelope me-1" />}
            Email
          </button>
          <button className="btn btn-success btn-sm rounded-pill shadow-sm" onClick={handleShareWhatsApp}>
            <i className="fab fa-whatsapp me-1" />
            WhatsApp
          </button>
        </div>
      </div>

      <div className={`inv-container ${netPayableRounded <= 0 ? 'status-paid' : 'status-due'}`} id="invoiceContent" ref={invoiceRef} style={{ maxWidth: 850, margin: '0 auto' }}>
        <div className={`inv-watermark${netPayableRounded <= 0 ? ' paid' : ''}`}>{netPayableRounded <= 0 ? t('invoice.paid') : t('invoice.due')}</div>

        <div className="inv-header d-flex justify-content-between align-items-center">
          <div>
            <div className="inv-brand">
              <BrandLogo className="inv-logo" alt="Speed Net Khulna" />
            </div>
            <p className="text-muted small mb-0 mt-1">{t('invoice.providerTag')}</p>
          </div>
          <div className="text-end">
            <div className="inv-label">{t('invoice.billingMonth')}</div>
            <div className="inv-number">{toMonthName(month)}</div>
          </div>
        </div>

        <div className="inv-body">
          <div className="row mb-4">
            <div className="col-6">
              <div className="inv-info-label">{t('invoice.from')}</div>
              <div className="inv-info-text">
                <strong className="text-dark">Speed Net Khulna</strong><br />
                Khulna, Bangladesh<br />
                ফোন: +880 1910365577<br />
                ইমেইল: billing@speednetkhulna.com
              </div>
            </div>
            <div className="col-6 text-end">
              <div className="inv-info-label">{t('invoice.to')}</div>
              <div className="inv-info-text">
                <strong>{reseller.name || reseller.reseller_name}</strong><br />
                {reseller.company_name && <>{reseller.company_name}<br /></>}
                {reseller.pop_location && <>{reseller.pop_location}<br /></>}
                {reseller.phone && <>{t('invoice.contact')}: {reseller.phone}</>}
              </div>
            </div>
          </div>

          <div className="inv-meta row mb-4">
            <div className="col-4 border-end"><small>{t('invoice.invoiceDate')}</small><div className="inv-meta-val">{todayStr()}</div></div>
            <div className="col-4 border-end text-center"><small>{t('invoice.billingMonth')}</small><div className="inv-meta-val text-primary-custom">{toMonthName(month)}</div></div>
            <div className="col-4 text-end"><small>{t('invoice.totalBill')}</small><div className="inv-meta-val">{fmtTk(totalAmount)}</div></div>
          </div>

          <div className="table-responsive">
            {displayItems.length > 0 ? (
              <table className="inv-table">
                <thead>
                  <tr>
                    <th>{t('invoice.description')}</th>
                    <th className="text-center">{t('invoice.status')}</th>
                    <th>{t('invoice.dateRange')}</th>
                    <th className="text-center">{t('invoice.bandwidth')}</th>
                    <th className="text-center">{t('invoice.rate')}</th>
                    <th className="text-center">{t('invoice.days')}</th>
                    <th className="text-end">{t('invoice.total')}</th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    // Group items by desc to detect multi-segment types
                    const groups = {};
                    displayItems.forEach((item) => {
                      if (!groups[item.desc]) groups[item.desc] = [];
                      groups[item.desc].push(item);
                    });

                    const rows = [];
                    Object.entries(groups).forEach(([desc, segItems]) => {
                      const isMulti = segItems.length > 1;
                      const subtotal = segItems.reduce((s, i) => s + Number(i.total || 0), 0);

                      segItems.forEach((item, si) => {
                        const isFirst = si === 0;
                        rows.push(
                          <tr key={`${desc}-${si}`} className={isMulti ? 'inv-segment-row' : ''}>
                            {/* Description cell — rowSpan covers all segments + subtotal row */}
                            {isFirst && (
                              <td
                                rowSpan={isMulti ? segItems.length + 1 : 1}
                                className="fw-bold align-middle"
                              >
                                {desc}
                              </td>
                            )}
                            <td className="text-center"><StatusBadge type={item.change_type} /></td>
                            <td><small className="text-muted">{item.date_range}</small></td>
                            <td className="text-center">{item.bw}</td>
                            <td className="text-center">
                              {fmt(item.rate)}
                              {/* Show rate change indicator for non-first segments */}
                              {isMulti && si > 0 && (() => {
                                const prevRate = segItems[si - 1].rate;
                                if (Number(item.rate) !== Number(prevRate)) {
                                  return (
                                    <span className={`ms-1 small ${Number(item.rate) > Number(prevRate) ? 'text-danger' : 'text-success'}`}>
                                      {Number(item.rate) > Number(prevRate) ? '▲' : '▼'}
                                    </span>
                                  );
                                }
                                return null;
                              })()}
                            </td>
                            <td className="text-center">{item.days}</td>
                            <td className="text-end fw-bold">{fmt(item.total)}</td>
                          </tr>
                        );
                      });

                      // Subtotal row for multi-segment types
                      if (isMulti) {
                        rows.push(
                          <tr key={`${desc}-subtotal`} className="inv-subtotal-row">
                            <td colSpan={5} className="text-end text-muted" style={{ fontSize: 11, paddingTop: 6, paddingBottom: 6 }}>
                              <i className="fas fa-equals me-1" />{desc} মোট ({segItems.length}টি সেগমেন্ট)
                            </td>
                            <td className="text-end fw-bold" style={{ paddingTop: 6, paddingBottom: 6 }}>
                              {fmt(subtotal)}
                            </td>
                          </tr>
                        );
                      }
                    });

                    return rows;
                  })()}
                </tbody>
              </table>
            ) : (
              <table className="inv-table">
                <thead><tr><th>{t('invoice.description')}</th><th className="text-end">{t('invoice.amount')}</th></tr></thead>
                <tbody><tr><td className="fw-bold">{bill ? t('invoice.monthlyBill') : t('invoice.projectedBill')} - {toMonthName(month)}</td><td className="text-end fw-bold">{fmt(totalAmount)}</td></tr></tbody>
              </table>
            )}
          </div>

          <div className="row mt-4">
            <div className="col-md-6">
              {/* Rate Change Info for this billing month */}
              {rateChangeLogs.length > 0 && (() => {
                const monthStart = month.slice(0, 7) + '-01';
                const monthEnd = month.slice(0, 7) + '-31';
                const logsThisMonth = rateChangeLogs.filter((l) => {
                  const d = String(l.effective_date).slice(0, 10);
                  return d >= monthStart && d <= monthEnd;
                });
                if (logsThisMonth.length === 0) return null;
                return (
                  <div className="no-print mb-3">
                    <div className="alert alert-warning border-0 py-2 small">
                      <strong><i className="fas fa-tags me-1" />এই মাসে রেট পরিবর্তন হয়েছে</strong>
                      {logsThisMonth.map((log) => (
                        <div key={log.id} className="mt-1 border-top pt-1">
                          <span className="badge bg-warning text-dark me-1">
                            {new Date(log.effective_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })} থেকে
                          </span>
                          {['iig', 'bdix', 'ggc', 'fna', 'cdn', 'bcdn', 'nttn'].map((k) => {
                            const cur = Number(log[`rate_${k}`] || 0);
                            const prev = Number(log[`prev_rate_${k}`] || 0);
                            if (cur === prev || (cur === 0 && prev === 0)) return null;
                            return (
                              <span key={k} className="me-2">
                                <strong>{k.toUpperCase()}:</strong> {prev.toLocaleString()} → {cur.toLocaleString()} Tk
                                <span className={cur > prev ? 'text-danger ms-1' : 'text-success ms-1'}>
                                  ({cur > prev ? '▲' : '▼'})
                                </span>
                              </span>
                            );
                          })}
                          {log.note && <div className="text-muted fst-italic mt-1">নোট: {log.note}</div>}
                        </div>
                      ))}
                      <div className="mt-1 text-muted" style={{ fontSize: 10 }}>
                        * Pro-rata calculation: রেট পরিবর্তনের তারিখ থেকে নতুন রেট apply হয়েছে
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
            <div className="col-md-6">
              <table className="table table-borderless inv-summary mb-0">
                <tbody>
                  <tr><td className="text-end text-muted">{t('invoice.previousDue')}</td><td className="text-end text-muted fw-semibold">{fmtTk(prevDue)}</td></tr>
                  <tr><td className="text-end">{t('invoice.currentBill')}</td><td className="text-end fw-bold">{fmtTk(runningBillAmount)}</td></tr>
                  {otcAmount > 0 && <tr><td className="text-end text-warning-emphasis">OTC Charge</td><td className="text-end fw-bold text-warning-emphasis">{fmtTk(otcAmount)}</td></tr>}
                  <tr><td className="text-end fw-bold" style={{ borderTop: '1px solid #e2e8f0', paddingTop: 12 }}>{t('invoice.subTotal')}</td><td className="text-end fw-bold" style={{ borderTop: '1px solid #e2e8f0', paddingTop: 12 }}>{fmtTk(prevDue + totalAmount)}</td></tr>
                  {hasLegacyAdjustment && (
                    <tr>
                      <td className="text-end text-muted">
                        {t('invoice.adjustment')}
                        {adjNote && <><br /><small className="fst-italic">({adjNote})</small></>}
                      </td>
                      <td className="text-end text-muted">{fmtTk(adj)}</td>
                    </tr>
                  )}
                  <tr><td className="text-end text-success">{t('invoice.paidThisMonth')}</td><td className="text-end fw-bold text-success">(-) {fmtTk(total_paid)}</td></tr>
                  <tr><td className="text-end text-info">সমন্বয় (Discount)</td><td className="text-end fw-bold text-info">(-) {fmtTk(total_discount)}</td></tr>
                  <tr className="inv-total-row"><td className="text-end">{netPayableRounded < 0 ? t('invoice.netAdvance') : t('invoice.netDue')}</td><td className="text-end">{fmtTk(Math.abs(netPayableRounded))}</td></tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="inv-footer text-center">
          <p className="m-0"><strong>{t('invoice.termsTitle')}</strong> {t('invoice.termsText')}</p>
          <p className="m-0 mt-1">{t('invoice.thankYou')}</p>
        </div>
      </div>

      <div className="text-center mt-4 mb-5 no-print">
        <button className="btn btn-light border px-4 rounded-pill" onClick={() => setData(null)}>
          <i className="fas fa-arrow-left me-1" />{t('invoice.back')}
        </button>
      </div>
    </div>
  );
};

export default Invoice;
