import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import html2canvas from 'html2canvas';
import { getMonthlySummary, updateMonthlySummaryPayDate } from '../services/resellerService';
import '../styles/MonthlySummary.css';

const money = (value) => Number(value || 0).toLocaleString('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

const moneyTk = (value) => `${money(value)} টাকা`;
const PARTNER_TABS = {
  distribution_partner: 'Distribution Partner',
  channel_partner: 'Channel Partner',
  mac_partner: 'MAC Partner'
};

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

const MonthlySummary = () => {
  const [month, setMonth] = useState(getDhakaMonth());
  const [activePartnerType, setActivePartnerType] = useState('distribution_partner');
  const [rows, setRows] = useState([]);
  const [search, setSearch] = useState('');
  const [totals, setTotals] = useState({ projected: 0, paid: 0, discount: 0, due: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [snapshotLoading, setSnapshotLoading] = useState(false);

  const snapshotRef = useRef(null);
  const tableWrapRef = useRef(null);

  const load = async (targetMonth = month) => {
    try {
      setLoading(true);
      setError('');
      const data = await getMonthlySummary(`${targetMonth}-01`, {
        partner_type: activePartnerType
      });

      if (Array.isArray(data)) {
        const legacyRows = data.map((item) => ({
          ...item,
          projected: Number(item.projected_bill || 0),
          prev_due: 0,
          total_bill: Number(item.total_due || 0),
          paid: Number(item.paid_in_month || 0),
          discount: Number(item.discount_in_month || 0),
          new_due: Number(item.total_due || 0),
          company: item.company || '',
          contact: item.contact || ''
        }));

        const legacyTotals = legacyRows.reduce((acc, item) => ({
          projected: acc.projected + Number(item.projected || 0),
          paid: acc.paid + Number(item.paid || 0),
          discount: acc.discount + Number(item.discount || 0),
          due: acc.due + Number(item.new_due || 0)
        }), { projected: 0, paid: 0, discount: 0, due: 0 });

        setRows(legacyRows);
        setTotals(legacyTotals);
        return;
      }

      setRows(Array.isArray(data?.rows) ? data.rows : []);
      setTotals(data?.totals || { projected: 0, paid: 0, discount: 0, due: 0 });
    } catch (err) {
      setRows([]);
      setTotals({ projected: 0, paid: 0, discount: 0, due: 0 });
      setError(err?.response?.data?.message || err?.message || 'ডাটা লোড করতে সমস্যা হয়েছে');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(month);
  }, [month, activePartnerType]);

  useEffect(() => {
    const beforePrint = () => {
      const wrap = tableWrapRef.current;
      const table = document.getElementById('summaryTable');
      if (!wrap || !table) return;

      const pageWidth = 1120;
      const pageHeight = 770;
      const contentWidth = Math.max(wrap.scrollWidth, table.scrollWidth, wrap.getBoundingClientRect().width);
      const contentHeight = Math.max(wrap.scrollHeight, table.scrollHeight, wrap.getBoundingClientRect().height);

      const widthScale = pageWidth / Math.max(contentWidth, 1);
      const heightScale = pageHeight / Math.max(contentHeight, 1);
      const scale = Math.max(0.68, Math.min(1, widthScale, heightScale));
      document.documentElement.style.setProperty('--ms-print-scale', String(Number(scale.toFixed(3))));
    };

    const afterPrint = () => {
      document.documentElement.style.removeProperty('--ms-print-scale');
    };

    window.addEventListener('beforeprint', beforePrint);
    window.addEventListener('afterprint', afterPrint);

    return () => {
      window.removeEventListener('beforeprint', beforePrint);
      window.removeEventListener('afterprint', afterPrint);
    };
  }, []);

  const filteredRows = useMemo(() => {
    const key = search.trim().toLowerCase();
    if (!key) return rows;

    return rows.filter((item) => {
      const haystack = `${item.name || ''} ${item.company || ''} ${item.contact || ''}`.toLowerCase();
      return haystack.includes(key);
    });
  }, [rows, search]);

  const changePayDate = async (id, value) => {
    try {
      await updateMonthlySummaryPayDate(id, value);
      setRows((prev) => prev.map((item) => (
        Number(item.id) === Number(id)
          ? { ...item, next_pay_date: value || null }
          : item
      )));
    } catch {
      alert('তারিখ আপডেট করতে সমস্যা হয়েছে');
    }
  };

  const exportToExcel = () => {
    const table = document.getElementById('summaryTable');
    if (!table) return;

    const html = table.outerHTML
      .replace(/<input[^>]*>/g, '')
      .replace(/<a[^>]*>/g, '')
      .replace(/<\/a>/g, '');

    const link = document.createElement('a');
    link.href = `data:application/vnd.ms-excel,${encodeURIComponent(html)}`;
    link.download = `Monthly_Summary_${month}.xls`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const downloadSnapshot = async () => {
    const target = snapshotRef.current;
    if (!target || snapshotLoading) return;

    try {
      setSnapshotLoading(true);
      const canvas = await html2canvas(target, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff'
      });

      const link = document.createElement('a');
      link.download = `Monthly_Summary_${month}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch (err) {
      console.error('[MonthlySummary] snapshot failed', err);
      alert('Snapshot নিতে সমস্যা হয়েছে');
    } finally {
      setSnapshotLoading(false);
    }
  };

  return (
    <div className="monthly-summary-page">
      <div ref={snapshotRef}>
        <div className="summary-header no-print">
          <div>
            <h3 className="summary-title">
              <i className="fas fa-chart-pie me-2" />
              মাসিক বিলিং সামারি
            </h3>
            <p className="summary-subtitle">{PARTNER_TABS[activePartnerType]} এর আলাদা বিল, বকেয়া, জমা ও সমন্বয়</p>
          </div>

          <div className="summary-controls">
            <div className="summary-search">
              <i className="fas fa-search" />
              <input
                type="text"
                className="form-control form-control-sm"
                placeholder="রিসেলার খুঁজুন..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <input
              type="month"
              className="form-control form-control-sm summary-month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
            />

            <button type="button" onClick={exportToExcel} className="btn btn-success btn-sm">
              <i className="fas fa-file-excel me-1" />Export
            </button>

            <button type="button" onClick={downloadSnapshot} className="btn btn-outline-dark btn-sm" disabled={snapshotLoading}>
              {snapshotLoading ? <><span className="spinner-border spinner-border-sm me-1" />Snapshot...</> : <><i className="fas fa-camera me-1" />Snapshot PNG</>}
            </button>

            <button type="button" onClick={() => window.print()} className="btn btn-dark btn-sm">
              <i className="fas fa-print" />
            </button>
          </div>
        </div>

        <div className="summary-partner-tabs no-print">
          {Object.entries(PARTNER_TABS).map(([key, label]) => (
            <button
              key={key}
              type="button"
              className={`btn btn-sm ${activePartnerType === key ? 'btn-dark' : 'btn-outline-dark'}`}
              onClick={() => setActivePartnerType(key)}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="summary-metrics no-print">
          <div className="summary-metric">
            <div className="summary-metric-label">Projected Bill</div>
            <div className="summary-metric-value">{moneyTk(totals.projected)}</div>
          </div>
          <div className="summary-metric">
            <div className="summary-metric-label">Collection</div>
            <div className="summary-metric-value text-success">{moneyTk(totals.paid)}</div>
          </div>
          <div className="summary-metric">
            <div className="summary-metric-label">Discount</div>
            <div className="summary-metric-value text-info">{moneyTk(totals.discount)}</div>
          </div>
          <div className="summary-metric">
            <div className="summary-metric-label">Outstanding Due</div>
            <div className="summary-metric-value text-danger">{moneyTk(totals.due)}</div>
          </div>
        </div>

        <div className="summary-table-wrap" ref={tableWrapRef}>
          {error && <div className="alert alert-danger py-2 mb-2">{error}</div>}
          {loading && <div className="summary-loading">ডাটা লোড হচ্ছে...</div>}

          <div className="table-responsive">
            <table className="table table-hover summary-table mb-0" id="summaryTable">
              <thead>
                <tr>
                  <th>রিসেলার</th>
                  <th className="text-end">Projected Bill</th>
                  <th className="text-end">Previous Due</th>
                  <th className="text-end">Total Bill (Due)</th>
                  <th className="text-end text-success">Total Paid</th>
                  <th className="text-end text-info">সমন্বয় (Discount)</th>
                  <th className="text-end text-danger">New Due</th>
                  <th className="text-center summary-next-pay-col">Next Pay Date</th>
                </tr>
              </thead>

              <tbody>
                {filteredRows.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <Link to={`/reseller-profile/${row.id}`} className="summary-name">{row.name}</Link>
                      <div className="summary-company">{row.company || ''}</div>
                    </td>

                    <td className="text-end fw-semibold">
                      <Link to={`/invoice?resellerId=${row.id}&month=${month}`} target="_blank" rel="noreferrer" className="text-decoration-none text-primary">
                        {money(row.projected)}
                      </Link>
                    </td>

                    <td className="text-end text-muted fw-semibold">
                      <Link to={`/reseller-profile/${row.id}`} target="_blank" rel="noreferrer" className="text-decoration-none text-muted">
                        {money(row.prev_due)}
                      </Link>
                    </td>

                    <td className="text-end fw-bold">{money(row.total_bill)}</td>

                    <td className="text-end fw-semibold">
                      <Link to={`/billing-logs?reseller_id=${row.id}&month=${month}`} target="_blank" rel="noreferrer" className="text-decoration-none text-success">
                        {money(row.paid)}
                      </Link>
                    </td>

                    <td className="text-end text-info fw-semibold">
                      <Link to={`/billing-logs?reseller_id=${row.id}&month=${month}`} target="_blank" rel="noreferrer" className="text-decoration-none text-info">
                        {money(row.discount || 0)}
                      </Link>
                    </td>

                    <td className="text-end fw-bold text-danger">{money(row.new_due)}</td>

                    <td className="text-center">
                      <input
                        type="date"
                        className="summary-date-input"
                        value={row.next_pay_date ? String(row.next_pay_date).slice(0, 10) : ''}
                        onChange={(e) => changePayDate(row.id, e.target.value)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>

              <tfoot>
                <tr className="table-light fw-bold">
                  <td className="text-end">সর্বমোট (Total):</td>
                  <td className="text-end">{money(totals.projected)}</td>
                  <td className="text-end">-</td>
                  <td className="text-end">-</td>
                  <td className="text-end text-success">{money(totals.paid)}</td>
                  <td className="text-end text-info">{money(totals.discount || 0)}</td>
                  <td className="text-end text-danger">{money(totals.due)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MonthlySummary;
