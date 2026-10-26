# muya WKWebView perf harness

Phase-B1 step-2.5 verification gate, extended by C-LARGE-DOC-STAGE-0
(T-003) into the Stage 0 measurement vehicle. Self-contained synthetic
harness: **no IPC, no Pinia, no Element Plus, no router** — just muya
mounted on a fixture markdown so initial-render cost, typing latency, and
scroll jank can be measured cleanly across runtimes. Typing and scroll
phases are measured only in runs that emit numeric PHASE_ markers — the
old SKIPPED stubs are gone; a required phase without a numeric result
fails the driver.

Per `docs/development-plan.xml` Phase-B1 step-2.5 PASS criterion (applies
to the built-in ~6 KB fixture with default open-only phases):
- WKWebView ≤ 1.5× Electron 41 v1.2.3 baseline
- p95 keystroke latency ≤ 50ms
- cold-start (initial render) ≤ 1500ms

FAIL → escalate to user; do NOT proceed to Phase-B2.

## Files

- `index.html` — entry; loads `main.js` as a module.
- `main.js` — instantiates Muya on the fixture (built-in, or
  driver-provided via `window.__BENCH_OPTIONS__.fixtureText`), runs the
  requested benchmark phases, writes results to the `#report` div +
  `console.log` with the stable `[BENCH]` prefix.
- `fixture.js` — exports `FIXTURE_MARKDOWN` (~6 KB markdown spanning
  headings, paragraphs, lists, code blocks, tables, links). Stable content
  is required for cross-runtime comparison.
- `run-bench.mjs` — cross-engine driver (Chromium + WebKit). This driver
  is the Chromium-tier vehicle for Stage 0: the Playwright chromium
  project ignores `**/perf/**`, so numeric Chromium PHASE_ results come
  from this driver, never from a Playwright project.
- `baseline/` — recorded baselines.
- Corpus fixtures live in `tests/e2e/fixtures/large-doc/` (deterministic
  generators + shape metadata; `regen.mjs --check` proves byte-identical
  regeneration; non-UTF-8 byte-policy fixtures materialize on demand via
  `generators/ensure.mjs`).

## Stable log markers

- `[BENCH] [PHASE_INIT_RENDER ms=N]`
- `[BENCH] [PHASE_TYPING n=N p50_ms=A p95_ms=B max_ms=C mean_ms=D truth=ok]`
  — per-keystroke input→next-paint through the REAL input pipeline:
  `document.execCommand('insertText')` fires the genuine
  beforeinput/input chain (inputType=insertText) into muya's inputCtrl —
  the same path compositionend takes for IME. `truth=ok` asserts the
  Markdown changed after the edits and undo restored the pre-edit value.
- `[BENCH] [PHASE_SCROLL frames=N elapsed_ms=M fps=F frame_p50_ms=A
  frame_p95_ms=B frame_max_ms=C frames_gt_50ms=G]` — frame-interval jank
  distribution of a programmatic document scroll, not just average FPS.
- `[BENCH] [REPORT_DONE status=ok|fail]`

## How to run

```
npm run build                                   # bundles bench → src/renderer/dist/bench/
npm run preview                                 # serve on :4173 (separate terminal)
node src/renderer/bench/run-bench.mjs           # built-in fixture, open-only, legacy gate
node src/renderer/bench/run-bench.mjs \
  --fixture tests/e2e/fixtures/large-doc/mixed-100k.md \
  --phases open,typing,scroll --runs 3          # Stage 0 corpus measurement
```

The driver prints the fixture identity (bytes + sha256), per-engine stats
tables for every required phase, the raw per-run phase lines for evidence
trails, and exits non-zero when any required phase fails to produce a
numeric result in any engine run (SKIPPED/FAILED/missing all fail).
Corpus fixtures are report-only for the Phase-B1 thresholds — the legacy
gate applies exclusively to the built-in fixture with default open-only
phases.

Cross-runtime comparison protocol:
1. Bundle the harness once via `vite build`. Use the SAME bundle in both
   runtimes — eliminates Vite-config drift as a confound.
2. Run each phase 5 times per runtime (3 for corpus fixtures); discard
   min+max; average the remainder.
3. Record corpus results in `baseline/large-doc/` (Stage 0 T-009).

## What this harness does NOT exercise

- IPC roundtrip latency (M-013 path) — by design; perf gate is strictly
  about WebView render-engine cost.
- File I/O (M-002) — markdown is fixture-provided, not read from disk.
- Search (M-004) — no search invocation.
- The full app change pipeline (word count, TOC, history deep-copy,
  autosave) — those are measured by the unit microbenches under
  `tests/renderer/perf/` (T-005) and the characterization suites.
