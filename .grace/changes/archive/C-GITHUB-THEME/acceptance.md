# C-GITHUB-THEME — archive record

- Implemented: 2026-10-23; merged as `a685701a` (PR #66, 2026-10-25).
- Admitted to the 2.9.x-next train as `61ae6747` (PR #67, 2026-10-25).
- Owner acceptance: 2026-10-25, additive-only diff reviewed by the owner; no
  separate visual check. The CI-caught site-gallery and e2e count repairs
  (`eaf8890c`, `9485bae5`) landed before the fully green PR #66 run.

## Final gate before archival (2026-10-28, main @ `d14335e4`)

`grace lint --path . --change C-GITHUB-THEME --assertions final --run-commands`

- 3/3 commands passed (20 s total):
  - `npx vitest run tests/renderer/util/exportImages.test.js` — passed.
  - `npx playwright test tests/e2e/print-export.spec.ts
    tests/e2e/export-html-images.spec.ts --project=chromium` — 11 s, passed.
  - theme unit batch (theme-contrast, theme-families, theme, tabs-appearance,
    menu-consistency, commands/index, pele-node-contrast, release-materials) —
    passed.
- `grace lint --assertions final` — 0 errors; the only warnings are the
  repository-wide heuristic-confidence notes plus overlap warnings that this
  archival removes.

## Intentionally not verified

A hands-on theme check on a dispatch build was deferred to the train acceptance
protocol (rule 5); the owner explicitly accepted without it.
