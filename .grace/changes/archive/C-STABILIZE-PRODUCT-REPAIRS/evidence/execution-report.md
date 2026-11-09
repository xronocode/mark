# Product stabilization execution evidence

Base: integration commit `5ddb4139adeea2de4289230b03c59c7a700477de`. The approved spec/plan were imported unchanged; only terminal status changed after final command evidence. No commit, push, release identity, lockfile, publication or installed-app replacement is part of this wave.

## Attribution and accepted behavior

The six PR #193 product files use the final Aa text glyph, local button chrome and titlebar stacking. Pagewidth smoke hunks were transplanted relative to `4ba177fe`, preserving later main fixes. The ten locale tables changed only `editor.tableExport` and `tableToolbar.columnWallHint`. Release/What's New materials, diagnostics, old draft revisions and all split/security work were excluded.

Owner-approved supersession is recorded in the spec: no internal table scroll degradation; explicit Auto resets user-fixed widths; Fit/Full outer edges are pinned, Auto retains external walls; toolbar/chip labels become icon-only; Standard retains its entry; Expand precedes Copy; table-copy feedback names the table. Historical approvals remain unchanged in archives.

## Proven boundary repairs

Red-to-green regression cases cover obsolete/replaced/destroyed document adoption, generation cancellation, preserving a preexisting transform across repeated repaint/teardown, and fitting a manual drag below content minima. Browser measurements found an additional inner-content issue: the table box fit its frame while the ordinary 4em cell-content minimum leaked text beyond small columns. Fixed-width layouts now enable the scoped inner minimum override and character wrapping. Narrow header containment is asserted at 390px.

Auto uses an actual fitting plan when natural/manual content exceeds the frame; resetting Auto discards the user layout and may create a fresh automatic fitting colgroup. An assertion now compares reset geometry with the original automatic geometry instead of mistaking every colgroup for a user-fixed layout. Wide Auto/wall tests explicitly assert the accepted absence of scroll. Body-border reset targets the current border coordinates after the table recenters. Hover tests target a cell interior rather than a live border hit zone. Dynamic Full-gutter geometry polls the unchanged threshold at the existing timeout. No timeout or coverage threshold was raised, and no test case was deleted.

The explicit-Auto/global-Fit persistence boundary is completed by `C-STABILIZE-TABLE-AUTO-PERSISTENCE-CLOSEOUT`; the original companion remains preserved as superseded provenance. Parent projections record the companion semantics, while the parent approved plan remains unchanged.

## Fresh verification

1. Pre-write current and selected baseline lint: 0 errors, 5 warnings (known C-50 durable overlap under sequential execution plus four Python heuristic warnings).
2. UI/locale unit gate: 63 passed; table/toolbar gate: 196 passed; selected C-70 picture-export transport: 8 passed.
3. Companion sanitizer/store gate: 42 passed and selected target command execution returned 0 errors.
4. Fresh renderer build passed. The affected Chromium/WebKit matrix passed 106 executed tests, with the single pre-existing page-width prefs-shim fixme unchanged. Foreign preview reuse was disabled with CI=1; no dependency/browser install or full coverage run was used.
5. Fresh desktop/settings and 390px images were inspected in both engines. Aa and stable icon controls remain readable; squeezed headers wrap within their own cells, and all six columns remain present. The narrow capture is a desktop stress check, not a new mobile interface.
6. Parent outer final command execution passed all four leaf commands with 0 errors; the product implementation is applied and archived. Central commit/push safety and hosted CI remain mandatory before main integration.

## Lifecycle reconciliation

The related companion initially collided with this parent's pre-edit baseline during final lint. The coordinator authorized a finite closeout against the completed sanitizer, retaining the original companion assertions and target tests. Terminal artifacts are archived with `ReplacementChange`; the new baseline matches observed bytes. Parent final/archive completed before closeout final/archive; both returned 0 errors with their required commands. This reconciles lifecycle state without weakening product requirements or rerunning a design review.
