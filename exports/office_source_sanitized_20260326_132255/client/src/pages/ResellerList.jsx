import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getResellers } from '../services/resellerService';

const bw = (val) => `${Number(val || 0)} Mbps`;

const ResellerList = () => {
  const [rows, setRows] = useState([]);
  const [search, setSearch] = useState('');

  const load = async () => {
    const data = await getResellers(search);
    setRows(Array.isArray(data) ? data : []);
  };

  useEffect(() => { load(); }, []);

  return (
    <div className="container-fluid py-3 reseller-page">
      <div className="d-flex justify-content-between align-items-center mb-3 gap-2 flex-wrap">
        <h3 className="fw-bold text-dark m-0">রিসেলার তালিকা</h3>
        <div className="d-flex gap-2 flex-wrap">
          <input className="form-control" style={{ minWidth: 220 }} placeholder="নাম/কোড/মোবাইল দিয়ে খুঁজুন" value={search} onChange={(e) => setSearch(e.target.value)} />
          <button className="btn btn-primary" onClick={load}><i className="fas fa-search me-1" />সার্চ</button>
          <Link className="btn btn-success" to="/add-reseller"><i className="fas fa-user-plus me-1" />নতুন রিসেলার</Link>
        </div>
      </div>

      <div className="card">
        <div className="table-responsive">
          <table className="table align-middle mb-0">
            <thead>
              <tr>
                <th>রিসেলার ও কোম্পানি</th>
                <th>IIG</th>
                <th>BDIX</th>
                <th>GGC</th>
                <th>FNA</th>
                <th>CDN</th>
                <th>Other</th>
                <th>লোকেশন</th>
                <th className="text-end">অ্যাকশন</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan="9" className="text-center text-muted py-4">কোনো রিসেলার পাওয়া যায়নি</td></tr>
              ) : rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    <div className="fw-bold">{r.name}</div>
                    <small className="text-muted">{r.company_name || r.reseller_code}</small>
                  </td>
                  <td><span className="badge-soft bg-primary-subtle text-primary">{bw(r.iig_bw)}</span></td>
                  <td><span className="badge-soft bg-success-subtle text-success">{bw(r.bdix_bw)}</span></td>
                  <td><span className="badge-soft bg-warning-subtle text-warning-emphasis">{bw(r.ggc_bw)}</span></td>
                  <td><span className="badge-soft bg-info-subtle text-info-emphasis">{bw(r.fna_bw)}</span></td>
                  <td><span className="badge-soft bg-danger-subtle text-danger">{bw(r.cdn_bw)}</span></td>
                  <td><span className="badge-soft bg-secondary-subtle text-secondary">{bw(r.bcdn_bw)}</span></td>
                  <td>{r.pop_location || '-'}</td>
                  <td className="text-end">
                    <Link to={`/reseller-profile/${r.id}`} className="btn btn-sm btn-light text-primary rounded-circle shadow-sm" title="প্রোফাইল দেখুন">
                      <i className="fas fa-eye" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default ResellerList;
