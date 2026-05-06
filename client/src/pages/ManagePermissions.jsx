import React, { useEffect, useMemo, useState } from 'react';
import { Modal, Spinner } from 'react-bootstrap';
import Swal from 'sweetalert2';
import { getManagePermissionsData, updatePermission } from '../services/permissionService';
import { getRoles, saveRole, deleteRole, assignRoleToUser } from '../services/roleService';
import { t } from '../i18n';
import '../styles/AdminDashboard.css';
import '../styles/ManagePermissions.css';

const permissionGroups = {
  user_management: ['p_manage_users', 'p_edit_any_profile', 'p_manage_permissions', 'p_employees'],
  leave_management: ['p_manage_leaves', 'p_leave_submission', 'p_my_leaves', 'p_approvals', 'p_entitlements', 'p_apply_leave'],
  reseller_management: [
    'p_reseller_list',
    'p_reseller_profile',
    'p_request_bw',
    'p_requests_admin',
    'p_tech_task',
    'p_billing_logs',
    'p_add_discount',
    'p_monthly_summary',
    'p_generate_bill',
    'p_invoice',
    'p_view_static_invoice',
    'p_add_reseller',
    'p_noc_view'
  ],
  assets: ['p_assets_view', 'p_assets_manage'],
  officeWork: ['p_office_work'],
  system: ['p_manage_menus', 'p_reports', 'p_notices', 'p_calendar', 'p_phone_directory', 'p_system_logs'],
  procurement: ['p_manage_procurement']
};

const groupTitle = (groupId) => {
  if (groupId === 'user_management') return t('managePermissions.userManagement');
  if (groupId === 'leave_management') return t('managePermissions.leaveManagement');
  if (groupId === 'system') return t('managePermissions.system');
  if (groupId === 'reseller_management') return t('managePermissions.resellerManagement');
  if (groupId === 'procurement') return t('managePermissions.procurement');
  if (groupId === 'assets') return t('managePermissions.assets');
  if (groupId === 'officeWork') return t('managePermissions.officeWork');
  return t('managePermissions.other');
};

const titleize = (key) =>
  String(key || '')
    .replace(/^p_/, '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (ch) => ch.toUpperCase());

const ManagePermissions = () => {
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState([]);
  const [columns, setColumns] = useState([]);
  const [roles, setRoles] = useState([]);
  const [activePermissions, setActivePermissions] = useState({});
  const [activeTab, setActiveTab] = useState('roles');
  const [search, setSearch] = useState('');
  const [overrideGroupFilter, setOverrideGroupFilter] = useState('all');
  const [showOnlyOverrides, setShowOnlyOverrides] = useState(false);
  const [message, setMessage] = useState(null);

  // Add Role Modal State
  const [showAddRoleModal, setShowAddRoleModal] = useState(false);
  const [newRoleName, setNewRoleName] = useState('');

  const fetchData = async () => {
    try {
      setLoading(true);
      const [permData, rolesData] = await Promise.all([getManagePermissionsData(), getRoles()]);
      setUsers(Array.isArray(permData.users) ? permData.users : []);
      setColumns(Array.isArray(permData.columns) ? permData.columns : []);
      setActivePermissions(permData.activePermissions || {});
      setRoles(Array.isArray(rolesData) ? rolesData : []);
    } catch {
      setMessage({ type: 'danger', text: t('managePermissions.loadFailed') });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const getColumnName = (colKey) => {
    const colObj = columns.find((c) => c.permission_column === colKey);
    return colObj?.menu_name || titleize(colKey);
  };

  const getPermissionGroup = (permissionKey) => {
    for (const [groupName, keys] of Object.entries(permissionGroups)) {
      if (keys.includes(permissionKey)) return groupName;
    }
    return 'other';
  };

  const extraPermissionKeys = useMemo(() => {
    const grouped = new Set(Object.values(permissionGroups).flat());
    return columns.map((c) => c.permission_column).filter((k) => !grouped.has(k));
  }, [columns]);

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) => String(u.full_name || '').toLowerCase().includes(q) || String(u.employee_id || '').toLowerCase().includes(q));
  }, [users, search]);

  const overrideColumns = useMemo(() => {
    if (overrideGroupFilter === 'all') return columns;
    return columns.filter((col) => getPermissionGroup(col.permission_column) === overrideGroupFilter);
  }, [columns, overrideGroupFilter]);

  const overrideGroupOptions = useMemo(() => {
    const discovered = new Set(columns.map((c) => getPermissionGroup(c.permission_column)));
    return ['all', ...Array.from(discovered)];
  }, [columns]);

  const totalPermissions = columns.length;
  const roleCount = roles.length;
  const userCount = users.length;
  const overrideCount = useMemo(
    () => Object.values(activePermissions || {}).reduce((acc, row) => acc + Object.values(row || {}).filter(Boolean).length, 0),
    [activePermissions]
  );

  const handleRoleToggle = async (role, permissionKey) => {
    const updated = { ...(role.permissions || {}) };
    if (updated[permissionKey]) delete updated[permissionKey];
    else updated[permissionKey] = true;

    try {
      await saveRole({ ...role, permissions: updated });
      setRoles((prev) => prev.map((r) => (r.id === role.id ? { ...r, permissions: updated } : r)));
    } catch {
      setMessage({ type: 'danger', text: t('managePermissions.roleUpdateFailed') });
    }
  };

  const handleAddRole = async (e) => {
    e.preventDefault();
    if (!newRoleName.trim()) return;
    try {
      await saveRole({ name: newRoleName.trim(), permissions: {} });
      setNewRoleName('');
      setShowAddRoleModal(false);
      Swal.fire(t('managePermissions.roleCreated'), '', 'success');
      fetchData();
    } catch {
      Swal.fire(t('managePermissions.roleUpdateFailed'), '', 'error');
    }
  };

  const handleDeleteRole = async (roleId) => {
    const result = await Swal.fire({
      title: t('managePermissions.deleteRoleConfirm'),
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      cancelButtonColor: '#64748b',
      confirmButtonText: t('manageLeaves.confirmYes'),
      cancelButtonText: t('manageLeaves.cancel'),
    });

    if (result.isConfirmed) {
      try {
        await deleteRole(roleId);
        Swal.fire(t('managePermissions.roleDeleted'), '', 'success');
        fetchData();
      } catch (err) {
        Swal.fire(t('managePermissions.roleDeleteFailed'), '', 'error');
      }
    }
  };

  const handleUserOverrideToggle = async (userId, column, currentValue) => {
    const newValue = currentValue ? 0 : 1;
    setActivePermissions((prev) => ({ ...prev, [userId]: { ...(prev[userId] || {}), [column]: newValue === 1 } }));
    try {
      await updatePermission(userId, column, newValue);
    } catch {
      setActivePermissions((prev) => ({ ...prev, [userId]: { ...(prev[userId] || {}), [column]: currentValue } }));
      setMessage({ type: 'danger', text: t('managePermissions.overrideUpdateFailed') });
    }
  };

  const handleAssignRole = async (userId, roleId) => {
    try {
      await assignRoleToUser(userId, roleId);
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, role_id: roleId ? Number(roleId) : null } : u)));
      setMessage({ type: 'info', text: t('managePermissions.roleAssigned') });
    } catch {
      setMessage({ type: 'danger', text: t('managePermissions.roleAssignFailed') });
    }
  };

  const handleClearUserOverrides = async (userId) => {
    const existing = activePermissions[userId] || {};
    const enabled = Object.entries(existing)
      .filter(([, val]) => !!val)
      .map(([key]) => key);

    if (enabled.length === 0) return;

    const snapshot = { ...existing };
    const resetState = { ...existing };
    enabled.forEach((key) => {
      resetState[key] = false;
    });
    setActivePermissions((prev) => ({ ...prev, [userId]: resetState }));

    try {
      await Promise.all(enabled.map((permissionKey) => updatePermission(userId, permissionKey, 0)));
      setMessage({ type: 'info', text: t('managePermissions.overrideCleared') });
    } catch {
      setActivePermissions((prev) => ({ ...prev, [userId]: snapshot }));
      setMessage({ type: 'danger', text: t('managePermissions.overrideClearFailed') });
    }
  };

  if (loading) {
    return (
      <div className="d-flex flex-column align-items-center justify-content-center py-5">
        <Spinner animation="border" variant="primary" />
        <p className="mt-3 text-muted fw-bold">{t('managePermissions.loading')}</p>
      </div>
    );
  }

  return (
    <div className="manage-permissions-page">
      <section className="mp-hero">
        <div>
          <span className="mp-chip"><i className="fas fa-shield-alt" /> {t('managePermissions.accessControl')}</span>
          <h1>{t('managePermissions.centerTitle')}</h1>
          <p>{t('managePermissions.centerSubtitle')}</p>
        </div>
        <div className="mp-metrics">
          <article><span>{t('managePermissions.totalRoles')}</span><strong>{roleCount}</strong></article>
          <article><span>{t('managePermissions.totalUsers')}</span><strong>{userCount}</strong></article>
          <article><span>{t('managePermissions.permissions')}</span><strong>{totalPermissions}</strong></article>
          <article><span>{t('managePermissions.overrides')}</span><strong>{overrideCount}</strong></article>
        </div>
      </section>

      <section className="mp-toolbar">
        <div className="nav nav-pills gap-2">
          <button className={`nav-link btn-sm fw-bold ${activeTab === 'roles' ? 'active' : 'text-dark'}`} onClick={() => setActiveTab('roles')}>{t('managePermissions.tabRoles')}</button>
          <button className={`nav-link btn-sm fw-bold ${activeTab === 'users' ? 'active' : 'text-dark'}`} onClick={() => setActiveTab('users')}>{t('managePermissions.tabUsers')}</button>
          <button className={`nav-link btn-sm fw-bold ${activeTab === 'overrides' ? 'active' : 'text-dark'}`} onClick={() => setActiveTab('overrides')}>{t('managePermissions.tabOverrides')}</button>
        </div>
        {(activeTab === 'users' || activeTab === 'overrides') && (
          <div className="mp-search">
            <i className="fas fa-search" />
            <input type="text" placeholder={t('managePermissions.searchUser')} value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        )}
        {activeTab === 'roles' && (
          <button className="btn btn-primary fw-bold" onClick={() => setShowAddRoleModal(true)}>
            <i className="fas fa-plus-circle me-2" /> {t('managePermissions.addRole')}
          </button>
        )}
      </section>

      {message && (
        <div className={`mp-alert ${message.type === 'danger' ? 'danger' : 'info'}`}>
          <i className={`fas ${message.type === 'danger' ? 'fa-circle-exclamation' : 'fa-circle-info'}`} />
          <span>{message.text}</span>
        </div>
      )}

      {activeTab === 'roles' && (
        <div className="roles-section">
          {roles.map((role) => (
            <div key={role.id} className="mp-table-card mb-4 border-0 shadow-sm overflow-hidden">
              <header className="bg-white border-bottom border-light">
                <div>
                  <div className="d-flex align-items-center gap-3">
                    <h2 className="mb-0 text-primary">{role.name}</h2>
                    {role.name.toLowerCase() !== 'super admin' && (
                      <button className="btn btn-outline-danger btn-sm rounded-circle border-0" onClick={() => handleDeleteRole(role.id)} title={t('managePermissions.deleteRole')}>
                        <i className="fas fa-trash-alt" />
                      </button>
                    )}
                  </div>
                  <p className="mt-1 small">{t('managePermissions.defaultMatrix')}</p>
                </div>
                <span className="badge rounded-pill bg-primary-subtle text-primary border border-primary-subtle px-3 py-2">
                  {Object.keys(role.permissions || {}).length} {t('managePermissions.enabled')}
                </span>
              </header>

              <div className="p-4 bg-white">
                {Object.entries(permissionGroups).map(([groupId, perms]) => (
                  <div key={groupId} className="mb-4">
                    <h6 className="fw-bold text-secondary mb-3 text-uppercase small">{groupTitle(groupId)}</h6>
                    <div className="d-flex flex-wrap gap-2">
                      {perms.map((pKey) => (
                        <label key={pKey} className="role-permission-label">
                          <input
                            type="checkbox"
                            className="form-check-input m-0"
                            checked={!!role.permissions?.[pKey]}
                            onChange={() => handleRoleToggle(role, pKey)}
                          />
                          <span className="small fw-bold">{getColumnName(pKey)}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}

                {extraPermissionKeys.length > 0 && (
                  <div className="mb-2">
                    <h6 className="fw-bold text-secondary mb-3 text-uppercase small">{t('managePermissions.other')}</h6>
                    <div className="d-flex flex-wrap gap-2">
                      {extraPermissionKeys.map((pKey) => (
                        <label key={pKey} className="role-permission-label">
                          <input
                            type="checkbox"
                            className="form-check-input m-0"
                            checked={!!role.permissions?.[pKey]}
                            onChange={() => handleRoleToggle(role, pKey)}
                          />
                          <span className="small fw-bold">{getColumnName(pKey)}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'users' && (
        <div className="mp-table-card mt-2 border-0 shadow-sm overflow-hidden">
          <table className="table mp-table align-middle mb-0">
            <thead><tr><th>{t('managePermissions.employee')}</th><th>{t('managePermissions.currentRole')}</th><th>{t('managePermissions.action')}</th></tr></thead>
            <tbody>
              {filteredUsers.map((user) => (
                <tr key={user.id}>
                  <td className="mp-user-col"><strong>{user.full_name}</strong><small>{user.employee_id}</small></td>
                  <td><span className="badge rounded-pill bg-light text-dark border px-3 py-2">{roles.find((r) => r.id === user.role_id)?.name || t('managePermissions.defaultRole')}</span></td>
                  <td>
                    <select className="form-select form-select-sm w-auto" value={user.role_id || ''} onChange={(e) => handleAssignRole(user.id, e.target.value)}>
                      <option value="">{t('managePermissions.selectRole')}</option>
                      {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === 'overrides' && (
        <div className="mp-table-card mt-2 border-0 shadow-sm overflow-hidden table-responsive">
          <div className="p-4 border-bottom bg-light-subtle">
            <div className="mp-override-controls">
              <div className="d-flex align-items-center gap-3 flex-wrap">
                <div className="d-flex align-items-center gap-2">
                  <label className="small text-muted fw-bold text-uppercase mb-0">{t('managePermissions.permissionGroup')}</label>
                  <select className="form-select form-select-sm mp-filter-select" value={overrideGroupFilter} onChange={(e) => setOverrideGroupFilter(e.target.value)}>
                    {overrideGroupOptions.map((g) => (
                      <option key={g} value={g}>{g === 'all' ? t('managePermissions.allWithCount', { count: columns.length }) : groupTitle(g)}</option>
                    ))}
                  </select>
                </div>
                <label className="d-inline-flex align-items-center gap-2 small mb-0 fw-bold">
                  <input type="checkbox" className="form-check-input m-0" checked={showOnlyOverrides} onChange={(e) => setShowOnlyOverrides(e.target.checked)} />
                  <span>{t('managePermissions.showOnlyOverridden')}</span>
                </label>
              </div>
              <small className="text-primary fw-bold"><i className="fas fa-info-circle me-1" />{t('managePermissions.roleEnabledLocked')}</small>
            </div>
          </div>

          <table className="table mp-table align-middle mb-0">
            <thead>
              <tr><th>{t('managePermissions.employee')}</th>{overrideColumns.map((col) => <th key={col.permission_column}>{getColumnName(col.permission_column)}</th>)}</tr>
            </thead>
            <tbody>
              {filteredUsers
                .filter((user) => !showOnlyOverrides || Object.values(activePermissions[user.id] || {}).some(Boolean))
                .map((user) => {
                  const userRole = roles.find((r) => r.id === user.role_id);
                  const userOverrides = activePermissions[user.id] || {};
                  const userOverrideCount = Object.values(userOverrides).filter(Boolean).length;

                  return (
                    <tr key={user.id}>
                      <td className="mp-user-col">
                        <strong>{user.full_name}</strong>
                        <small>{user.employee_id}</small>
                        <div className="d-flex align-items-center gap-2 mt-1">
                          <span className="badge rounded-pill bg-primary-subtle text-primary border-0">{userRole?.name || t('managePermissions.staff')}</span>
                          {userOverrideCount > 0 && (
                            <button
                              className="btn btn-link btn-sm p-0 text-danger text-decoration-none fw-bold small"
                              onClick={() => handleClearUserOverrides(user.id)}
                              type="button"
                            >
                              {t('managePermissions.clearOverrides', { count: userOverrideCount })}
                            </button>
                          )}
                        </div>
                      </td>

                      {overrideColumns.map((col) => {
                        const roleHasIt = !!userRole?.permissions?.[col.permission_column];
                        const userHasOverride = !!userOverrides[col.permission_column];
                        const isActive = roleHasIt || userHasOverride;

                        return (
                          <td key={col.permission_column}>
                            <label className={`mp-switch ${roleHasIt ? 'locked' : ''}`} title={roleHasIt ? t('managePermissions.enabledByRole') : t('managePermissions.userOverride')}>
                              <input
                                type="checkbox"
                                checked={isActive}
                                disabled={roleHasIt}
                                onChange={() => handleUserOverrideToggle(user.id, col.permission_column, userHasOverride)}
                              />
                              <span className="mp-slider" />
                            </label>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      )}

      {/* Add Role Modal */}
      <Modal show={showAddRoleModal} onHide={() => setShowAddRoleModal(false)} centered className="mp-modal">
        <Modal.Header closeButton className="border-0 px-4 pt-4">
          <Modal.Title className="fw-bold text-primary">{t('managePermissions.addRole')}</Modal.Title>
        </Modal.Header>
        <Modal.Body className="px-4 pb-4">
          <form onSubmit={handleAddRole}>
            <div className="mb-4">
              <label className="form-label small fw-bold text-secondary text-uppercase">{t('managePermissions.roleName')}</label>
              <input
                type="text"
                className="form-control form-control-lg border-2"
                placeholder={t('managePermissions.roleNamePlaceholder')}
                value={newRoleName}
                onChange={(e) => setNewRoleName(e.target.value)}
                required
                autoFocus
              />
            </div>
            <div className="d-flex gap-2">
              <button type="button" className="btn btn-light btn-lg flex-grow-1 fw-bold" onClick={() => setShowAddRoleModal(false)}>{t('employees.cancel')}</button>
              <button type="submit" className="btn btn-primary btn-lg flex-grow-1 fw-bold">{t('managePermissions.saveRole')}</button>
            </div>
          </form>
        </Modal.Body>
      </Modal>
    </div>
  );
};

export default ManagePermissions;

