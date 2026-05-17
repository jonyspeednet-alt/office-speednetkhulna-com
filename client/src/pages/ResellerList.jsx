import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { getResellers } from '../services/resellerService';

const PARTNER_TABS = {
  mac_partner: { label: 'Mac Partner', kind: 'db', icon: 'fas fa-desktop' },
  channel_partner: { label: 'Channel Partner', kind: 'db', icon: 'fas fa-handshake' },
  distribution_partner: { label: 'Distribution Partner', kind: 'db', icon: 'fas fa-network-wired' }
};

const bw = (val) => Number(val || 0);

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

const CorporateStyles = () => (
  <style>{`
    .corporate-page {
      background-color: #f8fafc;
      min-height: calc(100vh - 60px);
      font-family: 'Inter', system-ui, -apple-system, sans-serif;
    }
    .corporate-table {
      border-collapse: separate;
      border-spacing: 0 8px;
    }
    .corporate-table tbody tr {
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      background-color: #ffffff;
      box-shadow: 0 1px 3px rgba(0,0,0,0.02);
      border-radius: 12px;
    }
    .corporate-table tbody tr td:first-child {
      border-top-left-radius: 12px;
      border-bottom-left-radius: 12px;
    }
    .corporate-table tbody tr td:last-child {
      border-top-right-radius: 12px;
      border-bottom-right-radius: 12px;
    }
    .corporate-table tbody tr:hover {
      box-shadow: 0 12px 20px -8px rgba(37, 99, 235, 0.15), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
      position: relative;
      z-index: 10;
      cursor: pointer;
    }
    .corporate-table th {
      background-color: transparent;
      color: #64748b;
      font-weight: 700;
      font-size: 0.7rem;
      letter-spacing: 0.02em;
      text-transform: uppercase;
      padding: 0 0.5rem 0.5rem 0.5rem;
      border: none;
    }
    .corporate-table td {
      padding: 0.75rem 0.5rem;
      border: none;
      border-top: 1px solid #f1f5f9;
      border-bottom: 1px solid #f1f5f9;
      color: #334155;
      vertical-align: middle;
    }
    .corporate-table tbody tr td:first-child { border-left: 1px solid #f1f5f9; }
    .corporate-table tbody tr td:last-child { border-right: 1px solid #f1f5f9; }
    
    .corporate-table tbody tr:hover td {
      border-color: #e2e8f0;
    }
    .corporate-badge {
      background-color: #f8fafc;
      color: #334155;
      font-weight: 600;
      padding: 0.2rem 0.4rem;
      border-radius: 6px;
      font-size: 0.75rem;
      display: inline-flex;
      align-items: baseline;
      gap: 0.25rem;
      border: 1px solid #e2e8f0;
      transition: all 0.2s ease;
      white-space: nowrap;
    }
    .corporate-badge span {
      font-size: 0.7rem;
      color: #94a3b8;
      font-weight: 500;
    }
    .corporate-table tr:hover .corporate-badge {
      background-color: #ffffff;
      border-color: #cbd5e1;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.02);
    }
    .avatar-circle {
      width: 36px;
      height: 36px;
      border-radius: 10px;
      background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%);
      color: #2563eb;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      font-size: 1.25rem;
      box-shadow: 0 2px 5px rgba(37, 99, 235, 0.1) inset;
      flex-shrink: 0;
      border: 1px solid #bfdbfe;
    }
    .corporate-link {
      color: #2563eb;
      font-weight: 600;
      text-decoration: none;
      display: inline-flex;
      align-items: center;
      gap: 0.3rem;
      padding: 0.2rem 0.6rem;
      border-radius: 6px;
      background-color: #eff6ff;
      border: 1px solid #dbeafe;
      transition: all 0.2s ease;
      font-size: 0.75rem;
    }
    .corporate-link:hover {
      background-color: #dbeafe;
      color: #1d4ed8;
      border-color: #bfdbfe;
      transform: translateY(-1px);
    }
    .status-badge {
      padding: 0.4rem 1rem;
      border-radius: 20px;
      font-size: 0.8rem;
      font-weight: 600;
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
    }
    .status-active {
      background-color: #f0fdf4;
      color: #16a34a;
      border: 1px solid #bbf7d0;
    }
    .status-inactive {
      background-color: #fef2f2;
      color: #dc2626;
      border: 1px solid #fecaca;
    }
    .status-active .status-dot { background-color: #16a34a; }
    .status-inactive .status-dot { background-color: #dc2626; }
    .status-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      display: inline-block;
      box-shadow: 0 0 0 2px rgba(255,255,255,0.5);
    }

    .search-input:focus {
      box-shadow: 0 0 0 4px rgba(37, 99, 235, 0.1) !important;
    }
    .tab-btn {
      transition: all 0.3s ease;
      letter-spacing: 0.3px;
      border-radius: 12px !important;
      font-weight: 600;
      padding: 0.75rem 1.5rem;
    }
    .tab-btn.active {
      background: linear-gradient(135deg, #1e40af 0%, #2563eb 100%);
      color: white !important;
      box-shadow: 0 4px 12px rgba(37, 99, 235, 0.3);
    }
    .tab-btn:not(.active) {
      color: #64748b;
    }
    .tab-btn:not(.active):hover {
      background-color: #f1f5f9;
      color: #1e293b;
    }
    .header-icon-container {
      width: 56px; 
      height: 56px; 
      border-radius: 16px; 
      background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%); 
      color: white;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1.5rem;
      box-shadow: 0 8px 16px rgba(37, 99, 235, 0.25);
    }
  `}</style>
);

const ResellerList = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') || 'distribution_partner';

  const setActiveTab = (tabKey) => {
    setSearchParams(prev => {
      prev.set('tab', tabKey);
      return prev;
    }, { replace: true });
  };

  const [rows, setRows] = useState([]);
  const [sheetMeta, setSheetMeta] = useState({ headers: [], title: '' });
  const [search, setSearch] = useState('');
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
    <div className="container-fluid py-5 corporate-page">
      <CorporateStyles />
      <div style={{ maxWidth: '1600px', margin: '0 auto' }}>
        <div className="d-flex flex-column flex-xl-row justify-content-between align-items-xl-center mb-5 gap-4">
          <div className="d-flex align-items-center gap-4">
            <div className="header-icon-container">
              <i className="fas fa-building" />
            </div>
            <div>
              <h2 className="fw-bolder text-dark m-0" style={{ letterSpacing: '-0.5px', fontSize: '2rem' }}>
                Partner Directory
              </h2>
              <div className="text-secondary mt-1 fw-medium" style={{ fontSize: '1rem' }}>
                Manage and oversee all partner profiles, bandwidth allocations, and network configurations.
              </div>
            </div>
          </div>

          <div className="d-flex flex-column flex-md-row gap-3 w-100 w-xl-auto align-items-md-center">
            <div className="position-relative flex-grow-1 bg-white rounded-pill shadow-sm" style={{ minWidth: '320px', border: '1px solid #e2e8f0' }}>
              <i className="fas fa-search position-absolute text-slate-400" style={{ top: '50%', left: '20px', transform: 'translateY(-50%)', color: '#94a3b8' }} />
              <input
                className="form-control search-input ps-5 py-3 rounded-pill border-0 fw-medium text-dark"
                placeholder="Search by name, code, phone..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') load();
                }}
                style={{ backgroundColor: 'transparent', boxShadow: 'none', outline: 'none' }}
              />
            </div>
            <button 
              className="btn px-4 py-3 rounded-pill fw-bold d-flex align-items-center justify-content-center text-white" 
              onClick={load} 
              disabled={loading}
              style={{ background: '#1e293b', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)', transition: 'all 0.2s ease', border: 'none' }}
            >
              <i className="fas fa-sync-alt me-2" style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
              Refresh
            </button>
            <Link 
              className="btn px-4 py-3 rounded-pill fw-bold d-flex align-items-center justify-content-center text-white" 
              to={`/add-reseller?partner_type=${activeTab}`}
              style={{ background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)', border: 'none', transition: 'all 0.2s ease' }}
            >
              <i className="fas fa-user-plus me-2" />
              New Partner
            </Link>
          </div>
        </div>

        <div className="mb-5 overflow-auto pb-2" style={{ WebkitOverflowScrolling: 'touch' }}>
          <div className="d-inline-flex bg-white p-2 rounded-4 shadow-sm border" style={{ borderColor: '#f1f5f9' }}>
            {Object.entries(PARTNER_TABS).map(([key, tab]) => (
              <button
                key={key}
                type="button"
                className={`btn tab-btn border-0 mx-1 d-flex align-items-center ${activeTab === key ? 'active' : 'bg-transparent'}`}
                onClick={() => setActiveTab(key)}
              >
                <i className={`${tab.icon} me-2`} />
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <div className="alert alert-danger rounded-4 py-3 px-4 shadow-sm fw-medium d-flex align-items-center gap-3 mb-4 border-0" style={{ backgroundColor: '#fef2f2', color: '#991b1b' }}>
            <i className="fas fa-exclamation-circle fs-5"></i>
            {error}
          </div>
        )}

        <div className="table-responsive px-2 pb-5">
          <table className="table corporate-table w-100">
            {!isSheetTab ? (
              <>
                <thead>
                  <tr>
                    <th>Reseller / Company</th>
                    {activeTab !== 'channel_partner' ? (
                      <>
                        <th>NTTN Link</th>
                        <th>IIG</th>
                        <th>BDIX</th>
                        <th>GGC</th>
                        <th>FNA</th>
                        <th>CDN</th>
                        <th>Other</th>
                      </>
                    ) : (
                      <th>Total Users</th>
                    )}
                    <th>Location</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan="10" className="text-center text-muted py-5 rounded-4 bg-white shadow-sm border border-light">
                        <div className="spinner-border text-primary me-2" role="status"></div>
                        <span className="fw-medium">Loading partners...</span>
                      </td>
                    </tr>
                  ) : filteredRows.length === 0 ? (
                    <tr>
                      <td colSpan="10" className="text-center text-muted py-5 rounded-4 bg-white shadow-sm border border-light">
                        <div className="mb-3">
                          <i className="fas fa-search fs-1 text-slate-300" style={{ color: '#cbd5e1' }}></i>
                        </div>
                        <div className="fw-semibold text-slate-500 fs-5">
                          {activeTab === 'mac_partner'
                            ? 'No Mac partner found'
                            : activeTab === 'channel_partner'
                              ? 'No Channel partner found'
                              : 'No Distribution partner found'}
                        </div>
                        <p className="text-muted small mt-1">Try adjusting your search query or add a new partner.</p>
                      </td>
                    </tr>
                  ) : filteredRows.map((r) => (
                    <tr key={r.id} onClick={() => navigate(`/reseller-profile/${r.id}`)}>
                      <td>
                        <div className="d-flex align-items-center gap-3">
                          <div className="avatar-circle">
                            {(r.name || r.company_name || r.reseller_code || 'P').charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div className="fw-bold text-dark fs-6" style={{ letterSpacing: '-0.3px' }}>{r.name}</div>
                            <div className="text-secondary small fw-medium mt-1 d-flex align-items-center gap-2">
                              <span className="badge bg-slate-100 text-slate-600 border px-2 py-1" style={{ backgroundColor: '#f1f5f9', color: '#475569', borderColor: '#e2e8f0' }}>
                                #{r.reseller_code || r.id}
                              </span>
                              <span>{r.company_name}</span>
                            </div>
                          </div>
                        </div>
                      </td>
                      {activeTab !== 'channel_partner' ? (
                        <>
                          <td>
                            {r.nttn_link ? (
                              <a
                                href={r.nttn_link.startsWith('http') ? r.nttn_link : `https://${r.nttn_link}`}
                                target="_blank"
                                rel="noreferrer"
                                className="corporate-link"
                                title={r.nttn_link}
                                onClick={(e) => e.stopPropagation()}
                              >
                                <i className="fas fa-external-link-alt"></i> 
                                <span className="d-inline-block text-truncate" style={{ maxWidth: '120px' }}>{r.nttn_link}</span>
                              </a>
                            ) : (
                              <span className="text-slate-300 fw-medium" style={{ color: '#cbd5e1' }}>- None -</span>
                            )}
                          </td>
                          <td><div className="corporate-badge">{bw(r.iig_bw)} <span style={{ fontSize: '0.65rem' }}>M</span></div></td>
                          <td><div className="corporate-badge">{bw(r.bdix_bw)} <span style={{ fontSize: '0.65rem' }}>M</span></div></td>
                          <td><div className="corporate-badge">{bw(r.ggc_bw)} <span style={{ fontSize: '0.65rem' }}>M</span></div></td>
                          <td><div className="corporate-badge">{bw(r.fna_bw)} <span style={{ fontSize: '0.65rem' }}>M</span></div></td>
                          <td><div className="corporate-badge">{bw(r.cdn_bw)} <span style={{ fontSize: '0.65rem' }}>M</span></div></td>
                          <td><div className="corporate-badge">{bw(r.bcdn_bw)} <span style={{ fontSize: '0.65rem' }}>M</span></div></td>
                        </>
                      ) : (
                        <td>
                          <div className="corporate-badge px-3 py-2" style={{ backgroundColor: '#eff6ff', borderColor: '#bfdbfe', color: '#1d4ed8' }}>
                            <i className="fas fa-users"></i> {r.channel_user_count || 0} <span>Users</span>
                          </div>
                        </td>
                      )}
                      <td>
                        {r.pop_location ? (
                          <span className="d-flex align-items-center gap-2 text-secondary fw-semibold">
                            <i className="fas fa-map-marker-alt text-danger opacity-75"></i>
                            {r.pop_location}
                          </span>
                        ) : <span className="text-slate-300 fw-medium" style={{ color: '#cbd5e1' }}>-</span>}
                      </td>
                      <td>
                        <span className={`status-badge ${String(r.status || 'active').toLowerCase() === 'active' ? 'status-active' : 'status-inactive'}`}>
                          <span className="status-dot"></span>
                          {String(r.status || 'active').toUpperCase()}
                        </span>
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
                      <td colSpan={Math.max(visibleSheetColumns.length, 1)} className="text-center text-muted py-5 rounded-4 bg-white shadow-sm border border-light">
                        <div className="spinner-border text-primary me-2" role="status"></div>
                        <span className="fw-medium">Loading data...</span>
                      </td>
                    </tr>
                  ) : filteredRows.length === 0 ? (
                    <tr>
                      <td colSpan={Math.max(visibleSheetColumns.length, 1)} className="text-center text-muted py-5 rounded-4 bg-white shadow-sm border border-light">
                        <div className="mb-3">
                          <i className="fas fa-table fs-1 text-slate-300" style={{ color: '#cbd5e1' }}></i>
                        </div>
                        <div className="fw-semibold text-slate-500 fs-5">
                          No rows found in {tabConfig.label}
                        </div>
                      </td>
                    </tr>
                  ) : filteredRows.map((row, index) => (
                    <tr key={`${activeTab}-${row.__rowNumber || index}`}>
                      {visibleSheetColumns.map((column) => (
                        <td key={column}>
                          <span className="fw-medium text-dark">{String(row?.[column] ?? '').trim() || <span className="text-slate-300">-</span>}</span>
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
