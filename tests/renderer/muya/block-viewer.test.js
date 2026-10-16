// FILE: tests/renderer/muya/block-viewer.test.js
// VERSION: 2.3.0
// START_MODULE_CONTRACT
//   PURPOSE: Pin the shared fullscreen block viewer (C-34 R2.2 + C-39 T2 + C-51 T-006/T-010/T-014): open/close lifecycle, Esc close with focus restore (including the live-button re-assert when a re-render replaces the figure during the window), panzoom destruction, read-only table clones, block resolution from preview/table/figure elements (the persistent expand button dispatches the figure), wheel/keyboard zoom routing, the focus trap, the fit maths WITHOUT the 1:1 cap (small content scales up, big scales down, clamps), and the muya-options-rerender theme refresh (poll through the loading placeholder, changed-content token gate — the pipeline re-inserts the last-good old-theme svg synchronously before the async re-draw, id lookups never resolve the viewer's own clone, the captured figure element as fallback anchor, re-clone in place keeping the panzoom transform, figure-id fallback, table refresh, closed-viewer no-op, timeout keeps the last clone).
//   SCOPE: BlockViewer in src/muya/lib/ui/blockViewer/index.js with @panzoom/panzoom mocked.
//   DEPENDS: src/muya/lib/ui/blockViewer, src/muya/lib/eventHandler/event (real EventCenter), Vitest + jsdom.
//   LINKS: .grace/changes/active/C-34 T-002; .grace/changes/active/C-39 T2; .grace/changes/active/C-51 T-006, T-010 and T-014; .grace/verification/runtime.xml V-M-012 scenario-19 and scenario-60; .grace/verification/runtime.xml V-M-011 scenario-64; START_BLOCK_VIEWER_*.
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
//   makeSvg - namespace-correct svg with the given id (theme-refresh re-render double).
//   stubLayout - fixed clientWidth/Height on the stage and scrollWidth/Height on the canvas (fit-maths cases).
//   lastPanzoom - the most recently constructed panzoom double.
//   keydown - dispatches a bubbling cancelable keydown on an element.
//   viewer - the BlockViewer under test for the current case (destroyed in afterEach).
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v2.3.0 - 2026-10-17 C-51 T-014 gate round: two
//   resolution bugs and one race fixed in the theme refresh (blockViewer
//   v3.1.0). New cases: (1) an id lookup must NEVER resolve the viewer's
//   own clone — the clone shares the preview div id (cloneNode) and the
//   svg id (on purpose, mermaid scoped styles); a viewBox fixture makes
//   the clone's serialization differ from the live source so a
//   self-clone refresh would be visible (svg-1 stays in the canvas)
//   instead of silently token-blocked; (2) unchanged content must not
//   end the poll — the mermaid pipeline re-inserts the byte-identical
//   last-good old-theme svg synchronously during a theme re-render
//   before the async re-draw lands (the chromium e2e race); (3) content
//   arriving later inside the same figure element resolves through the
//   captured figure element when no figure id exists. The two
//   orchestrator-failing cases (replaced preview via figure id; table
//   refresh from the re-rendered table) stay byte-identical — they were
//   right, the resolution was wrong.
//   v2.2.0 - 2026-10-17 C-51 T-014: fit-maths cases
//   (small → >1 with the exact min() value, big → <1, MAX/MIN clamps,
//   fitToScreen wiring) fail on main's Math.min(..., 1) cap; the
//   muya-options-rerender cases pin the theme refresh — poll waits for
//   diagram content, re-clone keeps the panzoom transform (direct call),
//   replaced-preview resolution through the figure id, the table refresh
//   with sanitization, the closed-viewer no-op and the timeout that
//   keeps the last clone.
//   v2.1.0 - 2026-10-16 C-51 T-010: the close() re-asserts
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

// C-51 T-014: a re-rendered diagram SVG (mermaid pipeline insert).
const makeSvg = (id) => {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.id = id
  return svg
}

// C-51 T-014: fixed layout for the fit-maths cases — jsdom measures 0×0.
const stubLayout = (viewer, { stageW, stageH, contentW, contentH }) => {
  Object.defineProperty(viewer.stage, 'clientWidth', { configurable: true, get: () => stageW })
  Object.defineProperty(viewer.stage, 'clientHeight', { configurable: true, get: () => stageH })
  Object.defineProperty(viewer.canvas, 'scrollWidth', { configurable: true, get: () => contentW })
  Object.defineProperty(viewer.canvas, 'scrollHeight', { configurable: true, get: () => contentH })
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

// START_BLOCK_VIEWER_T014_ASSERTIONS
describe('viewer polish (C-51 T-014: fit up, theme refresh)', () => {
  it('fit scales small content UP: a 200×100 clone in a 1000×600 stage fits at min(availW/w, availH/h)', () => {
    const { viewer: v, container } = createHarness()
    viewer = v
    const { preview } = createMermaidFigure(container)
    v.openFromElement(preview)
    stubLayout(v, { stageW: 1000, stageH: 600, contentW: 200, contentH: 100 })

    // min((1000-32)/200, (600-32)/100) = min(4.84, 5.68) — no 1:1 cap.
    expect(v.computeFitScale()).toBeCloseTo(4.84, 6)
    // The Fit button drives panzoom with the same scale (not 1).
    const panzoom = lastPanzoom()
    v.fitToScreen()
    expect(panzoom.zoom).toHaveBeenLastCalledWith(v.computeFitScale(), { animate: false })
    expect(v.computeFitScale()).toBeGreaterThan(1)
  })

  it('fit keeps scaling big content DOWN as before and clamps to [MIN_SCALE, MAX_SCALE]', () => {
    const { viewer: v, container } = createHarness()
    viewer = v
    const { preview } = createMermaidFigure(container)
    v.openFromElement(preview)

    stubLayout(v, { stageW: 1000, stageH: 600, contentW: 2000, contentH: 1200 })
    expect(v.computeFitScale()).toBeCloseTo(Math.min(968 / 2000, 568 / 1200), 6)
    expect(v.computeFitScale()).toBeLessThan(1)

    // A tiny clone would zoom 56×; the MAX_SCALE clamp holds it at 8.
    stubLayout(v, { stageW: 1000, stageH: 600, contentW: 10, contentH: 10 })
    expect(v.computeFitScale()).toBe(8)

    // A stage smaller than the padding goes to the MIN_SCALE clamp, not 0.
    stubLayout(v, { stageW: 20, stageH: 20, contentW: 500, contentH: 500 })
    expect(v.computeFitScale()).toBe(0.05)
  })

  it('an options re-render (theme switch) re-clones the live preview and dispatches muya-block-viewer-refreshed', () => {
    const { muya, viewer: v, container } = createHarness()
    viewer = v
    const refreshed = vi.fn()
    muya.eventCenter.subscribe('muya-block-viewer-refreshed', refreshed)
    const { preview } = createMermaidFigure(container)
    v.openFromElement(preview)
    expect(v.canvas.querySelector('svg').id).toBe('svg-1')

    // The re-render patched the preview in place (mermaid insert path):
    // the loading placeholder was replaced by a NEW svg.
    preview.querySelector('svg').remove()
    preview.appendChild(makeSvg('svg-1-ink'))
    muya.eventCenter.dispatch('muya-options-rerender')

    // The first poll tick is immediate (setTimeout 0).
    vi.advanceTimersByTime(1)
    expect(v.canvas.querySelector('svg').id).toBe('svg-1-ink')
    expect(refreshed).toHaveBeenCalledWith({ kind: 'diagram' })
    // The live source reference follows the block.
    expect(v.sourceEl).toBe(preview)
  })

  it('the refresh POLLS: it waits for the re-rendered diagram content instead of cloning the loading placeholder', () => {
    const { muya, viewer: v, container } = createHarness()
    viewer = v
    const { preview } = createMermaidFigure(container)
    v.openFromElement(preview)

    // The full re-render dropped the SVG: the preview shows the loading
    // text — the poll must NOT clone it yet (the old clone stays).
    preview.querySelector('svg').remove()
    muya.eventCenter.dispatch('muya-options-rerender')
    vi.advanceTimersByTime(50)
    expect(v.canvas.querySelector('svg').id).toBe('svg-1')

    // The pipeline insert lands ~250 ms later — the next poll tick picks it up.
    preview.appendChild(makeSvg('svg-1-after-debounce'))
    vi.advanceTimersByTime(150)
    expect(v.canvas.querySelector('svg').id).toBe('svg-1-after-debounce')
  })

  it('a preview ELEMENT replaced by the re-render resolves through the figure id', () => {
    const { muya, viewer: v, container } = createHarness()
    viewer = v
    const { figure, preview } = createMermaidFigure(container)
    figure.id = 'fig-re-render'
    v.openFromElement(figure)

    // snabbdom replaced the preview element entirely; the captured one is
    // gone (its id resolves to nothing) — the figure id still resolves.
    preview.remove()
    const fresh = document.createElement('div')
    fresh.className = 'ag-container-preview'
    fresh.appendChild(makeSvg('svg-reborn'))
    figure.appendChild(fresh)

    muya.eventCenter.dispatch('muya-options-rerender')
    vi.advanceTimersByTime(1)
    expect(v.canvas.querySelector('svg').id).toBe('svg-reborn')
    expect(v.sourceFigureId).toBe('fig-re-render')
  })

  it('the refresh keeps the panzoom transform: no zoom/pan call touches the canvas during the swap', () => {
    const { viewer: v, container } = createHarness()
    viewer = v
    const { preview } = createMermaidFigure(container)
    v.openFromElement(preview)
    const panzoom = lastPanzoom()
    panzoom.zoom.mockClear()
    panzoom.pan.mockClear()
    panzoom.zoomToPoint.mockClear()

    // Direct call — deterministic, no deferred-fit timer in between.
    v.refreshCloneFrom(preview)

    expect(panzoom.zoom).not.toHaveBeenCalled()
    expect(panzoom.pan).not.toHaveBeenCalled()
    expect(panzoom.zoomToPoint).not.toHaveBeenCalled()
    expect(v.canvas.style.transform).toBe('')
    expect(v.canvas.querySelector('svg')).not.toBeNull()
  })

  it('a table clone refreshes from the re-rendered table and stays sanitized', () => {
    const { muya, viewer: v, container } = createHarness()
    viewer = v
    const { figure, table } = createTableFigure(container)
    v.openFromElement(figure)

    const fresh = document.createElement('table')
    fresh.id = 'tbl-refreshed'
    fresh.className = 'ag-paragraph'
    const tbody = document.createElement('tbody')
    const row = document.createElement('tr')
    const cell = document.createElement('td')
    cell.setAttribute('contenteditable', 'true')
    cell.textContent = 'refreshed cell'
    row.appendChild(cell)
    tbody.appendChild(row)
    fresh.appendChild(tbody)
    table.remove()
    figure.appendChild(fresh)

    muya.eventCenter.dispatch('muya-options-rerender')
    vi.advanceTimersByTime(1)

    const clone = v.canvas.querySelector('table')
    expect(clone).not.toBeNull()
    expect(clone.textContent).toContain('refreshed cell')
    expect(clone.querySelector('[contenteditable]')).toBeNull()
    expect(v.sourceEl).toBe(fresh)
  })

  it('an id lookup never resolves the viewer clone itself — the shared ids must not feed the refresh', () => {
    const { muya, viewer: v, container } = createHarness()
    viewer = v
    const { figure, preview } = createMermaidFigure(container)
    // A viewBox makes cloneDiagramPreview override the canvas clone's
    // inline sizing, so the clone's serialization DIFFERS from the live
    // source the token was taken from — a self-clone refresh would be
    // visible (svg-1 re-cloned into the canvas) instead of silently
    // blocked by the changed-content gate.
    preview.querySelector('svg').setAttribute('viewBox', '0 0 100 50')
    v.openFromElement(preview)

    // The re-render replaced the preview element and the figure carries
    // no id: the ONLY element with the preview id left in the document is
    // the viewer's own clone (cloneNode keeps the div id; the svg id is
    // shared on purpose so mermaid's scoped styles apply to the clone).
    preview.remove()
    const fresh = document.createElement('div')
    fresh.className = 'ag-container-preview'
    fresh.appendChild(makeSvg('svg-reborn'))
    figure.appendChild(fresh)

    muya.eventCenter.dispatch('muya-options-rerender')
    vi.advanceTimersByTime(1)
    // Without the overlay exclusion the poll re-clones its own clone and
    // the canvas keeps svg-1 forever.
    expect(v.canvas.querySelector('svg').id).toBe('svg-reborn')
    expect(v.sourceEl).toBe(fresh)
  })

  it('the poll waits for CHANGED content — the pipeline last-good re-insert must not end it', () => {
    const { muya, viewer: v, container } = createHarness()
    viewer = v
    const refreshed = vi.fn()
    muya.eventCenter.subscribe('muya-block-viewer-refreshed', refreshed)
    const { preview } = createMermaidFigure(container)
    v.openFromElement(preview)

    // A theme re-render: the mermaid pipeline synchronously re-inserts
    // the LAST-GOOD svg — byte-identical old-theme content — before the
    // async re-draw lands. The poll must not clone it and stop.
    const same = preview.querySelector('svg').cloneNode(true)
    preview.querySelector('svg').remove()
    preview.appendChild(same)
    muya.eventCenter.dispatch('muya-options-rerender')
    vi.advanceTimersByTime(400)
    expect(refreshed).not.toHaveBeenCalled()
    expect(v.canvas.querySelector('svg').id).toBe('svg-1')

    // The async re-draw lands with the new theme: the next tick picks it up.
    preview.querySelector('svg').remove()
    preview.appendChild(makeSvg('svg-1-ink'))
    vi.advanceTimersByTime(200)
    expect(refreshed).toHaveBeenCalledOnce()
    expect(v.canvas.querySelector('svg').id).toBe('svg-1-ink')
  })

  it('content arriving later inside the same figure element resolves through the captured figure', () => {
    const { muya, viewer: v, container } = createHarness()
    viewer = v
    const refreshed = vi.fn()
    muya.eventCenter.subscribe('muya-block-viewer-refreshed', refreshed)
    const { figure, preview } = createMermaidFigure(container)
    v.openFromElement(preview)

    // The re-render dropped the old preview (id resolves to nothing —
    // only the excluded viewer clone holds it) and the figure has no id;
    // the replacement has not landed yet.
    preview.remove()
    muya.eventCenter.dispatch('muya-options-rerender')
    vi.advanceTimersByTime(400)
    expect(refreshed).not.toHaveBeenCalled()
    expect(v.canvas.querySelector('svg').id).toBe('svg-1')

    // The re-rendered preview arrives inside the SAME figure element:
    // the poll resolves it through the figure element captured at open.
    const fresh = document.createElement('div')
    fresh.className = 'ag-container-preview'
    fresh.appendChild(makeSvg('svg-live-2'))
    figure.appendChild(fresh)
    vi.advanceTimersByTime(200)
    expect(refreshed).toHaveBeenCalledOnce()
    expect(v.canvas.querySelector('svg').id).toBe('svg-live-2')
  })

  it('a closed viewer ignores the re-render event, and a block that never comes back keeps the last clone (timeout)', () => {
    const { muya, viewer: v, container } = createHarness()
    viewer = v
    const refreshed = vi.fn()
    muya.eventCenter.subscribe('muya-block-viewer-refreshed', refreshed)
    const { figure, preview } = createMermaidFigure(container)
    v.openFromElement(preview)
    v.close({ restoreFocus: false })
    refreshed.mockClear()

    muya.eventCenter.dispatch('muya-options-rerender')
    vi.advanceTimersByTime(500)
    expect(refreshed).not.toHaveBeenCalled()
    expect(v.refreshTimer).toBeNull()

    // Reopen, then the re-render DELETES the block: the poll runs out its
    // budget and the last clone stays instead of blanking.
    v.openFromElement(preview)
    figure.remove()
    muya.eventCenter.dispatch('muya-options-rerender')
    vi.advanceTimersByTime(10200)
    expect(v.canvas.querySelector('svg')).not.toBeNull()
    expect(v.refreshTimer).toBeNull()
  })
})
// END_BLOCK_VIEWER_T014_ASSERTIONS
