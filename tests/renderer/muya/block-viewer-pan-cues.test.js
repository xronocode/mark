// FILE: tests/renderer/muya/block-viewer-pan-cues.test.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Pin the FIX-008 reopen pan-cue contract of the fullscreen table viewer: the pure transformed-bound-to-shadow-state maths (tableClipShadows) at the left bound, middle, right bound and fully fitted position, plus the updateClipShadows wiring that drives the two non-interactive edge overlays from the live canvas/stage rects.
//   SCOPE: tableClipShadows and BlockViewer#updateClipShadows in src/muya/lib/ui/blockViewer/index.js with @panzoom/panzoom mocked and rect getters stubbed per case.
//   DEPENDS: src/muya/lib/ui/blockViewer, src/muya/lib/eventHandler/event (real EventCenter), Vitest + jsdom.
//   LINKS: .grace/changes/active/C-FIX-008-VIEWER-PAN-CUES; .grace/verification/runtime.xml V-M-012 scenario-19; docs/release-trains/2.5.x-next.md#fix-008; START_BLOCK_VIEWER_PAN_CUES.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   STAGE - canonical stage rect used by every wiring case (left 0, width 1280).
//   makePanzoomDouble - @panzoom/panzoom instance double re-installed in beforeEach (the global resetAllMocks wipes implementations).
//   viewer - the BlockViewer under test for the current case (destroyed in afterEach).
//   openTableViewer - harness: stub muya + real EventCenter + a table figure opened through the viewer.
//   stubRects - installs configurable getBoundingClientRect getters on the viewer canvas/stage.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - 2026-10-20 C-FIX-008-VIEWER-PAN-CUES: new spec.
//   Pins the pan-only horizontal model's clipping cues: left bound shows
//   only the right shadow, the middle shows both, the right bound only
//   the left, a fully fitted table shows neither, and a sub-pixel
//   overflow within the 1px tolerance shows neither.
// END_CHANGE_SUMMARY

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import Panzoom from '@panzoom/panzoom'
import EventCenter from 'muya/lib/eventHandler/event'
import BlockViewer, { tableClipShadows } from 'muya/lib/ui/blockViewer'

vi.mock('@panzoom/panzoom', () => {
  return { default: vi.fn() }
})

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

// Canonical stage: [0 .. 1280].
const STAGE = { left: 0, right: 1280 }

let viewer

const openTableViewer = () => {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const eventCenter = new EventCenter()
  const muya = { container, eventCenter, options: { t: (key) => key } }
  viewer = new BlockViewer(muya)
  const figure = document.createElement('figure')
  figure.setAttribute('data-role', 'TABLE')
  const table = document.createElement('table')
  table.className = 'ag-paragraph'
  table.id = 'tv-key-1'
  const thead = document.createElement('thead')
  const tr = document.createElement('tr')
  const th = document.createElement('th')
  th.textContent = 'h'
  tr.appendChild(th)
  thead.appendChild(tr)
  table.appendChild(thead)
  figure.appendChild(table)
  container.appendChild(figure)
  viewer.openFromElement(figure)
  return viewer
}

const stubRects = (v, canvasLeft, canvasRight, stageLeft = STAGE.left, stageRight = STAGE.right) => {
  Object.defineProperty(v.canvas, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({ left: canvasLeft, right: canvasRight })
  })
  Object.defineProperty(v.stage, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({ left: stageLeft, right: stageRight })
  })
}

beforeEach(() => {
  vi.useFakeTimers()
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

describe('tableClipShadows (pure bound maths, C-FIX-008-VIEWER-PAN-CUES)', () => {
  it('left bound: only the right shadow', () => {
    // Content flush with the left edge, overflowing to the right.
    expect(tableClipShadows(0, 2400, STAGE.left, STAGE.right))
      .toEqual({ left: false, right: true })
  })

  it('middle: both shadows', () => {
    // Centered wide content: clipped on both sides.
    expect(tableClipShadows(-560, 1840, STAGE.left, STAGE.right))
      .toEqual({ left: true, right: true })
  })

  it('right bound: only the left shadow', () => {
    // Content flush with the right edge, overflowing to the left.
    expect(tableClipShadows(-1120, 1280, STAGE.left, STAGE.right))
      .toEqual({ left: true, right: false })
  })

  it('fully fitted: neither shadow', () => {
    expect(tableClipShadows(90, 1190, STAGE.left, STAGE.right))
      .toEqual({ left: false, right: false })
  })

  it('sub-pixel overflow within the 1px tolerance shows neither shadow', () => {
    expect(tableClipShadows(0.4, 1280.6, STAGE.left, STAGE.right))
      .toEqual({ left: false, right: false })
    expect(tableClipShadows(-2, 1282, STAGE.left, STAGE.right))
      .toEqual({ left: true, right: true })
  })
})

describe('updateClipShadows wiring (C-FIX-008-VIEWER-PAN-CUES)', () => {
  it('toggles the two overlays from the live canvas/stage rects', () => {
    const v = openTableViewer()
    // Left bound: right shadow only.
    stubRects(v, 0, 2400)
    v.updateClipShadows()
    expect(v.clipLeftEl.classList.contains('ag-block-viewer-clip-on')).toBe(false)
    expect(v.clipRightEl.classList.contains('ag-block-viewer-clip-on')).toBe(true)

    // Pan to the middle: both.
    stubRects(v, -560, 1840)
    v.updateClipShadows()
    expect(v.clipLeftEl.classList.contains('ag-block-viewer-clip-on')).toBe(true)
    expect(v.clipRightEl.classList.contains('ag-block-viewer-clip-on')).toBe(true)

    // Pan to the right bound: left only.
    stubRects(v, -1120, 1280)
    v.updateClipShadows()
    expect(v.clipLeftEl.classList.contains('ag-block-viewer-clip-on')).toBe(true)
    expect(v.clipRightEl.classList.contains('ag-block-viewer-clip-on')).toBe(false)

    // Fit clears both.
    stubRects(v, 90, 1190)
    v.updateClipShadows()
    expect(v.clipLeftEl.classList.contains('ag-block-viewer-clip-on')).toBe(false)
    expect(v.clipRightEl.classList.contains('ag-block-viewer-clip-on')).toBe(false)
  })

  it('closing the viewer clears the overlays', () => {
    const v = openTableViewer()
    stubRects(v, -560, 1840)
    v.updateClipShadows()
    expect(v.clipLeftEl.classList.contains('ag-block-viewer-clip-on')).toBe(true)
    v.close({ restoreFocus: false })
    expect(v.clipLeftEl.classList.contains('ag-block-viewer-clip-on')).toBe(false)
    expect(v.clipRightEl.classList.contains('ag-block-viewer-clip-on')).toBe(false)
  })
})
