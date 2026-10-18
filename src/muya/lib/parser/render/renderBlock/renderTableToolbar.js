// FILE: src/muya/lib/parser/render/renderBlock/renderTableToolbar.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: C-65 T-002 the TABLE toolbar — a pill of the C-56 family (div.ag-block-toolbar.ag-table-toolbar) with two icon actions (Full width ↔ Fit to page toggle, Open full screen) rendered as a direct child of every table figure, REPLACING the standalone button.ag-block-expand glyph tables carried since C-51.
//   SCOPE: The pill vnode factory (16-grid 1.5-stroke icons, localized labels + title/aria-label, the hidden hover-reveal label span, the active state class and the per-state toggle icon) and the button selector constant the capture-phase routing keys on. Placement lives in renderContainerBlock.js START_BLOCK_TABLE_TOOLBAR_AND_CAPTION (ABOVE the table, right edge on the text-column edge); looks in the C-65 CSS section of lib/assets/styles/index.css; click routing lives in lib/tableResize/index.js (capture phase — clickEvent.js never sees these buttons); the toggle's live label/icon swap lives in TableResize.updateToolbarToggleDom; the Open-full-screen action keeps the expandNeed.js gate through the figure's ag-expand-needed class.
//   DEPENDS: muya snabbdom h; muya options.t (tableToolbar.fullWidth / tableToolbar.fitToPage — localized in the 10 locales — and blockToolbar.openFullScreen, shared with the diagram pill); renderBlockToolbar.TOOLBAR_EXPAND_ICON_PATH (the same mockup glyph).
//   LINKS: .grace/changes/active/C-65 T-002; .grace/graph/runtime.xml M-012; .grace/verification/runtime.xml V-M-012 scenario-64 (the C-56 family) and scenario-66; renderBlockToolbar.js (the family the pill reuses); renderExpandButton.js (the standalone glyph tables no longer render); expandNeed.js (the need gate); keyboard.js BLOCK_KEYBOARD_EXPAND_BUTTON (every button carries the ag-block-expand family class so Tab/Enter/arrows belong to the button).
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   TABLE_TOOLBAR_SELECTOR - selector of the table pill ("div.ag-block-toolbar.ag-table-toolbar", a DIRECT figure child like the diagram pill).
//   TABLE_TOOLBAR_BUTTON_SELECTOR - selector shared by the two table buttons ("button.ag-table-toolbar-btn" — routed by lib/tableResize capture-phase handlers; the buttons ALSO carry the ag-block-expand family class so the keyboard.js key guard covers them, but NOT dataset.blockToolbarAction, so clickEvent.js's pill branch can never misroute them).
//   TOOLBAR_TABLE_FULLWIDTH_ICON_PATH - the Full width glyph (arrows out to both edges, 16-grid 1.5 stroke).
//   TOOLBAR_TABLE_FIT_ICON_PATH - the Fit to page glyph (arrows collapsing inward).
//   default - renderTableToolbar(t, { fullWidth }) - the pill vnode: the toggle button (ag-table-toolbar-toggle, + ag-table-toolbar-active and the fit icon when the mode is on) then the Open full screen button (ag-block-toolbar-expand, need-gated by CSS exactly like the diagram pill's third action).
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - 2026-10-18 C-65 T-002: new — every table figure
//   renders the pill ABOVE the table (CSS positions it just over the
//   table's top edge with its right edge on the text-column edge, approved
//   mockup variant E) instead of the standalone expand glyph. Buttons:
//   «Full width» ↔ «Fit to page» (the per-table R-6 mode, toggled by
//   TableResize through capture-phase routing) and «Open full screen»
//   (the existing viewer dispatch, still need-gated by ag-expand-needed —
//   corner-6 keeps it hidden on narrow tables). The pill hides while the
//   caret is inside the table (ag-active) and reveals on figure hover /
//   keyboard focus exactly like the diagram pill. Disabled surfaces (the
//   read-only Split View mirror) render no toolbar.
// END_CHANGE_SUMMARY

import { h } from '../snabbdom'
import { TOOLBAR_EXPAND_ICON_PATH } from './renderBlockToolbar'

export const TABLE_TOOLBAR_SELECTOR = 'div.ag-block-toolbar.ag-table-toolbar'
export const TABLE_TOOLBAR_BUTTON_SELECTOR = 'button.ag-table-toolbar-btn'

// The mockup glyphs at the 16-grid with the family's 1.5 stroke: Full
// width pushes both edges out, Fit to page collapses them inward.
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

const renderToolbarButton = (className, action, label, iconPath) =>
  h(`button.ag-block-expand.ag-block-toolbar-btn.ag-table-toolbar-btn.${className}`, {
    attrs: {
      type: 'button',
      title: label,
      'aria-label': label,
      contenteditable: 'false',
      spellcheck: 'false',
      tabindex: '0'
    },
    dataset: { tableToolbarAction: action }
  }, [
    renderIcon([h('path', { attrs: { d: iconPath } })]),
    // Variant C family: the text label sits next to the icon and is
    // revealed by the button's own hover (CSS), keeping the resting pill
    // compact.
    h('span.ag-block-toolbar-label', label)
  ])

const renderTableToolbar = (t, { fullWidth = false } = {}) => h(TABLE_TOOLBAR_SELECTOR, {
  attrs: { contenteditable: 'false' }
}, [
  // Full width ↔ Fit to page — the per-table R-6 mode. The active state
  // swaps icon, label and the ag-table-toolbar-active class; TableResize
  // keeps the live DOM in step between renders.
  fullWidth
    ? renderToolbarButton(
      'ag-table-toolbar-toggle ag-table-toolbar-active',
      'toggleFullWidth',
      t('tableToolbar.fitToPage'),
      TOOLBAR_TABLE_FIT_ICON_PATH
    )
    : renderToolbarButton(
      'ag-table-toolbar-toggle',
      'toggleFullWidth',
      t('tableToolbar.fullWidth'),
      TOOLBAR_TABLE_FULLWIDTH_ICON_PATH
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
