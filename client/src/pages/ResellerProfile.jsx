import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { addBillingLog, addDiscount, getResellerProfileDetails, updateReseller, changeResellerRate, getResellerRateChangeLogs } from '../services/resellerService';
import {
  getChannelUsers, addChannelUser, updateChannelUser, deleteChannelUser,
  getUserPayments, initMonthlyPayments, recordUserPayment, bulkRecordPayments,
  getCommissionSummary, generateCommission, adjustCommission, finalizeCommission,
  getCommissionHistory, recordCommissionPayment, getCommissionPayments, getChannelStatement
} from '../services/channelPartnerService';
import { Bar, Doughnut } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, ArcElement, Tooltip, Legend } from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, Tooltip, Legend);

const money = (v) => `${Number(v || 0).toLocaleString('bn-BD', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} \u09F3`;
const bw = (v) => `${Number(v || 0).toLocaleString('bn-BD')} Mbps`;
const splitCsv = (v) => String(v || '').split(',').map((x) => x.trim()).filter(Boolean);
const fmtDate = (v) => {
  if (!v) return '-';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleDateString('bn-BD', { day: '2-digit', month: 'short', year: 'numeric' });
};
const toDhakaDateInputValue = (v) => {
  if (!v) return '';
  const raw = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Dhaka',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(d);
  const year = parts.find((p) => p.type === 'year')?.value;
  const month = parts.find((p) => p.type === 'month')?.value;
  const day = parts.find((p) => p.type === 'day')?.value;
  return year && month && day ? `${year}-${month}-${day}` : '';
};
const getDhakaDateYmd = () => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Dhaka',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date());
  const year = parts.find((p) => p.type === 'year')?.value;
  const month = parts.find((p) => p.type === 'month')?.value;
  const day = parts.find((p) => p.type === 'day')?.value;
  return year && month && day ? `${year}-${month}-${day}` : new Date().toISOString().slice(0, 10);
};
const partnerTypeLabel = (value) => {
  const normalized = String(value || '').toLowerCase();
  if (normalized === 'mac_partner') return 'Mac Partner';
  if (normalized === 'distribution_partner') return 'Distribution Partner';
  return 'Channel Partner';
};

const ModalWrap = ({ title, children, onClose }) => (
  <div className="position-fixed top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center" style={{ zIndex: 1080, background: 'rgba(0,0,0,.5)' }}>
    <div className="card shadow" style={{ width: 'min(920px,95vw)', maxHeight: '90vh', overflow: 'auto' }}>
      <div className="card-header d-flex justify-content-between align-items-center">
        <h5 className="m-0 fw-bold">{title}</h5>
        <button className="btn btn-sm btn-light" onClick={onClose}><i className="fas fa-times" /></button>
      </div>
      <div className="card-body">{children}</div>
    </div>
  </div>
);

const ResellerProfile = () => {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const profileId = id || searchParams.get('id');
  const [data, setData] = useState(null);
  const [activeTab, setActiveTab] = useState('bandwidth');
  const [saving, setSaving] = useState(false);
  const [showPay, setShowPay] = useState(false);
  const [showDiscount, setShowDiscount] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showBillHistory, setShowBillHistory] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [showRateChange, setShowRateChange] = useState(false);
  const [rateChangeLogs, setRateChangeLogs] = useState([]);
  const [rateChangeForm, setRateChangeForm] = useState(null);
  const [rateChangeSaving, setRateChangeSaving] = useState(false);

  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentDate, setPaymentDate] = useState(getDhakaDateYmd());
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [paymentNote, setPaymentNote] = useState('');
  const [discountAmount, setDiscountAmount] = useState('');
  const [discountDate, setDiscountDate] = useState(getDhakaDateYmd());
  const [discountNote, setDiscountNote] = useState('');
  const [editForm, setEditForm] = useState(null);

  // Channel Partner state
  const isChannel = data?.reseller?.partner_type === 'channel_partner';
  const [cpUsers, setCpUsers] = useState([]);
  const [cpMonth, setCpMonth] = useState(getDhakaDateYmd().slice(0, 7));
  const [cpUserPayments, setCpUserPayments] = useState([]);
  const [cpCommission, setCpCommission] = useState(null);
  const [cpHistory, setCpHistory] = useState([]);
  const [cpStatement, setCpStatement] = useState([]);
  const [cpPayments, setCpPayments] = useState([]);
  const [showAddUser, setShowAddUser] = useState(false);
  const [showEditUser, setShowEditUser] = useState(null);
  const [showCommissionPay, setShowCommissionPay] = useState(false);
  const [showAdjust, setShowAdjust] = useState(false);
  const [cpLoading, setCpLoading] = useState(false);
  const [newUser, setNewUser] = useState({ user_name: '', user_id_code: '', phone: '', package_name: '', monthly_rate: '' });
  const [commPayForm, setCommPayForm] = useState({ amount: '', payment_date: getDhakaDateYmd(), payment_method: 'Cash', reference_no: '', note: '' });
  const [adjForm, setAdjForm] = useState({ type: 'adjustment', amount: '', note: '' });
  const [cpUserSearch, setCpUserSearch] = useState('');

  const loadChannelData = useCallback(async () => {
    if (!profileId || !isChannel) return;
    setCpLoading(true);
    try {
      const [users, commission, history, statement, payments] = await Promise.all([
        getChannelUsers(profileId).catch(() => []),
        getCommissionSummary(profileId, cpMonth).catch(() => null),
        getCommissionHistory(profileId).catch(() => []),
        getChannelStatement(profileId).catch(() => []),
        getCommissionPayments(profileId).catch(() => [])
      ]);
      setCpUsers(users);
      setCpCommission(commission);
      setCpHistory(history);
      setCpStatement(statement);
      setCpPayments(payments);
    } catch (e) { /* ignore */ }
    setCpLoading(false);
  }, [profileId, isChannel, cpMonth]);

  const loadUserPayments = useCallback(async () => {
    if (!profileId) return;
    try {
      const rows = await getUserPayments(profileId, cpMonth);
      setCpUserPayments(rows);
    } catch (e) { /* ignore */ }
  }, [profileId, cpMonth]);

  useEffect(() => { if (isChannel) { loadChannelData(); loadUserPayments(); } }, [isChannel, loadChannelData, loadUserPayments]);

  const load = async () => {
    if (!profileId) return;
    setLoadError('');
    try {
      const payload = await getResellerProfileDetails(profileId);
      setData(payload);
      const r = payload.reseller;
      setEditForm({
        name: r.name || '', company_name: r.company_name || '', phone: r.phone || '', pop_location: r.pop_location || '',
        latitude: r.latitude || '', longitude: r.longitude || '', reseller_code: r.reseller_code || '', status: r.status || 'active',
        partner_type: r.partner_type || 'distribution_partner',
        iig_bw: Number(r.iig_bw || 0), bdix_bw: Number(r.bdix_bw || 0), ggc_bw: Number(r.ggc_bw || 0), fna_bw: Number(r.fna_bw || 0),
        cdn_bw: Number(r.cdn_bw || 0), bcdn_bw: Number(r.bcdn_bw || 0), nttn_capacity: Number(r.nttn_capacity || 0),
        nttn_type: r.nttn_type || '', nttn_link: r.nttn_link || '', connection_type: r.connection_type || '',
        rate_iig: Number(r.rate_iig || 0), rate_bdix: Number(r.rate_bdix || 0), rate_ggc: Number(r.rate_ggc || 0),
        rate_fna: Number(r.rate_fna || 0), rate_cdn: Number(r.rate_cdn || 0), rate_bcdn: Number(r.rate_bcdn || 0), rate_nttn: Number(r.rate_nttn || 0),
        monthly_rate: Number(r.current_projected_bill || 0), due_amount: Number(r.previous_month_due || 0),
        next_pay_date: toDhakaDateInputValue(r.next_pay_date),
        security_deposit: Number(r.security_deposit || 0),
        otc_charge: Number(r.otc_charge || 0),
        real_ip_count: Number(r.real_ip_count || 0),
        real_ip_price: Number(r.real_ip_price || 0),
        channel_user_count: Number(r.channel_user_count || 0),
        profit_share_percentage: Number(r.profit_share_percentage || 0),
        joining_date: toDhakaDateInputValue(r.joining_date || r.created_at)
      });
    } catch (e) {
      setData(null);
      setLoadError(e?.response?.data?.message || 'Profile data load failed');
    }
  };

  useEffect(() => { load(); }, [profileId]);

  const loadRateChangeLogs = useCallback(async () => {
    if (!profileId) return;
    try {
      const logs = await getResellerRateChangeLogs(profileId);
      setRateChangeLogs(logs || []);
    } catch (_) { /* ignore */ }
  }, [profileId]);

  useEffect(() => { loadRateChangeLogs(); }, [loadRateChangeLogs]);

  useEffect(() => {
    if (data && data.reseller?.partner_type === 'channel_partner' && activeTab === 'bandwidth') {
      setActiveTab(data.permissions?.can_view_financials ? 'cp_users' : 'requests');
    }
  }, [data, activeTab]);

  const can = data?.permissions || {};
  const reseller = data?.reseller || {};
  const stats = data?.stats || {};
  const requests = data?.recent_requests || [];
  const statementItems = data?.statement_items || [];
  const billHistory = data?.bill_history || [];
  const realIpMonthly = Number(reseller.real_ip_count || 0) * Number(reseller.real_ip_price || 0);

  const activePackages = useMemo(() => {
    const arr = [
      { label: 'IIG', bw: reseller.iig_bw, rate: reseller.rate_iig, icon: 'fa-globe-americas', color: 'text-primary' },
      { label: 'BDIX', bw: reseller.bdix_bw, rate: reseller.rate_bdix, icon: 'fa-exchange-alt', color: 'text-success' },
      { label: 'GGC', bw: reseller.ggc_bw, rate: reseller.rate_ggc, icon: 'fa-google', color: 'text-warning' },
      { label: 'FNA', bw: reseller.fna_bw, rate: reseller.rate_fna, icon: 'fa-network-wired', color: 'text-info' },
      { label: 'CDN', bw: reseller.cdn_bw, rate: reseller.rate_cdn, icon: 'fa-server', color: 'text-danger' },
      { label: 'Other', bw: reseller.bcdn_bw, rate: reseller.rate_bcdn, icon: 'fa-hdd', color: 'text-secondary' },
      { label: 'NTTN', bw: reseller.nttn_capacity, rate: reseller.rate_nttn, icon: 'fa-broadcast-tower', color: 'text-dark', extra: reseller.nttn_type }
    ];
    return arr.filter((x) => Number(x.bw || 0) > 0);
  }, [reseller]);

  const bwBarData = useMemo(() => ({
    labels: ['IIG', 'BDIX', 'GGC', 'FNA', 'CDN', 'Other', 'NTTN'],
    datasets: [{
      label: 'Allocated (Mbps)',
      data: [
        Number(reseller.iig_bw || 0),
        Number(reseller.bdix_bw || 0),
        Number(reseller.ggc_bw || 0),
        Number(reseller.fna_bw || 0),
        Number(reseller.cdn_bw || 0),
        Number(reseller.bcdn_bw || 0),
        Number(reseller.nttn_capacity || 0)
      ],
      backgroundColor: ['#4318ff', '#05cd99', '#ffb547', '#0dcaf0', '#e31a1a', '#6c757d', '#212529'],
      borderRadius: 5,
      barPercentage: 0.6
    }]
  }), [reseller]);

  const bwPieData = useMemo(() => {
    const iig = Number(reseller.iig_bw || 0);
    const bdix = Number(reseller.bdix_bw || 0);
    const ggc = Number(reseller.ggc_bw || 0);
    const fna = Number(reseller.fna_bw || 0);
    const cdn = Number(reseller.cdn_bw || 0);
    const bcdn = Number(reseller.bcdn_bw || 0);
    const nttn = Number(reseller.nttn_capacity || 0);
    const used = iig + bdix + ggc + fna + cdn + bcdn;
    const free = Math.max(0, nttn - used);

    return {
      labels: ['IIG', 'BDIX', 'GGC', 'FNA', 'CDN', 'Other', 'Available'],
      datasets: [{
        data: [iig, bdix, ggc, fna, cdn, bcdn, free],
        backgroundColor: ['#4318ff', '#05cd99', '#ffb547', '#0dcaf0', '#e31a1a', '#6c757d', '#e9ecef'],
        borderWidth: 0
      }]
    };
  }, [reseller]);

  const toggleCsvValue = (key, value) => {
    const current = new Set(splitCsv(editForm?.[key]));
    if (current.has(value)) current.delete(value);
    else current.add(value);
    setEditForm({ ...editForm, [key]: Array.from(current).join(', ') });
  };

  const statementRows = useMemo(() => statementItems.map((x) => ({
    ...x,
    typeText: x.type === 'invoice' ? 'Debit' : (x.type === 'discount' ? 'Discount' : 'Credit'),
    typeClass:
      x.type === 'invoice'
        ? 'bg-danger bg-opacity-10 text-danger border border-danger border-opacity-25'
        : x.type === 'discount'
          ? 'bg-info bg-opacity-10 text-info border border-info border-opacity-25'
          : 'bg-success bg-opacity-10 text-success border border-success border-opacity-25',
    amountClass: x.type === 'invoice' ? 'text-danger' : (x.type === 'discount' ? 'text-info' : 'text-success')
  })), [statementItems]);

  const submitPayment = async (e) => {
    e.preventDefault();
    if (!Number(paymentAmount)) return;
    const note = `Payment Received (${paymentMethod}): ${Number(paymentAmount).toFixed(2)} Tk.${paymentNote ? ` Note: ${paymentNote}` : ''}`;
    await addBillingLog({
      reseller_id: profileId,
      log_type: 'payment',
      amount: Number(paymentAmount),
      note,
      effective_date: `${paymentDate}T${new Date().toTimeString().slice(0, 8)}`
    });
    setShowPay(false);
    setPaymentAmount('');
    setPaymentMethod('Cash');
    setPaymentNote('');
    await load();
  };

  const submitDiscount = async (e) => {
    e.preventDefault();
    if (!Number(discountAmount)) return;
    try {
      const payload = {
        amount: Number(discountAmount),
        note: discountNote || 'Monthly discount',
        effective_date: `${discountDate}T${new Date().toTimeString().slice(0, 8)}`
      };
      try {
        await addDiscount(profileId, payload);
      } catch (primaryErr) {
        const status = Number(primaryErr?.response?.status || 0);
        if ([403, 404, 500].includes(status)) {
          await addBillingLog({
            reseller_id: profileId,
            log_type: 'discount',
            amount: payload.amount,
            note: `Discount: ${payload.note}`,
            effective_date: payload.effective_date
          });
        } else {
          throw primaryErr;
        }
      }
      setShowDiscount(false);
      setDiscountAmount('');
      setDiscountNote('');
      await load();
    } catch (err) {
      window.alert(err?.response?.data?.message || 'Discount save failed');
    }
  };

  const saveProfile = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await updateReseller(profileId, editForm);
      setShowEdit(false);
      await load();
    } finally {
      setSaving(false);
    }
  };

  const openRateChangeModal = () => {
    const r = data?.reseller || {};
    setRateChangeForm({
      effective_date: getDhakaDateYmd(),
      note: '',
      rate_iig: Number(r.rate_iig || 0),
      rate_bdix: Number(r.rate_bdix || 0),
      rate_ggc: Number(r.rate_ggc || 0),
      rate_fna: Number(r.rate_fna || 0),
      rate_cdn: Number(r.rate_cdn || 0),
      rate_bcdn: Number(r.rate_bcdn || 0),
      rate_nttn: Number(r.rate_nttn || 0),
    });
    setShowRateChange(true);
  };

  const submitRateChange = async (e) => {
    e.preventDefault();
    setRateChangeSaving(true);
    try {
      await changeResellerRate(profileId, rateChangeForm);
      setShowRateChange(false);
      await load();
      await loadRateChangeLogs();
    } catch (err) {
      window.alert(err?.response?.data?.message || 'রেট পরিবর্তন সেভ হয়নি');
    } finally {
      setRateChangeSaving(false);
    }
  };

  if (loadError) return <div className="p-4 text-danger">{loadError}</div>;
  if (!data) return <div className="p-4">লোড হচ্ছে...</div>;

  return (
    <div className="container-fluid py-3 reseller-page">
      {stats.pending_bill_warning && <div className="alert alert-warning border-0 shadow-sm mb-3"><i className="fas fa-exclamation-triangle text-warning me-2" />{stats.pending_bill_warning}</div>}

      <div className="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
        <div className="d-flex align-items-center gap-2">
          <Link to="/reseller-list" className="btn btn-light rounded-circle shadow-sm me-1"><i className="fas fa-arrow-left" /></Link>
          <div>
            <h4 className="fw-bold m-0">{reseller.name}</h4>
            <small className="text-muted">{reseller.reseller_code}</small>
            <span className="badge bg-light text-dark border ms-2">{partnerTypeLabel(reseller.partner_type)}</span>
          </div>
        </div>
        <div className="d-flex gap-2">
          {can.can_add_payment && <button type="button" className="btn btn-sm btn-warning text-dark rounded-pill px-3 shadow-sm" onClick={() => setShowPay(true)}><i className="fas fa-hand-holding-usd me-1" />পেমেন্ট যোগ করুন</button>}
          {can.can_add_discount && <button type="button" className="btn btn-sm btn-info text-white rounded-pill px-3 shadow-sm" onClick={() => setShowDiscount(true)}><i className="fas fa-percent me-1" />Discount</button>}
          {can.can_view_invoice && <Link to={`/invoice?resellerId=${reseller.id}`} className="btn btn-sm btn-primary rounded-pill px-3 shadow-sm"><i className="fas fa-file-invoice me-1" />ইনভয়েস</Link>}
        </div>
      </div>

      <div className="row g-3 mb-3">
        {isChannel && can.can_view_financials && cpCommission ? (
          <>
            <div className="col-md-3"><div className="card p-3"><small className="text-muted text-uppercase">মোট ইউজার</small><h4 className="fw-bold m-0">{Number(cpCommission.total_users || 0).toLocaleString('bn-BD')}</h4><small className="text-success">{Number(cpCommission.active_users || 0).toLocaleString('bn-BD')} সক্রিয়</small></div></div>
            <div className="col-md-3"><div className="card p-3"><small className="text-muted text-uppercase">এই মাসের কালেকশন</small><h4 className="fw-bold m-0 text-primary">{money(cpCommission.total_collected)}</h4><small className="text-muted">{Number(cpCommission.paying_users || 0).toLocaleString('bn-BD')} ইউজার পেমেন্ট দিয়েছে</small></div></div>
            <div className="col-md-3"><div className="card p-3"><small className="text-muted text-uppercase">কমিশন ({Number(cpCommission.profit_share_percentage || 0)}%)</small><h4 className="fw-bold m-0 text-success">{money(cpCommission.gross_commission)}</h4><small className="text-muted">Net: {money(cpCommission.net_commission)}</small></div></div>
            <div className="col-md-3"><div className="card p-3"><small className="text-muted text-uppercase">বকেয়া ব্যালেন্স</small><h4 className={`fw-bold m-0 ${Number(cpCommission.closing_balance || 0) > 0 ? 'text-danger' : 'text-success'}`}>{money(cpCommission.closing_balance)}</h4><small className="text-muted">পরিশোধিত: {money(cpCommission.paid_to_partner)}</small></div></div>
          </>
        ) : can.can_view_financials && !isChannel ? (
          <>
            <div className="col-md-3"><div className="card p-3"><small className="text-muted text-uppercase">বর্তমান মোট ডিউ</small><h4 title={stats.calc_tooltip || ''} className={`fw-bold m-0 ${Number(stats.net_due || 0) > 0 ? 'text-danger' : 'text-success'}`}>{money(stats.net_due)}</h4></div></div>
            <div className="col-md-3"><div className="card p-3" style={{ cursor: 'pointer' }} onClick={() => setShowBillHistory(true)}><small className="text-muted text-uppercase">Previous Due</small><h5 className="fw-bold m-0">{money(reseller.previous_month_due)}</h5></div></div>
            <div className="col-md-3"><div className="card p-3"><small className="text-muted text-uppercase">Projected Bill</small><h5 className="fw-bold m-0">{money(reseller.current_projected_bill)}</h5></div></div>
            <div className="col-md-3"><div className="card p-3"><small className="text-muted text-uppercase">Paid This Month</small><h5 className="fw-bold m-0 text-success">{money(stats.total_paid_current_month)}</h5></div></div>
            <div className="col-md-3"><div className="card p-3"><small className="text-muted text-uppercase">সমন্বয় (এই মাস)</small><h5 className="fw-bold m-0 text-info">{money(stats.total_discount_current_month)}</h5></div></div>
          </>
        ) : null}
      </div>

      <div className="row g-3">
        <div className="col-lg-4">
          <div className="card p-3 mb-3">
            <div className="d-flex justify-content-between align-items-center mb-2">
              <h6 className="fw-bold text-muted text-uppercase small m-0">প্রোফাইল বিস্তারিত</h6>
              {can.can_edit_profile && <button className="btn btn-sm btn-light text-primary rounded-circle" onClick={() => setShowEdit(true)} title="প্রোফাইল সম্পাদনা"><i className="fas fa-edit" /></button>}
            </div>
            <ul className="list-group list-group-flush small">
              <li className="list-group-item px-0"><strong>কোম্পানি:</strong> {reseller.company_name || '-'}</li>
              <li className="list-group-item px-0"><strong>সংযোগ:</strong> {reseller.nttn_type || '-'} {reseller.connection_type ? `, ${reseller.connection_type}` : ''}</li>
              {reseller.partner_type === 'channel_partner' ? (
                <>
                  <li className="list-group-item px-0"><strong>Total Users:</strong> {Number(reseller.channel_user_count || 0).toLocaleString('bn-BD')}</li>
                  {can.can_view_financials && <li className="list-group-item px-0"><strong>Profit Share:</strong> <span className="badge bg-success bg-opacity-10 text-success border border-success border-opacity-25">{Number(reseller.profit_share_percentage || 0)}%</span></li>}
                </>
              ) : (
                <li className="list-group-item px-0">
                  <strong>NTTN Link:</strong>{' '}
                  {reseller.nttn_link ? (
                    <a href={reseller.nttn_link} target="_blank" rel="noreferrer" className="text-decoration-none">
                      {reseller.nttn_link}
                    </a>
                  ) : (
                    '-'
                  )}
                </li>
              )}
              <li className="list-group-item px-0"><strong>ফোন:</strong> {reseller.phone || '-'}</li>
              <li className="list-group-item px-0"><strong>Joining Date:</strong> {fmtDate(reseller.joining_date)}</li>
              <li className="list-group-item px-0"><strong>লোকেশন:</strong> {reseller.pop_location || '-'}</li>
              {(reseller.latitude && reseller.longitude) ? <li className="list-group-item px-0"><strong>কো-অর্ডিনেট:</strong> <a href={`https://www.google.com/maps?q=${reseller.latitude},${reseller.longitude}`} target="_blank" rel="noreferrer" className="btn btn-xs btn-outline-primary py-0 px-2 rounded-pill ms-2">ম্যাপে দেখুন</a></li> : null}
              <li className="list-group-item px-0"><strong>ইউজার আইডি:</strong> {reseller.reseller_code || '-'}</li>
              <li className="list-group-item px-0"><strong>Partner Type:</strong> {partnerTypeLabel(reseller.partner_type)}</li>
              {Number(reseller.security_deposit || 0) > 0 && <li className="list-group-item px-0"><strong>সিকিউরিটি ডিপোজিট:</strong> {money(reseller.security_deposit)}</li>}
              {can.can_view_financials && Number(reseller.otc_charge || 0) > 0 && <li className="list-group-item px-0"><strong>OTC Charge:</strong> {money(reseller.otc_charge)}</li>}
              <li className="list-group-item px-0"><strong>স্ট্যাটাস:</strong> <span className={`badge rounded-pill ${reseller.status === 'active' ? 'bg-success-subtle text-success-emphasis border border-success-subtle' : 'bg-danger-subtle text-danger-emphasis border border-danger-subtle'}`}>{reseller.status}</span></li>
            </ul>
          </div>
          <div className="card p-3 mb-3">
            <h6 className="fw-bold text-muted text-uppercase small m-0 mb-2">Real IP</h6>
            <ul className="list-group list-group-flush small">
              <li className="list-group-item px-0"><strong>Quantity:</strong> {Number(reseller.real_ip_count || 0).toLocaleString('bn-BD')}</li>
              <li className="list-group-item px-0"><strong>Unit Price:</strong> {can.can_view_financials ? money(reseller.real_ip_price) : '-'}</li>
              <li className="list-group-item px-0"><strong>Monthly Total:</strong> {can.can_view_financials ? money(realIpMonthly) : '-'}</li>
            </ul>
          </div>
        </div>

        <div className="col-lg-8">
          <div className="card">
            <div className="card-header border-0 bg-transparent p-3 d-flex justify-content-between align-items-center">
              <ul className="nav nav-pills card-header-pills flex-wrap">
                {reseller.partner_type !== 'channel_partner' && (
                  <li className="nav-item"><button className={`nav-link btn-sm py-1 px-3 ${activeTab === 'bandwidth' ? 'active' : ''}`} onClick={() => setActiveTab('bandwidth')}>Bandwidth</button></li>
                )}
                {isChannel && <li className="nav-item"><button className={`nav-link btn-sm py-1 px-3 ${activeTab === 'cp_users' ? 'active' : ''}`} onClick={() => setActiveTab('cp_users')}>ইউজার</button></li>}
                {isChannel && can.can_view_financials && <li className="nav-item"><button className={`nav-link btn-sm py-1 px-3 ${activeTab === 'cp_collection' ? 'active' : ''}`} onClick={() => setActiveTab('cp_collection')}>কালেকশন</button></li>}
                {isChannel && can.can_view_financials && <li className="nav-item"><button className={`nav-link btn-sm py-1 px-3 ${activeTab === 'cp_commission' ? 'active' : ''}`} onClick={() => setActiveTab('cp_commission')}>কমিশন</button></li>}
                {isChannel && can.can_view_financials && <li className="nav-item"><button className={`nav-link btn-sm py-1 px-3 ${activeTab === 'cp_statement' ? 'active' : ''}`} onClick={() => setActiveTab('cp_statement')}>স্টেটমেন্ট</button></li>}
                {!isChannel && can.can_view_financials && <li className="nav-item"><button className={`nav-link btn-sm py-1 px-3 ${activeTab === 'statement' ? 'active' : ''}`} onClick={() => setActiveTab('statement')}>Statement</button></li>}
                <li className="nav-item"><button className={`nav-link btn-sm py-1 px-3 ${activeTab === 'requests' ? 'active' : ''}`} onClick={() => setActiveTab('requests')}>Requests</button></li>
              </ul>
              {can.can_view_financials && <Link to={`/billing-logs?reseller_id=${reseller.id}`} className="btn btn-xs btn-outline-primary rounded-pill px-2" style={{ fontSize: 11 }}>View All</Link>}
            </div>

            <div className="card-body p-0">
              {activeTab === 'bandwidth' && (
                <div className="p-3">
                  <div className="card card-body border-0 shadow-sm mb-3 bg-light">
                    <h6 className="fw-bold small text-muted text-uppercase mb-3">Allocation Overview</h6>
                    <div className="row">
                      <div className="col-md-7 border-end" style={{ minHeight: 250 }}>
                        <Bar
                          data={bwBarData}
                          options={{
                            responsive: true,
                            maintainAspectRatio: false,
                            plugins: { legend: { display: false } },
                            scales: {
                              y: { beginAtZero: true, grid: { borderDash: [2, 2] } },
                              x: { grid: { display: false } }
                            }
                          }}
                        />
                      </div>
                      <div className="col-md-5" style={{ minHeight: 250 }}>
                        <Doughnut
                          data={bwPieData}
                          options={{
                            responsive: true,
                            maintainAspectRatio: false,
                            plugins: {
                              legend: { position: 'right', labels: { boxWidth: 10, font: { size: 10 } } },
                              title: { display: true, text: `NTTN Usage (${Number(reseller.nttn_capacity || 0)} Mbps)`, font: { size: 12 } }
                            }
                          }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Active Packages + Rate Card */}
                  <div className="d-flex justify-content-between align-items-center mb-2">
                    <h6 className="fw-bold m-0 text-dark">Active Packages</h6>
                    {can.can_edit_profile && can.can_view_financials && (
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-warning rounded-pill px-3"
                        onClick={openRateChangeModal}
                      >
                        <i className="fas fa-tags me-1" />ব্যান্ডউইথ রেট পরিবর্তন
                      </button>
                    )}
                  </div>

                  <div className="d-flex flex-column mb-3">
                    {activePackages.length === 0 ? <div className="text-muted small">No active package</div> : activePackages.map((item) => (
                      <div key={item.label} className="d-flex justify-content-between align-items-center border-bottom py-2">
                        <div className="d-flex align-items-center">
                          <i className={`fas ${item.icon} ${item.color} me-3`} style={{ width: 20 }} />
                          <span className="fw-bold small">{item.label}</span>
                          {item.extra ? <span className="badge bg-light text-dark border ms-2" style={{ fontSize: 9 }}>{item.extra}</span> : null}
                        </div>
                        <div className="text-end">
                          <div className="fw-bold text-dark small">{bw(item.bw)}</div>
                          {can.can_view_financials ? (
                            <div className="text-muted" style={{ fontSize: 10 }}>
                              <i className="fas fa-tag me-1 text-warning" style={{ fontSize: 9 }} />
                              {Number(item.rate || 0).toLocaleString('en-BD')} Tk/Month
                            </div>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Rate Change History */}
                  {can.can_view_financials && rateChangeLogs.length > 0 && (
                    <div className="mt-3">
                      <h6 className="fw-bold small text-muted text-uppercase mb-2">
                        <i className="fas fa-history me-1" />রেট পরিবর্তনের ইতিহাস
                      </h6>
                      <div className="table-responsive" style={{ maxHeight: 220 }}>
                        <table className="table table-sm table-hover align-middle mb-0" style={{ fontSize: 12 }}>
                          <thead className="table-light">
                            <tr>
                              <th>কার্যকর তারিখ</th>
                              <th>IIG</th><th>BDIX</th><th>GGC</th><th>FNA</th><th>CDN</th><th>Other</th><th>NTTN</th>
                              <th>পরিবর্তনকারী</th>
                              <th>নোট</th>
                            </tr>
                          </thead>
                          <tbody>
                            {rateChangeLogs.map((log) => {
                              const rateTypes = [
                                { key: 'iig', label: 'IIG' },
                                { key: 'bdix', label: 'BDIX' },
                                { key: 'ggc', label: 'GGC' },
                                { key: 'fna', label: 'FNA' },
                                { key: 'cdn', label: 'CDN' },
                                { key: 'bcdn', label: 'Other' },
                                { key: 'nttn', label: 'NTTN' },
                              ];
                              return (
                                <tr key={log.id}>
                                  <td className="fw-bold text-nowrap">
                                    {new Date(log.effective_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                                    <div style={{ fontSize: 10 }} className="text-muted">
                                      {new Date(log.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' })}
                                    </div>
                                  </td>
                                  {rateTypes.map(({ key }) => {
                                    const cur = Number(log[`rate_${key}`] || 0);
                                    const prev = Number(log[`prev_rate_${key}`] || 0);
                                    const changed = cur !== prev;
                                    return (
                                      <td key={key} className={changed ? 'fw-bold' : 'text-muted'}>
                                        {cur > 0 ? cur.toLocaleString('en-BD') : <span className="text-muted">-</span>}
                                        {changed && prev > 0 && (
                                          <div style={{ fontSize: 9 }} className={cur > prev ? 'text-danger' : 'text-success'}>
                                            {cur > prev ? '▲' : '▼'} {prev.toLocaleString('en-BD')}
                                          </div>
                                        )}
                                      </td>
                                    );
                                  })}
                                  <td className="text-nowrap">
                                    <span className="badge bg-light text-dark border" style={{ fontSize: 10 }}>
                                      {log.changed_by || 'System'}
                                    </span>
                                  </td>
                                  <td className="text-muted" style={{ maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {log.note || '-'}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'statement' && can.can_view_financials && (
                <div className="table-responsive" style={{ maxHeight: 420 }}>
                  <table className="table table-hover align-middle mb-0">
                    <thead className="table-light"><tr><th>Date</th><th>Description</th><th>Type</th><th>Amount</th><th className="text-end">Action</th></tr></thead>
                    <tbody>
                      {statementRows.length === 0 ? (
                        <tr><td colSpan="5" className="text-center text-muted py-4">No transactions found.</td></tr>
                      ) : statementRows.map((item) => (
                        <tr key={`${item.type}-${item.id}`}>
                          <td>{new Date(item.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' })}</td>
                          <td>
                            {item.type === 'invoice' ? (
                              <div className="d-flex align-items-center"><i className="fas fa-file-invoice-dollar text-danger me-2" /><div><span className="text-dark fw-bold">Bill</span> <small className="text-muted">{item.description}</small></div></div>
                            ) : item.type === 'discount' ? (
                              <div className="d-flex align-items-center"><i className="fas fa-percent text-info me-2" /><span className="text-dark small">{item.description}</span></div>
                            ) : (
                              <div className="d-flex align-items-center"><i className="fas fa-hand-holding-usd text-success me-2" /><span className="text-dark small">{item.description}</span></div>
                            )}
                          </td>
                          <td><span className={`badge ${item.typeClass}`}>{item.typeText}</span></td>
                          <td className={`fw-bold ${item.amountClass}`}>{Number(item.amount || 0).toFixed(2)}</td>
                          <td className="text-end">{item.type === 'invoice' ? <Link to={item.action_url} target="_blank" className="btn btn-sm btn-light text-primary py-0 px-2"><i className="fas fa-eye" /></Link> : ''}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Channel Partner — Users Tab */}
              {activeTab === 'cp_users' && isChannel && (
                <div className="p-3">
                  <div className="d-flex justify-content-between align-items-center mb-3">
                    <div className="d-flex gap-2 align-items-center">
                      <input type="text" className="form-control form-control-sm" placeholder="ইউজার খুঁজুন..." value={cpUserSearch} onChange={(e) => setCpUserSearch(e.target.value)} style={{ width: 200 }} />
                      <span className="badge bg-primary">{cpUsers.length} জন</span>
                    </div>
                    <button className="btn btn-sm btn-primary" onClick={() => { setNewUser({ user_name: '', user_id_code: '', phone: '', package_name: '', monthly_rate: '' }); setShowAddUser(true); }}>
                      <i className="fas fa-plus me-1" />ইউজার যোগ
                    </button>
                  </div>
                  <div className="table-responsive" style={{ maxHeight: 400 }}>
                    <table className="table table-hover align-middle mb-0 table-sm">
                      <thead className="table-light"><tr><th>নাম</th><th>আইডি</th><th>ফোন</th><th>প্যাকেজ</th><th>রেট</th><th>স্ট্যাটাস</th><th></th></tr></thead>
                      <tbody>
                        {cpUsers.filter(u => !cpUserSearch || u.user_name?.toLowerCase().includes(cpUserSearch.toLowerCase()) || u.user_id_code?.toLowerCase().includes(cpUserSearch.toLowerCase()) || u.phone?.includes(cpUserSearch)).length === 0 ? (
                          <tr><td colSpan="7" className="text-center text-muted py-4">কোনো ইউজার নেই</td></tr>
                        ) : cpUsers.filter(u => !cpUserSearch || u.user_name?.toLowerCase().includes(cpUserSearch.toLowerCase()) || u.user_id_code?.toLowerCase().includes(cpUserSearch.toLowerCase()) || u.phone?.includes(cpUserSearch)).map((u) => (
                          <tr key={u.id}>
                            <td className="fw-bold">{u.user_name}</td>
                            <td><span className="badge bg-light text-dark border">{u.user_id_code || '-'}</span></td>
                            <td>{u.phone || '-'}</td>
                            <td>{u.package_name || '-'}</td>
                            <td>{money(u.monthly_rate)}</td>
                            <td><span className={`badge ${u.status === 'active' ? 'bg-success' : 'bg-danger'} bg-opacity-10 text-dark border`}>{u.status}</span></td>
                            <td>
                              <div className="btn-group btn-group-sm">
                                <button className="btn btn-outline-primary btn-sm" onClick={() => setShowEditUser(u)} title="সম্পাদনা"><i className="fas fa-edit" /></button>
                                <button className="btn btn-outline-danger btn-sm" onClick={async () => { if (window.confirm('এই ইউজার মুছে ফেলতে চান?')) { await deleteChannelUser(profileId, u.id); loadChannelData(); } }} title="মুছুন"><i className="fas fa-trash" /></button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Channel Partner — Collection Tab */}
              {activeTab === 'cp_collection' && isChannel && (
                <div className="p-3">
                  <div className="d-flex justify-content-between align-items-center mb-3">
                    <div className="d-flex gap-2 align-items-center">
                      <input type="month" className="form-control form-control-sm" value={cpMonth} onChange={(e) => setCpMonth(e.target.value)} style={{ width: 170 }} />
                      <span className="badge bg-info">{cpUserPayments.length} জন</span>
                    </div>
                    <div className="d-flex gap-2">
                      <button className="btn btn-sm btn-outline-primary" onClick={async () => { await initMonthlyPayments(profileId, cpMonth); loadUserPayments(); }}>
                        <i className="fas fa-sync me-1" />ইনিশিয়ালাইজ
                      </button>
                    </div>
                  </div>
                  {cpUserPayments.length > 0 && (
                    <div className="alert alert-info py-2 small mb-3">
                      <strong>সারাংশ:</strong> মোট ডিউ: {money(cpUserPayments.reduce((s, p) => s + Number(p.amount_due || 0), 0))} |
                      কালেকশন: {money(cpUserPayments.reduce((s, p) => s + Number(p.amount_paid || 0), 0))} |
                      পেমেন্ট দিয়েছে: {cpUserPayments.filter(p => Number(p.amount_paid) > 0).length} জন |
                      বাকি: {cpUserPayments.filter(p => Number(p.amount_paid) === 0).length} জন
                    </div>
                  )}
                  <div className="table-responsive" style={{ maxHeight: 380 }}>
                    <table className="table table-hover align-middle mb-0 table-sm">
                      <thead className="table-light"><tr><th>ইউজার</th><th>আইডি</th><th>প্যাকেজ</th><th>ডিউ</th><th>পেমেন্ট</th><th>স্ট্যাটাস</th><th></th></tr></thead>
                      <tbody>
                        {cpUserPayments.length === 0 ? (
                          <tr><td colSpan="7" className="text-center text-muted py-4">এই মাসের জন্য কোনো রেকর্ড নেই। &quot;ইনিশিয়ালাইজ&quot; বাটনে ক্লিক করুন।</td></tr>
                        ) : cpUserPayments.map((p) => (
                          <tr key={p.id}>
                            <td className="fw-bold">{p.user_name}</td>
                            <td><span className="badge bg-light text-dark border">{p.user_id_code || '-'}</span></td>
                            <td>{p.package_name || '-'}</td>
                            <td>{money(p.amount_due)}</td>
                            <td>
                              <input type="number" step="0.01" min="0" className="form-control form-control-sm" style={{ width: 100 }}
                                defaultValue={Number(p.amount_paid || 0)}
                                onBlur={async (e) => {
                                  const val = Number(e.target.value || 0);
                                  if (val !== Number(p.amount_paid || 0)) {
                                    await recordUserPayment(profileId, { user_id: p.user_id, month: cpMonth, amount_paid: val, payment_date: getDhakaDateYmd() });
                                    loadUserPayments();
                                    loadChannelData();
                                  }
                                }}
                              />
                            </td>
                            <td><span className={`badge ${Number(p.amount_paid) > 0 ? 'bg-success' : 'bg-warning'} bg-opacity-10 text-dark border`}>{Number(p.amount_paid) > 0 ? 'Paid' : 'Unpaid'}</span></td>
                            <td>
                              {Number(p.amount_paid) === 0 && (
                                <button className="btn btn-xs btn-outline-success" onClick={async () => {
                                  await recordUserPayment(profileId, { user_id: p.user_id, month: cpMonth, amount_paid: Number(p.amount_due), payment_date: getDhakaDateYmd() });
                                  loadUserPayments(); loadChannelData();
                                }}>Full Pay</button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {cpUserPayments.length > 0 && (
                    <div className="mt-3 text-end">
                      <button className="btn btn-sm btn-success" onClick={async () => {
                        const unpaid = cpUserPayments.filter(p => Number(p.amount_paid) === 0);
                        if (unpaid.length === 0) return;
                        if (!window.confirm(`${unpaid.length} জন unpaid ইউজারকে full paid হিসেবে মার্ক করতে চান?`)) return;
                        await bulkRecordPayments(profileId, cpMonth, unpaid.map(p => ({ user_id: p.user_id, amount_paid: Number(p.amount_due || p.monthly_rate || 0), payment_date: getDhakaDateYmd() })));
                        loadUserPayments(); loadChannelData();
                      }}>
                        <i className="fas fa-check-double me-1" />সবাই Full Paid
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Channel Partner — Commission Tab */}
              {activeTab === 'cp_commission' && isChannel && (
                <div className="p-3">
                  <div className="d-flex justify-content-between align-items-center mb-3">
                    <h6 className="fw-bold m-0">কমিশন ইতিহাস</h6>
                    <div className="d-flex gap-2">
                      <button className="btn btn-sm btn-primary" onClick={async () => { await generateCommission(profileId, cpMonth); loadChannelData(); }}>
                        <i className="fas fa-calculator me-1" />কমিশন Generate
                      </button>
                      <button className="btn btn-sm btn-success" onClick={() => { setCommPayForm({ amount: '', payment_date: getDhakaDateYmd(), payment_method: 'Cash', reference_no: '', note: '' }); setShowCommissionPay(true); }}>
                        <i className="fas fa-money-bill me-1" />কমিশন দিন
                      </button>
                    </div>
                  </div>
                  <div className="table-responsive">
                    <table className="table table-hover align-middle mb-0 table-sm">
                      <thead className="table-light"><tr><th>মাস</th><th>ইউজার</th><th>কালেকশন</th><th>%</th><th>Gross</th><th>Adj</th><th>Ded</th><th>Net</th><th>Paid</th><th>Balance</th><th>Status</th><th></th></tr></thead>
                      <tbody>
                        {cpHistory.length === 0 ? (
                          <tr><td colSpan="12" className="text-center text-muted py-4">কোনো কমিশন ইতিহাস নেই</td></tr>
                        ) : cpHistory.map((h) => (
                          <tr key={h.id}>
                            <td className="fw-bold">{h.month}</td>
                            <td>{h.paying_users}/{h.total_users}</td>
                            <td>{money(h.total_collection)}</td>
                            <td>{Number(h.profit_share_pct)}%</td>
                            <td>{money(h.gross_commission)}</td>
                            <td className={Number(h.adjustments) !== 0 ? 'text-info' : ''}>{Number(h.adjustments) !== 0 ? money(h.adjustments) : '-'}</td>
                            <td className={Number(h.deductions) !== 0 ? 'text-danger' : ''}>{Number(h.deductions) !== 0 ? money(h.deductions) : '-'}</td>
                            <td className="fw-bold">{money(h.net_commission)}</td>
                            <td className="text-success">{money(h.paid_amount)}</td>
                            <td className={Number(h.closing_balance) > 0 ? 'text-danger fw-bold' : 'text-success'}>{money(h.closing_balance)}</td>
                            <td><span className={`badge ${h.status === 'finalized' ? 'bg-success' : 'bg-warning'} bg-opacity-10 text-dark border`}>{h.status}</span></td>
                            <td>
                              <div className="btn-group btn-group-sm">
                                {h.status === 'draft' && (
                                  <>
                                    <button className="btn btn-outline-info btn-sm" onClick={() => { setAdjForm({ type: 'adjustment', amount: '', note: '' }); setShowAdjust(h); }} title="সমন্বয়"><i className="fas fa-sliders-h" /></button>
                                    <button className="btn btn-outline-success btn-sm" onClick={async () => { if (window.confirm('কমিশন Finalize করতে চান?')) { await finalizeCommission(profileId, h.id); loadChannelData(); } }} title="Finalize"><i className="fas fa-check" /></button>
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Channel Partner — Statement Tab */}
              {activeTab === 'cp_statement' && isChannel && (
                <div className="p-3">
                  <h6 className="fw-bold mb-3">স্টেটমেন্ট</h6>
                  <div className="table-responsive" style={{ maxHeight: 420 }}>
                    <table className="table table-hover align-middle mb-0 table-sm">
                      <thead className="table-light"><tr><th>তারিখ</th><th>বিবরণ</th><th>টাইপ</th><th>পরিমাণ</th></tr></thead>
                      <tbody>
                        {cpStatement.length === 0 ? (
                          <tr><td colSpan="4" className="text-center text-muted py-4">কোনো স্টেটমেন্ট এন্ট্রি নেই</td></tr>
                        ) : cpStatement.map((s, i) => (
                          <tr key={`${s.type}-${s.id}-${i}`}>
                            <td>{s.date ? new Date(s.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' }) : '-'}</td>
                            <td>{s.description}</td>
                            <td>
                              <span className={`badge ${s.type === 'commission' ? 'bg-success' : s.type === 'payment' ? 'bg-primary' : s.type === 'deduction' ? 'bg-danger' : 'bg-info'} bg-opacity-10 text-dark border`}>
                                {s.type === 'commission' ? 'Credit' : s.type === 'payment' ? 'Payment' : s.type === 'deduction' ? 'কর্তন' : 'সমন্বয়'}
                              </span>
                            </td>
                            <td className={`fw-bold ${s.type === 'commission' || s.type === 'adjustment' ? 'text-success' : 'text-danger'}`}>
                              {s.type === 'payment' || s.type === 'deduction' ? '-' : '+'}{money(s.amount)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {activeTab === 'requests' && (
                <div className="table-responsive" style={{ maxHeight: 420 }}>
                  <table className="table table-hover align-middle mb-0">
                    <thead className="table-light"><tr><th>Date</th><th>Type</th><th>Action & Amount</th><th>Requested Date</th><th>Status</th></tr></thead>
                    <tbody>
                      {requests.length === 0 ? (
                        <tr><td colSpan="5" className="text-center text-muted py-4">No requests found.</td></tr>
                      ) : requests.map((r) => (
                        <tr key={r.id}>
                          <td>{new Date(r.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' })}</td>
                          <td><span className="badge bg-light text-dark border">{r.bw_type}</span></td>
                          <td>
                            <div className={`${r.change_type === 'increase' ? 'text-success' : 'text-danger'} fw-bold small text-uppercase`}>{r.change_type === 'increase' ? 'Upgradation' : 'Downgradation'}</div>
                            <span className="fw-bold text-dark small">{r.requested_bw_mbps} Mbps</span>
                          </td>
                          <td><span className="badge bg-info bg-opacity-10 text-dark border"><i className="far fa-calendar-alt me-1" />{r.requested_effective_date ? new Date(r.requested_effective_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Immediate'}</span></td>
                          <td><span className={`badge ${r.admin_status === 'approved' ? 'bg-success' : 'bg-warning'} bg-opacity-10 text-dark border`}>{String(r.admin_status || 'pending')}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {showPay && (
        <ModalWrap title="পেমেন্ট যোগ করুন" onClose={() => setShowPay(false)}>
          <form className="row g-3" onSubmit={submitPayment}>
            <div className="col-md-4"><label className="form-label fw-bold">পরিমাণ (Tk)</label><input type="number" step="0.01" min="0.01" className="form-control form-control-lg fw-bold text-success" value={paymentAmount} onChange={(e) => setPaymentAmount(e.target.value)} required /></div>
            <div className="col-md-4"><label className="form-label fw-bold">তারিখ</label><input type="date" className="form-control" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} required /></div>
            <div className="col-md-4"><label className="form-label fw-bold">পেমেন্ট মেথড</label><select className="form-select" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}><option>Cash</option><option>Bank</option><option>bKash</option><option>Nagad</option><option>Rocket</option><option>Other</option></select></div>
            <div className="col-12"><label className="form-label fw-bold">নোট</label><textarea className="form-control" rows="2" value={paymentNote} onChange={(e) => setPaymentNote(e.target.value)} /></div>
            <div className="col-12 text-end"><button type="button" className="btn btn-light rounded-pill me-2" onClick={() => setShowPay(false)}>বন্ধ করুন</button><button className="btn btn-warning fw-bold rounded-pill px-4">পেমেন্ট নিশ্চিত করুন</button></div>
          </form>
        </ModalWrap>
      )}

      {showBillHistory && can.can_view_financials && (
        <ModalWrap title="বিগত ৫ মাসের বিলিং ও বকেয়া হিসাব" onClose={() => setShowBillHistory(false)}>
          <div className="table-responsive">
            <table className="table table-bordered table-hover align-middle" style={{ fontSize: 13 }}>
              <thead className="table-light"><tr><th>মাস</th><th className="text-end">সাবেক বকেয়া</th><th className="text-end">বিল (+)</th><th className="text-end">জমা (-)</th><th className="text-end">মাস শেষে বকেয়া</th><th className="text-center">অ্যাকশন</th></tr></thead>
              <tbody>
                {billHistory.length === 0 ? <tr><td colSpan="6" className="text-center text-muted">কোনো বিল পাওয়া যায়নি।</td></tr> : billHistory.map((b) => (
                  <tr key={b.id}>
                    <td><div className="fw-bold">{new Date(b.bill_month).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}</div><small className="text-muted">{new Date(b.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}</small></td>
                    <td className="text-end text-muted">{Number(b.previous_due || 0).toFixed(2)}</td>
                    <td className="text-end"><div className="fw-bold">{Number(b.final_amount || 0).toFixed(2)}</div>{Number(b.adjustment || 0) !== 0 ? <small className={Number(b.adjustment) < 0 ? 'text-success' : 'text-danger'}>(Adj: {Number(b.adjustment)})</small> : ''}</td>
                    <td className="text-end text-success">{Number(b.paid || 0).toFixed(2)}</td>
                    <td className="text-end fw-bold text-danger">{Number(b.closing_due || 0).toFixed(2)}</td>
                    <td className="text-center"><Link to={`/view-static-invoice?id=${b.id}`} target="_blank" className="btn btn-sm btn-outline-primary rounded-circle"><i className="fas fa-file-invoice" /></Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ModalWrap>
      )}

      {showDiscount && (
        <ModalWrap title="Discount যুক্ত করুন" onClose={() => setShowDiscount(false)}>
          <form className="row g-3" onSubmit={submitDiscount}>
            <div className="col-md-4">
              <label className="form-label fw-bold">Discount Amount (Tk)</label>
              <input type="number" step="0.01" min="0.01" className="form-control form-control-lg fw-bold text-info" value={discountAmount} onChange={(e) => setDiscountAmount(e.target.value)} required />
            </div>
            <div className="col-md-4">
              <label className="form-label fw-bold">তারিখ</label>
              <input type="date" className="form-control" value={discountDate} onChange={(e) => setDiscountDate(e.target.value)} required />
            </div>
            <div className="col-12">
              <label className="form-label fw-bold">কারণ/নোট</label>
              <textarea className="form-control" rows="2" value={discountNote} onChange={(e) => setDiscountNote(e.target.value)} required />
            </div>
            <div className="col-12 text-end">
              <button type="button" className="btn btn-light rounded-pill me-2" onClick={() => setShowDiscount(false)}>বাতিল</button>
              <button className="btn btn-info text-white fw-bold rounded-pill px-4">Discount সেভ করুন</button>
            </div>
          </form>
        </ModalWrap>
      )}

      {showEdit && editForm && (
        <ModalWrap title="প্রোফাইল এডিট করুন" onClose={() => setShowEdit(false)}>
          <form className="row g-3" onSubmit={saveProfile}>
            <h6 className="text-primary fw-bold mb-1 border-bottom pb-2">সাধারণ তথ্য</h6>
            <div className="col-md-4"><label className="form-label fw-semibold">পার্টনার নাম</label><input className="form-control" value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} required /></div>
            <div className="col-md-4"><label className="form-label fw-semibold">কোম্পানির নাম</label><input className="form-control" value={editForm.company_name} onChange={(e) => setEditForm({ ...editForm, company_name: e.target.value })} /></div>
            <div className="col-md-4"><label className="form-label fw-semibold">User ID</label><input className="form-control" value={editForm.reseller_code} onChange={(e) => setEditForm({ ...editForm, reseller_code: e.target.value })} /></div>
            <div className="col-md-4">
              <label className="form-label fw-semibold">Partner Type</label>
              <select className="form-select" value={editForm.partner_type} onChange={(e) => setEditForm({ ...editForm, partner_type: e.target.value })}>
                <option value="mac_partner">Mac Partner</option>
                <option value="distribution_partner">Distribution Partner</option>
                <option value="channel_partner">Channel Partner</option>
              </select>
            </div>
            <div className="col-md-4"><label className="form-label fw-semibold">কন্টাক্ট নাম্বার</label><input className="form-control" value={editForm.phone} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} /></div>
            <div className="col-md-4"><label className="form-label fw-semibold">POP লোকেশন</label><input className="form-control" value={editForm.pop_location} onChange={(e) => setEditForm({ ...editForm, pop_location: e.target.value })} /></div>
            <div className="col-md-4"><label className="form-label fw-semibold">সিকিউরিটি ডিপোজিট</label><input type="number" className="form-control" value={editForm.security_deposit} onChange={(e) => setEditForm({ ...editForm, security_deposit: e.target.value })} /></div>
            <div className="col-md-4"><label className="form-label fw-semibold">OTC Charge</label><input type="number" step="0.01" className="form-control" value={editForm.otc_charge} onChange={(e) => setEditForm({ ...editForm, otc_charge: e.target.value })} /></div>
            <div className="col-md-4"><label className="form-label fw-semibold">Latitude</label><input className="form-control" value={editForm.latitude} onChange={(e) => setEditForm({ ...editForm, latitude: e.target.value })} /></div>
            <div className="col-md-4"><label className="form-label fw-semibold">Longitude</label><input className="form-control" value={editForm.longitude} onChange={(e) => setEditForm({ ...editForm, longitude: e.target.value })} /></div>
            <div className="col-md-4"><label className="form-label fw-semibold">Joining Date</label><input type="date" className="form-control" value={editForm.joining_date || ''} onChange={(e) => setEditForm({ ...editForm, joining_date: e.target.value })} /></div>
            <div className="col-md-6"><label className="form-label fw-semibold">রিসেলার স্ট্যাটাস</label><select className="form-select" value={editForm.status} onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}><option value="active">Active</option><option value="suspended">Suspended</option><option value="inactive">Inactive</option></select></div>
            <div className="col-md-6"><label className="form-label fw-semibold text-danger">নতুন পাসওয়ার্ড (ঐচ্ছিক)</label><input type="password" className="form-control" value={editForm.password || ''} onChange={(e) => setEditForm({ ...editForm, password: e.target.value })} placeholder="ফাঁকা রাখলে অপরিবর্তিত থাকবে" /></div>

            {editForm.partner_type === 'channel_partner' ? (
              <>
                <h6 className="text-primary fw-bold mt-2 mb-1 border-bottom pb-2">ইউজার ও কমিশন তথ্য</h6>
                <div className="col-md-4"><label className="form-label fw-semibold">Total Users</label><input type="number" min="0" className="form-control" value={editForm.channel_user_count} onChange={(e) => setEditForm({ ...editForm, channel_user_count: e.target.value })} /></div>
                <div className="col-md-4"><label className="form-label fw-semibold">Profit Share (%)</label><input type="number" step="0.01" min="0" max="100" className="form-control" value={editForm.profit_share_percentage} onChange={(e) => setEditForm({ ...editForm, profit_share_percentage: e.target.value })} /></div>
              </>
            ) : (
              <>
                <h6 className="text-primary fw-bold mt-2 mb-1 border-bottom pb-2">ব্যান্ডউইথ বরাদ্দ (Mbps)</h6>
                <div className="col-12">
                  <div className="alert alert-info border-0 py-2 small mb-2">
                    <i className="fas fa-info-circle me-1" />
                    <strong>রেট পরিবর্তন করতে</strong> এই ফর্ম বন্ধ করে Bandwidth ট্যাবে <strong>"ব্যান্ডউইথ রেট পরিবর্তন"</strong> বাটন ব্যবহার করুন — সেখানে কার্যকর তারিখ ও log সহ পরিবর্তন করা যাবে।
                  </div>
                </div>

                {['iig', 'bdix', 'ggc', 'fna', 'cdn', 'bcdn', 'nttn'].map((k) => (
                  <React.Fragment key={k}>
                    <div className="col-md-3"><label className="form-label text-uppercase">{k === 'bcdn' ? 'Other' : k} BW (Mbps)</label><input type="number" className="form-control" value={editForm[`${k === 'nttn' ? 'nttn_capacity' : `${k}_bw`}`]} onChange={(e) => setEditForm({ ...editForm, [`${k === 'nttn' ? 'nttn_capacity' : `${k}_bw`}`]: e.target.value })} /></div>
                    <div className="col-md-3"><label className="form-label text-uppercase text-muted">{k === 'bcdn' ? 'Other' : k} Rate (Tk) <small className="text-warning">→ আলাদা বাটন</small></label><input type="number" className="form-control form-control-sm bg-light text-muted" value={editForm[`rate_${k}`]} onChange={(e) => setEditForm({ ...editForm, [`rate_${k}`]: e.target.value })} /></div>
                  </React.Fragment>
                ))}
              </>
            )}

            <div className="col-md-4"><label className="form-label fw-semibold">Projected Bill</label><input type="number" className="form-control" value={editForm.monthly_rate} onChange={(e) => setEditForm({ ...editForm, monthly_rate: e.target.value })} /></div>
            <div className="col-md-4"><label className="form-label fw-semibold">Previous Due</label><input type="number" className="form-control" value={editForm.due_amount} onChange={(e) => setEditForm({ ...editForm, due_amount: e.target.value })} /></div>
            {editForm.partner_type !== 'channel_partner' && (
              <div className="col-md-4"><label className="form-label fw-semibold">NTTN Link</label><input className="form-control" value={editForm.nttn_link} onChange={(e) => setEditForm({ ...editForm, nttn_link: e.target.value })} /></div>
            )}
            <div className="col-md-6"><label className="form-label fw-semibold">Real IP Quantity</label><input type="number" min="0" className="form-control" value={editForm.real_ip_count} onChange={(e) => setEditForm({ ...editForm, real_ip_count: e.target.value })} /></div>
            <div className="col-md-6"><label className="form-label fw-semibold">Real IP Unit Price</label><input type="number" step="0.01" min="0" className="form-control" value={editForm.real_ip_price} onChange={(e) => setEditForm({ ...editForm, real_ip_price: e.target.value })} /></div>
            {editForm.partner_type !== 'channel_partner' && (
              <>
                <div className="col-md-6">
                  <label className="form-label fw-semibold d-block">NTTN Type</label>
                  {['D2D', 'OHF', 'Longhaul'].map((item) => {
                    const checked = splitCsv(editForm.nttn_type).includes(item);
                    return (
                      <div key={item} className="form-check form-check-inline">
                        <input className="form-check-input" type="checkbox" id={`nttn_${item}`} checked={checked} onChange={() => toggleCsvValue('nttn_type', item)} />
                        <label className="form-check-label" htmlFor={`nttn_${item}`}>{item}</label>
                      </div>
                    );
                  })}
                </div>
                <div className="col-md-6">
                  <label className="form-label fw-semibold d-block">Connection Type</label>
                  {['Speed Net', 'L3'].map((item) => {
                    const checked = splitCsv(editForm.connection_type).includes(item);
                    return (
                      <div key={item} className="form-check form-check-inline">
                        <input className="form-check-input" type="checkbox" id={`con_${item}`} checked={checked} onChange={() => toggleCsvValue('connection_type', item)} />
                        <label className="form-check-label" htmlFor={`con_${item}`}>{item}</label>
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            <div className="col-12 text-end">
              <button type="button" className="btn btn-light me-2" onClick={() => setShowEdit(false)}>বন্ধ করুন</button>
              <button className="btn btn-primary" disabled={saving}>{saving ? 'সেভ হচ্ছে...' : 'আপডেট করুন'}</button>
            </div>
          </form>
        </ModalWrap>
      )}

      {/* Rate Change Modal */}
      {showRateChange && rateChangeForm && (
        <ModalWrap title="ব্যান্ডউইথ রেট পরিবর্তন করুন" onClose={() => setShowRateChange(false)}>
          <form className="row g-3" onSubmit={submitRateChange}>
            {/* Effective Date & Note */}
            <div className="col-12">
              <div className="alert alert-warning border-0 py-2 small mb-0">
                <i className="fas fa-info-circle me-1" />
                এই তারিখ থেকে নতুন রেট কার্যকর হবে। বর্তমান মাসের projected bill পুনরায় হিসাব হবে।
              </div>
            </div>
            <div className="col-md-5">
              <label className="form-label fw-bold">কার্যকর তারিখ <span className="text-danger">*</span></label>
              <input
                type="date"
                className="form-control"
                value={rateChangeForm.effective_date}
                onChange={(e) => setRateChangeForm({ ...rateChangeForm, effective_date: e.target.value })}
                required
              />
              <div className="form-text">আজকের তারিখ দিলে এখন থেকেই কার্যকর হবে।</div>
            </div>
            <div className="col-md-7">
              <label className="form-label fw-bold">কারণ / নোট</label>
              <input
                type="text"
                className="form-control"
                placeholder="যেমন: নতুন চুক্তি অনুযায়ী রেট পরিবর্তন"
                value={rateChangeForm.note}
                onChange={(e) => setRateChangeForm({ ...rateChangeForm, note: e.target.value })}
              />
            </div>

            {/* Rate Fields */}
            <div className="col-12">
              <h6 className="fw-bold text-primary border-bottom pb-2 mb-3">
                <i className="fas fa-tags me-1" />নতুন রেট (Tk/Month)
              </h6>
              <div className="row g-2">
                {[
                  { key: 'iig', label: 'IIG', icon: 'fa-globe-americas', color: 'text-primary' },
                  { key: 'bdix', label: 'BDIX', icon: 'fa-exchange-alt', color: 'text-success' },
                  { key: 'ggc', label: 'GGC', icon: 'fa-google', color: 'text-warning' },
                  { key: 'fna', label: 'FNA', icon: 'fa-network-wired', color: 'text-info' },
                  { key: 'cdn', label: 'CDN', icon: 'fa-server', color: 'text-danger' },
                  { key: 'bcdn', label: 'Other', icon: 'fa-hdd', color: 'text-secondary' },
                  { key: 'nttn', label: 'NTTN', icon: 'fa-broadcast-tower', color: 'text-dark' },
                ].map(({ key, label, icon, color }) => {
                  const rateKey = `rate_${key}`;
                  const bwKey = key === 'nttn' ? 'nttn_capacity' : `${key}_bw`;
                  const bwVal = Number(reseller[bwKey] || 0);
                  return (
                    <div key={key} className="col-md-3 col-6">
                      <div className={`card border-0 shadow-sm p-2 h-100 ${bwVal === 0 ? 'opacity-50' : ''}`}>
                        <div className="d-flex align-items-center mb-1">
                          <i className={`fas ${icon} ${color} me-2`} style={{ fontSize: 13 }} />
                          <span className="fw-bold small">{label}</span>
                          {bwVal > 0 && <span className="badge bg-light text-dark border ms-auto" style={{ fontSize: 9 }}>{bwVal} Mbps</span>}
                        </div>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          className="form-control form-control-sm"
                          value={rateChangeForm[rateKey]}
                          onChange={(e) => setRateChangeForm({ ...rateChangeForm, [rateKey]: e.target.value })}
                          disabled={bwVal === 0}
                          placeholder="0"
                        />
                        <div className="text-muted mt-1" style={{ fontSize: 10 }}>Tk/Month</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="col-12 text-end border-top pt-3">
              <button type="button" className="btn btn-light rounded-pill me-2" onClick={() => setShowRateChange(false)}>বাতিল</button>
              <button className="btn btn-warning fw-bold rounded-pill px-4" disabled={rateChangeSaving}>
                {rateChangeSaving ? <><span className="spinner-border spinner-border-sm me-1" />সেভ হচ্ছে...</> : <><i className="fas fa-save me-1" />রেট পরিবর্তন সেভ করুন</>}
              </button>
            </div>
          </form>
        </ModalWrap>
      )}

      {/* Channel Partner — Add User Modal */}
      {showAddUser && (
        <ModalWrap title="নতুন ইউজার যোগ করুন" onClose={() => setShowAddUser(false)}>
          <form className="row g-3" onSubmit={async (e) => {
            e.preventDefault();
            await addChannelUser(profileId, newUser);
            setShowAddUser(false);
            loadChannelData();
          }}>
            <div className="col-md-6"><label className="form-label fw-bold">ইউজারের নাম</label><input className="form-control" value={newUser.user_name} onChange={(e) => setNewUser({ ...newUser, user_name: e.target.value })} required /></div>
            <div className="col-md-6"><label className="form-label fw-bold">ইউজার আইডি</label><input className="form-control" value={newUser.user_id_code} onChange={(e) => setNewUser({ ...newUser, user_id_code: e.target.value })} /></div>
            <div className="col-md-4"><label className="form-label fw-bold">ফোন</label><input className="form-control" value={newUser.phone} onChange={(e) => setNewUser({ ...newUser, phone: e.target.value })} /></div>
            <div className="col-md-4"><label className="form-label fw-bold">প্যাকেজ</label><input className="form-control" value={newUser.package_name} onChange={(e) => setNewUser({ ...newUser, package_name: e.target.value })} /></div>
            <div className="col-md-4"><label className="form-label fw-bold">মাসিক রেট (Tk)</label><input type="number" step="0.01" min="0" className="form-control" value={newUser.monthly_rate} onChange={(e) => setNewUser({ ...newUser, monthly_rate: e.target.value })} /></div>
            <div className="col-12 text-end"><button type="button" className="btn btn-light rounded-pill me-2" onClick={() => setShowAddUser(false)}>বাতিল</button><button className="btn btn-primary fw-bold rounded-pill px-4">যোগ করুন</button></div>
          </form>
        </ModalWrap>
      )}

      {/* Channel Partner — Edit User Modal */}
      {showEditUser && (
        <ModalWrap title="ইউজার সম্পাদনা" onClose={() => setShowEditUser(null)}>
          <form className="row g-3" onSubmit={async (e) => {
            e.preventDefault();
            await updateChannelUser(profileId, showEditUser.id, showEditUser);
            setShowEditUser(null);
            loadChannelData();
          }}>
            <div className="col-md-6"><label className="form-label fw-bold">ইউজারের নাম</label><input className="form-control" value={showEditUser.user_name || ''} onChange={(e) => setShowEditUser({ ...showEditUser, user_name: e.target.value })} required /></div>
            <div className="col-md-6"><label className="form-label fw-bold">ইউজার আইডি</label><input className="form-control" value={showEditUser.user_id_code || ''} onChange={(e) => setShowEditUser({ ...showEditUser, user_id_code: e.target.value })} /></div>
            <div className="col-md-4"><label className="form-label fw-bold">ফোন</label><input className="form-control" value={showEditUser.phone || ''} onChange={(e) => setShowEditUser({ ...showEditUser, phone: e.target.value })} /></div>
            <div className="col-md-4"><label className="form-label fw-bold">প্যাকেজ</label><input className="form-control" value={showEditUser.package_name || ''} onChange={(e) => setShowEditUser({ ...showEditUser, package_name: e.target.value })} /></div>
            <div className="col-md-4"><label className="form-label fw-bold">মাসিক রেট (Tk)</label><input type="number" step="0.01" min="0" className="form-control" value={showEditUser.monthly_rate || ''} onChange={(e) => setShowEditUser({ ...showEditUser, monthly_rate: e.target.value })} /></div>
            <div className="col-md-6">
              <label className="form-label fw-bold">স্ট্যাটাস</label>
              <select className="form-select" value={showEditUser.status || 'active'} onChange={(e) => setShowEditUser({ ...showEditUser, status: e.target.value })}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
            <div className="col-12 text-end"><button type="button" className="btn btn-light rounded-pill me-2" onClick={() => setShowEditUser(null)}>বাতিল</button><button className="btn btn-primary fw-bold rounded-pill px-4">আপডেট করুন</button></div>
          </form>
        </ModalWrap>
      )}

      {/* Channel Partner — Commission Payment Modal */}
      {showCommissionPay && (
        <ModalWrap title="কমিশন পেমেন্ট দিন" onClose={() => setShowCommissionPay(false)}>
          <form className="row g-3" onSubmit={async (e) => {
            e.preventDefault();
            const latestLog = cpHistory.find(h => h.status === 'finalized');
            await recordCommissionPayment(profileId, {
              commission_log_id: latestLog?.id || null,
              amount: Number(commPayForm.amount),
              payment_method: commPayForm.payment_method,
              payment_date: commPayForm.payment_date,
              reference_no: commPayForm.reference_no,
              note: commPayForm.note
            });
            setShowCommissionPay(false);
            loadChannelData();
          }}>
            {cpCommission && <div className="col-12"><div className="alert alert-info py-2 small mb-0">বকেয়া কমিশন: <strong>{money(cpCommission.closing_balance)}</strong></div></div>}
            <div className="col-md-4"><label className="form-label fw-bold">পরিমাণ (Tk)</label><input type="number" step="0.01" min="0.01" className="form-control form-control-lg fw-bold text-success" value={commPayForm.amount} onChange={(e) => setCommPayForm({ ...commPayForm, amount: e.target.value })} required /></div>
            <div className="col-md-4"><label className="form-label fw-bold">তারিখ</label><input type="date" className="form-control" value={commPayForm.payment_date} onChange={(e) => setCommPayForm({ ...commPayForm, payment_date: e.target.value })} required /></div>
            <div className="col-md-4"><label className="form-label fw-bold">পেমেন্ট মেথড</label><select className="form-select" value={commPayForm.payment_method} onChange={(e) => setCommPayForm({ ...commPayForm, payment_method: e.target.value })}><option>Cash</option><option>Bank</option><option>bKash</option><option>Nagad</option><option>Rocket</option><option>Other</option></select></div>
            <div className="col-md-6"><label className="form-label fw-bold">রেফারেন্স নং</label><input className="form-control" value={commPayForm.reference_no} onChange={(e) => setCommPayForm({ ...commPayForm, reference_no: e.target.value })} /></div>
            <div className="col-md-6"><label className="form-label fw-bold">নোট</label><input className="form-control" value={commPayForm.note} onChange={(e) => setCommPayForm({ ...commPayForm, note: e.target.value })} /></div>
            <div className="col-12 text-end"><button type="button" className="btn btn-light rounded-pill me-2" onClick={() => setShowCommissionPay(false)}>বাতিল</button><button className="btn btn-success fw-bold rounded-pill px-4">পেমেন্ট নিশ্চিত করুন</button></div>
          </form>
        </ModalWrap>
      )}

      {/* Channel Partner — Adjustment Modal */}
      {showAdjust && (
        <ModalWrap title="কমিশন সমন্বয়/কর্তন" onClose={() => setShowAdjust(false)}>
          <form className="row g-3" onSubmit={async (e) => {
            e.preventDefault();
            await adjustCommission(profileId, showAdjust.id, adjForm);
            setShowAdjust(false);
            loadChannelData();
          }}>
            <div className="col-md-6">
              <label className="form-label fw-bold">টাইপ</label>
              <select className="form-select" value={adjForm.type} onChange={(e) => setAdjForm({ ...adjForm, type: e.target.value })}>
                <option value="adjustment">সমন্বয় (Adjustment)</option>
                <option value="deduction">কর্তন (Deduction)</option>
              </select>
            </div>
            <div className="col-md-6"><label className="form-label fw-bold">পরিমাণ (Tk)</label><input type="number" step="0.01" min="0.01" className="form-control" value={adjForm.amount} onChange={(e) => setAdjForm({ ...adjForm, amount: e.target.value })} required /></div>
            <div className="col-12"><label className="form-label fw-bold">কারণ/নোট</label><textarea className="form-control" rows="2" value={adjForm.note} onChange={(e) => setAdjForm({ ...adjForm, note: e.target.value })} /></div>
            <div className="col-12 text-end"><button type="button" className="btn btn-light rounded-pill me-2" onClick={() => setShowAdjust(false)}>বাতিল</button><button className="btn btn-info text-white fw-bold rounded-pill px-4">সেভ করুন</button></div>
          </form>
        </ModalWrap>
      )}
    </div>
  );
};

export default ResellerProfile;

