# Ops Scripts

Use these scripts from the repo root (or run directly from `ops/`).

Local development:
- `ops/run_local.bat` -> Local dev (DB tunnel + backend + frontend)
- `ops/run_prod_mode_local.bat` -> Local production-mode preview
  - Tunnel helpers: `ops/start_db_tunnel.ps1`, `ops/db_tunnel_watchdog.ps1`

Production deploy:
- `ops/deploy_all_full.bat` -> Full production deploy (Windows)
- `ops/deploy_all_full.ps1` -> Full production deploy (PowerShell)
- `ops/deploy_all_full.sh` -> Full production deploy (Linux/macOS)
  - Deploy assets: `ops/office_spa.htaccess`
  - Predeploy guard: `ops/predeploy_guard.js`

Logs:
- Stored in `ops/logs/`
