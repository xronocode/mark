// FILE: src/muya/lib/parser/render/renderBlock/expandNeed.js
// VERSION: 1.1.0
// START_MODULE_CONTRACT
//   PURPOSE: Decide whether a viewable figure actually benefits from the fullscreen viewer (C-51 T-010, user decision D-7) and toggle the ag-expand-needed class that gates the expand button's visibility.
//   SCOPE: Pure need rules (a diagram drawn narrower than its natural size or taller than 600 px; a table that overflows its C-39 scroll wrapper or is taller than 600 px), DOM gathering for one figure, the class toggle with the BLOCK_EXPAND_NEED log anchor, ONE shared ResizeObserver over the observed figures (unobserved when they leave the DOM; absent ResizeObserver — jsdom — degrades to render-time evaluation), and the sync/release entry points wired into every StateRender render path, the mermaid pipeline insert, renderDiagram and Muya.destroy. C-56 T-005: updateFigureExpandNeed also runs syncBlockToolbarState (renderBlockToolbar.js) so the corner pill's Copy as image button is disabled while the block has no rendered SVG — the same funnel covers both without new call sites.
//   DEPENDS: renderBlockToolbar.syncBlockToolbarState (the C-56 pill copy-disabled pass; pure DOM).
//   LINKS: .grace/changes/active/C-51 T-010 (D-7); .grace/changes/active/C-56 T-005 (the pill sync); .grace/graph/runtime.xml M-012; .grace/verification/runtime.xml V-M-012 scenario-60 and scenario-64; renderExpandButton.js (the gated button); renderBlockToolbar.js (the pill whose expand button is gated the same way); renderContainerBlock.js START_BLOCK_EXPAND_BUTTON (the ag-has-expand marker); the C-51 T-006/T-010 + C-56 T-005 CSS sections of lib/assets/styles/index.css.
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   EXPAND_NEEDED_CLASS - the class this module toggles on figure.ag-has-expand ("ag-expand-needed"); CSS shows button.ag-block-expand (and the pill's button.ag-block-toolbar-expand) only while it is present — display:none otherwise, so a not-needing block has no expand Tab stop.
//   EXPAND_FIGURE_SELECTOR - selector of the figures in scope ("figure.ag-has-expand", set by renderContainerBlock START_BLOCK_EXPAND_BUTTON).
//   DIAGRAM_SCALE_TOLERANCE_PX / TALL_BLOCK_PX / TABLE_OVERFLOW_TOLERANCE_PX - the D-7 thresholds (2 px scale tolerance, 600 px tall, 1 px wrapper-overflow tolerance).
//   diagramNeedRule - pure rule: need ⇔ laid out AND (preview taller than 600 px OR drawn ≥ 2 px narrower than the natural width).
//   tableNeedRule - pure rule: need ⇔ scrollWidth > clientWidth + 1 OR the table taller than 600 px.
//   figureNeedsExpand - DOM gathering for one figure (svg viewBox / px width attribute or img naturalWidth; preview and scroll-wrapper measurements) plus the matching rule.
//   updateFigureExpandNeed - evaluate one figure (or anything inside it) and toggle the class; logs [Muya][expandNeed][BLOCK_EXPAND_NEED] when the verdict flips; also syncs the C-56 pill copy button's disabled state (syncBlockToolbarState).
//   syncExpandNeed - evaluate every figure under a root and keep the shared ResizeObserver in step (observe new figures, unobserve the ones that left the DOM).
//   releaseExpandNeedObservations - drop a destroyed editor's figures from the shared observer (Muya.destroy).
//   TALL_BLOCK_PX - height (px) above which a diagram or table always gets the button.
//   TABLE_OVERFLOW_TOLERANCE_PX - horizontal overflow tolerance (px) for the table scroll wrapper.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.1.0 - 2026-10-18 C-56 T-005: updateFigureExpandNeed
//   additionally runs syncBlockToolbarState on the resolved figure — the
//   same funnel (every render path, pele insert, awaited vega embed,
//   ResizeObserver tick) that evaluates the need now also keeps the
//   corner pill's Copy as image button disabled until the block has a
//   rendered SVG (corner-4). The need rules themselves are unchanged.
//   v1.0.0 - 2026-10-16 C-51 T-010 (user decision D-7, live
//   smoke): new — the expand button shows only on blocks that benefit
//   from the fullscreen viewer. Diagram: the rendered SVG/img is drawn
//   narrower than its natural size (SVG viewBox / px width attribute or
//   img naturalWidth, ~2 px tolerance) or the preview is taller than
//   600 px. Table: the C-39 scroll wrapper overflows horizontally
//   (scrollWidth > clientWidth + 1) or the table is taller than 600 px.
//   Evaluated after every StateRender render path, after every mermaid
//   pipeline insert and every renderDiagram insert, and on figure
//   resize through one shared ResizeObserver (observed figures are
//   unobserved when they leave the DOM; no ResizeObserver — jsdom —
//   means render-time evaluation only). Cmd/Ctrl+click keeps opening
//   the viewer for every viewable block regardless of the class.
// END_CHANGE_SUMMARY

// C-56 T-005: the corner pill rides the same post-render funnel.
import { syncBlockToolbarState } from './renderBlockToolbar'

export const EXPAND_NEEDED_CLASS = 'ag-expand-needed'
export const EXPAND_FIGURE_SELECTOR = 'figure.ag-has-expand'

export const DIAGRAM_SCALE_TOLERANCE_PX = 2
export const TALL_BLOCK_PX = 600
export const TABLE_OVERFLOW_TOLERANCE_PX = 1

// START_BLOCK_EXPAND_NEED_RULES
// Pure D-7 rules, unit-pinned without layout: a block needs the viewer
// when the column squeezes it (diagrams fit the column via CSS
// width:100% + the mermaid inline max-width, so "drawn narrower than
// natural" is exactly the scaled case) or when it grows past 600 px.
export const diagramNeedRule = ({ renderedWidth = 0, renderedHeight = 0, naturalWidth = 0 } = {}) =>
  renderedWidth > 0 &&
  renderedHeight > 0 &&
  (renderedHeight > TALL_BLOCK_PX ||
    (naturalWidth > 0 && renderedWidth < naturalWidth - DIAGRAM_SCALE_TOLERANCE_PX))

export const tableNeedRule = ({ scrollWidth = 0, clientWidth = 0, tableHeight = 0 } = {}) =>
  scrollWidth > clientWidth + TABLE_OVERFLOW_TOLERANCE_PX || tableHeight > TALL_BLOCK_PX
// END_BLOCK_EXPAND_NEED_RULES

// START_BLOCK_EXPAND_NEED_GATHER
// A width="100%" attribute (mermaid useMaxWidth) is the CSS stretch, not
// a natural size — only unitless/px values count as natural width.
const parseNaturalWidth = (value) => {
  if (!value) return 0
  const str = String(value).trim()
  if (str.endsWith('%')) return 0
  const n = Number.parseFloat(str)
  return Number.isFinite(n) && n > 0 ? n : 0
}

const naturalSvgWidth = (svg) => {
  const viewBox = svg.viewBox && svg.viewBox.baseVal
  if (viewBox && viewBox.width > 0) {
    return viewBox.width
  }
  return parseNaturalWidth(svg.getAttribute('width'))
}

const diagramNeedsExpand = (figure) => {
  const preview = figure.querySelector('div.ag-container-preview')
  if (!preview) return false
  const svg = preview.querySelector('svg')
  const img = svg ? null : preview.querySelector('img')
  if (!svg && !img) return false
  const content = svg || img
  const contentRect = content.getBoundingClientRect()
  // A figure that is not laid out (hidden editor, detached clone)
  // measures 0×0 — no verdict; the shared ResizeObserver re-evaluates
  // the moment it becomes visible.
  if (contentRect.width <= 0 || contentRect.height <= 0) return false
  const previewRect = preview.getBoundingClientRect()
  return diagramNeedRule({
    renderedWidth: contentRect.width,
    renderedHeight: previewRect.height > 0 ? previewRect.height : contentRect.height,
    naturalWidth: svg
      ? naturalSvgWidth(svg)
      : img.complete && img.naturalWidth > 0 ? img.naturalWidth : 0
  })
}

const tableNeedsExpand = (figure) => {
  const wrapper = figure.querySelector('div.ag-table-scroll')
  if (!wrapper) return false
  const table = wrapper.querySelector('table')
  return tableNeedRule({
    scrollWidth: wrapper.scrollWidth,
    clientWidth: wrapper.clientWidth,
    tableHeight: table ? table.getBoundingClientRect().height : 0
  })
}

export const figureNeedsExpand = (figure) => {
  if (!figure || figure.nodeType !== 1) return false
  return figure.dataset.role === 'TABLE'
    ? tableNeedsExpand(figure)
    : diagramNeedsExpand(figure)
}
// END_BLOCK_EXPAND_NEED_GATHER

// START_BLOCK_EXPAND_NEED_TOGGLE
// Accepts the figure itself or anything inside it (the mermaid pipeline
// and renderDiagram hand over the preview div). Returns the verdict so
// callers can chain; only class FLIPS are logged so typing-driven syncs
// do not spam the console.
export const updateFigureExpandNeed = (element) => {
  if (!element || element.nodeType !== 1 || !element.closest) return false
  const figure = element.closest(EXPAND_FIGURE_SELECTOR)
  if (!figure) return false
  const needed = figureNeedsExpand(figure)
  if (figure.classList.contains(EXPAND_NEEDED_CLASS) !== needed) {
    figure.classList.toggle(EXPAND_NEEDED_CLASS, needed)
    // Coordinates only — never diagram source or markdown text.
    console.debug('[Muya][expandNeed][BLOCK_EXPAND_NEED] expand need changed', {
      blockKey: figure.id,
      needed
    })
  }
  // C-56 T-005: the pill's Copy as image button is disabled while the
  // block has no rendered SVG — every path that re-evaluates the need
  // (render, pele insert, awaited vega embed, resize tick) re-syncs it.
  syncBlockToolbarState(figure)
  return needed
}
// END_BLOCK_EXPAND_NEED_TOGGLE

// START_BLOCK_EXPAND_NEED_OBSERVER
// ONE observer for every muya instance (editor + Split View mirrors):
// a figure resize — viewport/column change, SVG insert, late font swap —
// re-runs the rule for that figure. Guarded: jsdom has no
// ResizeObserver; there the render-time evaluation carries the state.
let sharedResizeObserver = null
const observedFigures = new Set()

const getSharedResizeObserver = () => {
  if (typeof ResizeObserver === 'undefined') return null
  if (!sharedResizeObserver) {
    sharedResizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.target.isConnected) {
          updateFigureExpandNeed(entry.target)
        }
      }
    })
  }
  return sharedResizeObserver
}

const observeFigure = (figure) => {
  const observer = getSharedResizeObserver()
  if (observer && !observedFigures.has(figure)) {
    observer.observe(figure)
    observedFigures.add(figure)
  }
}

const unobserveFigure = (figure) => {
  observedFigures.delete(figure)
  if (sharedResizeObserver) {
    sharedResizeObserver.unobserve(figure)
  }
}

// Post-render pass (every StateRender render path): evaluate the figures
// under root and keep the observation set in step with the DOM.
export const syncExpandNeed = (root) => {
  if (!root || !root.querySelectorAll) return
  for (const figure of root.querySelectorAll(EXPAND_FIGURE_SELECTOR)) {
    updateFigureExpandNeed(figure)
    observeFigure(figure)
  }
  // Figures whose block was deleted (or re-rendered into a new element)
  // left the DOM — stop observing them; any editor's next sync runs this
  // sweep, so a figure never outlives its DOM node in the observer.
  for (const figure of Array.from(observedFigures)) {
    if (!figure.isConnected) {
      unobserveFigure(figure)
    }
  }
}

// Editor teardown: the shared observer serves several muya instances, so
// only THIS container's figures (plus any already-dead leftovers) are
// dropped — split-view mirrors keep their observations.
export const releaseExpandNeedObservations = (root) => {
  for (const figure of Array.from(observedFigures)) {
    if (!root || root.contains(figure) || !figure.isConnected) {
      unobserveFigure(figure)
    }
  }
}
// END_BLOCK_EXPAND_NEED_OBSERVER
