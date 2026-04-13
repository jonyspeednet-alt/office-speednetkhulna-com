import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
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
  security_deposit: '0'
};

const num = (v) => Number(v || 0);

const AddReseller = () => {
  const [form, setForm] = useState(init);
  const [saving, setSaving] = useState(false);

  const projected = useMemo(() => {
    const totalRate =
      num(form.iig_bw) * num(form.rate_iig) +
      num(form.bdix_bw) * num(form.rate_bdix) +
      num(form.ggc_bw) * num(form.rate_ggc) +
      num(form.fna_bw) * num(form.rate_fna) +
      num(form.cdn_bw) * num(form.rate_cdn) +
      num(form.bcdn_bw) * num(form.rate_bcdn) +
      num(form.nttn_bw) * num(form.rate_nttn);

    const now = new Date();
    const join = new Date(`${form.joining_date}T00:00:00`);
    const currentYM = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const joinYM = `${join.getFullYear()}-${String(join.getMonth() + 1).padStart(2, '0')}`;
    if (joinYM > currentYM) return 0;
    if (joinYM === currentYM) {
      const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      const daysActive = daysInMonth - join.getDate() + 1;
      return (totalRate / daysInMonth) * Math.max(0, daysActive);
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
        status: 'active'
      });
      window.alert('রিসেলার এবং ব্যান্ডউইথ সফলভাবে যুক্ত হয়েছে।');
      setForm({ ...init, joining_date: new Date().toISOString().slice(0, 10) });
    } catch (err) {
      window.alert(err?.response?.data?.message || 'রিসেলার সেভ করা যায়নি।');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="container-fluid py-3 reseller-page">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <div>
          <h3 className="fw-bold text-dark m-0">নতুন রিসেলার প্রোফাইল</h3>
          <p className="text-muted small mt-1 mb-0">রিসেলারের তথ্য, প্যাকেজ ও পেমেন্ট যোগ করুন</p>
        </div>
        <Link to="/reseller-list" className="btn btn-light rounded-pill px-4 shadow-sm">
          <i className="fas fa-arrow-left me-1" /> ফিরে যান
        </Link>
      </div>

      <form onSubmit={submit} className="card border-0 shadow-sm p-4" style={{ borderRadius: 18 }}>
        <h6 className="fw-bold border-bottom pb-2 mb-3"><i className="fas fa-user-circle me-2 text-primary" />প্রাথমিক তথ্য</h6>
        <div className="row g-3 mb-4">
          <div className="col-md-6"><label className="form-label text-uppercase small fw-bold">রিসেলারের নাম *</label><input required className="form-control" value={form.reseller_name} onChange={(e) => setForm({ ...form, reseller_name: e.target.value })} /></div>
          <div className="col-md-6"><label className="form-label text-uppercase small fw-bold">কোম্পানির নাম</label><input className="form-control" value={form.company_name} onChange={(e) => setForm({ ...form, company_name: e.target.value })} /></div>
          <div className="col-md-6"><label className="form-label text-uppercase small fw-bold">ইউজার আইডি (User ID)</label><input className="form-control" value={form.user_id} onChange={(e) => setForm({ ...form, user_id: e.target.value })} /></div>
          <div className="col-md-6"><label className="form-label text-uppercase small fw-bold">POP লোকেশন</label><input className="form-control" value={form.pop_location} onChange={(e) => setForm({ ...form, pop_location: e.target.value })} /></div>
          <div className="col-md-3"><label className="form-label text-uppercase small fw-bold">Latitude</label><input className="form-control" value={form.latitude} onChange={(e) => setForm({ ...form, latitude: e.target.value })} /></div>
          <div className="col-md-3"><label className="form-label text-uppercase small fw-bold">Longitude</label><input className="form-control" value={form.longitude} onChange={(e) => setForm({ ...form, longitude: e.target.value })} /></div>
          <div className="col-md-6"><label className="form-label text-uppercase small fw-bold">কন্টাক্ট নাম্বার</label><input className="form-control" value={form.contact_no} onChange={(e) => setForm({ ...form, contact_no: e.target.value })} /></div>
          <div className="col-md-6"><label className="form-label text-uppercase small fw-bold">পাসওয়ার্ড</label><input className="form-control" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="না দিলে কন্টাক্ট নাম্বার default password হবে" /></div>
          <div className="col-md-6"><label className="form-label text-uppercase small fw-bold">জয়েনিং ডেট</label><input type="date" className="form-control" value={form.joining_date} onChange={(e) => setForm({ ...form, joining_date: e.target.value })} required /></div>
        </div>

        <h6 className="fw-bold border-bottom pb-2 mb-3"><i className="fas fa-wifi me-2 text-primary" />ব্যান্ডউইথ ও কানেক্টিভিটি</h6>
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

        <h6 className="fw-bold border-bottom pb-2 mb-3"><i className="fas fa-money-bill-wave me-2 text-primary" />পেমেন্ট ও সিকিউরিটি</h6>
        <div className="row g-3 mb-4">
          <div className="col-md-4"><label className="form-label text-uppercase small fw-bold">প্রাথমিক জমা (টাকা)</label><input type="number" className="form-control" value={form.initial_payment} onChange={(e) => setForm({ ...form, initial_payment: e.target.value })} /></div>
          <div className="col-md-4"><label className="form-label text-uppercase small fw-bold">সিকিউরিটি ডিপোজিট</label><input type="number" className="form-control" value={form.security_deposit} onChange={(e) => setForm({ ...form, security_deposit: e.target.value })} /></div>
          <div className="col-md-4"><label className="form-label text-uppercase small fw-bold">প্রজেক্টেড বিল (Auto)</label><input type="text" className="form-control bg-light" value={projected.toFixed(2)} readOnly /></div>
        </div>

        <div className="text-end mt-2">
          <button type="button" className="btn btn-light rounded-pill px-4 me-2" onClick={() => setForm({ ...init, joining_date: new Date().toISOString().slice(0, 10) })}>রিসেট করুন</button>
          <button type="submit" className="btn btn-primary rounded-pill px-4" disabled={saving}>{saving ? 'সেভ হচ্ছে...' : 'রিসেলার সেভ করুন'}</button>
        </div>
      </form>
    </div>
  );
};

export default AddReseller;
