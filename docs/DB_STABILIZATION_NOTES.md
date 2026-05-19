# Cross-Domain DB Stabilization Notes

## Guard Script
- Command: `node ops/predeploy_guard.js`
- Fails if:
  - UTF-8 BOM exists in text files
  - mojibake signatures are detected
  - `mysqli_` / `mysql:` references exist in PG-only scopes (`office`, `partner`, `my/server`)

## Operational Defaults
- Expected DB name: `speeuvmq_speednet_office`
- Strict DB target check for `my` API should be enabled in production.
- Strict DB target check for `office` and `partner` is now also enforced in config (fails with HTTP 503 on mismatch when strict is enabled).

## Production Monitoring
- Script: `/home/speeuvmq/cross_domain_db_monitor.sh`
- Cron: `*/15 * * * * /home/speeuvmq/cross_domain_db_monitor.sh`
- Log path: `/home/speeuvmq/backups/monitor/cross_domain_db_monitor_YYYYMMDD.log`
- Monitor includes:
  - `current_database()` check
  - office/partner config DB name presence check
  - `my` API `/api/health` DB target check
  - office/partner error log tail
  - PM2 `office-api` log tail

## Rollback Pack
- Created artifact snapshot and DB dump:
  - `/home/speeuvmq/backups/cutover_20260225_064015_artifacts.tar.gz`
  - `/home/speeuvmq/backups/cutover_20260225_064015_db.dump`
- Restore reference:
  - artifacts: extract and copy back config files
  - DB: `pg_restore -h localhost -U speeuvmq_speeuvmq -d speeuvmq_speednet_office <dump_file>`

## Suggested Pre-Deploy Steps
1. Run `node ops/predeploy_guard.js`
2. Run service-specific syntax/build checks
3. Deploy only if all checks pass
