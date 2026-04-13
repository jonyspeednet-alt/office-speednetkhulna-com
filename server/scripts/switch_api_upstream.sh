#!/usr/bin/env bash
set -euo pipefail

TARGET_PORT="${1:-}"
OFFICE_DOMAIN_ROOT="${OFFICE_DOMAIN_ROOT:-/home/speeuvmq/office.speednetkhulna.com}"
HTACCESS_FILE="$OFFICE_DOMAIN_ROOT/.htaccess"

if [[ "$TARGET_PORT" != "5000" && "$TARGET_PORT" != "5001" ]]; then
  echo "usage: $0 5000|5001" >&2
  exit 1
fi

if [[ ! -f "$HTACCESS_FILE" ]]; then
  echo "htaccess not found: $HTACCESS_FILE" >&2
  exit 1
fi

sed -Ei "s#http://127.0.0.1:500[01]/api/#http://127.0.0.1:${TARGET_PORT}/api/#g" "$HTACCESS_FILE"
echo "active_upstream=${TARGET_PORT}"
