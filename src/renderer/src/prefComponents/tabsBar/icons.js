// FILE: src/renderer/src/prefComponents/tabsBar/icons.js
// VERSION: 1.2.0
// START_MODULE_CONTRACT
//   PURPOSE: The Settings toolbar tab icons as inline SVG functional components — the five C-38 N3 mockup icons (22×22, 1.6 stroke, currentColor) plus the C-LARGE-DOC-WAVE-A Experimental flask.
//   SCOPE: Presentational SVG components only — no state, no props, no events.
//   DEPENDS: vue (h).
//   LINKS: .grace/changes/archive/C-38 (mockup .c38-mockup/Settings.dc.html); .grace/changes/active/C-LARGE-DOC-WAVE-A (T-004 experimental tab); .grace/graph/runtime.xml M-011.
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   ExportTabIcon - Export tray and arrow in the existing 22-pixel scaffold.
//   GeneralTabIcon - gear (cog path + center circle) for the General tab.
//   AppearanceTabIcon - half-filled circle for the Appearance tab.
//   EditorTabIcon - pencil for the Editor tab.
//   MarkdownTabIcon - rounded rect with M + ↓ glyph for the Markdown tab.
//   AdvancedTabIcon - two slider lines with knobs for the Advanced tab.
//   ExperimentalTabIcon - erlenmeyer flask for the Experimental tab (C-LARGE-DOC-WAVE-A T-004), drawn to the same mockup metrics.
//   TAB_ICONS - id → icon component map consumed by tabsBar/index.vue.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   - 2026-11-12 C-EXPORT-SETTINGS-SECTION: add the Export tab using the existing SVG metrics and currentColor.
//   - 2026-11-02 v1.1.0: C-LARGE-DOC-WAVE-A T-004 — ExperimentalTabIcon
//     (flask) joins TAB_ICONS for the new Experimental tab; drawn to the
//     same scaffold metrics as the five C-38 icons.
//   - 2026-10-15 v1.0.0: C-38 T-003 — icons transplanted verbatim from the approved mockup (stroke/fill=currentColor so the active-tab accent and dark mode both apply).
// END_CHANGE_SUMMARY

import { h } from 'vue'

// START_BLOCK_TAB_ICON_SVG
// Shared svg scaffold: 22×22, 24-grid, stroke=currentColor at 1.6 with
// round caps/joins (mockup metrics). Children are raw VNodes so each icon
// can mix stroked paths with the filled/circular shapes the mockup uses.
const svg = (children, name) => ({
  name,
  render: () =>
    h(
      'svg',
      {
        width: '22',
        height: '22',
        viewBox: '0 0 24 24',
        fill: 'none',
        stroke: 'currentColor',
        'stroke-width': '1.6',
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round',
        'aria-hidden': 'true'
      },
      children
    )
})
// END_BLOCK_TAB_ICON_SVG

const path = (d) => h('path', { d, fill: 'none' })

export const ExportTabIcon = svg(
  [path('M12 15V3M8 7l4-4 4 4'), path('M5 10v9a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-9')],
  'ExportTabIcon'
)

export const GeneralTabIcon = svg(
  [
    h('circle', { cx: '12', cy: '12', r: '3', fill: 'none' }),
    path(
      'M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z'
    )
  ],
  'GeneralTabIcon'
)

export const AppearanceTabIcon = svg(
  [
    h('circle', { cx: '12', cy: '12', r: '8.5', fill: 'none' }),
    // The dark half is a fill, not a stroke (mockup moon-style split).
    h('path', { d: 'M12 3.5a8.5 8.5 0 0 1 0 17z', fill: 'currentColor', stroke: 'none' })
  ],
  'AppearanceTabIcon'
)

export const EditorTabIcon = svg(
  [path('M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z'), path('M13.5 6.5l4 4')],
  'EditorTabIcon'
)

export const MarkdownTabIcon = svg(
  [
    h('rect', { x: '2.5', y: '5.5', width: '19', height: '13', rx: '2.5', fill: 'none' }),
    path('M6 15V9l2.5 3L11 9v6'),
    path('M16.5 9v6M14.5 13l2 2 2-2')
  ],
  'MarkdownTabIcon'
)

export const AdvancedTabIcon = svg(
  [
    path('M4 7h10M18 7h2M4 17h4M12 17h8'),
    h('circle', { cx: '16', cy: '7', r: '2', fill: 'none' }),
    h('circle', { cx: '10', cy: '17', r: '2', fill: 'none' })
  ],
  'AdvancedTabIcon'
)

// Erlenmeyer flask: neck plus conical body with a fill line, in the same
// 24-grid stroke style as the mockup icons (C-LARGE-DOC-WAVE-A T-004).
export const ExperimentalTabIcon = svg(
  [
    path('M9.5 3.5h5'),
    path('M10.5 3.5v5.2L5.6 16.9a2 2 0 0 0 1.8 3h9.2a2 2 0 0 0 1.8-3L13.5 8.7V3.5'),
    path('M8 14.5h8')
  ],
  'ExperimentalTabIcon'
)

export const TAB_ICONS = {
  export: ExportTabIcon,
  general: GeneralTabIcon,
  appearance: AppearanceTabIcon,
  editor: EditorTabIcon,
  markdown: MarkdownTabIcon,
  advanced: AdvancedTabIcon,
  experimental: ExperimentalTabIcon
}
