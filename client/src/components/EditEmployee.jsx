import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { getEmployeeById, updateEmployee, getDepartments } from '../services/employeeService';
import ImageWithFallback from './ImageWithFallback';
import Swal from 'sweetalert2';
import moment from 'moment';
import '../styles/EditEmployee.css';

const EditEmployee = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [departments, setDepartments] = useState([]);
    const [formData, setFormData] = useState({});
    const [preview, setPreview] = useState(null);
    const [activeTab, setActiveTab] = useState('official');
    
    // Get current user role from localStorage
    const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
    const currentUserId = Number(currentUser?.id || 0);
    const isOwnProfile = Number(id) === currentUserId;
    const isPowerUser = ['admin', 'super admin', 'hr'].includes((currentUser.role || '').toLowerCase());

    useEffect(() => {
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
        <div className="edit-employee-page">
            {/* Hero Header Section */}
            <div className="hero-header fade-in-up">
                <div className="d-flex align-items-center gap-4 flex-wrap flex-md-nowrap">
                    <div className="profile-pic-container">
                        <ImageWithFallback 
                            src={preview} 
                            fallbackName={formData.full_name}
                            className="profile-pic-modern" 
                            alt="প্রোফাইল"
                        />
                        <label className="upload-overlay" title="ছবি পরিবর্তন করুন">
                            <i className="fas fa-camera"></i>
                            <input type="file" name="profile_pic" className="d-none" accept="image/*" onChange={handleFileChange} />
                        </label>
                    </div>
                    <div>
                        <div className="mb-2">
                            <span className={`badge rounded-pill px-3 py-2 ${formData.status?.toLowerCase() === 'active' ? 'bg-success' : 'bg-danger'}`}>
                                <i className={`fas fa-${formData.status?.toLowerCase() === 'active' ? 'check-circle' : 'times-circle'} me-1`}></i>
                                {formData.status || 'সক্রিয়'}
                            </span>
                        </div>
                        <h1 className="fw-800 m-0 text-white" style={{ fontSize: '2.5rem', letterSpacing: '-1px' }}>{formData.full_name}</h1>
                        <div className="d-flex gap-3 mt-2 opacity-75">
                            <span><i className="fas fa-briefcase me-1"></i> {formData.designation || 'পদবী নেই'}</span>
                            <span><i className="fas fa-sitemap me-1"></i> {formData.department || 'বিভাগ নেই'}</span>
                        </div>
                    </div>
                </div>
                <div className="mt-4 mt-lg-0">
                    <Link to={isPowerUser ? "/employees" : "/profile"} className="btn-back-premium">
                        <i className="fas fa-arrow-left me-2"></i> ফিরে যান
                    </Link>
                </div>
            </div>

            <div className="row g-4">
                {/* Navigation Sidebar */}
                <div className="col-lg-3">
                    <div className="nav-pills-premium glass-card-modern fade-in-up" style={{ animationDelay: '0.1s' }}>
                        <button 
                            className={`nav-link-premium ${activeTab === 'official' ? 'active' : ''}`}
                            onClick={() => setActiveTab('official')}
                        >
                            <i className="fas fa-building-columns"></i> অফিসিয়াল তথ্য
                        </button>
                        <button 
                            className={`nav-link-premium ${activeTab === 'personal' ? 'active' : ''}`}
                            onClick={() => setActiveTab('personal')}
                        >
                            <i className="fas fa-user-gear"></i> ব্যক্তিগত তথ্য
                        </button>
                        <button 
                            className={`nav-link-premium ${activeTab === 'security' ? 'active' : ''}`}
                            onClick={() => setActiveTab('security')}
                        >
                            <i className="fas fa-shield-halved"></i> সিকিউরিটি
                        </button>
                    </div>
                </div>

                {/* Form Section */}
                <div className="col-lg-9">
                    <form onSubmit={handleSubmit} className="fade-in-up" style={{ animationDelay: '0.2s' }}>
                        <div className="glass-card-modern">
                            {activeTab === 'official' && (
                                <div className="tab-pane">
                                    <h4 className="fw-bold mb-4 d-flex align-items-center gap-2">
                                        <div style={{ width: '4px', height: '24px', background: 'var(--emp-primary)', borderRadius: '2px' }}></div>
                                        অফিসিয়াল তথ্য সংশোধন
                                    </h4>
                                    <div className="row">
                                        <div className="col-md-6">
                                            <label className="form-label-premium">পুরো নাম</label>
                                            <div className="input-group-premium">
                                                <input type="text" name="full_name" className="form-control-premium" value={formData.full_name || ''} onChange={handleInputChange} disabled={!isPowerUser} />
                                                <i className="fas fa-user input-icon-premium"></i>
                                            </div>
                                        </div>
                                        <div className="col-md-6">
                                            <label className="form-label-premium">পদবী</label>
                                            <div className="input-group-premium">
                                                <input type="text" name="designation" className="form-control-premium" value={formData.designation || ''} onChange={handleInputChange} disabled={!isPowerUser} />
                                                <i className="fas fa-id-badge input-icon-premium"></i>
                                            </div>
                                        </div>
                                        <div className="col-md-6">
                                            <label className="form-label-premium">ডিপার্টমেন্ট</label>
                                            <div className="input-group-premium">
                                                <select name="department" className="form-control-premium" value={formData.department || ''} onChange={handleInputChange} disabled={!isPowerUser}>
                                                    <option value="">নির্বাচন করুন</option>
                                                    {departments.map(d => <option key={d.id} value={d.dept_name}>{d.dept_name}</option>)}
                                                </select>
                                                <i className="fas fa-sitemap input-icon-premium"></i>
                                            </div>
                                        </div>
                                        <div className="col-md-6">
                                            <label className="form-label-premium">রোল (Role)</label>
                                            <div className="input-group-premium">
                                                <select name="role" className="form-control-premium" value={formData.role || ''} onChange={handleInputChange} disabled={!isPowerUser}>
                                                    <option value="Staff">স্টাফ</option>
                                                    <option value="HR">এইচআর</option>
                                                    <option value="Admin">অ্যাডমিন</option>
                                                </select>
                                                <i className="fas fa-user-shield input-icon-premium"></i>
                                            </div>
                                        </div>
                                        <div className="col-md-6">
                                            <label className="form-label-premium">স্ট্যাটাস</label>
                                            <div className="input-group-premium">
                                                <select name="status" className="form-control-premium" value={formData.status || 'Active'} onChange={handleInputChange} disabled={!isPowerUser}>
                                                    <option value="Active">সক্রিয়</option>
                                                    <option value="Inactive">নিষ্ক্রিয়</option>
                                                </select>
                                                <i className="fas fa-circle-check input-icon-premium"></i>
                                            </div>
                                        </div>
                                        <div className="col-md-6">
                                            <label className="form-label-premium">যোগদানের তারিখ</label>
                                            <div className="input-group-premium">
                                                <input type="date" name="joining_date" className="form-control-premium" value={formData.joining_date || ''} onChange={handleInputChange} disabled={!isPowerUser} />
                                                <i className="fas fa-calendar-days input-icon-premium"></i>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {activeTab === 'personal' && (
                                <div className="tab-pane">
                                    <h4 className="fw-bold mb-4 d-flex align-items-center gap-2">
                                        <div style={{ width: '4px', height: '24px', background: 'var(--emp-primary)', borderRadius: '2px' }}></div>
                                        ব্যক্তিগত ও যোগাযোগ তথ্য
                                    </h4>
                                    <div className="row">
                                        <div className="col-md-6">
                                            <label className="form-label-premium">ইমেইল</label>
                                            <div className="input-group-premium">
                                                <input type="email" name="email" className="form-control-premium" value={formData.email || ''} onChange={handleInputChange} disabled={!isPowerUser} />
                                                <i className="fas fa-envelope input-icon-premium"></i>
                                            </div>
                                        </div>
                                        <div className="col-md-6">
                                            <label className="form-label-premium">ফোন নম্বর</label>
                                            <div className="input-group-premium">
                                                <input type="text" name="phone" className="form-control-premium" value={formData.phone || ''} onChange={handleInputChange} disabled={!isPowerUser} />
                                                <i className="fas fa-phone input-icon-premium"></i>
                                            </div>
                                        </div>
                                        <div className="col-md-6">
                                            <label className="form-label-premium">জরুরি ফোন</label>
                                            <div className="input-group-premium">
                                                <input type="text" name="emergency_phone" className="form-control-premium" value={formData.emergency_phone || ''} onChange={handleInputChange} disabled={!isPowerUser} />
                                                <i className="fas fa-phone-volume input-icon-premium"></i>
                                            </div>
                                        </div>
                                        <div className="col-md-6">
                                            <label className="form-label-premium">রক্তের গ্রুপ</label>
                                            <div className="input-group-premium">
                                                <select name="blood_group" className="form-control-premium" value={formData.blood_group || ''} onChange={handleInputChange} disabled={!isPowerUser}>
                                                    <option value="">নির্বাচন করুন</option>
                                                    {['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'].map(bg => <option key={bg} value={bg}>{bg}</option>)}
                                                </select>
                                                <i className="fas fa-droplet input-icon-premium"></i>
                                            </div>
                                        </div>
                                        <div className="col-md-12">
                                            <label className="form-label-premium">NID নম্বর</label>
                                            <div className="input-group-premium">
                                                <input type="text" name="nid_number" className="form-control-premium" value={formData.nid_number || ''} onChange={handleInputChange} disabled={!isPowerUser} />
                                                <i className="fas fa-address-card input-icon-premium"></i>
                                            </div>
                                        </div>
                                        <div className="col-md-6">
                                            <label className="form-label-premium">বর্তমান ঠিকানা</label>
                                            <div className="input-group-premium">
                                                <textarea name="present_address" className="form-control-premium" rows="3" style={{ paddingLeft: '16px' }} value={formData.present_address || ''} onChange={handleInputChange} disabled={!isPowerUser}></textarea>
                                            </div>
                                        </div>
                                        <div className="col-md-6">
                                            <label className="form-label-premium">স্থায়ী ঠিকানা</label>
                                            <div className="input-group-premium">
                                                <textarea name="permanent_address" className="form-control-premium" rows="3" style={{ paddingLeft: '16px' }} value={formData.permanent_address || ''} onChange={handleInputChange} disabled={!isPowerUser}></textarea>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {activeTab === 'security' && (
                                <div className="tab-pane">
                                    <h4 className="fw-bold mb-4 d-flex align-items-center gap-2 text-danger">
                                        <div style={{ width: '4px', height: '24px', background: '#ee5d50', borderRadius: '2px' }}></div>
                                        অ্যাকাউন্ট সিকিউরিটি
                                    </h4>
                                    <div className="alert bg-light border-0 rounded-4 p-4 mb-4 d-flex align-items-start gap-3">
                                        <i className="fas fa-shield-check text-primary mt-1" style={{ fontSize: '1.5rem' }}></i>
                                        <div>
                                            <h6 className="fw-bold m-0 mb-1">নিরাপত্তা পরামর্শ</h6>
                                            <p className="m-0 text-muted small">আপনার অ্যাকাউন্টের নিরাপত্তার জন্য কমপক্ষে ৮ অক্ষরের একটি শক্তিশালী পাসওয়ার্ড ব্যবহার করুন।</p>
                                        </div>
                                    </div>
                                    <div className="col-md-12">
                                        <label className="form-label-premium">নতুন পাসওয়ার্ড</label>
                                        <div className="input-group-premium">
                                            <input 
                                                type="password" 
                                                name="password" 
                                                className="form-control-premium" 
                                                placeholder="পরিবর্তন না করতে চাইলে খালি রাখুন..." 
                                                onChange={handleInputChange}
                                            />
                                            <i className="fas fa-lock-keyhole input-icon-premium"></i>
                                        </div>
                                    </div>
                                </div>
                            )}

                            <div className="mt-5 pt-4 border-top text-end">
                                {(isOwnProfile || isPowerUser) && (
                                    <button type="submit" className="btn-save-premium">
                                        <i className="fas fa-cloud-arrow-up"></i> পরিবর্তন সংরক্ষণ করুন
                                    </button>
                                )}
                            </div>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
};

export default EditEmployee;
