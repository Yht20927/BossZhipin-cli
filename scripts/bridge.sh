#!/usr/bin/env bash
# bridge.sh — Bridge Server 生命周期管理（boss-cli）
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT"

PID_FILE="$ROOT/.bridge.pid"
LOG_DIR="$ROOT/logs"
LOG_FILE="$LOG_DIR/bridge-server.log"
CONFIG_FILE="$ROOT/config.json"

read_endpoint() {
  if [[ ! -f "$CONFIG_FILE" ]]; then
    echo "[bridge.sh] config.json 不存在，请先 cp config.example.json config.json" >&2
    return 1
  fi
  HOST=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$CONFIG_FILE','utf8')).bridge?.host||'127.0.0.1')")
  PORT=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$CONFIG_FILE','utf8')).bridge?.port||0)")
  if [[ "$PORT" == "0" ]]; then
    echo "[bridge.sh] config.json 缺 bridge.port" >&2
    return 1
  fi
}

probe() {
  curl -s -o /dev/null -w "%{http_code}" --max-time 2 "http://${HOST}:${PORT}/api/status" 2>/dev/null || true
}

cmd_status() {
  read_endpoint
  local code=$(probe)
  if [[ "$code" == "200" ]]; then
    local pid=""
    [[ -f "$PID_FILE" ]] && pid=$(cat "$PID_FILE" 2>/dev/null || true)
    echo "[bridge.sh] online — http://${HOST}:${PORT} (pid=${pid:-unknown})"
    return 0
  fi
  echo "[bridge.sh] offline — http://${HOST}:${PORT} (curl=${code:-no-response})"
  return 1
}

cmd_start() {
  read_endpoint
  local code=$(probe)
  if [[ "$code" == "200" ]]; then
    echo "[bridge.sh] already running on ${HOST}:${PORT}"
    return 0
  fi
  if [[ -f "$PID_FILE" ]]; then
    local old_pid=$(cat "$PID_FILE" 2>/dev/null || true)
    if [[ -n "$old_pid" ]] && kill -0 "$old_pid" 2>/dev/null; then
      echo "[bridge.sh] PID file points to live process $old_pid but /api/status not responding" >&2
      return 2
    fi
    rm -f "$PID_FILE"
  fi
  mkdir -p "$LOG_DIR"
  setsid nohup node "$ROOT/server.js" >>"$LOG_FILE" 2>&1 < /dev/null &
  local pid=$!
  disown "$pid" 2>/dev/null || true
  echo "$pid" > "$PID_FILE"
  local i=0
  while (( i < 50 )); do
    sleep 0.1
    code=$(probe)
    [[ "$code" == "200" ]] && {
      echo "[bridge.sh] started — http://${HOST}:${PORT} (pid=$pid, log=$LOG_FILE)"
      return 0
    }
    if ! kill -0 "$pid" 2>/dev/null; then
      echo "[bridge.sh] server.js exited prematurely" >&2
      tail -n 20 "$LOG_FILE" >&2 || true
      rm -f "$PID_FILE"
      return 3
    fi
    i=$((i + 1))
  done
  echo "[bridge.sh] timed out" >&2
  return 4
}

cmd_stop() {
  read_endpoint 2>/dev/null || true
  if [[ -f "$PID_FILE" ]]; then
    local pid=$(cat "$PID_FILE" 2>/dev/null || true)
    if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null || true
      local i=0
      while (( i < 30 )) && kill -0 "$pid" 2>/dev/null; do sleep 0.1; i=$((i + 1)); done
      kill -0 "$pid" 2>/dev/null && kill -9 "$pid" 2>/dev/null || true
      echo "[bridge.sh] stopped (pid=$pid)"
    fi
    rm -f "$PID_FILE"
  fi
}

case "${1:-status}" in
  start) cmd_start ;;
  stop) cmd_stop ;;
  status) cmd_status ;;
  restart) cmd_stop || true; cmd_start ;;
  *) echo "Usage: $0 {start|stop|status|restart}" >&2; exit 1 ;;
esac
