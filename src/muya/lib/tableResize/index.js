// FILE: src/muya/lib/tableResize/index.js
// VERSION: 3.4.4
// START_MODULE_CONTRACT
//   PURPOSE: Table sizing and resize affordances in Auto (content-sized), Fit page (text frame) and Full width (window canvas). All modes wrap or squeeze rather than internally scroll; explicit Auto reset drops fixed widths. Fit/Full external edges are pinned, Auto alone exposes external walls, and internal borders remain draggable at full table height.
//   SCOPE: Session widths/manual flags/ratios, persistent identities and schema-v2 adoption, null-measurement retry, fixed-geometry wrapping through Auto reconciliation, proportional fitting, adjacent-pair framed drags, mode-bounded partial reset and bounded Auto drag, mode toolbar routing, transparent hit zones and size chips, window/container resize refresh, generation-guarded delayed adoption and transform-preserving repaint teardown. Markdown and undo remain unchanged. Archived degradation contracts are superseded by the active stabilization change.
//   DEPENDS: muya.eventCenter (capture- and bubble-phase DOM events on muya.container), window pointer events during a drag, ResizeObserver (jsdom degrades to render-time evaluation only), DOM colgroup/th measuring; ./tableFit (measureColumnExtents, planTableFit, distributeIntoFrame, applyRatiosToWidth, ratiosFromWidths); ./tableCue (cue sync + TABLE_FULL_WIDTH_CLASS + the degradation badge formatting); ../parser/render/renderBlock/renderTableToolbar (the mode segment for the live active-state swap).
//   LINKS: .grace/changes/archive/C-STABILIZE-PRODUCT-REPAIRS; .grace/changes/active/C-PAGE-WIDTH-TABLES (plan T-007/T-008/T-009, spec R-8/R-9/R-10/R-11, corners C-7/C-8/C-9/C-10); .grace/graph/performance.xml M-061 and runtime.xml M-012 fn-tableResize; .grace/verification/runtime.xml V-M-012 scenario-21/scenario-66 and verification/performance.xml V-M-061; .grace/changes/archive/C-39 T-002; .grace/changes/archive/C-65 T-001/T-002/T-004; renderContainerBlock START_BLOCK_TABLE_COLUMN_WIDTHS, START_BLOCK_TABLE_COLUMN_RESIZER_HANDLE and START_BLOCK_TABLE_TOOLBAR_AND_CAPTION; render/index.js START_BLOCK_TABLE_WIDTHS_KEEP; renderer util tableLayoutStore.js (schema v2) + tableLayoutRatios.js (the store-side ratio maths) + editor.vue BLOCK_TABLE_LAYOUTS_HOST (the prefs host side); store/preferences.js tableFullWidthDefault/rememberTableColumnSizes (the Tables-tab keys this module consumes).
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
//   TABLE_WALL_CLASS - class of the Auto-only side-wall drag handles.
//   TABLE_COLUMN_WALL_CLASS - full-height internal-border hit zone class.
//   TABLE_COLUMN_WALLS_CLASS - transparent host for internal-border hit zones.
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
//   CURRENT: 2026-11-10 C-TABLE-FITTED-RESET: partial column resets
//   pass through the selected Fit/Full layout before persistence, so
//   measured natural widths cannot leave a wider-than-frame table.
//   CURRENT: 2026-11-10 C-TABLE-SEQUENTIAL-RESIZE: Fit/Full internal
//   borders transfer width only between their adjacent columns. Manual
//   ratios keep the resize minimum through refit, and active gestures
//   retain their entry identity and pointer-down geometry.
//   CURRENT: 2026-11-10 C-STABILIZE-AUTO-RESIZE-WRAP: Auto restores wrap
//   chrome for fixed/session entries across reconciliation, including narrow
//   columns whose border box fits but whose content minimum does not. Natural
//   Auto and explicit reset remain unwrapped while content fits.
//   LAST_CHANGE: 2026-11-09 C-STABILIZE-PRODUCT-REPAIRS: accepted owner smoke repairs integrated; lifecycle, sizing and accessible controls verified by focused gates.
//   PREV: v3.4.1 - 2026-11-09 owner audit: sumWidths is honest
//   rounding (re-flooring squeezed columns to the drag minimum
//   re-inflated a 30-column table back out of the frame); the Auto reset
//   REBUILDS the walls (the switch into Fit/Full removed them); a window
//   resize listener refreshes walls/zones (WebKit's observer missed
//   them — the owner's stale outer handles).
//   PREV: v3.4.0 - 2026-11-09 owner convention: outer edges are
//   PINNED in Fit (text column) and Full (window canvas) — side walls
//   exist in AUTO only, and the last header handle (the outer edge) is
//   gated off in Fit/Full; only INTERNAL column borders stay draggable
//   there. The one-way ghost clip (v3.3.2) keeps the retired scroll dead.
//   PREV: v3.3.2 - 2026-11-09 owner repro: the ghost-tail clip is
//   ONE-WAY — a mid-transition pass over the stale Full-width layout
//   wrote the scroll back on and left the final 1px tail swipeable
//   (the live tail meter caught tail=1 with the clip erased). The clip
//   only ever turns on; real overflow no longer exists by mandate.
//   PREV: v3.3.1 - 2026-11-08 owner smoke: the ghost-scrollbar tail
//   clips up to 8px (border-collapse + fractional widths still left 1-2px
//   that a trackpad swipe surfaced as the system overlay scrollbar) and
//   the clip re-runs on every mode switch.
//   PREV: v3.3.0 - 2026-11-08 owner smoke: the left side wall
//   clamps to the WRAPPER's box (not the figure's) — the Full-width
//   breakout extends the table left of the figure, and the old clamp
//   pinned that wall inside the column, off the real edge. Plus, with
//   tableFit v1.1.0, the scrollable degradation is retired everywhere:
//   unwrappable minima squeeze proportionally (mid-token breaks), Auto
//   folds wide content with wrap-anywhere instead of scrolling.
//   PREV: v3.2.3 - 2026-11-07 owner smoke: the zones' host
//   coordinates drop the wrapper-padding compensation — since the
//   wrapper became the positioned anchor (v3.2.1) that compensation
//   shifted the body-level zones a padding-width off the borders in
//   Auto (the header handles stayed true).
//   PREV: v3.2.2 - 2026-11-07 owner smoke: a NULL column-extents
//   verdict is never cached — one mid-transition measurement failure
//   froze every later Fit/Full plan for that table (Fit kept the
//   auto-wide layout and scrolled the last column out of view).
//   PREV: v3.2.1 - 2026-11-07 owner smoke (Full width): the
//   scroll wrapper is position:relative (index.css) so the column zones'
//   host anchors to the wrapper — the zones sat one breakout-margin right
//   of the real borders and the host poked 2px past the viewport opening
//   the phantom scrollbar; the zones are also recomputed right after the
//   breakout geometry lands.
//   PREV: v3.2.0 - 2026-11-07 owner smoke: (1) choosing Auto
//   RESETS the table to its content width — the session's fixed widths
//   and the explicit table width drop with the mode, and a stored Auto
//   layout re-adopts no widths; (2) Full width always fits the canvas —
//   stored ratios that do not fit the frame fall through to the honest
//   wrapping plan, and the zones host is clamped to the wrapper so it
//   cannot open the editor's phantom scrollbar; (3) with renderTableToolbar
//   v2.3.0, Open full screen rides beside the mode segment, left of Copy.
//   PREV: v3.1.2 - 2026-11-05 live-smoke fix: every applied
//   width change repaints the wrapper's compositing layer — WKWebView
//   kept STALE border-coloured table outlines painted at the old
//   position after a persisted-layout shift (the stray line above the
//   table; Chromium never shows it). Plus: every added layer declares
//   background: transparent (generic span/[contenteditable] rules paint
//   unknown elements, which turned the walls host into a solid block
//   over the table).
//   PREV: v3.1.1 - 2026-11-05 live-smoke fixes: (a) the column
//   walls' stylesheet is injected by ensureColumnWalls itself — the first
//   Fit-page layout created the spans before any wall path injected the
//   styles, leaving them in-flow and breaking the figure; (b) the tail
//   scrollbar clip never touches Full width (its overflow is CSS-owned
//   visible — an inline 'hidden' clipped the breakout table); (c) the
//   side walls clamp to the wrapper's visible box only — clamping to the
//   narrow figure pulled them over the Full-width table.
//   PREV: v3.1.0 - 2026-11-05 owner review: full-height column
//   walls — every internal column border is now draggable (and
//   double-click resettable) along the WHOLE table height, not only in
//   the header row: one 6px span per boundary inside a host overlaying
//   the table, positioned in the wrapper's content coordinates so it
//   scrolls with the table. The header handles stay (hover parity); the
//   outer edges stay the side walls' business (R-11).
//   PREV: v3.0.3 - 2026-11-05 fix: walls follow every width
//   change. Column drags, wall drags and the three double-click reset
//   paths applied new widths without repositioning the side walls, so a
//   widened table kept its right wall painted at the OLD edge — an extra
//   "fixed border" inside the table (owner smoke 2026-11-05). Every
//   width-mutating path now calls positionTableWalls after applying.
//   PREV: v3.0.2 - 2026-11-02 fix: the wall/border overlap split.
//   The right wall is centered on the table's outer edge, which is also
//   the last column's C-39 border — the wall swallowed the border drag
//   there (a scrolled-to-end table could no longer resize its last
//   column). The zones now split at 1 px inside the cell: the C-39 border
//   owns the deeper zone (pointerdown drag AND double-click reset), the
//   wall keeps its center, the whole outward half and the overflow clamp
//   point.
//   PREV: v3.0.1 - 2026-11-02 fix: applyTableLayout re-syncs the
//   caption AFTER the degradeOverflow dataset write. applyModeDom's
//   caption sync ran BEFORE the new plan's badge fact existed, so a
//   switch between two degrading modes (Full → Fit) left the previous
//   mode's px on the badge and a degraded → Auto switch kept the whole
//   stale badge (with its accent paint) on a table that now scrolls
//   honestly in Auto.
//   PREV: v3.0.0 - 2026-11-02 C-PAGE-WIDTH-TABLES T-007/T-008/T-009:
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
  ratiosFromWidths,
  snapWidthsToInt
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
// Owner 2026-11-05: full-height column border hit zones (one per internal
// boundary) and their host inside the scroll wrapper.
export const TABLE_COLUMN_WALL_CLASS = 'ag-column-wall'
export const TABLE_COLUMN_WALLS_CLASS = 'ag-column-walls'
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

// Owner mandate 2026-11-07 (no table scrolling) needs plans that squeeze
// columns below the drag minimum (a 30-column table in a narrow page):
// the SUM is honest rounding, never re-floored to MIN_COLUMN_WIDTH —
// re-flooring here re-inflated a squeezed plan back out of the frame
// (owner 2026-11-09: 26px columns summed as 48px ones = 1440px).
export const sumWidths = widths => widths.reduce((total, w) => total + Math.max(1, Math.round(w)), 0)

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
    if (TABLE_MODES.includes(value.mode)) mode = value.mode
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
/* The editor's ordinary 4em cell-content minimum must yield with the
   squeezed column. Otherwise the table box fits while its text still
   paints and scrolls beyond the last column. */
.ag-table-wrap-anywhere .ag-cell-content {
  min-width: 0;
  overflow-wrap: anywhere;
}
.${TABLE_WALL_CLASS} {
  position: absolute;
  top: 0;
  width: 12px;
  margin-left: -6px;
  cursor: ew-resize;
  z-index: 3;
  background: transparent;
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
.${TABLE_COLUMN_WALLS_CLASS} {
  position: absolute;
  pointer-events: none;
  /* The editor's generic span/[contenteditable] rules paint backgrounds on
     unknown elements — every layer we add must opt out explicitly, or it
     renders as a solid block over the table (owner live smoke 2026-11-05). */
  background: transparent;
}
.${TABLE_COLUMN_WALL_CLASS} {
  position: absolute;
  width: 6px;
  margin-left: -3px;
  cursor: col-resize;
  z-index: 2;
  pointer-events: auto;
  background: transparent;
  user-select: none;
  -webkit-user-select: none;
}
.${TABLE_COLUMN_WALL_CLASS}::before {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  left: 2.5px;
  width: 1px;
  background: transparent;
}
.${TABLE_COLUMN_WALL_CLASS}:hover::before,
.${TABLE_COLUMN_WALL_CLASS}.ag-resizing::before {
  background: var(--chromeAccent, var(--themeColor));
}
/* Owner convention 2026-11-09: the LAST header handle IS the table's
   outer edge — in Fit/Full the outer edges are pinned to the page/window
   and must not invite a drag. Auto keeps it (content-sized table). */
figure.ag-table-fit div.ag-table-scroll table th:last-child .ag-column-resizer,
figure.ag-table-full-width div.ag-table-scroll table th:last-child .ag-column-resizer {
  display: none;
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
    this.destroyed = false
    this.layoutGeneration = 0
    this.adoptionFrame = 0
    this.repaintFrames = new Map()
    // WebKit's container ResizeObserver does not always re-run the wall/
    // zone geometry on a WINDOW resize (Chromium does); the owner saw the
    // outer handles sit stale after resizing (2026-11-09). A plain window
    // resize listener refreshes them directly.
    this.handleWindowResize = () => {
      if (!this.muya.container || !this.muya.container.querySelectorAll) return
      const tables = this.muya.container.querySelectorAll('table.ag-paragraph')
      for (const table of tables) {
        if (!table.id) continue
        const figure = table.closest('figure')
        if (!figure) continue
        this.positionTableWalls(figure, table)
        this.ensureColumnWalls(table)
        this.clipTailScrollbar(table)
      }
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('resize', this.handleWindowResize)
    }
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
    this.destroyed = true
    this.layoutGeneration++
    if (this.adoptionFrame) cancelAnimationFrame(this.adoptionFrame)
    this.adoptionFrame = 0
    for (const [table, paint] of this.repaintFrames) {
      cancelAnimationFrame(paint.frame)
      if (table.style.transform === paint.applied) table.style.transform = paint.previous
    }
    this.repaintFrames.clear()
    if (typeof window !== 'undefined' && this.handleWindowResize) {
      window.removeEventListener('resize', this.handleWindowResize)
    }
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

  // R-11 affordance priority: the right/left wall is centered on the
  // table's outer edge, and that edge IS the last column's C-39 border —
  // the two hit zones coincide when the edge is visible. The zones split
  // at 1 px inside the cell: the column border owns the deeper zone (the
  // shipped border drag grabs 2 px in), the wall keeps its center and the
  // whole outward half (the shipped wall drag grabs the center) — and the
  // wall keeps its full hit zone at the overflow clamp point, where no
  // border sits beneath it.
  wallOverlappedResizer(event, wall) {
    if (!event || typeof event.clientX !== 'number' || !Number.isFinite(event.clientX)) return null
    const figure = wall && wall.closest ? wall.closest("figure[data-role='TABLE']") : null
    const table = figure && figure.querySelector('div.ag-table-scroll > table')
    const headRow = table && table.tHead && table.tHead.rows[table.tHead.rows.length - 1]
    const lastTh = headRow && headRow.cells[headRow.cells.length - 1]
    if (!lastTh) return null
    const resizer = lastTh.querySelector(`.${RESIZER_CLASS}`)
    if (!resizer || typeof resizer.getBoundingClientRect !== 'function') return null
    const rect = resizer.getBoundingClientRect()
    if (!(rect.width > 0) || !(rect.height > 0)) return null
    if (
      event.clientX < rect.left || event.clientX > rect.right - 1 ||
      event.clientY < rect.top || event.clientY > rect.bottom
    ) return null
    return resizer
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
  // then the preference default. Explicit Auto overrides a non-Auto default.
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
    // A border-collapse table OCCUPIES one pixel beyond its style width —
    // the final column's collapsed border paints outside the fixed-layout
    // box, so a frame-filling table always showed a 1px overflow and the
    // phantom mini-scrollbar (owner smoke 2026-11-05). Reserve it here.
    frame -= 1
    return frame
  }

  // Column extents with the F7 cache: invalidated by identity, structure
  // (rows × columns) or the measured font size (zoom). A null verdict is never
  // cached (owner 2026-11-07) — a mid-transition null froze every later
  // plan; the next call re-measures.
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
    // A NULL verdict is NOT cached: nulls come from moments the layout
    // could not be measured yet (a mode switch mid-transition, a hidden
    // pane) — caching one froze every later fit/full plan for that table
    // (owner 2026-11-07: switching to Fit kept the auto-wide table and
    // pushed the last column into the wrapper scroll). The next call
    // re-measures; successful measurements still cache normally.
    if (extents) this.fitCache.set(table.id, { pid, shape, extents })
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
      // A user-chosen ratio is allowed to wrap below min-content. Using
      // intrinsic minima here expands narrow manual columns on the next
      // observer/render pass and erases the border the user just placed.
      const manualGeometry = (Array.isArray(entry.manual) && entry.manual.some(Boolean)) ||
        (this.dragging && this.dragging.kind === 'column' && this.dragging.key === key && this.dragging.hasMoved)
      const minima = manualGeometry
        ? entry.widths.map(() => MIN_COLUMN_WIDTH)
        : this.degradeMinima(extents) || []
      const widths = applyRatiosToWidth(entry.ratios, frame, minima)
      // Owner 2026-11-07: stored ratios may NOT fit the frame (the ratio
      // floors are the plain minima; a narrow canvas leaves their sum
      // above it). A table that overflows its mode's frame scrolls the
      // page — Full width must fall through to the honest plan, which
      // wraps anywhere and only then degrades.
      if (widths && sumWidths(widths) <= frame + 1) {
        return { kind: 'ratios', widths, frame }
      }
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
    table.classList.add(TABLE_FIXED_CLASS, 'ag-table-wrap-anywhere')
    table.style.width = `${sumWidths(entry.widths)}px`
    this.clipTailScrollbar(table)
    this.ensureColumnWalls(table)
    this.repaintTableLayer(table)
  }

  // WKWebView keeps STALE TABLE BORDERS painted when the colgroup widths
  // move a fixed-layout table after its first paint (the owner's stray
  // horizontal line above the table — border-coloured ghosts of the old
  // position; Chromium never shows them). Toggling a compositing layer
  // repaints the table cleanly.
  repaintTableLayer(table) {
    if (!table || typeof table.getBoundingClientRect !== 'function') return
    const tr = table.getBoundingClientRect()
    if (!(tr.width > 0)) return
    // Preserve a caller's transform across repeated repaint requests and
    // teardown. An obsolete frame must not clear a newer layer or style.
    if (this.destroyed) return
    const pending = this.repaintFrames.get(table)
    if (pending) cancelAnimationFrame(pending.frame)
    const previous = pending && table.style.transform === pending.applied
      ? pending.previous
      : table.style.transform
    const applied = previous ? `${previous} translateZ(0)` : 'translateZ(0)'
    table.style.transform = applied
    const paint = { previous, applied, frame: 0 }
    paint.frame = requestAnimationFrame(() => {
      if (this.repaintFrames.get(table) !== paint) return
      if (table.style.transform === applied) table.style.transform = previous
      this.repaintFrames.delete(table)
    })
    this.repaintFrames.set(table, paint)
  }

  // Collapsed-border/fractional geometry can leave a small empty tail.
  // The accepted ghost-tail clip is one-way; fitting and drag planning
  // must keep real cell content inside the frame before clipping it.
  clipTailScrollbar(table) {
    const wrapper = table.closest ? table.closest('div.ag-table-scroll') : null
    if (!wrapper) return
    // Full width owns its overflow in CSS (visible — the editor scrolls);
    // an inline 'hidden' here CLIPPED the breakout table at the wrapper's
    // edge (owner smoke 2026-11-05: "cut by invisible page borders").
    // Owner 2026-11-08: a tail up to 8px is ghost geometry (the collapsed
    // border + fractional widths), never real content — a trackpad swipe
    // still surfaced the system overlay scrollbar over it. The clip is
    // ONE-WAY (owner 2026-11-09): a mid-transition clip pass measured the
    // stale Full-width layout (tail > 8), wrote '' back and left the final
    // 1px tail scrollable. Real overflow no longer exists by mandate, so
    // the clip only ever turns ON.
    const tail = wrapper.scrollWidth - wrapper.clientWidth
    if (tail <= 8) wrapper.style.overflowX = 'hidden'
  }

  stripWidths(table) {
    const colgroup = table.querySelector('colgroup')
    if (colgroup) colgroup.remove()
    table.classList.remove(TABLE_FIXED_CLASS)
    table.style.width = ''
    // The ghost-tail clip stays (one-way — see clipTailScrollbar).
    this.ensureColumnWalls(table)
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
        // Owner 2026-11-07: a stored Auto layout carries NO widths — Auto
        // IS the content-sized state; re-adopting stale widths resurrected
        // the fixed layout the owner just reset away.
        const storedMode = stored.mode || null
        if (storedMode !== 'auto' && !this.widths.has(key) &&
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
    const generation = ++this.layoutGeneration
    if (this.adoptionFrame) cancelAnimationFrame(this.adoptionFrame)
    this.adoptionFrame = 0
    if (this.destroyed) return
    const container = this.muya.container
    const tables = Array.from(container.querySelectorAll('table.ag-paragraph'))
    const isCurrent = () => !this.destroyed && generation === this.layoutGeneration &&
      this.muya.container === container && tables.every(table => container.contains(table))
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
    const adopted = this.syncIdentities({ adoptPersisted: false })
    // Adoption happens AFTER the browser has painted the document once
    // (double rAF): applying stored widths before the first paint left
    // WKWebView painting the table's collapsed borders at BOTH the old
    // and the new position — the owner's stray line above the table.
    const apply = () => {
      if (!isCurrent()) return
      this.adoptionFrame = 0
      this.syncIdentities()
      this.refitAll({ immediate: true })
      this.refreshTableSurfaces()
      console.debug(
        `[Muya][tableResize][BLOCK_TABLE_LAYOUTS_APPLIED persisted=${this.persisted ? Object.keys(this.persisted).length : 0} adopted=${adopted}]`
      )
    }
    if (typeof requestAnimationFrame === 'function') {
      this.adoptionFrame = requestAnimationFrame(() => {
        if (!isCurrent()) return
        this.adoptionFrame = requestAnimationFrame(apply)
      })
    } else {
      apply()
    }
    return
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
      if (TABLE_MODES.includes(mode)) serialized.mode = mode
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
    // Mode marker for CSS affordance gates (the LAST header handle is the
    // table's outer edge — inactive in Fit/Full by the owner convention
    // 2026-11-09: outer edges are pinned to the page/window there).
    figure.classList.toggle('ag-table-fit', mode === 'fit')
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
    if (wrapper) {
      const tbl = wrapper.querySelector('table')
      if (tbl) this.clipTailScrollbar(tbl)
    }
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
    if (Math.round(offset) !== target) {
      wrapper.style.marginLeft = `${currentMargin - offset + target}px`
    }
    // The breakout margin moves the wrapper's padding box — the column
    // zones (absolute children of the wrapper) must be recomputed AFTER
    // it lands, or they sit one margin-width right of the real borders
    // (owner 2026-11-07: the blue hover line off the column boundary).
    const tbl = wrapper.querySelector('table')
    if (tbl) this.ensureColumnWalls(tbl)
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
      // Natural Auto tables keep their content width while it fits. A
      // wide natural/manual layout needs an actual fitting plan: merely
      // hiding overflow or allowing word breaks leaves max-content tables
      // wide and conceals their final columns.
      if (!entry && table.querySelector('colgroup')) this.stripWidths(table)
      // Fixed widths still need wrapping even when their border box fits:
      // a 48px column must not retain the cell-content 4em minimum. Vnodes
      // carry the fixed class/colgroup, so restore this after every render.
      // Natural Auto/reset has no entry and keeps content sizing.
      table.classList.toggle('ag-table-wrap-anywhere', !!entry)
      const frame = this.frameWidthFor(figure, 'fit')
      if (entry && entry.tableWidth) {
        this.applyExplicitTableWidth(key, figure, table, entry)
      } else if (frame > 0 && table.getBoundingClientRect().width > frame + 1) {
        const plan = planTableFit(this.extentsFor(table), frame)
        if (plan) {
          table.classList.add('ag-table-wrap-anywhere')
          if (entry) entry.widths = plan.widths
          this.applyWidths(table, entry || { widths: plan.widths })
        }
      }
      this.positionTableWalls(figure, table)
      // The badge fact was deleted after applyModeDom's caption sync —
      // re-sync so the caption drops the stale degradation text (v3.0.1).
      syncTableCue(figure, this.muya.options && this.muya.options.t)
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
    // The wrap plan assumes the cells may break anywhere (R-9) — the body
    // cells already do via the shipped CSS; the class lets the header join
    // so a wrap-fittable table never scrolls over a stubborn header token.
    // Owner 2026-11-07: every plan fits — the scrollable degradation is
    // retired and the degradeOverflow badge never arms.
    table.classList.toggle('ag-table-wrap-anywhere', plan.kind === 'wrap')
    this.degrade.delete(key)
    delete figure.dataset.degradeOverflow
    // Keep the entry identity: ResizeObserver may refit between pointer
    // moves, while the active drag still owns this same width store entry.
    const next = entry || { manual: plan.widths.map(() => false) }
    next.widths = plan.widths
    if (entry && entry.ratios) next.ratios = entry.ratios
    if (entry && entry.tableWidth) next.tableWidth = entry.tableWidth
    this.widths.set(key, next)
    this.applyWidths(table, next)
    this.positionTableWalls(figure, table)
    // The badge fact was written after applyModeDom's caption sync —
    // re-sync so the badge states THIS mode's overflow px; a Full → Fit
    // switch otherwise leaves the previous mode's number on the caption
    // (v3.0.1).
    syncTableCue(figure, this.muya.options && this.muya.options.t)
  }

  // T-009: the explicit side-wall width — columns refill the width from
  // the stored ratios, or the shared algorithm when none are stored (the
  // widths then carry the content-proportional layout for that width).
  applyExplicitTableWidth(key, figure, table, entry) {
    const columnCount = entry.widths.length
    const minima = this.degradeMinima(this.fitCache.get(table.id)?.extents || null) ||
      new Array(columnCount).fill(MIN_COLUMN_WIDTH)
    const frame = this.frameWidthFor(figure, 'fit')
    const target = frame > 0 ? Math.min(entry.tableWidth, frame) : entry.tableWidth
    let widths = null
    if (Array.isArray(entry.ratios) && entry.ratios.length === columnCount) {
      widths = applyRatiosToWidth(entry.ratios, target, minima)
      if (widths && sumWidths(widths) > target) widths = null
    }
    if (!widths) {
      const extents = this.extentsFor(table)
      if (extents) {
        const plan = planTableFit(extents, target)
        widths = plan ? plan.widths : null
      }
    }
    if (!widths) {
      const current = sumWidths(entry.widths)
      widths = current > 0
        ? snapWidthsToInt(entry.widths.map(width => width * target / current), target)
        : entry.widths.slice()
    }
    entry.widths = widths
    table.classList.add('ag-table-wrap-anywhere')
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
      if (table) this.positionTableWalls(figure, table)
      if (table) this.ensureColumnWalls(table)
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
    if (mode === 'auto') {
      if (this.defaultMode() === 'auto') this.modes.delete(key)
      else this.modes.set(key, 'auto')
      // Owner 2026-11-07: choosing Auto RETURNS the table to its content
      // width — the session's fixed column widths (and any explicit table
      // width) are dropped with the mode, not silently kept (the old
      // behaviour needed a double-click on every border to truly reset).
      this.resetTable(key)
      this.stripWidths(table)
      const changedFigure = table.closest ? table.closest('figure') : null
      if (changedFigure) {
        delete changedFigure.dataset.degradeOverflow
        this.applyModeDom(changedFigure, 'auto')
      }
      table.classList.remove('ag-table-wrap-anywhere')
      this.applyTableLayout(key, figure, table)
      // Auto is the walls' one home (owner convention) — the reset must
      // REBUILD them: the mode switch removed them in Fit/Full.
      this.positionTableWalls(figure, table)
      this.ensureColumnWalls(table)
      syncTableCue(figure, this.muya.options && this.muya.options.t)
    } else {
      this.modes.set(key, mode)
      this.applyTableLayout(key, figure, table)
    }
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

  // Owner 2026-11-05: full-height column walls — the column border must be
  // draggable along the WHOLE table height (like the side walls), not only
  // inside the header row. One 6px span per INTERNAL column boundary,
  // positioned in the wrapper's CONTENT coordinates (it scrolls with the
  // table; no scroll-time recompute), carrying the same drag and
  // double-click reset the header handle has. The outer edges stay the
  // side walls' business (R-11).
  findColumnWall(target) {
    if (!target || !target.closest) return null
    const wall = target.closest(`.${TABLE_COLUMN_WALL_CLASS}`)
    return wall || null
  }

  ensureColumnWalls(table) {
    if (!table || !this.enabled()) return
    // The walls' styles (absolute host, 6px zones) live in the injected
    // affordance stylesheet — without this call the first Fit-page layout
    // created the spans BEFORE any wall path injected the styles, leaving
    // them in-flow and wrecking the figure layout (owner smoke 2026-11-05).
    ensureAffordanceStyles()
    const wrapper = table.closest('div.ag-table-scroll')
    if (!wrapper || typeof table.getBoundingClientRect !== 'function') return
    const row = table.tHead && table.tHead.rows[0]
    if (!row || row.cells.length < 2) return
    const wrapRect = wrapper.getBoundingClientRect()
    const scrollX = wrapper.scrollLeft
    const tableRect = table.getBoundingClientRect()
    if (!(tableRect.width > 0) || !(tableRect.height > 0)) return
    // The host overlays the TABLE itself: its left/top is the table's
    // origin in the WRAPPER's box (the wrapper is position:relative, so
    // absolutes anchor to it; its padding does NOT shift that origin —
    // subtracting it put the zones a padding-width LEFT of the borders in
    // Auto, owner 2026-11-07). Every wall inside is placed RELATIVE to the
    // same origin, so the collapse ghost pixel cancels in one pass.
    const hostLeft = tableRect.left - wrapRect.left + scrollX
    const hostTop = tableRect.top - wrapRect.top + wrapper.scrollTop
    let host = wrapper.querySelector(`.${TABLE_COLUMN_WALLS_CLASS}`)
    if (!host) {
      host = document.createElement('div')
      host.className = TABLE_COLUMN_WALLS_CLASS
      host.setAttribute('contenteditable', 'false')
      host.setAttribute('aria-hidden', 'true')
      wrapper.appendChild(host)
    }
    host.style.left = `${Math.round(hostLeft)}px`
    host.style.top = `${Math.round(hostTop)}px`
    // Never wider than the wrapper's visible box: a host sized from a
    // stale table rect poked past the container in Full width and opened
    // the editor's phantom horizontal scrollbar (owner 2026-11-07). The
    // zones inside sit on the table's own borders, so the clamp is free.
    const hostWidth = Math.min(tableRect.width, (wrapper.clientWidth || tableRect.width) - hostLeft)
    host.style.width = `${Math.max(0, Math.round(hostWidth))}px`
    host.style.height = `${Math.round(tableRect.height)}px`
    let index = 0
    for (let i = 0; i < row.cells.length - 1; i++) {
      const cell = row.cells[i]
      const rect = cell.getBoundingClientRect()
      if (!(rect.width > 0)) continue
      const left = Math.round(rect.right - tableRect.left)
      let wall = host.children[index]
      if (!wall) {
        wall = document.createElement('span')
        wall.className = TABLE_COLUMN_WALL_CLASS
        wall.setAttribute('contenteditable', 'false')
        wall.setAttribute('aria-hidden', 'true')
        host.appendChild(wall)
      }
      ;(wall).dataset.columnWallIndex = String(i)
      ;(wall).style.left = `${left}px`
      ;(wall).style.top = '0'
      ;(wall).style.height = '100%'
      // The living documentation for the affordance (owner 2026-11-05):
      // the drag AND the Excel-style double-click fit live in the tooltip.
      const hint = this.muya.options && this.muya.options.t
        ? this.muya.options.t('tableToolbar.columnWallHint')
        : null
      if (hint && wall.getAttribute('title') !== hint) wall.setAttribute('title', hint)
      index++
    }
    while (host.children.length > index) host.removeChild(host.lastChild)
  }

  removeColumnWalls(table) {
    const wrapper = table && table.closest ? table.closest('div.ag-table-scroll') : null
    const host = wrapper && wrapper.querySelector(`.${TABLE_COLUMN_WALLS_CLASS}`)
    if (host) host.remove()
  }

  // Ensure + position the wall handles on one figure. Walls are active
  // OUTSIDE Fit only; both walls clamp inside the wrapper's visible box
  // so a table that overflows keeps them hittable (R-11).
  // Owner convention 2026-11-09: side walls exist in AUTO only — in Fit
  // the outer edges are pinned to the text column, in Full to the window
  // canvas; dragging a pinned edge is meaningless, and the walls' resize
  // behaviour there was the "strange outer borders" the owner saw.
  positionTableWalls(figure, table) {
    if (!figure || !table) return
    if (this.modeOf(table.id || '') !== 'auto' || !this.enabled()) {
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
    // Clamp to the WRAPPER's box only — the Full-width breakout extends
    // the table LEFT of the figure, and clamping to figureRect.left there
    // pinned the left wall inside the column, off the table's edge
    // (owner 2026-11-08: the wall read broken after a window resize).
    const visibleLeft = wrapperRect.left
    // Clamp to the WRAPPER's visible box only. In Full width the figure
    // stays column-narrow while the wrapper breaks out — clamping to
    // figure.right pulled both walls INSIDE the text column where they
    // sat painted over the wide table (owner smoke 2026-11-05).
    const visibleRight = wrapperRect.left + wrapper.clientWidth
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
    // R-11 priority: where a side wall coincides with a column border —
    // the table's outer edge IS the last column's border — the C-39
    // column affordance wins over the wall drag (the wall keeps its
    // clamp-point hit zone while the table overflows, where no border
    // sits beneath it).
    const overlappedResizer = wall ? this.wallOverlappedResizer(event, wall) : null
    if (wall && !overlappedResizer) {
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
    const handle = overlappedResizer || this.findHandle(event.target)
    // Owner 2026-11-05: a full-height column wall (the border hit zone
    // outside the header) starts the SAME column drag the header handle
    // does — the wall is a child of the wrapper, so the table/th lookup
    // rides the wall's data attribute instead.
    const columnWall = this.findColumnWall(event.target)
    if (!handle && !columnWall) return
    if (event.button !== undefined && event.button !== 0) return
    if (!this.enabled()) {
      event.preventDefault()
      event.stopPropagation()
      return
    }
    event.preventDefault()
    event.stopPropagation()
    const table = columnWall
      ? columnWall.closest('div.ag-table-scroll').querySelector('table')
      : handle.closest('table')
    if (!table || !table.id) return
    const key = table.id
    const columnIndex = columnWall
      ? Number(columnWall.dataset.columnWallIndex)
      : handle.closest('th,td').cellIndex
    if (!(columnIndex >= 0)) return
    const framed = this.modeOf(key) !== 'auto'
    const columnCount = table.tHead && table.tHead.rows[0] ? table.tHead.rows[0].cells.length : 0
    if (framed && columnIndex >= columnCount - 1) return
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
      startWidths: entry.widths.slice(),
      pairedColumnIndex: framed ? columnIndex + 1 : null,
      handle: columnWall || handle
    }
    const grip = columnWall || handle
    grip.classList.add(RESIZING_HANDLE_CLASS)
    table.classList.add(RESIZING_TABLE_CLASS)
    this.ensureSizeChips(key, entry.widths.length)
    this.updateSizeChips()
    if (typeof grip.setPointerCapture === 'function' && event.pointerId !== undefined) {
      try {
        grip.setPointerCapture(event.pointerId)
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
      // Walls live in Auto only (owner convention 2026-11-09); this path
      // sets the explicit table width.
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
      // A wall drag moves BOTH edges (the far wall follows the new width);
      // without this the far wall stays painted at the old edge — the
      // "extra fixed border" owner smoke 2026-11-05.
      this.positionTableWalls(drag.figure, drag.table)
      this.updateWallChip(drag)
      return
    }
    const drag0 = drag
    if (Number.isInteger(drag0.pairedColumnIndex)) {
      // Framed modes move one shared border, conserving the adjacent pair.
      // Other columns keep their widths, including earlier manual choices.
      const left = drag0.columnIndex
      const right = drag0.pairedColumnIndex
      const pairWidth = drag0.startWidths[left] + drag0.startWidths[right]
      const floor = Math.min(MIN_COLUMN_WIDTH, Math.floor(pairWidth / 2))
      const next = Math.max(floor, Math.min(pairWidth - floor,
        Math.round(drag0.startWidth + event.clientX - drag0.startX)))
      if (next === drag0.entry.widths[left] && pairWidth - next === drag0.entry.widths[right]) return
      drag0.entry.widths[left] = next
      drag0.entry.widths[right] = pairWidth - next
    } else {
      // Auto keeps its existing content-sized single-column behavior and
      // only invokes the no-scroll fitting fallback at the frame limit.
      const next = clampWidth(drag0.startWidth + event.clientX - drag0.startX)
      if (next === drag0.entry.widths[drag0.columnIndex]) return
      drag0.entry.widths[drag0.columnIndex] = next
      const frame = this.frameWidthFor(drag0.figure, 'fit')
      if (Number.isFinite(frame) && frame > 0 && sumWidths(drag0.entry.widths) > frame) {
        const extents = this.extentsFor(drag0.table)
        const minima = this.degradeMinima(extents)
        const maxima = extents && Array.isArray(extents.maxContent) ? extents.maxContent : null
        this.refitRemainder(drag0.entry, drag0.columnIndex, frame, minima, maxima)
        drag0.table.classList.add('ag-table-wrap-anywhere')
      }
    }
    // T-008: the drag writes both — px and the stored proportions.
    drag0.hasMoved = true
    const ratios = ratiosFromWidths(drag0.entry.widths)
    if (ratios) drag0.entry.ratios = ratios
    this.applyWidths(drag0.table, drag0.entry)
    // A column drag that changes the table width must carry the walls to
    // the new edges — a wall left at the old edge reads as an extra fixed
    // table border (owner smoke 2026-11-05).
    if (drag0.figure) this.positionTableWalls(drag0.figure, drag0.table)
    this.updateSizeChips()
  }

  // Auto overflow fitting fixes one column and re-fits the rest. Content minima
  // may yield under pressure: retaining them would hide real cells behind
  // the ghost-tail clip even though the scrollbar is absent.
  refitRemainder(entry, fixedIndex, frame, minima, maxima) {
    const others = entry.widths.map((_, i) => i).filter(i => i !== fixedIndex)
    if (!others.length) {
      entry.widths[fixedIndex] = Math.max(1, Math.floor(frame))
      return
    }
    const remainderFloor = Math.min(MIN_COLUMN_WIDTH, Math.floor(frame / entry.widths.length))
    const fixed = Math.min(entry.widths[fixedIndex], Math.max(1, Math.floor(frame) - others.length * remainderFloor))
    entry.widths[fixedIndex] = fixed
    const free = Math.max(others.length, Math.floor(frame) - fixed)
    const othersMin = others.map(i => Math.max(1, minima ? minima[i] : MIN_COLUMN_WIDTH))
    const othersMax = others.map((i, n) => Math.max(othersMin[n], maxima ? maxima[i] : entry.widths[i]))
    const need = othersMin.reduce((total, width) => total + width, 0)
    const distributed = free >= need
      ? distributeIntoFrame(othersMin, othersMax, free)
      : othersMin.map(width => width * free / need)
    if (!distributed) return
    const widths = snapWidthsToInt(distributed, free)
    others.forEach((index, position) => { entry.widths[index] = widths[position] })
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
    // The final settle: whatever the drag did to the table width, the
    // walls sit on the edges the pointer actually left the table with.
    if (figure) this.positionTableWalls(figure, drag.table)
    const moved = Math.abs(drag.entry.widths[drag.columnIndex] - drag.startWidth) >= 1
    if (moved) {
      drag.entry.manual[drag.columnIndex] = true
      if (Number.isInteger(drag.pairedColumnIndex)) drag.entry.manual[drag.pairedColumnIndex] = true
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
    // R-11 priority: in the wall/border overlap the C-39 double-click wins
    // — it resets THAT column, not the explicit table width.
    const overlappedResizer = wall ? this.wallOverlappedResizer(event, wall) : null
    if (wall && !overlappedResizer) {
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
        // The reset table's edges moved — carry the walls to them.
        this.positionTableWalls(figure, table)
      } else {
        this.applyTableLayout(key, figure, table)
      }
      console.debug(`[Muya][tableResize][BLOCK_TABLE_WALL_RESET table=${key}]`)
      syncTableCue(figure, this.muya.options && this.muya.options.t)
      this.persist()
      return
    }
    const handle = overlappedResizer || this.findHandle(event.target)
    // Owner 2026-11-05: a full-height column wall carries the same
    // double-click reset the header handle has.
    const columnWall = this.findColumnWall(event.target)
    if (!handle && !columnWall) return
    event.preventDefault()
    event.stopPropagation()
    if (!this.enabled()) return
    const table = columnWall
      ? columnWall.closest('div.ag-table-scroll').querySelector('table')
      : handle.closest('table')
    if (!table || !table.id) return
    const key = table.id
    const columnIndex = columnWall
      ? Number(columnWall.dataset.columnWallIndex)
      : handle.closest('th,td').cellIndex
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
      } else if (figure) {
        // Auto reset re-flows the table to content width — the walls
        // follow the new edges (no stale border).
        this.positionTableWalls(figure, table)
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
    // A measured natural width can make this partial reset exceed the
    // fitted frame. Apply the selected mode before persisting its widths.
    if (figure && this.modeOf(key) !== 'auto') {
      this.applyTableLayout(key, figure, table)
    } else {
      this.applyWidths(table, entry)
    }
    // The measured reset width may change the table's edges — the walls
    // ride along (owner smoke 2026-11-05: the wall left behind reads as
    // an extra fixed table border).
    if (figure) this.positionTableWalls(figure, table)
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
