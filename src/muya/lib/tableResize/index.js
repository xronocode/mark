// FILE: src/muya/lib/tableResize/index.js
// VERSION: 3.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Table column resize and the honest three-mode table model (C-PAGE-WIDTH-TABLES T-007/T-008/T-009 over the C-39 session widths and the C-65 persistent identities): Auto (content-sized, GitHub model), Fit page (the frame IS the text column — columns distributed by the shared tableFit algorithm with the wrap-anywhere fallback and, only when even the minimal sizes cannot fit, an honest minimal-size horizontal-scroll degradation with the «does not fit by N px» badge) and Full width (the whole window canvas — window minus sidebar — same algorithm, same degradation). The legacy fake-fit machinery (the auto-expansion default and the pinned-frame-with-scrolling-content «fit» flag) is retired; stored fit:true entries open in the new Fit page through an idempotent schema-v2 migration. Column sizes persist as px plus ratios plus an optional explicit table width; drags write both; window/zoom/page-width changes and Fit↔Full switches re-apply the ratios to the new frame. Drag affordances: the C-39 col-resize border handles (kept for parity), live %·px chips above every column during a drag, and side-wall handles outside Fit that set an explicit table width (double-click resets; a wall drag in Full switches the table to Auto with that width); walls clamp inside the visible scroll area so they stay hittable while the table overflows.
//   SCOPE: The width store keyed by table block key (widths + manual + ratios + tableWidth), MIN_COLUMN_WIDTH clamping, column-count reconciliation (a new column takes a content-proportional share and the ratios renormalise), the persistent identity map (document ordinal + header signature), the schema-v2 sanitize/adoption rules with the idempotent fit:true migration (R-8) and the rememberTableColumnSizes guard over the persistence bridge, the mode map (fit/full; absent = auto) over the tri-state tableFullWidthDefault option ('auto' default per owner gate №5; legacy booleans map to auto — the fake-fit expansion default is gone), the tableFit consumption funnel (cached extents per identity/structure/font revision, re-fit debounced ~200 ms + rAF on container/figure resize), the degradation badge dataset + the caption sync, DOM application (colgroup + table-layout fixed; the Full width breakout geometry), the three-button toolbar mode segment DOM, the drag interaction (column drag in Fit/Full fixes that column and re-fits the remainder — the table never leaves its frame), the side-wall drag/auto-switch/reset, the %·px chips, capture-phase pointer/dblclick/scroll guards, a normal bubble-phase toolbar action route, caption isolation, and the ResizeObserver lifecycle (destroy() detaches; a disconnected container self-cleans).
//   DEPENDS: muya.eventCenter (capture- and bubble-phase DOM events on muya.container), window pointer events during a drag, ResizeObserver (jsdom degrades to render-time evaluation only), DOM colgroup/th measuring; ./tableFit (measureColumnExtents, planTableFit, distributeIntoFrame, applyRatiosToWidth, ratiosFromWidths); ./tableCue (cue sync + TABLE_FULL_WIDTH_CLASS + the degradation badge formatting); ../parser/render/renderBlock/renderTableToolbar (the mode segment for the live active-state swap).
//   LINKS: .grace/changes/active/C-PAGE-WIDTH-TABLES (plan T-007/T-008/T-009, spec R-8/R-9/R-10/R-11, corners C-7/C-8/C-9/C-10); .grace/graph/performance.xml M-061 and runtime.xml M-012 fn-tableResize; .grace/verification/runtime.xml V-M-012 scenario-21/scenario-66 and verification/performance.xml V-M-061; .grace/changes/archive/C-39 T-002; .grace/changes/archive/C-65 T-001/T-002/T-004; renderContainerBlock START_BLOCK_TABLE_COLUMN_WIDTHS, START_BLOCK_TABLE_COLUMN_RESIZER_HANDLE and START_BLOCK_TABLE_TOOLBAR_AND_CAPTION; render/index.js START_BLOCK_TABLE_WIDTHS_KEEP; renderer util tableLayoutStore.js (schema v2) + tableLayoutRatios.js (the store-side ratio maths) + editor.vue BLOCK_TABLE_LAYOUTS_HOST (the prefs host side); store/preferences.js tableFullWidthDefault/rememberTableColumnSizes (the Tables-tab keys this module consumes).
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   default - TableResize: the three-mode model (auto/fit/full), column drag/reset, persistent layout identities, ratio re-application, walls/chips/degradation affordances, and native-safe bubble toolbar routing.
//   MIN_COLUMN_WIDTH - drag clamp floor for one column (px); also the distribution/degradation sanity floor.
//   FULL_WIDTH_GUTTER_PX - gap between a Full width table that is wider than the editor and the editor's left edge.
//   REFIT_DEBOUNCE_MS - trailing debounce (~200 ms + rAF) of the resize-driven re-fit (plan review finding F7).
//   CHIPS_FADE_MS - how long the %·px chips stay visible (fading) after a drag releases.
//   TABLE_FIXED_CLASS - class marking a table that carries fixed widths (table-layout: fixed + colgroup).
//   RESIZING_TABLE_CLASS - class on the table while a drag is in progress (no text selection).
//   RESIZING_HANDLE_CLASS - class on the active handle while dragging (accent hairline).
//   RESIZER_CLASS - class of the invisible header-border drag handle rendered into each th.
//   TABLE_WALL_CLASS - class of the side-wall drag handles (left/right spans the DOM pass appends to each figure outside Fit).
//   TABLE_SIZE_CHIPS_CLASS - class of the %·px chips overlay above the columns during a drag.
//   TABLE_MODES - the honest mode set ('auto' | 'fit' | 'full').
//   TABLE_FULL_WIDTH_CLASS - re-export of the tableCue figure class for the renderContainerBlock vnode ("ag-table-full-width").
//   TABLE_TOOLBAR_BUTTON_SELECTOR - selector of the table toolbar buttons (from renderTableToolbar; routed here on normal bubble phase).
//   ensureAffordanceStyles - inject the wall/chip stylesheet once per document (the muya stylesheet is outside the change's observed write scope).
//   sanitizePersistedEntries - pure: coerce a raw persisted entries object into schema-v2 entries { widths, manual, mode?, ratios?, tableWidth? }; the legacy fullWidth/fit booleans migrate to mode (idempotent), invalid shapes drop.
//   tableSignature - pure-ish: header signature of a thead row (column count + hash of the header cell texts).
//   hashHeaderText - pure: djb2 base36 hash used by the signature.
//   clampWidth - pure: round and clamp a drag width to the minimum.
//   sumWidths - pure: total of a widths array (the fixed table's width).
//   reconcileWidths - pure: re-map stored widths/manual flags onto a changed column count.
//   ratiosFromWidths - re-export of the tableFit pure (widths → fractions).
//   applyRatiosToWidth - re-export of the tableFit pure (ratios + frame → widths).
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v3.0.0 - 2026-11-02 C-PAGE-WIDTH-TABLES T-007/T-008/T-009:
//   the honest three-mode model. Auto is content-sized (the C-39/C-65
//   wrapper-scroll behaviour, GitHub model); Fit page pins the frame to the
//   text column and distributes real columns through tableFit.js (wrap
//   fallback first, honest minimal-size scroll degradation with the
//   «does not fit by N px» badge only when even the minima overflow); Full
//   width spans the window canvas (the muya container) with the same
//   algorithm. The legacy fake-fit default (autoFullWidth: wide tables
//   auto-opening a pinned frame with scrolling content) and the pinned-
//   frame «fit» flag are RETIRED — tableFullWidthDefault is the tri-state
//   Tables-tab preference ('auto' default; legacy booleans map to auto)
//   and stored fit:true entries migrate to the honest Fit page
//   idempotently. Entries carry ratios + an explicit tableWidth (T-008):
//   drags write both; resizes and Fit↔Full switches re-apply ratios;
//   rememberTableColumnSizes=false stops the persistence bridge. T-009:
//   the toolbar toggle becomes a three-button mode segment, drags show
//   %·px chips above every column (fading after release), and side walls
//   outside Fit set/reset an explicit table width (a wall drag in Full
//   switches to Auto with that width; walls clamp inside the visible
//   scroll area). The shipped 6px resizer with its col-resize cursor and
//   hover hairline is kept untouched (parity pinned).
//   PREV: v2.8.0 - 2026-10-20 C-TABLE-NATIVE-TOOLBAR-DELIVERY:
//   persist() refreshes identities without re-adopting the previously loaded
//   profile snapshot, then replaces that snapshot with the serialized user
//   state. Otherwise an adopted {fullWidth:true} entry immediately restored
//   Full width while handling Fit, making the physical click look inert.
//   PREV: v2.7.0 - 2026-10-20 C-TABLE-NATIVE-TOOLBAR-DELIVERY:
//   toolbar mousedown and click now reach their real button target; one
//   bubble-phase handler, registered before Muya's generic click router,
//   owns all table actions and stops the generic block-toolbar fallback.
//   This avoids WKWebView's failed capture-only activation path.
//   PREV: v2.6.0 - leaving Full width always records the user's explicit
//   Fit-to-page choice before DOM geometry changes. The old live-width
//   recheck could see a reflowed table as fitting while expanded, omit
//   `fit`, and let the next resize/reconcile restore automatic Full width.
//   PREV: v2.5.0 - 2026-10-19 C-71-TABLE-CENTER: use the full editor
//   client viewport so fitting long-cell tables remain centered even when
//   the outline overlays their right edge; true overflow retains its gutter.
//   v2.4.0 - 2026-10-19 C-71: center natural-size tables with
//   CSS auto margins inside an explicit available viewport; geometry is
//   scroll-relative and excludes other editors' outline overlays.
//   v2.3.0 - 2026-10-19 C-70: the toolbar's copyImage action
//   dispatches muya-diagram-export (copyImageFromElement).
//   v2.2.0 - 2026-10-19 Full width is the DEFAULT for a
//   table wider than the text column (retired in v3.0.0 — see above).
//   v2.1.0 - 2026-10-19 Full width placement: a table that
//   fits the editor area is centred in it; a wider one starts
//   FULL_WIDTH_GUTTER_PX from the left edge (it used to stick to the edge).
//   v2.0.0 - 2026-10-18 C-65: widths (and the per-table mode) persist per
//   file in the Mark profile via ordinal#header-signature identities; the
//   only write path is persist() after real user actions; adoption and
//   reconciliation never write. v1.0.0 - 2026-10-15 C-39 T-002: session
//   width store keyed by the table block key.
// END_CHANGE_SUMMARY

import {
  syncTableCue,
  setTableCueTranslator,
  TABLE_CAPTION_CLASS,
  TABLE_FULL_WIDTH_CLASS
} from './tableCue'
import {
  TABLE_TOOLBAR_BUTTON_SELECTOR,
  TOOLBAR_TABLE_AUTO_ICON_PATH,
  TOOLBAR_TABLE_FIT_ICON_PATH,
  TOOLBAR_TABLE_FULLWIDTH_ICON_PATH
} from '../parser/render/renderBlock/renderTableToolbar'
import {
  FIT_MIN_COLUMN_WIDTH,
  measureColumnExtents,
  planTableFit,
  distributeIntoFrame,
  applyRatiosToWidth,
  ratiosFromWidths
} from './tableFit'

export { TABLE_FULL_WIDTH_CLASS }
export { TABLE_TOOLBAR_BUTTON_SELECTOR }
export { ratiosFromWidths, applyRatiosToWidth }

export const MIN_COLUMN_WIDTH = 48
// C-65 R-6: the Full width table keeps this gap to the editor's edge.
export const FULL_WIDTH_GUTTER_PX = 24
export const TABLE_FIXED_CLASS = 'ag-column-widths-fixed'
export const RESIZER_CLASS = 'ag-column-resizer'
export const RESIZING_TABLE_CLASS = 'ag-column-resizing'
export const RESIZING_HANDLE_CLASS = 'ag-resizing'
// T-009 affordances (the styles are injected once by ensureAffordanceStyles —
// the muya stylesheet is outside this change's observed write scope).
export const TABLE_WALL_CLASS = 'ag-table-wall'
export const TABLE_SIZE_CHIPS_CLASS = 'ag-table-size-chips'
export const TABLE_MODES = ['auto', 'fit', 'full']
// R-9: re-fit is debounced ~200 ms + rAF on window resize, zoom,
// page-width change and column insert/delete.
export const REFIT_DEBOUNCE_MS = 200
// T-009: the chips fade «shortly after release».
export const CHIPS_FADE_MS = 700

// START_BLOCK_CLAMP_AND_RECONCILE
// Pure width maths, kept free of DOM so tests can pin the policy.
export const clampWidth = width => Math.max(MIN_COLUMN_WIDTH, Math.round(width))

export const sumWidths = widths => widths.reduce((total, w) => total + clampWidth(w), 0)

// Column added/removed (muya's editTable mutates the SAME table block, so
// the key survives): keep stored widths for columns that still exist BY
// INDEX, drop the rest, and give brand-new columns their measured auto
// width — the content-proportional share; the ratios renormalise from the
// resulting widths (T-008, caller-side).
export const reconcileWidths = (widths, manual, columnCount, measured) => {
  const nextWidths = []
  const nextManual = []
  for (let i = 0; i < columnCount; i++) {
    if (i < widths.length) {
      nextWidths.push(widths[i])
      nextManual.push(!!manual[i])
    } else {
      const fallback = measured && measured[i] !== undefined ? measured[i] : MIN_COLUMN_WIDTH
      nextWidths.push(Math.round(fallback))
      nextManual.push(false)
    }
  }
  return { widths: nextWidths, manual: nextManual }
}
// END_BLOCK_CLAMP_AND_RECONCILE

// START_BLOCK_PERSISTENT_IDENTITY
// C-65 R-1: the persistent key of a table is (file path — owned by the
// host store, document ordinal, header signature). The signature counts
// the columns and hashes the header texts, so ANY header edit or column
// add/remove mints a new identity and the old widths no longer match.
export const hashHeaderText = (text) => {
  let hash = 5381
  for (let i = 0; i < text.length; i++) {
    hash = ((hash << 5) + hash + text.charCodeAt(i)) | 0
  }
  return (hash >>> 0).toString(36)
}

export const tableSignature = (row) => {
  if (!row || !row.cells || row.cells.length === 0) return null
  const texts = []
  for (const cell of row.cells) {
    texts.push((cell.textContent || '').trim())
  }
  return `${texts.length}:${hashHeaderText(texts.join('\u0001'))}`
}

// Pure: coerce a raw persisted entries object (from the profile) into
// schema-v2 entries; anything malformed is dropped, widths are clamped so
// a hand-edited profile can never collapse a column. T-007 migration: the
// LEGACY `fullWidth` boolean becomes mode 'full'; the LEGACY `fit` flag —
// the fake fit: a pinned frame with scrolling content — becomes the honest
// Fit page (R-8, owner gate №4: same user intent, now really delivered).
// Running the sanitizer on its own output changes nothing (idempotent):
// mode reads back as mode and the booleans are never written again.
export const sanitizePersistedEntries = (raw) => {
  if (!raw || typeof raw !== 'object') return null
  const entries = {}
  for (const pid of Object.keys(raw)) {
    const value = raw[pid]
    if (!value || typeof value !== 'object') continue
    const widths = Array.isArray(value.widths)
      ? value.widths
        .filter(w => Number.isFinite(w) && w > 0)
        .map(w => clampWidth(w))
      : []
    // One manual flag per kept width (missing flags read as auto).
    const rawManual = Array.isArray(value.manual) ? value.manual : []
    const manual = widths.map((_, i) => !!rawManual[i])
    // Schema v2 mode. Full width wins a contradictory legacy pair.
    let mode
    if (value.mode === 'fit' || value.mode === 'full') mode = value.mode
    else if (value.fullWidth) mode = 'full'
    else if (value.fit) mode = 'fit'
    // T-008: stored proportions (fractions of the table width) and the
    // side-wall-set explicit width travel with the entry.
    const ratios = Array.isArray(value.ratios) &&
      value.ratios.length === widths.length &&
      value.ratios.every(r => Number.isFinite(r) && r > 0)
      ? value.ratios.slice()
      : undefined
    const tableWidth = Number.isFinite(value.tableWidth) && value.tableWidth > 0
      ? Math.round(value.tableWidth)
      : undefined
    // No user-dragged column, no mode choice, no wall width and no stored
    // proportions: indistinguishable from the default layout.
    if (widths.length === 0 && !mode && !tableWidth && !ratios) continue
    if (!mode && !tableWidth && !ratios && !manual.some(Boolean)) continue
    const entry = { widths, manual }
    if (mode) entry.mode = mode
    if (ratios) entry.ratios = ratios
    if (tableWidth) entry.tableWidth = tableWidth
    entries[pid] = entry
  }
  return entries
}
// END_BLOCK_PERSISTENT_IDENTITY

// START_BLOCK_AFFORDANCE_STYLES
// T-009 wall/chip styles. The muya stylesheet is outside this change's
// observed write scope, so the two dynamic overlays carry their styles in
// one stylesheet the module injects once per document — self-contained,
// theme vars included, and removed with nothing else.
const AFFORDANCE_STYLE_ID = 'ag-table-affordance-styles'
let affordanceStylesInjected = false
export const ensureAffordanceStyles = () => {
  if (affordanceStylesInjected) return
  if (typeof document === 'undefined' || !document.head) return
  if (document.getElementById(AFFORDANCE_STYLE_ID)) {
    affordanceStylesInjected = true
    return
  }
  const style = document.createElement('style')
  style.id = AFFORDANCE_STYLE_ID
  style.textContent = `
.ag-table-wrap-anywhere th {
  overflow-wrap: anywhere;
}
.${TABLE_WALL_CLASS} {
  position: absolute;
  top: 0;
  width: 12px;
  margin-left: -6px;
  cursor: ew-resize;
  z-index: 3;
  user-select: none;
  -webkit-user-select: none;
}
.${TABLE_WALL_CLASS}::before {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  left: 5.5px;
  width: 1px;
  background: transparent;
}
.${TABLE_WALL_CLASS}:hover::before,
.${TABLE_WALL_CLASS}.ag-resizing::before {
  background: var(--chromeAccent, var(--themeColor));
}
.${TABLE_SIZE_CHIPS_CLASS} {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 0;
  pointer-events: none;
  z-index: 4;
}
.${TABLE_SIZE_CHIPS_CLASS} .ag-table-size-chip {
  position: absolute;
  transform: translateX(-50%);
  white-space: nowrap;
  font: 500 10px/1.6 -apple-system, system-ui, sans-serif;
  color: var(--chromeAccent, var(--themeColor));
  background: color-mix(in srgb, var(--chromeAccent, var(--themeColor)) 10%, transparent);
  border-radius: 4px;
  padding: 1px 5px;
  opacity: 1;
}
.${TABLE_SIZE_CHIPS_CLASS}.ag-table-chips-fade .ag-table-size-chip {
  opacity: 0;
  transition: opacity 0.45s ease;
}
`
  document.head.appendChild(style)
  affordanceStylesInjected = true
}
// END_BLOCK_AFFORDANCE_STYLES

// START_BLOCK_TABLE_RESIZE_INTERACTION
class TableResize {
  constructor(muya) {
    this.muya = muya
    // tableKey -> { widths: number[], manual: boolean[], ratios?: number[],
    // tableWidth?: number }. `manual` marks the columns the USER dragged;
    // `ratios` are the stored proportions (T-008) and `tableWidth` the
    // side-wall-set explicit width (T-009).
    this.widths = new Map()
    this.dragging = null
    // C-65: tableKey -> persistent identity (ordinal#signature), the
    // adoption/drop map, and the persisted entries of the ACTIVE document
    // (set by applyPersistedLayouts).
    this.identities = new Map()
    // T-007 mode map: key -> 'fit' | 'full'. Absent = Auto, resolved
    // through modeOf() against the tri-state tableFullWidthDefault option.
    this.modes = new Map()
    // T-007: key -> overflow px while a table is in the honest scroll
    // degradation (the caption badge reads it from the figure dataset).
    this.degrade = new Map()
    // T-007: cached column extents per table, invalidated by identity,
    // structure (rows × columns) or the measured font size (zoom).
    this.fitCache = new Map()
    this.persisted = null
    const { container, eventCenter } = muya
    // Capture phase on the editor container: the resizer must own its
    // pointer gestures BEFORE muya's bubble-phase mousedown/click handlers
    // can turn them into caret placement or a cell-selection drag. A capture
    // listener on an ancestor stops the event from ever reaching the target
    // or muya's own container listeners.
    eventCenter.attachDOMEvent(container, 'pointerdown', this.handlePointerDown, true)
    eventCenter.attachDOMEvent(container, 'mousedown', this.blockHandleEvent, true)
    eventCenter.attachDOMEvent(container, 'click', this.blockHandleEvent, true)
    eventCenter.attachDOMEvent(container, 'dblclick', this.handleDoubleClick, true)
    // C-65 T-002 / C-TABLE-NATIVE-TOOLBAR-DELIVERY: toolbar mouse events
    // must reach the real button target in WKWebView. Capture owns only the
    // caption isolation; one normal bubble listener owns the actions
    // before clickEvent.js's later generic block-toolbar fallback.
    eventCenter.attachDOMEvent(container, 'mousedown', this.handleToolbarMousedown, true)
    eventCenter.attachDOMEvent(container, 'click', this.handleToolbarClick, true)
    eventCenter.attachDOMEvent(container, 'click', this.handleToolbarAction)
    // C-65 T-003: scroll of a table wrapper does not bubble, but it DOES
    // capture — one delegated listener keeps every caption/shade live and
    // the T-009 walls inside the visible scroll area.
    eventCenter.attachDOMEvent(container, 'scroll', this.handleScrollCapture, true)
    setTableCueTranslator(muya.options && muya.options.t)
    ensureAffordanceStyles()
    // R-9 re-fit funnel: one ResizeObserver over the container (window
    // resizes, sidebar drags) and every table figure (page-width changes,
    // zoom-driven ch columns). jsdom has no ResizeObserver — the render
    // funnel alone re-fits there.
    this.resizeObserver = typeof ResizeObserver === 'function'
      ? new ResizeObserver(() => this.scheduleRefit())
      : null
    this.observedFigures = new WeakSet()
    this.refitTimer = null
    this.refitFrame = 0
    if (this.resizeObserver && container && container.nodeType === 1) {
      this.resizeObserver.observe(container)
    }
  }

  // Lifecycle: detach the observer and any live drag listeners. The
  // capture listeners die with the container; the observer would keep the
  // detached tree alive, so destroy() must be called by muya teardown or
  // the first callback after the container leaves the DOM self-cleans.
  destroy() {
    if (this.resizeObserver) {
      this.resizeObserver.disconnect()
      this.resizeObserver = null
    }
    if (this.refitTimer) {
      clearTimeout(this.refitTimer)
      this.refitTimer = null
    }
    if (this.refitFrame) {
      cancelAnimationFrame(this.refitFrame)
      this.refitFrame = 0
    }
    if (this.dragging) {
      window.removeEventListener('pointermove', this.handlePointerMove)
      window.removeEventListener('pointerup', this.handlePointerUp)
      window.removeEventListener('pointercancel', this.handlePointerUp)
      this.dragging = null
    }
  }

  // The read-only Split View mirror pane disables the affordance entirely
  // (option set by editor.vue); reading/locked tabs keep it — resizing is
  // view-only and never marks the document dirty.
  enabled() {
    return !(this.muya.options && this.muya.options.disableTableColumnResize)
  }

  // T-008: the Tables-tab «Remember column sizes» switch. Off = the drag
  // work still functions this session but nothing is written to the
  // profile and stored entries are not adopted on load.
  rememberingSizes() {
    return !(this.muya.options && this.muya.options.rememberTableColumnSizes === false)
  }

  findHandle(target) {
    if (!target || target.nodeType !== 1 || !target.closest) return null
    return target.closest(`.${RESIZER_CLASS}`)
  }

  findWall(target) {
    if (!target || target.nodeType !== 1 || !target.closest) return null
    return target.closest(`.${TABLE_WALL_CLASS}`)
  }

  findTableToolbarButton(target) {
    if (!target || target.nodeType !== 1 || !target.closest) return null
    return target.closest(TABLE_TOOLBAR_BUTTON_SELECTOR)
  }

  findTableFigure(target) {
    if (!target || target.nodeType !== 1 || !target.closest) return null
    return target.closest("figure[data-role='TABLE']")
  }

  // mousedown/click on a handle or a wall must not reach muya's handlers
  // (cell selection, caret placement) even when a drag does not start.
  blockHandleEvent = event => {
    if (!this.findHandle(event.target) && !this.findWall(event.target)) return
    event.preventDefault()
    event.stopPropagation()
  }

  // ---- Width store (per muya instance === per editor surface) ----

  setTableWidths(key, widths, manual) {
    const safeWidths = widths.map(w => clampWidth(w))
    const safeManual = (manual || widths.map(() => false)).map(m => !!m)
    const previous = this.widths.get(key)
    const entry = { widths: safeWidths, manual: safeManual }
    if (previous && previous.ratios) entry.ratios = previous.ratios
    if (previous && previous.tableWidth) entry.tableWidth = previous.tableWidth
    this.widths.set(key, entry)
  }

  getWidths(key) {
    const entry = this.widths.get(key)
    return entry ? entry.widths.slice() : undefined
  }

  resetTable(key) {
    this.widths.delete(key)
    this.fitCache.delete(key)
    this.degrade.delete(key)
  }

  clearAll() {
    this.widths.clear()
    this.fitCache.clear()
    this.degrade.clear()
  }

  // Called by renderContainerBlock at vnode-build time. Matching column
  // counts render the colgroup straight into the vnode; mismatches render
  // auto and are reconciled after the patch (reconcileAfterRender).
  getRenderWidths(key, columnCount) {
    if (!key || !this.enabled()) return null
    const entry = this.widths.get(key)
    if (!entry || !Array.isArray(entry.widths)) return null
    if (columnCount < 1 || entry.widths.length !== columnCount) return null
    return entry
  }

  // ---- The honest three-mode model (T-007, R-8) ----

  // The tri-state Tables-tab preference under the option name the C-65
  // module already carried. 'fit'/'full' make that mode the default for
  // tables without an explicit choice; 'auto', any legacy boolean (the
  // retired fake-fit expansion default) and undefined all resolve to
  // Auto — content-sized, the owner gate №5 default.
  defaultMode() {
    const raw = this.muya.options && this.muya.options.tableFullWidthDefault
    if (raw === 'fit' || raw === 'full') return raw
    return 'auto'
  }

  // The effective mode of one table: the explicit session choice wins,
  // then the preference default. Auto needs no map entry.
  modeOf(key) {
    return this.modes.get(key) || this.defaultMode()
  }

  isFullWidth(key) {
    return this.modeOf(key) === 'full'
  }

  // The frame a mode distributes into: Fit page pins the frame to the
  // text column (the figure keeps the column width in every mode); Full
  // width spans the breakout viewport (window canvas minus the gutter).
  // Both shrink by the wrapper's own horizontal padding — the C-39 row
  // bar clearance is not part of the columns' frame.
  frameWidthFor(figure, mode) {
    const wrapper = figure ? figure.querySelector('div.ag-table-scroll') : null
    let frame
    if (mode === 'fit') {
      frame = figure && figure.clientWidth
    } else {
      frame = (wrapper && wrapper.clientWidth) ||
        (this.muya.container && this.muya.container.clientWidth)
    }
    if (!(frame > 0)) return frame
    if (wrapper && typeof getComputedStyle === 'function') {
      const padding = getComputedStyle(wrapper)
      frame -= (parseFloat(padding.paddingLeft) || 0) + (parseFloat(padding.paddingRight) || 0)
    }
    return frame
  }

  // Column extents with the F7 cache: invalidated by identity, structure
  // (rows × columns) or the measured font size (zoom). Null extents are
  // cached too — an unmeasurable table must not re-measure per tick.
  extentsFor(table) {
    if (!table || !table.id) return null
    const row = table.tHead && table.tHead.rows[0]
    const body = table.tBodies && table.tBodies[0]
    const font = typeof getComputedStyle === 'function'
      ? getComputedStyle(table).fontSize
      : ''
    const shape = `${body ? body.rows.length : 0}x${row ? row.cells.length : 0}@${font}`
    const pid = this.identities.get(table.id) || ''
    const cached = this.fitCache.get(table.id)
    if (cached && cached.pid === pid && cached.shape === shape) return cached.extents
    const extents = measureColumnExtents(table)
    this.fitCache.set(table.id, { pid, shape, extents })
    return extents
  }

  // The mode's column widths for the current frame (R-9/R-10): stored
  // ratios re-apply to the new frame; without ratios the shared algorithm
  // plans fresh. Degradation reports the exact overflow px.
  planModeWidths(key, figure, table, mode) {
    const frame = this.frameWidthFor(figure, mode)
    if (!Number.isFinite(frame) || frame <= 0) return null
    const entry = this.widths.get(key)
    const extents = this.extentsFor(table)
    if (entry && Array.isArray(entry.ratios) && entry.ratios.length &&
        entry.ratios.length === (table.tHead && table.tHead.rows[0] ? table.tHead.rows[0].cells.length : 0)) {
      const minima = this.degradeMinima(extents) || []
      const widths = applyRatiosToWidth(entry.ratios, frame, minima)
      if (widths) return { kind: 'ratios', widths, frame }
    }
    if (!extents) return null
    const plan = planTableFit(extents, frame)
    if (!plan) return null
    return { kind: plan.kind, widths: plan.widths, overflowPx: plan.overflowPx, frame }
  }

  // The minima the ratio re-application floors columns at (the measured
  // minContent when the extents are at hand, the module floor otherwise).
  degradeMinima(extents) {
    if (extents && Array.isArray(extents.minContent)) {
      return extents.minContent.map(w => Math.max(Number.isFinite(w) ? w : 0, MIN_COLUMN_WIDTH))
    }
    return null
  }

  // ---- DOM application ----

  // Natural widths of the current layout (used to freeze an auto table at
  // drag/wall start and to measure new/reset columns). Returns null when the
  // table has no usable layout (hidden pane, jsdom) — callers skip.
  measureColumnWidths(table) {
    const row = table.tHead && table.tHead.rows[0]
    if (!row || row.cells.length === 0) return null
    const widths = []
    for (const cell of row.cells) {
      const width = cell.getBoundingClientRect().width
      if (!Number.isFinite(width) || width <= 0) return null
      widths.push(Math.round(width))
    }
    return widths
  }

  applyWidths(table, entry) {
    let colgroup = table.querySelector('colgroup')
    if (!colgroup) {
      colgroup = document.createElement('colgroup')
      table.insertBefore(colgroup, table.firstChild)
    }
    while (colgroup.children.length < entry.widths.length) {
      colgroup.appendChild(document.createElement('col'))
    }
    while (colgroup.children.length > entry.widths.length) {
      colgroup.removeChild(colgroup.lastChild)
    }
    for (let i = 0; i < entry.widths.length; i++) {
      colgroup.children[i].style.width = `${entry.widths[i]}px`
    }
    table.classList.add(TABLE_FIXED_CLASS)
    table.style.width = `${sumWidths(entry.widths)}px`
  }

  stripWidths(table) {
    const colgroup = table.querySelector('colgroup')
    if (colgroup) colgroup.remove()
    table.classList.remove(TABLE_FIXED_CLASS)
    table.style.width = ''
  }

  // ---- Persistent identities + adoption (C-65 R-1, T-007 migration) ----

  // Walk the rendered tables in DOCUMENT ORDER, mint ordinal#signature
  // identities, adopt persisted entries into fresh block keys, drop the
  // entries whose identity disappeared, and reset a table whose identity
  // CHANGED under it (header edited — corner-2: that table's widths are
  // dropped, the others keep theirs).
  syncIdentities({ adoptPersisted = true } = {}) {
    const { container } = this.muya
    if (!container || !container.querySelectorAll) return false
    const tables = container.querySelectorAll('table.ag-paragraph')
    let ordinal = -1
    const seen = new Set()
    const presentKeys = new Set()
    let changed = false
    for (const table of tables) {
      ordinal++
      const key = table.id
      const row = table.tHead && table.tHead.rows[0]
      const signature = tableSignature(row)
      if (!key || !signature) continue
      presentKeys.add(key)
      const pid = `${ordinal}#${signature}`
      const previous = this.identities.get(key)
      if (previous !== undefined && previous !== pid) {
        this.resetTable(key)
        this.stripWidths(table)
        this.modes.delete(key)
        const changedFigure = table.closest('figure')
        if (changedFigure) {
          delete changedFigure.dataset.degradeOverflow
          this.applyModeDom(changedFigure, this.modeOf(key))
        }
        console.debug(
          `[Muya][tableResize][BLOCK_TABLE_IDENTITY_CHANGED table=${key}]`
        )
        changed = true
      }
      this.identities.set(key, pid)
      seen.add(pid)
      // A load/re-render adopts the host snapshot. A user write only needs
      // fresh identities: re-adopting the OLD snapshot here would undo the
      // mutation that is about to replace it.
      const stored = adoptPersisted && this.persisted ? this.persisted[pid] : null
      if (stored) {
        const columnCount = row.cells.length
        if (!this.widths.has(key) &&
            Array.isArray(stored.widths) && stored.widths.length === columnCount) {
          const entry = { widths: stored.widths.slice(), manual: stored.manual.slice() }
          if (stored.ratios) entry.ratios = stored.ratios.slice()
          if (stored.tableWidth) entry.tableWidth = stored.tableWidth
          this.widths.set(key, entry)
          this.applyWidths(table, entry)
          changed = true
        }
        // T-007: a stored mode adopts when the session has no explicit
        // choice yet. Legacy fit:true already arrived here as mode 'fit'
        // (sanitizePersistedEntries) — the honest Fit page.
        if (stored.mode && !this.modes.has(key)) {
          this.modes.set(key, stored.mode)
          changed = true
        }
      }
    }
    for (const key of Array.from(this.identities.keys())) {
      if (!presentKeys.has(key)) this.identities.delete(key)
    }
    for (const key of Array.from(this.modes.keys())) {
      if (!presentKeys.has(key)) this.modes.delete(key)
    }
    if (this.persisted) {
      for (const pid of Object.keys(this.persisted)) {
        if (!seen.has(pid)) {
          delete this.persisted[pid]
          changed = true
        }
      }
    }
    return changed
  }

  // The load entry the host calls with the file's profile entry (or null):
  // sanitize, adopt into the current DOM, refresh surfaces. Never writes
  // back — adoption is not a user action. With «Remember column sizes»
  // off, stored entries are not adopted (nothing is remembered).
  applyPersistedLayouts(rawEntries) {
    if (!this.rememberingSizes()) {
      this.persisted = null
      this.syncIdentities({ adoptPersisted: false })
      this.refreshTableSurfaces()
      console.debug(
        '[Muya][tableResize][BLOCK_TABLE_LAYOUTS_SKIPPED reason=remember-off]'
      )
      return
    }
    this.persisted = sanitizePersistedEntries(rawEntries)
    const adopted = this.syncIdentities()
    this.refitAll({ immediate: true })
    console.debug(
      `[Muya][tableResize][BLOCK_TABLE_LAYOUTS_APPLIED persisted=${this.persisted ? Object.keys(this.persisted).length : 0} adopted=${adopted}]`
    )
  }

  // Serialize the tables that carry a user layout (dragged columns, ratios,
  // a wall width or a mode) keyed by persistent identity. Schema v2: mode
  // replaces the legacy fullWidth/fit booleans — the migration is one-way
  // and re-running it changes nothing.
  serializeTableLayouts() {
    const entries = {}
    for (const [key, pid] of this.identities) {
      const entry = this.widths.get(key)
      const manual = !!(entry && entry.manual.some(m => m))
      const mode = this.modes.get(key)
      const tableWidth = entry && entry.tableWidth
      const ratios = entry && Array.isArray(entry.ratios) && entry.ratios.length
      if (!manual && !mode && !tableWidth && !ratios) continue
      const serialized = {
        widths: entry ? entry.widths.slice() : [],
        manual: entry ? entry.manual.slice() : []
      }
      if (mode === 'fit' || mode === 'full') serialized.mode = mode
      if (ratios) serialized.ratios = entry.ratios.slice()
      if (tableWidth) serialized.tableWidth = tableWidth
      entries[pid] = serialized
    }
    return entries
  }

  // The ONLY persistence write path (C-65 R-1: written after a real
  // resize / reset / mode toggle / wall drag — never on adoption or
  // reconciliation). The «Remember column sizes» switch (T-008) gates it.
  persist() {
    if (!this.rememberingSizes()) {
      console.debug(
        '[Muya][tableResize][BLOCK_TABLE_LAYOUTS_SKIPPED reason=remember-off]'
      )
      return
    }
    this.syncIdentities({ adoptPersisted: false })
    const entries = this.serializeTableLayouts()
    // Keep the in-memory host snapshot aligned with the just-dispatched
    // state. Later render reconciliation may adopt it, so it must never
    // retain the pre-action mode/column-width values.
    this.persisted = entries
    this.muya.eventCenter.dispatch('muya-table-layouts', { entries })
    console.debug(
      `[Muya][tableResize][BLOCK_TABLE_LAYOUTS_PERSISTED tables=${Object.keys(entries).length}]`
    )
  }

  // ---- Mode DOM application (class, breakout geometry, toolbar, cue) ----

  applyModeDom(figure, mode) {
    if (!figure) return
    const on = mode === 'full'
    figure.classList.toggle(TABLE_FULL_WIDTH_CLASS, on)
    const wrapper = figure.querySelector('div.ag-table-scroll')
    if (wrapper) {
      if (on) {
        this.applyFullWidthGeometry(figure)
      } else {
        wrapper.style.marginLeft = ''
        wrapper.style.width = ''
      }
    }
    this.updateToolbarModeDom(figure, mode)
    syncTableCue(figure, this.muya.options && this.muya.options.t)
  }

  // Size and anchor a viewport inside the scroller's full client
  // area. CSS centers a fitting table; oversized tables start at the
  // gutter. Hidden/zero-geometry surfaces retain their CSS fallback.
  applyFullWidthGeometry(figure) {
    const wrapper = figure.querySelector('div.ag-table-scroll')
    const editor = wrapper && wrapper.closest
      ? wrapper.closest('#ag-editor-id') || (this.muya.container && this.muya.container.firstElementChild)
      : null
    if (!wrapper || !editor) return
    const container = this.muya.container
    if (!container || !container.getBoundingClientRect) return
    const containerRect = container.getBoundingClientRect()
    // Zero-geometry surfaces (jsdom, hidden panes) keep the CSS margin.
    if (!containerRect || !(containerRect.width > 0)) return
    const offset = wrapper.getBoundingClientRect().left - containerRect.left + (container.scrollLeft || 0)
    if (!Number.isFinite(offset)) return
    const currentMargin = parseFloat(getComputedStyle(wrapper).marginLeft)
    if (!Number.isFinite(currentMargin)) return
    // Give CSS the available width instead of baking a possibly stale
    // table width into its position. Auto margins keep late font changes
    // centered and resolve to zero when the table exceeds this viewport.
    // The outline overlays the page; it must not shift its center or turn
    // a table that fits the editor into left-anchored overflow.
    const available = container.clientWidth || containerRect.width
    const target = FULL_WIDTH_GUTTER_PX
    wrapper.style.width = `${Math.max(0, available - FULL_WIDTH_GUTTER_PX * 2)}px`
    if (Math.round(offset) === target) return
    wrapper.style.marginLeft = `${currentMargin - offset + target}px`
  }

  // Sync the three-button mode segment's active states (the vnode renders
  // the Full state from isFullWidth; Fit/Auto are corrected here before
  // paint — the render funnel runs in the same tick).
  updateToolbarModeDom(figure, mode) {
    const buttons = figure.querySelectorAll('button.ag-table-toolbar-mode')
    for (const button of buttons) {
      const active = button.dataset.tableMode === mode
      button.classList.toggle('ag-table-toolbar-active', active)
    }
  }

  // ---- The apply funnel (render + resize entry points) ----

  // Apply one table's mode layout: fit/full distribute (or re-apply
  // ratios) into their frame, auto with a wall width re-fills that width,
  // plain auto keeps the C-39 layout. Also drives the degradation badge
  // dataset and positions the walls.
  applyTableLayout(key, figure, table) {
    if (!key || !figure || !table || !this.enabled()) return
    const mode = this.modeOf(key)
    this.applyModeDom(figure, mode)
    const entry = this.widths.get(key)
    if (mode === 'auto') {
      this.degrade.delete(key)
      delete figure.dataset.degradeOverflow
      table.classList.remove('ag-table-wrap-anywhere')
      if (entry && entry.tableWidth) {
        this.applyExplicitTableWidth(key, figure, table, entry)
      }
      this.positionTableWalls(figure, table)
      return
    }
    const plan = this.planModeWidths(key, figure, table, mode)
    if (!plan) {
      // Zero geometry (hidden pane, jsdom): keep whatever the vnode
      // rendered; the next laid-out pass (render funnel or observer)
      // applies the real layout.
      this.positionTableWalls(figure, table)
      return
    }
    const overflowing = plan.kind === 'scroll'
    // The wrap plan assumes the cells may break anywhere (R-9) — the body
    // cells already do via the shipped CSS; the class lets the header join
    // so a wrap-fittable table never scrolls over a stubborn header token.
    table.classList.toggle('ag-table-wrap-anywhere', plan.kind === 'wrap')
    if (overflowing) {
      this.degrade.set(key, plan.overflowPx)
      figure.dataset.degradeOverflow = String(Math.max(1, Math.round(plan.overflowPx)))
    } else {
      this.degrade.delete(key)
      delete figure.dataset.degradeOverflow
    }
    const next = {
      widths: plan.widths,
      // Fitted widths are the algorithm's, not the user's drag — the
      // manual flags and stored ratios survive untouched.
      manual: entry ? entry.manual.slice() : plan.widths.map(() => false)
    }
    if (entry && entry.ratios) next.ratios = entry.ratios
    if (entry && entry.tableWidth) next.tableWidth = entry.tableWidth
    this.widths.set(key, next)
    this.applyWidths(table, next)
    this.positionTableWalls(figure, table)
  }

  // T-009: the explicit side-wall width — columns refill the width from
  // the stored ratios, or the shared algorithm when none are stored (the
  // widths then carry the content-proportional layout for that width).
  applyExplicitTableWidth(key, figure, table, entry) {
    const columnCount = entry.widths.length
    const minima = this.degradeMinima(this.fitCache.get(table.id)?.extents || null) ||
      new Array(columnCount).fill(MIN_COLUMN_WIDTH)
    let widths = null
    if (Array.isArray(entry.ratios) && entry.ratios.length === columnCount) {
      widths = applyRatiosToWidth(entry.ratios, entry.tableWidth, minima)
    }
    if (!widths) {
      const extents = this.extentsFor(table)
      if (extents) {
        const plan = planTableFit(extents, entry.tableWidth)
        widths = plan ? plan.widths : null
      }
    }
    if (!widths) {
      // No measurable extents (jsdom): scale the current widths to the
      // explicit width so the wall still does something honest.
      const current = sumWidths(entry.widths)
      widths = current > 0
        ? entry.widths.map(w => Math.max(MIN_COLUMN_WIDTH, Math.round(w * entry.tableWidth / current)))
        : entry.widths.slice()
    }
    entry.widths = widths
    this.applyWidths(table, entry)
  }

  // ---- Post-render reconciliation ----

  // Called after EVERY muya render (render/index.js, next to the C-39
  // T-001 scroll restore). Keeps identities/adoptions in step, fixes
  // column-count changes (the new column takes a content-proportional
  // share and the ratios renormalise — T-008), and applies every table's
  // mode layout (the funnel the vnodes cannot carry: frame geometry).
  reconcileAfterRender() {
    if (!this.enabled()) return
    const { container } = this.muya
    if (!container || !container.querySelectorAll) return
    this.syncIdentities()
    for (const table of container.querySelectorAll('table.ag-paragraph')) {
      const key = table.id
      if (!key) continue
      const entry = this.widths.get(key)
      if (entry) {
        const row = table.tHead && table.tHead.rows[0]
        const columnCount = row ? row.cells.length : 0
        if (columnCount === 0) continue
        if (entry.widths.length !== columnCount) {
          // A new column takes its content-proportional share (the
          // measured auto width) and the ratios renormalise from the
          // resulting widths (T-008).
          const measured = this.measureColumnWidths(table)
          if (!measured) continue
          const next = reconcileWidths(entry.widths, entry.manual, columnCount, measured)
          const ratios = ratiosFromWidths(next.widths)
          const reconciled = { widths: next.widths, manual: next.manual }
          if (ratios) reconciled.ratios = ratios
          if (entry.tableWidth) reconciled.tableWidth = entry.tableWidth
          this.widths.set(key, reconciled)
          this.applyWidths(table, reconciled)
          console.debug(
            `[Muya][tableResize][BLOCK_COLUMN_COUNT_RECONCILED table=${key} columns=${columnCount}]`
          )
        } else if (!table.classList.contains(TABLE_FIXED_CLASS)) {
          // Re-apply widths a hidden/zero-geometry render could not carry.
          this.applyWidths(table, entry)
        }
      }
      const figure = table.closest("figure[data-role='TABLE']")
      if (figure) this.applyTableLayout(key, figure, table)
    }
    this.refreshTableSurfaces()
  }

  // Re-apply the mode class/geometry, refresh the cues and keep the walls
  // of every table figure in step (the surface funnel for state the
  // vnodes cannot carry).
  refreshTableSurfaces() {
    const { container, options } = this.muya
    if (!container || !container.querySelectorAll) return
    const t = options && options.t
    if (t) setTableCueTranslator(t)
    for (const figure of container.querySelectorAll("figure[data-role='TABLE']")) {
      this.observeFigure(figure)
      const table = figure.querySelector('table')
      const key = table && table.id
      if (!key) continue
      const mode = this.modeOf(key)
      if ((mode === 'full') !== figure.classList.contains(TABLE_FULL_WIDTH_CLASS)) {
        this.applyModeDom(figure, mode)
      } else if (mode === 'full') {
        this.applyFullWidthGeometry(figure)
      }
      // The walls ride every surface pass: a plain Auto document never
      // enters the apply funnel (nothing to fit), but the handles must
      // exist and stay clamped to the visible area anyway.
      if (table && mode !== 'fit') this.positionTableWalls(figure, table)
      syncTableCue(figure, t)
    }
  }

  // R-9: re-fit every laid-out table (debounced ~200 ms + rAF; immediate
  // for the adoption path).
  scheduleRefit() {
    const { container } = this.muya
    if (this.resizeObserver && (!container || !container.isConnected)) {
      // The editor surface went away — self-clean the observer.
      this.destroy()
      return
    }
    if (this.refitTimer) clearTimeout(this.refitTimer)
    this.refitTimer = setTimeout(() => {
      this.refitTimer = null
      if (this.refitFrame) cancelAnimationFrame(this.refitFrame)
      this.refitFrame = requestAnimationFrame(() => {
        this.refitFrame = 0
        this.refitAll()
      })
    }, REFIT_DEBOUNCE_MS)
  }

  refitAll() {
    this.refitNow()
  }

  refitNow() {
    if (!this.enabled()) return
    const { container } = this.muya
    if (!container || !container.querySelectorAll || !container.isConnected) return
    for (const table of container.querySelectorAll('table.ag-paragraph')) {
      const key = table.id
      const figure = table.closest ? table.closest("figure[data-role='TABLE']") : null
      if (!key || !figure) continue
      const mode = this.modeOf(key)
      // Auto tables without an explicit width re-flow natively; only the
      // framed modes (and the wall width) need the re-fit.
      if (mode === 'auto' && !(this.widths.get(key) || {}).tableWidth) continue
      this.applyTableLayout(key, figure, table)
    }
    // The surfaces keep the walls clamped to the visible area on every
    // geometry change.
    this.refreshTableSurfaces()
  }

  observeFigure(figure) {
    if (!this.resizeObserver || !figure || this.observedFigures.has(figure)) return
    this.resizeObserver.observe(figure)
    this.observedFigures.add(figure)
  }

  // ---- Toolbar + caption event routing ----

  handleToolbarMousedown = event => {
    const button = this.findTableToolbarButton(event.target)
    if (button) {
      // Let the event reach the target: WKWebView derives native button
      // activation from that path. The button is outside table rows, so
      // Muya's cell/caret mousedown handler is inert for this target.
      return
    }
    const caption = event.target && event.target.closest
      ? event.target.closest(`div.${TABLE_CAPTION_CLASS}`)
      : null
    if (caption) event.stopPropagation()
  }

  handleToolbarClick = event => {
    const button = this.findTableToolbarButton(event.target)
    if (button) return
    const caption = event.target && event.target.closest
      ? event.target.closest(`div.${TABLE_CAPTION_CLASS}`)
      : null
    if (caption) event.stopPropagation()
  }

  handleToolbarAction = event => {
    const button = this.findTableToolbarButton(event.target)
    if (!button) return
    event.preventDefault()
    event.stopImmediatePropagation()
    const action = button.dataset.tableToolbarAction
    if (action === 'setMode') {
      this.setModeFromElement(button)
    } else if (action === 'copyImage') {
      this.copyImageFromElement(button)
    } else {
      this.openViewerFromElement(button)
    }
  }

  // T-007: the toolbar's mode segment (capture-phase routed). Auto clears
  // the explicit choice (R-8: back to Auto is one click); Fit/Full record
  // the mode and re-apply the layout — stored ratios re-apply to the new
  // frame (R-10), so a Fit ↔ Full round-trip restores the proportions.
  setModeFromElement(element) {
    if (!this.enabled()) return
    const mode = element && element.dataset && element.dataset.tableMode
    if (!TABLE_MODES.includes(mode)) return
    const figure = this.findTableFigure(element)
    if (!figure) return
    const table = figure.querySelector('table')
    const key = table && table.id
    if (!key) return
    if (mode === 'auto') this.modes.delete(key)
    else this.modes.set(key, mode)
    this.applyTableLayout(key, figure, table)
    console.debug(
      `[Muya][tableResize][BLOCK_TABLE_MODE table=${key} mode=${this.modeOf(key)}]`
    )
    this.persist()
  }

  // The toolbar's Open full screen action — the same dispatch the removed
  // standalone glyph made (the blockViewer plugin resolves the figure).
  openViewerFromElement(element) {
    const figure = this.findTableFigure(element)
    if (!figure) return
    this.muya.eventCenter.dispatch('muya-block-viewer', { element: figure })
  }

  // C-70: the toolbar's Copy as image — the same host transport as the
  // diagram pill (editor.vue handleDiagramExportAction, table branch).
  copyImageFromElement(element) {
    const figure = this.findTableFigure(element)
    if (!figure) return
    this.muya.eventCenter.dispatch('muya-diagram-export', { action: 'copyImage', element: figure })
  }

  // C-65 T-003 + T-009: wrapper scrolls keep their caption/shades live
  // (scroll does not bubble; it captures) and the walls inside the
  // visible scroll area.
  handleScrollCapture = event => {
    const target = event.target
    if (!target || !target.classList || !target.classList.contains('ag-table-scroll')) return
    const figure = target.closest ? target.closest("figure[data-role='TABLE']") : null
    if (!figure) return
    const table = figure.querySelector('table')
    if (table && table.id && this.modeOf(table.id) !== 'fit' && this.enabled()) {
      this.positionTableWalls(figure, table)
    }
    syncTableCue(figure, this.muya.options && this.muya.options.t)
  }

  // ---- T-009: side walls ----

  // Ensure + position the wall handles on one figure. Walls are active
  // OUTSIDE Fit only; both walls clamp inside the wrapper's visible box
  // so a table that overflows keeps them hittable (R-11).
  positionTableWalls(figure, table) {
    if (!figure || !table) return
    if (this.modeOf(table.id || '') === 'fit' || !this.enabled()) {
      this.removeTableWalls(figure)
      return
    }
    const wrapper = figure.querySelector('div.ag-table-scroll')
    if (!wrapper) return
    if (typeof figure.getBoundingClientRect !== 'function') return
    ensureAffordanceStyles()
    const figureRect = figure.getBoundingClientRect()
    const wrapperRect = wrapper.getBoundingClientRect()
    const tableRect = table.getBoundingClientRect()
    if (!(figureRect.width > 0) || !(wrapperRect.width > 0) || !(tableRect.width > 0)) return
    const visibleLeft = Math.max(wrapperRect.left, figureRect.left)
    const visibleRight = Math.min(wrapperRect.left + wrapper.clientWidth, figureRect.right)
    const clampVisible = (x) => Math.min(Math.max(x, visibleLeft), visibleRight)
    const leftX = clampVisible(tableRect.left) - figureRect.left
    const rightX = clampVisible(tableRect.right) - figureRect.left
    const top = wrapperRect.top - figureRect.top
    const height = Math.max(1, Math.min(wrapperRect.height, figureRect.height - top))
    const ensure = (side, x) => {
      let wall = figure.querySelector(`.${TABLE_WALL_CLASS}.${TABLE_WALL_CLASS}-${side}`)
      if (!wall) {
        wall = document.createElement('span')
        wall.className = `${TABLE_WALL_CLASS} ${TABLE_WALL_CLASS}-${side}`
        wall.dataset.tableWallSide = side
        wall.setAttribute('contenteditable', 'false')
        wall.setAttribute('aria-hidden', 'true')
        figure.appendChild(wall)
      }
      wall.style.left = `${x}px`
      wall.style.top = `${top}px`
      wall.style.height = `${height}px`
      return wall
    }
    ensure('left', leftX)
    ensure('right', rightX)
  }

  removeTableWalls(figure) {
    if (!figure || !figure.querySelectorAll) return
    for (const wall of figure.querySelectorAll(`.${TABLE_WALL_CLASS}`)) {
      wall.remove()
    }
  }

  startWallDrag(event, wall) {
    const figure = this.findTableFigure(wall)
    if (!figure) return
    const table = figure.querySelector('table')
    const key = table && table.id
    if (!key) return
    const wrapper = figure.querySelector('div.ag-table-scroll')
    if (!wrapper || typeof table.getBoundingClientRect !== 'function') return
    const entry = this.widths.get(key)
    const tableRect = table.getBoundingClientRect()
    const startWidth = (entry && entry.tableWidth) || Math.round(tableRect.width)
    const columnCount = entry ? entry.widths.length : (table.tHead && table.tHead.rows[0] ? table.tHead.rows[0].cells.length : 0)
    if (!columnCount) return
    // The R-11 clamp keeps the HANDLE inside the visible scroll area —
    // positionTableWalls re-clamps the wall while the table overflows.
    // The dragged WIDTH is deliberately not clamped to the viewport: a
    // Full width table that already fills the visible area still grows
    // (and scrolls) when its wall is dragged outward.
    const minWidth = MIN_COLUMN_WIDTH * columnCount
    this.dragging = {
      kind: 'wall',
      key,
      table,
      figure,
      wrapper,
      entry,
      createdThisDrag: !entry,
      side: wall.dataset.tableWallSide || 'right',
      startX: event.clientX,
      startWidth,
      minWidth
    }
    wall.classList.add(RESIZING_HANDLE_CLASS)
    table.classList.add(RESIZING_TABLE_CLASS)
    if (typeof wall.setPointerCapture === 'function' && event.pointerId !== undefined) {
      try {
        wall.setPointerCapture(event.pointerId)
      } catch (err) {
        // Capture is an optimisation; the window listeners below keep
        // receiving the gesture either way.
      }
    }
    window.addEventListener('pointermove', this.handlePointerMove)
    window.addEventListener('pointerup', this.handlePointerUp)
    window.addEventListener('pointercancel', this.handlePointerUp)
  }

  // ---- Drag (columns + walls) ----

  handlePointerDown = event => {
    const wall = this.findWall(event.target)
    if (wall) {
      if (event.button !== undefined && event.button !== 0) return
      if (!this.enabled()) {
        event.preventDefault()
        event.stopPropagation()
        return
      }
      event.preventDefault()
      event.stopPropagation()
      this.startWallDrag(event, wall)
      return
    }
    const handle = this.findHandle(event.target)
    if (!handle) return
    if (event.button !== undefined && event.button !== 0) return
    if (!this.enabled()) {
      event.preventDefault()
      event.stopPropagation()
      return
    }
    event.preventDefault()
    event.stopPropagation()
    const th = handle.closest('th,td')
    const table = handle.closest('table')
    if (!th || !table || !table.id) return
    const key = table.id
    const columnIndex = th.cellIndex
    if (columnIndex < 0) return
    let entry = this.widths.get(key)
    const createdThisDrag = !entry
    if (!entry) {
      // First resize on this table: freeze the current auto layout as the
      // baseline (fixed layout needs a width for EVERY column; auto columns
      // beside fixed ones are not deterministic across engines).
      const measured = this.measureColumnWidths(table)
      if (!measured) return
      entry = { widths: measured, manual: measured.map(() => false) }
      this.widths.set(key, entry)
      this.applyWidths(table, entry)
    }
    this.dragging = {
      kind: 'column',
      key,
      table,
      figure: table.closest ? table.closest('figure') : null,
      columnIndex,
      entry,
      createdThisDrag,
      startX: event.clientX,
      startWidth: entry.widths[columnIndex],
      handle
    }
    handle.classList.add(RESIZING_HANDLE_CLASS)
    table.classList.add(RESIZING_TABLE_CLASS)
    this.ensureSizeChips(key, entry.widths.length)
    this.updateSizeChips()
    if (typeof handle.setPointerCapture === 'function' && event.pointerId !== undefined) {
      try {
        handle.setPointerCapture(event.pointerId)
      } catch (err) {
        // Capture is an optimisation; the window listeners below keep
        // receiving the gesture either way.
      }
    }
    window.addEventListener('pointermove', this.handlePointerMove)
    window.addEventListener('pointerup', this.handlePointerUp)
    window.addEventListener('pointercancel', this.handlePointerUp)
  }

  handlePointerMove = event => {
    const drag = this.dragging
    if (!drag) return
    if (drag.kind === 'wall') {
      const delta = drag.side === 'left' ? drag.startX - event.clientX : event.clientX - drag.startX
      const next = Math.max(drag.minWidth, Math.round(drag.startWidth + delta))
      if (next === drag.startWidth) return
      drag.nextWidth = next
      const entry = drag.entry
      // R-11: a wall drag in Full width switches the table to Auto with
      // that width; in Auto it just sets the explicit width.
      if (this.modes.get(drag.key) === 'full') {
        this.modes.set(drag.key, 'auto')
        this.applyModeDom(drag.figure, 'auto')
      }
      if (!entry) {
        const measured = this.measureColumnWidths(drag.table)
        if (!measured) return
        drag.entry = { widths: measured, manual: measured.map(() => false), tableWidth: next }
        this.widths.set(drag.key, drag.entry)
      } else {
        entry.tableWidth = next
      }
      this.applyExplicitTableWidth(drag.key, drag.figure, drag.table, drag.entry)
      this.updateWallChip(drag)
      return
    }
    const drag0 = drag
    const next = clampWidth(drag0.startWidth + (event.clientX - drag0.startX))
    if (next === drag0.entry.widths[drag0.columnIndex]) return
    drag0.entry.widths[drag0.columnIndex] = next
    // R-9: a drag in Fit/Full fixes that column and re-fits the remainder —
    // the table never leaves its frame. Auto keeps the C-39 freeze
    // behaviour (the table is content-sized).
    const mode = this.modeOf(drag0.key)
    if (mode !== 'auto') {
      const frame = this.frameWidthFor(drag0.figure, mode)
      if (Number.isFinite(frame) && frame > 0) {
        const extents = this.extentsFor(drag0.table)
        const minima = this.degradeMinima(extents)
        const maxima = extents && Array.isArray(extents.maxContent)
          ? extents.maxContent
          : null
        this.refitRemainder(drag0.entry, drag0.columnIndex, frame, minima, maxima)
      }
    }
    // T-008: the drag writes both — px and the stored proportions.
    const ratios = ratiosFromWidths(drag0.entry.widths)
    if (ratios) drag0.entry.ratios = ratios
    this.applyWidths(drag0.table, drag0.entry)
    this.updateSizeChips()
  }

  // Re-distribute every column but `fixedIndex` into frame − fixedWidth,
  // honouring the measured minima/maxima (R-9). Under degradation pressure
  // the remainder keeps its minimal sizes.
  refitRemainder(entry, fixedIndex, frame, minima, maxima) {
    const count = entry.widths.length
    const fixed = entry.widths[fixedIndex]
    const others = []
    for (let i = 0; i < count; i++) {
      if (i !== fixedIndex) others.push(i)
    }
    const free = frame - fixed
    const othersMin = minima
      ? others.map(i => minima[i])
      : others.map(() => MIN_COLUMN_WIDTH)
    const othersMax = maxima
      ? others.map(i => Math.max(maxima[i], othersMin[others.indexOf(i)]))
      : others.map(i => Math.max(entry.widths[i], othersMin[others.indexOf(i)]))
    const need = othersMin.reduce((total, w) => total + w, 0)
    let distributed
    if (free >= need) {
      distributed = distributeIntoFrame(othersMin, othersMax, free)
    } else {
      // Degradation: minimal sizes (the table then overflows by the
      // reported px — the badge states it).
      distributed = othersMin
    }
    if (!distributed) return
    others.forEach((index, position) => {
      entry.widths[index] = Math.max(MIN_COLUMN_WIDTH, Math.round(distributed[position]))
    })
  }

  handlePointerUp = () => {
    const drag = this.dragging
    if (!drag) return
    this.dragging = null
    window.removeEventListener('pointermove', this.handlePointerMove)
    window.removeEventListener('pointerup', this.handlePointerUp)
    window.removeEventListener('pointercancel', this.handlePointerUp)
    if (drag.kind === 'wall') {
      const wall = drag.figure.querySelector(`.${TABLE_WALL_CLASS}.${TABLE_WALL_CLASS}-${drag.side}`)
      if (wall) wall.classList.remove(RESIZING_HANDLE_CLASS)
      drag.table.classList.remove(RESIZING_TABLE_CLASS)
      const moved = drag.nextWidth !== undefined && drag.nextWidth !== drag.startWidth
      if (moved) {
        console.debug(
          `[Muya][tableResize][BLOCK_TABLE_WALL_WIDTH table=${drag.key} width=${drag.entry.tableWidth}]`
        )
        if (drag.figure) syncTableCue(drag.figure, this.muya.options && this.muya.options.t)
        this.fadeChips(drag.figure)
        this.persist()
      } else if (drag.createdThisDrag) {
        this.widths.delete(drag.key)
      }
      return
    }
    drag.handle.classList.remove(RESIZING_HANDLE_CLASS)
    drag.table.classList.remove(RESIZING_TABLE_CLASS)
    const figure = drag.table.closest ? drag.table.closest('figure') : null
    const moved = Math.abs(drag.entry.widths[drag.columnIndex] - drag.startWidth) >= 1
    if (moved) {
      drag.entry.manual[drag.columnIndex] = true
      console.debug(
        `[Muya][tableResize][BLOCK_COLUMN_RESIZED table=${drag.key} col=${drag.columnIndex} width=${drag.entry.widths[drag.columnIndex]}]`
      )
      // C-65 R-1: a real resize is the only thing that writes widths.
      if (figure) syncTableCue(figure, this.muya.options && this.muya.options.t)
      this.fadeChips(figure)
      this.persist()
    } else {
      // A plain click on the handle (no move) must not silently freeze the
      // table at its auto widths — undo the baseline created on pointerdown.
      this.fadeChips(figure)
      if (drag.createdThisDrag) {
        this.resetTable(drag.key)
        this.stripWidths(drag.table)
      }
    }
  }

  // Double-click resets THAT column to auto: drop the fixed layout, let the
  // browser lay the table out auto once (synchronous read — nothing is
  // painted in between), and either restore fixed layout with the measured
  // natural width for the reset column (other columns still manual) or —
  // when no manual column remains — return the whole table to auto layout.
  // C-65 R-3: both outcomes persist. On a WALL the double-click resets the
  // explicit table width (T-009).
  handleDoubleClick = event => {
    const wall = this.findWall(event.target)
    if (wall) {
      event.preventDefault()
      event.stopPropagation()
      if (!this.enabled()) return
      const figure = this.findTableFigure(wall)
      const table = figure && figure.querySelector('table')
      const key = table && table.id
      const entry = key && this.widths.get(key)
      if (!figure || !table || !key) return
      if (!entry || !entry.tableWidth) return // nothing wall-set to reset
      delete entry.tableWidth
      const mode = this.modeOf(key)
      if (mode === 'auto') {
        // Back to plain content sizing.
        this.resetTable(key)
        this.stripWidths(table)
      } else {
        this.applyTableLayout(key, figure, table)
      }
      console.debug(`[Muya][tableResize][BLOCK_TABLE_WALL_RESET table=${key}]`)
      syncTableCue(figure, this.muya.options && this.muya.options.t)
      this.persist()
      return
    }
    const handle = this.findHandle(event.target)
    if (!handle) return
    event.preventDefault()
    event.stopPropagation()
    if (!this.enabled()) return
    const th = handle.closest('th,td')
    const table = handle.closest('table')
    if (!th || !table || !table.id) return
    const key = table.id
    const columnIndex = th.cellIndex
    const entry = this.widths.get(key)
    if (!entry) return // already auto — nothing to reset
    const figure = table.closest('figure')
    const othersManual = entry.manual.some((m, i) => m && i !== columnIndex)
    if (!othersManual) {
      this.resetTable(key)
      this.stripWidths(table)
      // T-007: in Fit/Full the reset falls back to the mode's own layout.
      if (figure && this.modeOf(key) !== 'auto') {
        this.applyTableLayout(key, figure, table)
      }
      console.debug(`[Muya][tableResize][BLOCK_COLUMN_RESET table=${key} col=${columnIndex} mode=auto]`)
      if (figure) syncTableCue(figure, this.muya.options && this.muya.options.t)
      this.persist()
      return
    }
    this.stripWidths(table)
    const row = table.tHead && table.tHead.rows[0]
    const cell = row ? row.cells[columnIndex] : null
    if (cell) {
      entry.widths[columnIndex] = Math.round(cell.getBoundingClientRect().width)
    }
    entry.manual[columnIndex] = false
    const ratios = ratiosFromWidths(entry.widths)
    if (ratios) entry.ratios = ratios
    this.applyWidths(table, entry)
    console.debug(
      `[Muya][tableResize][BLOCK_COLUMN_RESET table=${key} col=${columnIndex} width=${entry.widths[columnIndex]}]`
    )
    if (figure) syncTableCue(figure, this.muya.options && this.muya.options.t)
    this.persist()
  }

  // ---- T-009: % · px chips ----

  ensureSizeChips(key, count) {
    const figure = this.dragging && this.dragging.figure
    if (!figure) return null
    ensureAffordanceStyles()
    let container = figure.querySelector(`.${TABLE_SIZE_CHIPS_CLASS}`)
    if (!container) {
      container = document.createElement('div')
      container.className = TABLE_SIZE_CHIPS_CLASS
      container.setAttribute('aria-hidden', 'true')
      figure.appendChild(container)
    }
    container.classList.remove('ag-table-chips-fade')
    while (container.children.length < count) {
      const chip = document.createElement('span')
      chip.className = 'ag-table-size-chip'
      container.appendChild(chip)
    }
    while (container.children.length > count) {
      container.removeChild(container.lastChild)
    }
    return container
  }

  // Position + label one chip per column over the live layout.
  updateSizeChips() {
    const drag = this.dragging
    if (!drag || drag.kind !== 'column') return
    const figure = drag.figure
    const container = figure && figure.querySelector(`.${TABLE_SIZE_CHIPS_CLASS}`)
    const table = drag.table
    if (!container || !figure || typeof table.getBoundingClientRect !== 'function') return
    const figureRect = figure.getBoundingClientRect()
    const tableRect = table.getBoundingClientRect()
    if (!(figureRect.width > 0) || !(tableRect.width > 0)) return
    const total = drag.entry.widths.reduce((sum, w) => sum + w, 0) || 1
    const top = Math.max(0, tableRect.top - figureRect.top - 24)
    let cursor = tableRect.left
    drag.entry.widths.forEach((width, index) => {
      const chip = container.children[index]
      if (!chip) return
      const center = cursor + width / 2
      // Clamp into the visible figure so chips stay readable when the
      // table overflows the column.
      const clamped = Math.min(Math.max(center, figureRect.left + 14), figureRect.right - 14)
      chip.style.left = `${clamped - figureRect.left}px`
      chip.style.top = `${top}px`
      chip.textContent = `${Math.round(width / total * 100)}% · ${width} px`
      cursor += width
    })
  }

  // One chip at the wall: the explicit table width being set.
  updateWallChip(drag) {
    const figure = drag.figure
    const container = figure && figure.querySelector(`.${TABLE_SIZE_CHIPS_CLASS}`)
    const table = drag.table
    if (!container || !figure || typeof table.getBoundingClientRect !== 'function') return
    const figureRect = figure.getBoundingClientRect()
    const tableRect = table.getBoundingClientRect()
    if (!(figureRect.width > 0) || !(tableRect.width > 0)) return
    let chip = container.children[0]
    if (!chip) {
      chip = document.createElement('span')
      chip.className = 'ag-table-size-chip'
      container.appendChild(chip)
    }
    chip.style.left = `${Math.min(Math.max(tableRect.right, figureRect.left + 14), figureRect.right - 14) - figureRect.left}px`
    chip.style.top = `${Math.max(0, tableRect.top - figureRect.top - 24)}px`
    chip.textContent = `${drag.entry.tableWidth} px`
  }

  fadeChips(figure) {
    const container = figure && figure.querySelector(`.${TABLE_SIZE_CHIPS_CLASS}`)
    if (!container) return
    container.classList.add('ag-table-chips-fade')
    setTimeout(() => container.remove(), CHIPS_FADE_MS)
  }
}
// END_BLOCK_TABLE_RESIZE_INTERACTION

export default TableResize
