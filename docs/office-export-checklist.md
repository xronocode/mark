# Office export (Word) — manual fidelity checklist

Change: `C-NATIVE-DOCX-RTF-EXPORT` (M-066). This checklist is the manual
acceptance instrument required by the spec (R-8). Fixtures live in
the owner-local DOCX bake-off visual-acceptance directory (outside this repository)
(exported through the real pipeline: muya renderHtml → M-065 embed →
M-066 pre-pass → lazy docx/html conversion).

## Fixtures

- `acceptance-portrait.docx` — EN+RU+CJK document: headings H1/H2, emphasis
  cluster, hyperlink, hard break, task list, blockquote, 3-column table with
  alignment, js code block, two inline equations, ordered list, two RU
  footnotes (one with bold). A4 portrait, margins 20/15/20/15 mm.
- `acceptance-landscape.docx` — same document, A4 landscape.

## Per-construct verdicts

Renderer legend: **QL** = macOS QuickLook thumbnail (qlmanage, the engine
behind Finder/TextEdit previews), **XML** = unzipped OOXML assertions
(`tests/renderer/util/export-docx.test.js`), **Word/Pages** = human pass.

| Construct | XML | QuickLook (visual, 2026-10-24) | Word / Pages |
|---|---|---|---|
| Headings → Heading 1-6 named styles | ✓ pStyle Heading1/2 | ✓ blue heading styles render | owner pass |
| Bold / italic / strikethrough / inline code | ✓ | ✓ all four visible | owner pass |
| Hyperlink (rels-backed) | ✓ rels entry | ✓ underlined blue | owner pass |
| Cyrillic + CJK through the path | ✓ | ✓ intact, no mojibake | owner pass |
| Hard line break | ✓ w:br | ✓ two lines, one paragraph | owner pass |
| Task checkboxes (native w14, state) | ✓ 2 controls, 1 checked | QL renders list bullets (w14 content controls are Word-first; QL does not draw them) | **Word: expected to show checkbox controls — confirm** |
| Table + per-column alignment | ✓ single w:tbl, jc center/right | ✓ borders, bold header, centered cells | owner pass |
| Code block (monospace) | ✓ | ✓ monospace, language class | owner pass |
| Blockquote | ✓ | ✓ indented paragraph (docx/html maps blockquote to indentation; no color bar by design) | owner pass |
| Inline math → native OMML (m:oMath with m:f) | ✓ real fraction content | QL does not render OMML equations (XML-proven; Word-first) | **Word: expected editable equations — confirm** |
| Display math (`$$` blocks) | input gap | literal `$$…$$` text — muya export grammar gap (backlog item; HTML export shares it), NOT a converter defect | n/a until the muya fix |
| Footnotes (real footnotes.xml, RU text, bold) | ✓ ids resolve, bold run present | QL shows no footnote pane (Word-first) | **Word: expected footnote markers + pane — confirm** |
| Front matter | ✓ absent (pre-pass strip) | ✓ absent | owner pass |
| Ordered list numbering | ✓ numPr; math paragraphs un-numbered | ✓ 1. / 2. | owner pass |
| Page geometry (sectPr from print options) | ✓ pgSz 11906×16838, pgMar 1134/850; landscape swaps via library | ✓ portrait 998×1400 px vs landscape 1400×984 px thumbnails | owner pass |

## Timing (dev machine, 2026-10-24)

- Acceptance fixture conversion (render→pre-pass→convert): **83 ms**
  (pipeline-internal; the muya render and the M-065 pass are shared with the
  HTML export).
- Stress: see `npm test` timing notes in V-M-066; budget is 3 s per export
  click on the 100 KB stress fixture — measured well inside budget at this
  fixture size; re-measure if the CJK-heavy real-world sample (~330 math
  spans) is added to the automated matrix when the muya display-math fix
  lands.

## Known degradations (recorded, not silent)

1. `$$` display blocks export as literal text until the muya export-grammar
   fix (backlog: "muya export HTML renders $$ display math as literal
   text"); inline `$…$` converts to native equations today.
2. QuickLook cannot render w14 checkbox controls, OMML equations or footnote
   panes — those verdicts are XML-proven and Word-first by nature.
3. Prism token colors inside code blocks degrade to plain monospace (the
   checklist records this as accepted for v1).

## Owner pass (pending)

Open both fixtures in Word and Pages; confirm the three Word-first rows
(checkboxes, equations, footnotes) and sign the acceptance per the delivery
protocol. Files:
the owner-local DOCX bake-off visual-acceptance `*.docx` files.
