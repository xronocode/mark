// FILE: tests/renderer/util/export-plantuml-gate.test.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: C-EXPORT-BOUNDARIES T-002 pin — the pure PlantUML export
//            gate helpers on src/muya/lib/utils/exportHtml.js:
//            countPlantUMLFences (fence-state scan, exact-case
//            'plantuml' info strings) and plantUMLSourcePlaceholder (the
//            pinned declined shape: one pre.ag-plantuml-export-source
//            with the escapeHTML'd literal source, no plantuml.com URL,
//            no img element).
//   SCOPE: Pure helper behavior only — no DOM mount, no muya instance,
//          no render pass. The render-time gate itself (generate →
//          renderDiagram's plantuml branch) is exercised by the editor
//          wiring pins in tests/renderer/components/editor-export-images.test.js.
//   DEPENDS: Vitest + jsdom, muya/lib/utils/exportHtml (real module),
//            muya/lib/utils (escapeHTML/unescapeHTML for the round-trip).
//   LINKS: .grace/verification/runtime.xml V-M-012;
//          .grace/verification/features.xml V-M-065;
//          .grace/changes/active/C-EXPORT-BOUNDARIES.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   PLANTUML_DOC - a one-fence document used by the placeholder pins.
//   HOSTILE_SOURCE - diagram source carrying markup that must stay text.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   - 2026-11-21 v1.0.0 C-EXPORT-BOUNDARIES T-002: initial file —
//   red-first pins for the two pure gate helpers (they fail on pre-fix
//   code where neither export exists).
// END_CHANGE_SUMMARY

import { describe, expect, it } from 'vitest'
import { countPlantUMLFences, plantUMLSourcePlaceholder } from 'muya/lib/utils/exportHtml'
import { escapeHTML, unescapeHTML } from 'muya/lib/utils'

const PLANTUML_DOC = '@startuml\nAlice -> Bob: hello\n@enduml'
const HOSTILE_SOURCE = '@startuml\n<img src=x onerror="alert(1)">\n<script>alert(2)</script>\n@enduml'

// START_BLOCK_FENCE_COUNT_PINS
describe('countPlantUMLFences (C-EXPORT-BOUNDARIES)', () => {
  it('counts zero for documents without plantuml fences', () => {
    expect(countPlantUMLFences('')).toBe(0)
    expect(countPlantUMLFences(null)).toBe(0)
    expect(countPlantUMLFences(undefined)).toBe(0)
    expect(countPlantUMLFences('plain text, no fences at all')).toBe(0)
    expect(countPlantUMLFences('a `code span` and a [link](https://example.com)')).toBe(0)
  })

  it('counts exactly one ```plantuml fence', () => {
    const doc = ['Intro paragraph.', '', '```plantuml', PLANTUML_DOC, '```', '', 'Done.'].join('\n')
    expect(countPlantUMLFences(doc)).toBe(1)
  })

  it('counts several ```plantuml blocks exactly', () => {
    const doc = [
      '```plantuml',
      'A -> B',
      '```',
      '',
      'some prose',
      '',
      '```plantuml',
      'C -> D',
      '```',
      '',
      'more prose'
    ].join('\n')
    expect(countPlantUMLFences(doc)).toBe(2)
  })

  it('counts ~~~ fences too', () => {
    const doc = ['~~~plantuml', PLANTUML_DOC, '~~~'].join('\n')
    expect(countPlantUMLFences(doc)).toBe(1)
  })

  it('counts an unclosed trailing fence once, from its opening', () => {
    const doc = ['```plantuml', PLANTUML_DOC].join('\n')
    expect(countPlantUMLFences(doc)).toBe(1)
  })

  it('never counts mermaid, vega-lite, flowchart or sequence fences', () => {
    const doc = [
      '```mermaid',
      'graph TD; A-->B;',
      '```',
      '',
      '```vega-lite',
      '{}',
      '```',
      '',
      '```flowchart',
      'st=>start: Start',
      '```',
      '',
      '```sequence',
      'A->B: hi',
      '```'
    ].join('\n')
    expect(countPlantUMLFences(doc)).toBe(0)
  })

  it('never counts inline backticks or other languages around the word plantuml', () => {
    expect(countPlantUMLFences('inline `plantuml` code span')).toBe(0)
    expect(countPlantUMLFences('a paragraph mentioning ```plantuml inside inline code')).toBe(0)
    expect(countPlantUMLFences(['```js', 'plantuml', '```'].join('\n'))).toBe(0)
  })

  it('matches the fence tag exact-case', () => {
    expect(countPlantUMLFences(['```PlantUML', PLANTUML_DOC, '```'].join('\n'))).toBe(0)
    expect(countPlantUMLFences(['```PLANTUML', PLANTUML_DOC, '```'].join('\n'))).toBe(0)
    expect(countPlantUMLFences(['```plantuml extra', PLANTUML_DOC, '```'].join('\n'))).toBe(0)
  })

  it('tracks fence state: a ``` line inside a plantuml fence is content, not a new fence', () => {
    const doc = [
      '```plantuml',
      'note: a ``` triple inside the diagram text',
      '```',
      '',
      '```mermaid',
      'graph TD; A-->B;',
      '```'
    ].join('\n')
    expect(countPlantUMLFences(doc)).toBe(1)
  })
})
// END_BLOCK_FENCE_COUNT_PINS

// START_BLOCK_PLACEHOLDER_PINS
describe('plantUMLSourcePlaceholder (C-EXPORT-BOUNDARIES)', () => {
  it('returns exactly one pre.ag-plantuml-export-source element', () => {
    const html = plantUMLSourcePlaceholder(PLANTUML_DOC)
    const probe = document.createElement('div')
    probe.innerHTML = html
    expect(probe.querySelectorAll('pre.ag-plantuml-export-source')).toHaveLength(1)
    expect(probe.querySelectorAll('pre')).toHaveLength(1)
  })

  it('carries the literal source text after un-escaping (escapeHTML round-trip)', () => {
    const tricky = 'A & B < C > "D" \'E\''
    for (const source of [PLANTUML_DOC, tricky]) {
      const html = plantUMLSourcePlaceholder(source)
      // Escaped form in the string…
      expect(html).toContain(escapeHTML(source))
      // …and the literal text back out of the DOM.
      const probe = document.createElement('div')
      probe.innerHTML = html
      expect(probe.querySelector('pre.ag-plantuml-export-source').textContent).toBe(source)
      // unescapeHTML inverts the escaping exactly.
      expect(unescapeHTML(escapeHTML(source))).toBe(source)
    }
  })

  it('contains no plantuml.com substring and no img element', () => {
    const html = plantUMLSourcePlaceholder(PLANTUML_DOC)
    expect(html.toLowerCase()).not.toContain('plantuml.com')
    expect(html.toLowerCase()).not.toContain('<img')
    expect(html.toLowerCase()).not.toContain('data:image')
  })

  it('keeps hostile markup in the source as escaped text', () => {
    const html = plantUMLSourcePlaceholder(HOSTILE_SOURCE)
    expect(html).not.toContain('<img')
    expect(html).not.toContain('<script>')
    const probe = document.createElement('div')
    probe.innerHTML = html
    expect(probe.querySelector('pre.ag-plantuml-export-source').textContent).toBe(HOSTILE_SOURCE)
    // No live elements were created inside the placeholder.
    expect(probe.querySelectorAll('img, script')).toHaveLength(0)
  })

  it('handles empty and null source without throwing', () => {
    expect(plantUMLSourcePlaceholder('')).toBe('<pre class="ag-plantuml-export-source"></pre>')
    expect(plantUMLSourcePlaceholder(null)).toBe('<pre class="ag-plantuml-export-source"></pre>')
  })
})
// END_BLOCK_PLACEHOLDER_PINS
