# C-COMMONMARK-EMPHASIS — archive record

- Implemented: merged as `a64f718a` (PR #87, 2026-10-27); owner-merged after a
  green merge candidate.
- Owner instruction for execution: 2026-10-27 chat approval recorded in the
  spec (R-8) and plan header.
- Bundle archived as applied; release-train admission is a separate record.

## Final gate before archival (2026-10-28, main @ `d14335e4`)

`grace lint --path . --change C-COMMONMARK-EMPHASIS --assertions final --run-commands`

- 4/4 commands passed (37 s total):
  - `npx vitest run tests/renderer/util/exportImages.test.js` — passed.
  - `npx playwright test tests/e2e/print-export.spec.ts
    tests/e2e/export-html-images.spec.ts --project=chromium` — passed.
  - `npx vitest run tests/renderer/muya/emphasis-pairing.test.js
    tests/renderer/muya/inline-token-parity.test.js
    tests/renderer/muya/lexer-token-parity.test.js` — passed.
  - `npx vitest run tests/renderer/muya` — passed.
- `grace lint --assertions final` — 0 errors.

## Evidence retained

The plan's Pass-2 review records the shipped evidence: emphasis-pairing 9/9,
muya 51 files / 643 tests green, C-24 inline goldens recaptured through the
documented UPDATE flow (diff limited to the three new STRESS entries), C-30
lexer goldens byte-unchanged, and the reported paragraph rendering identically
to GitHub in the viewer and export paths. PR #87 carries the same numbers.

## Intentionally not verified

Full CommonMark compliance of emphasis is out of scope; the known deviations
(link-text delimiters across bracket boundaries, marked's code-span precedence,
cmark's exact mod-3 corners) are pinned in the suite as recorded behavior, not
chased. Release-train acceptance is separate and does not follow from this
archive.
