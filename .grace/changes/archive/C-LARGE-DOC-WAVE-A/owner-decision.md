# C-LARGE-DOC-WAVE-A — Owner Decision Document

Date: 2026-11-02. Every section below carries evidence from the committed
task Evidence items (plan.xml) and the baseline artifacts. Owner lines are
blank until decided; approved values land in the LargeDocumentContract
(.grace/context/ux-guidelines.xml) through this change's governance step
before any Wave B work. No release or train admission follows from any
decision here — Wave A is backlogged product improvement outside any train.

Evidence shorthand: [T-005] bench driver both paths, size-1mb, 3 runs/engine;
[T-006] webkit-perf e2e on final bytes; [T-007] re-shot paired baseline
(legacy+progressive per fixture/engine, committed artifact).

## Decision 1 — Time-to-input budget (contract-deferred)

Proposed default: time-to-input within first-visible-content + 250 ms on
every shape.

Measured: progressive TTI 39–169 ms across engines/runs on size-1mb
(T-005/T-006: chromium tti 110–169 ms, webkit 39–43 ms; FVC 96–162 ms);
legacy TTI on the same shape 518–1593 ms. The proposal leaves ≥80 ms headroom
over the worst measured progressive run.

Owner: FINAL 2026-11-02 — approved as proposed (interactive decision menu, "по рекомендациям").

## Decision 2 — Tail-mount completion budget (contract-deferred)

Proposed default (revised against the measured stress data — the original
6000 ms draft predated it): tail-mount completion within an absolute
ceiling of 2500 ms at 1 MB and 25000 ms at the stress shape; the 1.5x
same-run-legacy relative rule applies at the ordinary shape only.

Measured on the final tuned build (tail chunk 100 blocks, T-007 re-shot,
truth tokens true, 6/6 verdicts PASS): 1 MB tail_done 820 ms (webkit) /
1065 ms (chromium) — well inside 2500. Stress (1.7 MB / 19,073 blocks):
tail_done 12,643 ms (webkit) / 22,380 ms (chromium; the harness runs the
primary instance's tail concurrently — an isolated probe measured ~25 s at
the pre-tune chunk 50, ~12–15 s at 100) — inside the proposed 25,000 ms
ceiling. Tail completion is background work: input is ready at 121–146 ms
(TTI) and every contract budget (open 4000 ms, typing 250 ms, longest task
300 ms, scroll 50 ms) is met at the stress shape while the tail mounts.
The ceiling's purpose is anti-infinite-jank, not speed.

Owner: FINAL 2026-11-02 — approved as proposed (interactive decision menu, "по рекомендациям").

## Decision 3 — Budget-semantics mapping ratification (open → TTI)

On the progressive path the contract's "open within 1500/4000 ms" is
satisfied by time-to-input (the document is open when the editor is
usable), with first visible content and tail-mount completion reported as
separate phases, never summed. Rationale: the contract's "open" was
grounded in Stage 0's full-open measurement; remapping it is an owner
call. Measured progressive TTI (39–169 ms) sits far inside both open
budgets (1500/4000 ms), so the mapping changes which meter gates, not
whether the gates pass.

Owner: FINAL 2026-11-02 — approved as proposed (interactive decision menu, "по рекомендациям").

## Decision 4 — Ratification: hard budgets live in evidence, CI asserts emission + loose ceilings (R-6 narrowing)

CI suites assert numeric emission and loose non-flaky ceilings; the hard
contract budgets are gated by the baseline-artifact verdict and the
owner-run acceptance capture (anti-flake, Stage 0 precedent). Owner
ratifies this reading of R-6.

Owner: FINAL 2026-11-02 — approved as proposed (interactive decision menu, "по рекомендациям").

## Decision 5 — Recorded deviations: oversized-block one-unit mount and the restored-cursor legacy narrowing

(a) Oversized single blocks (>64 KB) mount as ONE unit — spec R-1's
"chunks its content" is narrowed. Evidence: giant-paragraph 50 ms,
giant-code-block 236 ms, nested-deep 29 ms first paint — all fine; but
giant-list 836 ms exceeds the 300 ms longest-task ceiling in spirit, and
the synthetic oversized-tail shape (one >64 KB block in the tail) measured
2688–2943 ms. Options: (i) accept the narrowing with the recorded numbers
(giant-list and synthetic tails are pathological shapes without their own
contract budget; ordinary/1MB/stress shapes are unaffected); (ii) schedule
content-chunking inside oversized blocks as a follow-up change (Wave B
candidate). Recommendation: (i) now, (ii) in the backlog with these
numbers as its justification.

(b) Opens that restore a remembered cursor/selection or block cache stay
LEGACY (progressiveMount cannot carry the parse-time cursor-DNA
injection). Consequence: files reopened at a remembered position do not
benefit from Wave A until a follow-up teaches progressiveMount cursor
restoration (asserted in T-006: such opens land mounted, served silently
legacy). Recommendation: record as a known narrowing; cursor-carrying
progressive open is the first Wave B candidate.

Owner: FINAL 2026-11-02 — approved as proposed (interactive decision menu, "по рекомендациям").

## Non-goals restated

No WAL, no unsaved-recovery claim, no default flip of the Experimental
toggle (default-off, session-latched until a separately approved change),
no release or train admission. The owner-run WKWebView instrumented
capture stays pending owner-side evidence per the acceptance protocol.

## After the decisions

Approved values and ratified readings land in the LargeDocumentContract in
.grace/context/ux-guidelines.xml (governance step of this change); Wave B
starts only after that landing and after the Wave A baseline re-shot on
the same corpus (T-007, recorded in the baseline artifacts).
