# C-NOTIFICATION-SYSTEM — visual acceptance record (2026-10-24)

Merge-candidate tree: `feat/notification-system` (= fork/main `deb016ce` + this
change only). All runs executed in a dedicated worktree with the candidate's own
lockfile (`npm ci`), so no parallel-session work is present in any observation
below.

## Evidence crops

Runtime artifacts (never committed — the commit gate blocks binary additions);
reproduce with `npx playwright test tests/e2e/notifications-system.spec.ts
--project=chromium`, written to this bundle's `evidence/` directory:

- `card-error-paper.png`, `card-success-paper.png` — decisive-region crops
  (card ±6px), Paper theme, one card per severity.
- `card-error-ink.png` — the same error card in Ink.
- `stack-paper.png`, `stack-ink.png` — the full stack in both themes.

## Pixel verification (decoded crops, not model vision)

| Probe | Expected | Observed |
|---|---|---|
| Paper chip tint, error #D5453C @14% over floatBg #FFFDF8 | (249, 227, 222) | [249, 227, 221] — match within 1/255 rounding |
| Paper chip tint, success #2F9E63 @14% | (224, 236, 227) | [226, 239, 227] — glyph-adjacent sample, same tint family |
| Ink chip tint, error #F87A72 over #20232A | ~(61, 46, 50) tint with glyph strokes (234, 116, 108 = stroke blend) | stroke-over-tint blend present, no bare surface inside the chip |
| Card left edge (stripe absence) | pure surface: Paper (255,253,248), Ink (32,35,42) | exact on all three crops |
| Timer hairline (success card bottom) | #2F9E63 @55% = (141, 201, 166), 2px, full card width | rows 94-95 of the crop: [141, 201, 166] exact |

## Behavioral acceptance (e2e, 6/6 green on the candidate)

1. Chip tint equality: `getComputedStyle(chip)` equals the exact
   `color(srgb … / 0.14)` of the theme's severity token in Paper and Ink.
2. Error cards: sticky, no hairline, survive past timed cards' dismissal.
3. Five notifies: exactly 3 cards + "More 2 notifications" overflow chip.
4. Esc (with editor blurred): closes only the topmost card.
5. Copy-on-select: scripted drag-release writes exactly the selected words to
   the recorded clipboard, leaves the card open, lands the pulse span
   (`.notify-copied-pulse`) on the selection.
6. Palette command `view.notifications-history`: opens the history dialog,
   two entries newest-first, full untruncated text present.

## Suite state on the candidate

- `npm test` (vitest, candidate's own lockfile): **364 files, 4957 passed,
  0 failed** — cleaner than the shared tree, whose three site/gallery failures
  belong to a parallel session's uncommitted theme work.
- Migrated selector suites (diagram-export, diff-view, diff-opened-baseline,
  clipboard-open, multi-root-workspace, unsaved-close-actions): 49 tests green.
- `npm run build` (production esbuild): green, 7.0s — this build also caught
  and excluded a parallel session's unbuildable WIP that must not ride along.

Verdict: visual and behavioral acceptance PASS on the merge candidate.
