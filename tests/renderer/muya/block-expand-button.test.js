// FILE: tests/renderer/muya/block-expand-button.test.js
// VERSION: 1.2.0
// START_MODULE_CONTRACT
//   PURPOSE: Pin the C-51 T-006 always-visible expand button — vnode placement, marker class and localized a11y attrs on every viewable figure, the drawn M-057 glyph (byte-identical to the canonical chromeIcons descriptor), click routing to the muya-block-viewer event, the keyboard guard that leaves Tab/Enter/arrows to the focused button, the canvas CSS literals (30/28 px, insets, reserved corner), and the button never reaching export HTML.
//   SCOPE: START_BLOCK_EXPAND_BUTTON (renderContainerBlock.js + renderExpandButton.js), START_BLOCK_EXPAND_BUTTON_CLICK (clickEvent.js), START_BLOCK_KEYBOARD_EXPAND_BUTTON (keyboard.js), the C-51 T-006 CSS section of lib/assets/styles/index.css, and ExportHtml.renderHtml.
//   DEPENDS: StateRender (muya/lib/parser/render/index.js) with a mocked renderer loader, ClickEvent and Keyboard with a real-DOM event-center double, muya snabbdom h, @/components/icons/chromeIcons (the glyph twin), ExportHtml with a mermaid double, node:fs for the CSS read; Vitest + jsdom.
//   LINKS: .grace/changes/active/C-51 T-006; .grace/verification/runtime.xml V-M-012 scenario-60; tests/e2e/block-viewer.spec.ts for the laid-out behaviour.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   TRANSLATIONS - en strings injected as the render/click t function.
//   rendererDoubles - per-name loader results (mermaid swapped in for the export case).
//   makeDiagramBlocks - figure→pre→code→line-span block tree for a diagram functionType.
//   makeTableBlocks - figure→table→thead/tbody block tree (same shape as table-scroll-wrapper.test.js).
//   createStateRender - real StateRender with a fake muya and a stubbed renderLeafBlock.
//   findVnode - depth-first vnode search by predicate.
//   findExpandButtonVnode - the button.ag-block-expand child of a figure vnode, plus its index.
//   createClickHarness - container + addEventListener-backed eventCenter double + ClickEvent instance.
//   createKeyboardHarness - container + addEventListener-backed eventCenter double + Keyboard instance + listener cleanup.
//   StateRender - test fixture / helper.
//   cleanups - test fixture / helper.
//   keydown - test fixture / helper.
//   t - test fixture / helper.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.2.0 - 2026-10-16 C-51 T-006 canvas rework, review pass:
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
import { EXPAND_ICON_PATH } from 'muya/lib/parser/render/renderBlock/renderExpandButton'
import { CHROME_ICONS } from '@/components/icons/chromeIcons'
import ExportHtml from 'muya/lib/utils/exportHtml'

// The render harness never calls the loaders; the export case swaps in a
// mermaid double with initialize/render.
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

const createStateRender = async () => {
  if (!StateRender) {
    const mod = await import('muya/lib/parser/render/index')
    StateRender = mod.default
  }
  const sr = new StateRender({
    eventCenter: { dispatch: vi.fn() },
    options: {},
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
// END_BLOCK_EXPAND_BUTTON_EVENT_HARNESSES

describe('always-visible expand button (C-51 T-006)', () => {
  // START_BLOCK_EXPAND_BUTTON_RENDER_ASSERTIONS
  it('renders button.ag-block-expand on every diagram figure with non-empty source', async () => {
    const sr = await createStateRender()
    for (const functionType of ['mermaid', 'flowchart', 'sequence', 'plantuml', 'vega-lite']) {
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

  it('renders the button on the table figure as a direct child, outside the scroll wrapper', async () => {
    const sr = await createStateRender()
    const { figure } = makeTableBlocks()
    const figureVnode = sr.renderBlock(null, figure, [], {}, false, t)

    expect(figureVnode.sel).toMatch(/\.ag-has-expand\b/)
    const { button, index } = findExpandButtonVnode(figureVnode)
    expect(button, 'the table figure must carry the expand button').toBeTruthy()
    const children = figureVnode.children || []
    expect(children[index - 1].sel).toBe('div.ag-table-scroll')
    // Not nested inside the wrapper: table clicks/drag stay first-class.
    expect(findVnode(children[index - 1], (v) => v.sel === 'button.ag-block-expand')).toBeNull()
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

    const quote = {
      key: 'bq', type: 'blockquote', parent: null,
      children: [{ key: 'p1', type: 'p', parent: 'bq', children: [{ key: 'sp', type: 'span', functionType: 'paragraphContent', text: 'q', parent: 'p1' }] }]
    }
    const quoteVnode = sr.renderBlock(null, quote, [], {}, false, t)
    expect(findVnode(quoteVnode, (v) => v.sel === 'button.ag-block-expand')).toBeNull()
  })

  it('uses the blockViewer.expand key for the label (10-locale string table)', async () => {
    const sr = await createStateRender()
    const { figure } = makeDiagramBlocks('mermaid')
    const figureVnode = sr.renderBlock(null, figure, [], {}, false, t)
    const { button } = findExpandButtonVnode(figureVnode)
    expect(button.data.attrs['aria-label']).toBe('Expand')
  })

  it('renders the drawn expand glyph inline, byte-identical to the canonical chromeIcons descriptor', async () => {
    const sr = await createStateRender()
    const { figure } = makeDiagramBlocks('mermaid')
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
  // END_BLOCK_EXPAND_BUTTON_KEYBOARD_ASSERTIONS
})

// START_BLOCK_EXPAND_BUTTON_CSS_ASSERTIONS
describe('expand button CSS (C-51 T-006, canvas Mermaid/Main)', () => {
  const css = readFileSync(
    resolve(dirname(fileURLToPath(import.meta.url)), '../../../src/muya/lib/assets/styles/index.css'),
    'utf8'
  )

  it('pins the canvas look: 30 px rounded square, 10 px insets, subtle at rest', () => {
    expect(css).toContain('figure > button.ag-block-expand {')
    expect(css).toContain('--ag-block-expand-size: 30px')
    expect(css).toContain('top: 10px')
    expect(css).toContain('right: 10px')
    expect(css).toContain('border-radius: 8px')
    expect(css).toContain('opacity: 0.85')
  })

  it('pins the compact variant: 28 px, radius 7', () => {
    expect(css).toContain('body.compact-block-tools figure > button.ag-block-expand {')
    expect(css).toContain('--ag-block-expand-size: 28px')
    expect(css).toContain('border-radius: 7px')
  })

  it('pins the reserved corner: the 44 px strip on the preview and the table figure', () => {
    expect(css).toContain('figure.ag-has-expand:not(.ag-active) > div.ag-container-preview {')
    expect(css).toContain('padding-top: 44px')
    expect(css).toContain("figure[data-role='TABLE'].ag-has-expand {")
    expect(css).toContain("figure[data-role='TABLE'].ag-has-expand > .ag-tool-bar {")
  })

  it('pins the active-state handover and the edit-pencil shift', () => {
    expect(css).toContain('figure.ag-active > button.ag-block-expand {')
    expect(css).toContain('figure.ag-has-expand .ag-container-icon {')
    expect(css).toContain('right: 50px')
  })
})
// END_BLOCK_EXPAND_BUTTON_CSS_ASSERTIONS

// START_BLOCK_EXPAND_BUTTON_EXPORT_ASSERTIONS
describe('expand button never reaches export/print (C-51 T-006)', () => {
  it('ExportHtml.renderHtml builds its own DOM from markdown and contains no button markup', async () => {
    rendererDoubles.mermaid = {
      initialize: vi.fn(),
      render: vi.fn(async (id) => ({
        svg: `<svg id="${id}" width="100" height="50"><g/></svg>`,
        bindFunctions: null
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
  })
})
// END_BLOCK_EXPAND_BUTTON_EXPORT_ASSERTIONS
