import React, { useEffect, useState } from 'react';
import { getBillingLogs, getResellers } from '../services/resellerService';
import { t } from '../i18n';

const BillingLogs = () => {
  const [rows, setRows] = useState([]);
  const [resellers, setResellers] = useState([]);
  const [filters, setFilters] = useState({ reseller_id: '', month: new Date().toISOString().slice(0, 7) });

  const load = async () => {
    const data = await getBillingLogs(filters.reseller_id);
    const month = filters.month;
    const filtered = (Array.isArray(data) ? data : []).filter((x) => !month || (x.created_at || '').startsWith(month));
    setRows(filtered);
  };

  useEffect(() => {
    getResellers().then((d) => setResellers(Array.isArray(d) ? d : []));
    load();
  }, []);

  return (
    <div className="container-fluid py-3 reseller-page">
      <div className="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
        <h2 className="fw-bold m-0 text-dark"><i className="fas fa-file-invoice-dollar text-primary me-2" />{t('billingLogs.title')}</h2>
        <button onClick={() => window.print()} className="btn btn-dark rounded-pill px-4"><i className="fas fa-print me-1" />{t('billingLogs.print')}</button>
      </div>

      <div className="card p-3 mb-3">
        <div className="row g-2 align-items-end">
          <div className="col-md-5">
            <label className="form-label small fw-bold text-muted">{t('billingLogs.resellerSelect')}</label>
            <select className="form-select" value={filters.reseller_id} onChange={(e) => setFilters({ ...filters, reseller_id: e.target.value })}>
              <option value="">{t('billingLogs.allResellers')}</option>
              {resellers.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </div>
          <div className="col-md-3">
            <label className="form-label small fw-bold text-muted">{t('billingLogs.monthSelect')}</label>
            <input type="month" className="form-control" value={filters.month} onChange={(e) => setFilters({ ...filters, month: e.target.value })} />
          </div>
          <div className="col-md-2"><button className="btn btn-primary w-100" onClick={load}>{t('billingLogs.filter')}</button></div>
        </div>
      </div>

      <div className="card">
        <div className="table-responsive">
          <table className="table align-middle mb-0">
            <thead><tr><th>{t('billingLogs.dateTime')}</th><th>{t('billingLogs.reseller')}</th><th>{t('billingLogs.description')}</th><th>{t('billingLogs.action')}</th><th>{t('billingLogs.note')}</th></tr></thead>
            <tbody>
              {rows.length === 0 ? <tr><td colSpan="5" className="text-center text-muted py-4">{t('billingLogs.noLogs')}</td></tr> : rows.map((r) => (
                <tr key={r.id}>
                  <td>{new Date(r.created_at).toLocaleString('bn-BD')}</td>
                  <td>{r.reseller_name}</td>
                  <td>{Number(r.amount || 0).toLocaleString()} ৳</td>
                  <td>{r.log_type}</td>
                  <td>{r.note || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default BillingLogs;
