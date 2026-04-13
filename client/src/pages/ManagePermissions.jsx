import React, { useEffect, useMemo, useState } from 'react';
import { getManagePermissionsData, updatePermission } from '../services/permissionService';
import { getRoles, saveRole, assignRoleToUser } from '../services/roleService';
import { t } from '../i18n';
import '../styles/AdminDashboard.css';
import '../styles/ManagePermissions.css';

const permissionGroups = {
  user_management: ['p_manage_users', 'p_edit_any_profile', 'p_manage_permissions', 'p_employees'],
  leave_management: ['p_manage_leaves', 'p_leave_submission', 'p_my_leaves', 'p_approvals', 'p_entitlements', 'p_apply_leave'],
  system: ['p_manage_menus', 'p_manage_permissions', 'p_reports', 'p_notices', 'p_calendar', 'p_phone_directory', 'p_system_logs'],
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
  procurement: ['p_manage_procurement']
};

const groupTitle = (groupId) => {
  if (groupId === 'user_management') return t('managePermissions.userManagement');
  if (groupId === 'leave_management') return t('managePermissions.leaveManagement');
  if (groupId === 'system') return t('managePermissions.system');
  if (groupId === 'reseller_management') return t('managePermissions.resellerManagement');
  if (groupId === 'procurement') return t('managePermissions.procurement');
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

  useEffect(() => {
    const run = async () => {
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
    run();
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

  if (loading) return <div className="p-3">{t('managePermissions.loading')}</div>;

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
        <div className="d-flex flex-wrap gap-2">
          <button className={`btn btn-sm ${activeTab === 'roles' ? 'btn-primary' : 'btn-light'}`} onClick={() => setActiveTab('roles')}>{t('managePermissions.tabRoles')}</button>
          <button className={`btn btn-sm ${activeTab === 'users' ? 'btn-primary' : 'btn-light'}`} onClick={() => setActiveTab('users')}>{t('managePermissions.tabUsers')}</button>
          <button className={`btn btn-sm ${activeTab === 'overrides' ? 'btn-primary' : 'btn-light'}`} onClick={() => setActiveTab('overrides')}>{t('managePermissions.tabOverrides')}</button>
        </div>
        {(activeTab === 'users' || activeTab === 'overrides') && (
          <div className="mp-search">
            <i className="fas fa-search" />
            <input type="text" placeholder={t('managePermissions.searchUser')} value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        )}
      </section>

      {message && (
        <div className={`mp-alert ${message.type === 'danger' ? 'danger' : 'info'} mt-3`}>
          <i className={`fas ${message.type === 'danger' ? 'fa-triangle-exclamation' : 'fa-circle-info'}`} />
          <span>{message.text}</span>
        </div>
      )}

      {activeTab === 'roles' && (
        <div className="roles-section mt-4">
          {roles.map((role) => (
            <div key={role.id} className="mp-table-card mb-4">
              <header>
                <div>
                  <h2>{t('managePermissions.rolePermissions', { role: role.name })}</h2>
                  <p>{t('managePermissions.defaultMatrix')}</p>
                </div>
                <span className="badge rounded-pill text-bg-light border">
                  {Object.keys(role.permissions || {}).length} {t('managePermissions.enabled')}
                </span>
              </header>

              <div className="p-3">
                {Object.entries(permissionGroups).map(([groupId, perms]) => (
                  <div key={groupId} className="mb-3">
                    <h6 className="fw-bold text-dark mb-2">{groupTitle(groupId)}</h6>
                    <div className="d-flex flex-wrap gap-2">
                      {perms.map((pKey) => (
                        <label key={pKey} className="d-inline-flex align-items-center gap-2 border rounded-pill px-3 py-2 bg-white">
                          <input
                            type="checkbox"
                            className="form-check-input m-0"
                            checked={!!role.permissions?.[pKey]}
                            onChange={() => handleRoleToggle(role, pKey)}
                          />
                          <span className="small fw-semibold">{getColumnName(pKey)}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}

                {extraPermissionKeys.length > 0 && (
                  <div className="mb-3">
                    <h6 className="fw-bold text-dark mb-2">{t('managePermissions.other')}</h6>
                    <div className="d-flex flex-wrap gap-2">
                      {extraPermissionKeys.map((pKey) => (
                        <label key={pKey} className="d-inline-flex align-items-center gap-2 border rounded-pill px-3 py-2 bg-white">
                          <input
                            type="checkbox"
                            className="form-check-input m-0"
                            checked={!!role.permissions?.[pKey]}
                            onChange={() => handleRoleToggle(role, pKey)}
                          />
                          <span className="small fw-semibold">{getColumnName(pKey)}</span>
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
        <div className="mp-table-card mt-4 p-3">
          <table className="table mp-table align-middle mb-0">
            <thead><tr><th>{t('managePermissions.employee')}</th><th>{t('managePermissions.currentRole')}</th><th>{t('managePermissions.action')}</th></tr></thead>
            <tbody>
              {filteredUsers.map((user) => (
                <tr key={user.id}>
                  <td className="mp-user-col"><strong>{user.full_name}</strong><small>{user.employee_id}</small></td>
                  <td><span className="badge rounded-pill text-bg-light border">{roles.find((r) => r.id === user.role_id)?.name || t('managePermissions.defaultRole')}</span></td>
                  <td>
                    <select className="form-select form-select-sm" value={user.role_id || ''} onChange={(e) => handleAssignRole(user.id, e.target.value)}>
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
        <div className="mp-table-card mt-4 p-3 table-responsive">
          <div className="mp-override-controls mb-3">
            <div className="d-flex align-items-center gap-2 flex-wrap">
              <label className="small text-muted fw-semibold mb-0">{t('managePermissions.permissionGroup')}</label>
              <select className="form-select form-select-sm mp-filter-select" value={overrideGroupFilter} onChange={(e) => setOverrideGroupFilter(e.target.value)}>
                {overrideGroupOptions.map((g) => (
                  <option key={g} value={g}>{g === 'all' ? t('managePermissions.allWithCount', { count: columns.length }) : groupTitle(g)}</option>
                ))}
              </select>
              <label className="d-inline-flex align-items-center gap-2 small mb-0">
                <input type="checkbox" checked={showOnlyOverrides} onChange={(e) => setShowOnlyOverrides(e.target.checked)} />
                <span>{t('managePermissions.showOnlyOverridden')}</span>
              </label>
            </div>
            <small className="text-muted">{t('managePermissions.roleEnabledLocked')}</small>
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
                        <span>{userRole?.name || t('managePermissions.staff')}</span>
                        <button
                          className="btn btn-link btn-sm p-0 mt-1 mp-clear-btn"
                          onClick={() => handleClearUserOverrides(user.id)}
                          disabled={userOverrideCount === 0}
                          type="button"
                        >
                          {t('managePermissions.clearOverrides', { count: userOverrideCount })}
                        </button>
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
    </div>
  );
};

export default ManagePermissions;
