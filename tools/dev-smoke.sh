#!/usr/bin/env bash
# FILE: tools/dev-smoke.sh
# VERSION: 2.0.0
# START_MODULE_CONTRACT
#   PURPOSE: Local dev launch cycle: (re)start the renderer dev server and the debug mark binary, then verify the window actually renders — real initialization proven through stderr BLOCK markers, not a white screen from a dead server.
#   SCOPE: Owned-PID discipline only — every PID this run spawns (dev server root process and mark binary) is recorded in a run-scoped pidfile, and only recorded, liveness-checked PIDs are ever killed; stale/dead entries are pruned. A busy dev port or an HTTP 200 from an untracked owner produces an honest ownership report (PID and command via host lsof/ps) and fails the run — never a pattern kill, never a port-based kill, never adopting a foreign server as readiness. --check reports health kill-free. MARK_SKIP_MIGRATION keeps skipping migration at mark launch.
#   DEPENDS: bash, git, curl, npm, cargo, lsof, ps, kill; MARK_DEV_PIDFILE overrides the pidfile path (fixture seam; default /tmp/mark-dev-smoke.pids alongside the existing logs).
#   LINKS: .grace/changes/active/C-DEV-ENV-ISOLATION (owned-PID cycle, honest busy-port report); docs/commit-push-safety.md discipline — never touch a process this run did not record.
#   ROLE: SCRIPT
#   MAP_MODE: LOCALS
# END_MODULE_CONTRACT
# START_MODULE_MAP
#   check_dev_server - HTTP status of the fixed dev port.
#   first_live_recorded_pid - First live recorded PID of one kind from the run pidfile.
#   record_pid - Append a spawned PID (kind:pid) to the run pidfile.
#   live_entries - Pidfile entries whose recorded PID is still alive.
#   prune_pidfile - Drop dead entries from the run pidfile.
#   kill_recorded - Kill only recorded, liveness-checked PIDs of one kind, then prune.
#   report_port_owner - Honest untracked-owner report (PID + command via lsof/ps).
#   start_dev_server - Ownership-aware server adoption, restart or refusal.
#   wait_dev_server - Readiness gated on the recorded dev server being alive.
#   build_binary - Cargo build of the debug mark binary.
#   launch_mark - Owned launch, MARK_SKIP_MIGRATION, BLOCK-marker verification.
#   health_report - Kill-free health report (--check), naming the port owner diagnostically.
# END_MODULE_MAP
# START_CHANGE_SUMMARY
#   - 2026-11-21 C-DEV-ENV-ISOLATION: owned-PID kill discipline via the run pidfile (MARK_DEV_PIDFILE seam), honest busy-port owner report instead of broad cmdline kills, and refusal of a foreign HTTP 200 as readiness.
# END_CHANGE_SUMMARY
#
# Usage:
#   ./tools/dev-smoke.sh          # full cycle: server + build + launch
#   ./tools/dev-smoke.sh --quick  # skip cargo build, reuse existing binary
#   ./tools/dev-smoke.sh --check  # only check health, no restart, no kill

set -euo pipefail
# C-DEV-ENV-ISOLATION fixture seam: disable the kill BUILTIN so every kill
# (including the -0 liveness probes) resolves through PATH — the recording
# fixture shim intercepts them; on a real host the resolved /bin/kill or
# /usr/bin/kill binary behaves identically to the builtin for our uses.
enable -n kill || true
cd "$(git rev-parse --show-toplevel)"

MODE="${1:-full}"
# C-DEV-ENV-ISOLATION: run-scoped log directory derived from the pidfile
# location — parallel runs (or the fixture matrix) never truncate each
# other's logs, and a stale /tmp file from an earlier run cannot leak into
# a later run's BLOCK-marker verification.
RUN_LOG_DIR="$(dirname "${MARK_DEV_PIDFILE:-/tmp/mark-dev-smoke.pids}")/mark-dev-smoke-logs"
mkdir -p "$RUN_LOG_DIR"
DEV_LOG="$RUN_LOG_DIR/vite-dev.log"
STDERR_LOG="$RUN_LOG_DIR/mark-stderr.log"
DEV_URL="http://localhost:1420"
DEV_PORT="1420"
BINARY="./target/debug/mark"
DEV_PIDFILE="${MARK_DEV_PIDFILE:-/tmp/mark-dev-smoke.pids}"

red()   { printf '\033[0;31m%s\033[0m\n' "$*"; }
green() { printf '\033[0;32m%s\033[0m\n' "$*"; }
yellow(){ printf '\033[0;33m%s\033[0m\n' "$*"; }

check_dev_server() {
  local code
  code=$(curl -s -o /dev/null -w "%{http_code}" "$DEV_URL" 2>/dev/null || echo "000")
  echo "$code"
}

# First still-alive PID recorded for one kind (dev-server or mark), or nothing.
first_live_recorded_pid() {
  local kind="$1" line pid
  [ -f "$DEV_PIDFILE" ] || return 0
  while IFS= read -r line; do
    # `[ x = pat* ]` is a LITERAL compare in test(1) — the kind prefix must
    # match through case, like live_entries/kill_recorded below.
    case "$line" in
      "$kind:"*) ;;
      *) continue ;;
    esac
    pid="${line#*:}"
    if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
      printf '%s\n' "$pid"
      return 0
    fi
  done < "$DEV_PIDFILE"
  return 0
}

record_pid() {
  printf '%s:%s\n' "$1" "$2" >> "$DEV_PIDFILE"
}

# Pidfile entries (kind:pid) whose recorded PID is still alive.
live_entries() {
  [ -f "$DEV_PIDFILE" ] || return 0
  local line pid
  while IFS= read -r line; do
    case "$line" in
      dev-server:*|mark:*) ;;
      *) continue ;;
    esac
    pid="${line#*:}"
    if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
      printf '%s\n' "$line"
    fi
  done < "$DEV_PIDFILE"
}

prune_pidfile() {
  local live
  live="$(live_entries || true)"
  if [ -n "$live" ]; then
    printf '%s\n' "$live" > "$DEV_PIDFILE"
  else
    : > "$DEV_PIDFILE"
  fi
}

# Kill ONLY the recorded, liveness-checked, still-owned PIDs of one kind —
# never pattern matching, never port-based, never an unrecorded process.
kill_recorded() {
  local kind="$1" line pid killed_any=0
  [ -f "$DEV_PIDFILE" ] || return 0
  while IFS= read -r line; do
    # `[ x = pat* ]` is literal in test(1) — match the kind prefix via case
    # (same trap fixed in first_live_recorded_pid above).
    case "$line" in
      "$kind:"*) ;;
      *) continue ;;
    esac
    pid="${line#*:}"
    [ -n "$pid" ] || continue
    kill -0 "$pid" 2>/dev/null || continue
    yellow "Stopping recorded $kind process (PID $pid)"
    kill "$pid" 2>/dev/null || true
    sleep 0.5
    if kill -0 "$pid" 2>/dev/null; then
      kill -9 "$pid" 2>/dev/null || true
    fi
    killed_any=1
  done < "$DEV_PIDFILE"
  if [ "$killed_any" -eq 1 ]; then
    sleep 0.5
  fi
  prune_pidfile
  return 0
}

# Honest ownership report for the dev port: PID and command of the listener,
# via host lsof/ps. Never kills the foreign owner, never adopts it.
report_port_owner() {
  local listener command_name
  listener=$(lsof -nP -iTCP:"$DEV_PORT" -sTCP:LISTEN 2>/dev/null | awk 'NR>1 {print $2; exit}')
  if [ -n "${listener:-}" ]; then
    command_name=$(ps -p "$listener" -o command= 2>/dev/null || echo "unknown")
    red "Dev port $DEV_PORT is owned by an untracked process (PID ${listener:-unknown}, command: ${command_name:-unknown})"
  else
    red "Dev port $DEV_PORT has no identifiable listener (lsof/ps found no owner)"
  fi
  red "Refusing to adopt or kill an unrecorded process — free port $DEV_PORT or stop the owner yourself, then rerun."
  return 0
}

wait_dev_server() {
  local i code
  for i in $(seq 1 30); do
    code=$(check_dev_server)
    if [ "$code" = "200" ] && [ -n "$(first_live_recorded_pid dev-server)" ]; then
      green "Dev server ready (${i}s)"
      return 0
    fi
    sleep 1
  done
  red "Dev server failed to start after 30s"
  report_port_owner
  return 1
}

start_dev_server() {
  local code owned
  owned=$(first_live_recorded_pid dev-server)
  code=$(check_dev_server)
  if [ "$code" = "200" ]; then
    if [ -n "$owned" ]; then
      green "Dev server already running (HTTP $code)"
      return 0
    fi
    red "HTTP $code on dev port $DEV_PORT, but the run pidfile records no live dev server — that answer belongs to an untracked owner."
    report_port_owner
    return 1
  fi
  yellow "Dev server dead or missing (HTTP $code), restarting..."
  if [ -n "$owned" ]; then
    kill_recorded dev-server
  fi
  npm run dev > "$DEV_LOG" 2>&1 &
  record_pid dev-server "$!"
  wait_dev_server
}

build_binary() {
  yellow "Building Mark binary..."
  cargo build --manifest-path src-tauri/Cargo.toml --bin mark 2>&1 | tail -3
  green "Build OK"
}

launch_mark() {
  kill_recorded mark
  # C-DEV-ENV-ISOLATION: redirect stdout too — a long-lived child holding
  # the script's stdout pipe would hang any caller waiting on our stdio
  # (spawnSync waits for EOF; the old pattern kill closed it by accident).
  # env(1) execs the binary directly — an env-prefixed background command
  # wraps in a subshell, so $! would be the wrapper's PID, not the binary's
  # (the pidfile must record the process we actually own and probe).
  env MARK_SKIP_MIGRATION=1 "$BINARY" </dev/null >>"$STDERR_LOG.mark-stdout" 2>"$STDERR_LOG" &
  local pid=$!
  record_pid mark "$pid"
  # C-DEV-ENV-ISOLATION: bounded launch grace — probe with retries instead
  # of one blind pause, so a slow fork under load is not misread as a crash
  # (and a genuinely dead binary still fails within the same budget).
  # Startup is proven by FIRST OUTPUT (the binary's stderr). Bare liveness
  # at t=0 proves nothing — a freshly forked child has not registered
  # anywhere yet, so an early liveness probe reads as a false crash. The
  # dead-check runs only after first output arrives (or the budget ends).
  local waited=0
  while [ "$waited" -lt 5 ] && [ ! -s "$STDERR_LOG" ]; do
    sleep 1
    waited=$((waited + 1))
  done
  if ! kill -0 "$pid" 2>/dev/null; then
    red "Mark crashed on launch! Stderr:"
    cat "$STDERR_LOG"
    red "Launch diagnostics (pid $pid):"
    /bin/ps -p "$pid" -o pid,stat,command 2>&1 || true
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
  local server_code owned
  server_code=$(check_dev_server)
  if [ "$server_code" = "200" ]; then
    owned=$(first_live_recorded_pid dev-server)
    if [ -n "$owned" ]; then
      green "Dev server: HTTP $server_code (recorded dev server PID $owned)"
    else
      yellow "Dev server: HTTP $server_code, but no live dev server is recorded in $DEV_PIDFILE"
      report_port_owner
    fi
  else
    red "Dev server: HTTP $server_code (DEAD)"
  fi

  local mark_pid
  mark_pid=$(first_live_recorded_pid mark)
  if [ -n "$mark_pid" ]; then
    green "Mark process: running (recorded PID $mark_pid)"
  else
    red "Mark process: not running (no live PID recorded in $DEV_PIDFILE)"
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
