import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getResellerStatusNoc } from '../services/resellerService';

const bw = (val) => `${Number(val || 0)} Mbps`;

const ResellerStatusNoc = () => {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const data = await getResellerStatusNoc();
        setRows(Array.isArray(data) ? data : []);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  return (
    <div className="container-fluid py-3 reseller-page">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <div>
          <h2 className="fw-bold m-0"><i className="fas fa-network-wired text-primary me-2" />রিসেলার স্ট্যাটাস (NOC)</h2>
          <p className="text-muted mt-1 mb-0">রিসেলারদের বর্তমান ব্যান্ডউইথ ও কানেক্টিভিটি স্ট্যাটাস</p>
        </div>
        <Link to="/dashboard" className="btn btn-outline-primary rounded-pill px-4">ড্যাশবোর্ড</Link>
      </div>

      <div className="card border-0 shadow-sm rounded-4">
        <div className="card-header bg-white border-0 py-3">
          <h5 className="fw-bold m-0"><i className="fas fa-list text-primary me-2" />রিসেলার ব্যান্ডউইথ স্ট্যাটাস</h5>
        </div>

        <div className="table-responsive">
          <table className="table align-middle mb-0">
            <thead style={{ backgroundColor: '#f8f9fa' }}>
              <tr>
                <th>রিসেলার</th>
                <th>কন্টাক্ট</th>
                <th>IIG</th>
                <th>BDIX</th>
                <th>GGC</th>
                <th>FNA</th>
                <th>CDN</th>
                <th>Other</th>
                <th>NTTN</th>
                <th>লোকেশন</th>
                <th className="text-end">অ্যাকশন</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="11" className="text-center py-5 text-muted">লোড হচ্ছে...</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan="11" className="text-center py-5 text-muted">কোনো রিসেলার পাওয়া যায়নি</td></tr>
              ) : rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    <div className="fw-bold text-dark">{r.name}</div>
                    <small className="text-muted">{r.company_name || ''}</small>
                  </td>
                  <td><small className="text-dark fw-bold"><i className="fas fa-phone-alt text-primary me-1" /> {r.phone || '-'}</small></td>
                  <td><span className="badge bg-primary bg-opacity-10 text-primary" style={{ fontSize: 12, minWidth: 80 }}>{bw(r.iig_bw)}</span></td>
                  <td><span className="badge bg-success bg-opacity-10 text-success" style={{ fontSize: 12, minWidth: 80 }}>{bw(r.bdix_bw)}</span></td>
                  <td><span className="badge bg-warning bg-opacity-10 text-warning" style={{ fontSize: 12, minWidth: 80 }}>{bw(r.ggc_bw)}</span></td>
                  <td><span className="badge bg-info bg-opacity-10 text-info" style={{ fontSize: 12, minWidth: 80 }}>{bw(r.fna_bw)}</span></td>
                  <td><span className="badge bg-danger bg-opacity-10 text-danger" style={{ fontSize: 12, minWidth: 80 }}>{bw(r.cdn_bw)}</span></td>
                  <td><span className="badge bg-secondary bg-opacity-10 text-secondary" style={{ fontSize: 12, minWidth: 80 }}>{bw(r.bcdn_bw)}</span></td>
                  <td><span className="badge bg-dark bg-opacity-10 text-dark" style={{ fontSize: 12, minWidth: 80 }}>{bw(r.nttn_capacity)}</span></td>
                  <td><small className="text-muted"><i className="fas fa-map-marker-alt me-1" /> {r.pop_location || '-'}</small></td>
                  <td className="text-end">
                    <Link to={`/reseller-profile/${r.id}`} target="_blank" className="btn btn-sm rounded-pill px-3" style={{ background: '#eef2ff', color: '#4318ff' }}>
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

export default ResellerStatusNoc;
