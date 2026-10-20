// FILE: tests/renderer/muya/expand-need.test.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Pin the C-51 T-010 expand-need rules (user decision D-7) — the pure thresholds (diagram drawn ≥ 2 px narrower than its natural size or taller than 600 px; table overflowing its C-39 wrapper by > 1 px or taller than 600 px), the DOM gathering (SVG viewBox / px width attribute / img naturalWidth, percentage widths rejected), the ag-expand-needed class toggle with the BLOCK_EXPAND_NEED log anchor, the render-path sync, and the ONE shared ResizeObserver (observe new figures, unobserve removed ones, release on editor destroy, no crash without ResizeObserver — jsdom).
//   SCOPE: src/muya/lib/parser/render/renderBlock/expandNeed.js only.
//   DEPENDS: muya/lib/parser/render/renderBlock/expandNeed (re-imported per test via vi.resetModules so the module-scoped shared observer is isolated), Vitest + jsdom (no real layout: rects and scroll sizes are monkey-patched).
//   LINKS: .grace/changes/archive/C-51 T-010; .grace/graph/runtime.xml M-012; .grace/verification/runtime.xml V-M-012 scenario-60; tests/renderer/muya/block-expand-button.test.js (the button vnode + CSS); tests/e2e/block-viewer.spec.ts (laid-out behaviour).
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   loadModule - fresh module import (vi.resetModules) so each test owns the shared-observer module state.
//   rect - DOMRect-like factory for the monkey-patched getBoundingClientRect.
//   makeDiagramFigure - figure.ag-has-expand[data-role] > div.ag-container-preview > svg (or img) with patched rects.
//   makeTableFigure - figure[data-role='TABLE'].ag-has-expand > div.ag-table-scroll > table with patched scrollWidth/clientWidth/rect.
//   installFakeResizeObserver - install a global ResizeObserver stub recording observe/unobserve and capturing the callback.
//   debugSpy - console.debug spy for the BLOCK_EXPAND_NEED anchor.
//   readNeedLog - the [Muya][expandNeed][BLOCK_EXPAND_NEED] console.debug calls captured by the active spy.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - 2026-10-16 C-51 T-010: new — every rule and
//   wiring of expandNeed.js. Fails against the pre-T-010 muya (the
//   module does not exist).
// END_CHANGE_SUMMARY

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The module keeps its shared ResizeObserver at module scope — re-import
// per test so state never leaks between cases.
const loadModule = async () => {
  vi.resetModules()
  return import('muya/lib/parser/render/renderBlock/expandNeed')
}

const rect = (x = 0, y = 0, width = 0, height = 0) => ({
  x, y, width, height,
  top: y, bottom: y + height, left: x, right: x + width,
  toJSON () { return this }
})

const makeDiagramFigure = ({
  role = 'MERMAID',
  widthAttr = '700px',
  viewBoxWidth = null,
  img = false,
  renderedWidth = 300,
  renderedHeight = 100,
  previewHeight = 120
} = {}) => {
  const figure = document.createElement('figure')
  figure.id = `fig-${role.toLowerCase()}`
  figure.className = 'ag-has-expand'
  figure.dataset.role = role
  const preview = document.createElement('div')
  preview.className = 'ag-container-preview'
  let content
  if (img) {
    content = document.createElement('img')
    Object.defineProperty(content, 'naturalWidth', { value: 800, configurable: true })
    Object.defineProperty(content, 'complete', { value: true, configurable: true })
  } else {
    content = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    content.setAttribute('width', widthAttr)
    if (viewBoxWidth !== null) {
      Object.defineProperty(content, 'viewBox', {
        value: { baseVal: { width: viewBoxWidth } },
        configurable: true
      })
    }
  }
  content.getBoundingClientRect = () => rect(0, 0, renderedWidth, renderedHeight)
  preview.getBoundingClientRect = () => rect(0, 0, renderedWidth, previewHeight)
  preview.appendChild(content)
  figure.appendChild(preview)
  document.body.appendChild(figure)
  return { figure, preview, content }
}

const makeTableFigure = ({
  scrollWidth = 700,
  clientWidth = 700,
  tableHeight = 100
} = {}) => {
  const figure = document.createElement('figure')
  figure.id = 'fig-table'
  figure.className = 'ag-has-expand'
  figure.dataset.role = 'TABLE'
  const wrapper = document.createElement('div')
  wrapper.className = 'ag-table-scroll'
  const table = document.createElement('table')
  table.getBoundingClientRect = () => rect(0, 0, clientWidth, tableHeight)
  wrapper.appendChild(table)
  figure.appendChild(wrapper)
  document.body.appendChild(figure)
  Object.defineProperty(wrapper, 'scrollWidth', { value: scrollWidth, configurable: true })
  Object.defineProperty(wrapper, 'clientWidth', { value: clientWidth, configurable: true })
  return { figure, wrapper, table }
}

// A global ResizeObserver stub: one shared instance per module load,
// recording observe/unobserve and handing back the live callback.
const installFakeResizeObserver = () => {
  const calls = { observe: [], unobserve: [], instances: [] }
  class FakeResizeObserver {
    constructor (callback) {
      this.callback = callback
      calls.instances.push(this)
    }

    observe (el) { calls.observe.push(el) }

    unobserve (el) { calls.unobserve.push(el) }

    disconnect () {}
  }
  vi.stubGlobal('ResizeObserver', FakeResizeObserver)
  return calls
}

let debugSpy = null
const readNeedLog = () =>
  debugSpy ? debugSpy.mock.calls.filter(([tag]) => String(tag).includes('[Muya][expandNeed][BLOCK_EXPAND_NEED]')) : []

beforeEach(() => {
  debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {})
})

afterEach(() => {
  if (debugSpy) debugSpy.mockRestore()
  debugSpy = null
  vi.unstubAllGlobals()
  vi.resetModules()
  document.body.innerHTML = ''
})

// START_BLOCK_EXPAND_NEED_RULE_ASSERTIONS
describe('expand-need pure rules (C-51 T-010 D-7)', () => {
  it('a diagram drawn narrower than its natural size needs the viewer', async () => {
    const { diagramNeedRule } = await loadModule()
    expect(diagramNeedRule({ renderedWidth: 300, renderedHeight: 100, naturalWidth: 700 })).toBe(true)
  })

  it('a diagram at (or within the 2 px tolerance of) its natural size does not', async () => {
    const { diagramNeedRule } = await loadModule()
    expect(diagramNeedRule({ renderedWidth: 700, renderedHeight: 100, naturalWidth: 700 })).toBe(false)
    expect(diagramNeedRule({ renderedWidth: 699, renderedHeight: 100, naturalWidth: 700 })).toBe(false)
    expect(diagramNeedRule({ renderedWidth: 698, renderedHeight: 100, naturalWidth: 700 })).toBe(false)
    expect(diagramNeedRule({ renderedWidth: 697, renderedHeight: 100, naturalWidth: 700 })).toBe(true)
  })

  it('a preview taller than 600 px needs the viewer even unscaled; 600 exactly does not', async () => {
    const { diagramNeedRule } = await loadModule()
    expect(diagramNeedRule({ renderedWidth: 700, renderedHeight: 601, naturalWidth: 700 })).toBe(true)
    expect(diagramNeedRule({ renderedWidth: 700, renderedHeight: 600, naturalWidth: 700 })).toBe(false)
    // tall wins even when the natural width is unknown
    expect(diagramNeedRule({ renderedWidth: 300, renderedHeight: 601, naturalWidth: 0 })).toBe(true)
  })

  it('a not-laid-out diagram (0×0) never needs the viewer', async () => {
    const { diagramNeedRule } = await loadModule()
    expect(diagramNeedRule({ renderedWidth: 0, renderedHeight: 0, naturalWidth: 900 })).toBe(false)
  })

  it('a table needs the viewer when its wrapper scrolls (> 1 px) or it is taller than 600 px', async () => {
    const { tableNeedRule } = await loadModule()
    expect(tableNeedRule({ scrollWidth: 1200, clientWidth: 700, tableHeight: 100 })).toBe(true)
    // 1 px of rounding noise is tolerated
    expect(tableNeedRule({ scrollWidth: 701, clientWidth: 700, tableHeight: 100 })).toBe(false)
    expect(tableNeedRule({ scrollWidth: 702, clientWidth: 700, tableHeight: 100 })).toBe(true)
    expect(tableNeedRule({ scrollWidth: 700, clientWidth: 700, tableHeight: 601 })).toBe(true)
    expect(tableNeedRule({ scrollWidth: 700, clientWidth: 700, tableHeight: 600 })).toBe(false)
    // a small table never needs it
    expect(tableNeedRule({ scrollWidth: 300, clientWidth: 700, tableHeight: 90 })).toBe(false)
  })
})
// END_BLOCK_EXPAND_NEED_RULE_ASSERTIONS

// START_BLOCK_EXPAND_NEED_DOM_ASSERTIONS
describe('expand-need DOM gathering + class toggle (C-51 T-010)', () => {
  it('a scaled diagram figure gains ag-expand-needed and logs BLOCK_EXPAND_NEED', async () => {
    const { EXPAND_NEEDED_CLASS, updateFigureExpandNeed } = await loadModule()
    const { figure, preview } = makeDiagramFigure({ renderedWidth: 300, widthAttr: '700px' })

    expect(updateFigureExpandNeed(preview)).toBe(true)
    expect(figure.classList.contains(EXPAND_NEEDED_CLASS)).toBe(true)
    expect(readNeedLog()).toHaveLength(1)
    expect(readNeedLog()[0][0]).toContain('[Muya][expandNeed][BLOCK_EXPAND_NEED]')
    // no diagram source / markdown in the payload
    expect(JSON.stringify(readNeedLog()[0][1])).not.toContain('graph')
  })

  it('a small diagram stays class-less and silent', async () => {
    const { EXPAND_NEEDED_CLASS, updateFigureExpandNeed } = await loadModule()
    const { figure, preview } = makeDiagramFigure({ renderedWidth: 700, widthAttr: '700px' })

    expect(updateFigureExpandNeed(preview)).toBe(false)
    expect(figure.classList.contains(EXPAND_NEEDED_CLASS)).toBe(false)
    expect(readNeedLog()).toHaveLength(0)
  })

  it('the natural width prefers the viewBox over the width attribute and rejects percentages', async () => {
    const { updateFigureExpandNeed } = await loadModule()
    // viewBox wins: rendered 300 ≪ viewBox 700 → need, even though the
    // width attribute says 999.
    const viewBox = makeDiagramFigure({ renderedWidth: 300, viewBoxWidth: 700, widthAttr: '999px' })
    expect(updateFigureExpandNeed(viewBox.preview)).toBe(true)
    // width="100%" is the CSS stretch, not a natural size: unscaled and
    // short → no verdict from scaling.
    const percent = makeDiagramFigure({ renderedWidth: 300, widthAttr: '100%' })
    expect(updateFigureExpandNeed(percent.preview)).toBe(false)
  })

  it('a plantuml img compares against naturalWidth', async () => {
    const { updateFigureExpandNeed } = await loadModule()
    const scaled = makeDiagramFigure({ role: 'PLANTUML', img: true, renderedWidth: 300 })
    expect(updateFigureExpandNeed(scaled.preview)).toBe(true)
    const natural = makeDiagramFigure({ role: 'PLANTUML', img: true, renderedWidth: 800 })
    expect(updateFigureExpandNeed(natural.preview)).toBe(false)
  })

  it('a tall diagram preview (height > 600) needs the viewer', async () => {
    const { updateFigureExpandNeed } = await loadModule()
    const tall = makeDiagramFigure({ renderedWidth: 700, widthAttr: '700px', previewHeight: 650 })
    expect(updateFigureExpandNeed(tall.preview)).toBe(true)
  })

  it('an empty preview (nothing rendered yet) never needs the viewer', async () => {
    const { updateFigureExpandNeed } = await loadModule()
    const figure = document.createElement('figure')
    figure.className = 'ag-has-expand'
    figure.dataset.role = 'MERMAID'
    const preview = document.createElement('div')
    preview.className = 'ag-container-preview'
    figure.appendChild(preview)
    document.body.appendChild(figure)
    expect(updateFigureExpandNeed(preview)).toBe(false)
  })

  it('tables route to the wrapper-overflow / tall-table rule', async () => {
    const { EXPAND_NEEDED_CLASS, updateFigureExpandNeed } = await loadModule()
    const overflowing = makeTableFigure({ scrollWidth: 1200, clientWidth: 700 })
    expect(updateFigureExpandNeed(overflowing.figure)).toBe(true)
    expect(overflowing.figure.classList.contains(EXPAND_NEEDED_CLASS)).toBe(true)

    const tall = makeTableFigure({ tableHeight: 650 })
    expect(updateFigureExpandNeed(tall.figure)).toBe(true)

    const small = makeTableFigure({ scrollWidth: 300, clientWidth: 700, tableHeight: 90 })
    expect(updateFigureExpandNeed(small.figure)).toBe(false)
    expect(small.figure.classList.contains(EXPAND_NEEDED_CLASS)).toBe(false)
  })

  it('elements outside a figure resolve to no verdict without crashing', async () => {
    const { updateFigureExpandNeed } = await loadModule()
    const bare = document.createElement('div')
    document.body.appendChild(bare)
    expect(updateFigureExpandNeed(bare)).toBe(false)
    expect(updateFigureExpandNeed(null)).toBe(false)
    expect(readNeedLog()).toHaveLength(0)
  })

  it('the verdict re-evaluates and the class flips with the drawn size (logged per flip only)', async () => {
    const { EXPAND_NEEDED_CLASS, updateFigureExpandNeed } = await loadModule()
    const { figure, preview, content } = makeDiagramFigure({ renderedWidth: 700, widthAttr: '700px' })
    updateFigureExpandNeed(preview)
    expect(figure.classList.contains(EXPAND_NEEDED_CLASS)).toBe(false)

    // The column narrows (viewport resize): the same SVG is now drawn
    // smaller than its natural width.
    content.getBoundingClientRect = () => rect(0, 0, 300, 100)
    expect(updateFigureExpandNeed(preview)).toBe(true)
    expect(figure.classList.contains(EXPAND_NEEDED_CLASS)).toBe(true)

    // Idempotent re-syncs stay silent.
    updateFigureExpandNeed(preview)
    expect(readNeedLog()).toHaveLength(1)
  })
})
// END_BLOCK_EXPAND_NEED_DOM_ASSERTIONS

// START_BLOCK_EXPAND_NEED_SYNC_ASSERTIONS
describe('expand-need sync + shared ResizeObserver (C-51 T-010)', () => {
  it('syncExpandNeed works without ResizeObserver (jsdom) — evaluation only, no crash', async () => {
    const { EXPAND_NEEDED_CLASS, syncExpandNeed } = await loadModule()
    const container = document.createElement('div')
    document.body.appendChild(container)
    const needed = makeDiagramFigure({ renderedWidth: 300, widthAttr: '700px' })
    const small = makeDiagramFigure({ renderedWidth: 700, widthAttr: '700px' })
    container.append(needed.figure, small.figure)

    expect(() => syncExpandNeed(container)).not.toThrow()
    expect(needed.figure.classList.contains(EXPAND_NEEDED_CLASS)).toBe(true)
    expect(small.figure.classList.contains(EXPAND_NEEDED_CLASS)).toBe(false)
    expect(syncExpandNeed(null)).toBeUndefined()
  })

  it('one shared observer: sync observes the figures and unobserves the removed ones', async () => {
    const calls = installFakeResizeObserver()
    const { syncExpandNeed } = await loadModule()
    const container = document.createElement('div')
    document.body.appendChild(container)
    const a = makeDiagramFigure({ renderedWidth: 300, widthAttr: '700px' })
    const b = makeDiagramFigure({ renderedWidth: 300, widthAttr: '700px' })
    container.append(a.figure, b.figure)

    syncExpandNeed(container)
    expect(calls.instances).toHaveLength(1)
    expect(calls.observe).toEqual([a.figure, b.figure])

    // The block is deleted: the next sync drops it from the observer.
    b.figure.remove()
    syncExpandNeed(container)
    expect(calls.unobserve).toEqual([b.figure])
    expect(calls.observe).toEqual([a.figure, b.figure])
  })

  it('the observer callback re-evaluates the resized figure', async () => {
    const calls = installFakeResizeObserver()
    const { EXPAND_NEEDED_CLASS, syncExpandNeed } = await loadModule()
    const container = document.createElement('div')
    document.body.appendChild(container)
    const { figure, content } = makeDiagramFigure({ renderedWidth: 700, widthAttr: '700px' })
    container.appendChild(figure)
    syncExpandNeed(container)
    expect(figure.classList.contains(EXPAND_NEEDED_CLASS)).toBe(false)

    // The figure box changed (column narrowed) — the RO delivers it.
    content.getBoundingClientRect = () => rect(0, 0, 300, 100)
    calls.instances[0].callback([{ target: figure }])
    expect(figure.classList.contains(EXPAND_NEEDED_CLASS)).toBe(true)
  })

  it('releaseExpandNeedObservations drops only the destroyed editor\'s figures', async () => {
    const calls = installFakeResizeObserver()
    const { syncExpandNeed, releaseExpandNeedObservations } = await loadModule()
    const first = document.createElement('div')
    const second = document.createElement('div')
    document.body.append(first, second)
    const a = makeDiagramFigure({ renderedWidth: 300, widthAttr: '700px' })
    const b = makeDiagramFigure({ renderedWidth: 300, widthAttr: '700px' })
    first.appendChild(a.figure)
    second.appendChild(b.figure)
    syncExpandNeed(first)
    syncExpandNeed(second)

    // first editor (split view) is destroyed; second keeps observing.
    first.remove()
    releaseExpandNeedObservations(first)
    expect(calls.unobserve).toEqual([a.figure])
    releaseExpandNeedObservations(second)
    expect(calls.unobserve).toEqual([a.figure, b.figure])
  })
})
// END_BLOCK_EXPAND_NEED_SYNC_ASSERTIONS
