// FILE: src/muya/lib/parser/render/renderBlock/renderBlockToolbar.js
// VERSION: 1.3.0
// START_MODULE_CONTRACT
//   PURPOSE: The C-56 T-005 diagram corner toolbar — one hover pill (user choice 2026-10-18, approved mockup variant C) with three same-family icon actions (Edit source, Copy as image, Open full screen) rendered as a direct child of Pele diagram (```mermaid) and Vega-Lite chart figures, replacing the old PNG edit pencil and the standalone expand glyph on those two roles only.
//   SCOPE: the pill vnode factory (16-grid 1.5-stroke icons, localized labels + title/aria-label), panel-local cumulative inline label reveal shared with tables, and syncBlockToolbarState — the post-render pass that keeps the Copy as image button DISABLED while the figure's preview carries no rendered SVG (corner-4; a keep-last-good stale SVG counts as rendered and exports). Visited labels stay open across adjacent buttons and reset on whole-panel pointer/focus exit. Placement lives in renderContainerBlock.js START_BLOCK_TOOLBAR_RENDER; looks in the C-56 T-005 section of lib/assets/styles/index.css; click routing in eventHandler/clickEvent.js START_BLOCK_TOOLBAR_CLICK; the Open-full-screen action keeps the expandNeed.js gate through the figure's ag-expand-needed class.
//   DEPENDS: muya snabbdom h; muya options.t (blockToolbar.editSource / copyImage / openFullScreen — localized in the 10 locales).
//   LINKS: .grace/changes/active/C-TOOLBAR-LABELS; .grace/changes/active/C-56 T-005; .grace/graph/runtime.xml M-012 fn-toolbarLabelVisits; .grace/verification/runtime.xml V-M-012 scenario-toolbar-label-visits and scenario-64; renderExpandButton.js (standalone flowchart/sequence/plantuml controls); expandNeed.js (copy state); clickEvent.js (action routing); keyboard.js BLOCK_KEYBOARD_EXPAND_BUTTON (button key ownership).
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   TOOLBAR_COPY_ICON_PATHS - copy-as-image glyph paths (approved mockup).
//   TOOLBAR_COPY_ICON_RECT - copy-as-image glyph front rect.
//   TOOLBAR_EXPAND_ICON_PATH - open-full-screen glyph path.
//   BLOCK_TOOLBAR_SELECTOR - selector of the pill container ("div.ag-block-toolbar", a DIRECT figure child — survives the mermaid pipeline's preview innerHTML inserts by construction).
//   BLOCK_TOOLBAR_BUTTON_SELECTOR - selector shared by the three pill buttons ("button.ag-block-expand.ag-block-toolbar-btn" — the ag-block-expand family class is the keyboard.js key-guard hook, NOT the click route: clickEvent.js routes by data-block-toolbar-action first).
//   TOOLBAR_EDIT_ICON_PATH / TOOLBAR_COPY_ICON_RECT + TOOLBAR_COPY_ICON_PATHS / TOOLBAR_EXPAND_ICON_PATH - the exact mockup glyph geometry (16×16 viewBox, 1.5 stroke, round caps/joins), pinned by tests/renderer/muya/block-toolbar.test.js.
//   syncBlockToolbarState - figure → toggle the pill copy button's `disabled` per whether div.ag-container-preview holds an svg; no-op without a pill (called from expandNeed.js updateFigureExpandNeed after every render path, pele insert and vega embed).
//   toolbarLabelEvents - shared vnode event hooks: accumulate visited button labels within one panel; reset on whole-panel pointer/focus exit without global listeners or document writes.
//   default - renderBlockToolbar(t, leading = []) - the pill vnode: optional leading controls (C-56 T-007: the C-62 appearance button on Mermaid figures), then three buttons (ag-block-toolbar-edit / -copy / -expand), each with title + aria-label from the blockToolbar.* strings, tabindex 0, the icon and the hidden label span; the expand button's VISIBILITY stays need-gated by CSS (display:none unless the figure carries ag-expand-needed).
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.3.0 - 2026-10-20 C-TOOLBAR-LABELS: visited labels stay open while traversing a table/diagram panel, then reset on leaving it.
//   PREV: v1.2.0 - 2026-10-19 C-70: syncBlockToolbarState keeps a table figure's Copy as image enabled (tables have no preview SVG).
//   PREV: v1.1.0 - 2026-10-18 C-56 T-007: optional `leading`
//   vnodes render before Edit source, so the C-62 appearance control
//   joins the pill and its hover reveal.
//   v1.0.0 - 2026-10-18 C-56 T-005: new — on ```mermaid (pele)
//   and ```vega-lite figures with non-empty source the pill replaces the
//   PNG edit pencil and the standalone expand glyph. Edit source runs the
//   same container edit action the pencil had (handleContainerBlockClick),
//   Copy as image dispatches muya-diagram-export copyImage with the FIGURE
//   (the T-002 host transport in editor.vue), Open full screen dispatches
//   muya-block-viewer with the figure. Every button carries the
//   ag-block-expand family class so the keyboard.js key guard covers it;
//   the expand action keeps the expandNeed.js D-7 gate (display:none
//   without ag-expand-needed — no Tab stop); the copy button is disabled
//   (not hidden) while the block has no rendered SVG (corner-4). Other
//   roles keep today's pencil/expand untouched.
// END_CHANGE_SUMMARY

import { h } from '../snabbdom'

export const BLOCK_TOOLBAR_SELECTOR = 'div.ag-block-toolbar'
export const BLOCK_TOOLBAR_BUTTON_SELECTOR = 'button.ag-block-expand.ag-block-toolbar-btn'

// The approved mockup glyphs (variant C), drawn at the 16-grid with the
// 1.5 stroke the mockup pins — duplicated as data, not imported, so muya
// never depends on renderer-side icon modules.
export const TOOLBAR_EDIT_ICON_PATH = 'M5.5 4.5 2 8l3.5 3.5M10.5 4.5 14 8l-3.5 3.5'
export const TOOLBAR_COPY_ICON_RECT = { x: '4.75', y: '4.75', width: '9', height: '9', rx: '2' }
export const TOOLBAR_COPY_ICON_PATHS = [
  'M11.25 2.25h-7a2 2 0 0 0-2 2v7',
  'm6.5 12 2-2.2 1.4 1.4 1.1-1 1.5 1.8'
]
export const TOOLBAR_EXPAND_ICON_PATH =
  'M9.5 2.5h4v4M13.5 2.5 9 7M6.5 13.5h-4v-4M2.5 13.5 7 9'

// START_BLOCK_TOOLBAR_STATE
// C-56 T-005 corner-4: the Copy as image action is disabled — never
// hidden — while the block has no rendered SVG, and flips enabled the
// moment one lands. Called from expandNeed.js updateFigureExpandNeed,
// which every StateRender render path, the pele pipeline insert and the
// awaited vega embed already funnel through, so no new call sites are
// needed. A keep-last-good stale SVG is a rendered SVG — it exports.
export const syncBlockToolbarState = (figure) => {
  if (!figure || figure.nodeType !== 1 || typeof figure.querySelector !== 'function') return
  const copyButton = figure.querySelector('button.ag-block-toolbar-copy')
  if (!copyButton) return
  // C-70: a table is always "rendered" — its picture is drawn from the
  // live table layout, not from a preview SVG.
  const rendered = figure.getAttribute('data-role') === 'TABLE'
    ? !!figure.querySelector('table')
    : !!figure.querySelector('div.ag-container-preview svg')
  if (copyButton.disabled === rendered) {
    copyButton.disabled = !rendered
  }
}
// END_BLOCK_TOOLBAR_STATE

// START_BLOCK_TOOLBAR_LABEL_VISITS
// The state belongs to the live buttons, so panels cannot affect each
// other and replacing a toolbar naturally starts a compact visit.
const revealToolbarLabel = (event) => {
  const panel = event.currentTarget
  const button = event.target && event.target.closest
    ? event.target.closest('button.ag-block-toolbar-btn')
    : null
  if (button && button.parentElement === panel && !button.disabled) {
    button.classList.add('ag-toolbar-label-open')
  }
}

const resetToolbarLabels = (event) => {
  for (const button of event.currentTarget.querySelectorAll('button.ag-toolbar-label-open')) {
    button.classList.remove('ag-toolbar-label-open')
  }
}

export const toolbarLabelEvents = {
  mouseover: revealToolbarLabel,
  mouseleave: resetToolbarLabels,
  focusin: revealToolbarLabel,
  focusout: (event) => {
    if (!event.currentTarget.contains(event.relatedTarget)) resetToolbarLabels(event)
  }
}
// END_BLOCK_TOOLBAR_LABEL_VISITS

// START_BLOCK_TOOLBAR_VNODE
// 16-grid stroke icon (viewBox 0 0 16 16, currentColor, 1.5 stroke, round
// caps/joins — the mockup's exact geometry).
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

const renderToolbarButton = (action, className, label, iconChildren) =>
  h(`button.ag-block-expand.ag-block-toolbar-btn.${className}`, {
    attrs: {
      type: 'button',
      title: label,
      'aria-label': label,
      contenteditable: 'false',
      spellcheck: 'false',
      tabindex: '0'
    },
    dataset: { blockToolbarAction: action }
  }, [
    renderIcon(iconChildren),
    // Visited labels remain visible until the pointer leaves this panel.
    h('span.ag-block-toolbar-label', label)
  ])

const renderBlockToolbar = (t, leading = []) => h(BLOCK_TOOLBAR_SELECTOR, {
  attrs: { contenteditable: 'false' },
  on: toolbarLabelEvents
}, [
  // C-56 T-007: role-specific leading controls (the C-62 appearance
  // button on Mermaid figures) share the pill's hover reveal.
  ...leading,
  // Edit source «‹ ›» — the container edit action the pencil icon had.
  renderToolbarButton(
    'editSource',
    'ag-block-toolbar-edit',
    t('blockToolbar.editSource'),
    [h('path', { attrs: { d: TOOLBAR_EDIT_ICON_PATH } })]
  ),
  // Copy as image «two rects + mountain» — the C-56 clipboard transport.
  renderToolbarButton(
    'copyImage',
    'ag-block-toolbar-copy',
    t('blockToolbar.copyImage'),
    [
      h('rect', { attrs: { ...TOOLBAR_COPY_ICON_RECT } }),
      ...TOOLBAR_COPY_ICON_PATHS.map((d) => h('path', { attrs: { d } }))
    ]
  ),
  // Open full screen «two diagonal arrows» — the C-51 viewer; visibility
  // stays need-gated by expandNeed.js (CSS display rules).
  renderToolbarButton(
    'expand',
    'ag-block-toolbar-expand',
    t('blockToolbar.openFullScreen'),
    [h('path', { attrs: { d: TOOLBAR_EXPAND_ICON_PATH } })]
  )
])

export default renderBlockToolbar
// END_BLOCK_TOOLBAR_VNODE
