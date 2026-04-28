# muya WKWebView perf harness

Phase-B1 step-2.5 verification gate. Self-contained synthetic harness:
**no IPC, no Pinia, no Element Plus, no router** — just muya mounted on
a fixed-size markdown fixture so initial-render cost, typing latency, and
scroll FPS can be measured cleanly across runtimes.

Per `docs/development-plan.xml` Phase-B1 step-2.5 PASS criterion:
- WKWebView ≤ 1.5× Electron 41 v1.2.3 baseline
- p95 keystroke latency ≤ 50ms
- cold-start (initial render) ≤ 1500ms

FAIL → escalate to user; do NOT proceed to Phase-B2.

## Files

- `index.html` — entry; loads `main.js` as a module.
- `main.js` — instantiates Muya, runs the benchmark phases, writes results
  to `#report` div + `console.log` with stable `[BENCH]` prefix.
- `fixture.js` — exports `FIXTURE_MARKDOWN` (~6 KB markdown spanning
  headings, paragraphs, lists, code blocks, tables, links). Stable content
  is required for cross-runtime comparison.
- `vite.config.js` (project root) rollupOptions.input adds `bench` so
  `vite build` emits `src/renderer/dist/bench/index.html` — Tauri can
  load it via the bundled frontendDist.

Layout (after step-1.5 + 2.5a):
```
reborn-mark/
├── vite.config.js           ← multi-entry: main + bench
├── src/
│   └── renderer/
│       ├── index.html       ← main app entry
│       ├── bench/           ← THIS HARNESS
│       │   ├── index.html
│       │   ├── main.js
│       │   ├── fixture.js
│       │   └── README.md
│       └── src/             ← Vue 3 app
└── src-tauri/               ← Rust side (M-001..M-013b)
```

## Phases

1. **initial-render**: time from `t0 = performance.now()` (immediately
   before `new Muya(...)`) to the second `requestAnimationFrame` callback
   after construction (i.e. layout + first paint complete).
2. **typing-p95**: simulate 60 keystrokes via `editor.contentState.cursor`
   manipulation (NOT `dispatchEvent` — keyboard events go through muya's
   own keyboard handler which is the real-app path). Record per-keystroke
   render latency; report p50, p95, max.
3. **scroll-fps**: pre-load 200KB markdown, scroll programmatically with
   `requestAnimationFrame`-driven `scrollTop` updates over 5 seconds,
   compute FPS via `(rafCount / elapsedSec)`.

## Stable log markers

- `[BENCH][PHASE_INIT_RENDER ms=N]`
- `[BENCH][PHASE_TYPING p50=A p95=B max=C samples=N]`
- `[BENCH][PHASE_SCROLL fps=F frames=N elapsed_ms=M]`
- `[BENCH][REPORT_DONE]`

## How to run

### Tauri WKWebView
```
npm install
npm run build           # bundles bench → src/renderer/dist/bench/
cargo tauri dev --bin bench-harness   # planned: separate Rust bin
                                        # (deferred to step-2.5b)
```

### Electron v1.2.3 baseline
```
cd ../mark-electron
# bench/ files are NOT in mark-electron tree; copy a built artifact
# OR run the built dist/bench/index.html directly in Chrome with
# --enable-gpu-benchmarking --headless=new for deterministic measurement.
```

Cross-runtime comparison protocol:
1. Bundle the harness once via `vite build`. Use the SAME bundle in both
   runtimes — eliminates Vite-config drift as a confound.
2. Run each phase 5 times per runtime; discard min+max; average remaining 3.
3. Record results in `docs/perf-bench-v1.2.3-vs-tauri.md` (created in
   step-2.5b).

## What this harness does NOT exercise

- IPC roundtrip latency (M-013 path) — by design; perf gate is strictly
  about WebView render-engine cost.
- File I/O (M-002) — markdown is hardcoded.
- Search (M-004) — no search invocation.
- Image rendering — fixture has links but no embedded images.

These belong in B2 / B3 integration benchmarks, not in B1's gate.
