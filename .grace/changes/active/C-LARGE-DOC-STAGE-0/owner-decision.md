# Stage 0 owner decision gate — C-LARGE-DOC-STAGE-0 (R-9)

This document forces five owner decisions from the Stage 0 evidence. It is not
a decision record: every section ends with an owner line that is still blank.
It is also not release authorization — **no release or train admission follows
automatically** from Stage 0, from this document, or from a green build.

Evidence artifacts this document is founded on (no re-derivation needed):

- `src/renderer/bench/baseline/large-doc/baseline.json` and `baseline.md` —
  per-fixture/per-engine numbers with commit `29aae406`, exact fixture
  sha256/bytes, engine/runtime and run conditions (Node v22.19.0,
  Playwright 1.59.1, darwin-arm64, viewport 1024×768).
- `tests/renderer/perf/derived-state.test.js` — tier-1 microbenchmarks.
- `tests/e2e/perf/bench-phases-webkit.spec.ts` — the required WebKit renderer
  tier (numeric typing/scroll, SKIPPED fails).
- `tests/e2e/perf/characterization-*.spec.ts` — the behavioral oracles
  (save/close, metadata/external, IME/seeded).
- `src/renderer/bench/acceptance/README.md` — the owner-run real-app protocol.
  Its capture is **pending**; no native evidence is claimed here.

Measured baseline (observations on one owner machine, not budgets):

| fixture | bytes | engine | open p50 (ms) | typing p50 (ms) | typing p95 (ms) | longest task / proxy | heap after open |
|---|---|---|---|---|---|---|---|
| mixed-100k.md | 107,602 | Chromium | 140.1 | 33.3 | 33.9 | 0 tasks | 13.6 MB |
| mixed-100k.md | 107,602 | WebKit | 191 | 33 | 34 | lag p95 8 ms | not-supported |
| size-1mb.md | 1,058,416 | Chromium | 813.9 | 33.3 | 34.4 | 0 tasks | 51 MB |
| size-1mb.md | 1,058,416 | WebKit | 723 | 33 | 35 | lag p95 22 ms | not-supported |
| size-1_7mb-9000sections.md | 1,801,827 | Chromium | 1812 | 101.6 | 148.2 | 60 tasks &gt;50 ms, max 154 ms | 98.2 MB |
| size-1_7mb-9000sections.md | 1,801,827 | WebKit | 2389 | 87 | 116 | lag p95 85 ms; scroll p95 37 ms, 1 jank frame | not-supported |

Cost breakdown at the reference shape: Chromium mount 1,478 ms of 1,812 ms
open (parse proxy 30 ms, first paint 334 ms); WebKit mount 2,180 ms of
2,389 ms. Typing cost at 1.7 MB roughly triples against 100 KB/1 MB
(101.6/87 ms p50 vs 33 ms), and only the 1.7 MB shape produces long tasks.
Observer overhead measured against the same-run uninstrumented control stays
inside noise (0.99–1.02×), so the harness does not inflate these numbers.
Source-mode, tab-close heap and file-arrival→tab-state are **not applicable**
in this tab-less harness (recorded, not guessed; characterization suites own
the source-mode behavior).

---

## Decision 1 — Confirmed target document size

**Question.** Which document size is the supported target that later waves and
budgets are defined against?

**Evidence.** 100 KB is comfortable in both engines (140/191 ms open, 33 ms
typing, no long tasks). 1 MB stays under a second of open (814/723 ms) and
keeps ordinary typing latency (34 ms). The accepted 1.7 MB / 9,536-section
shape costs 1.8–2.4 s to open and starts producing long tasks (60 &gt; 50 ms,
max 154 ms) and 37 ms scroll frames in WebKit.

**Proposed option (for owner approval).** Support 1 MB as the comfortable
target; treat the 1.7 MB / 9,000+ section shape as the stress/reference shape
that must remain usable but is not promised the same latency; 100 KB is the
ordinary-document baseline for relative tolerance.

**Owner decision: 1.7 MB / 9000 sections** (recorded 2026-10-29, owner instruction «действуем по твоей рекомендации»; preliminary until re-confirmed against these tables) — source: decisions-preliminary.md

## Decision 2 — Absolute budgets and same-run relative tolerance

**Question.** Which absolute numbers become acceptance gates, on which
platform labels, and what relative tolerance applies to ordinary documents?

**Evidence.** Tables above. Measured first visible content (open p50) is
140–191 ms at 100 KB, 723–814 ms at 1 MB, 1.8–2.4 s at 1.7 MB. Typing p95 is
34 ms up to 1 MB and 116–148 ms at 1.7 MB. Longest main-thread task is
154 ms (Chromium, 1.7 MB) and the WebKit proxy p95 is 85 ms. Scroll frame p95
is 17–18 ms up to 1 MB and 37 ms at 1.7 MB. Time-to-input and tail-mount
completion are **not** separately instrumented in Stage 0 (tail mount does not
exist until Wave A; time-to-input needs a tab-lifecycle harness); budgets for
them are deferred to Wave A rather than guessed here.

**Proposed option (for owner approval).** Ordinary (≤100 KB): first visible
content ≤ 400 ms; p95 input-to-next-paint ≤ 50 ms; same-run relative tolerance
+20 % against the recorded baseline. 1 MB: open ≤ 1,500 ms; typing p95
≤ 100 ms. 1.7 MB stress: open ≤ 4,000 ms; typing p95 ≤ 250 ms; longest task
≤ 300 ms; scroll frame p95 ≤ 50 ms. Labels: Chromium/Long-Tasks vs
WebKit/event-loop-lag-proxy are separate series and are never merged.
Tail-mount and time-to-input budgets: deferred to Wave A, explicitly absent.

**Owner decision: pending the final tables** (deliberately open: absolute + relative budgets are approved only against the completed baseline tables per the spec, never guessed)

## Decision 3 — Wave A / Wave B order

**Question.** Which cost trajectory is fixed first: progressive mount (open),
or the change/derived-state pipeline (typing)?

**Evidence.** Mount dominates opening: 1,478 of 1,812 ms (82 %) on Chromium and
2,180 of 2,389 ms (91 %) on WebKit at 1.7 MB. Typing is a flat 33 ms up to
1 MB and only degrades at the 1.7 MB stress shape; there the long tasks
(60 &gt; 50 ms) and the 101.6 ms p50 point at synchronous derived work, but the
absolute user-visible cost is smaller than the mount cost at every measured
size.

**Proposed option (for owner approval).** Wave A (progressive mount) first,
then Wave B1/B2 (change-source contract, lazy derived pipeline), with B3
(history materialization) last. Wave B must not start before the Wave A
baseline is re-shot on the same corpus.

**Owner decision: Wave A first** (progressive mount; recorded 2026-10-29, preliminary — mount dominates: 809 ms of ~890 on 1 MB while parsing is 18 ms) — source: decisions-preliminary.md

## Decision 4 — Crash-durability contract

**Question.** What durability may be promised, and is a WAL approved?

**Evidence.** Stage 0 found no write-ahead log, no temp/commit phase and no
unsaved-recovery path: a rejected save leaves the tab dirty with no recovery
artifact; a dirty tab plus a live external rewrite is silently overwritten;
an in-place save gives no old-or-new guarantee. Characterization suites record
these as observed behavior with a desired invariant, never as acceptable
behavior.

**Proposed option (for owner approval).** Adopt the explicit no-WAL contract:
**no unsaved-recovery guarantee is claimed** — a hard crash may lose every edit
since the last committed save (an untitled buffer in full), and the current
in-place save can damage even the previous file. The target is an atomic
old-or-new save, approved as its own prerequisite change. A durable-before-ack
WAL requires a separate approval before any claim.

**Owner decision: no WAL, honest** (atomic old-or-new save; no unsaved-recovery guarantee claimed; WAL may come as a separately approved change; recorded 2026-10-29, preliminary) — source: decisions-preliminary.md

## Decision 5 — Later-wave experimental access model

**Question.** How do experimental large-document paths reach users before they
are default?

**Evidence.** Stage 0 ships no runtime flag and no default change. The
characterization oracles and the bench are the only new surfaces; the bench is
not part of the product UI.

**Proposed option (for owner approval).** Any later experimental path is
local, default-off and session-latched behind a visible Experimental setting
that never persists silently; flipping a default requires a separate approved
change. Support-only preference and private build are the alternatives.

**Owner decision: visible Experimental settings section** (local, default-off, session-latched until a separately approved flip; recorded 2026-10-29, preliminary) — source: decisions-preliminary.md

---

## Proposed next C-* boundary

**Working title:** `C-LARGE-DOC-WAVE-A` — progressive mount for large documents.
**Observed write scope to be confirmed at spec time:** the Muya render/mount
pipeline (`src/muya/lib/parser/render/**`, `src/muya/lib/index.js`), the editor
mount seam (`src/renderer/src/components/editorWithTabs/editor.vue`), and the
Stage 0 harness files that measure it. **No production write is authorized by
this document**; the next change needs its own spec and approval.

## Durable landing

The approved contract (target size, budgets, wave order, crash contract,
access model) lands in `.grace/context/ux-guidelines.xml` after the owner
decides, in a follow-up governed step or a separate governance bundle that
must land before any Wave A/B spec. This document does not write it.

## What this document does not authorize

No release, no tag, no train admission, no Wave A/B implementation, and no
claim of native WKWebView evidence (the real-app capture is pending and
owner-run). No feature flag is introduced by Stage 0.
