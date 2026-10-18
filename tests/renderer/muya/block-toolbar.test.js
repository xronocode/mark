// FILE: tests/renderer/muya/block-toolbar.test.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Pin the C-56 T-005 diagram corner toolbar — the pill vnode (div.ag-block-toolbar with the three same-family icon buttons) rendered ONLY on ```mermaid (pele) and ```vega-lite figures with non-empty source where it REPLACES the PNG edit pencil and the standalone expand glyph, the exact mockup glyphs (16-grid, 1.5 stroke, round caps) and localized labels/title/aria-label, the ag-block-expand keyboard-guard family class on every pill button, click routing (editSource → handleContainerBlockClick, copyImage → muya-diagram-export, expand → muya-block-viewer, disabled routes nowhere), the corner-4 syncBlockToolbarState copy-disabled pass (wired through updateFigureExpandNeed), and the variant-C CSS literals.
//   SCOPE: renderBlockToolbar.js (vnode + sync), the renderContainerBlock START_BLOCK_TOOLBAR_RENDER placement, the clickEvent START_BLOCK_TOOLBAR_CLICK routing, the expandNeed funnel integration and the C-56 T-005 CSS section of lib/assets/styles/index.css. The expand need RULES stay in expand-need.test.js; the standalone glyph in block-expand-button.test.js.
//   DEPENDS: StateRender (muya/lib/parser/render/index.js) with a mocked renderer loader, ClickEvent with a real-DOM event-center double, muya snabbdom h, node:fs for the CSS read; Vitest + jsdom.
//   LINKS: .grace/changes/active/C-56 T-005; .grace/verification/runtime.xml V-M-012 scenario-64; tests/e2e/diagram-export.spec.ts (the pill e2e); tests/e2e/block-viewer.spec.ts.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   StateRender - the muya renderer under test.
//   t - i18n stub.
//   TRANSLATIONS - en strings injected as the render/click t function.
//   rendererDoubles - per-name loader results (unused by these cases; the mock keeps the import graph intact).
//   makeDiagramBlocks - figure→pre→code→line-span + preview-div block tree for a diagram functionType.
//   makeTableBlocks - figure→table block tree (the negative case).
//   createStateRender - real StateRender with a fake muya and a stubbed renderLeafBlock.
//   findVnode - depth-first vnode search by predicate.
//   findToolbarVnode - the div.ag-block-toolbar child of a figure vnode, plus its index.
//   createClickHarness - container + addEventListener-backed eventCenter double + ClickEvent instance with a handleContainerBlockClick spy.
//   makeDomFigure - a real-DOM MERMAID figure with preview + pill buttons (click-routing and sync cases).
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - 2026-10-18 C-56 T-005: new — every case fails
//   against the pre-T-005 render (no pill exists; the pencil + standalone
//   glyph render instead).
// END_CHANGE_SUMMARY

import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { h } from 'muya/lib/parser/render/snabbdom'
import ClickEvent from 'muya/lib/eventHandler/clickEvent'
import {
  BLOCK_TOOLBAR_BUTTON_SELECTOR,
  TOOLBAR_COPY_ICON_PATHS,
  TOOLBAR_COPY_ICON_RECT,
  TOOLBAR_EDIT_ICON_PATH,
  TOOLBAR_EXPAND_ICON_PATH,
  default as renderBlockToolbar,
  syncBlockToolbarState
} from 'muya/lib/parser/render/renderBlock/renderBlockToolbar'
import { updateFigureExpandNeed } from 'muya/lib/parser/render/renderBlock/expandNeed'

const rendererDoubles = {}

vi.mock('muya/lib/renderers', () => ({
  default: async (name) => rendererDoubles[name] || {}
}))

const TRANSLATIONS = {
  'blockToolbar.editSource': 'Edit source',
  'blockToolbar.copyImage': 'Copy as image',
  'blockToolbar.openFullScreen': 'Open full screen',
  'blockViewer.expand': 'Expand'
}

const t = (key) => TRANSLATIONS[key] || key

// START_BLOCK_TOOLBAR_FIXTURES
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

const findToolbarVnode = (figureVnode) => {
  const children = figureVnode.children || []
  const index = children.findIndex((c) => c.sel === 'div.ag-block-toolbar')
  return { toolbar: index === -1 ? null : children[index], index }
}
// END_BLOCK_TOOLBAR_FIXTURES

// START_BLOCK_TOOLBAR_DOM_HARNESS
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
    copyCodeBlock: vi.fn(),
    handleContainerBlockClick: vi.fn()
  }
  const muya = { container, eventCenter, contentState }
  new ClickEvent(muya)
  return { container, dispatch: eventCenter.dispatch, contentState }
}

const makeDomFigure = ({ withSvg = true, needed = false } = {}) => {
  const figure = document.createElement('figure')
  figure.id = 'fig-pill'
  figure.setAttribute('data-role', 'MERMAID')
  figure.className = withSvg && needed ? 'ag-has-expand ag-expand-needed' : 'ag-has-expand'
  const preview = document.createElement('div')
  preview.className = 'ag-container-preview'
  if (withSvg) {
    preview.appendChild(document.createElementNS('http://www.w3.org/2000/svg', 'svg'))
  }
  const toolbar = document.createElement('div')
  toolbar.className = 'ag-block-toolbar'
  for (const [action, className] of [
    ['editSource', 'ag-block-toolbar-edit'],
    ['copyImage', 'ag-block-toolbar-copy'],
    ['expand', 'ag-block-toolbar-expand']
  ]) {
    const btn = document.createElement('button')
    btn.className = `ag-block-expand ag-block-toolbar-btn ${className}`
    btn.dataset.blockToolbarAction = action
    toolbar.appendChild(btn)
  }
  figure.appendChild(preview)
  figure.appendChild(toolbar)
  return { figure, toolbar, buttons: Array.from(toolbar.children) }
}

afterEach(() => {
  document.body.innerHTML = ''
})
// END_BLOCK_TOOLBAR_DOM_HARNESS

// START_BLOCK_TOOLBAR_RENDER_ASSERTIONS
describe('corner toolbar render (C-56 T-005)', () => {
  it('renders the pill with three buttons on mermaid and vega-lite figures with source, replacing pencil and standalone glyph', async () => {
    const sr = await createStateRender()
    for (const functionType of ['mermaid', 'vega-lite']) {
      const { figure } = makeDiagramBlocks(functionType)
      const figureVnode = sr.renderBlock(null, figure, [], {}, false, t)

      // The figure keeps the need-gate marker (expandNeed.js still runs)
      // but has NO direct expand-button child and NO edit pencil: the pill
      // owns the corner.
      expect(figureVnode.sel, `${functionType} keeps the need marker`).toMatch(/\.ag-has-expand\b/)
      const direct = (figureVnode.children || []).filter(
        (c) => c.sel === 'button.ag-block-expand' || c.sel === 'a.ag-container-icon'
      )
      expect(direct, `${functionType} figure must carry neither pencil nor standalone glyph`).toHaveLength(0)
      // No standalone glyph nested anywhere either.
      expect(findVnode(figureVnode, (v) => v.sel === 'button.ag-block-expand')).toBeNull()

      const { toolbar, index } = findToolbarVnode(figureVnode)
      expect(toolbar, `${functionType} figure carries the pill`).toBeTruthy()
      // The pill rides AFTER the preview (a figure child like the old glyph).
      expect(index).toBe((figureVnode.children || []).length - 1)

      const buttons = toolbar.children || []
      expect(buttons).toHaveLength(3)
      expect(buttons.map((b) => b.sel)).toEqual([
        'button.ag-block-expand.ag-block-toolbar-btn.ag-block-toolbar-edit',
        'button.ag-block-expand.ag-block-toolbar-btn.ag-block-toolbar-copy',
        'button.ag-block-expand.ag-block-toolbar-btn.ag-block-toolbar-expand'
      ])
    }
  })

  it('labels, tooltips and a11y attrs come from the blockToolbar.* strings; buttons are real Tab stops', async () => {
    const sr = await createStateRender()
    const { figure } = makeDiagramBlocks('mermaid')
    const figureVnode = sr.renderBlock(null, figure, [], {}, false, t)
    const { toolbar } = findToolbarVnode(figureVnode)
    const [edit, copy, expand] = toolbar.children

    for (const [btn, label] of [
      [edit, 'Edit source'],
      [copy, 'Copy as image'],
      [expand, 'Open full screen']
    ]) {
      expect(btn.data.attrs.type).toBe('button')
      expect(btn.data.attrs.title).toBe(label)
      expect(btn.data.attrs['aria-label']).toBe(label)
      expect(btn.data.attrs.contenteditable).toBe('false')
      expect(btn.data.attrs.tabindex).toBe('0')
      // The localized label span rides every button (CSS reveals it on
      // the button's own hover — variant C).
      const span = (btn.children || []).find((c) => c.sel === 'span.ag-block-toolbar-label')
      expect(span && span.text).toBe(label)
    }
    expect(edit.data.dataset.blockToolbarAction).toBe('editSource')
    expect(copy.data.dataset.blockToolbarAction).toBe('copyImage')
    expect(expand.data.dataset.blockToolbarAction).toBe('expand')
  })

  it('renders the exact mockup glyphs: 16-grid viewBox, 1.5 stroke, round caps/joins, currentColor', async () => {
    const sr = await createStateRender()
    const { figure } = makeDiagramBlocks('mermaid')
    const figureVnode = sr.renderBlock(null, figure, [], {}, false, t)
    const { toolbar } = findToolbarVnode(figureVnode)
    const [edit, copy, expand] = toolbar.children

    const iconOf = (btn) => (btn.children || []).find((c) => c.sel === 'svg')
    for (const btn of [edit, copy, expand]) {
      const icon = iconOf(btn)
      expect(icon && icon.sel).toBe('svg')
      expect(icon.data.attrs.viewBox).toBe('0 0 16 16')
      expect(icon.data.attrs.width).toBe('16')
      expect(icon.data.attrs.height).toBe('16')
      expect(icon.data.attrs.fill).toBe('none')
      expect(icon.data.attrs.stroke).toBe('currentColor')
      expect(icon.data.attrs['stroke-width']).toBe('1.5')
      expect(icon.data.attrs['stroke-linecap']).toBe('round')
      expect(icon.data.attrs['stroke-linejoin']).toBe('round')
      expect(icon.data.attrs['aria-hidden']).toBe('true')
    }

    // code «‹ ›»
    expect((iconOf(edit).children || [])[0].data.attrs.d).toBe(TOOLBAR_EDIT_ICON_PATH)
    // copy-image «two rects + mountain»
    const copyChildren = iconOf(copy).children || []
    expect(copyChildren[0].sel).toBe('rect')
    expect(copyChildren[0].data.attrs).toEqual({
      x: TOOLBAR_COPY_ICON_RECT.x,
      y: TOOLBAR_COPY_ICON_RECT.y,
      width: TOOLBAR_COPY_ICON_RECT.width,
      height: TOOLBAR_COPY_ICON_RECT.height,
      rx: TOOLBAR_COPY_ICON_RECT.rx
    })
    expect(copyChildren.slice(1).map((c) => c.data.attrs.d)).toEqual(TOOLBAR_COPY_ICON_PATHS)
    // expand «two diagonal arrows»
    expect((iconOf(expand).children || [])[0].data.attrs.d).toBe(TOOLBAR_EXPAND_ICON_PATH)
  })

  it('every pill button carries the ag-block-expand keyboard-guard family class', async () => {
    const sr = await createStateRender()
    const { figure } = makeDiagramBlocks('mermaid')
    const figureVnode = sr.renderBlock(null, figure, [], {}, false, t)
    const { toolbar } = findToolbarVnode(figureVnode)
    // keyboard.js BLOCK_KEYBOARD_EXPAND_BUTTON matches
    // closest('button.ag-block-expand') — the pill buttons must match so
    // Tab/Enter/arrows and keyups belong to the button, not the document.
    for (const btn of toolbar.children || []) {
      expect(btn.sel.startsWith(BLOCK_TOOLBAR_BUTTON_SELECTOR)).toBe(true)
    }
  })

  it('no pill on flowchart/sequence/plantuml/html/multiplemath/table figures or empty mermaid fences — those keep today\u2019s icons', async () => {
    const sr = await createStateRender()
    for (const functionType of ['flowchart', 'sequence', 'plantuml']) {
      const { figure } = makeDiagramBlocks(functionType)
      const figureVnode = sr.renderBlock(null, figure, [], {}, false, t)
      expect(findToolbarVnode(figureVnode).toolbar, `${functionType} gets no pill`).toBeNull()
      // ...but keep the pencil AND the standalone expand glyph.
      expect(findVnode(figureVnode, (v) => v.sel === 'a.ag-container-icon'), `${functionType} keeps the pencil`).toBeTruthy()
      expect(findVnode(figureVnode, (v) => v.sel === 'button.ag-block-expand'), `${functionType} keeps the standalone glyph`).toBeTruthy()
    }

    for (const functionType of ['html', 'multiplemath']) {
      const { figure } = makeDiagramBlocks(functionType)
      const figureVnode = sr.renderBlock(null, figure, [], {}, false, t)
      expect(findToolbarVnode(figureVnode).toolbar, `${functionType} gets no pill`).toBeNull()
    }

    const { figure: tableFigure } = makeTableBlocks()
    const tableVnode = sr.renderBlock(null, tableFigure, [], {}, false, t)
    expect(findToolbarVnode(tableVnode).toolbar).toBeNull()

    // An empty mermaid fence: no pill, no marker — the pencil stays so the
    // empty block is still reachable.
    const { figure: empty } = makeDiagramBlocks('mermaid', '')
    const emptyVnode = sr.renderBlock(null, empty, [], {}, false, t)
    expect(findToolbarVnode(emptyVnode).toolbar).toBeNull()
    expect(emptyVnode.sel).not.toMatch(/\.ag-has-expand\b/)
    expect(findVnode(emptyVnode, (v) => v.sel === 'a.ag-container-icon'), 'the empty fence keeps the pencil').toBeTruthy()
  })

  it('renderBlockToolbar works standalone against the t function (no StateRender)', () => {
    const vnode = renderBlockToolbar(t)
    expect(vnode.sel).toBe('div.ag-block-toolbar')
    expect((vnode.children || []).map((b) => b.sel)).toHaveLength(3)
  })
})
// END_BLOCK_TOOLBAR_RENDER_ASSERTIONS

// START_BLOCK_TOOLBAR_CLICK_ASSERTIONS
describe('corner toolbar click routing (C-56 T-005)', () => {
  it('Edit source runs the container edit action on the figure', () => {
    const { container, dispatch, contentState } = createClickHarness()
    const { figure, buttons } = makeDomFigure()
    container.appendChild(figure)

    const event = new MouseEvent('click', { bubbles: true, cancelable: true })
    buttons[0].dispatchEvent(event)

    expect(event.defaultPrevented).toBe(true)
    expect(contentState.handleContainerBlockClick).toHaveBeenCalledTimes(1)
    expect(contentState.handleContainerBlockClick).toHaveBeenCalledWith(figure)
    expect(dispatch).not.toHaveBeenCalledWith('muya-block-viewer', expect.anything())
    expect(contentState.clickHandler).not.toHaveBeenCalled()
  })

  it('Copy as image dispatches muya-diagram-export copyImage with the FIGURE (the T-002 host transport)', () => {
    const { container, dispatch, contentState } = createClickHarness()
    const { figure, buttons } = makeDomFigure()
    container.appendChild(figure)

    const event = new MouseEvent('click', { bubbles: true, cancelable: true })
    buttons[1].dispatchEvent(event)

    expect(event.defaultPrevented).toBe(true)
    expect(dispatch).toHaveBeenCalledWith('muya-diagram-export', { action: 'copyImage', element: figure })
    expect(contentState.handleContainerBlockClick).not.toHaveBeenCalled()
    expect(contentState.clickHandler).not.toHaveBeenCalled()
  })

  it('Open full screen dispatches muya-block-viewer with the figure (the shared viewer)', () => {
    const { container, dispatch, contentState } = createClickHarness()
    const { figure, buttons } = makeDomFigure()
    container.appendChild(figure)

    const event = new MouseEvent('click', { bubbles: true, cancelable: true })
    buttons[2].dispatchEvent(event)

    expect(event.defaultPrevented).toBe(true)
    expect(dispatch).toHaveBeenCalledWith('muya-block-viewer', { element: figure })
    expect(contentState.handleContainerBlockClick).not.toHaveBeenCalled()
  })

  it('a disabled Copy as image button routes nowhere (corner-4 synthetic clicks guarded)', () => {
    const { container, dispatch, contentState } = createClickHarness()
    const { figure, buttons } = makeDomFigure()
    container.appendChild(figure)
    buttons[1].disabled = true

    const event = new MouseEvent('click', { bubbles: true, cancelable: true })
    buttons[1].dispatchEvent(event)

    expect(event.defaultPrevented).toBe(true)
    expect(dispatch).not.toHaveBeenCalled()
    expect(contentState.handleContainerBlockClick).not.toHaveBeenCalled()
  })
})
// END_BLOCK_TOOLBAR_CLICK_ASSERTIONS

// START_BLOCK_TOOLBAR_STATE_ASSERTIONS
describe('syncBlockToolbarState — the corner-4 copy-disabled pass (C-56 T-005)', () => {
  it('disables Copy as image while the preview has no svg and enables it once one lands', () => {
    const { figure, buttons } = makeDomFigure({ withSvg: false })
    document.body.appendChild(figure)
    const copy = buttons[1]
    expect(copy.disabled).toBe(false)

    syncBlockToolbarState(figure)
    expect(copy.disabled, 'never-rendered → disabled, not hidden').toBe(true)

    figure.querySelector('div.ag-container-preview')
      .appendChild(document.createElementNS('http://www.w3.org/2000/svg', 'svg'))
    syncBlockToolbarState(figure)
    expect(copy.disabled, 'rendered (a stale keep-last-good svg included) → enabled').toBe(false)
  })

  it('re-disables when the svg goes away (source edit → loading) and is a no-op without a pill', () => {
    const { figure, buttons } = makeDomFigure({ withSvg: true })
    document.body.appendChild(figure)
    syncBlockToolbarState(figure)
    expect(buttons[1].disabled).toBe(false)

    figure.querySelector('div.ag-container-preview svg').remove()
    syncBlockToolbarState(figure)
    expect(buttons[1].disabled).toBe(true)

    const bare = document.createElement('figure')
    bare.setAttribute('data-role', 'TABLE')
    document.body.appendChild(bare)
    expect(() => syncBlockToolbarState(bare)).not.toThrow()
    expect(() => syncBlockToolbarState(null)).not.toThrow()
  })

  it('updateFigureExpandNeed funnels the pill sync (the render/insert/vega paths need no new call sites)', () => {
    // 0×0 rects → not laid out → no need verdict, but the pill sync runs.
    const { figure, buttons } = makeDomFigure({ withSvg: false })
    document.body.appendChild(figure)
    updateFigureExpandNeed(figure)
    expect(buttons[1].disabled).toBe(true)

    figure.querySelector('div.ag-container-preview')
      .appendChild(document.createElementNS('http://www.w3.org/2000/svg', 'svg'))
    updateFigureExpandNeed(figure)
    expect(buttons[1].disabled).toBe(false)
  })
})
// END_BLOCK_TOOLBAR_STATE_ASSERTIONS

// START_BLOCK_TOOLBAR_CSS_ASSERTIONS
describe('corner toolbar CSS (C-56 T-005, approved mockup variant C)', () => {
  const css = readFileSync(
    resolve(dirname(fileURLToPath(import.meta.url)), '../../../src/muya/lib/assets/styles/index.css'),
    'utf8'
  )
  const rule = (anchor) => css.split(anchor)[1].split('}')[0]

  it('pins the pill look: absolute top/right 8px, color-mix surface 95% background, 12% fg border, radius 8, padding 2, opacity 0 + 150ms', () => {
    const base = rule('figure.ag-has-expand > div.ag-block-toolbar {')
    expect(base).toContain('position: absolute')
    expect(base).toContain('top: 8px')
    expect(base).toContain('right: 8px')
    expect(base).toContain('display: flex')
    expect(base).toContain('gap: 2px')
    expect(base).toContain('padding: 2px')
    expect(base).toContain('background: color-mix(in srgb, var(--pele-surface) 95%, transparent)')
    expect(base).toContain('border: 1px solid color-mix(in srgb, var(--pele-fg) 12%, transparent)')
    expect(base).toContain('border-radius: 8px')
    expect(base).toContain('opacity: 0')
    expect(base).toContain('transition: opacity 0.15s ease-in-out')
  })

  it('pins the visibility: figure hover and :focus-within reveal, ag-active hides, caret alone never shows', () => {
    expect(css).toContain('figure.ag-has-expand:hover > div.ag-block-toolbar,')
    const reveal = rule('figure.ag-has-expand > div.ag-block-toolbar:focus-within {')
    expect(reveal).toContain('opacity: 1')
    const active = rule('figure.ag-active > div.ag-block-toolbar {')
    expect(active).toContain('display: none')
  })

  it('pins the buttons: --pele-muted at rest, --pele-fg on a 10% fg tint on hover/focus-visible, disabled dimmed', () => {
    const base = rule('figure.ag-has-expand > div.ag-block-toolbar > button.ag-block-toolbar-btn {')
    expect(base).toContain('display: inline-flex')
    expect(base).toContain('border: 0')
    expect(base).toContain('background: transparent')
    expect(base).toContain('color: var(--pele-muted)')
    expect(base).toContain('padding: 4px 8px')
    expect(base).toContain('border-radius: 6px')
    expect(base).toContain('font: 500 12px/1.4 -apple-system, system-ui, sans-serif')

    expect(css).toContain('figure.ag-has-expand > div.ag-block-toolbar > button.ag-block-toolbar-btn:hover:not(:disabled),')
    const hover = rule('figure.ag-has-expand > div.ag-block-toolbar > button.ag-block-toolbar-btn:focus-visible {')
    expect(hover).toContain('color: var(--pele-fg)')
    expect(hover).toContain('background: color-mix(in srgb, var(--pele-fg) 10%, transparent)')

    const disabled = rule('figure.ag-has-expand > div.ag-block-toolbar > button.ag-block-toolbar-btn:disabled {')
    expect(disabled).toContain('cursor: default')
  })

  it('pins the variant-C label reveal (hidden span, shown on the button\u2019s own hover) and the expand need gate', () => {
    const labelHidden = rule('figure.ag-has-expand > div.ag-block-toolbar > button.ag-block-toolbar-btn > span {')
    expect(labelHidden).toContain('display: none')
    expect(css).toContain('figure.ag-has-expand > div.ag-block-toolbar > button.ag-block-toolbar-btn:hover:not(:disabled) > span,')

    const gate = rule('figure.ag-has-expand > div.ag-block-toolbar > button.ag-block-toolbar-expand {')
    expect(gate).toContain('display: none')
    const open = rule('figure.ag-expand-needed > div.ag-block-toolbar > button.ag-block-toolbar-expand {')
    expect(open).toContain('display: inline-flex')
  })
})
// END_BLOCK_TOOLBAR_CSS_ASSERTIONS
