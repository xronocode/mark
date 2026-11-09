# C-RENDER-REVIEW-FIXES — execution report, 2026-11-09

## Context

T-001..T-007 were executed on 2026-11-03 in a dedicated execution worktree
(branch `fix/render-review-fixes`) and never landed: the branch sat 4 commits
ahead of main while main moved on (#183, #184, #188, #189). T-008 (closing
sweep) had not run. This session found the branch, rebased it, and executed
T-008 against the landed baseline.

## Rebase (T-008 prerequisite)

- Base: main @ 9b054d4d (#189). Backup of the pre-rebase branch:
  `backup/rrf-20261109`.
- Conflicts resolved:
  - all 10 `static/locales/*.json` — union merge at the JSON level (kept main's
    #183/#188 keys and this change's 7 new keys); all files re-validated as
    JSON; the i18n locale gate green in the suite.
  - `src/renderer/src/store/editor.js` LINKS header — union of main's
    `util/pageWidthStore.js (C-PAGE-WIDTH-TABLES …)` reference and this
    change's `C-RENDER-REVIEW-FIXES` reference.
- Rebased commits: 4 (T-001/T-002 … T-007), hashes 67280aaf, c8aa029d,
  cec65972, 926f7917.

## T-008 gate results (all on the rebased branch)

| Gate | Result |
| --- | --- |
| Baseline truth | All BaselineAssertions pins still held on main before the rebase (fingerprint-grep verified 2026-11-09) |
| Target pins | 18/18 TargetAssertions pins present after rebase; `title: 'Rollback failed'` absent from autoUpdates.js |
| Locale completeness | 7/7 new keys non-empty in each of the 10 locale files (scripted check); `tests/renderer/i18n` green inside the suite |
| Rust (T-001 gate) | `cargo test --bin mark m068` green; `cargo test --bin mark m001_validate` green (7 passed, fixture-parity drift tests included) |
| Whole suite | `npm test`: 390 files, **5282 passed | 2 skipped | 3 todo**; green in three independent runs (145–206 s) |
| e2e (acceptance tier) | `npx playwright test tests/e2e/notifications-system.spec.ts` — **6/6 passed (11.3 s)** after `npm run build` in the worktree |
| grace lint | `grace lint --change C-RENDER-REVIEW-FIXES --assertions final --run-commands --commandTimeout=950` — exit 0, 1/1 commands passed (2m07s, 5282 tests inside) |
| Scope discipline | `git diff main..HEAD` touches no F-UPDATER-ROLLBACK-INTEGRITY site; the main.rs diff is the single `mt_rollback_restore_outcome` handler line |

### Notes

- The first e2e run failed 6/6 with a boot timeout: the execution worktree had no
  `dist/`, and `vite preview` (the playwright webServer) serves an existing
  build without compiling — the app never loaded. The main checkout passed the
  same spec against its own stale dist, which localized the cause to the
  environment, not the change. After `npm run build` in that worktree the spec
  passed 6/6. Bisect against intermediate commits confirmed no regression.
- One `grace lint --run-commands` attempt failed inside its npm-test run with
  17 transient import/setup failures across 13 files (worker-spawn flake under
  load); two direct suite runs and the lint re-run (verbose) were fully green.
- Pre-existing lint errors, reproduced on main and out of scope for this
  change: `xml.missing-file … C-NOTIFICATION-SYSTEM/spec.xml`;
  `markup.module-map-mismatch … sideBar/tree-treefiles.test.js`.

## Additional chore (owner-approved in the launch plan)

`C-STATS-READOUT` and `C-STATS-DASH-PUSH` archived as applied — implemented
and merged via PR #182 (3f7d45aa) and PR #184 (8c9a6c2e); moved
active → archive with `status="applied"` per the #189 pattern.

## Safety-gate conditions during this run

Commits pass through the repository safety gate (local-first review,
reviewer `qwen3:4b`, exclusive-slot proof). During this session the local slot
was in active intermittent use by `qwen3.5:9b` (an unidentified local
consumer); one eviction of that model occurred at ~12:04 during an ownership
attempt — it auto-reloads on the consumer's next call. The offload reviewer
(configured in reviewers.json) was unreachable: the offload host was up on the
tailnet but its Ollama port did not answer (connection timeout).
