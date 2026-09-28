// FILE: tests/renderer/muya/htmlTagBr.test.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Verify the inline <br> renderer hides raw tag text on inactive lines while keeping the real line break.
//   SCOPE: Unit tests for muya's htmlTag renderInlines 'br' branch (C-15 Phase W QA — literal <br> visible in the editor).
//   DEPENDS: muya/lib/parser/render/renderInlines/htmlTag, muya/lib/config CLASS_OR_ID, Vitest.
//   LINKS: .grace/changes/active/C-15 Phase W QA (Nurik: «зачем в mmd файле показывать <br>»); M-011 editor surface.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   makeCtx - Renderer `this` mock with a controllable getClassName.
//   brToken - Minimal html_tag token for a self-closing <br>.
//   h - Snabbdom h() stand-in returning {sel, data, children} tuples.
// END_MODULE_MAP

import htmlTag from 'muya/lib/parser/render/renderInlines/htmlTag'
import { CLASS_OR_ID } from 'muya/lib/config'

const h = (sel, data, children) => ({ sel, data, children })

const makeCtx = (hide) => ({
  getClassName: () => (hide ? CLASS_OR_ID.AG_HIDE : CLASS_OR_ID.AG_GRAY),
  highlight: () => ['<br>']
})

const brToken = {
  type: 'html_tag',
  raw: '<br>',
  tag: 'br',
  openTag: '<br>',
  closeTag: '',
  children: undefined,
  attrs: {},
  range: { start: 0, end: 4 }
}

describe('htmlTag renderInlines — <br> branch (C-15 Phase W QA)', () => {
  it('hides the raw <br> text when the line is inactive', () => {
    const out = htmlTag.call(makeCtx(true), h, null, {}, brToken, undefined)
    expect(Array.isArray(out)).toBe(true)
    const [rawSpan, realBr] = out
    expect(rawSpan.sel).toContain(CLASS_OR_ID.AG_HIDE)
    expect(rawSpan.sel).toContain(CLASS_OR_ID.AG_OUTPUT_REMOVE)
    // the real element survives OUTSIDE the hidden span
    expect(realBr.sel).toBe('br')
  })

  it('keeps the raw <br> text visible (gray) when the line is active', () => {
    const out = htmlTag.call(makeCtx(false), h, null, {}, brToken, undefined)
    const [rawSpan, realBr] = out
    expect(rawSpan.sel).toContain(CLASS_OR_ID.AG_HTML_TAG)
    expect(rawSpan.sel).not.toContain(CLASS_OR_ID.AG_HIDE)
    expect(realBr.sel).toBe('br')
  })

  it('always renders exactly one real <br> element as a sibling', () => {
    for (const hide of [true, false]) {
      const out = htmlTag.call(makeCtx(hide), h, null, {}, brToken, undefined)
      expect(out.filter((n) => n.sel === 'br')).toHaveLength(1)
    }
  })
})
