// FILE: src/muya/lib/tableResize/index.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: C-39 T-002 session-only table column resize — in-memory column widths per table, pointer-drag interaction on header-border handles, double-click reset, and reconciliation after every muya re-render.
//   SCOPE: The width store keyed by table block key (set/get/reset/clear), MIN_COLUMN_WIDTH clamping, column-count reconciliation, capture-phase pointer/mouse/click/dblclick handling on the editor container, and DOM application of widths (colgroup + table-layout fixed).
//   DEPENDS: muya.eventCenter (capture-phase DOM events on muya.container), window pointer events during a drag, DOM colgroup/th measuring.
//   LINKS: .grace/graph/runtime.xml M-012 fn-tableResize; .grace/verification/runtime.xml V-M-012 scenario-21; .grace/changes/active/C-39 T-002; renderContainerBlock START_BLOCK_TABLE_COLUMN_WIDTHS and START_BLOCK_TABLE_COLUMN_RESIZER_HANDLE; render/index.js START_BLOCK_TABLE_WIDTHS_KEEP.
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   default - TableResize class (muya.tableResize): session column-width store + drag/double-click interaction + post-render reconciliation.
//   MIN_COLUMN_WIDTH - drag clamp floor for one column (px).
//   TABLE_FIXED_CLASS - class marking a table that carries session widths (table-layout: fixed + colgroup).
//   RESIZING_TABLE_CLASS - class on the table while a drag is in progress (no text selection).
//   RESIZING_HANDLE_CLASS - class on the active handle while dragging (accent hairline).
//   RESIZER_CLASS - class of the invisible header-border drag handle rendered into each th.
//   clampWidth - pure: round and clamp a drag width to the minimum.
//   sumWidths - pure: total of a widths array (the fixed table's width).
//   reconcileWidths - pure: re-map stored widths/manual flags onto a changed column count.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - 2026-10-15 C-39 T-002: new module. Widths live in
//   memory only, keyed by the table block key (the table element's DOM id):
//   keys are stable across re-renders and survive tab switches because tab
//   activation restores the saved block tree (same keys), while a reload
//   from disk re-parses and mints fresh keys, so session widths can never
//   leak into a reloaded document. The markdown, undo history and isSaved
//   state are never touched: nothing here calls into contentState.
// END_CHANGE_SUMMARY

export const MIN_COLUMN_WIDTH = 48
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

// START_BLOCK_TABLE_RESIZE_INTERACTION
class TableResize {
  constructor(muya) {
    this.muya = muya
    // tableKey -> { widths: number[], manual: boolean[] }. `manual` marks
    // the columns the USER dragged; a table whose manual flags are all
    // false is indistinguishable from auto layout and is dropped.
    this.widths = new Map()
    this.dragging = null
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

  // ---- Post-render reconciliation ----

  // Called after EVERY muya render (render/index.js, next to the C-39
  // T-001 scroll restore). Matching counts are already correct in the
  // vnode; this fixes count changes and re-applies widths that a hidden
  // render could not measure.
  reconcileAfterRender() {
    if (this.widths.size === 0) return
    const { container } = this.muya
    if (!container || !container.querySelectorAll) return
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
    const moved = Math.abs(drag.entry.widths[drag.columnIndex] - drag.startWidth) >= 1
    if (moved || !drag.createdThisDrag) {
      drag.entry.manual[drag.columnIndex] = true
      console.debug(
        `[Muya][tableResize][BLOCK_COLUMN_RESIZED table=${drag.key} col=${drag.columnIndex} width=${drag.entry.widths[drag.columnIndex]}]`
      )
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
    const othersManual = entry.manual.some((m, i) => m && i !== columnIndex)
    if (!othersManual) {
      this.resetTable(key)
      this.stripWidths(table)
      console.debug(`[Muya][tableResize][BLOCK_COLUMN_RESET table=${key} col=${columnIndex} mode=auto]`)
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
  }
}
// END_BLOCK_TABLE_RESIZE_INTERACTION

export default TableResize
