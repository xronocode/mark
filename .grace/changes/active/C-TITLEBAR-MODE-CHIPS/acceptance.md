# C-TITLEBAR-MODE-CHIPS — acceptance evidence (in progress)

Contract: plan.xml T-009. Every line below names the exact command and its
result; paths are repo-relative and no owner-local absolute path is stored.

## Unit / i18n

- `npx vitest run tests/renderer/components/titleBar-deep.test.js tests/renderer/components/titleBar-mode-chips.test.js tests/renderer/components/chrome-icons.test.js tests/renderer/i18n/`
  → 8 files, 128 tests passed (2026-10-27).
- chrome-icons: 14 tests, including the six `mode-*` descriptors, 16-grid
  bounds and six distinct drawings.
- locale parity: 4 tests — 17 families × 10 locales, min twins byte-identical
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
  `d4e44cae7d53659b280330bf578dfbca23217fab6f14fa180d1a8fb97bbedcf0` (final runtime code, after the menu CSS fix).
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

- 2c740ee9 — the chips, glyphs, locales, shim and e2e specs (this change).
- 3xxxxxxx — T-008 graph/verification routing (this change).
- cea74309 — the C-COMMONMARK-EMPHASIS commit this change's graph edits sit on
  (landed first so the graph/verification files were attributable).

## Still to run at acceptance

- `npx vitest run` on the exact candidate with the JSON report (skip/executed
  counts); known out-of-scope exclusions recorded above.
- `grace lint --path . --change C-TITLEBAR-MODE-CHIPS --assertions target
  --run-commands` with its exit code on the candidate.
- T-008 is applied on the main tree on top of the C-COMMONMARK commit
  (cea74309): M-062 `TitlebarModeChips`, V-M-062 (two commands, three
  scenarios, content-free markers), the M-011 cluster-order delta, the M-057
  six-glyph delta and both index routes. `grace lint --assertions target`
  reports only the expected `command-not-evaluated` pair without
  `--run-commands`, and `--assertions current` is clean (0 errors).
- Owner visual pass: screenshots under `.artifacts/ctb-smoke/`, with the owner
  verdict and the built dist digest above.
