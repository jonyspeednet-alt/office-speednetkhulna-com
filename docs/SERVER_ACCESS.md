# Server Access - Speednet Khulna (Current)

## Scope
This document is for the current production stack served from `office_app`.

See also:
- `docs/ACCESS_CREDENTIALS.md`
- `docs/SETUP_ENV.md`

## Server Details
- Server IP: `199.188.200.186`
- SSH Port: `21098`
- Username: `speeuvmq`
- Main App URL: `https://office.speednetkhulna.com`
- API Health URL (ready): `http://127.0.0.1:5000/api/health/ready`
- API Health URL (live): `http://127.0.0.1:5000/api/health/live`

## App Root
- Root path: `/home/speeuvmq/office_app`
- Backend entry: `server/index.js`
- Backend process names (PM2): `office-api-a`, `office-api-b`
- Backend port: `5000`

## Database (Production)
- Engine: `PostgreSQL`
- Host: `localhost`
- Database: `speeuvmq_speednet_office`
- Port: `5432`

## Local Deploy Method (Single Standard)
Use only these files from local project root:
- `ops/deploy_all_full.bat`
- `ops/deploy_all_full.ps1`

Run:
```bat
ops/deploy_all_full.bat
```

What it does:
1. Builds frontend (`client/dist`)
2. Uploads frontend dist to server
3. Uploads backend bundle
4. Extracts backend under `/home/speeuvmq/office_app/server`
5. Runs `npm install` (backend)
6. Reloads PM2 apps `office-api-a` and `office-api-b`
7. Runs health check

## Direct SSH Access (No helper script)
From local Windows terminal (PuTTY):
```powershell
& 'C:\Program Files\PuTTY\plink.exe' -ssh -P 21098 -pw 'YOUR_PASSWORD' speeuvmq@199.188.200.186 "pm2 status"
```
If you have an SSH key available on your machine:
```powershell
ssh -p 21098 -i D:\\office.speednetkhulna.com\\secrets\\ssh_key speeuvmq@199.188.200.186 "pm2 status"
```

## Useful Remote Commands
```bash
# app root
cd /home/speeuvmq/office_app

# pm2
pm2 status
pm2 logs office-api-a --lines 100
pm2 logs office-api-b --lines 100
pm2 reload ecosystem.config.js --only office-api-a,office-api-b --update-env

# health
curl -sS -m 10 http://127.0.0.1:5000/api/health/ready
curl -sS -m 10 http://127.0.0.1:5000/api/health/live

# recent backend error log
tail -n 100 /home/speeuvmq/.pm2/logs/office-api-error.log

# confirm active DB from health response
curl -sS http://127.0.0.1:5000/api/health
```

## Deployment Paths
- Frontend build target on server: `/home/speeuvmq/office_app/client/dist`
- Backend path on server: `/home/speeuvmq/office_app/server`

## Operational Notes
- Current standard is PG-only (single DB target): `speeuvmq_speednet_office`.
- Avoid manual production edits unless emergency; prefer local change + deploy script.
- Keep `office-api` as the single PM2 process name for consistency.
