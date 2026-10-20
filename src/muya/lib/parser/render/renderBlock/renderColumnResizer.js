// FILE: src/muya/lib/parser/render/renderBlock/renderColumnResizer.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: C-39 T-002 — the invisible header-border hit zone span rendered into every th of a resizable table.
//   SCOPE: One vnode factory, mirroring renderTableDargBar's drag bars.
//   DEPENDS: muya snabbdom h.
//   LINKS: .grace/changes/archive/C-39 T-002; renderContainerBlock START_BLOCK_TABLE_COLUMN_RESIZER_HANDLE; tableResize/index.js (interaction owner).
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   renderColumnResizer - span.ag-column-resizer appended to each th; position/cursor/hairline live in the C-39 section of lib/assets/styles/index.css.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - 2026-10-15 C-39 T-002: new. The span carries no state — the column index is resolved at event time from the parent th's cellIndex, so it survives re-renders and column moves for free.
// END_CHANGE_SUMMARY

import { h } from '../snabbdom'

export const renderColumnResizer = () => {
  return h('span.ag-column-resizer', {
    attrs: { contenteditable: 'false' },
    dataset: { resizeHandle: '' }
  })
}
