import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Swal from 'sweetalert2';
import { getLeaveFormData, submitLeaveRequest } from '../services/leaveSubmissionService';
import '../styles/AdminDashboard.css';
import '../styles/ApplyLeave.css';

const ApplyLeave = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [data, setData] = useState(null);

  const [reason, setReason] = useState('');
  const [items, setItems] = useState([
    { id: 1, leave_type_id: '', start_date: '', end_date: '', half_day_period: 'Morning' }
  ]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const result = await getLeaveFormData();
        setData(result);
      } catch (error) {
        Swal.fire('ত্রুটি', 'ফর্ম ডেটা লোড করা যায়নি', 'error');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const calculateDays = (startStr, endStr) => {
    if (!startStr || !endStr || !data) return { days: 0, hasOffDay: false };

    const start = new Date(startStr);
    const end = new Date(endStr);
    const offDay = data.weeklyOff;

    if (end < start) return { days: 0, error: 'তারিখের পরিসর সঠিক নয়' };

    let days = 0;
    let hasOffDay = false;
    const current = new Date(start);

    while (current <= end) {
      const dayName = current.toLocaleDateString('en-US', { weekday: 'long' });
      if (dayName !== offDay) {
        days += 1;
      } else {
        hasOffDay = true;
      }
      current.setDate(current.getDate() + 1);
    }

    return { days, hasOffDay };
  };

  const handleItemChange = (id, field, value) => {
    setItems((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;

        const updated = { ...item, [field]: value };
        if (field === 'leave_type_id' && value === '3' && updated.start_date) {
          updated.end_date = updated.start_date;
        }
        if (field === 'start_date' && updated.leave_type_id === '3') {
          updated.end_date = value;
        }
        return updated;
      })
    );
  };

  const addItem = () => {
    setItems((prev) => [...prev, { id: Date.now(), leave_type_id: '', start_date: '', end_date: '', half_day_period: 'Morning' }]);
  };

  const removeItem = (id) => {
    if (items.length > 1) {
      setItems((prev) => prev.filter((item) => item.id !== id));
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    for (const item of items) {
      const { days, hasOffDay } = calculateDays(item.start_date, item.end_date);
      if (item.leave_type_id !== '3' && days === 0 && hasOffDay) {
        Swal.fire('ত্রুটি', `নির্বাচিত তারিখ আপনার সাপ্তাহিক ছুটির দিন (${data.weeklyOff}).`, 'error');
        return;
      }
      if (new Date(item.end_date) < new Date(item.start_date)) {
        Swal.fire('ত্রুটি', 'শেষের তারিখ শুরুর তারিখের আগে হতে পারবে না।', 'error');
        return;
      }
    }

    setSubmitting(true);
    try {
      await submitLeaveRequest({ reason, items });
      await Swal.fire({
        icon: 'success',
        title: 'সফল',
        text: 'ছুটির আবেদন সফলভাবে জমা হয়েছে।',
        confirmButtonColor: '#1d4ed8'
      });
      navigate('/my-leaves');
    } catch (error) {
      Swal.fire('ত্রুটি', error.message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const summaryCards = useMemo(() => {
    if (!data) return [];
    return [
      {
        title: `চলতি বছর (${data.years.current})`,
        quota: data.quotaThisYear,
        entitlements: data.entitlements[data.years.current] || {}
      },
      {
        title: `পরবর্তী বছর (${data.years.next})`,
        quota: data.quotaNextYear,
        entitlements: data.entitlements[data.years.next] || {}
      }
    ];
  }, [data]);

  const quotaTypes = [
    { key: 'Holiday', label: 'সাধারণ ছুটি', color: '#155eef', defaultLimit: 12 },
    { key: 'Festival', label: 'উৎসব ছুটি', color: '#0f9d58', defaultLimit: 8 },
    { key: 'Half Day', label: 'অর্ধদিবস', color: '#f59f00', defaultLimit: 0 },
    { key: 'Unpaid', label: 'বেতনবিহীন', color: '#dc3545', defaultLimit: 0 }
  ];

  if (loading) {
    return (
      <div className="d-flex justify-content-center align-items-center h-100 py-5">
        <div className="spinner-border text-primary" role="status"></div>
      </div>
    );
  }

  return (
    <>
      <section className="al-hero">
          <div>
            <span className="al-chip">
              <i className="fas fa-paper-plane"></i>
              ছুটির আবেদন
            </span>
            <h1>ছুটির আবেদন করুন</h1>
            <p>এক বা একাধিক লাইনে আবেদন করুন, সাথে রিয়েল-টাইম দিন যাচাই।</p>
          </div>
          <div className="al-hero-stats">
            <article>
              <span>সাপ্তাহিক ছুটি</span>
              <strong>{data.weeklyOff}</strong>
            </article>
            <article>
              <span>মাসিক ছুটির সীমা</span>
              <strong>{data.holidayCap.cap}</strong>
            </article>
            <article>
              <span>ব্যবহৃত</span>
              <strong>{data.holidayCap.used}</strong>
            </article>
            <article>
              <span>অবশিষ্ট</span>
              <strong>{data.holidayCap.remain}</strong>
            </article>
          </div>
        </section>

        <section className="al-topbar">
          <Link to="/my-leaves" className="al-link-btn">
            <i className="fas fa-list"></i>
            আমার ছুটির তালিকা
          </Link>
        </section>

        <div className="row g-4">
          <div className="col-xl-7">
            <section className="al-form-card">
              <form onSubmit={handleSubmit}>
                {items.map((item, index) => {
                  const { days, hasOffDay, error } = calculateDays(item.start_date, item.end_date);
                  const isHalfDay = item.leave_type_id === '3';

                  return (
                    <article key={item.id} className="al-item-card">
                      <header>
                        <h3>ছুটির লাইন #{index + 1}</h3>
                        {items.length > 1 && (
                          <button type="button" className="line-remove" onClick={() => removeItem(item.id)}>
                            <i className="fas fa-trash"></i>
                            বাদ দিন
                          </button>
                        )}
                      </header>

                      <div className="row g-3">
                        <div className="col-12">
                          <label className="al-label">ছুটির ধরন</label>
                          <select
                            className="al-input"
                            value={item.leave_type_id}
                            onChange={(e) => handleItemChange(item.id, 'leave_type_id', e.target.value)}
                            required
                          >
                            <option value="">ছুটির ধরন নির্বাচন করুন</option>
                            {data.leaveTypes.map((type) => (
                              <option key={type.id} value={type.id}>
                                {type.name}
                              </option>
                            ))}
                          </select>
                        </div>

                        {isHalfDay && (
                          <div className="col-12">
                            <div className="al-halfday-box">
                              <label className="al-label mb-2">অর্ধদিবস সময়</label>
                              <div className="d-flex flex-wrap gap-3">
                                <label className="al-radio">
                                  <input
                                    type="radio"
                                    name={`half_${item.id}`}
                                    checked={item.half_day_period === 'Morning'}
                                    onChange={() => handleItemChange(item.id, 'half_day_period', 'Morning')}
                                  />
                                  <span>সকাল</span>
                                </label>
                                <label className="al-radio">
                                  <input
                                    type="radio"
                                    name={`half_${item.id}`}
                                    checked={item.half_day_period === 'Evening'}
                                    onChange={() => handleItemChange(item.id, 'half_day_period', 'Evening')}
                                  />
                                  <span>বিকাল</span>
                                </label>
                              </div>
                            </div>
                          </div>
                        )}

                        <div className="col-md-6">
                          <label className="al-label">শুরুর তারিখ</label>
                          <input
                            type="date"
                            className="al-input"
                            value={item.start_date}
                            onChange={(e) => handleItemChange(item.id, 'start_date', e.target.value)}
                            required
                          />
                        </div>
                        <div className="col-md-6">
                          <label className="al-label">শেষের তারিখ {isHalfDay && '(স্বয়ংক্রিয়)'}</label>
                          <input
                            type="date"
                            className="al-input"
                            value={item.end_date}
                            onChange={(e) => handleItemChange(item.id, 'end_date', e.target.value)}
                            readOnly={isHalfDay}
                            required
                          />
                        </div>

                        {item.start_date && item.end_date && (
                          <div className="col-12">
                            <div className={`al-info ${error || (days === 0 && hasOffDay) ? 'error' : 'ok'}`}>
                              {error
                                ? error
                                : isHalfDay
                                  ? `অর্ধদিবস (${item.half_day_period === 'Morning' ? 'সকাল' : 'বিকাল'})`
                                  : days === 0 && hasOffDay
                                    ? `নির্বাচিত তারিখ সাপ্তাহিক ছুটি (${data.weeklyOff})`
                                    : `কার্যদিবস: ${days}`}
                            </div>
                          </div>
                        )}
                      </div>
                    </article>
                  );
                })}

                <button type="button" onClick={addItem} className="al-add-line">
                  <i className="fas fa-plus-circle"></i>
                  আরও একটি লাইন যোগ করুন
                </button>

                <div className="mt-3">
                  <label className="al-label">কারণ</label>
                  <textarea
                    className="al-input"
                    rows="4"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="ছুটির কারণ লিখুন"
                    required
                  ></textarea>
                </div>

                <button type="submit" className="al-submit" disabled={submitting}>
                  {submitting ? 'জমা হচ্ছে...' : 'ছুটির আবেদন জমা দিন'}
                </button>
              </form>
            </section>
          </div>

          <div className="col-xl-5">
            {summaryCards.map((section) => (
              <section key={section.title} className="al-summary-card">
                <h4>{section.title}</h4>
                <div className="al-quota-list">
                  {quotaTypes.map((type) => {
                    const used = section.quota[type.key] || 0;
                    const entitled = section.entitlements[type.key];
                    const limit = entitled !== undefined ? entitled : type.defaultLimit;
                    const remaining = typeof limit === 'number' ? Math.max(limit - used, 0) : null;

                    return (
                      <article key={type.key} style={{ '--accent': type.color }}>
                        <div>
                          <strong>{type.label}</strong>
                          <span>
                            ব্যবহৃত: {used}
                            {typeof limit === 'number' ? ` / ${limit}` : ''}
                          </span>
                        </div>
                        <b>{remaining !== null ? `অবশিষ্ট: ${remaining}` : '-'}</b>
                      </article>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        </div>
    </>
  );
};

export default ApplyLeave;
