// FILE: tests/renderer/muya/block-viewer.test.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Pin the shared fullscreen block viewer (C-34 R2.2 + C-39 T2): open/close lifecycle, Esc close with focus restore, panzoom destruction, read-only table clones, hover/caret toolbar visibility, wheel/keyboard zoom routing, and the focus trap.
//   SCOPE: BlockViewer in src/muya/lib/ui/blockViewer/index.js with @panzoom/panzoom mocked.
//   DEPENDS: src/muya/lib/ui/blockViewer, src/muya/lib/eventHandler/event (real EventCenter), Vitest + jsdom.
//   LINKS: .grace/changes/active/C-34 T-002; .grace/changes/active/C-39 T2; .grace/verification/runtime.xml V-M-012 scenario-19; START_BLOCK_VIEWER_*.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   TRANSLATIONS - en strings for the viewer keys, injected as muya.options.t.
//   makePanzoomDouble - @panzoom/panzoom instance double re-installed in beforeEach (the global resetAllMocks wipes implementations).
//   createHarness - muya stub + real EventCenter + a BlockViewer instance; returns { muya, viewer, container }.
//   createMermaidFigure - figure > div.ag-container-preview.ag-mermaid-preview with a hoisted <style> and an SVG.
//   createTable - table.ag-paragraph with contenteditable cells, a drag handler, a tool bar, and a caret span id.
//   lastPanzoom - the most recently constructed panzoom double.
//   keydown - dispatches a bubbling cancelable keydown on an element.
//   viewer - the BlockViewer under test for the current case (destroyed in afterEach).
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - 2026-10-15 C-34 R2.2/C-39 T2: open/close lifecycle, Esc + focus restore, panzoom destroy, table clone sanitization, hover/caret toolbar, ctrl+wheel vs plain wheel, +/−/0/1 keys, Tab focus trap. These cases fail without the blockViewer module.
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

describe('block viewer (C-34 R2.2 + C-39 T2)', () => {
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

  it('hovering a table shows the expand toolbar; moving away hides it after the grace delay', () => {
    const { muya, viewer: v, container } = createHarness()
    viewer = v
    const { table, td } = createTable(container)
    const paragraph = document.createElement('p')
    container.appendChild(paragraph)

    td.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
    expect(v.toolbarEl.classList.contains('ag-block-viewer-toolbar-visible')).toBe(true)
    expect(v.toolbarEl.style.top).not.toBe('')
    expect(v.toolbarEl.style.left).not.toBe('')
    // Toolbar never steals the table from the DOM.
    expect(table.isConnected).toBe(true)

    paragraph.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
    // Grace period keeps it visible so the pointer can reach the toolbar…
    expect(v.toolbarEl.classList.contains('ag-block-viewer-toolbar-visible')).toBe(true)
    vi.advanceTimersByTime(250)
    expect(v.toolbarEl.classList.contains('ag-block-viewer-toolbar-visible')).toBe(false)
  })

  it('clicking the expand button opens the viewer for the hovered table', () => {
    const { viewer: v, container } = createHarness()
    viewer = v
    const { td } = createTable(container)

    td.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
    v.expandBtn.click()

    expect(v.viewerEl.classList.contains('ag-block-viewer-open')).toBe(true)
    expect(v.titleEl.textContent).toBe('Table')
  })

  it('the toolbar follows the caret into a table via selectionChange', () => {
    const { muya, viewer: v, container } = createHarness()
    viewer = v
    const { cellSpan } = createTable(container)

    muya.eventCenter.dispatch('selectionChange', { start: { key: cellSpan.id } })
    expect(v.toolbarEl.classList.contains('ag-block-viewer-toolbar-visible')).toBe(true)

    const outside = document.createElement('span')
    outside.id = 'para-key-1'
    container.appendChild(outside)
    muya.eventCenter.dispatch('selectionChange', { start: { key: outside.id } })
    vi.advanceTimersByTime(250)
    expect(v.toolbarEl.classList.contains('ag-block-viewer-toolbar-visible')).toBe(false)
  })

  it('the toolbar anchors to the mermaid preview when the caret edits its source', () => {
    const { muya, viewer: v, container } = createHarness()
    viewer = v
    const { figure } = createMermaidFigure(container)
    const pre = document.createElement('pre')
    pre.setAttribute('data-role', 'mermaid')
    const srcSpan = document.createElement('span')
    srcSpan.id = 'mermaid-src-key'
    pre.appendChild(srcSpan)
    figure.appendChild(pre)

    muya.eventCenter.dispatch('selectionChange', { start: { key: srcSpan.id } })
    expect(v.toolbarEl.classList.contains('ag-block-viewer-toolbar-visible')).toBe(true)
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

  it('destroy removes the overlay and toolbar and stops reacting to events', () => {
    const { muya, viewer: v, container } = createHarness()
    viewer = v
    const { cellSpan } = createTable(container)
    const viewerEl = v.viewerEl
    const toolbarEl = v.toolbarEl

    v.destroy()

    expect(viewerEl.isConnected).toBe(false)
    expect(toolbarEl.isConnected).toBe(false)

    // Neither hover nor caret events revive the toolbar after destroy.
    cellSpan.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
    muya.eventCenter.dispatch('selectionChange', { start: { key: cellSpan.id } })
    expect(toolbarEl.classList.contains('ag-block-viewer-toolbar-visible')).toBe(false)
  })
})
