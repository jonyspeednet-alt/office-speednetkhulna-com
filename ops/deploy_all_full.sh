#!/usr/bin/env bash

set -euo pipefail

SERVER="${SERVER:-speeuvmq@199.188.200.186}"
PORT="${PORT:-21098}"
PASSWORD="${PASSWORD:-Speednet@2015#}"
REMOTE_ROOT="${REMOTE_ROOT:-/home/speeuvmq/office_app}"
OFFICE_DOMAIN_ROOT="${OFFICE_DOMAIN_ROOT:-/home/speeuvmq/office.speednetkhulna.com}"
SKIP_NPM_INSTALL=0
SKIP_FRONTEND_BUILD=0
DRY_RUN=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --skip-npm-install)
      SKIP_NPM_INSTALL=1
      shift
      ;;
    --skip-frontend-build)
      SKIP_FRONTEND_BUILD=1
      shift
      ;;
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    -h|--help)
      cat <<'EOF'
Usage: ./deploy_all_full.sh [options]

Options:
  --skip-npm-install      Skip remote npm install
  --skip-frontend-build   Skip local frontend build
  --dry-run               Print commands without executing deploy actions
  -h, --help              Show help

Env overrides:
  SERVER, PORT, PASSWORD, REMOTE_ROOT, OFFICE_DOMAIN_ROOT
EOF
      exit 0
      ;;
    *)
      echo "[FullDeploy][ERROR] Unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
CLIENT_DIR="$ROOT_DIR/client"
SERVER_DIR="$ROOT_DIR/server"
DIST_DIR="$CLIENT_DIR/dist"
TMP_DIR="$ROOT_DIR/.deploy_tmp"
BUNDLE_PATH="$TMP_DIR/server_bundle.tgz"
HTACCESS_TEMPLATE="$ROOT_DIR/ops/office_spa.htaccess"
STAMP="$(date +%Y%m%d_%H%M%S)"
REMOTE_TMP="$REMOTE_ROOT/.deploy_tmp"
REMOTE_FRONTEND_STAGE="$REMOTE_TMP/frontend_stage_$STAMP"

log() { echo "[FullDeploy] $*"; }
die() { echo "[FullDeploy][ERROR] $*" >&2; exit 1; }

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "Missing command: $1"
}

run() {
  if [[ "$DRY_RUN" -eq 1 ]]; then
    echo "[DRY-RUN] $*"
  else
    eval "$@"
  fi
}

ssh_cmd() {
  local cmd="$1"
  if [[ "$DRY_RUN" -eq 1 ]]; then
    echo "[DRY-RUN][SSH] $cmd"
    return 0
  fi
  sshpass -p "$PASSWORD" ssh -o StrictHostKeyChecking=accept-new -p "$PORT" "$SERVER" "$cmd"
}

scp_upload() {
  local src="$1"
  local dst="$2"
  if [[ "$DRY_RUN" -eq 1 ]]; then
    echo "[DRY-RUN][SCP] $src -> $dst"
    return 0
  fi
  sshpass -p "$PASSWORD" scp -P "$PORT" -o StrictHostKeyChecking=accept-new -r "$src" "$SERVER:$dst"
}

need_cmd ssh
need_cmd scp
need_cmd sshpass
need_cmd tar
need_cmd npm

[[ -d "$CLIENT_DIR" ]] || die "client directory not found: $CLIENT_DIR"
[[ -d "$SERVER_DIR" ]] || die "server directory not found: $SERVER_DIR"
[[ -f "$HTACCESS_TEMPLATE" ]] || die "missing template: $HTACCESS_TEMPLATE"

log "[0/10] Deploy context"
log "Root: $ROOT_DIR"
log "Server: $SERVER:$PORT"
log "Remote root: $REMOTE_ROOT"

log "[1/10] Pre-deploy health gate"
PRE_HEALTH="$(ssh_cmd "curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:5000/api/health || true" | tr -d '\r')"
if [[ "$DRY_RUN" -eq 0 && "$PRE_HEALTH" != "200" ]]; then
  die "Pre-deploy gate failed: current backend health is HTTP $PRE_HEALTH"
fi

log "[2/10] Building frontend"
if [[ "$SKIP_FRONTEND_BUILD" -eq 0 ]]; then
  run "cd \"$CLIENT_DIR\" && npm run build"
else
  log "Skipped frontend build"
fi

[[ -f "$DIST_DIR/index.html" ]] || die "dist/index.html not found"
[[ -d "$DIST_DIR/assets" ]] || die "dist/assets not found"

log "[3/10] Preparing backend archive"
run "rm -rf \"$TMP_DIR\""
run "mkdir -p \"$TMP_DIR\""
run "tar -czf \"$BUNDLE_PATH\" --exclude='server/node_modules' --exclude='server/.env' -C \"$ROOT_DIR\" ecosystem.config.js server"

log "[4/10] Remote preflight"
ssh_cmd "mkdir -p '$REMOTE_ROOT/client/dist/assets' '$REMOTE_TMP' '$REMOTE_ROOT/server' '$REMOTE_ROOT/scripts' '$REMOTE_ROOT/logs' '$OFFICE_DOMAIN_ROOT'"

log "[5/10] Uploading frontend to staging"
ssh_cmd "rm -rf '$REMOTE_FRONTEND_STAGE' && mkdir -p '$REMOTE_FRONTEND_STAGE/assets'"
scp_upload "$DIST_DIR/index.html" "$REMOTE_FRONTEND_STAGE/index.html"
scp_upload "$DIST_DIR/assets/." "$REMOTE_FRONTEND_STAGE/assets/"
for file in "$DIST_DIR"/*; do
  [[ -f "$file" ]] || continue
  [[ "$(basename "$file")" == "index.html" ]] && continue
  scp_upload "$file" "$REMOTE_FRONTEND_STAGE/$(basename "$file")"
done

log "[6/10] Swapping frontend atomically"
ssh_cmd "mkdir -p '$REMOTE_ROOT/client/dist' && rm -rf '$REMOTE_ROOT/client/dist'/* && cp -a '$REMOTE_FRONTEND_STAGE/.' '$REMOTE_ROOT/client/dist/'"
ssh_cmd "rm -rf '$REMOTE_FRONTEND_STAGE'"
ssh_cmd "cp '$REMOTE_ROOT/client/dist/index.html' '$OFFICE_DOMAIN_ROOT/index.html' && rm -rf '$OFFICE_DOMAIN_ROOT/assets' && cp -a '$REMOTE_ROOT/client/dist/assets' '$OFFICE_DOMAIN_ROOT/assets' && [ -f '$REMOTE_ROOT/client/dist/logo-b.png' ] && cp '$REMOTE_ROOT/client/dist/logo-b.png' '$OFFICE_DOMAIN_ROOT/logo-b.png' || true && [ -f '$REMOTE_ROOT/client/dist/brand-logo.svg' ] && cp '$REMOTE_ROOT/client/dist/brand-logo.svg' '$OFFICE_DOMAIN_ROOT/brand-logo.svg' || true"
scp_upload "$HTACCESS_TEMPLATE" "$OFFICE_DOMAIN_ROOT/.htaccess"

log "[7/10] Uploading backend bundle"
scp_upload "$BUNDLE_PATH" "$REMOTE_TMP/server_bundle.tgz"
ssh_cmd "cd '$REMOTE_ROOT' && tar -xzf '$REMOTE_TMP/server_bundle.tgz' --no-same-owner --no-same-permissions --no-overwrite-dir && rm -f '$REMOTE_TMP/server_bundle.tgz'"

if [[ "$SKIP_NPM_INSTALL" -eq 0 ]]; then
  log "[8/10] Installing backend dependencies"
  ssh_cmd "cd '$REMOTE_ROOT/server' && npm install --omit=dev --no-audit --no-fund"
else
  log "[8/10] Skipped npm install"
fi

log "[9/10] Reloading PM2"
ssh_cmd "cd '$REMOTE_ROOT' && pm2 delete office-api >/dev/null 2>&1 || true"
ssh_cmd "cd '$REMOTE_ROOT' && (pm2 describe office-api-a >/dev/null 2>&1 && pm2 reload ecosystem.config.js --only office-api-a,office-api-b --update-env || pm2 start ecosystem.config.js --only office-api-a,office-api-b --update-env) && pm2 save >/dev/null 2>&1"

log "[10/11] Enabling watchdog + synthetic monitors"
ssh_cmd "cd '$REMOTE_ROOT' && chmod +x server/scripts/office_health_watchdog.sh server/scripts/synthetic_30s_monitor.sh server/scripts/switch_api_upstream.sh server/scripts/auto_finalize_month_end.sh server/scripts/uptime_daily_report.sh"
ssh_cmd "cd '$REMOTE_ROOT' && [ -f '.monitor.env' ] || cp 'server/scripts/monitor.env.example' '.monitor.env'"
ssh_cmd "(crontab -l 2>/dev/null | grep -v 'office_health_watchdog.sh' | grep -v 'synthetic_30s_monitor.sh' | grep -v 'auto_finalize_month_end.sh' | grep -v 'uptime_daily_report.sh' | grep -v 'pm2 resurrect'; echo '*/5 * * * * $REMOTE_ROOT/server/scripts/office_health_watchdog.sh'; echo '*/5 * * * * $REMOTE_ROOT/server/scripts/synthetic_30s_monitor.sh'; echo '*/5 * * * * sleep 150; $REMOTE_ROOT/server/scripts/synthetic_30s_monitor.sh'; echo '5 0 * * * $REMOTE_ROOT/server/scripts/uptime_daily_report.sh'; echo '59 23 28-31 * * $REMOTE_ROOT/server/scripts/auto_finalize_month_end.sh month_end'; echo '10 0 1 * * $REMOTE_ROOT/server/scripts/auto_finalize_month_end.sh retry'; echo '@reboot sleep 20 && cd $REMOTE_ROOT && pm2 resurrect >/dev/null 2>&1') | crontab -"

log "[11/11] Post-deploy health"
POST_HEALTH="$(ssh_cmd "curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:5000/api/health || true" | tr -d '\r')"
if [[ "$DRY_RUN" -eq 0 && "$POST_HEALTH" != "200" ]]; then
  die "Post-deploy health failed: HTTP $POST_HEALTH"
fi

run "rm -rf \"$TMP_DIR\""
log "SUCCESS. Deployment completed."
