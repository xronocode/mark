# Execution evidence — C-LARGE-DOC-STAGE-0 (T-012)

This file carries the T-012 final-gate evidence. It lives outside `plan.xml`
so the approved plan bytes stay pinned at their approval hashes
(`approval-2026-10-27.md`).

## Final gate on the approved bytes

Command (run 2026-10-27T04-10-09, log
`~/.cache/grace/run-commands/large-doc-stage0-1eddf593/runs/2026-10-27T04-10-09_C-LARGE-DOC-STAGE-0/`):

```
grace lint --path . --change C-LARGE-DOC-STAGE-0 --assertions final --run-commands
→ 7/7 commands passed, 0 errors, 5 warnings (all pre-existing)
```

The run's `meta.json` records this plan's five MustPassCommands at
`plan.xml#10`–`#14`:

1. `node tests/e2e/fixtures/large-doc/generators/regen.mjs --check` — 19
   committed fixtures byte-identical + 7 materialized sha256 pins.
2. `npx vitest run tests/renderer/perf` — 22 passed (microbenches, acceptance
   tooling, characterization gate).
3. `npx playwright test tests/e2e/perf --project=webkit-perf` — 50 passed
   (bench phases, 48 characterization tests, the legacy large-doc gate).
4. `npx playwright test tests/e2e/session-restore.spec.ts --project=webkit-session`
   — 7 s, green.
5. `git diff --exit-code 466d4c57..HEAD -- src/muya` — no diff.

Two more commands ran in the same invocation at `plan.xml#3`/`#4`: they are
`C-NATIVE-DOCX-RTF-EXPORT`'s baseline commands, which final mode schedules
because that unrelated bundle is approved and active. Both passed; **they are
not gates of this change**.

## Additional gates

| Check | Result |
|---|---|
| `grace lint --path . --assertions current` | 0 errors, 5 pre-existing warnings (C-50/C-GITHUB-THEME durable overlap + four python heuristics) |
| `grace lint --change C-LARGE-DOC-STAGE-0 --assertions target` | all 8 MustContain + `MustVerify` M-060/V-M-060 pass (the 5 `command-not-evaluated` entries appear only without `--run-commands`) |
| `npm test` (quiet machine) | 377 files / 5,076 passed, 2 skipped, 3 todo, 0 failed |
| `git diff --exit-code 466d4c57..HEAD -- editor.vue store/editor.js` | no diff |
| `git diff --name-only 466d4c57..HEAD` | 62 files (61 before this evidence file), all bench / fixtures / tests / docs / `.grace` / `playwright.config.ts` |
| Scoped privacy scan | `sh -c '! git grep -nE "[/]Users[/]|[~]/D…s" -- src/renderer/bench tests/renderer/perf tests/e2e/perf tests/e2e/fixtures/large-doc playwright.config.ts'` → exit 0 (no hits) |

A previous `npm test` run under heavy parallel load had 9 hook/test timeouts in
unrelated suites (`app-deep`, `table-column-resize`, `export-docx`, …); every
such file passes in isolation and the quiet full run is green. Recorded as
environment load, not a regression.

## Commits (this session, all through the docs/commit-push-safety.md gate)

- `386c3f2d` — governance re-approval (spec/plan/review/approval)
- `489d9113` — T-010 M-060/V-M-060 routing
- `f519f757` — T-002 follow-up (math fixture, counts, map sync)
- `cbec1f61` — T-009 baseline artifacts + self-contained driver
- `3f1830be` — T-005 follow-up (tiers, typed landing, gates)
- `c2cb08bd` — T-006 save/close/session oracles (17)
- `2fc7f36f` — T-007 metadata/external/byte-policy oracles (20)
- `c06a3662` — T-008 IME/seeded oracles (11)
- `31692e80` — T-011 owner decision gate
- this commit — T-012 execution evidence

Earlier in the branch: `f91378df` plan, `b9a3cb17` archive
C-FILE-POSITION-MEMORY, `d86d6cff` plan sequencing, `b270f118`/`cb0e2ba8`/
`f1fa2f16` corpus waves, `f7c37f3e` T-003, `06230ff0` T-004, `1c08c6b5`
T-005, `29aae406` review corrections.

## Evidence index

- T-001..T-011: `plan.xml` Evidence items (including the original pre-change
  baseline literals, the honest legacy-gate FAIL, and the reconciliation
  record).
- T-009 artifacts: `src/renderer/bench/baseline/large-doc/baseline.json` +
  `baseline.md` (3 fixtures, commit `29aae406`, run conditions, overhead and
  heap labels).
- T-011: `.grace/.../owner-decision.md` (5 decision sections, owner lines
  blank, landing/ no-WAL / no-release statements).
- Approval: `.grace/.../approval-2026-10-27.md` (two findings passes, two
  clean passes, pinned hashes, residual risk).

## Open / pending (not claimed as done)

- **Real-app WKWebView tier (required by R-5): pending.** No `Mark.app` was
  built and no capture exists; the protocol, fixture identity and capture
  verifier are delivered and tested, and the pass criterion (numeric required
  phases + `typed_landed: true`) is enforced by the verifier. The owner runs
  the capture; until then Stage 0 is not fully evidenced.
- Stage 0 budgets/target size: owner decisions, lines blank in
  `owner-decision.md`.
- The built-in-fixture legacy Phase-B1 gate reports 3.16–3.39× on this machine
  and exits FAIL; recorded, not tuned. It is not a gate of this change.
- This branch must not be pushed as-is: `466d4c57` still contains a
  since-redacted owner-local path in its tree. A push needs a clean history
  (the rewritten clean branch) or an owner-approved rewrite, plus a re-run of
  the privacy scan.
- No release, tag, train admission, Wave A/B work or production behavior
  change follows from this evidence.

## Final pre-merge review dispositions (2026-10-29, final four-corner cycle)

Two independent reviewers walked all four corners on HEAD a32859a0; every
corner passed with three minor, non-blocking findings, dispositioned here:

1. **Time-to-input (spec R-4 letter).** The harness emits no time-to-input
   value and carries no harness-local not-applicable label; the deferral is
   recorded in owner-decision.md (Decision 2), plan.xml T-011 evidence and
   .grace/context/ux-guidelines.xml, and the tier-3 capture grammar covers
   it where genuinely measurable. Disposition: accept the recorded deferral
   as-is; no amendment to the approved spec bytes.
2. **Durable-contract write scope.** The ux-guidelines.xml LargeDocumentContract
   write (a32859a0) is not declared in the approved plan's
   ObservedWriteScope. It is sanctioned by spec R-9/AffectedAreas (the named
   landing place) and was executed only after the owner's FINAL 2026-10-29
   decisions. Disposition: this note is the scope addendum; the pinned plan
   bytes stay untouched.
3. **Gate freshness.** The recorded 2026-10-27 final gate predated later
   commits. Disposition: fresh `grace lint --change C-LARGE-DOC-STAGE-0
   --assertions final --run-commands` re-run on final HEAD a32859a0 —
   **7/7 commands passed (1m 53s)**, including a live webkit-perf execution
   of tests/e2e/perf.

