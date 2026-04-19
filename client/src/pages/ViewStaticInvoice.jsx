import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import html2canvas from 'html2canvas';
import { getInvoiceByBillId, sendInvoiceEmailByBillId } from '../services/resellerService';
import BrandLogo from '../components/BrandLogo';
import { t } from '../i18n';
import '../styles/Invoice.css';

const CURRENCY = '৳';

const fmt = (n, decimals = 2) => {
  const num = Number(n || 0);
  return num.toFixed(decimals).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
};

const StatusBadge = ({ type }) => {
  if (type === 'increase') return <span className="inv-badge badge-increase">{t('invoice.increase')}</span>;
  if (type === 'decrease') return <span className="inv-badge badge-decrease">{t('invoice.decrease')}</span>;
  if (type === 'standard') return <span className="inv-badge badge-standard">{t('invoice.currentPkg')}</span>;
  return <span className="inv-badge badge-standard">-</span>;
};

const toMonthName = (monthStr) => {
  if (!monthStr) return '';
  const d = new Date(String(monthStr).slice(0, 7) + '-15');
  return d.toLocaleDateString('bn-BD', { month: 'long', year: 'numeric' });
};

const toInvoiceDate = (isoDate) => {
  if (!isoDate) return '-';
  const d = new Date(isoDate);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleDateString('bn-BD', { day: '2-digit', month: 'short', year: 'numeric' });
};

const padInvoiceId = (id) => String(id || '').padStart(5, '0');

const ViewStaticInvoice = () => {
  const [searchParams] = useSearchParams();
  const billId = searchParams.get('id') || searchParams.get('billId') || searchParams.get('invoice_id') || '';

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [downloading, setDownloading] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const invoiceRef = useRef(null);

  const loadStaticInvoice = useCallback(async () => {
    if (!billId) {
      setError(t('invoice.staticInvalidRequest'));
      return;
    }
    setLoading(true);
    setError('');
    try {
      const result = await getInvoiceByBillId(billId);
      setData(result || null);
    } catch (e) {
      setError(e?.response?.data?.message || t('invoice.staticNotFound'));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [billId]);

  useEffect(() => {
    loadStaticInvoice();
  }, [loadStaticInvoice]);

  const downloadPNG = async () => {
    if (!invoiceRef.current || downloading || !data) return;
    setDownloading(true);
    try {
      const canvas = await html2canvas(invoiceRef.current, { scale: 2, useCORS: true });
      const link = document.createElement('a');
      const resellerName = data?.reseller?.name || data?.reseller?.reseller_name || 'reseller';
      link.download = `Invoice_${resellerName}_${String(data?.month || '').slice(0, 7)}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch (e) {
      console.error('[ViewStaticInvoice] html2canvas:', e);
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
    const target = window.prompt('ইমেইল ঠিকানা দিন (static invoice পাঠাতে):');
    if (!target) return;
    const toEmail = target.trim();
    if (!toEmail) return;

    setSendingEmail(true);
    try {
      const snapshotDataUrl = await captureInvoiceDataUrl();
      await sendInvoiceEmailByBillId(billId, { to_email: toEmail, snapshot_data_url: snapshotDataUrl });
      window.alert('Static invoice email সফলভাবে পাঠানো হয়েছে।');
    } catch (e) {
      window.alert(e?.response?.data?.message || 'Static invoice email পাঠানো যায়নি');
    } finally {
      setSendingEmail(false);
    }
  };

  const handleShareWhatsApp = async () => {
    try {
      const snapshotDataUrl = await captureInvoiceDataUrl();
      const directLink = `${window.location.origin}/view-static-invoice?id=${encodeURIComponent(billId)}`;
      const resName = data?.reseller?.name || data?.reseller?.reseller_name || `Reseller #${data?.bill?.reseller_id || ''}`;
      const monthYm = String(data?.month || data?.bill?.bill_month || '').slice(0, 7);
      const text = `Static Invoice: ${resName} (${monthYm})\n${directLink}`;

      const response = await fetch(snapshotDataUrl);
      const blob = await response.blob();
      const file = new File([blob], `static_invoice_${billId}.png`, { type: 'image/png' });

      if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], text, title: 'Static Invoice Snapshot' });
        return;
      }

      window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
      window.alert('আপনার ব্রাউজারে direct file share সাপোর্ট নেই। WhatsApp-এ static invoice link open করা হয়েছে।');
    } catch (e) {
      window.alert('WhatsApp share ব্যর্থ হয়েছে');
    }
  };

  const normalized = useMemo(() => {
    if (!data) return null;
    const reseller = data.reseller || {};
    const bill = data.bill || {};
    const items = Array.isArray(data.items) ? data.items : [];
    const totalPaid = Number(data.total_paid || 0);
    const totalDiscount = Number(data.total_discount || 0);
    const totalAmount = Number(bill.final_amount ?? bill.amount ?? 0);
    const prevDue = Number(bill.previous_due ?? reseller.due_amount ?? 0);
    const adjustment = Number(bill.adjustment ?? 0);
    const adjustmentNote = bill.adjustment_note || '';
    const hasLegacyAdjustment = Math.abs(adjustment) > 0.0001;
    const netPayable = Number((prevDue + totalAmount + adjustment - totalPaid - totalDiscount).toFixed(2));

    const otcItems = Array.isArray(items) ? items.filter((item) => item?.desc === 'OTC') : [];
    const displayItems = Array.isArray(items) ? items.filter((item) => item?.desc !== 'OTC') : [];
    const otcAmount = otcItems.reduce((sum, item) => sum + Number(item?.total || 0), 0);
    const runningBillAmount = Math.max(0, Number(totalAmount || 0) - otcAmount);
    const typeCounts = {};
    displayItems.forEach((item) => {
      typeCounts[item?.desc] = (typeCounts[item?.desc] || 0) + 1;
    });

    return {
      reseller,
      bill,
      items: displayItems,
      otcAmount,
      runningBillAmount,
      totalPaid,
      totalDiscount,
      totalAmount,
      prevDue,
      adjustment,
      adjustmentNote,
      hasLegacyAdjustment,
      netPayable,
      typeCounts
    };
  }, [data]);

  if (loading) return <div className="container py-5 text-center">{t('invoice.loading')}</div>;
  if (error || !normalized) return <div className="container py-5 text-center text-danger">{error || t('invoice.staticNotFound')}</div>;

  const { reseller, bill, items, otcAmount, runningBillAmount, totalPaid, totalDiscount, totalAmount, prevDue, adjustment, adjustmentNote, hasLegacyAdjustment, netPayable, typeCounts } = normalized;
  const monthName = toMonthName(data?.month || bill?.bill_month);
  const invoiceDate = toInvoiceDate(bill?.created_at || data?.created_at);
  const typeShown = {};

  return (
    <div className="container-fluid py-3 reseller-page">
      <div className={`inv-container ${netPayable <= 0 ? 'status-paid' : 'status-due'}`} id="invoiceContent" ref={invoiceRef} style={{ maxWidth: 850, margin: '0 auto' }}>
        <div className={`inv-watermark${netPayable <= 0 ? ' paid' : ''}`}>{netPayable <= 0 ? t('invoice.paid') : t('invoice.due')}</div>

        <div className="inv-header d-flex justify-content-between align-items-center">
          <div>
            <div className="inv-brand">
              <BrandLogo className="inv-logo" alt="Speed Net Khulna" />
            </div>
            <p className="text-muted small mb-0 mt-1">{t('invoice.providerTag')}</p>
          </div>
          <div className="text-end">
            <div className="inv-label">{t('invoice.title')}</div>
            <div className="inv-number">#{padInvoiceId(bill?.id)}</div>
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
                {reseller.company_name || '-'}<br />
                {reseller.pop_location || '-'}<br />
                {t('invoice.contact')}: {reseller.phone || reseller.contact_no || '-'}
              </div>
            </div>
          </div>

          <div className="inv-meta row mb-4">
            <div className="col-4 border-end"><small>{t('invoice.invoiceDate')}</small><div className="inv-meta-val">{invoiceDate}</div></div>
            <div className="col-4 border-end text-center"><small>{t('invoice.billingMonth')}</small><div className="inv-meta-val text-primary-custom">{monthName}</div></div>
            <div className="col-4 text-end"><small>{t('invoice.totalBill')}</small><div className="inv-meta-val">{fmt(totalAmount)} {CURRENCY}</div></div>
          </div>

          <div className="table-responsive">
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
                {items.map((item, idx) => {
                  const isFirst = !typeShown[item.desc];
                  if (isFirst) typeShown[item.desc] = true;
                  return (
                    <tr key={idx}>
                      {isFirst && <td rowSpan={typeCounts[item.desc] || 1} className="fw-bold align-middle">{item.desc}</td>}
                      <td className="text-center"><StatusBadge type={item.change_type} /></td>
                      <td><small className="text-muted">{item.date_range}</small></td>
                      <td className="text-center">{item.bw}</td>
                      <td className="text-center">{fmt(item.rate)}</td>
                      <td className="text-center">{item.days}</td>
                      <td className="text-end fw-bold">{fmt(item.total)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="row mt-4">
            <div className="col-md-6" />
            <div className="col-md-6">
              <table className="table table-borderless inv-summary mb-0">
                <tbody>
                  <tr><td className="text-end text-muted">{t('invoice.previousDue')}</td><td className="text-end text-muted fw-semibold">{fmt(prevDue)} {CURRENCY}</td></tr>
                  <tr><td className="text-end">{t('invoice.currentBill')}</td><td className="text-end fw-bold">{fmt(runningBillAmount)} {CURRENCY}</td></tr>
                  {otcAmount > 0 && <tr><td className="text-end text-warning-emphasis">OTC Charge</td><td className="text-end fw-bold text-warning-emphasis">{fmt(otcAmount)} {CURRENCY}</td></tr>}
                  <tr><td className="text-end fw-bold" style={{ borderTop: '1px solid #e2e8f0', paddingTop: 12 }}>{t('invoice.subTotal')}</td><td className="text-end fw-bold" style={{ borderTop: '1px solid #e2e8f0', paddingTop: 12 }}>{fmt(prevDue + totalAmount)} {CURRENCY}</td></tr>
                  {hasLegacyAdjustment && (
                    <tr>
                      <td className="text-end text-muted">
                        {t('invoice.adjustment')}
                        {adjustmentNote && <><br /><small className="fst-italic">({adjustmentNote})</small></>}
                      </td>
                      <td className="text-end text-muted">{fmt(adjustment)} {CURRENCY}</td>
                    </tr>
                  )}
                  <tr><td className="text-end text-success">{t('invoice.paidThisMonth')}</td><td className="text-end fw-bold text-success">(-) {fmt(totalPaid)} {CURRENCY}</td></tr>
                  <tr><td className="text-end text-info">সমন্বয় (Discount)</td><td className="text-end fw-bold text-info">(-) {fmt(totalDiscount)} {CURRENCY}</td></tr>
                  <tr className="inv-total-row"><td className="text-end">{netPayable < 0 ? t('invoice.netAdvance') : t('invoice.netDueEndMonth')}</td><td className="text-end">{fmt(Math.abs(netPayable))} {CURRENCY}</td></tr>
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
        <button onClick={() => window.print()} className="btn btn-dark px-4 rounded-pill shadow-sm me-2"><i className="fas fa-print me-2" /> {t('invoice.printInvoice')}</button>
        <button onClick={downloadPNG} disabled={downloading} className="btn btn-outline-dark px-4 rounded-pill shadow-sm me-2">
          <i className={`fas ${downloading ? 'fa-spinner fa-spin' : 'fa-download'} me-2`} />
          {downloading ? t('invoice.processing') : t('invoice.downloadPng')}
        </button>
        <button onClick={handleSendEmail} disabled={sendingEmail} className="btn btn-primary px-4 rounded-pill shadow-sm me-2">
          <i className={`fas ${sendingEmail ? 'fa-spinner fa-spin' : 'fa-envelope'} me-2`} />
          Email
        </button>
        <button onClick={handleShareWhatsApp} className="btn btn-success px-4 rounded-pill shadow-sm me-2">
          <i className="fab fa-whatsapp me-2" />
          WhatsApp
        </button>
        <button onClick={() => window.close()} className="btn btn-light border px-4 rounded-pill">{t('invoice.closeWindow')}</button>
      </div>
    </div>
  );
};

export default ViewStaticInvoice;
