#!/usr/bin/env bash

# run_local.sh - Linux equivalent of run_local.bat
# Usage: ./run_local.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
LOG_DIR="$ROOT_DIR/ops/logs"
FRONTEND_DIR="$ROOT_DIR/client"
BACKEND_DIR="$ROOT_DIR/server"
SSH_KEY_FILE="$ROOT_DIR/secrets/ssh_key"
SSH_PASSWORD='Speednet@2015#'
DB_TUNNEL_OK=0
TUNNEL_WATCHDOG_PID_FILE="$LOG_DIR/db-tunnel-watchdog.pid"
BACKEND_PORT=5001
FRONTEND_PORT=5173

if ! mkdir -p "$LOG_DIR" 2>/dev/null || [ ! -w "$LOG_DIR" ]; then
    LOG_DIR="/tmp/my-speednetkhulna-logs"
    mkdir -p "$LOG_DIR"
    echo "[Local][WARN] Project logs directory is not writable, using: $LOG_DIR"
fi

TUNNEL_LOG="$LOG_DIR/local-db-tunnel.log"
BACKEND_LOG="$LOG_DIR/backend-local.log"
FRONTEND_LOG="$LOG_DIR/frontend-local.log"

port_is_listening() {
    ss -tuln 2>/dev/null | grep -qE '127\.0\.0\.1:5433|0\.0\.0\.0:5433|::1:5433|\[::\]:5433' && return 0
    netstat -tuln 2>/dev/null | grep -qE '127\.0\.0\.1:5433|0\.0\.0\.0:5433|:::5433'
}

service_port_up() {
    local port="$1"
    ss -tuln 2>/dev/null | grep -qE "[\.:]${port}[[:space:]]" && return 0
    netstat -tuln 2>/dev/null | grep -qE "[\.:]${port}[[:space:]]"
}

start_service_if_needed() {
    local name="$1"
    local port="$2"
    local log_file="$3"
    local cmd="$4"

    if service_port_up "$port"; then
        echo "[Local] ${name} already running on port ${port}."
        return 0
    fi

    echo "[Local] Starting ${name}..."
    nohup bash -lc "$cmd" >>"$log_file" 2>&1 </dev/null &

    for _ in $(seq 1 20); do
        sleep 1
        if service_port_up "$port"; then
            echo "[Local] ${name} is up on port ${port}."
            return 0
        fi
    done

    echo "[Local][ERROR] ${name} failed to start on port ${port}."
    echo "[Local][HINT] Check log: $log_file"
    tail -20 "$log_file" 2>/dev/null || true
    return 1
}

if port_is_listening; then
    DB_TUNNEL_OK=1
fi

if [ "$DB_TUNNEL_OK" -eq 0 ]; then
    if command -v ssh >/dev/null 2>&1; then
        echo "[Local] Starting DB tunnel to main host (localhost:5433 -> production postgres)..."

        ssh_args=(
            -N
            -L 5433:127.0.0.1:5432
            -p 21098
            -o ExitOnForwardFailure=yes
            -o StrictHostKeyChecking=accept-new
            -o ServerAliveInterval=30
            -o PreferredAuthentications=password,publickey
            speeuvmq@199.188.200.186
        )

        if command -v sshpass >/dev/null 2>&1; then
            nohup sshpass -p "$SSH_PASSWORD" ssh "${ssh_args[@]}" >>"$TUNNEL_LOG" 2>&1 </dev/null &
        elif [ -r "$SSH_KEY_FILE" ]; then
            nohup ssh -i "$SSH_KEY_FILE" "${ssh_args[@]}" >>"$TUNNEL_LOG" 2>&1 </dev/null &
        else
            echo "[Local][ERROR] No SSH auth method found."
            echo "[Local][HINT] Install sshpass or provide a readable key at: $SSH_KEY_FILE"
        fi

        for _ in $(seq 1 12); do
            sleep 1
            if port_is_listening; then
                DB_TUNNEL_OK=1
                break
            fi
        done
    else
        echo "[Local][ERROR] SSH command not found. Please install openssh-client."
    fi
fi

if [ "$DB_TUNNEL_OK" -eq 0 ]; then
    echo "[Local][ERROR] DB tunnel not established on localhost:5433."
    echo "[Local][ERROR] Authentication will fail until tunnel is up."
    echo "[Local][HINT] Check SSH access/host-key for 199.188.200.186:21098 and run again."
    if [ -f "$TUNNEL_LOG" ]; then
        echo "[Local][HINT] Last tunnel log lines:"
        tail -15 "$TUNNEL_LOG"
    fi
    read -r -p "Press Enter to exit..."
    exit 1
fi

start_tunnel_once() {
    local auth_ok=1
    local ssh_args=(
        -N
        -L 5433:127.0.0.1:5432
        -p 21098
        -o ExitOnForwardFailure=yes
        -o StrictHostKeyChecking=accept-new
        -o ServerAliveInterval=30
        -o ServerAliveCountMax=3
        -o PreferredAuthentications=password,publickey
        speeuvmq@199.188.200.186
    )

    if command -v sshpass >/dev/null 2>&1; then
        nohup sshpass -p "$SSH_PASSWORD" ssh "${ssh_args[@]}" >>"$TUNNEL_LOG" 2>&1 </dev/null &
    elif [ -r "$SSH_KEY_FILE" ]; then
        nohup ssh -i "$SSH_KEY_FILE" "${ssh_args[@]}" >>"$TUNNEL_LOG" 2>&1 </dev/null &
    else
        auth_ok=0
    fi
    return "$auth_ok"
}

start_tunnel_watchdog() {
    if [ -f "$TUNNEL_WATCHDOG_PID_FILE" ]; then
        old_pid="$(cat "$TUNNEL_WATCHDOG_PID_FILE" 2>/dev/null || true)"
        if [ -n "$old_pid" ] && kill -0 "$old_pid" 2>/dev/null; then
            echo "[Local] DB tunnel watchdog already running (PID: $old_pid)."
            return 0
        fi
    fi

    (
        while true; do
            if ! port_is_listening; then
                echo "[Local][Watchdog] DB tunnel down. Restarting..." >>"$TUNNEL_LOG"
                start_tunnel_once >>"$TUNNEL_LOG" 2>&1 || echo "[Local][Watchdog] Tunnel restart skipped: no auth method." >>"$TUNNEL_LOG"
                sleep 3
            fi
            sleep 15
        done
    ) &
    echo $! > "$TUNNEL_WATCHDOG_PID_FILE"
    echo "[Local] DB tunnel watchdog started (PID: $(cat "$TUNNEL_WATCHDOG_PID_FILE"))."
}

start_tunnel_watchdog

start_service_if_needed "Backend" "$BACKEND_PORT" "$BACKEND_LOG" "cd \"$BACKEND_DIR\" && APP_ENV=local npm run dev" || exit 1

start_service_if_needed "Frontend" "$FRONTEND_PORT" "$FRONTEND_LOG" "cd \"$FRONTEND_DIR\" && npm run dev" || exit 1

echo "[Local] Backend:  http://localhost:${BACKEND_PORT}"
echo "[Local] Frontend: http://localhost:${FRONTEND_PORT}"
echo "[Local] Logs:"
echo "[Local]   Tunnel:   $TUNNEL_LOG"
echo "[Local]   Backend:  $BACKEND_LOG"
echo "[Local]   Frontend: $FRONTEND_LOG"

exit 0
