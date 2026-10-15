// FILE: src/renderer/src/components/icons/chromeIcons.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: One drawn chrome-icon set (16 px grid, 1.4 px stroke, round caps/joins) shared by the title bar and later chrome work (C-38 N4 d).
//   SCOPE: Icon path descriptors from the approved C-40 canvas Icons board plus the ChromeIcon render component; no theming, no IPC.
//   DEPENDS: vue (h).
//   LINKS: .canvas/Icons.dc.html; .canvas/Window.dc.html; .grace/graph/runtime.xml M-057; .grace/changes/active/C-40 T-002.
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   CHROME_ICONS - frozen descriptor table: name → { viewBox, parts: [{ tag, attrs, fill?, cap?, join? }] } (canvas Icons board "Redrawn" row).
//   CHROME_ICON_STROKE - shared stroke width (1.4) for every stroke part.
//   ChromeIcon - <chrome-icon :name :size> renders one descriptor as an inline SVG using currentColor.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - 2026-10-15 C-40 T-002: initial set (sidebar,
//   outline, auto, light, dark, share, guide, split, lock, copy, menu,
//   chevron-down) transcribed from the approved Icons board so the title
//   bar and N4 d share one source of truth.
// END_CHANGE_SUMMARY

import { h } from 'vue'

// The board's metrics: 1.4 px stroke at the 16 px grid.
export const CHROME_ICON_STROKE = 1.4

// START_BLOCK_ICON_DESCRIPTORS
// Every part inherits fill="none" stroke="currentColor" stroke-width=1.4
// from the <svg>; a part flagged `fill` flips to fill="currentColor"
// stroke="none" (half-disc wedge, guide dot). `cap`/`join` add the
// board's round caps/joins where the drawing needs them. The chevron
// lives on the Window board's 10×10 grid, hence its own viewBox.
export const CHROME_ICONS = Object.freeze({
  sidebar: Object.freeze([
    Object.freeze({ tag: 'rect', attrs: Object.freeze({ x: 1.8, y: 2.6, width: 12.4, height: 10.8, rx: 2.2 }) }),
    Object.freeze({ tag: 'path', attrs: Object.freeze({ d: 'M6 2.6v10.8' }) }),
    Object.freeze({ tag: 'path', attrs: Object.freeze({ d: 'M3.4 5.2h1.2M3.4 7.2h1.2' }), cap: 'round' })
  ]),
  outline: Object.freeze([
    Object.freeze({ tag: 'path', attrs: Object.freeze({ d: 'M2.5 4h11M5 8h8.5M5 12h8.5' }), cap: 'round' }),
    Object.freeze({ tag: 'circle', attrs: Object.freeze({ cx: 2.6, cy: 8, r: 0.6 }), fill: true }),
    Object.freeze({ tag: 'circle', attrs: Object.freeze({ cx: 2.6, cy: 12, r: 0.6 }), fill: true })
  ]),
  auto: Object.freeze([
    Object.freeze({ tag: 'circle', attrs: Object.freeze({ cx: 8, cy: 8, r: 6 }) }),
    Object.freeze({ tag: 'path', attrs: Object.freeze({ d: 'M8 2a6 6 0 0 1 0 12z' }), fill: true })
  ]),
  light: Object.freeze([
    Object.freeze({ tag: 'circle', attrs: Object.freeze({ cx: 8, cy: 8, r: 2.8 }) }),
    Object.freeze({
      tag: 'path',
      attrs: Object.freeze({
        d: 'M8 1.6v1.4M8 13v1.4M1.6 8H3M13 8h1.4M3.5 3.5l1 1M11.5 11.5l1 1M3.5 12.5l1-1M11.5 4.5l1-1'
      }),
      cap: 'round'
    })
  ]),
  dark: Object.freeze([
    Object.freeze({ tag: 'path', attrs: Object.freeze({ d: 'M13.6 9.6A5.8 5.8 0 0 1 6.4 2.4a5.8 5.8 0 1 0 7.2 7.2z' }), join: 'round' })
  ]),
  share: Object.freeze([
    Object.freeze({ tag: 'path', attrs: Object.freeze({ d: 'M8 1.8v8.4M5.2 4.4 8 1.6l2.8 2.8' }), cap: 'round', join: 'round' }),
    Object.freeze({
      tag: 'path',
      attrs: Object.freeze({
        d: 'M5.4 6.6H4.2a1.4 1.4 0 0 0-1.4 1.4v4.8a1.4 1.4 0 0 0 1.4 1.4h7.6a1.4 1.4 0 0 0 1.4-1.4V8a1.4 1.4 0 0 0-1.4-1.4h-1.2'
      }),
      cap: 'round',
      join: 'round'
    })
  ]),
  guide: Object.freeze([
    Object.freeze({ tag: 'circle', attrs: Object.freeze({ cx: 8, cy: 8, r: 6.2 }) }),
    Object.freeze({ tag: 'path', attrs: Object.freeze({ d: 'M6.3 6.2a1.8 1.8 0 0 1 3.5.5c0 1.2-1.8 1.5-1.8 2.6' }), cap: 'round' }),
    Object.freeze({ tag: 'circle', attrs: Object.freeze({ cx: 8, cy: 11.4, r: 0.55 }), fill: true })
  ]),
  split: Object.freeze([
    Object.freeze({ tag: 'rect', attrs: Object.freeze({ x: 1.8, y: 2.6, width: 12.4, height: 10.8, rx: 2.2 }) }),
    Object.freeze({ tag: 'path', attrs: Object.freeze({ d: 'M8 2.6v10.8' }) })
  ]),
  lock: Object.freeze([
    Object.freeze({ tag: 'rect', attrs: Object.freeze({ x: 3.2, y: 7, width: 9.6, height: 6.8, rx: 1.8 }) }),
    Object.freeze({ tag: 'path', attrs: Object.freeze({ d: 'M5.4 7V5.2a2.6 2.6 0 0 1 5.2 0V7' }), cap: 'round' })
  ]),
  copy: Object.freeze([
    Object.freeze({ tag: 'rect', attrs: Object.freeze({ x: 5, y: 5, width: 8.6, height: 8.6, rx: 1.8 }) }),
    Object.freeze({
      tag: 'path',
      attrs: Object.freeze({ d: 'M11 5V3.8A1.6 1.6 0 0 0 9.4 2.2H3.8a1.6 1.6 0 0 0-1.6 1.6v5.6A1.6 1.6 0 0 0 3.8 11H5' }),
      join: 'round'
    })
  ]),
  menu: Object.freeze([
    Object.freeze({ tag: 'path', attrs: Object.freeze({ d: 'M2.5 4.5h11M2.5 8h11M2.5 11.5h11' }), cap: 'round' })
  ]),
  'chevron-down': Object.freeze([
    Object.freeze({ tag: 'path', attrs: Object.freeze({ d: 'M2.5 4l2.5 2.5L7.5 4' }), cap: 'round' })
  ])
})
// END_BLOCK_ICON_DESCRIPTORS

// The chevron is the only off-grid part (Window board, 10×10).
const ICON_VIEW_BOXES = Object.freeze({
  'chevron-down': '0 0 10 10'
})

export const ChromeIcon = {
  name: 'ChromeIcon',
  props: {
    name: { type: String, required: true },
    size: { type: Number, default: 16 }
  },
  render() {
    const parts = CHROME_ICONS[this.name]
    if (!parts) return null
    return h(
      'svg',
      {
        viewBox: ICON_VIEW_BOXES[this.name] || '0 0 16 16',
        width: this.size,
        height: this.size,
        fill: 'none',
        stroke: 'currentColor',
        'stroke-width': CHROME_ICON_STROKE,
        'aria-hidden': 'true'
      },
      parts.map((part, index) =>
        h(part.tag, {
          key: index,
          ...part.attrs,
          ...(part.fill ? { fill: 'currentColor', stroke: 'none' } : {}),
          ...(part.cap ? { 'stroke-linecap': part.cap } : {}),
          ...(part.join ? { 'stroke-linejoin': part.join } : {})
        })
      )
    )
  }
}
