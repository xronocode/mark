// FILE: tests/renderer/muya/block-expand-button.test.js
// VERSION: 1.8.0
// START_MODULE_CONTRACT
//   PURPOSE: Pin the C-51 T-006/T-010 expand button — vnode placement, marker class and localized a11y attrs on the figures that keep it since C-56 T-005 (flowchart, sequence, plantuml diagrams; mermaid/vega-lite render the corner pill and TABLES render the C-65 table toolbar instead — see block-toolbar.test.js / table-cue.test.js), the drawn M-057 glyph (byte-identical to the canonical chromeIcons descriptor), click routing to the muya-block-viewer event, the keyboard guard that leaves Tab/Enter/arrows AND keyups to the focused button (the keyup selection repair used to steal the focus into the editing host), the copy-icon CSS literals (20 px, 8 px insets, 0/0.5/1 opacity curve, need-gated display, the 44 px strip removed), and the button never reaching export HTML.
//   SCOPE: START_BLOCK_EXPAND_BUTTON (renderContainerBlock.js + renderExpandButton.js), START_BLOCK_EXPAND_BUTTON_CLICK (clickEvent.js), START_BLOCK_KEYBOARD_EXPAND_BUTTON (keyboard.js, keydown + keyup), the C-51 T-006/T-010 CSS section of lib/assets/styles/index.css, and ExportHtml.renderHtml. The need RULES live in expand-need.test.js; the C-56 T-005 pill lives in block-toolbar.test.js; the C-65 table toolbar lives in table-cue.test.js.
//   DEPENDS: StateRender (muya/lib/parser/render/index.js) with a mocked renderer loader, ClickEvent and Keyboard with a real-DOM event-center double, the muya selection singleton (spied for the keyup guard), muya snabbdom h, @/components/icons/chromeIcons (the glyph twin), ExportHtml with a pele double, node:fs for the CSS read; Vitest + jsdom.
//   LINKS: .grace/changes/archive/C-51 T-006 and T-010; .grace/changes/archive/C-56 T-005 (scope narrowed to the non-pill roles); .grace/changes/archive/C-65 T-002 (tables moved to the table toolbar); .grace/verification/runtime.xml V-M-012 scenario-60; tests/e2e/block-viewer.spec.ts for the laid-out behaviour.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   TRANSLATIONS - en strings injected as the render/click t function.
//   rendererDoubles - per-name loader results (pele swapped in for the export case).
//   makeDiagramBlocks - figure→pre→code→line-span block tree for a diagram functionType.
//   makeTableBlocks - table block tree whose renderer adds a noneditable caption inside the scroll wrapper.
//   createStateRender - real StateRender with a fake muya and a stubbed renderLeafBlock.
//   findVnode - depth-first vnode search by predicate.
//   findExpandButtonVnode - the button.ag-block-expand child of a figure vnode, plus its index.
//   createClickHarness - container + addEventListener-backed eventCenter double + ClickEvent instance.
//   createKeyboardHarness - container + addEventListener-backed eventCenter double + Keyboard instance + listener cleanup.
//   StateRender - test fixture / helper.
//   cleanups - test fixture / helper.
//   keydown - test fixture / helper.
//   keyup - test fixture / helper.
//   t - test fixture / helper.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.8.0 - 2026-10-20 C-TABLE-FOOTER: disabled table surfaces retain the caption inside the scroll block.
//   v1.7.0 - 2026-10-19 C-70: the table toolbar carries three buttons (toggle, Copy as image, Open full screen).
//   PREV: v1.6.0 - 2026-10-18 C-65 T-002: tables left the standalone
//   glyph's scope — the table figure case now pins that tables carry the
//   C-65 table toolbar (whose expand button keeps the family class and the
//   ag-has-expand need marker) instead of a direct button.ag-block-expand
//   child, and the dead table placement CSS rule is asserted gone (its
//   placement lives in the C-65 table-toolbar rule, pinned in
//   table-cue.test.js). The click/keyboard/glyph/export cases are
//   unchanged (the standalone button and its rules remain for the
//   flowchart/sequence/plantuml roles).
//   v1.5.0 - 2026-10-18 C-56 T-005: the render cases split —
//   flowchart/sequence/plantuml figures and tables keep the standalone
//   button.ag-block-expand, while mermaid/vega-lite figures carry the
//   corner pill instead (no direct expand child, no pencil — their
//   coverage is block-toolbar.test.js); the glyph/label cases moved to a
//   flowchart fixture; the export case also pins no ag-block-toolbar
//   markup. The click/keyboard/CSS cases are unchanged (the standalone
//   button and its rules remain for the non-pill roles).
//   v1.4.0 - 2026-10-16 C-51 T-010: keyup guard cases — a
//   keyup targeted at the focused expand button must not run muya's
//   selection machinery (getCursorRange's needFix repair calls
//   setCursorRange → Selection.addRange inside the contenteditable, and
//   Chromium/WebKit then focus the editing host itself — silently in
//   Chromium — which stole the button focus after the viewer's Esc close
//   and mid Tab-walk over the needing blocks). Both cases fail without
//   the keyboard.js keyup guard.
//   v1.3.0 - 2026-10-16 C-51 T-010 (D-7): the render/click/
//   keyboard/glyph/export cases are unchanged (the vnode still renders on
//   every viewable figure); the CSS pins follow the copy-icon restyle —
//   20 px square at top/right 8 px, border none, background transparent,
//   radius 4, var(--iconColor) glyph, opacity 0 / 0.5 (figure hover) / 1
//   (button hover + :focus-visible), display:none unless the figure has
//   ag-expand-needed (not a Tab stop without it), hide on .ag-active, the
//   pencil shift scoped to ag-has-expand.ag-expand-needed, the table
//   placement in the top-margin band (top:-22px, right:0), and the T-006
//   44 px strips + body.compact-block-tools rules gone.
//   v1.2.0 - 2026-10-16 C-51 T-006 canvas rework, review pass:
//   vnode attrs read from vnode.data.attrs (snabbdom shape — the v1.1.0
//   draft read .attrs directly and would have thrown); added the CSS
//   literal pins (30/28 px, 10 px insets, radius 8/7, 0.85 rest opacity,
//   44 px reserved corner on the preview AND the table figure, tool-bar
//   strip, hide-on-active, pencil shift) and the export case (renderHtml
//   output carries no ag-block-expand / ag-has-expand markup).
//   v1.1.0 - 2026-10-16 C-51 T-006 canvas rework reconciliation:
//   the glyph assertions follow the drawn M-057 svg (inline path pinned
//   byte-identical to chromeIcons.CHROME_ICONS.expand) and the button's
//   tabindex=0 keyboard stop; the figure selector gains the ag-has-expand
//   marker pin. The v1.0.0 coverage (placement, scope, click routing,
//   keyboard guard) is unchanged; all of it fails against the pre-C-51
//   render (no button existed).
// END_CHANGE_SUMMARY

import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { h } from 'muya/lib/parser/render/snabbdom'
import ClickEvent from 'muya/lib/eventHandler/clickEvent'
import Keyboard from 'muya/lib/eventHandler/keyboard'
import selection from 'muya/lib/selection'
import { EXPAND_ICON_PATH } from 'muya/lib/parser/render/renderBlock/renderExpandButton'
import { CHROME_ICONS } from '@/components/icons/chromeIcons'
import ExportHtml from 'muya/lib/utils/exportHtml'

// The render harness never calls the loaders; the export case swaps in a
// pele double with detectType/render.
const rendererDoubles = {}

vi.mock('muya/lib/renderers', () => ({
  default: async (name) => rendererDoubles[name] || {}
}))

const TRANSLATIONS = {
  'blockViewer.expand': 'Expand'
}

const t = (key) => TRANSLATIONS[key] || key

// START_BLOCK_EXPAND_BUTTON_FIXTURES
const makeDiagramBlocks = (functionType, code = 'graph TD\n    A --> B') => {
  const figure = { key: 'df', type: 'figure', functionType, parent: null, children: [] }
  const pre = {
    key: 'dp', type: 'pre', functionType, lang: functionType, parent: 'df', children: []
  }
  const codeBlock = { key: 'dc', type: 'code', functionType: 'codeContent', parent: 'dp', children: [] }
  const lines = code.split('\n').map((text, i) => ({
    key: `dl${i}`, type: 'span', functionType: 'codeContent', text, parent: 'dc'
  }))
  codeBlock.children.push(...lines)
  const preview = { key: 'dd', type: 'div', functionType, parent: 'df', children: [] }
  pre.children.push(codeBlock)
  figure.children.push(pre, preview)
  return { figure, pre }
}

const makeTableBlocks = () => {
  const figure = { key: 'tf', type: 'figure', functionType: 'table', parent: null, children: [] }
  const table = { key: 'tt', type: 'table', row: 1, column: 1, parent: 'tf', children: [] }
  const thead = { key: 'thd', type: 'thead', parent: 'tt', children: [] }
  const tbody = { key: 'tbd', type: 'tbody', parent: 'tt', children: [] }
  const headRow = { key: 'tr0', type: 'tr', parent: 'thd', children: [] }
  const bodyRow = { key: 'tr1', type: 'tr', parent: 'tbd', children: [] }
  const th = { key: 'c0', type: 'th', align: '', column: 0, parent: 'tr0', children: [] }
  const td = { key: 'c1', type: 'td', align: '', column: 0, parent: 'tr1', children: [] }
  const thSpan = { key: 's0', type: 'span', functionType: 'cellContent', text: 'Head', parent: 'c0' }
  const tdSpan = { key: 's1', type: 'span', functionType: 'cellContent', text: 'Cell', parent: 'c1' }

  th.children.push(thSpan)
  td.children.push(tdSpan)
  headRow.children.push(th)
  bodyRow.children.push(td)
  thead.children.push(headRow)
  tbody.children.push(bodyRow)
  table.children.push(thead, tbody)
  figure.children.push(table)
  return { figure }
}

let StateRender = null

const createStateRender = async ({ tableResize = null } = {}) => {
  if (!StateRender) {
    const mod = await import('muya/lib/parser/render/index')
    StateRender = mod.default
  }
  const sr = new StateRender({
    eventCenter: { dispatch: vi.fn() },
    options: {},
    tableResize,
    contentState: {
      cursor: { start: { key: 'x' }, end: { key: 'x' } },
      selectedBlock: null,
      selectedTableCells: null
    }
  })
  // Keep the leaf machinery out of scope (KaTeX/prism/mermaid caches): the
  // assertions target the FIGURE vnode; the pre branch that feeds codeCache
  // is container-level and still runs for real.
  sr.renderLeafBlock = (parent, block, activeBlocks, matches, useCache, tt) =>
    h(`span#${block.key}.ag-cell-content`, { dataset: {} }, block.text)
  return sr
}

const findVnode = (vnode, predicate) => {
  if (!vnode) return null
  if (predicate(vnode)) return vnode
  for (const child of vnode.children || []) {
    const hit = findVnode(child, predicate)
    if (hit) return hit
  }
  return null
}

const findExpandButtonVnode = (figureVnode) => {
  const children = figureVnode.children || []
  const index = children.findIndex((c) => c.sel === 'button.ag-block-expand')
  return { button: index === -1 ? null : children[index], index }
}
// END_BLOCK_EXPAND_BUTTON_FIXTURES

// START_BLOCK_EXPAND_BUTTON_EVENT_HARNESSES
const cleanups = []

afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()()
  document.body.innerHTML = ''
})

const createClickHarness = () => {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const eventCenter = {
    dispatch: vi.fn(),
    attachDOMEvent: vi.fn((target, type, handler) => {
      target.addEventListener(type, handler)
    })
  }
  const contentState = {
    selectedImage: null,
    selectedTableCells: null,
    clickHandler: vi.fn(),
    copyCodeBlock: vi.fn()
  }
  const muya = { container, eventCenter, contentState }
  new ClickEvent(muya)
  return { container, dispatch: eventCenter.dispatch, contentState }
}

const createKeyboardHarness = () => {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const listeners = []
  const eventCenter = {
    subscribe: vi.fn(),
    dispatch: vi.fn(),
    attachDOMEvent: vi.fn((target, type, handler) => {
      target.addEventListener(type, handler)
      listeners.push(() => target.removeEventListener(type, handler))
    })
  }
  const contentState = {
    selectedImage: null,
    cursor: {},
    inputHandler: vi.fn(),
    tabHandler: vi.fn(),
    enterHandler: vi.fn(),
    backspaceHandler: vi.fn(),
    deleteHandler: vi.fn(),
    arrowHandler: vi.fn(),
    docEnterHandler: vi.fn(),
    docBackspaceHandler: vi.fn(),
    docDeleteHandler: vi.fn(),
    docArrowHandler: vi.fn()
  }
  const muya = { container, eventCenter, contentState, undo: vi.fn(), redo: vi.fn() }
  new Keyboard(muya)
  cleanups.push(() => listeners.forEach((remove) => remove()))
  return muya
}

const keydown = (el, init) => {
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init })
  el.dispatchEvent(event)
  return event
}

const keyup = (el, init) => {
  const event = new KeyboardEvent('keyup', { bubbles: true, cancelable: true, ...init })
  el.dispatchEvent(event)
  return event
}
// END_BLOCK_EXPAND_BUTTON_EVENT_HARNESSES

describe('expand button render + routing (C-51 T-006/T-010)', () => {
  // START_BLOCK_EXPAND_BUTTON_RENDER_ASSERTIONS
  it('renders button.ag-block-expand on flowchart/sequence/plantuml figures with non-empty source (the roles that keep it since C-56 T-005)', async () => {
    const sr = await createStateRender()
    for (const functionType of ['flowchart', 'sequence', 'plantuml']) {
      const { figure } = makeDiagramBlocks(functionType)
      const figureVnode = sr.renderBlock(null, figure, [], {}, false, t)
      const { button } = findExpandButtonVnode(figureVnode)
      expect(button, `${functionType} figure must carry the expand button`).toBeTruthy()
      expect(button.sel).toBe('button.ag-block-expand')
      expect(button.data.attrs.type).toBe('button')
      expect(button.data.attrs.title).toBe('Expand')
      expect(button.data.attrs['aria-label']).toBe('Expand')
      expect(button.data.attrs.contenteditable).toBe('false')
      // A real keyboard Tab stop, not just mouse-reachable.
      expect(button.data.attrs.tabindex).toBe('0')
      // The figure carries the marker that scopes the reserved-corner CSS.
      expect(figureVnode.sel).toMatch(/\.ag-has-expand\b/)
    }
  })

  it('mermaid and vega-lite figures keep the marker but carry the corner pill, not the standalone glyph (C-56 T-005)', async () => {
    const sr = await createStateRender()
    for (const functionType of ['mermaid', 'vega-lite']) {
      const { figure } = makeDiagramBlocks(functionType)
      const figureVnode = sr.renderBlock(null, figure, [], {}, false, t)
      // The need gate still runs on these figures…
      expect(figureVnode.sel, `${functionType} keeps the need marker`).toMatch(/\.ag-has-expand\b/)
      // …but the standalone glyph is replaced by the pill (a figure child
      // div whose third button is the expand action).
      expect(findExpandButtonVnode(figureVnode).button, `${functionType} has no direct expand child`).toBeNull()
      const toolbar = (figureVnode.children || []).find((c) => c.sel === 'div.ag-block-toolbar')
      expect(toolbar, `${functionType} carries the pill`).toBeTruthy()
      expect((toolbar.children || []).some((c) =>
        c.sel === 'button.ag-block-expand.ag-block-toolbar-btn.ag-block-toolbar-expand'
      )).toBe(true)
    }
  })

  it('table figures keep the need marker but carry the C-65 table toolbar, not the standalone glyph (C-65 T-002)', async () => {
    const sr = await createStateRender({
      tableResize: { enabled: () => true, isFullWidth: () => false, getRenderWidths: () => null }
    })
    const { figure } = makeTableBlocks()
    const figureVnode = sr.renderBlock(null, figure, [], {}, false, t)

    expect(figureVnode.sel).toMatch(/\.ag-has-expand\b/)
    // No direct standalone glyph child anymore…
    expect(findExpandButtonVnode(figureVnode).button, 'tables have no direct expand child').toBeNull()
    // …the toolbar is the FIRST figure child (before the C-39 scroll
    // wrapper: Chromium makes an overflowing wrapper a keyboard-focusable
    // scroller, so the toolbar must precede it in Tab order), and its
    // second button is the expand action under the same family class.
    const children = figureVnode.children || []
    const toolbarIndex = children.findIndex((v) => v.sel === 'div.ag-block-toolbar.ag-table-toolbar')
    const wrapperIndex = children.findIndex((v) => v.sel === 'div.ag-table-scroll')
    expect(toolbarIndex, 'the table figure carries the table toolbar').toBeGreaterThan(-1)
    expect(wrapperIndex, 'the table figure keeps its scroll wrapper').toBeGreaterThan(-1)
    expect(toolbarIndex, 'the toolbar precedes the scroll wrapper').toBeLessThan(wrapperIndex)
    // (The table front icon may still precede it; Tab order is what matters.)
    const toolbar = children[toolbarIndex]
    const buttons = (toolbar.children || []).filter((c) => c.sel.includes('ag-table-toolbar-btn'))
    // C-70: toggle, Copy as image, Open full screen.
    expect(buttons.length).toBe(3)
    expect(buttons[1].sel).toContain('ag-table-toolbar-copy')
    expect(buttons[2].sel).toContain('ag-block-expand')
    expect(buttons[2].sel).toContain('ag-block-toolbar-expand')
    // Not nested inside the wrapper: table clicks/drag stay first-class.
    expect(findVnode(children[wrapperIndex], (v) => v.sel === 'button.ag-block-expand')).toBeNull()
  })

  it('a disabled surface (the Split View mirror) renders neither the toolbar nor the glyph on a table figure', async () => {
    const sr = await createStateRender({
      tableResize: { enabled: () => false, isFullWidth: () => false, getRenderWidths: () => null }
    })
    const { figure } = makeTableBlocks()
    const figureVnode = sr.renderBlock(null, figure, [], {}, false, t)
    expect(findExpandButtonVnode(figureVnode).button).toBeNull()
    expect((figureVnode.children || []).some((c) => (c.sel || '').includes('ag-table-toolbar'))).toBe(false)
    // The caption element still renders (informational, inert).
    const wrapper = figureVnode.children.find(c => c.sel === 'div.ag-table-scroll')
    expect(wrapper.children.some(c => c.sel === 'div.ag-table-caption')).toBe(true)
  })

  it('renders no button for html / multiplemath figures, empty diagrams, or plain blocks', async () => {
    const sr = await createStateRender()
    for (const functionType of ['html', 'multiplemath']) {
      const { figure } = makeDiagramBlocks(functionType)
      const figureVnode = sr.renderBlock(null, figure, [], {}, false, t)
      expect(findExpandButtonVnode(figureVnode).button, `${functionType} is out of scope`).toBeNull()
      expect(figureVnode.sel).not.toMatch(/\.ag-has-expand\b/)
    }

    const { figure: empty } = makeDiagramBlocks('mermaid', '')
    const emptyVnode = sr.renderBlock(null, empty, [], {}, false, t)
    expect(findExpandButtonVnode(emptyVnode).button).toBeNull()
    expect(emptyVnode.sel).not.toMatch(/\.ag-has-expand\b/)
    // C-56 T-005: an empty fence gets no pill either — the pencil stays.
    expect((emptyVnode.children || []).some((c) => c.sel === 'div.ag-block-toolbar')).toBe(false)

    const quote = {
      key: 'bq', type: 'blockquote', parent: null,
      children: [{ key: 'p1', type: 'p', parent: 'bq', children: [{ key: 'sp', type: 'span', functionType: 'paragraphContent', text: 'q', parent: 'p1' }] }]
    }
    const quoteVnode = sr.renderBlock(null, quote, [], {}, false, t)
    expect(findVnode(quoteVnode, (v) => v.sel === 'button.ag-block-expand')).toBeNull()
  })

  it('uses the blockViewer.expand key for the label (10-locale string table)', async () => {
    const sr = await createStateRender()
    const { figure } = makeDiagramBlocks('flowchart')
    const figureVnode = sr.renderBlock(null, figure, [], {}, false, t)
    const { button } = findExpandButtonVnode(figureVnode)
    expect(button.data.attrs['aria-label']).toBe('Expand')
  })

  it('renders the drawn expand glyph inline, byte-identical to the canonical chromeIcons descriptor', async () => {
    const sr = await createStateRender()
    const { figure } = makeDiagramBlocks('flowchart')
    const figureVnode = sr.renderBlock(null, figure, [], {}, false, t)
    const { button } = findExpandButtonVnode(figureVnode)

    // Inline svg glyph: 16-grid viewBox, currentColor stroke, aria-hidden.
    const icon = (button.children || [])[0]
    expect(icon && icon.sel).toBe('svg')
    expect(icon.data.attrs.viewBox).toBe('0 0 16 16')
    expect(icon.data.attrs.stroke).toBe('currentColor')
    expect(icon.data.attrs['stroke-width']).toBe('1.4')
    expect(icon.data.attrs['aria-hidden']).toBe('true')
    const path = (icon.children || [])[0]
    expect(path && path.sel).toBe('path')
    // The muya copy and the M-057 canonical drawing never drift apart.
    expect(path.data.attrs.d).toBe(EXPAND_ICON_PATH)
    expect(EXPAND_ICON_PATH).toBe(CHROME_ICONS.expand[0].attrs.d)
    expect(CHROME_ICONS.expand[0].cap).toBe('round')
    expect(CHROME_ICONS.expand[0].join).toBe('round')
  })
  // END_BLOCK_EXPAND_BUTTON_RENDER_ASSERTIONS

  // START_BLOCK_EXPAND_BUTTON_CLICK_ASSERTIONS
  it('a click on the button dispatches muya-block-viewer with the figure and never reaches contentState', () => {
    const { container, dispatch, contentState } = createClickHarness()
    const figure = document.createElement('figure')
    figure.setAttribute('data-role', 'MERMAID')
    const button = document.createElement('button')
    button.className = 'ag-block-expand'
    figure.appendChild(button)
    container.appendChild(figure)

    const event = new MouseEvent('click', { bubbles: true, cancelable: true })
    button.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(true)
    expect(dispatch).toHaveBeenCalledWith('muya-block-viewer', { element: figure })
    expect(contentState.clickHandler).not.toHaveBeenCalled()
  })
  // END_BLOCK_EXPAND_BUTTON_CLICK_ASSERTIONS

  // START_BLOCK_EXPAND_BUTTON_KEYBOARD_ASSERTIONS
  it('keys on the focused button are not routed into the document handlers (Tab moves focus)', () => {
    const muya = createKeyboardHarness()
    const button = document.createElement('button')
    button.className = 'ag-block-expand'
    muya.container.appendChild(button)

    const tab = keydown(button, { key: 'Tab' })
    expect(tab.defaultPrevented).toBe(false)
    expect(muya.contentState.tabHandler).not.toHaveBeenCalled()

    const enter = keydown(button, { key: 'Enter' })
    expect(enter.defaultPrevented).toBe(false)
    expect(muya.contentState.enterHandler).not.toHaveBeenCalled()

    // arrowHandler would crash on its paragraph lookup from the button.
    keydown(button, { key: 'ArrowDown' })
    expect(muya.contentState.arrowHandler).not.toHaveBeenCalled()
  })

  it('Tab on the editor itself still routes to tabHandler (guard is scoped to the button)', () => {
    const muya = createKeyboardHarness()
    keydown(muya.container, { key: 'Tab' })
    expect(muya.contentState.tabHandler).toHaveBeenCalledTimes(1)
  })

  it('keyups on the focused button never reach the selection machinery (the button keeps the focus)', () => {
    const muya = createKeyboardHarness()
    const button = document.createElement('button')
    button.className = 'ag-block-expand'
    button.setAttribute('contenteditable', 'false')
    muya.container.appendChild(button)
    muya.container.classList.add('ag-meta-or-ctrl')

    // The keyup handler's selection repair is what moved the browser
    // focus into the editing host after the viewer's Esc close (both
    // engines) and during the Tab walk over the needing blocks
    // (Chromium): getCursorRange's needFix branch calls setCursorRange →
    // Selection.addRange inside the contenteditable, and the browser
    // then focuses the editing host — Chromium without focus events.
    const getCursorRange = vi.spyOn(selection, 'getCursorRange')
    cleanups.push(() => getCursorRange.mockRestore())

    keyup(button, { key: 'Escape' })
    keyup(button, { key: 'Tab' })
    expect(getCursorRange).not.toHaveBeenCalled()
    expect(muya.eventCenter.dispatch).not.toHaveBeenCalledWith(
      'muya-emoji-picker',
      expect.anything()
    )
    // The Cmd/Ctrl modifier-class cleanup still runs before the guard.
    expect(muya.container.classList.contains('ag-meta-or-ctrl')).toBe(false)

    // Scoped to the button: an editor keyup still runs the machinery.
    keyup(muya.container, { key: 'a' })
    expect(getCursorRange).toHaveBeenCalledTimes(1)
  })
  // END_BLOCK_EXPAND_BUTTON_KEYBOARD_ASSERTIONS
})

// START_BLOCK_EXPAND_BUTTON_CSS_ASSERTIONS
describe('expand button CSS (C-51 T-010, copy-icon look of .ag-code-copy)', () => {
  const css = readFileSync(
    resolve(dirname(fileURLToPath(import.meta.url)), '../../../src/muya/lib/assets/styles/index.css'),
    'utf8'
  )

  it('pins the 20 px copy-icon look: 8 px insets (the copy-icon 0.5em at 16 px; em would resolve against the button font-size: 0), no border, no background, radius 4', () => {
    expect(css).toContain('figure > button.ag-block-expand {')
    // All geometry pins live inside the button's own base rule — the same
    // literals appear in .ag-code-copy, so a bare toContain would match it.
    const base = css.split('figure > button.ag-block-expand {')[1].split('}')[0]
    expect(base).toContain('width: 20px')
    expect(base).toContain('height: 20px')
    expect(base).toContain('top: 8px')
    expect(base).toContain('right: 8px')
    expect(base).toContain('border: none')
    expect(base).toContain('border-radius: 4px')
    expect(base).toContain('background: transparent')
    expect(base).toContain('color: var(--iconColor)')
  })

  it('pins the visibility curve: 0 at rest, 0.5 on figure hover, 1 on button hover and keyboard focus', () => {
    // Every value is pinned inside its own rule — bare literals like
    // 'opacity: 0.5;' also appear in the .ag-code-copy rules.
    const base = css.split('figure > button.ag-block-expand {')[1].split('}')[0]
    expect(base).toContain('opacity: 0')
    const figureHover = css.split('figure.ag-expand-needed:hover > button.ag-block-expand {')[1].split('}')[0]
    expect(figureHover).toContain('opacity: 0.5')
    expect(css).toContain('figure.ag-expand-needed > button.ag-block-expand:hover,')
    const solid = css.split('figure.ag-expand-needed > button.ag-block-expand:focus-visible {')[1].split('}')[0]
    expect(solid).toContain('opacity: 1')
  })

  it('pins the need gate: display:none unless ag-expand-needed, still hidden while editing', () => {
    expect(css).toContain('figure.ag-expand-needed > button.ag-block-expand {')
    expect(css).toContain('figure.ag-active > button.ag-block-expand {')
    // display:none is the default (declared in the base rule) — the gate
    // rule must not re-declare it for every figure, only the flex reveal.
    const base = css.split('figure > button.ag-block-expand {')[1].split('}')[0]
    expect(base).toContain('display: none')
    const gate = css.split('figure.ag-expand-needed > button.ag-block-expand {')[1].split('}')[0]
    expect(gate).toContain('display: flex')
  })

  it('pins the T-006 reserved strip removed and the compact variant gone', () => {
    expect(css).not.toContain('padding-top: 44px')
    expect(css).not.toContain('compact-block-tools')
    expect(css).not.toContain('--ag-block-expand-size')
    // The table tools bar keeps its original pre-T-006 band.
    expect(css).not.toContain(".ag-has-expand > .ag-tool-bar {")
  })

  it('pins the pencil shift scoped to figures that need the button, and the dead table glyph rule gone (C-65 T-002)', () => {
    expect(css).toContain('figure.ag-has-expand.ag-expand-needed .ag-container-icon {')
    expect(css).toContain('right: 2.2em;')
    // Tables render the C-65 toolbar above the table (pinned in
    // table-cue.test.js), so the old standalone-glyph table placement rule
    // is gone with the glyph.
    expect(css).not.toContain("figure[data-role='TABLE'].ag-expand-needed > button.ag-block-expand {")
  })
})
// END_BLOCK_EXPAND_BUTTON_CSS_ASSERTIONS

// START_BLOCK_EXPAND_BUTTON_EXPORT_ASSERTIONS
describe('expand button never reaches export/print (C-51 T-006)', () => {
  it('ExportHtml.renderHtml builds its own DOM from markdown and contains no button markup', async () => {
    rendererDoubles.pele = {
      detectType: vi.fn(() => 'flowchart'),
      render: vi.fn((code, opts) => ({
        svg: `<svg class="pele pele-flowchart" width="100" height="50"><g/></svg>`,
        width: 100,
        height: 50,
        links: [],
        type: 'flowchart'
      }))
    }
    const markdown = [
      '# Export',
      '',
      '```mermaid',
      'graph TD',
      '    A --> B',
      '```',
      '',
      '| a | b |',
      '| --- | --- |',
      '| 1 | 2 |',
      ''
    ].join('\n')

    const exporter = new ExportHtml(markdown, null)
    const html = await exporter.renderHtml(undefined)

    expect(html).toContain('<svg')
    expect(html).toContain('<table')
    expect(html).not.toContain('ag-block-expand')
    expect(html).not.toContain('ag-has-expand')
    // C-56 T-005: the corner pill is editor chrome too — it never travels.
    expect(html).not.toContain('ag-block-toolbar')
  })
})
// END_BLOCK_EXPAND_BUTTON_EXPORT_ASSERTIONS
