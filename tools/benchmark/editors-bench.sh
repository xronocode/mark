#!/usr/bin/env bash
# FILE: tools/benchmark/editors-bench.sh
# VERSION: 1.0.0
# START_MODULE_CONTRACT
#   PURPOSE: Reproduce the landing-page "Benchmarks" table — resident RAM
#            and installed size of Mark vs. anonymized Electron-based
#            editors, measured with a uniform 25-document corpus.
#   SCOPE: generates /tmp/md-bench corpus, launches each editor in an
#          isolated profile, sums RSS of app-owned processes, prints TSV.
#   DEPENDS: bash, python3, ps, du, pgrep; editors at /Applications paths.
#   LINKS: .grace/changes/active/C-14/ (benchmarks addendum); site/landing.
#   ROLE: SCRIPT
#   MAP_MODE: LOCALS
# END_MODULE_CONTRACT
#
# START_MODULE_MAP
#   gen_corpus - write the uniform 25-doc Markdown corpus to /tmp/md-bench
#   rss_of_marker - sum RSS (MB) of all processes carrying an isolated user-data-dir marker
#   bench_mark - launch the release Mark binary with the corpus, sample main-process RSS
#   bench_electron - launch an Electron editor in a throwaway profile, sample total RSS
# END_MODULE_MAP
#
# Methodology (kept identical to the numbers published on the site):
#   - corpus: 25 Markdown files (~54 KB total) with code blocks, math,
#     mermaid diagrams, tables, prose
#   - every editor gets ALL 25 files open (tabs) or the corpus as a vault
#   - Electron editors run with a throwaway --user-data-dir so the user's
#     real session never mixes in; every process carrying that marker is
#     summed (main + renderers + utility + extension host)
#   - Mark runs from the RELEASE .app (not a dev build); RAM = main process
#     RSS — its rendering happens in the system WebKit view, which the app
#     does not own or bundle
#   - settle time 25 s (Electron cold profile boot), single pass
# Results on Apple M5 / 32 GB / macOS 26.6 (2026-09-21):
#   Mark 113 MB / 28 MB installed · code editor 1517/1160 · agentic AI IDE
#   2313/676 · note-taking MD editor 803/481 (MB, RAM/installed)
set -euo pipefail

CORPUS=/tmp/md-bench
MARK_APP="${MARK_APP:-/tmp/bench-mark/Mark.app}"
VSC_BIN="/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code"
AG_BIN="/Applications/Antigravity.app/Contents/Resources/app/bin/antigravity"
OBS_BIN="/Applications/Obsidian.app/Contents/MacOS/Obsidian"
SETTLE="${SETTLE:-25}"

say() { printf '%s\n' "$*" >&2; }

gen_corpus() {
  rm -rf "$CORPUS" && mkdir -p "$CORPUS"
  python3 - <<'PY'
for i in range(1, 26):
    body = [f"# Benchmark Document {i:02d}", "", f"Sample document {i}.", "",
            "## Features", "", "- live rendering", "- agent workflow", "",
            "## Code", "", "```rust", f'fn main() {{ println!("doc {i}"); }}', "```", ""]
    if i % 3 == 0:  body += ["## Math", "", f"$$E = mc^{i}$$", ""]
    if i % 4 == 0:  body += ["## Diagram", "", "```mermaid", "graph TD; A-->B; B-->C;", "```", ""]
    if i % 5 == 0:  body += ["## Table", "", "| a | b |", "|---|---|", f"| {i} | {i*2} |", ""]
    body += ["## Text", "", ("Lorem markdown ipsum dolor sit amet, **bold** and *italic* text. " * 30), ""]
    open(f"/tmp/md-bench/doc{i:02d}.md", "w").write("\n".join(body))
PY
}

rss_of_marker() { # $1 = ps command marker (isolated user-data-dir)
  ps axo rss=,command= | grep -F "$1" | grep -v grep | awk '{s+=$1} END {printf "%.0f", s/1024}'
}

bench_mark() {
  [ -d "$MARK_APP" ] || { say "MARK_APP=$MARK_APP missing (see header comment)"; return 1; }
  "$MARK_APP/Contents/MacOS/mark" "$CORPUS"/doc*.md >/dev/null 2>&1 &
  local pid=$!
  sleep "$SETTLE"
  local rss; rss=$(ps -o rss= -p "$pid" | awk '{printf "%.0f", $1/1024}')
  kill "$pid" 2>/dev/null || true
  say "mark: ${rss} MB"
  printf 'mark\t%s\n' "$rss"
}

bench_electron() { # $1 label, $2 binary, $3 marker dir, $4 ext dir
  local label="$1" bin="$2" data="$3" ext="$4"
  rm -rf "$data" "$ext"
  "$bin" --user-data-dir "$data" --extensions-dir "$ext" "$CORPUS"/doc*.md >/dev/null 2>&1 &
  sleep "$SETTLE"
  local rss; rss=$(rss_of_marker "$data")
  pkill -f "user-data-dir $data" 2>/dev/null || true
  sleep 2
  say "$label: ${rss} MB"
  printf '%s\t%s\n' "$label" "$rss"
}

gen_corpus
say "== corpus ready: $(ls "$CORPUS" | wc -l | tr -d ' ') files =="
du -sm "$MARK_APP" 2>/dev/null | awk '{printf "mark_installed\t%s\n", $1}'
bench_mark
[ -x "$VSC_BIN" ] && { du -sm "/Applications/Visual Studio Code.app" | awk '{printf "code_editor_installed\t%s\n", $1}'; bench_electron code_editor "$VSC_BIN" /tmp/b-vsc /tmp/b-vscx; }
[ -x "$AG_BIN" ]  && { du -sm "/Applications/Antigravity.app"        | awk '{printf "agentic_ide_installed\t%s\n", $1}'; bench_electron agentic_ide "$AG_BIN" /tmp/b-ag /tmp/b-agx; }
[ -x "$OBS_BIN" ] && {
  "$OBS_BIN" "$CORPUS" >/dev/null 2>&1 & sleep "$SETTLE"
  ps axo rss=,command= | grep -i obsidian | grep -v grep | awk '{s+=$1} END {printf "md_notes_editor\t%.0f\n", s/1024}'
  du -sm "/Applications/Obsidian.app" | awk '{printf "md_notes_editor_installed\t%s\n", $1}'
  pkill -x Obsidian 2>/dev/null || true
}
