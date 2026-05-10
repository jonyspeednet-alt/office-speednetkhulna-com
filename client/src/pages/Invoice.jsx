import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import html2canvas from 'html2canvas';
import {
  getInvoice, getInvoiceByBillId, getResellers,
  sendInvoiceEmail, sendInvoiceEmailByBillId, getResellerRateChangeLogs
} from '../services/resellerService';
import BrandLogo from '../components/BrandLogo';
import { t } from '../i18n';
import '../styles/Invoice.css';

/* ── helpers ─────────────────────────────────────────────── */
const fmt = (n, d = 2) => Number(n || 0).toFixed(d).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const fmtTk = (n, d = 2) => `${fmt(n, d)} ৳`;
const toMonthName = (s) => {
  if (!s) return '';
  return new Date(s.slice(0, 7) + '-15').toLocaleDateString('bn-BD', { month: 'long', year: 'numeric' });
};
const todayStr = () => new Date().toLocaleDateString('bn-BD', { day: '2-digit', month: 'short', year: 'numeric' });
const getDhakaMonth = () => {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka', year: 'numeric', month: '2-digit' }).formatToParts(new Date());
  const y = p.find(x => x.type === 'year')?.value;
  const m = p.find(x => x.type === 'month')?.value;
  return y && m ? `${y}-${m}` : new Date().toISOString().slice(0, 7);
};

/* BW type colour map */
const BW_COLORS = {
  IIG: { bg: '#ede9fe', text: '#5b21b6', dot: '#7c3aed' },
  BDIX: { bg: '#d1fae5', text: '#065f46', dot: '#059669' },
  GGC: { bg: '#fef3c7', text: '#92400e', dot: '#d97706' },
  FNA: { bg: '#e0f2fe', text: '#075985', dot: '#0284c7' },
  CDN: { bg: '#fee2e2', text: '#991b1b', dot: '#dc2626' },
  BCDN: { bg: '#f1f5f9', text: '#334155', dot: '#64748b' },
  NTTN: { bg: '#fdf4ff', text: '#6b21a8', dot: '#9333ea' },
  'Real IP': { bg: '#fff7ed', text: '#9a3412', dot: '#ea580c' },
  OTC: { bg: '#fefce8', text: '#713f12', dot: '#ca8a04' },
};
const bwColor = (desc) => BW_COLORS[desc] || { bg: '#f8fafc', text: '#334155', dot: '#94a3b8' };

const StatusBadge = ({ type }) => {
  if (type === 'increase') return <span className="inv-badge badge-increase">{t('invoice.increase')}</span>;
  if (type === 'decrease') return <span className="inv-badge badge-decrease">{t('invoice.decrease')}</span>;
  if (type === 'standard') return <span className="inv-badge badge-standard">{t('invoice.currentPkg')}</span>;
  return null;
};

/* ── BW Breakdown Card ───────────────────────────────────── */
const BwBreakdownCard = ({ items }) => {
  if (!items || items.length === 0) return null;

  // Group by desc
  const groups = {};
  items.forEach(item => {
    if (!groups[item.desc]) groups[item.desc] = [];
    groups[item.desc].push(item);
  });

  return (
    <div className="inv-breakdown-section mb-4">
      <div className="inv-section-title">
        <i className="fas fa-layer-group me-2" />বিল বিস্তারিত (Breakdown)
      </div>
      <div className="inv-breakdown-grid">
        {Object.entries(groups).map(([desc, rows]) => {
          const c = bwColor(desc);
          const subtotal = rows.reduce((s, r) => s + Number(r.total || 0), 0);
          const hasMultiSegment = rows.length > 1;
          return (
            <div key={desc} className="inv-bw-card" style={{ '--card-bg': c.bg, '--card-text': c.text, '--card-dot': c.dot }}>
              <div className="inv-bw-card-header">
                <span className="inv-bw-dot" />
                <span className="inv-bw-label">{desc}</span>
                <span className="inv-bw-subtotal">{fmtTk(subtotal)}</span>
              </div>
              {rows.map((row, i) => (
                <div key={i} className={`inv-bw-row ${hasMultiSegment ? 'multi' : ''}`}>
                  <div className="inv-bw-row-meta">
                    {hasMultiSegment && <StatusBadge type={row.change_type} />}
                    <span className="inv-bw-daterange">
                      <i className="far fa-calendar-alt me-1" />{row.date_range}
                    </span>
                  </div>
                  <div className="inv-bw-row-calc">
                    <span className="inv-bw-chip">{row.bw} {desc === 'Real IP' ? 'IP' : 'Mbps'}</span>
                    <span className="inv-bw-op">×</span>
                    <span className="inv-bw-chip">{fmt(row.rate)} ৳</span>
                    <span className="inv-bw-op">×</span>
                    <span className="inv-bw-chip">{row.days} দিন</span>
                    <span className="inv-bw-op">=</span>
                    <span className="inv-bw-total">{fmtTk(row.total)}</span>
                  </div>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
};

/* ── Rate Change Banner ──────────────────────────────────── */
const RateChangeBanner = ({ rateChangeLogs, month }) => {
  if (!rateChangeLogs?.length) return null;
  const ms = month.slice(0, 7) + '-01';
  const me = month.slice(0, 7) + '-31';
  const logs = rateChangeLogs.filter(l => {
    const d = String(l.effective_date).slice(0, 10);
    return d >= ms && d <= me;
  });
  if (!logs.length) return null;
  return (
    <div className="inv-rate-change-banner no-print">
      <div className="inv-rate-change-title">
        <i className="fas fa-tags me-1" />এই মাসে রেট পরিবর্তন হয়েছে
      </div>
      {logs.map(log => (
        <div key={log.id} className="inv-rate-change-row">
          <span className="inv-rate-change-date">
            <i className="far fa-calendar-check me-1" />
            {new Date(log.effective_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })} থেকে কার্যকর
          </span>
          <div className="inv-rate-change-chips">
            {['iig', 'bdix', 'ggc', 'fna', 'cdn', 'bcdn', 'nttn'].map(k => {
              const cur = Number(log[`rate_${k}`] || 0);
              const prev = Number(log[`prev_rate_${k}`] || 0);
              if (cur === prev || (cur === 0 && prev === 0)) return null;
              return (
                <span key={k} className={`inv-rate-chip ${cur > prev ? 'up' : 'down'}`}>
                  <strong>{k.toUpperCase()}</strong>
                  {prev.toLocaleString()} → {cur.toLocaleString()} ৳
                  <span>{cur > prev ? '▲' : '▼'}</span>
                </span>
              );
            })}
          </div>
          {log.note && <div className="inv-rate-change-note"><i className="fas fa-sticky-note me-1" />{log.note}</div>}
        </div>
      ))}
      <div className="inv-rate-change-note mt-1">
        * Pro-rata: রেট পরিবর্তনের তারিখ থেকে নতুন রেট apply হয়েছে
      </div>
    </div>
  );
};

/* ── Main Component ──────────────────────────────────────── */
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
    getResellers().then(list => { setResellers(Array.isArray(list) ? list : []); setResellersLoaded(true); }).catch(() => { });
  }, [resellersLoaded]);

  const loadInvoice = useCallback(async () => {
    setLoading(true);
    try {
      if (billId) {
        const r = await getInvoiceByBillId(billId);
        setData(r);
        setResellerId(String(r?.reseller?.id || ''));
        if (r?.month) setMonth(String(r.month).slice(0, 7));
        return;
      }
      if (!resellerId) return;
      setData(await getInvoice(resellerId, `${month}-01`));
    } catch (e) { console.error('[Invoice]', e); }
    finally { setLoading(false); }
  }, [resellerId, month, billId]);

  useEffect(() => {
    if (billId) { loadInvoice(); return; }
    if (resellerId && month) loadInvoice();
  }, [billId, resellerId, month, loadInvoice]);

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
      const a = document.createElement('a');
      a.download = `Invoice_${data?.reseller?.name || 'reseller'}_${month}.png`;
      a.href = canvas.toDataURL('image/png');
      a.click();
    } catch (e) { console.error(e); } finally { setDownloading(false); }
  };

  const captureDataUrl = async () => {
    if (!invoiceRef.current) throw new Error('not ready');
    const c = await html2canvas(invoiceRef.current, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });
    return c.toDataURL('image/png');
  };

  const handleSendEmail = async () => {
    const to = window.prompt('ইমেইল ঠিকানা দিন:');
    if (!to?.trim()) return;
    setSendingEmail(true);
    try {
      const snap = await captureDataUrl();
      if (bill?.id) await sendInvoiceEmailByBillId(bill.id, { to_email: to.trim(), snapshot_data_url: snap });
      else if (resellerId) await sendInvoiceEmail(resellerId, { to_email: to.trim(), month, snapshot_data_url: snap });
      window.alert('Invoice email সফলভাবে পাঠানো হয়েছে।');
    } catch (e) { window.alert(e?.response?.data?.message || 'Email পাঠানো যায়নি'); }
    finally { setSendingEmail(false); }
  };

  const handleShareWhatsApp = async () => {
    try {
      const snap = await captureDataUrl();
      const name = data?.reseller?.name || `Reseller ${resellerId}`;
      const link = bill?.id
        ? `${window.location.origin}/view-static-invoice?id=${bill.id}`
        : `${window.location.origin}/invoice?resellerId=${encodeURIComponent(resellerId)}&month=${encodeURIComponent(month)}`;
      const text = `Invoice: ${name} (${month})\n${link}`;
      const blob = await (await fetch(snap)).blob();
      const file = new File([blob], `invoice_${resellerId}_${month}.png`, { type: 'image/png' });
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], text, title: 'Invoice' }); return;
      }
      window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
    } catch { window.alert('WhatsApp share ব্যর্থ হয়েছে'); }
  };

  const SelectorBar = () => (
    <div className="d-flex flex-wrap align-items-center gap-2">
      <select className="form-select form-select-sm shadow-sm border-0" style={{ width: 'auto', minWidth: 180 }}
        value={resellerId} onChange={e => { setResellerId(e.target.value); setBillId(''); setData(null); }}>
        <option value="">{t('invoice.selectReseller')}</option>
        {resellers.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
      </select>
      <input type="month" className="form-control form-control-sm shadow-sm border-0" style={{ width: 'auto' }}
        value={month} onChange={e => { setMonth(e.target.value); setBillId(''); setData(null); }} />
    </div>
  );

  if (!data) return (
    <div className="container-fluid py-3 reseller-page">
      <div className="card p-4">
        <h5 className="fw-bold mb-3"><i className="fas fa-file-invoice me-2 text-primary" />{t('invoice.title')}</h5>
        {loading && <div className="small text-muted mb-2"><span className="spinner-border spinner-border-sm me-1" />{t('invoice.loading')}</div>}
        <SelectorBar />
      </div>
    </div>
  );

  const { reseller, bill, items = [], total_paid = 0, total_discount = 0 } = data;
  const otcItems = items.filter(i => i?.desc === 'OTC');
  const displayItems = items.filter(i => i?.desc !== 'OTC');
  const otcAmount = otcItems.reduce((s, i) => s + Number(i.total || 0), 0);
  const dynamicTotal = items.reduce((s, i) => s + Number(i.total || 0), 0);
  const totalAmount = parseFloat(bill?.final_amount ?? (dynamicTotal > 0 ? dynamicTotal : (reseller?.projected_bill ?? 0)));
  const runningBillAmount = Math.max(0, totalAmount - otcAmount);
  const adj = parseFloat(bill?.adjustment ?? 0);
  const adjNote = bill?.adjustment_note ?? '';
  const prevDue = parseFloat(bill?.previous_due ?? reseller?.due_amount ?? 0);
  const netPayable = prevDue + totalAmount + adj - total_paid - total_discount;
  const netPayableRounded = Number(netPayable.toFixed(2));
  const hasLegacyAdj = Math.abs(adj) > 0.0001;

  return (
    <div className="container-fluid py-3 reseller-page">
      {/* ── Toolbar ── */}
      <div className="d-flex justify-content-between align-items-center mb-3 no-print flex-wrap gap-2" style={{ maxWidth: 900, margin: '0 auto 16px' }}>
        <SelectorBar />
        <div className="d-flex gap-2 align-items-center flex-wrap">
          {bill
            ? <a href={`/view-static-invoice?id=${bill.id}`} target="_blank" rel="noreferrer" className="btn btn-success btn-sm rounded-pill shadow-sm"><i className="fas fa-check-circle me-1" />{t('invoice.finalBillView')}</a>
            : <span className="badge bg-warning text-dark rounded-pill px-3 py-2"><i className="fas fa-clock me-1" />{t('invoice.projectedView')}</span>
          }
          <button className="btn btn-dark btn-sm rounded-pill shadow-sm" onClick={() => window.print()}><i className="fas fa-print me-1" />{t('invoice.print')}</button>
          <button className="btn btn-outline-dark btn-sm rounded-pill shadow-sm" onClick={downloadPNG} disabled={downloading}>
            {downloading ? <span className="spinner-border spinner-border-sm me-1" /> : <i className="fas fa-download me-1" />}PNG
          </button>
          <button className="btn btn-primary btn-sm rounded-pill shadow-sm" onClick={handleSendEmail} disabled={sendingEmail}>
            {sendingEmail ? <span className="spinner-border spinner-border-sm me-1" /> : <i className="fas fa-envelope me-1" />}Email
          </button>
          <button className="btn btn-success btn-sm rounded-pill shadow-sm" onClick={handleShareWhatsApp}>
            <i className="fab fa-whatsapp me-1" />WhatsApp
          </button>
        </div>
      </div>

      {/* ── Invoice Card ── */}
      <div className={`inv-container ${netPayableRounded <= 0 ? 'status-paid' : 'status-due'}`} ref={invoiceRef} style={{ maxWidth: 900, margin: '0 auto' }}>
        <div className={`inv-watermark${netPayableRounded <= 0 ? ' paid' : ''}`}>
          {netPayableRounded <= 0 ? t('invoice.paid') : t('invoice.due')}
        </div>

        {/* Header */}
        <div className="inv-header d-flex justify-content-between align-items-center">
          <div>
            <div className="inv-brand"><BrandLogo className="inv-logo" alt="Speed Net Khulna" /></div>
            <p className="text-muted small mb-0 mt-1">{t('invoice.providerTag')}</p>
          </div>
          <div className="text-end">
            <div className="inv-label">{t('invoice.billingMonth')}</div>
            <div className="inv-number">{toMonthName(month)}</div>
            {!bill && <span className="badge bg-warning text-dark mt-1" style={{ fontSize: 10 }}>Projected</span>}
            {bill && <span className="badge bg-success text-white mt-1" style={{ fontSize: 10 }}>Finalized</span>}
          </div>
        </div>

        <div className="inv-body">
          {/* From / To */}
          <div className="row mb-4">
            <div className="col-6">
              <div className="inv-info-label">{t('invoice.from')}</div>
              <div className="inv-info-text">
                <strong>Speed Net Khulna</strong><br />
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

          {/* Meta strip */}
          <div className="inv-meta row mb-4">
            <div className="col-4 border-end">
              <small>{t('invoice.invoiceDate')}</small>
              <div className="inv-meta-val">{todayStr()}</div>
            </div>
            <div className="col-4 border-end text-center">
              <small>{t('invoice.billingMonth')}</small>
              <div className="inv-meta-val text-primary-custom">{toMonthName(month)}</div>
            </div>
            <div className="col-4 text-end">
              <small>{t('invoice.totalBill')}</small>
              <div className="inv-meta-val">{fmtTk(totalAmount)}</div>
            </div>
          </div>

          {/* ── BW Breakdown Cards ── */}
          {displayItems.length > 0
            ? <BwBreakdownCard items={displayItems} />
            : (
              <div className="inv-no-breakdown mb-4">
                <i className="fas fa-info-circle me-2 text-muted" />
                <span className="text-muted">{bill ? t('invoice.monthlyBill') : t('invoice.projectedBill')} — {toMonthName(month)}</span>
                <span className="fw-bold ms-3">{fmtTk(totalAmount)}</span>
              </div>
            )
          }

          {/* OTC separate row */}
          {otcAmount > 0 && (
            <div className="inv-otc-row mb-4">
              <span className="inv-bw-dot" style={{ background: BW_COLORS.OTC.dot }} />
              <span className="fw-bold">OTC Charge</span>
              <span className="ms-auto fw-bold">{fmtTk(otcAmount)}</span>
            </div>
          )}

          {/* Rate change banner */}
          <RateChangeBanner rateChangeLogs={rateChangeLogs} month={month} />

          {/* Summary */}
          <div className="row mt-2">
            <div className="col-md-5 offset-md-7">
              <div className="inv-summary-card">
                <div className="inv-summary-row">
                  <span className="text-muted">{t('invoice.previousDue')}</span>
                  <span className="text-muted fw-semibold">{fmtTk(prevDue)}</span>
                </div>
                <div className="inv-summary-row">
                  <span>{t('invoice.currentBill')}</span>
                  <span className="fw-bold">{fmtTk(runningBillAmount)}</span>
                </div>
                {otcAmount > 0 && (
                  <div className="inv-summary-row">
                    <span className="text-warning-emphasis">OTC Charge</span>
                    <span className="fw-bold text-warning-emphasis">{fmtTk(otcAmount)}</span>
                  </div>
                )}
                <div className="inv-summary-row subtotal">
                  <span className="fw-bold">{t('invoice.subTotal')}</span>
                  <span className="fw-bold">{fmtTk(prevDue + totalAmount)}</span>
                </div>
                {hasLegacyAdj && (
                  <div className="inv-summary-row">
                    <span className="text-muted">
                      {t('invoice.adjustment')}
                      {adjNote && <><br /><small className="fst-italic">({adjNote})</small></>}
                    </span>
                    <span className="text-muted">{fmtTk(adj)}</span>
                  </div>
                )}
                <div className="inv-summary-row">
                  <span className="text-success">{t('invoice.paidThisMonth')}</span>
                  <span className="fw-bold text-success">(-) {fmtTk(total_paid)}</span>
                </div>
                {total_discount > 0 && (
                  <div className="inv-summary-row">
                    <span className="text-info">সমন্বয় (Discount)</span>
                    <span className="fw-bold text-info">(-) {fmtTk(total_discount)}</span>
                  </div>
                )}
                <div className={`inv-summary-row total ${netPayableRounded <= 0 ? 'paid' : 'due'}`}>
                  <span>{netPayableRounded < 0 ? t('invoice.netAdvance') : t('invoice.netDue')}</span>
                  <span>{fmtTk(Math.abs(netPayableRounded))}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
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
