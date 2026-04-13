#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# Prefer one-level-up app root when script is deployed under <app>/scripts.
# Fallback to two-level-up for legacy layouts.
if [[ -z "${APP_ROOT:-}" ]]; then
  if [[ -f "$SCRIPT_DIR/../.monitor.env" || -d "$SCRIPT_DIR/../server" ]]; then
    APP_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
  else
    APP_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
  fi
fi
ENV_FILE="${ENV_FILE:-$APP_ROOT/.monitor.env}"
LOG_FILE="${LOG_FILE:-$APP_ROOT/logs/auto_finalize_month_end.log}"

mkdir -p "$APP_ROOT/logs"

if [[ -f "$ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  source "$ENV_FILE"
fi

INTERNAL_TOKEN="${INTERNAL_AUTOMATION_TOKEN:-}"
API_URL="${AUTO_FINALIZE_API_URL:-http://127.0.0.1:5000/api/internal/billing/auto-finalize}"
STATUS_URL="${AUTO_FINALIZE_STATUS_URL:-http://127.0.0.1:5000/api/internal/billing/auto-finalize/status}"
RUN_MODE="${1:-month_end}"

if [[ -z "$INTERNAL_TOKEN" ]]; then
  echo "$(date -Iseconds) missing INTERNAL_AUTOMATION_TOKEN, skipped" >> "$LOG_FILE"
  exit 1
fi

today_day=$(TZ=Asia/Dhaka date +%d)
tomorrow_day=$(TZ=Asia/Dhaka date -d '+1 day' +%d)

if [[ "$RUN_MODE" == "month_end" ]]; then
  # Run only if tomorrow is the first day of next month.
  if [[ "$tomorrow_day" != "01" ]]; then
    echo "$(date -Iseconds) not month-end (day=$today_day), skipped" >> "$LOG_FILE"
    exit 0
  fi
fi

payload='{}'
if [[ "$RUN_MODE" == "retry" ]]; then
  current_month=$(TZ=Asia/Dhaka date +%Y-%m)
  payload="{\"month\":\"$current_month\"}"
fi

response=$(curl -sS -m 120 \
  -H "Content-Type: application/json" \
  -H "X-Internal-Token: $INTERNAL_TOKEN" \
  -d "$payload" \
  "$API_URL")

echo "$(date -Iseconds) mode=$RUN_MODE response=$response" >> "$LOG_FILE"

run_id=$(printf '%s' "$response" | sed -n 's/.*"run_id"[[:space:]]*:[[:space:]]*\([0-9][0-9]*\).*/\1/p' | head -n1)
if [[ -n "$run_id" ]]; then
  status=$(curl -sS -m 60 -H "X-Internal-Token: $INTERNAL_TOKEN" "$STATUS_URL?run_id=$run_id" || true)
  echo "$(date -Iseconds) run_id=$run_id status=$status" >> "$LOG_FILE"
fi
