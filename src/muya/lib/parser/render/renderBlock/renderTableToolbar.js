// FILE: src/muya/lib/parser/render/renderBlock/renderTableToolbar.js
// VERSION: 2.0.0
// START_MODULE_CONTRACT
//   PURPOSE: The TABLE toolbar — a C-56-family pill (div.ag-block-toolbar.ag-table-toolbar) rendered as a direct child of every table figure. Since C-PAGE-WIDTH-TABLES T-007 (R-8) it carries the honest three-mode segment — Auto / Fit page / Full width — replacing the C-65 two-state Full width ↔ Fit to page toggle (the fake fit is retired: Fit page really distributes into the column, Auto returns to content sizing in one click), plus the C-70 «Copy as image» and the need-gated «Open full screen» actions.
//   SCOPE: The pill vnode factory (16-grid 1.5-stroke icons, localized labels + title/aria-label, the hidden hover-reveal label span, the per-mode active state of the segment, the button selector constant the routing keys on). The vnode receives only the Full width fact ({ fullWidth } — what renderContainerBlock knows at vnode time); the Fit/Auto active states are corrected before paint by TableResize.updateToolbarModeDom (the same pre-paint DOM pass the C-65 label swap used). Placement lives in renderContainerBlock.js START_BLOCK_TABLE_TOOLBAR_AND_CAPTION (ABOVE the table, right edge on the text-column edge); looks in the C-65 CSS section of lib/assets/styles/index.css; click routing lives in lib/tableResize/index.js (capture/bubble phases — clickEvent.js never sees these buttons).
//   DEPENDS: muya snabbdom h; muya options.t (tableToolbar.modeAuto / fitToPage / fullWidth — localized in the 10 locales — and blockToolbar.openFullScreen / copyImage, shared with the diagram pill); renderBlockToolbar glyphs and toolbarLabelEvents (shared cumulative inline-label reveal).
//   LINKS: .grace/changes/active/C-PAGE-WIDTH-TABLES (plan T-007, spec R-8, corner C-8) and .grace/graph/performance.xml M-061; .grace/changes/archive/C-TOOLBAR-LABELS; .grace/changes/archive/C-65 T-002; .grace/graph/runtime.xml M-012 fn-toolbarLabelVisits; .grace/verification/runtime.xml V-M-012 (scenario-toolbar-label-visits, scenario-table-footer, scenario-66); renderBlockToolbar.js (shared glyphs and visit hooks); expandNeed.js (viewer need gate); keyboard.js BLOCK_KEYBOARD_EXPAND_BUTTON (button key ownership); tableResize/index.js (setModeFromElement + updateToolbarModeDom).
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   TABLE_TOOLBAR_SELECTOR - selector of the table pill ("div.ag-block-toolbar.ag-table-toolbar", a DIRECT figure child like the diagram pill).
//   TABLE_TOOLBAR_BUTTON_SELECTOR - selector shared by the pill's buttons ("button.ag-table-toolbar-btn" — routed by lib/tableResize; the buttons ALSO carry the ag-block-expand family class so the keyboard.js key guard covers them, but NOT dataset.blockToolbarAction, so clickEvent.js's pill branch can never misroute them).
//   TOOLBAR_TABLE_AUTO_ICON_PATH - the Auto mode glyph (a table row/col grid at content size).
//   TOOLBAR_TABLE_FULLWIDTH_ICON_PATH - the Full width glyph (arrows out to both edges).
//   TOOLBAR_TABLE_FIT_ICON_PATH - the Fit page glyph (arrows collapsing inward).
//   default - renderTableToolbar(t, { fullWidth }) - the pill vnode: the three-mode segment (Full active per the passed fact, Fit/Auto corrected pre-paint by TableResize), Copy as image, viewer-need-gated Open full screen, panel-local cumulative labels.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v2.0.0 - 2026-11-02 C-PAGE-WIDTH-TABLES T-007: the
//   two-state toggle becomes the honest three-mode segment (Auto / Fit
//   page / Full width) with per-button dataset.tableMode and the
//   'setMode' action; the active state renders from the passed fullWidth
//   fact and TableResize corrects Fit/Auto before paint. The retired
//   fake-fit toggle (this button previously promised «Fit to page» while
//   the content kept scrolling) is gone.
//   PREV: v1.3.0 - 2026-10-20 C-TOOLBAR-LABELS: share panel-local cumulative label reveal with diagram toolbars.
//   PREV: v1.2.0 - 2026-10-20 C-TABLE-FOOTER owner review: document the measured width-toggle gate; fitting tables retain Copy as image.
//   PREV: v1.1.0 - 2026-10-19 C-70: «Copy as image» joins the pill between the toggle and Open full screen (same glyph and locale key as the diagram pill); TableResize routes it to muya-diagram-export.
//   v1.0.0 - 2026-10-18 C-65 T-002: new — every table figure renders the pill ABOVE the table (approved mockup variant E) instead of the standalone expand glyph. Disabled surfaces (the read-only Split View mirror) render no toolbar.
// END_CHANGE_SUMMARY

import { h } from '../snabbdom'
import { TOOLBAR_EXPAND_ICON_PATH, TOOLBAR_COPY_ICON_RECT, TOOLBAR_COPY_ICON_PATHS, toolbarLabelEvents } from './renderBlockToolbar'

export const TABLE_TOOLBAR_SELECTOR = 'div.ag-block-toolbar.ag-table-toolbar'
export const TABLE_TOOLBAR_BUTTON_SELECTOR = 'button.ag-table-toolbar-btn'

// The mockup glyphs at the 16-grid with the family's 1.5 stroke: Auto keeps
// the table at its content size (a small table grid), Full width pushes
// both edges out, Fit page collapses them inward.
export const TOOLBAR_TABLE_AUTO_ICON_PATH =
  'M3.5 4.5h9M3.5 8h9M3.5 11.5h5M3.5 4.5v7M12.5 4.5v7'
export const TOOLBAR_TABLE_FULLWIDTH_ICON_PATH =
  'M2 8h3.5M10.5 8H14M4.5 5.5 2 8l2.5 2.5M11.5 5.5 14 8l-2.5 2.5'
export const TOOLBAR_TABLE_FIT_ICON_PATH =
  'M2 8h3M10.5 8H14M5 5.5 7.5 8 5 10.5M11 5.5 8.5 8 11 10.5'

// START_BLOCK_TABLE_TOOLBAR_VNODE
// 16-grid stroke icon (viewBox 0 0 16 16, currentColor, 1.5 stroke, round
// caps/joins — the family's exact geometry).
const renderIcon = (children) => h('svg', {
  attrs: {
    viewBox: '0 0 16 16',
    width: '16',
    height: '16',
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': '1.5',
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
    'aria-hidden': 'true'
  }
}, children)

// iconPath: one path d string, or an array of icon child vnodes.
const renderToolbarButton = (className, action, label, iconPath, dataset) =>
  h(`button.ag-block-expand.ag-block-toolbar-btn.ag-table-toolbar-btn.${className.trim().split(/\s+/).join('.')}`, {
    attrs: {
      type: 'button',
      title: label,
      'aria-label': label,
      contenteditable: 'false',
      spellcheck: 'false',
      tabindex: '0'
    },
    dataset: Object.assign({ tableToolbarAction: action }, dataset)
  }, [
    renderIcon(Array.isArray(iconPath) ? iconPath : [h('path', { attrs: { d: iconPath } })]),
    // A visited label stays open until the pointer leaves the whole pill.
    h('span.ag-block-toolbar-label', label)
  ])

const renderTableToolbar = (t, { fullWidth = false } = {}) => h(TABLE_TOOLBAR_SELECTOR, {
  attrs: { contenteditable: 'false' },
  on: toolbarLabelEvents
}, [
  // The honest three-mode segment (R-8): Auto (content-sized, the owner
  // gate №5 default), Fit page (the text column, real distribution) and
  // Full width (the window canvas). The vnode knows only the Full fact —
  // TableResize.updateToolbarModeDom marks the live mode before paint.
  renderToolbarButton(
    `ag-table-toolbar-mode${fullWidth ? '' : ' ag-table-toolbar-active'}`,
    'setMode',
    t('tableToolbar.modeAuto'),
    TOOLBAR_TABLE_AUTO_ICON_PATH,
    { tableMode: 'auto' }
  ),
  renderToolbarButton(
    'ag-table-toolbar-mode',
    'setMode',
    t('tableToolbar.fitToPage'),
    TOOLBAR_TABLE_FIT_ICON_PATH,
    { tableMode: 'fit' }
  ),
  renderToolbarButton(
    `ag-table-toolbar-mode${fullWidth ? ' ag-table-toolbar-active' : ''}`,
    'setMode',
    t('tableToolbar.fullWidth'),
    TOOLBAR_TABLE_FULLWIDTH_ICON_PATH,
    { tableMode: 'full' }
  ),
  // C-70 Copy as image — the diagram pill's glyph; the table is drawn
  // from its live layout (utils/tableExport.js) and rasterized at 2×.
  renderToolbarButton(
    'ag-block-toolbar-copy ag-table-toolbar-copy',
    'copyImage',
    t('blockToolbar.copyImage'),
    [
      h('rect', { attrs: { ...TOOLBAR_COPY_ICON_RECT } }),
      ...TOOLBAR_COPY_ICON_PATHS.map((d) => h('path', { attrs: { d } }))
    ]
  ),
  // Open full screen — the shared block viewer; visibility stays
  // need-gated by expandNeed.js (CSS display rules, no Tab stop without
  // ag-expand-needed).
  renderToolbarButton(
    'ag-block-toolbar-expand ag-table-toolbar-expand',
    'expand',
    t('blockToolbar.openFullScreen'),
    TOOLBAR_EXPAND_ICON_PATH
  )
])

export default renderTableToolbar
// END_BLOCK_TABLE_TOOLBAR_VNODE
