# C-FILE-POSITION-MEMORY — archive record

- Implemented: merged as `ac60bc02` (PR #68, 2026-10-26).
- Admitted to the 2.9.x-next train as `d64c1fa7` (PR #79, 2026-10-26).
- Owner acceptance: 2026-10-26, merged on instruction after a six-round CI with
  a fully green final round (20 checks including full e2e and x3-OS units).

## Final gate before archival (2026-10-28, main @ `d14335e4`)

`grace lint --path . --change C-FILE-POSITION-MEMORY --assertions final --run-commands`

- 4/4 commands passed (51 s total):
  - `npx vitest run tests/renderer/util/exportImages.test.js` — passed.
  - `npx playwright test tests/e2e/print-export.spec.ts
    tests/e2e/export-html-images.spec.ts --project=chromium` — passed.
  - `npx vitest run tests/renderer/util/file-position-store.test.js
    tests/renderer/store/editor-position-memory.test.js` — passed.
  - `npx playwright test tests/e2e/position-memory.spec.ts --project=chromium`
    — passed.
- `grace lint --assertions final` — 0 errors.

## Evidence retained

`acceptance-evidence.md` carries the post-recovery acceptance transcripts and
the visual before/after verification of the close+reopen and arrow-moved-caret
scenarios. The three evidence PNGs referenced there are committed beside it;
they were previously untracked because binary admission needed a multimodal
review, which the 2026-10-24 session performed on the rendered crops.

## Intentionally not verified

The owner's hands-on check of positions on a real build (restart with several
tabs, rename, relaunch) is deferred to the train acceptance protocol (rule 5).
