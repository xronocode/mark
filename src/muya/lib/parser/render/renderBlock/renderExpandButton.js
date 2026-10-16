// FILE: src/muya/lib/parser/render/renderBlock/renderExpandButton.js
// VERSION: 2.0.0
// START_MODULE_CONTRACT
//   PURPOSE: The always-visible expand button (C-51 T-006 R-4) rendered as a direct child of every viewable figure (mermaid, flowchart, sequence, plantuml, vega-lite diagrams and tables), opening the shared fullscreen block viewer.
//   SCOPE: One vnode factory plus the drawn expand glyph (the M-057 canvas Mermaid drawing: 0 0 16 16 grid, 1.4 stroke, round caps/joins — muya cannot import renderer modules, so the path is duplicated from chromeIcons.CHROME_ICONS.expand and kept identical by a unit test); placement (which figures get it) lives in renderContainerBlock.js START_BLOCK_EXPAND_BUTTON, looks in the C-51 T-006 section of lib/assets/styles/index.css, click routing in eventHandler/clickEvent.js.
//   DEPENDS: muya snabbdom h; muya options.t (blockViewer.expand — already localized in the 10 locales).
//   LINKS: .grace/changes/active/C-51 T-006; .grace/graph/runtime.xml M-012; .grace/verification/runtime.xml V-M-012 scenario-19 and scenario-60; ui/blockViewer (the viewer it opens); src/renderer/src/components/icons/chromeIcons.js (the glyph twin).
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   EXPAND_BUTTON_SELECTOR - CSS selector/class of the button ("button.ag-block-expand"); clickEvent.js and keyboard.js route on it.
//   EXPAND_ICON_PATH - the drawn «expand» glyph path (two outward corner brackets + the diagonal); byte-identical to chromeIcons.CHROME_ICONS.expand (pinned by tests/renderer/muya/block-expand-button.test.js).
//   default - renderExpandButton(t) - the button vnode: type/title/aria-label from t('blockViewer.expand'), contenteditable=false, tabindex 0, inline drawn svg.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v2.0.0 - 2026-10-16 C-51 T-006 (canvas Mermaid rework): the
//   ⤢ text glyph becomes the drawn M-057 expand glyph (16 grid, 1.4 stroke,
//   inline svg using currentColor) and the button gains tabindex=0 so it is
//   a real keyboard Tab stop (keyboard.js BLOCK_KEYBOARD_EXPAND_BUTTON
//   keeps native Tab/Enter/Space semantics while it holds focus).
//   v1.0.0 - 2026-10-16 C-51 T-006: new — the button is a vnode child of the
//   FIGURE (not the preview div) so the mermaid pipeline's innerHTML inserts
//   and every snabbdom re-patch keep it alive by construction; it floats in
//   the reserved top-right corner (CSS) so it never covers diagram or table
//   content.
// END_CHANGE_SUMMARY

import { h } from '../snabbdom'

export const EXPAND_BUTTON_SELECTOR = 'button.ag-block-expand'

export const EXPAND_ICON_PATH =
  'M9.6 2.4h4v4M13.4 2.6 9.2 6.8M6.4 13.6h-4v-4M2.6 13.4l4.2-4.2'

const renderExpandButton = (t) => {
  const label = t('blockViewer.expand')
  const icon = h('svg', {
    attrs: {
      viewBox: '0 0 16 16',
      width: '16',
      height: '16',
      fill: 'none',
      stroke: 'currentColor',
      'stroke-width': '1.4',
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
      'aria-hidden': 'true'
    }
  }, [
    h('path', { attrs: { d: EXPAND_ICON_PATH } })
  ])

  return h(EXPAND_BUTTON_SELECTOR, {
    attrs: {
      type: 'button',
      title: label,
      'aria-label': label,
      contenteditable: 'false',
      spellcheck: 'false',
      tabindex: '0'
    },
    dataset: { expandBlock: '' }
  }, [icon])
}

export default renderExpandButton
