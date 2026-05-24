#!/usr/bin/env bash
# dev-smoke.sh — kill stale processes, (re)start dev server, build+launch Mark,
# verify the window actually renders (not a white screen from a dead server).
#
# Usage:
#   ./tools/dev-smoke.sh          # full cycle: server + build + launch
#   ./tools/dev-smoke.sh --quick  # skip cargo build, reuse existing binary
#   ./tools/dev-smoke.sh --check  # only check health, no restart

set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

MODE="${1:-full}"
DEV_LOG="/tmp/mark-vite-dev.log"
STDERR_LOG="/tmp/mark-stderr.log"
DEV_URL="http://localhost:1420"
BINARY="./target/debug/mark"

red()   { printf '\033[0;31m%s\033[0m\n' "$*"; }
green() { printf '\033[0;32m%s\033[0m\n' "$*"; }
yellow(){ printf '\033[0;33m%s\033[0m\n' "$*"; }

check_dev_server() {
  local code
  code=$(curl -s -o /dev/null -w "%{http_code}" "$DEV_URL" 2>/dev/null || echo "000")
  echo "$code"
}

wait_dev_server() {
  for i in $(seq 1 30); do
    if [ "$(check_dev_server)" = "200" ]; then
      green "Dev server ready (${i}s)"
      return 0
    fi
    sleep 1
  done
  red "Dev server failed to start after 30s"
  return 1
}

kill_mark() {
  pkill -f "target/debug/mark" 2>/dev/null && yellow "Killed stale Mark process" || true
  sleep 0.5
}

kill_dev_server() {
  pkill -f "vite.*serve" 2>/dev/null || true
  pkill -f "npm run dev" 2>/dev/null || true
  sleep 1
}

start_dev_server() {
  local code
  code=$(check_dev_server)
  if [ "$code" = "200" ]; then
    green "Dev server already running (HTTP $code)"
    return 0
  fi
  yellow "Dev server dead or missing (HTTP $code), restarting..."
  kill_dev_server
  npm run dev > "$DEV_LOG" 2>&1 &
  wait_dev_server
}

build_binary() {
  yellow "Building Mark binary..."
  cargo build --manifest-path src-tauri/Cargo.toml --bin mark 2>&1 | tail -3
  green "Build OK"
}

launch_mark() {
  kill_mark
  MARK_SKIP_MIGRATION=1 "$BINARY" 2>"$STDERR_LOG" &
  local pid=$!
  sleep 3

  if ! kill -0 "$pid" 2>/dev/null; then
    red "Mark crashed on launch! Stderr:"
    cat "$STDERR_LOG"
    return 1
  fi

  local server_code
  server_code=$(check_dev_server)
  if [ "$server_code" != "200" ]; then
    red "Dev server died after Mark launch (HTTP $server_code)"
    return 1
  fi

  local blocks
  blocks=$(grep -c '\[BLOCK_' "$STDERR_LOG" 2>/dev/null || echo "0")
  if [ "$blocks" -lt 5 ]; then
    red "Only $blocks BLOCK markers in stderr — Mark may not have initialized"
    cat "$STDERR_LOG"
    return 1
  fi

  if grep -q 'BLOCK_TITLEBAR_TRANSPARENT_OVERLAY_OK' "$STDERR_LOG"; then
    green "Titlebar overlay: OK"
  else
    yellow "Warning: BLOCK_TITLEBAR_TRANSPARENT_OVERLAY_OK missing"
  fi

  green "Mark launched (PID $pid, $blocks BLOCK markers, dev server HTTP $server_code)"
}

health_report() {
  echo "=== Health Report ==="
  local server_code
  server_code=$(check_dev_server)
  if [ "$server_code" = "200" ]; then
    green "Dev server: HTTP $server_code"
  else
    red "Dev server: HTTP $server_code (DEAD)"
  fi

  if pgrep -f "target/debug/mark" > /dev/null 2>&1; then
    green "Mark process: running (PID $(pgrep -f 'target/debug/mark' | head -1))"
  else
    red "Mark process: not running"
  fi
}

case "$MODE" in
  --check)
    health_report
    ;;
  --quick)
    start_dev_server
    launch_mark
    ;;
  *)
    start_dev_server
    build_binary
    launch_mark
    ;;
esac
