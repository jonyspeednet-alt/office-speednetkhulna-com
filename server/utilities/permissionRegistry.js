const LEGACY_TO_CANONICAL = {
  all_access: 'system.all_access',
  p_manage_users: 'users.manage',
  p_edit_any_profile: 'users.edit.any',
  p_manage_permissions: 'permissions.manage',
  p_manage_menus: 'menus.manage',
  p_manage_leaves: 'leave.manage',
  p_leave_submission: 'leave.submit',
  p_apply_leave: 'leave.apply',
  p_my_leaves: 'leave.my',
  p_approvals: 'leave.approvals.view',
  p_entitlements: 'leave.entitlements.manage',
  p_calendar: 'calendar.view',
  p_reports: 'reports.view',
  p_notices: 'notices.manage',
  p_phone_directory: 'phone_directory.view',
  p_reseller_list: 'reseller.list',
  p_reseller_profile: 'reseller.profile',
  p_add_reseller: 'reseller.add',
  p_request_bw: 'reseller.requests.create',
  p_requests_admin: 'reseller.requests.review',
  p_tech_task: 'reseller.tasks.manage',
  p_noc_view: 'reseller.status_noc.view',
  p_billing_logs: 'billing.logs.view',
  p_add_discount: 'billing.discount.add',
  p_monthly_summary: 'billing.monthly_summary.view',
  p_generate_bill: 'billing.generate_bill',
  p_invoice: 'billing.invoice.view',
  p_view_static_invoice: 'billing.invoice.static_view',
  p_system_logs: 'audit.system_logs.view',
  p_manage_procurement: 'procurement.manage',
  p_office_work: 'office_work.manage',
  p_assets_view: 'assets.view',
  p_assets_manage: 'assets.manage',
};

const CANONICAL_TO_LEGACY = Object.entries(LEGACY_TO_CANONICAL).reduce((acc, [legacy, canonical]) => {
  if (!acc[canonical]) acc[canonical] = [];
  acc[canonical].push(legacy);
  return acc;
}, {});

const MASTER_ADMIN_EMPLOYEE_IDS = new Set(['SN-01']);

const isTruthyPermission = (value) => value === true || value === 1 || value === '1';

const normalizeRole = (role) => String(role || '').trim().toLowerCase();

const normalizeEmployeeId = (employeeId) => String(employeeId || '').trim().toUpperCase();

const isMasterAdminUser = (user) => MASTER_ADMIN_EMPLOYEE_IDS.has(normalizeEmployeeId(user?.employee_id || user?.emp_id));

const isSuperAdmin = (user) => {
  if (isMasterAdminUser(user)) return true;
  const role = normalizeRole(user?.role_name || user?.role);
  return role === 'super admin' || role === 'superadmin';
};

const resolvePermission = (user, requestedPermission) => {
  const reqKey = String(requestedPermission || '').trim();
  if (!reqKey) return false;
  if (!user) return false;
  if (isSuperAdmin(user)) return true;

  const merged = {
    ...(user.permissions || {}),
    ...user,
  };

  // Global bypass
  if (isTruthyPermission(merged.all_access) || isTruthyPermission(merged['system.all_access'])) {
    return true;
  }

  const keysToCheck = new Set([reqKey]);

  // If requested canonical, include legacy aliases.
  if (CANONICAL_TO_LEGACY[reqKey]) {
    CANONICAL_TO_LEGACY[reqKey].forEach((k) => keysToCheck.add(k));
  }

  // If requested legacy, include canonical alias.
  if (LEGACY_TO_CANONICAL[reqKey]) {
    keysToCheck.add(LEGACY_TO_CANONICAL[reqKey]);
  }

  for (const key of keysToCheck) {
    if (isTruthyPermission(merged[key])) return true;
  }

  return false;
};

module.exports = {
  LEGACY_TO_CANONICAL,
  CANONICAL_TO_LEGACY,
  MASTER_ADMIN_EMPLOYEE_IDS,
  isTruthyPermission,
  isMasterAdminUser,
  isSuperAdmin,
  resolvePermission,
};
