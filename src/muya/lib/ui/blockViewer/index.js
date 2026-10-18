// FILE: src/muya/lib/ui/blockViewer/index.js
// VERSION: 3.2.0
// START_MODULE_CONTRACT
//   PURPOSE: Shared fullscreen block viewer (C-34 R2.2 + C-39 T2) that shows a Mermaid/flowchart/sequence/plantuml/vega-lite diagram (clone of the current preview, no re-render) or a read-only clone of a rendered table with pan/zoom via @panzoom/panzoom.
//   SCOPE: viewer open/close lifecycle, diagram-preview and table-clone sanitization, wheel/pinch/key zoom, drag pan, focus trap and focus restore, panzoom cleanup, block resolution from an element (preview, table, or the FIGURE the C-51 persistent expand button dispatches), and the C-51 T-014 polish: fit scales small content UP to the stage (no 1:1 cap) and an open viewer follows option-driven re-renders (theme switches) by re-cloning the live block once its diagram content has actually CHANGED (never the viewer's own clone; the captured figure element is a fallback anchor), keeping zoom/pan. C-62: Expose the same Mermaid appearance control and refresh local palettes without changing zoom/pan.
//   DEPENDS: @panzoom/panzoom, muya/lib/config (CLASS_OR_ID, EVENT_KEYS), muya/lib/eventHandler/event (via muya.eventCenter; Muya#setOptions dispatches muya-options-rerender after a needRender re-render).; renderBlock/renderDiagramAppearance, muya.diagramAppearance.
//   LINKS: .grace/changes/active/C-34 T-002; .grace/changes/active/C-39 T2 and T-002 (viewer shows the session column widths — the clone carries the live colgroup — but no resize handles); .grace/changes/active/C-51 T-006 (always-visible expand button, scenario-60) and T-014 (theme-follow, fit-up, scenario-64); .grace/graph/runtime.xml M-012; .grace/verification/runtime.xml V-M-012 scenario-19.; .grace/changes/archive/C-62.
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   default - BlockViewer muya UI plugin (pluginName 'blockViewer'): builds the overlay once, opens on 'muya-block-viewer' events (the persistent button.ag-block-expand clicks, Cmd/Ctrl+click on a preview), closes on Esc/close/backdrop; options, source/history and appearance changes refresh the live clone when its content token changes, preserving the panzoom transform; Mermaid diagrams expose the shared appearance control in the header.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v3.2.0 - 2026-10-18 C-62: shared Mermaid appearance menu in the viewer header; local changes refresh the clone and keep zoom/pan.
//   PREV: v3.1.0 - 2026-10-17 C-51 T-014 gate results: the
//   theme-refresh poll had two resolution bugs and one race. (1) The
//   by-id lookup could resolve the viewer's OWN clone — cloneNode keeps
//   the preview div's id and the SVG id is deliberately shared (mermaid
//   scopes its hoisted styles by it) — so after a re-render replaced the
//   live element, the poll re-cloned the clone (stale content forever).
//   Id resolution now skips anything inside the overlay. (2) Re-renders
//   that replace the inner elements of an id-less (or re-created) figure
//   never resolved; the figure ELEMENT captured at open is now a fallback
//   anchor (isConnected-checked). (3) Chromium race: the mermaid
//   pipeline re-inserts the last-good OLD-theme svg into the live
//   preview synchronously during the re-render (before the async
//   mermaid.render lands), so the poll's first tick saw "content
//   present", cloned the old colours and stopped. The poll now gates on
//   a content token (the LIVE source's outerHTML — the clone's own
//   serialization is never compared since cloneDiagramPreview mutates
//   the clone's inline sizing): unchanged content keeps waiting, a
//   change refreshes and ends the poll, the token baseline moves with
//   every clone so consecutive theme switches each re-arm.
//   v3.0.0 - 2026-10-17 C-51 T-014 (live smoke
//   2026-10-16): (1) fit no longer caps at 1:1 — computeFitScale is
//   min(availW/w, availH/h) clamped to [MIN_SCALE, MAX_SCALE], so a small
//   diagram/chart opens fitted UP to the viewer stage (the Fit button
//   and the initial open share the maths; 1:1 still restores the natural
//   size; big diagrams keep scaling down as before). (2) An open viewer
//   follows option-driven re-renders (the app theme switch re-renders
//   every diagram through setOptions(_, true)): Muya#setOptions
//   dispatches muya-options-rerender after the sync DOM patch, and the
//   viewer polls the LIVE block (by block-key id — element ids survive
//   re-patches) until its preview carries rendered content again
//   (mermaid pipeline insert / renderDiagram insert are async), then
//   re-clones in place, keeping the panzoom transform so zoom and
//   position survive; the clone used to keep the OLD theme's colours
//   until closed and reopened.
//   v2.0.2 - 2026-10-16 C-51 T-010: the close() re-asserts
//   resolve the LIVE expand button from returnFocusFigureId on every
//   firing — a re-render during the 400 ms window (the closing key's
//   keyup could trigger a partial render) replaces the figure's DOM, and
//   the previously captured element stayed detached, making the 0/50 ms
//   timers silent no-ops while the editor container kept the focus. The
//   steal itself is fixed in keyboard.js (the keyup expand-button guard);
//   this hardening keeps the restore correct against any render.
//   v2.0.1 - 2026-10-16 C-51 T-006 review: findDiagramPreview
//   resolves through the figure ROLE in both directions — the first draft
//   accepted any div.ag-container-preview with svg/img content, which made
//   KaTeX math (svg radicals) and html previews (imgs) viewable via
//   Cmd/Ctrl+click; math and html figures stay unviewable by design.
//   v2.0.0 - 2026-10-16 C-51 T-006: the hover/caret toolbar is
//   REPLACED by the persistent per-block expand button rendered by
//   renderContainerBlock (button.ag-block-expand, a figure child — subtle
//   at rest, solid on hover, keyboard-focusable with the localized
//   blockViewer.expand aria-label). All toolbar machinery (hover/caret
//   anchoring, hide grace timer, scroll/resize repositioning, the
//   selectionChange subscription) is gone; keyboard reachability now comes
//   from the focusable button itself (keyboard.js routes keys to it).
//   Block resolution generalized: findDiagramPreview accepts any of the
//   five diagram roles' previews (svg or plantuml img content) and also
//   resolves DOWNWARD from the figure the button dispatches;
//   findTable likewise resolves from the table figure.
//   v1.2.0 - 2026-10-15 C-39 T-002: the table clone drops the
//   span.ag-column-resizer handles along with the drag bars — the viewer is
//   read-only, so a col-resize cursor on header borders would lie (the
//   handles are inert outside the editor container by construction; this is
//   affordance hygiene). The clone KEEPS the session colgroup: the viewer
//   shows the table at the widths the user set for the session.
//   v1.1.0 - 2026-10-15 C-34: the diagram clone gets its natural size from the SVG viewBox (diagrams now fit the column with width 100%, which collapsed to 0 in the viewer — blank viewer, off-centre fit); fit runs again after layout.
//   v1.0.1 - 2026-10-15 C-39: tables are centred and the centred table tools bar owns the strip above them, so the expand button sits beside the table top-right corner (falls back to the strip when there is no room).
//   v1.0.0 - 2026-10-15 C-34 R2.2 + C-39 T2: new shared fullscreen block viewer — Mermaid preview clone (carries the hoisted <style>), sanitized read-only table clone with a sticky header, @panzoom/panzoom pan/zoom (pinch/Cmd+wheel zoom, drag pan, +/−/0/1 keys), Esc close with focus restore, hover/caret toolbar with the ⤢ expand button, Cmd/Ctrl+click on a diagram opens the viewer.
// END_CHANGE_SUMMARY

import Panzoom from '@panzoom/panzoom'
import { CLASS_OR_ID, EVENT_KEYS } from '../../config'
import { createAppearanceButton, updateAppearanceButton } from '../../parser/render/renderBlock/renderDiagramAppearance'
import './index.css'

const FIT_PADDING = 32
const ZOOM_KEY_FACTOR = 1.25
const MIN_SCALE = 0.05
const MAX_SCALE = 8
// C-51 T-014: the theme-refresh poll cadence and budget. Diagrams
// re-draw asynchronously after a needRender setOptions (mermaid pipeline
// ~250 ms debounce, awaited vega embed), so the viewer waits for the
// live block's content instead of cloning the loading placeholder.
const THEME_REFRESH_POLL_MS = 100
const THEME_REFRESH_TIMEOUT_MS = 10000

// The five diagram roles whose figures carry the persistent expand button
// (C-51 T-006). html/multiplemath previews are deliberately not viewable.
const DIAGRAM_FIGURE_SELECTOR = [
  "figure[data-role='MERMAID']",
  "figure[data-role='FLOWCHART']",
  "figure[data-role='SEQUENCE']",
  "figure[data-role='PLANTUML']",
  "figure[data-role='VEGA-LITE']"
].join(', ')

// START_BLOCK_VIEWER_TABLE_CLONE
// The viewer table is a read-only snapshot: drop the editing affordances
// (drag bars, table tools, contenteditable, duplicate DOM ids) so nothing
// in the overlay can mutate the document or collide with live block ids.
const sanitizeTableClone = (table) => {
  const clone = table.cloneNode(true)
  // C-39 T-002: the column-resizer handles go with the drag bars — the
  // viewer is read-only (the session colgroup itself stays: the viewer
  // shows the table at the user's session widths).
  for (const el of clone.querySelectorAll('.ag-drag-handler, .ag-tool-bar, .ag-column-resizer')) {
    el.remove()
  }
  for (const el of clone.querySelectorAll('.ag-cell-selected, .ag-active')) {
    el.classList.remove('ag-cell-selected', 'ag-active')
  }
  clone.removeAttribute('id')
  for (const el of clone.querySelectorAll('[id]')) {
    el.removeAttribute('id')
  }
  for (const el of clone.querySelectorAll('[contenteditable]')) {
    el.removeAttribute('contenteditable')
  }
  for (const el of clone.querySelectorAll('[spellcheck]')) {
    el.removeAttribute('spellcheck')
  }
  clone.classList.add('ag-block-viewer-table-clone')
  return clone
}
// END_BLOCK_VIEWER_TABLE_CLONE

// START_BLOCK_VIEWER_DIAGRAM_CLONE
// Clone the live preview div (not a re-render). C-55: pele SVGs carry no
// <style> blocks, so cloneNode(true) simply carries the SVG — whose
// var(--pele-*) colour references still resolve (same document) and
// recolor with the theme exactly like the inline preview.
const cloneDiagramPreview = (preview) => {
  const clone = preview.cloneNode(true)
  clone.classList.add('ag-block-viewer-diagram-clone')
  // In the editor wide diagrams fit the column (the pipeline sets
  // width 100% + an inline zoomable max-width). The viewer canvas has no
  // width of its own, so a percentage width collapsed to 0 (blank viewer)
  // and the fit maths measured the wrong size (off-centre open). Give the
  // clone the diagram's natural size from its viewBox.
  const svg = clone.querySelector('svg')
  const vb = svg && svg.viewBox && svg.viewBox.baseVal
  if (svg && vb && vb.width > 0 && vb.height > 0) {
    svg.style.width = `${vb.width}px`
    svg.style.height = `${vb.height}px`
    svg.style.maxWidth = 'none'
    svg.removeAttribute('width')
    clone.style.width = 'max-content'
    clone.style.overflow = 'visible'
  }
  return clone
}
// END_BLOCK_VIEWER_DIAGRAM_CLONE

class BlockViewer {
  static pluginName = 'blockViewer'

  constructor (muya, options = {}) {
    this.muya = muya
    this.options = options
    this.isOpen = false
    this.kind = null // 'diagram' | 'table'
    this.returnFocusEl = null
    this.panzoom = null
    this.destroyed = false
    // C-51 T-014: the live source block of the open clone and its figure
    // id (the block key — element ids survive muya re-patches), plus the
    // theme-refresh poll state. The figure ELEMENT is the fallback anchor
    // when the id cannot resolve (re-renders may replace the inner
    // elements while the figure itself is patched in place), and
    // lastClonedToken gates the poll on actual content change.
    this.sourceEl = null
    this.sourceFigureId = null
    this.sourceFigureEl = null
    this.lastClonedToken = null
    this.refreshTimer = null
    this.refreshDeadline = 0
    this.buildViewer()
    this.listen()
  }

  // START_BLOCK_VIEWER_OVERLAY_DOM
  // The overlay lives in document.body (like other muya floats) so it is
  // never re-patched by snabbdom and never receives editor clicks.
  buildViewer () {
    const viewer = document.createElement('div')
    viewer.className = 'ag-block-viewer'
    viewer.setAttribute('role', 'dialog')
    viewer.setAttribute('aria-modal', 'true')

    const backdrop = document.createElement('div')
    backdrop.className = 'ag-block-viewer-backdrop'

    const header = document.createElement('div')
    header.className = 'ag-block-viewer-header'
    const title = document.createElement('span')
    title.className = 'ag-block-viewer-title'
    const controls = document.createElement('div')
    controls.className = 'ag-block-viewer-controls'
    header.appendChild(title)
    header.appendChild(controls)

    const stage = document.createElement('div')
    stage.className = 'ag-block-viewer-stage'
    stage.setAttribute('tabindex', '-1')
    const canvas = document.createElement('div')
    canvas.className = 'ag-block-viewer-canvas'
    stage.appendChild(canvas)

    viewer.appendChild(backdrop)
    viewer.appendChild(header)
    viewer.appendChild(stage)
    document.body.appendChild(viewer)

    const makeButton = (className, text) => {
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.className = className
      btn.textContent = text
      return btn
    }
    this.zoomOutBtn = makeButton('ag-block-viewer-btn ag-block-viewer-zoom-out', '−')
    this.zoomInBtn = makeButton('ag-block-viewer-btn ag-block-viewer-zoom-in', '+')
    this.fitBtn = makeButton('ag-block-viewer-btn ag-block-viewer-fit', '⛶')
    this.actualSizeBtn = makeButton('ag-block-viewer-btn ag-block-viewer-actual-size', '1:1')
    this.closeBtn = makeButton('ag-block-viewer-btn ag-block-viewer-close-btn', '✕')
    this.appearanceBtn = createAppearanceButton(this.muya.options?.t)
    this.appearanceBtn.hidden = true
    controls.appendChild(this.appearanceBtn)
    this.appearanceBtn.addEventListener('click', () => {
      const figure = this.resolveLiveSource()?.closest('figure[data-role="MERMAID"]')
      if (figure) this.muya.diagramAppearance?.openForFigure(figure, this.appearanceBtn)
    })
    controls.appendChild(this.zoomOutBtn)
    controls.appendChild(this.zoomInBtn)
    controls.appendChild(this.fitBtn)
    controls.appendChild(this.actualSizeBtn)
    controls.appendChild(this.closeBtn)
    this.zoomOutBtn.addEventListener('click', () => this.zoomOut())
    this.zoomInBtn.addEventListener('click', () => this.zoomIn())
    this.fitBtn.addEventListener('click', () => this.fitToScreen())
    this.actualSizeBtn.addEventListener('click', () => this.actualSize())
    this.closeBtn.addEventListener('click', () => this.close())

    this.viewerEl = viewer
    this.backdropEl = backdrop
    this.headerEl = header
    this.titleEl = title
    this.stage = stage
    this.canvas = canvas
  }
  // END_BLOCK_VIEWER_OVERLAY_DOM

  t (key) {
    const t = this.muya && this.muya.options && this.muya.options.t
    return t ? t(key) : key
  }

  // START_BLOCK_VIEWER_BLOCK_RESOLUTION
  // C-51 T-006: resolution accepts an element anywhere in or around the
  // viewable block — the preview itself (Cmd/Ctrl+click path), the table,
  // or the FIGURE the persistent button.ag-block-expand dispatches (the
  // button is a figure child, so the preview/table must be resolved
  // DOWNWARD from the figure). The ROLE check gates both directions:
  // math and html previews are also div.ag-container-preview (and KaTeX
  // emits svg for radicals) — they must never resolve.
  diagramPreviewHasContent (preview) {
    // svg: mermaid, flowchart.js, js-sequence, vega-lite (svg renderer);
    // img: plantuml (rendered as an <img> pointing at the plantuml server).
    return !!(preview && (preview.querySelector('svg') || preview.querySelector('img')))
  }

  findDiagramPreview (el) {
    if (!el || el.nodeType !== 1 || !el.closest) return null
    const figure = el.closest(DIAGRAM_FIGURE_SELECTOR)
    if (!figure) {
      return null
    }
    const preview = figure.querySelector(`div.${CLASS_OR_ID.AG_CONTAINER_PREVIEW}`)
    return this.diagramPreviewHasContent(preview) ? preview : null
  }

  findTable (el) {
    if (!el || el.nodeType !== 1 || !el.closest) return null
    // table.ag-paragraph is a rendered muya table; the front-matter
    // properties table is div-based and never matches.
    const table = el.closest(`table.${CLASS_OR_ID.AG_PARAGRAPH}`)
    if (table) {
      return table
    }
    const figure = el.closest("figure[data-role='TABLE']")
    return figure ? figure.querySelector(`table.${CLASS_OR_ID.AG_PARAGRAPH}`) : null
  }

  findViewableBlock (el) {
    return this.findDiagramPreview(el) || this.findTable(el)
  }

  openFromElement (el) {
    // Only the persistent expand button dispatches the FIGURE itself: focus
    // returns to that figure's button on close (the keyboard path routes
    // Enter through muya, so the button is not document.activeElement).
    this.pendingExpandFigureId = el && el.tagName === 'FIGURE' && el.id ? el.id : null
    const preview = this.findDiagramPreview(el)
    if (preview) {
      return this.open({ kind: 'diagram', source: preview })
    }
    const table = this.findTable(el)
    if (table) {
      return this.open({ kind: 'table', source: table })
    }
    return false
  }
  // END_BLOCK_VIEWER_BLOCK_RESOLUTION

  // START_BLOCK_VIEWER_OPEN
  open ({ kind, source }) {
    this.close({ restoreFocus: false })
    this.kind = kind
    // C-51 T-014: remember the live source block so a later options
    // re-render (theme switch) can refresh the clone from the re-rendered
    // block. Block-key ids survive muya re-patches, so the poll below can
    // re-resolve the LIVE elements after the DOM swap.
    this.sourceEl = source || null
    const sourceFigure = source && source.closest ? source.closest('figure') : null
    this.sourceFigureId = sourceFigure && sourceFigure.id ? sourceFigure.id : null
    this.sourceFigureEl = sourceFigure || null
    this.lastClonedToken = this.sourceToken(source)
    const active = document.activeElement
    const inViewerUi = active && this.viewerEl && this.viewerEl.contains(active)
    this.returnFocusEl =
      active && !inViewerUi && typeof active.focus === 'function'
        ? active
        : this.muya.container
    // C-51 T-006 review: a muya re-render while the viewer is open replaces
    // the figure's expand button — remember the figure id so close() can
    // focus the live button instead of a detached one.
    const expandFigure = active && active.closest ? active.closest('figure') : null
    this.returnFocusFigureId = this.pendingExpandFigureId ||
      (active && active.classList && active.classList.contains('ag-block-expand') && expandFigure
        ? expandFigure.id
        : null)
    this.pendingExpandFigureId = null

    this.refreshViewerLabels()
    this.titleEl.textContent = this.t(
      kind === 'table' ? 'blockViewer.table' : 'blockViewer.diagram'
    )
    this.canvas.className = 'ag-block-viewer-canvas'
    this.canvas.style.maxHeight = ''
    this.canvas.innerHTML = ''
    if (kind === 'table') {
      this.canvas.classList.add('ag-block-viewer-scrollable')
      this.canvas.appendChild(sanitizeTableClone(source))
    } else {
      this.canvas.appendChild(cloneDiagramPreview(source))
    }

    this.viewerEl.classList.add('ag-block-viewer-open')
    this.initPanzoom()
    this.isOpen = true
    // Focus the stage so viewer keys (+/−/0/1/Esc) land immediately and
    // the editor keyboard handler stops receiving input while open.
    this.stage.focus()
    this.fitToScreen()
    // Fit again once the overlay has laid out and panzoom has applied its
    // deferred initial transform (it resets the translation on a timer
    // after init, which left a wide diagram off-centre in Chromium/WebKit).
    setTimeout(() => {
      requestAnimationFrame(() => {
        if (this.isOpen) this.fitToScreen()
      })
    }, 0)
    console.debug('[Muya][blockViewer][BLOCK_VIEWER_OPEN] viewer opened', { kind })
    this.muya.eventCenter.dispatch('muya-block-viewer-open', { kind })
    return true
  }
  // END_BLOCK_VIEWER_OPEN

  refreshViewerLabels () {
    this.refreshAppearanceButton()
    this.zoomInBtn.title = this.t('blockViewer.zoomIn')
    this.zoomInBtn.setAttribute('aria-label', this.t('blockViewer.zoomIn'))
    this.zoomOutBtn.title = this.t('blockViewer.zoomOut')
    this.zoomOutBtn.setAttribute('aria-label', this.t('blockViewer.zoomOut'))
    this.fitBtn.title = this.t('blockViewer.fit')
    this.fitBtn.setAttribute('aria-label', this.t('blockViewer.fit'))
    this.actualSizeBtn.title = this.t('blockViewer.actualSize')
    this.actualSizeBtn.setAttribute('aria-label', this.t('blockViewer.actualSize'))
    this.closeBtn.title = this.t('blockViewer.close')
    this.closeBtn.setAttribute('aria-label', this.t('blockViewer.close'))
  }

  refreshAppearanceButton () {
    const appearance = this.muya.diagramAppearance?.getAppearance(this.sourceFigureId)
    this.appearanceBtn.hidden = !appearance
    this.focusableEls = null
    if (appearance) updateAppearanceButton(this.appearanceBtn, this.muya.options?.t, appearance.mode)
  }

  // START_BLOCK_VIEWER_PANZOOM
  initPanzoom () {
    this.destroyPanzoom()
    this.panzoom = Panzoom(this.canvas, {
      maxScale: MAX_SCALE,
      minScale: MIN_SCALE,
      step: 0.3,
      duration: 100,
      overflow: 'hidden',
      touchAction: 'none'
    })
  }

  destroyPanzoom () {
    if (this.panzoom) {
      this.panzoom.destroy()
      this.panzoom = null
    }
  }

  // scrollWidth/scrollHeight cover the capped table scrollport (content
  // taller than the box); offsetWidth/offsetHeight cover the diagram clone.
  contentSize () {
    const w = this.canvas.scrollWidth || this.canvas.offsetWidth || 1
    const h = this.canvas.scrollHeight || this.canvas.offsetHeight || 1
    return { w, h }
  }

  // START_BLOCK_VIEWER_FIT_SCALE
  // C-51 T-014: fit is min(availW/w, availH/h) clamped to
  // [MIN_SCALE, MAX_SCALE] — NO 1:1 cap. The inherited cap kept a small
  // diagram opening at 100% (tiny chart in a huge stage, user smoke
  // 2026-10-16); big diagrams still scale down exactly as before because
  // their min is already < 1. The Fit button, the '0' key and the initial
  // open share this maths; 1:1 (actualSize) still restores natural size.
  computeFitScale () {
    const availW = this.stage.clientWidth
    const availH = this.stage.clientHeight
    if (!availW || !availH) return 1
    const { w, h } = this.contentSize()
    const fit = Math.min((availW - FIT_PADDING) / w, (availH - FIT_PADDING) / h)
    if (!Number.isFinite(fit)) return 1
    return Math.min(Math.max(fit, MIN_SCALE), MAX_SCALE)
  }
  // END_BLOCK_VIEWER_FIT_SCALE

  // Panzoom composes `scale(s) translate(x, y)` around the canvas centre:
  // the translation is applied in the pre-scale space, so the desired
  // screen-space offset has to be divided by the scale.
  centerContent (scale) {
    if (!this.panzoom) return
    const availW = this.stage.clientWidth
    const availH = this.stage.clientHeight
    const { w, h } = this.contentSize()
    this.panzoom.pan((availW - w) / 2 / scale, (availH - h) / 2 / scale, {
      animate: false
    })
  }

  fitToScreen () {
    if (!this.panzoom) return
    // Fit shows the whole table: lift the scroll cap before measuring.
    if (this.kind === 'table') {
      this.canvas.style.maxHeight = ''
    }
    const scale = this.computeFitScale()
    this.panzoom.zoom(scale, { animate: false })
    this.centerContent(scale)
    console.debug('[Muya][blockViewer][BLOCK_VIEWER_FIT] fit to screen', { scale })
  }

  actualSize () {
    if (!this.panzoom) return
    this.panzoom.zoom(1, { animate: false })
    this.applyTableScrollCap(1)
    this.centerContent(1)
  }

  zoomAtCenter (toScale) {
    if (!this.panzoom) return
    const rect = this.stage.getBoundingClientRect()
    this.panzoom.zoomToPoint(
      toScale,
      {
        clientX: rect.left + rect.width / 2,
        clientY: rect.top + rect.height / 2
      },
      { animate: false }
    )
  }

  zoomIn () {
    this.zoomAtCenter((this.panzoom ? this.panzoom.getScale() : 1) * ZOOM_KEY_FACTOR)
  }

  zoomOut () {
    this.zoomAtCenter((this.panzoom ? this.panzoom.getScale() : 1) / ZOOM_KEY_FACTOR)
  }

  onWheel = (event) => {
    if (!this.isOpen || !this.panzoom) return
    if (event.ctrlKey || event.metaKey) {
      // Trackpad pinch arrives as a wheel event with ctrlKey in WebKit
      // (Safari 18+) and Chromium; Cmd/Ctrl+wheel zooms on purpose.
      this.panzoom.zoomWithWheel(event)
      return
    }
    if (this.kind === 'table' && this.tableCanScroll(event)) {
      // Native scrolling keeps the sticky header row working.
      return
    }
    event.preventDefault()
    this.panzoom.pan(-event.deltaX, -event.deltaY, { relative: true, animate: false })
  }

  tableCanScroll (event) {
    const el = this.canvas
    const canY =
      (event.deltaY < 0 && el.scrollTop > 0) ||
      (event.deltaY > 0 && el.scrollTop + el.clientHeight < el.scrollHeight - 1)
    const canX =
      (event.deltaX < 0 && el.scrollLeft > 0) ||
      (event.deltaX > 0 && el.scrollLeft + el.clientWidth < el.scrollWidth - 1)
    return canY || canX
  }
  // END_BLOCK_VIEWER_PANZOOM

  // START_BLOCK_VIEWER_STICKY_CAP
  // At >=100% the table canvas is capped so the scrollport visually fills
  // the stage and the sticky thead sticks at the top of the screen; below
  // 100% (fit / zoomed out) the cap is lifted so the whole table is shown.
  onPanzoomChange = (event) => {
    if (!this.isOpen || this.kind !== 'table') return
    const detail = event.detail || {}
    this.applyTableScrollCap(detail.scale)
  }

  applyTableScrollCap (scale) {
    if (!scale || scale < 1 || !this.stage.clientHeight) {
      this.canvas.style.maxHeight = ''
    } else {
      this.canvas.style.maxHeight = `${Math.round(this.stage.clientHeight / scale)}px`
    }
  }
  // END_BLOCK_VIEWER_STICKY_CAP

  // START_BLOCK_VIEWER_KEYBOARD
  onKeydown = (event) => {
    if (!this.isOpen) return
    switch (event.key) {
      case EVENT_KEYS.Escape:
        event.preventDefault()
        event.stopPropagation()
        this.close()
        return
      case '+':
      case '=':
        event.preventDefault()
        event.stopPropagation()
        this.zoomIn()
        return
      case '-':
      case '_':
        event.preventDefault()
        event.stopPropagation()
        this.zoomOut()
        return
      case '0':
        event.preventDefault()
        event.stopPropagation()
        this.fitToScreen()
        return
      case '1':
        event.preventDefault()
        event.stopPropagation()
        this.actualSize()
        return
      case EVENT_KEYS.Tab:
        this.trapFocus(event)
        return
    }
  }

  getFocusableElements () {
    if (!this.focusableEls) {
      this.focusableEls = Array.from(
        this.viewerEl.querySelectorAll('button, [href], input, select, textarea')
      ).filter((el) => !el.hidden && !el.disabled && el.getAttribute('tabindex') !== '-1')
    }
    return this.focusableEls
  }

  trapFocus (event) {
    const focusables = this.getFocusableElements()
    if (!focusables.length) {
      event.preventDefault()
      return
    }
    const first = focusables[0]
    const last = focusables[focusables.length - 1]
    const index = focusables.indexOf(document.activeElement)
    if (event.shiftKey) {
      if (index <= 0) {
        event.preventDefault()
        last.focus()
      }
    } else if (index === -1 || index === focusables.length - 1) {
      event.preventDefault()
      first.focus()
    }
  }
  // END_BLOCK_VIEWER_KEYBOARD

  // START_BLOCK_VIEWER_CLOSE
  close ({ restoreFocus = true } = {}) {
    if (!this.isOpen) return
    if (this.muya.diagramAppearance?.anchor === this.appearanceBtn) this.muya.diagramAppearance.close({ restoreFocus: false })
    this.isOpen = false
    this.focusableEls = null
    this.cancelThemeRefresh()
    this.sourceEl = null
    this.sourceFigureId = null
    this.sourceFigureEl = null
    this.lastClonedToken = null
    this.destroyPanzoom()
    this.canvas.style.maxHeight = ''
    this.canvas.innerHTML = ''
    this.canvas.style.transform = ''
    this.viewerEl.classList.remove('ag-block-viewer-open')
    this.kind = null
    let el = this.returnFocusEl
    const figureId = this.returnFocusFigureId
    this.returnFocusEl = null
    this.returnFocusFigureId = null
    if (figureId) {
      const fig = document.getElementById(figureId)
      const live = fig && fig.querySelector('.ag-block-expand')
      if (live) el = live
    }
    if (restoreFocus && el && typeof el.focus === 'function') {
      el.focus()
      if (figureId) {
        // The re-asserts resolve the LIVE button from the figure id: a
        // re-render while the window is open (e.g. the closing key's
        // keyup triggering a partial render) replaces the figure's DOM,
        // and the captured el would be detached — focus() on it a silent
        // no-op while the container kept the focus (C-51 T-010).
        const reassert = () => {
          let live = el
          if (figureId) {
            const fig = document.getElementById(figureId)
            const button = fig && fig.querySelector('.ag-block-expand')
            if (button) live = button
          }
          if (live && live.isConnected && document.activeElement !== live) {
            live.focus()
          }
        }
        setTimeout(reassert, 0)
        setTimeout(reassert, 50)
        // C-51 T-010: muya can re-focus its container later than 50 ms
        // (the Escape keydown's own follow-up). For a short window a focus
        // that lands in the editor goes back to the button — until the
        // user points or taps somewhere, which ends the window at once.
        const container = this.muya && this.muya.container
        if (container) {
          const stop = () => {
            container.removeEventListener('focusin', onFocusIn)
            document.removeEventListener('pointerdown', stop, true)
          }
          const onFocusIn = () => {
            stop()
            reassert()
          }
          container.addEventListener('focusin', onFocusIn)
          document.addEventListener('pointerdown', stop, true)
          setTimeout(stop, 400)
        }
      }
    }
    console.debug('[Muya][blockViewer][BLOCK_VIEWER_CLOSE] viewer closed')
    this.muya.eventCenter.dispatch('muya-block-viewer-close')
  }
  // END_BLOCK_VIEWER_CLOSE

  onBackdropClick = (event) => {
    if (event.target === this.backdropEl && this.isOpen) {
      this.close()
    }
  }

  // START_BLOCK_VIEWER_THEME_REFRESH
  // C-51 T-014: an open viewer follows option-driven re-renders — the app
  // theme switch re-renders every block through Muya#setOptions(_, true),
  // which dispatches muya-options-rerender after the sync DOM patch. The
  // diagrams themselves finish asynchronously (mermaid pipeline insert,
  // awaited vega embed), so the refresh POLLS the live block until its
  // preview carries RENDERED content again that DIFFERS from what the
  // viewer already shows, then re-clones in place.
  // resolveLiveSource finds the re-rendered block: muya element ids are
  // block keys and survive re-patches, so the captured source id (or the
  // figure id / the captured figure element) resolves the live element;
  // the content check keeps the poll waiting through the loading
  // placeholder. Id lookups never resolve the viewer's OWN clone — it
  // legitimately shares the source's ids (cloneNode keeps the div id; the
  // SVG id is shared on purpose so mermaid's scoped styles apply) and
  // would otherwise feed the refresh its own stale copy.
  sourceToken (source) {
    return source && typeof source.outerHTML === 'string' ? source.outerHTML : null
  }

  resolveLiveSource () {
    if (!this.sourceEl && !this.sourceFigureId && !this.sourceFigureEl) return null
    const byId = (id) => {
      if (!id) return null
      const el = document.getElementById(id)
      if (!el || (this.viewerEl && this.viewerEl.contains(el))) return null
      return el
    }
    const liveFigure = () =>
      byId(this.sourceFigureId) ||
      (this.sourceFigureEl && this.sourceFigureEl.isConnected ? this.sourceFigureEl : null)
    if (this.kind === 'table') {
      const direct = byId(this.sourceEl && this.sourceEl.id)
      if (direct && direct.tagName === 'TABLE') return direct
      const figure = liveFigure()
      const table = figure && figure.querySelector(`table.${CLASS_OR_ID.AG_PARAGRAPH}`)
      return table || null
    }
    const direct = byId(this.sourceEl && this.sourceEl.id)
    if (direct && this.diagramPreviewHasContent(direct)) return direct
    const figure = liveFigure()
    if (figure) {
      const preview = figure.querySelector(`div.${CLASS_OR_ID.AG_CONTAINER_PREVIEW}`)
      if (this.diagramPreviewHasContent(preview)) return preview
    }
    return null
  }

  refreshCloneFrom (source) {
    // Swap the canvas content in place: the panzoom transform rides the
    // canvas element itself, so the current zoom and pan survive the
    // refresh (kept "where practical" — a same-size re-rendered diagram
    // does not move at all).
    this.sourceEl = source
    const figure = source.closest ? source.closest('figure') : null
    if (figure && figure.id) {
      this.sourceFigureId = figure.id
    }
    this.sourceFigureEl = figure || null
    this.lastClonedToken = this.sourceToken(source)
    const clone = this.kind === 'table'
      ? sanitizeTableClone(source)
      : cloneDiagramPreview(source)
    this.canvas.innerHTML = ''
    this.canvas.appendChild(clone)
    console.debug('[Muya][blockViewer][BLOCK_VIEWER_THEME_REFRESH] clone refreshed', {
      kind: this.kind,
      blockKey: this.sourceFigureId
    })
    this.muya.eventCenter.dispatch('muya-block-viewer-refreshed', { kind: this.kind })
  }

  scheduleThemeRefresh () {
    if (!this.isOpen) return
    // A re-render already polling extends its deadline; a fresh one
    // starts the poll. The first tick is immediate (tables and patched
    // previews are ready right after the DOM swap).
    this.refreshDeadline = Date.now() + THEME_REFRESH_TIMEOUT_MS
    if (this.refreshTimer) return
    const tick = () => {
      this.refreshTimer = null
      if (!this.isOpen || this.destroyed) return
      const source = this.resolveLiveSource()
      if (source) {
        // Content present is not enough: the mermaid pipeline re-inserts
        // the last-good OLD-theme svg synchronously during the re-render,
        // before the async re-draw lands (mermaidPipeline.render's
        // insertSvg(target, good.svg)). Cloning that unchanged content
        // would freeze the old theme and end the poll. The token is read
        // from the LIVE source only — the viewer's clone carries its own
        // inline sizing overrides and never compares equal.
        const token = this.sourceToken(source)
        if (token === null || token !== this.lastClonedToken) {
          this.refreshCloneFrom(source)
          return
        }
      }
      if (Date.now() >= this.refreshDeadline) {
        // The block may be gone (deleted by the re-render), its diagram
        // never came back, or the re-render produced identical content
        // (nothing visually changed) — keep the last clone rather than
        // blanking.
        console.debug('[Muya][blockViewer][BLOCK_VIEWER_THEME_REFRESH] timed out', {
          kind: this.kind
        })
        return
      }
      this.refreshTimer = setTimeout(tick, THEME_REFRESH_POLL_MS)
    }
    this.refreshTimer = setTimeout(tick, 0)
  }

  cancelThemeRefresh () {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer)
      this.refreshTimer = null
    }
  }

  onOptionsRerender = () => {
    if (this.isOpen) {
      this.refreshAppearanceButton()
      this.scheduleThemeRefresh()
    }
  }

  onAppearanceChange = ({ figureKey } = {}) => {
    if (this.isOpen && figureKey === this.sourceFigureId) {
      this.refreshAppearanceButton()
      this.scheduleThemeRefresh()
    }
  }
  // END_BLOCK_VIEWER_THEME_REFRESH

  onOpenEvent = ({ element } = {}) => {
    if (element) {
      this.openFromElement(element)
    }
  }

  listen () {
    const { eventCenter } = this.muya
    eventCenter.subscribe('muya-block-viewer', this.onOpenEvent)
    // C-51 T-014: option-driven re-renders (theme switch) refresh the
    // open clone once the live block's diagram has re-drawn.
    eventCenter.subscribe('muya-options-rerender', this.onOptionsRerender)
    eventCenter.subscribe('muya-diagram-appearance-change', this.onAppearanceChange)
    // Metadata undo/redo and source updates must refresh the same open clone.
    eventCenter.subscribe('change', this.onOptionsRerender)
    this.viewerEl.addEventListener('keydown', this.onKeydown)
    this.stage.addEventListener('wheel', this.onWheel, { passive: false })
    this.backdropEl.addEventListener('click', this.onBackdropClick)
    this.canvas.addEventListener('panzoomchange', this.onPanzoomChange)
  }

  // START_BLOCK_VIEWER_DESTROY
  destroy () {
    if (this.destroyed) return
    this.destroyed = true
    this.close({ restoreFocus: false })
    this.viewerEl.removeEventListener('keydown', this.onKeydown)
    this.stage.removeEventListener('wheel', this.onWheel)
    this.backdropEl.removeEventListener('click', this.onBackdropClick)
    this.canvas.removeEventListener('panzoomchange', this.onPanzoomChange)
    const { eventCenter } = this.muya
    eventCenter.unsubscribe('muya-block-viewer', this.onOpenEvent)
    eventCenter.unsubscribe('muya-options-rerender', this.onOptionsRerender)
    eventCenter.unsubscribe('muya-diagram-appearance-change', this.onAppearanceChange)
    eventCenter.unsubscribe('change', this.onOptionsRerender)
    // container DOM events are detached by muya's detachAllDomEvents()
    this.viewerEl.remove()
  }
  // END_BLOCK_VIEWER_DESTROY
}

export default BlockViewer
