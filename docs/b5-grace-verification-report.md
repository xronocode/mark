# Phase B5 — GRACE Verification Report

**Date:** 2026-05-24
**Branch:** `b5-grace-verification`
**Scope:** 7 modules (M-024 → M-030), 3 waves

---

## Executive Summary

Wave 1 and Wave 3 modules were verified against their V-M-* specs in
`docs/verification-plan.xml`. Wave 2 (M-026, M-027) is not yet implemented —
expected, status="pending" in plan.

**Gate result: CONDITIONAL PASS** — core functionality delivered for all
implemented modules, but implementation scope is narrower than spec in 3 of 5
modules. BLOCK observability markers are the most systematic gap.

---

## Module Verdicts

### Wave 1 (alpha.6 — shipped)

#### M-024 perf-splash — SUPERSEDED

- **Spec status:** done (implemented-at `7e8afce2`)
- **Current state:** Splash screen intentionally removed (`1b3a5c04`)
- **Rationale:** Tauri 2 cold-launch is fast enough without a splash.
  Commit `4c9c5865` further cleaned splash remnants.
- **Impact:** V-M-024 spec is obsolete. All 11 BLOCK markers, splash.css,
  inline timing scripts, CSP hashes, verify-splash-budget.mjs — none apply.
- **`__BOOT_T0__`:** Still set in `main.js` line 1 — consumed by M-030 bench
  harness. This cross-module contract survives.
- **Verdict:** N/A (architecture changed, spec needs deprecation flag)

#### M-025 perf-pending-opens-parallel — PASS (16/17)

- **All renderer BLOCK markers present** (8/8): LISTENERS_READY, DRAIN_INVOKED,
  DRAIN_RESPONSE_RECEIVED, DRAIN_EMPTY, NEW_TAB_RECEIVED, PINIA_NOT_READY,
  DRAINED, DRAIN_FAILED.
- **All backend BLOCK markers present** (5/5): DRAIN_COMPLETE, DIRECT_EMIT,
  DIRECT_EMIT_FAILED, DIRECT_EMIT_NO_WINDOW, QUEUED.
- **PendingOpens struct:** `{ queue: Mutex<Vec<String>>, drained: AtomicBool }` ✓
- **Ordering invariant:** Promise.all(listen) → LISTENERS_READY → DRAIN_INVOKED,
  drain runs parallel to app.mount(). ✓
- **Renderer tests:** bootstrap-ipc ✓, editor-store.pending-opens ✓,
  pending_opens_invariants ✓
- **Gap:** `src-tauri/tests/integration_pending_opens.rs` does not exist.
  Rust-side drain logic is tested only through renderer E2E flow.

### Wave 2 (alpha.7 — NOT IMPLEMENTED)

#### M-026 perf-lazy-renderers — PENDING
#### M-027 perf-element-plus-treeshake — PENDING

Both remain status="pending" in development-plan.xml. Expected.

### Wave 3 (post-alpha — implemented)

#### M-028 perf-muya-defer — PARTIAL

- **Spec asks:** requestIdleCallback-based deferred muya init for background
  tabs, 5-state machine (pending → initializing → ready → destroyed | error),
  13 BLOCK markers, idle.ts polyfill, cancelIdleCallback on close.
- **Actual implementation** (`ad866663`): `_bootPhase` flag in editor store
  that suppresses reactive bus emits (file-changed, file-loaded, tabIdToIndex
  rebuild) during the drain phase. `END_BOOT_PHASE` flips flag after drain.
- **Test coverage:** `editor-boot-phase.test.js` (128 lines) ✓
- **What works:** Reduces reactive churn during session restore with many tabs.
  Measurable perf improvement for the drain path.
- **Gaps:** No requestIdleCallback deferral, no state machine, no idle.ts,
  0/13 BLOCK markers, no placeholder rendering, no promote-on-switch.
- **Assessment:** Pragmatic shortcut — addresses the same perf bottleneck
  (background tab overhead during boot) via a simpler mechanism. Full idle
  deferral would require significant editor.vue restructuring.

#### M-029 perf-window-state — PARTIAL

- **Spec asks:** tauri-plugin-window-state integration + 11 BLOCK markers +
  settings window exclusion + Rust/E2E tests + shim wrapper.
- **Actual implementation** (`7862d249`): 3 files changed — plugin added to
  Cargo.toml, registered in main.rs, capabilities updated.
- **What works:** Window geometry persists and restores across launches.
  Position, size, maximized state all saved to
  `~/Library/Application Support/com.xronocode.mark/.window-state.json`.
- **Gaps:**
  - 0/11 BLOCK observability markers
  - Settings window NOT excluded (no denylist/filter_callback)
  - No Rust tests, no E2E tests
  - No window_state_log.rs shim
- **Assessment:** Core value delivered (geometry persistence). Settings window
  tracking is a minor UX issue (settings always opens centered anyway).
  BLOCK markers would help debugging but are not user-facing.

#### M-030 perf-bench-harness — PARTIAL

- **Spec asks:** 3-part module: (A) Rust BOOT_T0 instrumentation, (B) CLI
  harness, (C) CI gate with baseline/config/workflow.
- **Actual implementation** (`fc36a2c6`): Part B only — bench-launch.mjs CLI
  (271 lines) that launches binary, captures BLOCK_* markers from stderr,
  produces waterfall report. Supports --baseline comparison with 10% threshold.
- **Bug fix** (`26c54d41`): isDirectRun guard prevents Mark spawn during vitest.
- **Test:** bench-launch-parser.test.js (parseLine function) ✓
- **Gaps:**
  - Part A: No Rust boot_marker.rs, no BOOT_T0 Lazy<Instant> in main()
  - Part C: No bench-baseline.json, bench-config.json, perf-gate.yml
  - No phase ordering enforcement in harness
  - No bench:ci or bench:update-baseline npm scripts
  - 0 named BLOCK markers emitted by harness itself
- **Assessment:** Usable for manual perf measurement. CI gate infrastructure
  deferred — reasonable since perf baselines need stable hardware (CI runners
  vary too much for <10% regression detection).

---

## Cross-Module Contracts

| Contract | Status |
|----------|--------|
| `__BOOT_T0__` JS anchor (M-024 → M-030) | ✓ Set in main.js, read by bench-launch |
| Splash dismount on active-tab ready (M-024 → M-028) | N/A (splash removed) |
| Listeners-before-drain ordering (M-025) | ✓ Promise.all → drain |
| Drain parallel to vue mount (M-025) | ✓ setupIpcListeners not awaited |
| Plugin registered before .setup() (M-029) | ✓ Line order correct |
| Phase ordering invariant (M-030) | ✗ Not enforced in harness |

---

## Recommendations

1. **M-024:** Add `status="superseded"` to V-M-024 in verification-plan.xml.
   Remove from B5 wave count. Document rationale.

2. **M-025:** Write `integration_pending_opens.rs` or accept renderer-only
   test coverage as sufficient for the drain/direct-emit logic.

3. **M-028:** Accept narrow implementation as "done-for-now". Full idle
   deferral is a Phase-C candidate if session-restore latency remains an issue
   with 10+ tabs.

4. **M-029:** Add settings window to denylist (`Builder::new().with_denylist(&["settings"])`).
   BLOCK markers are nice-to-have, not blocking.

5. **M-030:** The harness works for its primary use case (manual perf triage).
   CI gate (Part C) should be deferred to when we have stable CI hardware
   (macOS runners on M-series).

---

## Gate Decision

**CONDITIONAL PASS** — all B5 perf goals are functionally met:
- Pending opens run parallel to mount ✓
- Background tab reactive churn suppressed during boot ✓
- Window geometry persists across launches ✓
- Bench harness available for manual waterfall analysis ✓
- Splash removed (faster than splash + dismount) ✓

Observability (BLOCK markers) and test coverage gaps are tracked but do not
block alpha progression.
