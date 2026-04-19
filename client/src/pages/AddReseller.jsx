import React, { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { createReseller } from '../services/resellerService';

const init = {
  reseller_name: '',
  company_name: '',
  user_id: '',
  pop_location: '',
  latitude: '',
  longitude: '',
  contact_no: '',
  password: '',
  joining_date: new Date().toISOString().slice(0, 10),
  iig_bw: '0',
  bdix_bw: '0',
  ggc_bw: '0',
  fna_bw: '0',
  cdn_bw: '0',
  bcdn_bw: '0',
  nttn_bw: '0',
  rate_iig: '0',
  rate_bdix: '0',
  rate_ggc: '0',
  rate_fna: '0',
  rate_cdn: '0',
  rate_bcdn: '0',
  rate_nttn: '0',
  nttn_type: [],
  nttn_link: '',
  connection_type: [],
  initial_payment: '0',
  security_deposit: '0',
  otc_charge: '0',
  real_ip_count: '0',
  real_ip_price: '0',
  partner_type: 'distribution_partner'
};

const num = (v) => Number(v || 0);
const normalizePartnerType = (value) => {
  const raw = String(value || '').trim().toLowerCase();
  if (['mac_partner', 'mac partner', 'mac'].includes(raw)) return 'mac_partner';
  if (['distribution_partner', 'distribution partner', 'distribution'].includes(raw)) return 'distribution_partner';
  if (['channel_partner', 'channel partner', 'chanel_partner', 'chanel partner', 'channel', 'chanel'].includes(raw)) return 'channel_partner';
  return '';
};

const AddReseller = () => {
  const [searchParams] = useSearchParams();
  const requestedPartnerType = normalizePartnerType(searchParams.get('partner_type'));
  const [form, setForm] = useState(() => ({ ...init, partner_type: requestedPartnerType || init.partner_type }));
  const [saving, setSaving] = useState(false);

  const projected = useMemo(() => {
    const totalRate =
      num(form.iig_bw) * num(form.rate_iig) +
      num(form.bdix_bw) * num(form.rate_bdix) +
      num(form.ggc_bw) * num(form.rate_ggc) +
      num(form.fna_bw) * num(form.rate_fna) +
      num(form.cdn_bw) * num(form.rate_cdn) +
      num(form.bcdn_bw) * num(form.rate_bcdn) +
      num(form.nttn_bw) * num(form.rate_nttn) +
      num(form.real_ip_count) * num(form.real_ip_price);

    const now = new Date();
    const join = new Date(`${form.joining_date}T00:00:00`);
    const currentYM = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const joinYM = `${join.getFullYear()}-${String(join.getMonth() + 1).padStart(2, '0')}`;
    if (joinYM > currentYM) return 0;
    if (joinYM === currentYM) {
      const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      const daysActive = daysInMonth - join.getDate() + 1;
      return ((totalRate / daysInMonth) * Math.max(0, daysActive)) + num(form.otc_charge);
    }
    return totalRate;
  }, [form]);

  const toggleValue = (key, value) => {
    const set = new Set(form[key]);
    if (set.has(value)) set.delete(value);
    else set.add(value);
    setForm({ ...form, [key]: Array.from(set) });
  };

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await createReseller({
        ...form,
        name: form.reseller_name,
        reseller_code: form.user_id,
        phone: form.contact_no,
        nttn_capacity: form.nttn_bw,
        partner_type: normalizePartnerType(form.partner_type) || 'distribution_partner',
        status: 'active'
      });
      window.alert('Partner profile created successfully.');
      setForm({ ...init, joining_date: new Date().toISOString().slice(0, 10), partner_type: requestedPartnerType || init.partner_type });
    } catch (err) {
      window.alert(err?.response?.data?.message || 'Partner profile save failed.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="container-fluid py-3 reseller-page">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <div>
          <h3 className="fw-bold text-dark m-0">New Partner Profile</h3>
          <p className="text-muted small mt-1 mb-0">Add partner info, package, and payment settings</p>
        </div>
        <Link to="/reseller-list" className="btn btn-light rounded-pill px-4 shadow-sm">
          <i className="fas fa-arrow-left me-1" /> Back
        </Link>
      </div>

      <form onSubmit={submit} className="card border-0 shadow-sm p-4" style={{ borderRadius: 18 }}>
        <h6 className="fw-bold border-bottom pb-2 mb-3"><i className="fas fa-user-circle me-2 text-primary" />Basic Information</h6>
        <div className="row g-3 mb-4">
          <div className="col-md-6"><label className="form-label text-uppercase small fw-bold">Partner Name *</label><input required className="form-control" value={form.reseller_name} onChange={(e) => setForm({ ...form, reseller_name: e.target.value })} /></div>
          <div className="col-md-6"><label className="form-label text-uppercase small fw-bold">Company Name</label><input className="form-control" value={form.company_name} onChange={(e) => setForm({ ...form, company_name: e.target.value })} /></div>
          <div className="col-md-6">
            <label className="form-label text-uppercase small fw-bold">Partner Type *</label>
            <select className="form-select" value={form.partner_type} onChange={(e) => setForm({ ...form, partner_type: e.target.value })} required>
              <option value="mac_partner">Mac Partner</option>
              <option value="distribution_partner">Distribution Partner</option>
              <option value="channel_partner">Channel Partner</option>
            </select>
          </div>
          <div className="col-md-6"><label className="form-label text-uppercase small fw-bold">User ID</label><input className="form-control" value={form.user_id} onChange={(e) => setForm({ ...form, user_id: e.target.value })} /></div>
          <div className="col-md-6"><label className="form-label text-uppercase small fw-bold">POP Location</label><input className="form-control" value={form.pop_location} onChange={(e) => setForm({ ...form, pop_location: e.target.value })} /></div>
          <div className="col-md-3"><label className="form-label text-uppercase small fw-bold">Latitude</label><input className="form-control" value={form.latitude} onChange={(e) => setForm({ ...form, latitude: e.target.value })} /></div>
          <div className="col-md-3"><label className="form-label text-uppercase small fw-bold">Longitude</label><input className="form-control" value={form.longitude} onChange={(e) => setForm({ ...form, longitude: e.target.value })} /></div>
          <div className="col-md-6"><label className="form-label text-uppercase small fw-bold">Contact Number</label><input className="form-control" value={form.contact_no} onChange={(e) => setForm({ ...form, contact_no: e.target.value })} /></div>
          <div className="col-md-6"><label className="form-label text-uppercase small fw-bold">Password</label><input className="form-control" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="If empty, contact number will be used as default password" /></div>
          <div className="col-md-6"><label className="form-label text-uppercase small fw-bold">Joining Date</label><input type="date" className="form-control" value={form.joining_date} onChange={(e) => setForm({ ...form, joining_date: e.target.value })} required /></div>
        </div>

        <h6 className="fw-bold border-bottom pb-2 mb-3"><i className="fas fa-wifi me-2 text-primary" />Bandwidth & Connectivity</h6>
        <div className="p-3 mb-4 bg-light border rounded-3">
          <div className="row g-3">
            {[
              ['iig_bw', 'rate_iig', 'IIG', 'text-primary'],
              ['bdix_bw', 'rate_bdix', 'BDIX', 'text-success'],
              ['ggc_bw', 'rate_ggc', 'GGC', 'text-warning'],
              ['fna_bw', 'rate_fna', 'FNA', 'text-info'],
              ['cdn_bw', 'rate_cdn', 'CDN', 'text-danger'],
              ['bcdn_bw', 'rate_bcdn', 'Other', 'text-secondary'],
              ['nttn_bw', 'rate_nttn', 'NTTN', 'text-dark']
            ].map(([bwKey, rateKey, label, color]) => (
              <React.Fragment key={bwKey}>
                <div className="col-md-4 col-lg-2"><label className={`form-label fw-bold ${color}`}>{label} (Mbps)</label><input type="number" className="form-control" value={form[bwKey]} onChange={(e) => setForm({ ...form, [bwKey]: e.target.value })} /></div>
                <div className="col-md-4 col-lg-2"><label className={`form-label ${color}`}>Rate (Tk/Mo)</label><input type="number" step="0.01" className="form-control" value={form[rateKey]} onChange={(e) => setForm({ ...form, [rateKey]: e.target.value })} /></div>
              </React.Fragment>
            ))}

            <div className="col-md-6">
              <label className="form-label fw-bold text-dark d-block">NTTN Type</label>
              {['D2D', 'OHF', 'Longhaul'].map((v) => (
                <div className="form-check form-check-inline" key={v}>
                  <input className="form-check-input" type="checkbox" id={`nttn_${v}`} checked={form.nttn_type.includes(v)} onChange={() => toggleValue('nttn_type', v)} />
                  <label className="form-check-label" htmlFor={`nttn_${v}`}>{v}</label>
                </div>
              ))}
            </div>
            <div className="col-md-3">
              <label className="form-label fw-bold text-dark">NTTN Link</label>
              <input className="form-control" value={form.nttn_link} onChange={(e) => setForm({ ...form, nttn_link: e.target.value })} />
            </div>
            <div className="col-md-3">
              <label className="form-label fw-bold text-dark d-block">Connection Type</label>
              {['Speed Net', 'L3'].map((v) => (
                <div className="form-check form-check-inline" key={v}>
                  <input className="form-check-input" type="checkbox" id={`conn_${v}`} checked={form.connection_type.includes(v)} onChange={() => toggleValue('connection_type', v)} />
                  <label className="form-check-label" htmlFor={`conn_${v}`}>{v}</label>
                </div>
              ))}
            </div>
          </div>
        </div>

        <h6 className="fw-bold border-bottom pb-2 mb-3"><i className="fas fa-money-bill-wave me-2 text-primary" />Payment & Security</h6>
        <div className="row g-3 mb-4">
          <div className="col-md-4"><label className="form-label text-uppercase small fw-bold">Initial Payment (Tk)</label><input type="number" className="form-control" value={form.initial_payment} onChange={(e) => setForm({ ...form, initial_payment: e.target.value })} /></div>
          <div className="col-md-4"><label className="form-label text-uppercase small fw-bold">Security Deposit</label><input type="number" className="form-control" value={form.security_deposit} onChange={(e) => setForm({ ...form, security_deposit: e.target.value })} /></div>
          <div className="col-md-4"><label className="form-label text-uppercase small fw-bold">OTC Charge</label><input type="number" step="0.01" className="form-control" value={form.otc_charge} onChange={(e) => setForm({ ...form, otc_charge: e.target.value })} /></div>
          <div className="col-md-4"><label className="form-label text-uppercase small fw-bold">Real IP Qty</label><input type="number" min="0" className="form-control" value={form.real_ip_count} onChange={(e) => setForm({ ...form, real_ip_count: e.target.value })} /></div>
          <div className="col-md-4"><label className="form-label text-uppercase small fw-bold">Real IP Price (Tk/IP)</label><input type="number" step="0.01" className="form-control" value={form.real_ip_price} onChange={(e) => setForm({ ...form, real_ip_price: e.target.value })} /></div>
          <div className="col-md-4"><label className="form-label text-uppercase small fw-bold">Projected Bill (Auto)</label><input type="text" className="form-control bg-light" value={projected.toFixed(2)} readOnly /></div>
        </div>

        <div className="text-end mt-2">
          <button type="button" className="btn btn-light rounded-pill px-4 me-2" onClick={() => setForm({ ...init, joining_date: new Date().toISOString().slice(0, 10), partner_type: requestedPartnerType || init.partner_type })}>Reset</button>
          <button type="submit" className="btn btn-primary rounded-pill px-4" disabled={saving}>{saving ? 'Saving...' : 'Save Partner'}</button>
        </div>
      </form>
    </div>
  );
};

export default AddReseller;
