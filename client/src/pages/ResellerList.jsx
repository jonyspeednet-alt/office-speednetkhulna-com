import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getResellers } from '../services/resellerService';

const PARTNER_TABS = {
  mac_partner: { label: 'Mac Partner', kind: 'db', icon: 'fas fa-desktop' },
  channel_partner: { label: 'Channel Partner', kind: 'db', icon: 'fas fa-handshake' },
  distribution_partner: { label: 'Distribution Partner', kind: 'db', icon: 'fas fa-network-wired' }
};

const bw = (val) => `${Number(val || 0)} Mbps`;

const normalize = (value) => String(value ?? '').toLowerCase();
const normalizePartnerType = (value) => {
  const raw = String(value ?? '').trim().toLowerCase();
  if (['mac_partner', 'mac partner', 'mac'].includes(raw)) return 'mac_partner';
  if (['channel_partner', 'channel partner', 'chanel_partner', 'chanel partner', 'channel', 'chanel'].includes(raw)) return 'channel_partner';
  if (['distribution_partner', 'distribution partner', 'distribution'].includes(raw)) return 'distribution_partner';
  return 'distribution_partner';
};

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
    : rows.filter((row) => normalizePartnerType(row?.partner_type) === activeTab);

  const visibleSheetColumns = isSheetTab ? getVisibleSheetColumns(sheetMeta.headers, filteredRows) : [];

  return (
    <div className="container-fluid py-4 reseller-page" style={{ maxWidth: '1400px' }}>
      <div className="d-flex flex-column flex-lg-row justify-content-between align-items-lg-center mb-4 gap-3">
        <div>
          <h3 className="fw-bold text-dark m-0 d-flex align-items-center gap-2">
            <div className="bg-primary bg-opacity-10 text-primary p-2 rounded d-flex align-items-center justify-content-center" style={{ width: '40px', height: '40px' }}>
              <i className="fas fa-address-book" />
            </div>
            Partner Directory
          </h3>
          <div className="text-muted mt-2 small">
            Manage partner profiles, bandwidth, and accounts
          </div>
        </div>

        <div className="d-flex flex-column flex-sm-row gap-2 w-100 w-lg-auto">
          <div className="position-relative flex-grow-1" style={{ minWidth: '260px' }}>
            <i className="fas fa-search position-absolute text-muted" style={{ top: '50%', left: '15px', transform: 'translateY(-50%)' }} />
            <input
              className="form-control ps-5 py-2 rounded-pill shadow-sm border-0"
              placeholder="Search by name, code, phone..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  load();
                }
              }}
              style={{ backgroundColor: '#f8f9fa' }}
            />
          </div>
          <button className="btn btn-primary px-4 py-2 rounded-pill fw-medium d-flex align-items-center justify-content-center shadow-sm" onClick={load} disabled={loading}>
            <i className="fas fa-search me-2" />
            Search
          </button>
          <Link className="btn btn-success px-4 py-2 rounded-pill fw-medium d-flex align-items-center justify-content-center shadow-sm" to={`/add-reseller?partner_type=${activeTab}`}>
            <i className="fas fa-user-plus me-2" />
            New Partner
          </Link>
        </div>
      </div>

      <div className="mb-4 overflow-auto pb-2" style={{ WebkitOverflowScrolling: 'touch' }}>
        <ul className="nav nav-pills bg-white p-2 rounded-4 shadow-sm d-inline-flex flex-nowrap w-100 w-md-auto" style={{ minWidth: 'max-content' }}>
          {Object.entries(PARTNER_TABS).map(([key, tab]) => (
            <li className="nav-item flex-sm-fill text-center" key={key}>
              <button
                type="button"
                className={`nav-link fw-semibold px-4 py-2 rounded-pill w-100 ${activeTab === key ? 'active shadow text-white' : 'text-dark'}`}
                onClick={() => setActiveTab(key)}
                style={{ whiteSpace: 'nowrap', transition: 'all 0.3s ease', backgroundColor: activeTab === key ? '' : 'transparent', border: 'none' }}
              >
                <i className={`${tab.icon} me-2 ${activeTab === key ? 'text-white' : 'text-primary'}`} />
                {tab.label}
              </button>
            </li>
          ))}
        </ul>
      </div>

      {error && (
        <div className="alert alert-warning py-2">
          {error}
        </div>
      )}

      <div className="card border-0 shadow-sm rounded-4 overflow-hidden mb-4">
        <div className="table-responsive">
          <table className="table table-hover align-middle mb-0">
            {!isSheetTab ? (
              <>
                <thead className="table-light">
                  <tr>
                    <th className="text-uppercase text-secondary small fw-bold py-3 px-3 border-0">Reseller / Company</th>
                    {activeTab !== 'channel_partner' ? (
                      <>
                        <th className="text-uppercase text-secondary small fw-bold py-3 px-3 border-0">NTTN Link</th>
                        <th className="text-uppercase text-secondary small fw-bold py-3 px-3 border-0">IIG</th>
                        <th className="text-uppercase text-secondary small fw-bold py-3 px-3 border-0">BDIX</th>
                        <th className="text-uppercase text-secondary small fw-bold py-3 px-3 border-0">GGC</th>
                        <th className="text-uppercase text-secondary small fw-bold py-3 px-3 border-0">FNA</th>
                        <th className="text-uppercase text-secondary small fw-bold py-3 px-3 border-0">CDN</th>
                        <th className="text-uppercase text-secondary small fw-bold py-3 px-3 border-0">Other</th>
                      </>
                    ) : (
                      <th className="text-uppercase text-secondary small fw-bold py-3 px-3 border-0">Total Users</th>
                    )}
                    <th className="text-uppercase text-secondary small fw-bold py-3 px-3 border-0">Location</th>
                    <th className="text-uppercase text-secondary small fw-bold py-3 px-3 border-0">Status</th>
                    <th className="text-end text-uppercase text-secondary small fw-bold py-3 px-3 border-0">Action</th>
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
                      <td className="px-3 py-3">
                        <div className="fw-bold text-dark">{r.name}</div>
                        <small className="text-muted d-flex align-items-center gap-1 mt-1">
                          <i className="fas fa-building small text-primary opacity-50"></i>
                          {r.company_name || r.reseller_code}
                        </small>
                      </td>
                      {activeTab !== 'channel_partner' ? (
                        <>
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
                        </>
                      ) : (
                        <td>
                          <span className="badge bg-light text-dark border shadow-sm px-3 py-2">
                            <i className="fas fa-users me-2 text-primary"></i>
                            {r.channel_user_count || 0} Users
                          </span>
                        </td>
                      )}
                      <td className="px-3">
                        {r.pop_location ? (
                          <span className="d-flex align-items-center gap-1 text-muted small fw-medium">
                            <i className="fas fa-map-marker-alt text-danger opacity-75"></i>
                            {r.pop_location}
                          </span>
                        ) : <span className="text-muted">-</span>}
                      </td>
                      <td className="px-3">
                        <span className={`badge rounded-pill px-3 py-2 ${String(r.status || 'active').toLowerCase() === 'active' ? 'bg-success-subtle text-success-emphasis border border-success-subtle' : 'bg-danger-subtle text-danger-emphasis border border-danger-subtle'}`}>
                          <i className={`fas ${String(r.status || 'active').toLowerCase() === 'active' ? 'fa-check-circle' : 'fa-times-circle'} me-1`}></i>
                          {r.status}
                        </span>
                      </td>
                      <td className="text-end px-3">
                        <Link to={`/reseller-profile/${r.id}`} className="btn btn-sm btn-light text-primary rounded-circle shadow-sm" style={{ width: '32px', height: '32px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s ease' }} title="View profile" onMouseOver={(e) => { e.currentTarget.classList.add('bg-primary', 'text-white'); e.currentTarget.classList.remove('btn-light', 'text-primary'); }} onMouseOut={(e) => { e.currentTarget.classList.remove('bg-primary', 'text-white'); e.currentTarget.classList.add('btn-light', 'text-primary'); }}>
                          <i className="fas fa-eye" />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </>
            ) : (
              <>
                <thead className="table-light">
                  <tr>
                    {visibleSheetColumns.map((column) => (
                      <th key={column} className="text-uppercase text-secondary small fw-bold py-3 px-3 border-0">{column}</th>
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
                        <td key={column} className="px-3 py-3">
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
