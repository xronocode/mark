# C-NATIVE-DOCX-RTF-EXPORT — archive record

- Implemented: merged as `15ceef40` (PR #52, 2026-10-26).
- Admitted to the 2.9.x-next train as `def74a68` (PR #78, 2026-10-26).
- Owner acceptance: 2026-10-26, merged on instruction after a three-rebase
  refresh with two green 17-check CI runs.

## Final gate before archival (2026-10-28, main @ `d14335e4`)

`grace lint --path . --change C-NATIVE-DOCX-RTF-EXPORT --assertions final --run-commands`

- 5/5 commands passed:
  - `npx vitest run tests/renderer/util/export-docx-shapes.test.js
    tests/renderer/util/export-docx.test.js
    tests/renderer/contextMenu/tabs-export.test.js` — passed.
  - `cargo check --manifest-path src-tauri/Cargo.toml` — passed.
  - `npm run build && node scripts/check-export-chunk.mjs` — passed.
  - `npx playwright test tests/e2e/export-office.spec.ts
    tests/e2e/print-export.spec.ts tests/e2e/export-html-images.spec.ts
    --project=chromium` — passed.
  - NOTICES-node freshness (`license-checker --production --json` piped through
    `tools/build-notices-node.mjs`, diffed against `NOTICES-node.md`) — passed.
- Gate correction recorded in plan.xml: the earlier command invoked
  `build-notices-node.mjs` with no stdin and could never pass; the documented
  `license-checker` pipe is now explicit.
- `grace lint --assertions final` — 0 errors.

## Intentionally not verified

Opening the produced `.docx` in Microsoft Word / Pages on a real build is
deferred to the train acceptance protocol (rule 5). Display `$$` math blocks
render as literal text — a known muya export-grammar input gap recorded in the
bundle backlog; inline math converts.
