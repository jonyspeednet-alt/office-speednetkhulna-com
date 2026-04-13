# Environment Setup (Local vs Production)

## Backend env files
- `.env.local` -> local dev setup
- `.env.production` -> production setup
- `server/index.js` loads env in this order:
  - `.env.production` when `APP_ENV=production`
  - `.env.local` otherwise
  - then fallback `.env` (missing keys only)

## Frontend env files
- `client/.env.development` -> local Vite dev
- `client/.env.production` -> production build/preview
- `client/.env` -> optional overrides (for example `VITE_API_URL`)

## Local run
1. Run `ops/run_local.bat`
2. Open `http://localhost:5173`

## Production-mode local test
1. Run `ops/run_prod_mode_local.bat`
2. Open `http://127.0.0.1:4173`

## Notes
- Before production deploy, ensure `.env.production` has real secrets.
- For local tests, keep secrets in `.env.local`.
- Local DB tunnel uses PuTTY `plink` by default. To use SSH key:
  - `USE_SSH_KEY=1`
  - `SSH_KEY_FILE=D:\\office.speednetkhulna.com\\secrets\\ssh_key` (optional; default path)

