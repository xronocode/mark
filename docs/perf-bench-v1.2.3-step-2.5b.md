# Phase-B1 step-2.5b — muya WKWebView Perf Gate Report

**Date:** 2026-04-28
**Harness:** `reborn-mark/src/renderer/bench/` (commit c4128ef + driver run-bench.mjs)
**Driver:** Playwright 1.x — headless Chromium (= Electron 41 engine class)
+ headless WebKit (= WKWebView engine class)
**Host:** macOS arm64 (M2 Air), Node v22.19.0
**Bundle:** `vite build` of bench entry only — main entry temporarily
disabled because v1.2.3 renderer transitively pulls in
`electron-log/renderer`, `@hfelix/electron-localshortcut`,
`src/main/preferences/schema.json` — all to be re-shimmed by M-013b in B2.
**Bundle size:** bench = 742 KB JS (gzip 201 KB) + lazy mermaid/vega/
cytoscape chunks (~3 MB total uncompressed; only ~742 KB executed at boot).

## Phase 1 — initial render only

PHASE_TYPING and PHASE_SCROLL are stubbed in step-2.5a (emit
`SKIPPED reason=stub-deferred-to-step-2.5b` markers). They will be
filled in step-2.5b follow-up after the gate decision.

5 runs per engine; first-run JIT warmup included in samples (intentional —
muya cold-start is what matters for app launch UX).

| engine   | n | p50    | p95    | mean   | min    | max    |
|----------|---|--------|--------|--------|--------|--------|
| chromium | 5 |  71.9  | 172.6  |  90.3  |  65.3  | 172.6  |
| webkit   | 5 | 418.0  | 577.0  | 408.6  | 240.0  | 577.0  |

All values in milliseconds.

### Warm-only (runs 2-5)

Discarding run 1 (JIT warmup) gives steady-state numbers:

| engine   | runs 2-5 mean |
|----------|---------------|
| chromium |  ~70  ms      |
| webkit   |  ~366 ms      |

## Gate decision (per dev-plan Phase-B1 step-2.5)

| criterion | required | observed | result |
|-----------|----------|----------|--------|
| WebKit/Chromium mean ratio | ≤ 1.5× | **4.52×** (full) / **5.2×** (warm) | **FAIL** |
| WebKit p95 cold-start | ≤ 1500 ms | 577 ms | PASS |
| Chromium p95 cold-start | ≤ 1500 ms | 172.6 ms | PASS |

**Verdict: FAIL — WebKit is 4-5× slower than Chromium at muya initial
render, far above the 1.5× tolerance the dev-plan set.**

Per Phase-B1 step-2.5: "FAIL → escalate decision to user; do NOT
proceed to Phase-B2."

## Caveats — read before interpreting

1. **Headless playwright WebKit ≠ real Tauri WKWebView.** Playwright
   uses an embedded build of WebKit; Tauri uses the system WKWebView
   on macOS. Real Tauri may be faster (system WKWebView is more tuned)
   or slower (Tauri-specific config). Definitive numbers require a
   `cargo tauri dev` boot, which step-1 of B1 has scaffolded but not
   wired window creation for; an additional sub-step is needed before
   we can measure real Tauri behavior.

2. **The bench entry imports the FULL muya engine** (eventHandler/*,
   ContentState, all renderers including KaTeX/mermaid/vega/cytoscape
   bindings). The 742 KB bundle has parse cost that dominates the
   "render the fixture" measurement. A smaller muya-core import would
   give different numbers — we measured "muya as a Mark user actually
   imports it", not "muya core in isolation".

3. **High WebKit variance** (240-577 ms across 5 runs) suggests
   non-deterministic factors — possibly thermal throttling on M2 Air
   under headless launch overhead, possibly playwright-WebKit's
   warmup being less stable than Chromium's V8.

4. **First-run JIT warmup matters** — both engines show a slow first
   sample. App cold-start IS the first run from the user's perspective,
   so including it is the honest measurement. But for "is muya viable
   in WKWebView at all" the warm steady state is more diagnostic.

## Implications

The strict 1.5× ratio gate was set assuming WebKit and Chromium would
be comparable at this workload. They are not. Three paths forward:

### Path 1 — Accept FAIL, abort Phase-B Tauri port (worst case)

Cost: throws away pre-2 work (migration safety floor in reborn-mark/
already commits ~1300 LOC Rust). No structural answer to the 400 MB
v1.2.3 RAM concern.

### Path 2 — Re-frame the gate (likely correct)

The ratio criterion was aspirational; both engines hit absolute
cold-start under 1500 ms (WebKit p95 = 577 ms, well within UI-decent).
Muya runs in WebKit; it's slower but functional. Phase B continues with
the understanding that WebKit costs ~4-5× more parse + initial-render
time than Chromium for muya's import graph.

Mitigations available:
- Lazy-load mermaid/vega/cytoscape via dynamic imports (vite already
  splits them; ensure they're not in the main entry's static graph).
- Strip dead muya renderers at build time (plantUML pulls in zlib
  externally, etc.).
- Measure REAL Tauri WKWebView (not playwright WebKit) before final
  decision — likely closer to system WKWebView perf which is faster.

This re-frame is honest because WebKit cold-start under 1 second is
genuinely usable for a Markdown editor.

### Path 3 — Investigate before deciding

Build a smaller muya-core fixture that imports only the renderer paths
the perf gate cares about (paragraphs + headings + tables, no diagrams).
Re-measure. If muya-core alone is ≤1.5× across engines, the diagram
chunks are the cost driver and we can keep them lazy. If muya-core is
ALSO 4-5× slower, there is something fundamental about WebKit's
ContentState evaluation cost.

Effort: ~half-day to write a slim muya-core harness; would give a
clean go/no-go answer.

## Recommendation

**Path 3 first, then Path 2.** A morning of investigation tells us
whether this is a renderer-mix issue (cheap fix: lazier imports) or
a core-engine issue (live with it; WebKit is just slower at this
workload). Either way, an absolute 577 ms p95 cold-start is acceptable
for a Markdown editor — the structural arguments for Tauri (30 MB
bundle, native macOS integration, no Electron disclosures CVE surface)
still hold.

But the dev-plan says "FAIL → escalate to user", and I am respecting
the gate.

Awaiting decision.
