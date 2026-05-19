import Swal from "sweetalert2";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  getManagePermissionsData,
  updatePermission,
} from "../services/permissionService";
import {
  getRoles,
  saveRole,
  deleteRole,
  assignRoleToUser,
} from "../services/roleService";
import { t } from "../i18n";
import "../styles/AdminDashboard.css";
import "../styles/ManagePermissions.css";

const permissionGroups = {
  user_management: ["p_manage_users", "p_edit_any_profile", "p_employees"],
  leave_management: [
    "p_manage_leaves",
    "p_leave_submission",
    "p_my_leaves",
    "p_approvals",
    "p_entitlements",
    "p_apply_leave",
  ],
  reseller_management: [
    "p_reseller_list",
    "p_reseller_profile",
    "p_request_bw",
    "p_requests_admin",
    "p_tech_task",
    "p_billing_logs",
    "p_add_discount",
    "p_monthly_summary",
    "p_generate_bill",
    "p_invoice",
    "p_view_static_invoice",
    "p_add_reseller",
    "p_noc_view",
  ],
  assets: ["p_assets_view", "p_assets_manage"],
  officeWork: ["p_office_work"],
  system: [
    "p_manage_menus",
    "p_reports",
    "p_notices",
    "p_calendar",
    "p_phone_directory",
    "p_system_logs",
  ],
  procurement: ["p_manage_procurement"],
  work_tracker: ["p_office_work_tracker", "p_work_tracker_admin"],
  asset: ["p_asset_management"],
};

const GROUP_ICONS = {
  user_management: "fa-users-cog",
  leave_management: "fa-calendar-check",
  system: "fa-cog",
  reseller_management: "fa-network-wired",
  procurement: "fa-boxes-stacked",
  work_tracker: "fa-briefcase",
  asset: "fa-layer-group",
  assets: "fa-cubes",
  officeWork: "fa-building",
  other: "fa-shield-halved",
};

const groupTitle = (g) => {
  if (g === "user_management") return t("managePermissions.userManagement");
  if (g === "leave_management") return t("managePermissions.leaveManagement");
  if (g === "system") return t("managePermissions.system");
  if (g === "reseller_management")
    return t("managePermissions.resellerManagement");
  if (g === "procurement") return t("managePermissions.procurement");
  if (g === "work_tracker") return t("managePermissions.workTracker");
  if (g === "asset") return t("managePermissions.asset");
  if (g === "assets") return t("managePermissions.assets");
  if (g === "officeWork") return t("managePermissions.officeWork");
  return t("managePermissions.other");
};

const titleize = (k) =>
  String(k || "")
    .replace(/^p_/, "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());

const useAutoMessage = () => {
  const [msg, setMsg] = useState(null);
  const t = useRef(null);
  const show = useCallback((type, text) => {
    setMsg({ type, text });
    clearTimeout(t.current);
    t.current = setTimeout(() => setMsg(null), 4000);
  }, []);
  return [msg, show];
};

const ManagePermissions = () => {
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState([]);
  const [columns, setColumns] = useState([]);
  const [roles, setRoles] = useState([]);
  const [activePermissions, setActivePermissions] = useState({});
  const [activeTab, setActiveTab] = useState("roles");
  const [search, setSearch] = useState("");
  const [overrideGroupFilter, setOverrideGroupFilter] = useState("all");
  const [showOnlyOverrides, setShowOnlyOverrides] = useState(false);
  const [message, showMessage] = useAutoMessage();
  const [collapsedRoles, setCollapsedRoles] = useState({});
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [newRoleName, setNewRoleName] = useState("");
  const [savingRole, setSavingRole] = useState(false);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [permData, rolesData] = await Promise.all([
        getManagePermissionsData(),
        getRoles(),
      ]);
      setUsers(Array.isArray(permData.users) ? permData.users : []);
      setColumns(Array.isArray(permData.columns) ? permData.columns : []);
      setActivePermissions(permData.activePermissions || {});
      setRoles(Array.isArray(rolesData) ? rolesData : []);
    } catch {
      showMessage("danger", t("managePermissions.loadFailed"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const getColName = (k) =>
    columns.find((c) => c.permission_column === k)?.menu_name || titleize(k);
  const getGroup = (pk) => {
    for (const [g, ks] of Object.entries(permissionGroups)) {
      if (ks.includes(pk)) return g;
    }
    return "other";
  };

  const extraKeys = useMemo(() => {
    const grouped = new Set(Object.values(permissionGroups).flat());
    return columns
      .map((c) => c.permission_column)
      .filter((k) => !grouped.has(k));
  }, [columns]);

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) =>
        String(u.full_name || "")
          .toLowerCase()
          .includes(q) ||
        String(u.employee_id || "")
          .toLowerCase()
          .includes(q) ||
        String(u.role || "")
          .toLowerCase()
          .includes(q),
    );
  }, [users, search]);

  const overrideColumns = useMemo(
    () =>
      overrideGroupFilter === "all"
        ? columns
        : columns.filter(
            (c) => getGroup(c.permission_column) === overrideGroupFilter,
          ),
    [columns, overrideGroupFilter],
  );

  const overrideGroupOptions = useMemo(
    () => [
      "all",
      ...Array.from(new Set(columns.map((c) => getGroup(c.permission_column)))),
    ],
    [columns],
  );

  const overrideCount = useMemo(
    () =>
      Object.values(activePermissions || {}).reduce(
        (a, r) => a + Object.values(r || {}).filter(Boolean).length,
        0,
      ),
    [activePermissions],
  );

  const roleUserCount = useMemo(() => {
    const m = {};
    users.forEach((u) => {
      if (u.role_id) m[u.role_id] = (m[u.role_id] || 0) + 1;
    });
    return m;
  }, [users]);

  const handleRoleToggle = async (role, pk) => {
    const previous = { ...(role.permissions || {}) };
    const updated = { ...previous };
    if (updated[pk]) delete updated[pk];
    else updated[pk] = true;
    setRoles((p) =>
      p.map((r) => (r.id === role.id ? { ...r, permissions: updated } : r)),
    );
    try {
      await saveRole({ ...role, permissions: updated });
      showMessage("info", `Updated "${role.name}"`);
    } catch (err) {
      console.error("Role toggle error:", err);
      setRoles((p) =>
        p.map((r) => (r.id === role.id ? { ...r, permissions: previous } : r)),
      );
      showMessage("danger", "Role update failed");
    }
  };

  const handleOverrideToggle = async (uid, col, cur) => {
    const nv = cur ? 0 : 1;
    setActivePermissions((p) => ({
      ...p,
      [uid]: { ...(p[uid] || {}), [col]: nv === 1 },
    }));
    try {
      await updatePermission(uid, col, nv);
    } catch (err) {
      console.error("Override error:", err);
      setActivePermissions((p) => ({
        ...p,
        [uid]: { ...(p[uid] || {}), [col]: cur },
      }));
      showMessage("danger", "Override failed");
    }
  };

  const handleAssignRole = async (uid, rid) => {
    try {
      await assignRoleToUser(uid, rid);
      setUsers((p) =>
        p.map((u) =>
          u.id === uid ? { ...u, role_id: rid ? Number(rid) : null } : u,
        ),
      );
      showMessage("info", "Role assigned");
    } catch (err) {
      console.error("Assign role error:", err);
      showMessage("danger", err.message || "Assign failed");
    }
  };

  const handleClearOverrides = async (uid) => {
    const ex = activePermissions[uid] || {};
    const enabled = Object.entries(ex)
      .filter(([, v]) => !!v)
      .map(([k]) => k);
    if (!enabled.length) return;
    const snap = { ...ex };
    setActivePermissions((p) => ({
      ...p,
      [uid]: Object.fromEntries(Object.keys(ex).map((k) => [k, false])),
    }));
    const results = await Promise.allSettled(
      enabled.map((pk) => updatePermission(uid, pk, 0)),
    );
    const failed = results.filter((r) => r.status === "rejected").length;
    if (failed > 0) {
      const failedKeys = enabled.filter(
        (_, i) => results[i].status === "rejected",
      );
      const restore = Object.fromEntries(failedKeys.map((k) => [k, snap[k]]));
      setActivePermissions((p) => ({ ...p, [uid]: { ...p[uid], ...restore } }));
      showMessage("danger", `${failed} override(s) failed to clear`);
    } else {
      showMessage("info", "All overrides cleared");
    }
  };

  const handleCreateRole = async (e) => {
    e.preventDefault();
    if (!newRoleName.trim()) return;
    setSavingRole(true);
    try {
      const res = await saveRole({ name: newRoleName.trim(), permissions: {} });
      if (!res?.role) throw new Error("Server did not return the created role");
      const nr = res.role;
      setRoles((p) => [...p, nr]);
      setNewRoleName("");
      setShowRoleModal(false);
      showMessage("info", `Role "${nr.name}" created`);
    } catch (err) {
      console.error("Create role error:", err);
      showMessage("danger", err.message || "Create failed");
    } finally {
      setSavingRole(false);
    }
  };

  const handleDeleteRole = async (role) => {
    const uc = roleUserCount[role.id] || 0;
    if (uc > 0) {
      showMessage(
        "danger",
        `Cannot delete "${role.name}" — ${uc} user(s) assigned`,
      );
      return;
    }
    const confirmed = await Swal.fire({
      title: `Delete role "${role.name}"?`,
      text: "This action cannot be undone.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#d33",
      cancelButtonColor: "#6c757d",
      confirmButtonText: "Delete",
      cancelButtonText: "Cancel",
    });
    if (!confirmed.isConfirmed) return;
    try {
      await deleteRole(role.id);
      setRoles((p) => p.filter((r) => r.id !== role.id));
      showMessage("info", `"${role.name}" deleted`);
    } catch (err) {
      console.error("Delete role error:", err);
      showMessage("danger", err.message || "Delete failed");
    }
  };

  if (loading)
    return (
      <div className="manage-permissions-page">
        <div className="mp-skeleton-hero" />
        <div className="mp-skeleton-bar" />
        {[1, 2, 3].map((i) => (
          <div key={i} className="mp-skeleton-card" />
        ))}
      </div>
    );

  return (
    <div className="manage-permissions-page">
      <section className="mp-hero">
        <div>
          <span className="mp-chip">
            <i className="fas fa-shield-alt" /> Access Control
          </span>
          <h1>Permission Management</h1>
          <p>Manage role-based access and user overrides</p>
        </div>
        <div className="mp-metrics">
          <article>
            <span>Roles</span>
            <strong>{roles.length}</strong>
          </article>
          <article>
            <span>Users</span>
            <strong>{users.length}</strong>
          </article>
          <article>
            <span>Permissions</span>
            <strong>{columns.length}</strong>
          </article>
          <article>
            <span>Overrides</span>
            <strong>{overrideCount}</strong>
          </article>
        </div>
      </section>

      {message && (
        <div
          className={`mp-alert ${message.type === "danger" ? "danger" : "info"}`}
        >
          <i
            className={`fas ${message.type === "danger" ? "fa-triangle-exclamation" : "fa-circle-check"}`}
          />
          <span>{message.text}</span>
        </div>
      )}

      <section className="mp-toolbar">
        <div className="mp-tabs">
          {[
            ["roles", "fa-layer-group", "Roles", roles.length],
            ["users", "fa-users", "Users", users.length],
            ["overrides", "fa-sliders", "Overrides", overrideCount],
          ].map(([id, icon, label, cnt]) => (
            <button
              key={id}
              className={`mp-tab ${activeTab === id ? "active" : ""}`}
              onClick={() => setActiveTab(id)}
            >
              <i className={`fas ${icon}`} /> {label}
              <span className="mp-tab-badge">{cnt}</span>
            </button>
          ))}
        </div>
        <div className="d-flex align-items-center gap-2">
          {(activeTab === "users" || activeTab === "overrides") && (
            <div className="mp-search">
              <i className="fas fa-search" />
              <input
                type="text"
                placeholder="Search name, ID, role..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {search && (
                <button
                  className="mp-search-clear"
                  onClick={() => setSearch("")}
                  type="button"
                >
                  <i className="fas fa-times" />
                </button>
              )}
            </div>
          )}
          {activeTab === "roles" && (
            <button
              className="mp-btn-primary"
              onClick={() => setShowRoleModal(true)}
            >
              <i className="fas fa-plus" /> New Role
            </button>
          )}
        </div>
      </section>

      {activeTab === "roles" && (
        <div className="roles-section">
          {roles.map((role) => {
            const isCollapsed = !!collapsedRoles[role.id];
            const enabledCnt = Object.keys(role.permissions || {}).length;
            const uc = roleUserCount[role.id] || 0;
            return (
              <div key={role.id} className="mp-table-card mb-3">
                <header>
                  <div className="d-flex align-items-center gap-2 flex-wrap">
                    <button
                      className="mp-collapse-btn"
                      onClick={() =>
                        setCollapsedRoles((p) => ({
                          ...p,
                          [role.id]: !p[role.id],
                        }))
                      }
                      type="button"
                    >
                      <i
                        className={`fas fa-chevron-${isCollapsed ? "right" : "down"}`}
                      />
                    </button>
                    <h2>{role.name}</h2>
                    <span className="mp-role-badge enabled">
                      {enabledCnt} perms
                    </span>
                    <span className="mp-role-badge users">{uc} users</span>
                  </div>
                  <button
                    className="mp-delete-role-btn"
                    onClick={() => handleDeleteRole(role)}
                    disabled={uc > 0}
                    type="button"
                    title="Delete role"
                  >
                    <i className="fas fa-trash" />
                  </button>
                </header>
                {!isCollapsed && (
                  <div className="p-3">
                    {Object.entries(permissionGroups).map(([gid, perms]) => (
                      <div key={gid} className="mp-perm-group mb-3">
                        <div className="mp-group-label">
                          <i
                            className={`fas ${GROUP_ICONS[gid] || "fa-shield-halved"}`}
                          />{" "}
                          {groupTitle(gid)}
                          <span className="mp-group-count">
                            {
                              perms.filter((k) => !!role.permissions?.[k])
                                .length
                            }
                            /{perms.length}
                          </span>
                        </div>
                        <div className="d-flex flex-wrap gap-2">
                          {perms.map((pk) => (
                            <label
                              key={pk}
                              className={`mp-perm-pill ${role.permissions?.[pk] ? "active" : ""}`}
                            >
                              <input
                                type="checkbox"
                                className="visually-hidden"
                                checked={!!role.permissions?.[pk]}
                                onChange={() => handleRoleToggle(role, pk)}
                              />
                              <i
                                className={`fas ${role.permissions?.[pk] ? "fa-check-circle" : "fa-circle"}`}
                              />
                              <span>{getColName(pk)}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    ))}
                    {extraKeys.length > 0 && (
                      <div className="mp-perm-group mb-2">
                        <div className="mp-group-label">
                          <i className="fas fa-shield-halved" /> Other
                        </div>
                        <div className="d-flex flex-wrap gap-2">
                          {extraKeys.map((pk) => (
                            <label
                              key={pk}
                              className={`mp-perm-pill ${role.permissions?.[pk] ? "active" : ""}`}
                            >
                              <input
                                type="checkbox"
                                className="visually-hidden"
                                checked={!!role.permissions?.[pk]}
                                onChange={() => handleRoleToggle(role, pk)}
                              />
                              <i
                                className={`fas ${role.permissions?.[pk] ? "fa-check-circle" : "fa-circle"}`}
                              />
                              <span>{getColName(pk)}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {activeTab === "users" && (
        <div className="mp-table-card">
          <header>
            <h2>User Role Assignment</h2>
            <span className="mp-role-badge users">
              {filteredUsers.length} shown
            </span>
          </header>
          <div className="table-responsive">
            <table className="table mp-table align-middle mb-0">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Current Role</th>
                  <th>Overrides</th>
                  <th>Assign Role</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((user) => {
                  const oc = Object.values(
                    activePermissions[user.id] || {},
                  ).filter(Boolean).length;
                  return (
                    <tr key={user.id}>
                      <td className="mp-user-col">
                        <strong>{user.full_name}</strong>
                        <small>{user.employee_id}</small>
                      </td>
                      <td>
                        <span className="mp-role-badge enabled">
                          {roles.find((r) => r.id === user.role_id)?.name ||
                            "No role"}
                        </span>
                      </td>
                      <td>
                        {oc > 0 ? (
                          <span
                            className="mp-role-badge"
                            style={{
                              background: "#fef3c7",
                              color: "#b45309",
                              border: "1px solid #fcd34d",
                            }}
                          >
                            {oc}
                          </span>
                        ) : (
                          <span style={{ fontSize: 12, color: "#9ca3af" }}>
                            None
                          </span>
                        )}
                      </td>
                      <td>
                        <select
                          className="mp-role-select"
                          value={user.role_id || ""}
                          onChange={(e) =>
                            handleAssignRole(user.id, e.target.value)
                          }
                        >
                          <option value="">Select role...</option>
                          {roles.map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.name}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === "overrides" && (
        <div className="mp-table-card">
          <header>
            <h2>User Permission Overrides</h2>
            <div className="d-flex gap-2 flex-wrap align-items-center">
              <select
                className="mp-role-select"
                style={{ width: 190 }}
                value={overrideGroupFilter}
                onChange={(e) => setOverrideGroupFilter(e.target.value)}
              >
                {overrideGroupOptions.map((g) => (
                  <option key={g} value={g}>
                    {g === "all" ? `All (${columns.length})` : groupTitle(g)}
                  </option>
                ))}
              </select>
              <label
                className="d-flex align-items-center gap-2 small mb-0"
                style={{ cursor: "pointer" }}
              >
                <input
                  type="checkbox"
                  checked={showOnlyOverrides}
                  onChange={(e) => setShowOnlyOverrides(e.target.checked)}
                />
                <span>Overrides only</span>
              </label>
            </div>
          </header>
          <div className="mp-override-hint">
            <i className="fas fa-info-circle" />
            <span>
              Blue locked = role permission &nbsp; Green = user override &nbsp;
              Grey = no access
            </span>
          </div>
          <div className="table-responsive">
            <table className="table mp-table mp-override-table align-middle mb-0">
              <thead>
                <tr>
                  <th className="mp-sticky-col">Employee</th>
                  {overrideColumns.map((col) => (
                    <th
                      key={col.permission_column}
                      className="mp-col-header"
                      title={getColName(col.permission_column)}
                    >
                      {getColName(col.permission_column)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredUsers
                  .filter(
                    (u) =>
                      !showOnlyOverrides ||
                      Object.values(activePermissions[u.id] || {}).some(
                        Boolean,
                      ),
                  )
                  .map((user) => {
                    const userRole = roles.find((r) => r.id === user.role_id);
                    const uov = activePermissions[user.id] || {};
                    const uoc = Object.values(uov).filter(Boolean).length;
                    return (
                      <tr key={user.id}>
                        <td className="mp-user-col mp-sticky-col">
                          <strong>{user.full_name}</strong>
                          <small>{user.employee_id}</small>
                          <span>{userRole?.name || "Staff"}</span>
                          <button
                            className="mp-clear-btn"
                            onClick={() => handleClearOverrides(user.id)}
                            disabled={uoc === 0}
                            type="button"
                          >
                            {uoc > 0
                              ? `Clear ${uoc} override${uoc > 1 ? "s" : ""}`
                              : "No overrides"}
                          </button>
                        </td>
                        {overrideColumns.map((col) => {
                          const roleHas =
                            !!userRole?.permissions?.[col.permission_column];
                          const userHas = !!uov[col.permission_column];
                          return (
                            <td
                              key={col.permission_column}
                              className="text-center"
                            >
                              <label
                                className={`mp-switch ${roleHas ? "locked" : ""}`}
                                title={
                                  roleHas
                                    ? "Role permission (locked)"
                                    : userHas
                                      ? "User override — click to remove"
                                      : "Click to grant override"
                                }
                              >
                                <input
                                  type="checkbox"
                                  checked={roleHas || userHas}
                                  disabled={roleHas}
                                  onChange={() =>
                                    handleOverrideToggle(
                                      user.id,
                                      col.permission_column,
                                      userHas,
                                    )
                                  }
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
        </div>
      )}

      {showRoleModal && (
        <div
          className="mp-modal-overlay"
          onClick={() => setShowRoleModal(false)}
        >
          <div className="mp-modal" onClick={(e) => e.stopPropagation()}>
            <div className="mp-modal-header">
              <h3>
                <i className="fas fa-layer-group" /> Create New Role
              </h3>
              <button type="button" onClick={() => setShowRoleModal(false)}>
                x
              </button>
            </div>
            <form onSubmit={handleCreateRole} className="mp-modal-body">
              <label className="mp-form-label">Role Name</label>
              <input
                className="mp-form-input"
                type="text"
                placeholder="e.g. Manager, HR Admin..."
                value={newRoleName}
                onChange={(e) => setNewRoleName(e.target.value)}
                autoFocus
                required
              />
              <p className="small text-muted mt-2">
                Assign permissions after creating from the Roles tab.
              </p>
              <div className="mp-modal-footer">
                <button
                  type="button"
                  className="mp-btn-secondary"
                  onClick={() => setShowRoleModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="mp-btn-primary"
                  disabled={savingRole || !newRoleName.trim()}
                >
                  {savingRole ? "Creating..." : "Create Role"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ManagePermissions;
