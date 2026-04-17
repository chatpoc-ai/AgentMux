#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

PORT="${PORT:-9988}"
# Cursor agent: server defaults to --yolo (auto-run shell). To restore per-command prompts:
#   export AGENTMUX_AGENT_FLAGS=
PIDFILE="${ROOT}/.agentmux.pid"
LOGFILE="${ROOT}/agentmux.log"

stop_pidfile() {
  if [[ ! -f "$PIDFILE" ]]; then
    return 0
  fi
  local old
  old="$(cat "$PIDFILE" 2>/dev/null || true)"
  old="${old//$'\r'/}"
  old="${old//$'\n'/}"
  if [[ -z "$old" || ! "$old" =~ ^[0-9]+$ ]]; then
    rm -f "$PIDFILE"
    return 0
  fi
  if kill -0 "$old" 2>/dev/null; then
    echo "Stopping previous AgentMux (PID ${old})"
    kill "$old" 2>/dev/null || true
    sleep 0.4
    if kill -0 "$old" 2>/dev/null; then
      echo "Still running; sending SIGKILL to PID ${old}"
      kill -9 "$old" 2>/dev/null || true
      sleep 0.2
    fi
  fi
  rm -f "$PIDFILE"
}

stop_port_listener() {
  local pids
  if ! pids="$(lsof -tiTCP:"$PORT" -sTCP:LISTEN 2>/dev/null)"; then
    return 0
  fi
  echo "Stopping process(es) listening on ${PORT}: ${pids//$'\n'/ }"
  # shellcheck disable=SC2086
  kill $pids 2>/dev/null || true
  sleep 0.4
  if pids="$(lsof -tiTCP:"$PORT" -sTCP:LISTEN 2>/dev/null)"; then
    echo "Port ${PORT} still busy; sending SIGKILL to: ${pids//$'\n'/ }"
    # shellcheck disable=SC2086
    kill -9 $pids 2>/dev/null || true
    sleep 0.2
  fi
}

stop_pidfile
stop_port_listener

if lsof -tiTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "Error: port ${PORT} is still in use after cleanup." >&2
  echo "Check: lsof -nP -iTCP:${PORT} -sTCP:LISTEN" >&2
  exit 1
fi

export PORT
nohup node "${ROOT}/server/index.js" >> "${LOGFILE}" 2>&1 &
echo $! > "${PIDFILE}"

echo "AgentMux started in background."
echo "  URL:  http://127.0.0.1:${PORT}"
echo "  PID:  $(cat "${PIDFILE}")"
echo "  Log:  ${LOGFILE}"
echo "Stop:  kill \$(cat ${PIDFILE})   or   ./run.sh (starts a new one and replaces the old)"
