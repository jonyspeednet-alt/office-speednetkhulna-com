# RBAC V2 Phase 1

## Goal
- Introduce standard RBAC foundation without breaking current production flow.
- Keep legacy permission paths active during transition.

## Files
- `20260226_rbac_v2_phase1_up.sql`
- `20260226_rbac_v2_phase1_down.sql`

## What gets created
- `permissions` (canonical permission catalog)
- `role_permissions` (role grants)
- `user_permission_overrides` (allow/deny overrides)
- `v_effective_user_permissions` (resolved final permissions)

## Backfill sources
- `roles.permissions` JSONB -> `role_permissions`
- `user_permissions` -> `user_permission_overrides(effect='allow')`

## Run order
1. Backup DB
2. Run `20260226_rbac_v2_phase1_up.sql`
3. Validate with checks below
4. Keep legacy code path active until Phase 2+ refactor is done

## Validation SQL
```sql
-- 1) Permission catalog
SELECT COUNT(*) AS permission_count FROM permissions;

-- 2) Role grants backfilled
SELECT r.name, COUNT(rp.permission_id) AS grants
FROM roles r
LEFT JOIN role_permissions rp ON rp.role_id = r.id
GROUP BY r.name
ORDER BY r.name;

-- 3) User overrides backfilled
SELECT COUNT(*) AS override_count FROM user_permission_overrides;

-- 4) Sample effective permissions for one employee
SELECT u.employee_id, v.permission_code, v.is_allowed
FROM users u
JOIN v_effective_user_permissions v ON v.user_id = u.id
WHERE u.employee_id = 'SNKHL-8N6K'
  AND v.permission_code IN ('leave.manage', 'leave.apply', 'reports.view')
ORDER BY v.permission_code;
```

## Rollback
- Run `20260226_rbac_v2_phase1_down.sql`
- This only removes RBAC V2 objects created in Phase 1.

