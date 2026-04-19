import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getResellers } from '../services/resellerService';

const PARTNER_TABS = {
  mac_partner: { label: 'Mac Partner', kind: 'db' },
  channel_partner: { label: 'Channel Partner', kind: 'db' },
  distribution_partner: { label: 'Distribution Partner', kind: 'db' }
};

const bw = (val) => `${Number(val || 0)} Mbps`;

const normalize = (value) => String(value ?? '').toLowerCase();

const getRowText = (row) => Object.values(row || {})
  .filter((value) => value !== null && value !== undefined)
  .join(' ')
  .toLowerCase();

const getVisibleSheetColumns = (headers, rows) => {
  if (Array.isArray(headers) && headers.length > 0) {
    return headers;
  }

  const seen = new Set();
  const columns = [];
  (rows || []).forEach((row) => {
    Object.keys(row || {}).forEach((key) => {
      if (key === '__rowNumber' || seen.has(key)) return;
      seen.add(key);
      columns.push(key);
    });
  });
  return columns;
};

const ResellerList = () => {
  const [rows, setRows] = useState([]);
  const [sheetMeta, setSheetMeta] = useState({ headers: [], title: '' });
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState('distribution_partner');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const tabConfig = PARTNER_TABS[activeTab] || PARTNER_TABS.mac_partner;
  const isSheetTab = tabConfig.kind === 'sheet';

  const load = async () => {
    setLoading(true);
    setError('');

    try {
      const data = await getResellers(search, { status: 'all', partner_type: activeTab });
      setRows(Array.isArray(data) ? data : []);
      setSheetMeta({ headers: [], title: '' });
    } catch (err) {
      const message = err?.response?.data?.message || err?.message || 'Failed to load reseller data';
      setError(message);
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  useEffect(() => {
    if (!isSheetTab) return undefined;
    const timer = window.setInterval(() => {
      load();
    }, 30000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSheetTab, activeTab]);

  const filteredRows = isSheetTab
    ? rows.filter((row) => {
        const term = normalize(search).trim();
        if (!term) return true;
        return getRowText(row).includes(term);
      })
    : rows;

  const visibleSheetColumns = isSheetTab ? getVisibleSheetColumns(sheetMeta.headers, filteredRows) : [];

  return (
    <div className="container-fluid py-3 reseller-page">
      <div className="d-flex justify-content-between align-items-center mb-3 gap-2 flex-wrap">
        <div>
          <h3 className="fw-bold text-dark m-0">Partner Directory</h3>
          <div className="text-muted small">
            Partner-wise profile and account list
          </div>
        </div>

        <div className="d-flex gap-2 flex-wrap">
          <input
            className="form-control"
            style={{ minWidth: 240 }}
            placeholder="Search by name, code, phone"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                load();
              }
            }}
          />
          <button className="btn btn-primary" onClick={load} disabled={loading}>
            <i className="fas fa-search me-1" />
            Search
          </button>
          <Link className="btn btn-success" to={`/add-reseller?partner_type=${activeTab}`}>
            <i className="fas fa-user-plus me-1" />
            New Partner
          </Link>
        </div>
      </div>

      <div className="d-flex gap-2 mb-3 flex-wrap">
        {Object.entries(PARTNER_TABS).map(([key, tab]) => (
          <button
            key={key}
            type="button"
            className={`btn ${activeTab === key ? 'btn-dark' : 'btn-outline-dark'}`}
            onClick={() => setActiveTab(key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="alert alert-warning py-2">
          {error}
        </div>
      )}

      <div className="card">
        <div className="table-responsive">
          <table className="table align-middle mb-0">
            {!isSheetTab ? (
              <>
                <thead>
                  <tr>
                    <th>Reseller / Company</th>
                    <th>NTTN Link</th>
                    <th>IIG</th>
                    <th>BDIX</th>
                    <th>GGC</th>
                    <th>FNA</th>
                    <th>CDN</th>
                    <th>Other</th>
                    <th>Location</th>
                    <th>Status</th>
                    <th className="text-end">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan="11" className="text-center text-muted py-4">
                        Loading...
                      </td>
                    </tr>
                  ) : filteredRows.length === 0 ? (
                    <tr>
                      <td colSpan="11" className="text-center text-muted py-4">
                        {activeTab === 'mac_partner'
                          ? 'No Mac partner found'
                          : activeTab === 'channel_partner'
                            ? 'No Channel partner found'
                            : 'No Distribution partner found'}
                      </td>
                    </tr>
                  ) : filteredRows.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <div className="fw-bold">{r.name}</div>
                        <small className="text-muted">{r.company_name || r.reseller_code}</small>
                      </td>
                      <td>
                        {r.nttn_link ? (
                          <a
                            href={r.nttn_link}
                            target="_blank"
                            rel="noreferrer"
                            className="text-decoration-none text-primary fw-semibold"
                            title={r.nttn_link}
                          >
                            {r.nttn_link}
                          </a>
                        ) : (
                          <span className="text-muted">-</span>
                        )}
                      </td>
                      <td><span className="badge-soft bg-primary-subtle text-primary">{bw(r.iig_bw)}</span></td>
                      <td><span className="badge-soft bg-success-subtle text-success">{bw(r.bdix_bw)}</span></td>
                      <td><span className="badge-soft bg-warning-subtle text-warning-emphasis">{bw(r.ggc_bw)}</span></td>
                      <td><span className="badge-soft bg-info-subtle text-info-emphasis">{bw(r.fna_bw)}</span></td>
                      <td><span className="badge-soft bg-danger-subtle text-danger">{bw(r.cdn_bw)}</span></td>
                      <td><span className="badge-soft bg-secondary-subtle text-secondary">{bw(r.bcdn_bw)}</span></td>
                      <td>{r.pop_location || '-'}</td>
                      <td>
                        <span className={`badge ${String(r.status || 'active').toLowerCase() === 'active' ? 'bg-success-subtle text-success-emphasis' : 'bg-danger-subtle text-danger-emphasis'}`}>
                          {r.status}
                        </span>
                      </td>
                      <td className="text-end">
                        <Link to={`/reseller-profile/${r.id}`} className="btn btn-sm btn-light text-primary rounded-circle shadow-sm" title="View profile">
                          <i className="fas fa-eye" />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </>
            ) : (
              <>
                <thead>
                  <tr>
                    {visibleSheetColumns.map((column) => (
                      <th key={column}>{column}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={Math.max(visibleSheetColumns.length, 1)} className="text-center text-muted py-4">
                        Loading...
                      </td>
                    </tr>
                  ) : filteredRows.length === 0 ? (
                    <tr>
                      <td colSpan={Math.max(visibleSheetColumns.length, 1)} className="text-center text-muted py-4">
                        No rows found in {tabConfig.label}
                      </td>
                    </tr>
                  ) : filteredRows.map((row, index) => (
                    <tr key={`${activeTab}-${row.__rowNumber || index}`}>
                      {visibleSheetColumns.map((column) => (
                        <td key={column}>
                          {String(row?.[column] ?? '').trim() || '-'}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </>
            )}
          </table>
        </div>
      </div>
    </div>
  );
};

export default ResellerList;
