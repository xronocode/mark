# C-TITLEBAR-MODE-CHIPS — acceptance evidence (in progress)

Contract: plan.xml T-009. Every line below names the exact command and its
result; paths are repo-relative and no owner-local absolute path is stored.

## Unit / i18n

- `npx vitest run tests/renderer/components/titleBar-deep.test.js tests/renderer/components/titleBar-mode-chips.test.js tests/renderer/components/chrome-icons.test.js tests/renderer/i18n/`
  → 8 files, 128 tests passed (2026-10-27).
- chrome-icons: 14 tests, including the six `mode-*` descriptors, 16-grid
  bounds and six distinct drawings.
- locale parity: 4 tests — 15 families × 10 locales, min twins byte-identical
  to `JSON.stringify(parse(source))`.
- Full-suite baseline on the shared tree: 5139 tests, 5124 passed, 10 failed,
  2 pending, 3 todo. None of the failures is in this change's files: five are
  mount timeouts under full-suite load (app, app-deep, app-fn, editorWithTabs,
  outline-rail), one is the installed-pele version (1.6.0 vs the 1.10.0 pin),
  one is `publication-privacy` (a retired showcase screenshot is tracked at
  HEAD), and the rest are the same load class. Re-recorded at gate time on the
  clean candidate; the two excused suites are app-deep and app-fn.

## E2E — the official gate

- Port 4173 was held by a leftover preview from a sibling worktree; the owner
  authorised stopping that process on 2026-10-27, and the gate then ran on the
  real port.
- `npm run build` → `src/renderer/dist/index.html` sha256
  `443eea8b8a20b9b93ddd204a079d772147b0a4cd25db5707d5ff886a0577b206` (final runtime code, after the menu CSS fix).
- `CI=1 npx playwright test --project=chromium --project=webkit-titlebar`
  → **408 passed, 7 skipped (all pre-existing conditional skips), 0 failed,
  10.0 min** (2026-10-27), re-run after the menu CSS fix so the evidence matches
  the final runtime code. The run includes all nine chips cases in chromium and
  in webkit-titlebar, the upgraded view-modes spec in both projects, and the
  full chromium project.
- Control experiment for the shim repair: with
  `__TAURI_EVENT_PLUGIN_INTERNALS__` removed from `tauri-shim.ts`, the teardown
  row (closing the last tab) fails with exactly two pageerrors "Cannot read
  properties of undefined (reading 'unregisterListener')"; with the repair it
  passes. The regression row has teeth.

## Visual pass finding (2026-10-27)

The generated smoke crop caught a real defect the tests could not: the switch
menu had no layout styles and rendered its rows inline and overlapping. Fixed
in modeChips.vue (panel, groups, row flex, hint block, shortcuts, footer rule);
the screenshots were regenerated and now show the two-group panel with the
visible-winner checkmarks, shortcuts, hint lines and the Reset footer. The
official gate was re-run after that fix; its numbers replace the pre-fix run
below when they land.

## Commits

- c65c534a (rebased from 2c740ee9) — chips, glyphs, locales, shim, e2e specs.
- 358fd9ec (rebased from b937f4b6) — T-008 graph/verification routing.
- bf6e008 — owner amendment: Standard is the full reset, Reset row removed.
- 35fa3a39 — the chips unit suite's load-proof mount budget.
- ef1b2d81 — the C-COMMONMARK-EMPHASIS commit this change sits on.

## Machine gate — passed (2026-10-27, isolated worktree on main)

- `grace lint --path . --change C-TITLEBAR-MODE-CHIPS --assertions target
  --run-commands` → **2/2 commands passed (total 10 min 52 s)**.
  - unit/i18n batch → ✔ 6 s.
  - `npm run build && CI=1 npx playwright test --project=chromium
    --project=webkit-titlebar` → ✔ 10 min 45 s, built
    `src/renderer/dist/index.html` sha256
    `443eea8b8a20b9b93ddd204a079d772147b0a4cd25db5707d5ff886a0577b206`.
- Full suite in the same worktree, `npx vitest run` with the JSON report →
  **5150 total, 5143 passed, 2 failed, 2 pending, 3 todo**. Both failures are
  outside this change: `tests/renderer/release-readiness.test.js`
  "release-train bookkeeping drift" (missingItems 2 and 3) — the release
  train ledger line, not the titlebar.
- `grace lint --assertions current` → **1 error, 11 warnings**, the error being
  `markup.module-map-mismatch` in `tools/release-readiness.mjs` from the site
  line of work; every path this change writes is clean (0 errors), and the
  foreign error is recorded here rather than fixed (no side fixes).

## Commit gate note

The amendment commit `bf6e008` used the owner's explicit
`MARK_SAFETY_OVERRIDE` after the model lanes spent more than an hour on the
1.34 MB locale-heavy staged set (224 chunks × 2 local + 1 non-local pass); the
deterministic exposure checks and Gitleaks still ran for the exact candidate.
The follow-up `35fa3a39` took the normal gate and passed. The override reason
and receipt are stored in the private safety directory.

## Owner amendment (2026-10-27, after the first visual pass)

The owner judged the Reset footer redundant with Standard and directed that
Standard absorb it: the Standard row now returns the view to Standard AND
turns both writing modes off; the Reset row and its `resetAll` / `hintReset`
keys are removed, so the namespace carries fifteen families (R-4's original
inventory) instead of seventeen. Code, tests, ten locales, min twins and the
plan corners were updated; spec R-3/R-4 are superseded on this point by the
owner decision. The gate below was re-run after the change.

## Owner verdict

ACCEPTED by the owner on 2026-10-27, after the amendment: the Reset footer was
removed and Standard became the full reset (view plus both writing modes). The
bundle is archived as applied with this record.

## Still to run at acceptance
- T-008 is applied on the main tree on top of the C-COMMONMARK commit
  (cea74309): M-062 `TitlebarModeChips`, V-M-062 (two commands, three
  scenarios, content-free markers), the M-011 cluster-order delta, the M-057
  six-glyph delta and both index routes. `grace lint --assertions target`
  reports only the expected `command-not-evaluated` pair without
  `--run-commands`, and `--assertions current` is clean (0 errors).
