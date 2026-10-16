// FILE: tests/renderer/muya/block-viewer.test.js
// VERSION: 2.1.0
// START_MODULE_CONTRACT
//   PURPOSE: Pin the shared fullscreen block viewer (C-34 R2.2 + C-39 T2 + C-51 T-006/T-010): open/close lifecycle, Esc close with focus restore (including the live-button re-assert when a re-render replaces the figure during the window), panzoom destruction, read-only table clones, block resolution from preview/table/figure elements (the persistent expand button dispatches the figure), wheel/keyboard zoom routing, and the focus trap.
//   SCOPE: BlockViewer in src/muya/lib/ui/blockViewer/index.js with @panzoom/panzoom mocked.
//   DEPENDS: src/muya/lib/ui/blockViewer, src/muya/lib/eventHandler/event (real EventCenter), Vitest + jsdom.
//   LINKS: .grace/changes/active/C-34 T-002; .grace/changes/active/C-39 T2; .grace/changes/active/C-51 T-006 and T-010; .grace/verification/runtime.xml V-M-012 scenario-19 and scenario-60; START_BLOCK_VIEWER_*.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   TRANSLATIONS - en strings for the viewer keys, injected as muya.options.t.
//   makePanzoomDouble - @panzoom/panzoom instance double re-installed in beforeEach (the global resetAllMocks wipes implementations).
//   createHarness - muya stub + real EventCenter + a BlockViewer instance; returns { muya, viewer, container }.
//   createMermaidFigure - figure[data-role=MERMAID] > div.ag-container-preview.ag-mermaid-preview with a hoisted <style> and an SVG.
//   createDiagramFigure - figure[data-role=<role>] > div.ag-container-preview with an svg (flowchart/sequence/vega) or an img (plantuml).
//   createTableFigure - figure[data-role=TABLE] wrapping a table.ag-paragraph (the expand button dispatches figures).
//   createTable - bare table.ag-paragraph with contenteditable cells, a drag handler, a tool bar, and a caret span id.
//   lastPanzoom - the most recently constructed panzoom double.
//   keydown - dispatches a bubbling cancelable keydown on an element.
//   viewer - the BlockViewer under test for the current case (destroyed in afterEach).
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v2.1.0 - 2026-10-16 C-51 T-010: the close() re-asserts
//   resolve the LIVE expand button from returnFocusFigureId — new case
//   replaces the figure's button inside the 0/50 ms window and expects
//   the replacement focused (fails against the captured-element version,
//   whose focus() on the detached node was a silent no-op).
//   v2.0.1 - 2026-10-16 C-51 T-006 review: added the role-gate
//   case — math (KaTeX svg) and html (img) previews never resolve, on
//   either the figure path or the Cmd/Ctrl+click preview path (the first
//   draft accepted them via the content-only check).
//   v2.0.0 - 2026-10-16 C-51 T-006: the hover/caret toolbar is
//   gone (replaced by the persistent per-block expand button); the toolbar
//   cases now pin the generalized block resolution — openFromElement
//   accepts the FIGURE the button dispatches, resolves all five diagram
//   roles (svg content, or an img for plantuml) and the table figure
//   downward, and refuses figures whose preview has no rendered content.
//   The remaining viewer cases (open/clone/Esc/panzoom/keys/trap/destroy)
//   are unchanged from v1.0.0.
//   v1.0.0 - 2026-10-15 C-34 R2.2/C-39 T2: open/close lifecycle, Esc + focus restore, panzoom destroy, table clone sanitization, hover/caret toolbar, ctrl+wheel vs plain wheel, +/−/0/1 keys, Tab focus trap.
// END_CHANGE_SUMMARY

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Panzoom from '@panzoom/panzoom'
import EventCenter from 'muya/lib/eventHandler/event'
import BlockViewer from 'muya/lib/ui/blockViewer'

vi.mock('@panzoom/panzoom', () => {
  return { default: vi.fn() }
})

const TRANSLATIONS = {
  'blockViewer.diagram': 'Diagram',
  'blockViewer.table': 'Table',
  'blockViewer.expand': 'Expand',
  'blockViewer.close': 'Close',
  'blockViewer.zoomIn': 'Zoom In',
  'blockViewer.zoomOut': 'Zoom Out',
  'blockViewer.fit': 'Fit to Screen',
  'blockViewer.actualSize': '100%'
}

// START_BLOCK_VIEWER_TEST_DOUBLES
const makePanzoomDouble = () => ({
  zoom: vi.fn(),
  pan: vi.fn(),
  zoomToPoint: vi.fn(),
  zoomIn: vi.fn(),
  zoomOut: vi.fn(),
  zoomWithWheel: vi.fn(),
  reset: vi.fn(),
  getScale: vi.fn(() => 1),
  getPan: vi.fn(() => ({ x: 0, y: 0 })),
  destroy: vi.fn()
})

const lastPanzoom = () => {
  const results = Panzoom.mock.results
  return results.length ? results[results.length - 1].value : null
}

const createHarness = () => {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const eventCenter = new EventCenter()
  const muya = {
    container,
    eventCenter,
    options: { t: (key) => TRANSLATIONS[key] || key }
  }
  const viewer = new BlockViewer(muya)
  // Muya.use would do this: this[Plugin.pluginName] = new Plugin(this)
  muya.blockViewer = viewer
  return { muya, viewer, container }
}

const createMermaidFigure = (container) => {
  const figure = document.createElement('figure')
  figure.className = 'ag-container-block'
  figure.setAttribute('data-role', 'MERMAID')
  const preview = document.createElement('div')
  preview.id = 'preview-1'
  preview.className = 'ag-container-preview ag-mermaid-preview'
  const style = document.createElement('style')
  style.textContent = '#svg-1 .node { fill: red }'
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.id = 'svg-1'
  const node = document.createElementNS('http://www.w3.org/2000/svg', 'g')
  node.setAttribute('class', 'node')
  svg.appendChild(node)
  preview.appendChild(style)
  preview.appendChild(svg)
  figure.appendChild(preview)
  container.appendChild(figure)
  return { figure, preview, svg }
}

// C-51 T-006: the expand button dispatches the FIGURE, so resolution must
// find the preview inside it. flowchart/sequence/vega-lite previews hold an
// svg; plantuml renders an <img>.
const createDiagramFigure = (container, role, content = 'svg') => {
  const figure = document.createElement('figure')
  figure.className = 'ag-container-block'
  figure.setAttribute('data-role', role)
  const preview = document.createElement('div')
  preview.className = 'ag-container-preview'
  if (content === 'img') {
    const img = document.createElement('img')
    img.setAttribute('src', 'https://www.plantuml.com/plantuml/svg/~1x')
    preview.appendChild(img)
  } else {
    preview.appendChild(document.createElementNS('http://www.w3.org/2000/svg', 'svg'))
  }
  figure.appendChild(preview)
  container.appendChild(figure)
  return { figure, preview }
}

const createTableFigure = (container) => {
  const { table, td, cellSpan } = createTable(container)
  const figure = document.createElement('figure')
  figure.setAttribute('data-role', 'TABLE')
  container.replaceChild(figure, table)
  figure.appendChild(table)
  return { figure, table, td, cellSpan }
}

const createTable = (container) => {
  const table = document.createElement('table')
  table.id = 'tbl-1'
  table.className = 'ag-paragraph'
  const thead = document.createElement('thead')
  const headRow = document.createElement('tr')
  const th = document.createElement('th')
  th.id = 'th-1'
  th.setAttribute('contenteditable', 'true')
  th.textContent = 'Header'
  headRow.appendChild(th)
  thead.appendChild(headRow)
  const tbody = document.createElement('tbody')
  const row = document.createElement('tr')
  const td = document.createElement('td')
  td.id = 'td-1'
  td.setAttribute('contenteditable', 'true')
  const dragBar = document.createElement('span')
  dragBar.className = 'ag-drag-handler left'
  td.appendChild(dragBar)
  const cellSpan = document.createElement('span')
  cellSpan.id = 'cell-key-1'
  cellSpan.className = 'ag-cell-content'
  cellSpan.textContent = 'cell'
  td.appendChild(cellSpan)
  row.appendChild(td)
  tbody.appendChild(row)
  // Synthetic tool bar inside the table — the sanitizer must drop it.
  const toolBar = document.createElement('div')
  toolBar.className = 'ag-tool-bar ag-tool-table'
  table.appendChild(toolBar)
  table.appendChild(thead)
  table.appendChild(tbody)
  container.appendChild(table)
  return { table, td, cellSpan }
}

const keydown = (el, init) => {
  const event = new KeyboardEvent('keydown', {
    bubbles: true,
    cancelable: true,
    ...init
  })
  el.dispatchEvent(event)
  return event
}
// END_BLOCK_VIEWER_TEST_DOUBLES

let viewer

beforeEach(() => {
  vi.useFakeTimers()
  // The global afterEach (tests/renderer/setup.ts) resets mock
  // implementations — re-install the constructor double each test.
  Panzoom.mockImplementation(makePanzoomDouble)
})

afterEach(() => {
  vi.useRealTimers()
  if (viewer) {
    viewer.destroy()
    viewer = null
  }
  document.body.innerHTML = ''
})

describe('block viewer (C-34 R2.2 + C-39 T2 + C-51 T-006)', () => {
  it('opens a mermaid diagram from the muya-block-viewer event and clones the SVG + hoisted style', () => {
    const { muya, viewer: v, container } = createHarness()
    viewer = v
    const { preview, svg } = createMermaidFigure(container)

    muya.eventCenter.dispatch('muya-block-viewer', { element: preview })

    expect(v.viewerEl.classList.contains('ag-block-viewer-open')).toBe(true)
    expect(v.titleEl.textContent).toBe('Diagram')
    // The clone carries the SVG and the hoisted mermaid <style> (CSP path).
    expect(v.canvas.querySelector('svg')).not.toBeNull()
    expect(v.canvas.querySelector('svg g.node')).not.toBeNull()
    expect(v.canvas.querySelector('div.ag-container-preview > style')).not.toBeNull()
    // No re-render / no move: the live preview keeps its SVG.
    expect(preview.contains(svg)).toBe(true)
    // Panzoom was constructed on the canvas element.
    expect(Panzoom).toHaveBeenCalledWith(v.canvas, expect.anything())
  })

  it('Esc closes, destroys panzoom, and restores focus to the previously focused element', () => {
    const { muya, viewer: v, container } = createHarness()
    viewer = v
    const origin = document.createElement('div')
    origin.tabIndex = 0
    document.body.appendChild(origin)
    origin.focus()
    expect(document.activeElement).toBe(origin)

    const { preview } = createMermaidFigure(container)
    muya.eventCenter.dispatch('muya-block-viewer', { element: preview })
    const panzoom = lastPanzoom()
    expect(panzoom).not.toBeNull()
    // The stage takes focus while the viewer is open.
    expect(document.activeElement).toBe(v.stage)

    const event = keydown(v.stage, { key: 'Escape' })
    expect(event.defaultPrevented).toBe(true)
    expect(v.viewerEl.classList.contains('ag-block-viewer-open')).toBe(false)
    expect(panzoom.destroy).toHaveBeenCalledOnce()
    expect(v.canvas.querySelector('svg')).toBeNull()
    expect(document.activeElement).toBe(origin)
  })

  it('Esc restore re-resolves the LIVE expand button — a re-render inside the window must not lose the focus', () => {
    const { viewer: v, container } = createHarness()
    viewer = v
    const figure = document.createElement('figure')
    figure.id = 'fig-live'
    figure.setAttribute('data-role', 'MERMAID')
    const preview = document.createElement('div')
    preview.className = 'ag-container-preview'
    preview.appendChild(document.createElementNS('http://www.w3.org/2000/svg', 'svg'))
    const button = document.createElement('button')
    button.className = 'ag-block-expand'
    figure.appendChild(preview)
    figure.appendChild(button)
    container.appendChild(figure)

    button.focus()
    v.openFromElement(figure)
    expect(v.viewerEl.classList.contains('ag-block-viewer-open')).toBe(true)
    expect(v.returnFocusFigureId).toBe('fig-live')

    keydown(v.stage, { key: 'Escape' })
    expect(v.viewerEl.classList.contains('ag-block-viewer-open')).toBe(false)
    expect(document.activeElement).toBe(button)

    // A re-render while the 0/50 ms re-assert window is open replaces the
    // figure's button (the closing key's keyup could trigger a partial
    // render). The captured element goes detached — the re-asserts must
    // resolve and focus the LIVE button, or the editor keeps the focus.
    const replacement = document.createElement('button')
    replacement.className = 'ag-block-expand'
    button.remove()
    figure.appendChild(replacement)
    expect(document.activeElement).not.toBe(replacement)

    vi.advanceTimersByTime(60)
    expect(document.activeElement).toBe(replacement)
  })

  it('the table clone is read-only: no contenteditable, drag handlers, tool bars, or duplicate ids', () => {
    const { viewer: v, container } = createHarness()
    viewer = v
    const { table } = createTable(container)

    v.openFromElement(table)

    expect(v.viewerEl.classList.contains('ag-block-viewer-open')).toBe(true)
    expect(v.titleEl.textContent).toBe('Table')
    const clone = v.canvas.querySelector('table')
    expect(clone).not.toBeNull()
    expect(clone.querySelector('[contenteditable]')).toBeNull()
    expect(clone.querySelector('.ag-drag-handler')).toBeNull()
    expect(clone.querySelector('.ag-tool-bar')).toBeNull()
    expect(clone.querySelector('[id]')).toBeNull()
    expect(clone.getAttribute('id')).toBeNull()
    // Cell text survives the sanitization.
    expect(clone.textContent).toContain('Header')
    expect(clone.textContent).toContain('cell')
  })

  it('bounds the table scrollport at >=100% and lifts the cap below 100%', () => {
    const { viewer: v, container } = createHarness()
    viewer = v
    const { table } = createTable(container)
    v.openFromElement(table)

    Object.defineProperty(v.stage, 'clientHeight', {
      configurable: true,
      get: () => 600
    })
    v.applyTableScrollCap(2)
    expect(v.canvas.style.maxHeight).toBe('300px')
    v.applyTableScrollCap(0.5)
    expect(v.canvas.style.maxHeight).toBe('')
  })

  it('resolves the diagram FIGURE the expand button dispatches and opens the viewer', () => {
    const { muya, viewer: v, container } = createHarness()
    viewer = v
    const { figure } = createMermaidFigure(container)

    muya.eventCenter.dispatch('muya-block-viewer', { element: figure })

    expect(v.viewerEl.classList.contains('ag-block-viewer-open')).toBe(true)
    expect(v.titleEl.textContent).toBe('Diagram')
    expect(v.canvas.querySelector('svg g.node')).not.toBeNull()
  })

  it('resolves flowchart, sequence and vega-lite figures (svg) and plantuml figures (img)', () => {
    const { viewer: v, container } = createHarness()
    viewer = v
    for (const role of ['FLOWCHART', 'SEQUENCE', 'VEGA-LITE', 'PLANTUML']) {
      v.close({ restoreFocus: false })
      const { figure } = createDiagramFigure(
        container,
        role,
        role === 'PLANTUML' ? 'img' : 'svg'
      )
      expect(v.openFromElement(figure), role).toBe(true)
      expect(v.viewerEl.classList.contains('ag-block-viewer-open')).toBe(true)
      expect(v.titleEl.textContent).toBe('Diagram')
    }
  })

  it('resolves the table figure downward (the button dispatches the figure, not the table)', () => {
    const { viewer: v, container } = createHarness()
    viewer = v
    const { figure } = createTableFigure(container)

    expect(v.openFromElement(figure)).toBe(true)
    expect(v.viewerEl.classList.contains('ag-block-viewer-open')).toBe(true)
    expect(v.titleEl.textContent).toBe('Table')
  })

  it('refuses a diagram figure whose preview has no rendered content yet', () => {
    const { viewer: v, container } = createHarness()
    viewer = v
    const { figure } = createDiagramFigure(container, 'MERMAID', 'svg')
    figure.querySelector('svg').remove()

    expect(v.openFromElement(figure)).toBe(false)
    expect(v.viewerEl.classList.contains('ag-block-viewer-open')).toBe(false)
  })

  it('refuses math and html previews even when they hold an svg/img (role gate)', () => {
    const { viewer: v, container } = createHarness()
    viewer = v
    // KaTeX emits svg for radicals; html previews can contain imgs — the
    // ROLE gate must keep both unviewable (only the five diagram roles are).
    for (const role of ['MULTIPLEMATH', 'HTML']) {
      const kind = role === 'MULTIPLEMATH' ? 'svg' : 'img'
      const { figure, preview } = createDiagramFigure(container, role, kind)
      expect(v.openFromElement(figure), role).toBe(false)
      expect(v.openFromElement(preview), `${role} preview (Cmd/Ctrl+click path)`).toBe(false)
      figure.remove()
    }
    expect(v.viewerEl.classList.contains('ag-block-viewer-open')).toBe(false)
  })

  it('ctrl/cmd wheel zooms via zoomWithWheel; plain wheel pans the diagram canvas', () => {
    const { muya, viewer: v, container } = createHarness()
    viewer = v
    const { preview } = createMermaidFigure(container)
    muya.eventCenter.dispatch('muya-block-viewer', { element: preview })
    const panzoom = lastPanzoom()
    panzoom.zoom.mockClear()
    panzoom.pan.mockClear()

    const pinch = new WheelEvent('wheel', { ctrlKey: true, deltaY: -4, cancelable: true })
    v.stage.dispatchEvent(pinch)
    expect(panzoom.zoomWithWheel).toHaveBeenCalledOnce()
    expect(panzoom.zoomWithWheel).toHaveBeenCalledWith(pinch)

    const scroll = new WheelEvent('wheel', { deltaX: 3, deltaY: 100, cancelable: true })
    v.stage.dispatchEvent(scroll)
    expect(scroll.defaultPrevented).toBe(true)
    expect(panzoom.pan).toHaveBeenCalledWith(-3, -100, { relative: true, animate: false })
  })

  it('keys + − 0 1 drive zoomToPoint and fit-to-screen', () => {
    const { muya, viewer: v, container } = createHarness()
    viewer = v
    const { preview } = createMermaidFigure(container)
    muya.eventCenter.dispatch('muya-block-viewer', { element: preview })
    const panzoom = lastPanzoom()
    panzoom.zoomToPoint.mockClear()
    panzoom.zoom.mockClear()
    panzoom.pan.mockClear()

    keydown(v.stage, { key: '=' })
    expect(panzoom.zoomToPoint).toHaveBeenLastCalledWith(
      1.25,
      expect.objectContaining({ clientX: expect.any(Number), clientY: expect.any(Number) }),
      { animate: false }
    )

    keydown(v.stage, { key: '-' })
    expect(panzoom.zoomToPoint).toHaveBeenLastCalledWith(
      0.8,
      expect.anything(),
      expect.anything()
    )

    keydown(v.stage, { key: '0' })
    expect(panzoom.zoom).toHaveBeenCalled()
    expect(panzoom.pan).toHaveBeenCalled()

    keydown(v.stage, { key: '1' })
    expect(panzoom.zoom).toHaveBeenLastCalledWith(1, { animate: false })
  })

  it('Tab is trapped inside the open viewer', () => {
    const { muya, viewer: v, container } = createHarness()
    viewer = v
    const { preview } = createMermaidFigure(container)
    muya.eventCenter.dispatch('muya-block-viewer', { element: preview })

    const buttons = v.getFocusableElements()
    expect(buttons.length).toBe(5)
    const first = buttons[0]
    const last = buttons[buttons.length - 1]

    last.focus()
    expect(document.activeElement).toBe(last)
    const tab = keydown(last, { key: 'Tab' })
    expect(tab.defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(first)

    keydown(first, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(last)
  })

  it('destroy removes the overlay and stops reacting to muya-block-viewer events', () => {
    const { muya, viewer: v, container } = createHarness()
    viewer = v
    createTableFigure(container)
    const viewerEl = v.viewerEl

    v.destroy()

    expect(viewerEl.isConnected).toBe(false)

    // Dispatching the expand-button event after destroy revives nothing.
    const figure = container.querySelector("figure[data-role='TABLE']")
    muya.eventCenter.dispatch('muya-block-viewer', { element: figure })
    expect(v.viewerEl.classList.contains('ag-block-viewer-open')).toBe(false)
    expect(v.viewerEl.isConnected).toBe(false)
  })
})
