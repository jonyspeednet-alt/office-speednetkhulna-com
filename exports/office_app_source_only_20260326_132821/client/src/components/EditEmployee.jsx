import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { getEmployeeById, updateEmployee, getDepartments } from '../services/employeeService';
import ImageWithFallback from './ImageWithFallback';
import Swal from 'sweetalert2';
import moment from 'moment';
import '../styles/AdminDashboard.css';

const EditEmployee = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [departments, setDepartments] = useState([]);
  const [formData, setFormData] = useState({});
  const [preview, setPreview] = useState(null);
  const [greeting, setGreeting] = useState('');
  const [activeTab, setActiveTab] = useState('official');
  
  // Get current user role from localStorage
  const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
  const currentUserId = Number(currentUser?.id || 0);
  const isOwnProfile = Number(id) === currentUserId;
  const isPowerUser = ['admin', 'super admin', 'hr'].includes((currentUser.role || '').toLowerCase());

  useEffect(() => {
    const hours = new Date().getHours();
    if (hours < 12) setGreeting('শুভ সকাল');
    else if (hours < 16) setGreeting('শুভ দুপুর');
    else if (hours < 19) setGreeting('শুভ বিকাল');
    else setGreeting('শুভ রাত্রি');

    const fetchData = async () => {
      try {
        const [empData, deptData] = await Promise.all([
          getEmployeeById(id),
          getDepartments()
        ]);
        
        if (empData.joining_date) {
          empData.joining_date = moment(empData.joining_date).format('YYYY-MM-DD');
        }
        
        setFormData(empData);
        setDepartments(deptData);
        setPreview(empData.profile_pic ? `/uploads/${empData.profile_pic}` : null);
      } catch (error) {
        const unauthorized = Number(error?.response?.status) === 403;
        Swal.fire(
          unauthorized ? 'অননুমোদিত' : 'ত্রুটি',
          unauthorized ? 'আপনি শুধু নিজের প্রোফাইল সম্পাদনা করতে পারবেন।' : 'কর্মীর তথ্য লোড করা যায়নি',
          unauthorized ? 'warning' : 'error'
        );
        navigate(unauthorized ? `/profile/${id}` : '/employees');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [id, navigate]);

  const handleInputChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    setFormData({ ...formData, [e.target.name]: file });
    
    if (e.target.name === 'profile_pic' && file) {
      setPreview(URL.createObjectURL(file));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    const data = new FormData();
    Object.keys(formData).forEach(key => {
      if (formData[key] !== null && formData[key] !== undefined) {
        data.append(key, formData[key]);
      }
    });

    try {
      await updateEmployee(id, data);
      Swal.fire({
        title: 'সফল হয়েছে!',
        text: 'প্রোফাইল তথ্য আপডেট করা হয়েছে।',
        icon: 'success',
        timer: 2000,
        showConfirmButton: false
      });
    } catch (error) {
      Swal.fire('ত্রুটি', 'প্রোফাইল হালনাগাদ করা যায়নি।', 'error');
    }
  };

  if (loading) return (
    <div className="d-flex justify-content-center align-items-center vh-100 bg-light">
      <div className="spinner-modern"></div>
    </div>
  );

  return (
    <>
      <div className="container-fluid p-0">
          {/* Enhanced Header */}
          <div className="hero-panel glass-card mb-4 fade-in">
            <div className="d-flex align-items-center gap-4">
              <div className="profile-upload-wrapper">
                <ImageWithFallback 
                  src={preview} 
                  fallbackName={formData.full_name}
                  className="profile-preview-lg shadow-premium" 
                  alt="প্রোফাইল"
                  width="128px"
                  height="128px"
                />
                <label className="upload-badge shadow-sm" title="ছবি পরিবর্তন করুন">
                  <i className="fas fa-camera"></i>
                  <input type="file" name="profile_pic" className="d-none" accept="image/*" onChange={handleFileChange} />
                </label>
              </div>
              <div className="hero-content">
                <div className="hero-badge-group">
                  <span className={`hero-badge ${formData.status?.toLowerCase() === 'active' ? 'success' : 'danger'}`}>
                    <i className={`fas fa-${formData.status?.toLowerCase() === 'active' ? 'check-circle' : 'times-circle'} me-1`}></i>
                    {formData.status || 'সক্রিয়'}
                  </span>
                </div>
                <h1 className="gradient-text mb-1">{formData.full_name}</h1>
                <div className="hero-meta">
                  <span><i className="fas fa-briefcase me-1"></i> {formData.designation || 'পদবী নেই'}</span>
                  <span><i className="fas fa-envelope me-1"></i> {formData.email || 'ইমেইল নেই'}</span>
                </div>
              </div>
            </div>
            <div className="ms-auto">
                <Link to={isPowerUser ? "/employees" : "/profile"} className="btn-modern secondary py-2">
                  <i className="fas fa-chevron-left me-2"></i> ফিরে যান
                </Link>
            </div>
          </div>

          <div className="row g-4">
            {/* Navigation Tabs */}
            <div className="col-lg-3">
              <div className="glass-card p-3 h-100 sticky-top" style={{ top: '1.5rem', zIndex: 10 }}>
                <div className="nav flex-column nav-pills-modern gap-2">
                  <button 
                    className={`nav-link-modern ${activeTab === 'official' ? 'active' : ''}`}
                    onClick={() => setActiveTab('official')}
                  >
                    <i className="fas fa-building-user me-3"></i> অফিসিয়াল তথ্য
                  </button>
                  <button 
                    className={`nav-link-modern ${activeTab === 'personal' ? 'active' : ''}`}
                    onClick={() => setActiveTab('personal')}
                  >
                    <i className="fas fa-user-circle me-3"></i> ব্যক্তিগত তথ্য
                  </button>
                  <button 
                    className={`nav-link-modern ${activeTab === 'security' ? 'active' : ''}`}
                    onClick={() => setActiveTab('security')}
                  >
                    <i className="fas fa-shield-halved me-3"></i> সিকিউরিটি
                  </button>
                </div>
              </div>
            </div>

            {/* Form Content */}
            <div className="col-lg-9">
              <form onSubmit={handleSubmit}>
                <div className="glass-card p-4 h-100">
                  {activeTab === 'official' && (
                    <div className="tab-pane-modern fade-in">
                      <h4 className="fw-bold mb-4 section-title-modern">
                        <i className="fas fa-briefcase text-primary me-2"></i> অফিসিয়াল তথ্য সংশোধন
                      </h4>
                      <div className="row g-4">
                        <div className="col-md-6">
                          <label className="form-label-modern"><i className="fas fa-user text-muted me-2"></i>পুরো নাম</label>
                          <input type="text" name="full_name" className="form-input-modern" value={formData.full_name || ''} onChange={handleInputChange} disabled={!isPowerUser} />
                        </div>
                        <div className="col-md-6">
                          <label className="form-label-modern"><i className="fas fa-id-card text-muted me-2"></i>পদবী</label>
                          <input type="text" name="designation" className="form-input-modern" value={formData.designation || ''} onChange={handleInputChange} disabled={!isPowerUser} />
                        </div>
                        <div className="col-md-6">
                          <label className="form-label-modern"><i className="fas fa-sitemap text-muted me-2"></i>ডিপার্টমেন্ট</label>
                          <select name="department" className="form-input-modern" value={formData.department || ''} onChange={handleInputChange} disabled={!isPowerUser}>
                            <option value="">নির্বাচন করুন</option>
                            {departments.map(d => <option key={d.id} value={d.dept_name}>{d.dept_name}</option>)}
                          </select>
                        </div>
                        <div className="col-md-6">
                          <label className="form-label-modern"><i className="fas fa-user-tag text-muted me-2"></i>রোল (Role)</label>
                          <select name="role" className="form-input-modern" value={formData.role || ''} onChange={handleInputChange} disabled={!isPowerUser}>
                            <option value="Staff">স্টাফ</option>
                            <option value="HR">এইচআর</option>
                            <option value="Admin">অ্যাডমিন</option>
                          </select>
                        </div>
                        <div className="col-md-6">
                          <label className="form-label-modern"><i className="fas fa-toggle-on text-muted me-2"></i>স্ট্যাটাস</label>
                          <select name="status" className="form-input-modern" value={formData.status || 'Active'} onChange={handleInputChange} disabled={!isPowerUser}>
                            <option value="Active">সক্রিয়</option>
                            <option value="Inactive">নিষ্ক্রিয়</option>
                          </select>
                        </div>
                        <div className="col-md-6">
                          <label className="form-label-modern"><i className="fas fa-calendar-alt text-muted me-2"></i>যোগদানের তারিখ</label>
                          <input type="date" name="joining_date" className="form-input-modern" value={formData.joining_date || ''} onChange={handleInputChange} disabled={!isPowerUser} />
                        </div>
                      </div>
                    </div>
                  )}

                  {activeTab === 'personal' && (
                    <div className="tab-pane-modern fade-in">
                      <h4 className="fw-bold mb-4 section-title-modern">
                        <i className="fas fa-address-book text-primary me-2"></i> ব্যক্তিগত ও যোগাযোগ তথ্য
                      </h4>
                      <div className="row g-4">
                        <div className="col-md-6">
                          <label className="form-label-modern"><i className="fas fa-envelope text-muted me-2"></i>ইমেইল</label>
                          <input type="email" name="email" className="form-input-modern" value={formData.email || ''} onChange={handleInputChange} disabled={!isPowerUser} />
                        </div>
                        <div className="col-md-6">
                          <label className="form-label-modern"><i className="fas fa-phone text-muted me-2"></i>ফোন নম্বর</label>
                          <input type="text" name="phone" className="form-input-modern" value={formData.phone || ''} onChange={handleInputChange} disabled={!isPowerUser} />
                        </div>
                        <div className="col-md-6">
                          <label className="form-label-modern"><i className="fas fa-phone-flip text-muted me-2"></i>জরুরি ফোন</label>
                          <input type="text" name="emergency_phone" className="form-input-modern" value={formData.emergency_phone || ''} onChange={handleInputChange} disabled={!isPowerUser} />
                        </div>
                        <div className="col-md-6">
                          <label className="form-label-modern"><i className="fas fa-droplet text-muted me-2"></i>রক্তের গ্রুপ</label>
                          <select name="blood_group" className="form-input-modern" value={formData.blood_group || ''} onChange={handleInputChange} disabled={!isPowerUser}>
                            <option value="">নির্বাচন করুন</option>
                            {['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'].map(bg => <option key={bg} value={bg}>{bg}</option>)}
                          </select>
                        </div>
                        <div className="col-md-12">
                          <label className="form-label-modern"><i className="fas fa-id-card-clip text-muted me-2"></i>NID নম্বর</label>
                          <input type="text" name="nid_number" className="form-input-modern" value={formData.nid_number || ''} onChange={handleInputChange} disabled={!isPowerUser} />
                        </div>
                        <div className="col-md-6">
                          <label className="form-label-modern"><i className="fas fa-house-user text-muted me-2"></i>বর্তমান ঠিকানা</label>
                          <textarea name="present_address" className="form-input-modern" rows="3" value={formData.present_address || ''} onChange={handleInputChange} disabled={!isPowerUser}></textarea>
                        </div>
                        <div className="col-md-6">
                          <label className="form-label-modern"><i className="fas fa-house-chimney text-muted me-2"></i>স্থায়ী ঠিকানা</label>
                          <textarea name="permanent_address" className="form-input-modern" rows="3" value={formData.permanent_address || ''} onChange={handleInputChange} disabled={!isPowerUser}></textarea>
                        </div>
                      </div>
                    </div>
                  )}

                  {activeTab === 'security' && (
                    <div className="tab-pane-modern fade-in">
                      <h4 className="fw-bold mb-4 section-title-modern text-danger">
                        <i className="fas fa-lock text-danger me-2"></i> অ্যাকাউন্ট সিকিউরিটি
                      </h4>
                      <div className="alert-modern info mb-4 shadow-sm">
                        <i className="fas fa-info-circle me-3"></i>
                        <span>আপনার অ্যাকাউন্টের নিরাপত্তার জন্য একটি শক্তিশালী পাসওয়ার্ড ব্যবহার করুন।</span>
                      </div>
                      <div className="col-md-12">
                        <label className="form-label-modern">নতুন পাসওয়ার্ড লিখুন</label>
                        <div className="position-relative">
                          <input 
                            type="password" 
                            name="password" 
                            className="form-input-modern pe-5" 
                            placeholder="পরিবর্তন না করতে চাইলে খালি রাখুন..." 
                            onChange={handleInputChange}
                          />
                          <i className="fas fa-key position-absolute top-50 end-0 translate-middle-y me-3 text-muted"></i>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="mt-5 border-top pt-4 text-end">
                    {isOwnProfile && (
                      <button type="submit" className="btn-modern primary px-5 py-3 shadow-premium transition-all hover-scale">
                        <i className="fas fa-save me-2"></i> পরিবর্তন সংরক্ষণ
                      </button>
                    )}
                  </div>
                </div>
              </form>
            </div>
          </div>
        </div>
      
      <style dangerouslySetInnerHTML={{ __html: `
        .profile-upload-wrapper {
          position: relative;
          width: 128px;
          height: 128px;
        }
        .profile-preview-lg {
          width: 128px;
          height: 128px;
          border-radius: 2rem;
          object-fit: cover;
          border: 4px solid #fff;
        }
        .upload-badge {
          position: absolute;
          bottom: -5px;
          right: -5px;
          background: #fff;
          color: var(--primary);
          width: 36px;
          height: 36px;
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 0.2s;
          border: 1px solid var(--dash-border);
        }
        .upload-badge:hover {
          background: var(--primary);
          color: #fff;
          transform: scale(1.1);
        }
        .nav-pills-modern .nav-link-modern {
          display: flex;
          align-items: center;
          padding: 1rem 1.25rem;
          border-radius: 1rem;
          border: 1px solid transparent;
          color: var(--dash-muted);
          background: transparent;
          width: 100%;
          text-align: left;
          font-weight: 500;
          transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .nav-link-modern:hover {
          background: rgba(79, 70, 229, 0.05);
          color: var(--primary);
        }
        .nav-link-modern.active {
          background: var(--gradient-primary);
          color: #fff;
          box-shadow: var(--shadow-md);
        }
        .section-title-modern {
          position: relative;
          padding-bottom: 0.75rem;
        }
        .section-title-modern::after {
          content: '';
          position: absolute;
          bottom: 0;
          left: 0;
          width: 50px;
          height: 4px;
          background: var(--primary);
          border-radius: 999px;
        }
        .hover-scale:hover { transform: scale(1.02); }
        .transition-all { transition: all 0.2s; }
      `}} />
    </>
  );
};

export default EditEmployee;
