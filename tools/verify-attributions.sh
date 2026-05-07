#!/usr/bin/env bash
# Phase-B4 step-9 verify-attributions.sh — CI gate for NOTICES freshness.
#
# Re-runs the NOTICES generators and diffs against committed files.
# Fails CI if a new dependency landed without an attribution line being
# refreshed. Run locally to refresh:
#
#   ./tools/verify-attributions.sh --refresh
#
# Without --refresh the script is read-only: regenerates to a tmp file
# and diffs.

set -euo pipefail

REFRESH=0
if [ "${1:-}" = "--refresh" ]; then
  REFRESH=1
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

NODE_OUT="NOTICES-node.md"
RUST_OUT="NOTICES-rust.md"
NODE_TMP=$(mktemp)
RUST_TMP=$(mktemp)
trap 'rm -f "$NODE_TMP" "$RUST_TMP"' EXIT

# ── Node side ────────────────────────────────────────────────────────
echo "[verify-attributions] generating node deps notice..."
npx --yes --package license-checker -- license-checker --production --json \
  > "$NODE_TMP.json" 2>/dev/null
node tools/build-notices-node.mjs "$NODE_TMP.json" > "$NODE_TMP"

if [ "$REFRESH" -eq 1 ]; then
  cp "$NODE_TMP" "$NODE_OUT"
  echo "[verify-attributions] refreshed $NODE_OUT"
else
  if ! diff -q "$NODE_OUT" "$NODE_TMP" >/dev/null 2>&1; then
    echo "::error::$NODE_OUT is stale. Run ./tools/verify-attributions.sh --refresh and commit." >&2
    diff -u "$NODE_OUT" "$NODE_TMP" | head -60 >&2 || true
    exit 1
  fi
  echo "[verify-attributions] $NODE_OUT up-to-date"
fi

# ── Rust side ────────────────────────────────────────────────────────
# cargo-bundle-licenses is installed via `cargo install cargo-bundle-licenses`
# in CI's setup steps. Locally: ensure it's on PATH before running.
if command -v cargo-bundle-licenses >/dev/null 2>&1; then
  echo "[verify-attributions] generating rust deps notice via cargo-bundle-licenses..."
  RUST_JSON_TMP=$(mktemp --suffix=.json 2>/dev/null || mktemp -t rustlic.json)
  (cd src-tauri && cargo-bundle-licenses --format json --output "$RUST_JSON_TMP") 2>&1 |
    grep -v "^\[.*WARN.*\] Confidence level SEMI" || true
  node tools/build-notices-rust.mjs "$RUST_JSON_TMP" > "$RUST_TMP"
  rm -f "$RUST_JSON_TMP"
  if [ "$REFRESH" -eq 1 ]; then
    cp "$RUST_TMP" "$RUST_OUT"
    echo "[verify-attributions] refreshed $RUST_OUT"
  else
    if ! diff -q "$RUST_OUT" "$RUST_TMP" >/dev/null 2>&1; then
      echo "::error::$RUST_OUT is stale. Run ./tools/verify-attributions.sh --refresh and commit." >&2
      diff -u "$RUST_OUT" "$RUST_TMP" | head -60 >&2 || true
      exit 1
    fi
    echo "[verify-attributions] $RUST_OUT up-to-date"
  fi
else
  echo "::error::cargo-bundle-licenses not installed; cannot verify rust attributions." >&2
  echo "          install with: cargo install cargo-bundle-licenses" >&2
  exit 1
fi

echo "[verify-attributions] OK"
