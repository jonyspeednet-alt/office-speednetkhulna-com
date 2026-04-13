import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Modal } from 'react-bootstrap';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Swal from 'sweetalert2';
import ImageWithFallback from '../components/ImageWithFallback';
import { getEmployees, getDepartments, getNextEmployeeId, addEmployee } from '../services/employeeService';
import { t } from '../i18n';
import '../styles/AdminDashboard.css';
import '../styles/Employees.css';

const Employees = () => {
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState({ search: '', dept: '' });
  const loggedInUser = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem('user') || '{}');
    } catch {
      return {};
    }
  }, []);
  const canAddEmployee = useMemo(() => {
    const perms = loggedInUser?.permissions || {};
    return Boolean(
      loggedInUser?.all_access ||
      loggedInUser?.p_manage_users ||
      loggedInUser?.['users.manage'] ||
      perms.all_access ||
      perms.p_manage_users ||
      perms['users.manage']
    );
  }, [loggedInUser]);

  const [debouncedSearch, setDebouncedSearch] = useState(filters.search);
  React.useEffect(() => {
    const handler = setTimeout(() => setDebouncedSearch(filters.search), 400);
    return () => clearTimeout(handler);
  }, [filters.search]);

  const [showModal, setShowModal] = useState(false);
  const [generatedId, setGeneratedId] = useState(t('employees.generating'));
  const [formData, setFormData] = useState({
    role: 'Staff',
    blood_group: '',
    emergency_phone: '',
    present_address: '',
    permanent_address: '',
    nid_number: ''
  });

  const { data: departments = [] } = useQuery({
    queryKey: ['departments'],
    queryFn: getDepartments,
  });

  const { data: employees = [], isLoading: loading } = useQuery({
    queryKey: ['employees', debouncedSearch, filters.dept],
    queryFn: () => getEmployees({ search: debouncedSearch, dept: filters.dept }),
    placeholderData: (previousData) => previousData,
  });

  const addMutation = useMutation({
    mutationFn: addEmployee,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      setShowModal(false);
      Swal.fire(t('employees.successTitle'), t('employees.addSuccess'), 'success');
    },
    onError: (error) => {
      Swal.fire(t('employees.errorTitle'), error.response?.data?.message || t('employees.addFailed'), 'error');
    }
  });

  const stats = useMemo(() => {
    const active = employees.filter((emp) => String(emp.status || 'Active').toLowerCase() === 'active').length;
    return {
      total: employees.length,
      active,
      inactive: Math.max(employees.length - active, 0)
    };
  }, [employees]);

  const handleFilterChange = (event) => {
    setFilters((prev) => ({ ...prev, [event.target.name]: event.target.value }));
  };

  const handleReset = () => {
    setFilters({ search: '', dept: '' });
  };

  const openAddModal = async () => {
    if (!canAddEmployee) {
      Swal.fire(t('employees.unauthorizedTitle'), t('employees.unauthorizedAdd'), 'warning');
      return;
    }
    setShowModal(true);
    setGeneratedId(t('employees.generating'));
    try {
      const nextId = await getNextEmployeeId();
      setGeneratedId(nextId);
      setFormData((prev) => ({
        ...prev,
        employee_id: nextId,
        role: 'Staff',
        joining_date: new Date().toISOString().split('T')[0]
      }));
    } catch {
      setGeneratedId(t('employees.generateError'));
    }
  };

  const handleInputChange = (event) => {
    setFormData((prev) => ({ ...prev, [event.target.name]: event.target.value }));
  };

  const handleFileChange = (event) => {
    setFormData((prev) => ({ ...prev, [event.target.name]: event.target.files[0] }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const payload = new FormData();
    Object.keys(formData).forEach((key) => {
      if (formData[key] !== undefined && formData[key] !== null) {
        payload.append(key, formData[key]);
      }
    });
    addMutation.mutate(payload);
  };

  return (
    <>
      <section className="emp-hero">
        <div>
          <span className="emp-chip">
            <i className="fas fa-users-cog"></i>
            {t('employees.heroTag')}
          </span>
          <h1>{t('employees.heroTitle')}</h1>
          <p>{t('employees.heroSubtitle')}</p>
        </div>
        <div className="emp-hero-side">
          <div className="emp-metrics">
            <article>
              <span>{t('employees.total')}</span>
              <strong>{stats.total}</strong>
            </article>
            <article>
              <span>{t('employees.active')}</span>
              <strong>{stats.active}</strong>
            </article>
            <article>
              <span>{t('employees.inactive')}</span>
              <strong>{stats.inactive}</strong>
            </article>
          </div>
          {canAddEmployee && (
            <button className="emp-add-btn" onClick={openAddModal}>
              <i className="fas fa-user-plus"></i>
              {t('employees.addEmployee')}
            </button>
          )}
        </div>
      </section>

      <section className="emp-filter-card">
        <form onSubmit={(e) => e.preventDefault()} className="emp-filter-form">
          <div className="emp-input with-icon">
            <i className="fas fa-search"></i>
            <input
              type="text"
              name="search"
              placeholder={t('employees.searchPlaceholder')}
              value={filters.search}
              onChange={handleFilterChange}
            />
            {filters.search && (
              <button type="button" className="clear-btn" onClick={() => setFilters((prev) => ({ ...prev, search: '' }))}>
                <i className="fas fa-times"></i>
              </button>
            )}
          </div>

          <select name="dept" value={filters.dept} onChange={handleFilterChange}>
            <option value="">{t('employees.allDepartments')}</option>
            {departments.map((dept) => (
              <option key={dept.id} value={dept.dept_name}>
                {dept.dept_name}
              </option>
            ))}
          </select>

          <button type="button" className="emp-btn secondary" onClick={handleReset}>
            <i className="fas fa-rotate"></i>
            {t('employees.reset')}
          </button>
        </form>
      </section>

      <section className="emp-table-card">
        <header>
          <h2>{t('employees.listTitle')}</h2>
          <p>{loading ? t('employees.loadingRecords') : t('employees.foundCount', { count: employees.length })}</p>
        </header>

        <div className="table-responsive">
          <table className="table align-middle mb-0 emp-table">
            <thead>
              <tr>
                <th>{t('employees.memberDetails')}</th>
                <th>{t('employees.contact')}</th>
                <th>{t('employees.officeInfo')}</th>
                <th>{t('employees.status')}</th>
                <th>{t('employees.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan="5" className="text-center py-5">
                    <div className="spinner-border text-primary" role="status"></div>
                  </td>
                </tr>
              )}

              {!loading && employees.length === 0 && (
                <tr>
                  <td colSpan="5" className="text-center py-5 text-muted">
                    {t('employees.noEmployees')}
                  </td>
                </tr>
              )}

              {!loading &&
                employees.map((user) => (
                  <tr key={user.id}>
                    <td>
                      <Link to={`/profile/${user.id}`} className="text-decoration-none emp-user-cell">
                        <ImageWithFallback
                          src={user.profile_pic && user.profile_pic !== 'default.png' ? `/uploads/${user.profile_pic}` : null}
                          fallbackName={user.full_name}
                          className="emp-avatar"
                          alt={t('employees.profileAlt')}
                          width="44px"
                          height="44px"
                        />
                        <div>
                          <strong>{user.full_name}</strong>
                          <small>{user.designation || t('employees.positionNa')}</small>
                        </div>
                      </Link>
                    </td>
                    <td>
                      <div className="emp-contact">
                        <div>
                          <i className="fas fa-phone"></i>
                          {user.phone || t('employees.na')}
                        </div>
                        <div>
                          <i className="fas fa-droplet"></i>
                          {t('employees.bloodLabel')}: {user.blood_group || t('employees.bloodUnknown')}
                        </div>
                      </div>
                    </td>
                    <td>
                      <div className="emp-office">
                        <strong>{user.department || t('employees.general')}</strong>
                        <span>{user.role || t('employees.staff')}</span>
                      </div>
                    </td>
                    <td>
                      <span className={`emp-status ${String(user.status || 'Active').toLowerCase() === 'active' ? 'active' : 'inactive'}`}>
                        {String(user.status || 'Active').toLowerCase() === 'active' ? t('employees.active') : t('employees.inactive')}
                      </span>
                    </td>
                    <td>
                      <div className="emp-actions">
                        <Link title={t('employees.viewProfile')} to={`/profile/${user.id}`}>
                          <i className="fas fa-eye"></i>
                        </Link>
                        {Number(user.id) === Number(loggedInUser?.id) && (
                          <Link title={t('employees.editProfile')} to={`/edit-employee/${user.id}`} className="edit">
                            <i className="fas fa-user-edit"></i>
                          </Link>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </section>

      <Modal show={showModal} onHide={() => setShowModal(false)} size="lg" centered className="emp-modal">
        <Modal.Header closeButton className="border-0 pt-4 px-4 bg-white rounded-top-4">
          <Modal.Title className="fw-bold">
            <i className="fas fa-user-plus text-primary me-2"></i>
            {t('employees.modalTitle')}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body className="p-4 bg-white rounded-bottom-4">
          <form onSubmit={handleSubmit}>
            <div className="row g-3">
              <div className="col-12">
                <div className="emp-form-section">{t('employees.sectionBasic')}</div>
              </div>

              <div className="col-md-4">
                <label className="emp-form-label">{t('employees.employeeId')}</label>
                <input type="text" name="employee_id" className="emp-form-input bg-light fw-bold text-primary" value={generatedId} readOnly />
              </div>
              <div className="col-md-8">
                <label className="emp-form-label">{t('employees.fullName')}</label>
                <input type="text" name="full_name" className="emp-form-input" onChange={handleInputChange} required />
              </div>
              <div className="col-md-6">
                <label className="emp-form-label">{t('employees.email')}</label>
                <input type="email" name="email" className="emp-form-input" onChange={handleInputChange} />
              </div>
              <div className="col-md-6">
                <label className="emp-form-label">{t('employees.phone')}</label>
                <input type="text" name="phone" className="emp-form-input" onChange={handleInputChange} required />
              </div>

              <div className="col-12 mt-2">
                <div className="emp-form-section">{t('employees.sectionOfficial')}</div>
              </div>

              <div className="col-md-4">
                <label className="emp-form-label">{t('employees.department')}</label>
                <select name="department" className="emp-form-input" onChange={handleInputChange} required>
                  <option value="">{t('employees.selectDepartment')}</option>
                  {departments.map((dept) => (
                    <option key={dept.id} value={dept.dept_name}>
                      {dept.dept_name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="col-md-4">
                <label className="emp-form-label">{t('employees.designation')}</label>
                <input type="text" name="designation" className="emp-form-input" onChange={handleInputChange} />
              </div>
              <div className="col-md-4">
                <label className="emp-form-label">{t('employees.role')}</label>
                <select name="role" className="emp-form-input" onChange={handleInputChange}>
                  <option value="Staff">{t('employees.staff')}</option>
                  <option value="Admin">{t('employees.roleAdmin')}</option>
                  <option value="HR">{t('employees.roleHr')}</option>
                  <option value="Manager">{t('employees.roleManager')}</option>
                </select>
              </div>
              <div className="col-md-4">
                <label className="emp-form-label">{t('employees.status')}</label>
                <select name="status" className="emp-form-input" onChange={handleInputChange}>
                  <option value="Active">{t('employees.active')}</option>
                  <option value="Inactive">{t('employees.inactive')}</option>
                </select>
              </div>

              <div className="col-12 mt-2">
                <div className="emp-form-section">{t('employees.sectionAdditional')}</div>
              </div>

              <div className="col-md-4">
                <label className="emp-form-label">{t('employees.bloodGroup')}</label>
                <select name="blood_group" className="emp-form-input" onChange={handleInputChange}>
                  <option value="">{t('employees.select')}</option>
                  {['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map((blood) => (
                    <option key={blood} value={blood}>
                      {blood}
                    </option>
                  ))}
                </select>
              </div>
              <div className="col-md-4">
                <label className="emp-form-label">{t('employees.emergencyPhone')}</label>
                <input type="text" name="emergency_phone" className="emp-form-input" onChange={handleInputChange} />
              </div>
              <div className="col-md-4">
                <label className="emp-form-label">{t('employees.nidNumber')}</label>
                <input type="text" name="nid_number" className="emp-form-input" onChange={handleInputChange} />
              </div>
              <div className="col-md-6">
                <label className="emp-form-label">{t('employees.presentAddress')}</label>
                <textarea name="present_address" className="emp-form-input" rows="2" onChange={handleInputChange}></textarea>
              </div>
              <div className="col-md-6">
                <label className="emp-form-label">{t('employees.permanentAddress')}</label>
                <textarea name="permanent_address" className="emp-form-input" rows="2" onChange={handleInputChange}></textarea>
              </div>

              <div className="col-md-6">
                <label className="emp-form-label">{t('employees.joiningDate')}</label>
                <input
                  type="date"
                  name="joining_date"
                  className="emp-form-input"
                  defaultValue={new Date().toISOString().split('T')[0]}
                  onChange={handleInputChange}
                />
              </div>
              <div className="col-md-6">
                <label className="emp-form-label">{t('employees.profilePic')}</label>
                <input type="file" name="profile_pic" className="emp-form-input" onChange={handleFileChange} accept="image/*" />
              </div>
            </div>

            <div className="mt-4 text-end">
              <button type="button" className="emp-btn secondary me-2" onClick={() => setShowModal(false)}>
                {t('employees.cancel')}
              </button>
              <button type="submit" className="emp-btn primary">
                {t('employees.saveEmployee')}
              </button>
            </div>
          </form>
        </Modal.Body>
      </Modal>
    </>
  );
};

export default Employees;
