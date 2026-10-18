// FILE: src/muya/lib/tableResize/index.js
// VERSION: 2.1.0
// START_MODULE_CONTRACT
//   PURPOSE: Table column resize and per-table layout (C-39 T-002 session widths; C-65 persistent widths + the per-table Full width mode keyed by file-path-stable identities), pointer-drag interaction on header-border handles, double-click reset, reconciliation after every muya re-render, the table toolbar click routing and the overflow-cue refresh.
//   SCOPE: The width store keyed by table block key (set/get/reset/clear), MIN_COLUMN_WIDTH clamping, column-count reconciliation, the persistent identity map (table ordinal in the document + header signature), the persisted-entry adoption/drop rules (R-1), the serialize/dispatch persistence bridge (R-1/R-3, written only after a real user action), the Full width mode session set + DOM application + toggle routing (R-4/R-6), capture-phase pointer/mouse/click/dblclick/scroll handling on the editor container, and DOM application of widths (colgroup + table-layout fixed).
//   DEPENDS: muya.eventCenter (capture-phase DOM events on muya.container), window pointer events during a drag, DOM colgroup/th measuring; ./tableCue (cue sync + TABLE_FULL_WIDTH_CLASS); ../parser/render/renderBlock/renderTableToolbar (toggle icon paths for the live label swap).
//   LINKS: .grace/graph/runtime.xml M-012 fn-tableResize; .grace/verification/runtime.xml V-M-012 scenario-21 and scenario-66; .grace/changes/active/C-39 T-002; .grace/changes/active/C-65 T-001/T-002/T-004; renderContainerBlock START_BLOCK_TABLE_COLUMN_WIDTHS, START_BLOCK_TABLE_COLUMN_RESIZER_HANDLE and START_BLOCK_TABLE_TOOLBAR_AND_CAPTION; render/index.js START_BLOCK_TABLE_WIDTHS_KEEP; renderer util tableLayoutStore.js + editor.vue BLOCK_TABLE_LAYOUTS_HOST (the prefs host side).
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   default - TableResize class (muya.tableResize): session column-width store + drag/double-click interaction + post-render reconciliation + persistent identities/adoption + Full width mode + the table toolbar routing.
//   FULL_WIDTH_GUTTER_PX - gap between a Full width table that is wider than the editor and the editor's left edge.
//   MIN_COLUMN_WIDTH - drag clamp floor for one column (px).
//   TABLE_FIXED_CLASS - class marking a table that carries session widths (table-layout: fixed + colgroup).
//   RESIZING_TABLE_CLASS - class on the table while a drag is in progress (no text selection).
//   RESIZING_HANDLE_CLASS - class on the active handle while dragging (accent hairline).
//   RESIZER_CLASS - class of the invisible header-border drag handle rendered into each th.
//   TABLE_FULL_WIDTH_CLASS - re-export of the tableCue figure class for the renderContainerBlock vnode ("ag-table-full-width").
//   TABLE_TOOLBAR_BUTTON_SELECTOR - selector of the table toolbar buttons (from renderTableToolbar; routed here on capture phase).
//   sanitizePersistedEntries - pure: clamp/boolean-coerce a raw persisted entries object into {widths, manual, fullWidth} entries (invalid dropped).
//   tableSignature - pure-ish: header signature of a thead row (column count + hash of the header cell texts).
//   hashHeaderText - pure: djb2 base36 hash used by the signature.
//   clampWidth - pure: round and clamp a drag width to the minimum.
//   sumWidths - pure: total of a widths array (the fixed table's width).
//   reconcileWidths - pure: re-map stored widths/manual flags onto a changed column count.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v2.1.0 - 2026-10-19 Full width placement: a table that
//   fits the editor area is centred in it; a wider one starts
//   FULL_WIDTH_GUTTER_PX from the left edge (it used to stick to the edge).
//   v2.0.0 - 2026-10-18 C-65: widths (and the per-table Full
//   width mode) persist per file in the Mark profile. Block keys are not
//   stable across reloads, so every table gets a PERSISTENT IDENTITY =
//   document ordinal + header signature (column count + hash of header
//   texts); syncIdentities() runs after every render, adopts stored entries
//   into fresh block keys, and drops a table's widths when its identity
//   changed (header edited / column count changed — corner-2). persist()
//   serializes the manual tables and dispatches muya-table-layouts — the
//   ONLY write path, fired solely after real user actions (drag end with
//   movement, double-click reset, Full width toggle); adoption and
//   reconciliation never write. applyPersistedLayouts() is the load entry
//   the host calls once the profile entry for the file arrived. R-3: the
//   double-click reset paths persist too (resetTable drops the table
//   entry). The TABLE TOOLBAR (renderTableToolbar.js, rendered by
//   renderContainerBlock) is routed here on capture phase — toggleFullWidth
//   flips the figure's ag-table-full-width class, breaks the wrapper out to
//   the editor's left edge (inline margin, geometry-measured), swaps the
//   button's icon/label to «Fit to page» and persists; 'expand' dispatches
//   muya-block-viewer like the old glyph. A capture-phase scroll listener
//   keeps the tableCue caption/shades live. The markdown, undo history and
//   isSaved state are still never touched: nothing here calls into
//   contentState.
//   v1.0.0 - 2026-10-15 C-39 T-002: new module (session-only width store,
//   keyed by the table block key; see the C-39 change for that history).
// END_CHANGE_SUMMARY

import {
  syncTableCue,
  setTableCueTranslator,
  TABLE_CAPTION_CLASS,
  TABLE_FULL_WIDTH_CLASS
} from './tableCue'
import {
  TABLE_TOOLBAR_BUTTON_SELECTOR,
  TOOLBAR_TABLE_FIT_ICON_PATH,
  TOOLBAR_TABLE_FULLWIDTH_ICON_PATH
} from '../parser/render/renderBlock/renderTableToolbar'

export { TABLE_FULL_WIDTH_CLASS }
export { TABLE_TOOLBAR_BUTTON_SELECTOR }

export const MIN_COLUMN_WIDTH = 48
// C-65 R-6: the Full width table keeps this gap to the editor's edge.
export const FULL_WIDTH_GUTTER_PX = 24
export const TABLE_FIXED_CLASS = 'ag-column-widths-fixed'
export const RESIZER_CLASS = 'ag-column-resizer'
export const RESIZING_TABLE_CLASS = 'ag-column-resizing'
export const RESIZING_HANDLE_CLASS = 'ag-resizing'

// START_BLOCK_CLAMP_AND_RECONCILE
// Pure width maths, kept free of DOM so tests can pin the policy.
export const clampWidth = width => Math.max(MIN_COLUMN_WIDTH, Math.round(width))

export const sumWidths = widths => widths.reduce((total, w) => total + clampWidth(w), 0)

// Column added/removed (muya's editTable mutates the SAME table block, so
// the key survives): keep stored widths for columns that still exist BY
// INDEX, drop the rest, and give brand-new columns their measured auto
// width so a fresh column does not collapse to zero in fixed layout.
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
// sanitized entries; anything malformed is dropped, widths are clamped so
// a hand-edited profile can never collapse a column.
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
    const fullWidth = !!value.fullWidth
    if (widths.length === 0 && !fullWidth) continue
    // No user-dragged column and no Full width: indistinguishable from auto
    // layout, so nothing worth restoring (the session store drops it too).
    if (!fullWidth && !manual.some(Boolean)) continue
    entries[pid] = { widths, manual, fullWidth }
  }
  return entries
}
// END_BLOCK_PERSISTENT_IDENTITY

// START_BLOCK_TABLE_RESIZE_INTERACTION
class TableResize {
  constructor(muya) {
    this.muya = muya
    // tableKey -> { widths: number[], manual: boolean[] }. `manual` marks
    // the columns the USER dragged; a table whose manual flags are all
    // false is indistinguishable from auto layout and is dropped.
    this.widths = new Map()
    this.dragging = null
    // C-65: tableKey -> persistent identity (ordinal#signature), the
    // adoption/drop map, the Full width session set and the persisted
    // entries of the ACTIVE document (set by applyPersistedLayouts).
    this.identities = new Map()
    this.fullWidth = new Set()
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
    // C-65 T-002: the table toolbar buttons are routed HERE (capture phase)
    // — clickEvent.js's generic branches never see them. mousedown only
    // stops propagation (no preventDefault) so the buttons still take
    // keyboard focus; the caption swallows muya's caret routing the same
    // way while keeping native text selection.
    eventCenter.attachDOMEvent(container, 'mousedown', this.handleToolbarMousedown, true)
    eventCenter.attachDOMEvent(container, 'click', this.handleToolbarClick, true)
    // C-65 T-003: scroll of a table wrapper does not bubble, but it DOES
    // capture — one delegated listener keeps every caption/shade live.
    eventCenter.attachDOMEvent(container, 'scroll', this.handleScrollCapture, true)
    setTableCueTranslator(muya.options && muya.options.t)
  }

  // The read-only Split View mirror pane disables the affordance entirely
  // (option set by editor.vue); reading/locked tabs keep it — resizing is
  // view-only and never marks the document dirty.
  enabled() {
    return !(this.muya.options && this.muya.options.disableTableColumnResize)
  }

  findHandle(target) {
    if (!target || target.nodeType !== 1 || !target.closest) return null
    return target.closest(`.${RESIZER_CLASS}`)
  }

  findTableToolbarButton(target) {
    if (!target || target.nodeType !== 1 || !target.closest) return null
    return target.closest(TABLE_TOOLBAR_BUTTON_SELECTOR)
  }

  findTableFigure(target) {
    if (!target || target.nodeType !== 1 || !target.closest) return null
    return target.closest("figure[data-role='TABLE']")
  }

  // mousedown/click on a handle must not reach muya's handlers (cell
  // selection, caret placement) even when a drag does not start.
  blockHandleEvent = event => {
    if (!this.findHandle(event.target)) return
    event.preventDefault()
    event.stopPropagation()
  }

  // ---- Width store (per muya instance === per editor surface) ----

  setTableWidths(key, widths, manual) {
    const safeWidths = widths.map(w => clampWidth(w))
    const safeManual = (manual || widths.map(() => false)).map(m => !!m)
    this.widths.set(key, { widths: safeWidths, manual: safeManual })
  }

  getWidths(key) {
    const entry = this.widths.get(key)
    return entry ? entry.widths.slice() : undefined
  }

  resetTable(key) {
    this.widths.delete(key)
  }

  clearAll() {
    this.widths.clear()
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

  // ---- Full width mode (C-65 R-6) ----

  isFullWidth(key) {
    return this.fullWidth.has(key)
  }

  // ---- DOM application ----

  // Natural widths of the current layout (used to freeze an auto table at
  // drag start and to measure new/reset columns). Returns null when the
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

  // ---- Persistent identities + adoption (C-65 R-1) ----

  // Walk the rendered tables in DOCUMENT ORDER, mint ordinal#signature
  // identities, adopt persisted entries into fresh block keys, drop the
  // entries whose identity disappeared, and reset a table whose identity
  // CHANGED under it (header edited — corner-2: that table's widths are
  // dropped, the others keep theirs).
  syncIdentities() {
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
        this.fullWidth.delete(key)
        const changedFigure = table.closest('figure')
        if (changedFigure) this.applyFullWidthDom(changedFigure, false)
        console.debug(
          `[Muya][tableResize][BLOCK_TABLE_IDENTITY_CHANGED table=${key}]`
        )
        changed = true
      }
      this.identities.set(key, pid)
      seen.add(pid)
      const stored = this.persisted ? this.persisted[pid] : null
      if (stored) {
        const columnCount = row.cells.length
        if (!this.widths.has(key) &&
            Array.isArray(stored.widths) && stored.widths.length === columnCount) {
          this.setTableWidths(key, stored.widths, stored.manual)
          this.applyWidths(table, this.widths.get(key))
          changed = true
        }
        if (stored.fullWidth && !this.fullWidth.has(key)) {
          this.fullWidth.add(key)
          const storedFigure = table.closest('figure')
          if (storedFigure) this.applyFullWidthDom(storedFigure, true)
          changed = true
        }
      }
    }
    for (const key of Array.from(this.identities.keys())) {
      if (!presentKeys.has(key)) this.identities.delete(key)
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
  // back — adoption is not a user action.
  applyPersistedLayouts(rawEntries) {
    this.persisted = sanitizePersistedEntries(rawEntries)
    const adopted = this.syncIdentities()
    this.refreshTableSurfaces()
    console.debug(
      `[Muya][tableResize][BLOCK_TABLE_LAYOUTS_APPLIED persisted=${this.persisted ? Object.keys(this.persisted).length : 0} adopted=${adopted}]`
    )
  }

  // Serialize the tables that carry a user layout (any manual column or
  // the Full width mode) keyed by persistent identity. The host saves this
  // object under the document's file path.
  serializeTableLayouts() {
    const entries = {}
    for (const [key, pid] of this.identities) {
      const entry = this.widths.get(key)
      const manual = !!(entry && entry.manual.some(m => m))
      const fullWidth = this.fullWidth.has(key)
      if (!manual && !fullWidth) continue
      entries[pid] = {
        widths: entry ? entry.widths.slice() : [],
        manual: entry ? entry.manual.slice() : [],
        fullWidth
      }
    }
    return entries
  }

  // The ONLY persistence write path (C-65 R-1: written after a real
  // resize / reset / mode toggle — never on adoption or reconciliation).
  persist() {
    this.syncIdentities()
    const entries = this.serializeTableLayouts()
    this.muya.eventCenter.dispatch('muya-table-layouts', { entries })
    console.debug(
      `[Muya][tableResize][BLOCK_TABLE_LAYOUTS_PERSISTED tables=${Object.keys(entries).length}]`
    )
  }

  // ---- Full width DOM application ----

  // The figure keeps the text-column width (the toolbar and the caption
  // stay anchored to its right edge in every mode — mockup variant E);
  // the WRAPPER breaks out to the editor's left edge and stops clipping,
  // so a table wider than the window scrolls the editor itself (R-6).
  applyFullWidthDom(figure, on) {
    if (!figure) return
    figure.classList.toggle(TABLE_FULL_WIDTH_CLASS, on)
    const wrapper = figure.querySelector('div.ag-table-scroll')
    if (!wrapper) return
    if (on) {
      this.applyFullWidthGeometry(figure)
    } else {
      wrapper.style.marginLeft = ''
    }
    this.updateToolbarToggleDom(figure, on)
    syncTableCue(figure, this.muya.options && this.muya.options.t)
  }

  // Breakout distance = how far the wrapper's left edge sits from the
  // scroll container's left content edge, applied as an inline margin so
  // theme paddings never need hardcoding. Zero-geometry surfaces (jsdom,
  // hidden panes) keep the CSS margin and lose nothing but the exact inset.
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
    const offset = wrapper.getBoundingClientRect().left - containerRect.left
    if (!Number.isFinite(offset)) return
    const currentMargin = parseFloat(getComputedStyle(wrapper).marginLeft)
    if (!Number.isFinite(currentMargin)) return
    // Where the table should start inside the editor area: centred when
    // its natural width fits (a table a little wider than the column must
    // not jump to the window edge — user review 2026-10-19), else a small
    // gutter from the left edge and the editor scrolls horizontally.
    const table = wrapper.querySelector('table')
    const natural = table ? table.getBoundingClientRect().width : 0
    const available = containerRect.width
    let target = FULL_WIDTH_GUTTER_PX
    if (Number.isFinite(natural) && natural > 0 && Number.isFinite(available) &&
      natural + FULL_WIDTH_GUTTER_PX * 2 <= available) {
      target = Math.round((available - natural) / 2)
    }
    if (Math.round(offset) === target) return
    wrapper.style.marginLeft = `${currentMargin - offset + target}px`
  }

  // Swap the toggle's icon/label between «Full width» and «Fit to page»
  // (active state) without a re-render; the next render rebuilds the vnode
  // from the session set, which the toggle keeps in step synchronously.
  updateToolbarToggleDom(figure, on) {
    const button = figure.querySelector('button.ag-table-toolbar-toggle')
    if (!button) return
    const t = (this.muya.options && this.muya.options.t) || (key => key)
    const label = on ? t('tableToolbar.fitToPage') : t('tableToolbar.fullWidth')
    button.title = label
    button.setAttribute('aria-label', label)
    const span = button.querySelector('span.ag-block-toolbar-label')
    if (span) span.textContent = label
    const path = button.querySelector('svg path')
    if (path) path.setAttribute('d', on ? TOOLBAR_TABLE_FIT_ICON_PATH : TOOLBAR_TABLE_FULLWIDTH_ICON_PATH)
    button.classList.toggle('ag-table-toolbar-active', on)
  }

  // C-65 R-4/R-6: the toolbar toggle action (capture-phase routed).
  toggleFullWidthFromElement(element) {
    if (!this.enabled()) return
    const figure = this.findTableFigure(element)
    if (!figure) return
    const table = figure.querySelector('table')
    const key = table && table.id
    if (!key) return
    const on = !this.fullWidth.has(key)
    if (on) {
      this.fullWidth.add(key)
    } else {
      this.fullWidth.delete(key)
    }
    this.applyFullWidthDom(figure, on)
    console.debug(
      `[Muya][tableResize][BLOCK_TABLE_FULL_WIDTH table=${key} on=${on}]`
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

  // ---- Toolbar + caption event routing (capture phase) ----

  handleToolbarMousedown = event => {
    const button = this.findTableToolbarButton(event.target)
    if (button) {
      // Focus must still move to the button (keyboard reveal, Tab walk) —
      // stopPropagation only, never preventDefault on mousedown.
      event.stopPropagation()
      return
    }
    const caption = event.target && event.target.closest
      ? event.target.closest(`div.${TABLE_CAPTION_CLASS}`)
      : null
    if (caption) event.stopPropagation()
  }

  handleToolbarClick = event => {
    const button = this.findTableToolbarButton(event.target)
    if (button) {
      event.preventDefault()
      event.stopPropagation()
      const action = button.dataset.tableToolbarAction
      if (action === 'toggleFullWidth') {
        this.toggleFullWidthFromElement(button)
      } else {
        this.openViewerFromElement(button)
      }
      return
    }
    const caption = event.target && event.target.closest
      ? event.target.closest(`div.${TABLE_CAPTION_CLASS}`)
      : null
    if (caption) event.stopPropagation()
  }

  // C-65 T-003: wrapper scrolls keep their caption/shades live (scroll
  // does not bubble; it captures).
  handleScrollCapture = event => {
    const target = event.target
    if (!target || !target.classList || !target.classList.contains('ag-table-scroll')) return
    const figure = target.closest ? target.closest("figure[data-role='TABLE']") : null
    if (figure) syncTableCue(figure, this.muya.options && this.muya.options.t)
  }

  // ---- Post-render reconciliation ----

  // Called after EVERY muya render (render/index.js, next to the C-39
  // T-001 scroll restore). Keeps identities/adoptions in step, fixes
  // column-count changes, re-applies widths a hidden render could not
  // measure, re-applies the Full width class/geometry a re-render dropped,
  // and refreshes every table cue with the live translator.
  reconcileAfterRender() {
    if (this.widths.size === 0 && this.fullWidth.size === 0 && !this.persisted) return
    const { container } = this.muya
    if (!container || !container.querySelectorAll) return
    this.syncIdentities()
    for (const table of container.querySelectorAll('table.ag-paragraph')) {
      const key = table.id
      if (!key) continue
      const entry = this.widths.get(key)
      if (!entry) continue
      const row = table.tHead && table.tHead.rows[0]
      const columnCount = row ? row.cells.length : 0
      if (columnCount === 0) continue
      if (entry.widths.length === columnCount) {
        if (!table.classList.contains(TABLE_FIXED_CLASS)) {
          this.applyWidths(table, entry)
        }
        continue
      }
      const measured = this.measureColumnWidths(table)
      if (!measured) continue
      const next = reconcileWidths(entry.widths, entry.manual, columnCount, measured)
      this.widths.set(key, next)
      this.applyWidths(table, next)
      console.debug(
        `[Muya][tableResize][BLOCK_COLUMN_COUNT_RECONCILED table=${key} columns=${columnCount}]`
      )
    }
    this.refreshTableSurfaces()
  }

  // Re-apply the Full width class/geometry and refresh the cues of every
  // table figure (the render funnel for surfaces the vnodes cannot carry:
  // the measured breakout margin and the live caption text).
  refreshTableSurfaces() {
    const { container, options } = this.muya
    if (!container || !container.querySelectorAll) return
    const t = options && options.t
    if (t) setTableCueTranslator(t)
    for (const figure of container.querySelectorAll("figure[data-role='TABLE']")) {
      const table = figure.querySelector('table')
      const key = table && table.id
      if (!key) continue
      const on = this.fullWidth.has(key)
      if (on !== figure.classList.contains(TABLE_FULL_WIDTH_CLASS)) {
        this.applyFullWidthDom(figure, on)
        continue
      }
      if (on) this.applyFullWidthGeometry(figure)
      syncTableCue(figure, t)
    }
  }

  // ---- Drag ----

  handlePointerDown = event => {
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
      key,
      table,
      columnIndex,
      entry,
      createdThisDrag,
      startX: event.clientX,
      startWidth: entry.widths[columnIndex],
      handle
    }
    handle.classList.add(RESIZING_HANDLE_CLASS)
    table.classList.add(RESIZING_TABLE_CLASS)
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
    const next = clampWidth(drag.startWidth + (event.clientX - drag.startX))
    if (next === drag.entry.widths[drag.columnIndex]) return
    drag.entry.widths[drag.columnIndex] = next
    this.applyWidths(drag.table, drag.entry)
  }

  handlePointerUp = () => {
    const drag = this.dragging
    if (!drag) return
    this.dragging = null
    window.removeEventListener('pointermove', this.handlePointerMove)
    window.removeEventListener('pointerup', this.handlePointerUp)
    window.removeEventListener('pointercancel', this.handlePointerUp)
    drag.handle.classList.remove(RESIZING_HANDLE_CLASS)
    drag.table.classList.remove(RESIZING_TABLE_CLASS)
    const figure = drag.table.closest ? drag.table.closest('figure') : null
    const moved = Math.abs(drag.entry.widths[drag.columnIndex] - drag.startWidth) >= 1
    if (moved || !drag.createdThisDrag) {
      drag.entry.manual[drag.columnIndex] = true
      console.debug(
        `[Muya][tableResize][BLOCK_COLUMN_RESIZED table=${drag.key} col=${drag.columnIndex} width=${drag.entry.widths[drag.columnIndex]}]`
      )
      // C-65 R-1: a real resize is the only thing that writes widths.
      if (figure) syncTableCue(figure, this.muya.options && this.muya.options.t)
      this.persist()
    } else {
      // A plain click on the handle (no move) must not silently freeze the
      // table at its auto widths — undo the baseline created on pointerdown.
      this.resetTable(drag.key)
      this.stripWidths(drag.table)
    }
  }

  // Double-click resets THAT column to auto: drop the fixed layout, let the
  // browser lay the table out auto once (synchronous read — nothing is
  // painted in between), and either restore fixed layout with the measured
  // natural width for the reset column (other columns still manual) or —
  // when no manual column remains — return the whole table to auto layout.
  // C-65 R-3: both outcomes persist (the stored width for that column —
  // or the whole table entry — leaves the profile).
  handleDoubleClick = event => {
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
    this.applyWidths(table, entry)
    console.debug(
      `[Muya][tableResize][BLOCK_COLUMN_RESET table=${key} col=${columnIndex} width=${entry.widths[columnIndex]}]`
    )
    if (figure) syncTableCue(figure, this.muya.options && this.muya.options.t)
    this.persist()
  }
}
// END_BLOCK_TABLE_RESIZE_INTERACTION

export default TableResize
