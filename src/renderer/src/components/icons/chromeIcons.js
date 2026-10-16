// FILE: src/renderer/src/components/icons/chromeIcons.js
// VERSION: 2.3.0
// START_MODULE_CONTRACT
//   PURPOSE: One drawn chrome-icon set (16 px grid, 1.4 px stroke, round caps/joins) for every icon around the document — title bar, tabs, sidebar, find bar, dialogs, notifications, status bar (C-40 T-002, C-38 T-006 N4 d), the document-surface expand glyph (C-51 T-006) and the pinned-file row mark (C-51 T-011; redrawn as a filled pushpin silhouette in C-51 T-013 — the set's one fill-only glyph).
//   SCOPE: Icon path descriptors drawn on the approved canvas grid plus the ChromeIcon render component and a string renderer (chromeIconMarkup) for non-Vue surfaces (the notification service template); no theming, no IPC. The expand descriptor is the canonical drawing — muya duplicates it inline (EXPAND_ICON_PATH) and a unit test pins the two identical.
//   DEPENDS: vue (h).
//   LINKS: .canvas/Icons.dc.html; .canvas/Window.dc.html; .canvas/Mermaid.dc.html; .grace/graph/runtime.xml M-057; .grace/changes/active/C-40 T-002; .grace/changes/active/C-38 T-006; .grace/changes/active/C-51 T-006; .grace/changes/active/C-51 T-011; .grace/changes/active/C-51 T-013.
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   CHROME_ICONS - frozen descriptor table: name → [ { tag, attrs, fill?, cap?, join? } ] — every glyph on the 0 0 16 16 grid (canvas Icons board metrics); the pin mark is the one fill-only silhouette (round head + tapering body + needle).
//   CHROME_ICON_STROKE - shared stroke width (1.4) for every stroke part.
//   CHROME_ICON_NAMES - sorted glyph names (verification helper).
//   ChromeIcon - <chrome-icon :name :size> renders one descriptor as an inline svg.chrome-icon using currentColor.
//   chromeIconMarkup - same descriptor as an HTML string for template-based surfaces (notification service); class/aria mirror ChromeIcon.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v2.3.0 - 2026-10-17 C-51 T-013: the «pin» glyph is
//   redrawn as a FILLED pushpin silhouette (round head circle, tapering
//   body, needle — all fill currentColor, no stroke parts): at its 12 px
//   mark size the stroked T-head drawing read as a thin stick/cross
//   (user smoke 2026-10-17).
//   v2.2.0 - 2026-10-16 C-51 T-011: the «pin» glyph joins the
//   set — a pushpin drawn on the shared grid (T head, stem, flange, needle;
//   round caps) rendered at 12 px as the pinned-file mark on sidebar tree
//   and Opened-files rows.
//   v2.1.0 - 2026-10-16 C-51 T-006: the «expand» glyph (two
//   outward corner brackets + the diagonal, canvas Mermaid) joins the set —
//   the canonical M-057 drawing for the always-visible diagram/table expand
//   button; muya renders the same path inline (its EXPAND_ICON_PATH is
//   pinned byte-identical by tests/renderer/muya/block-expand-button.test.js).
//   v2.0.0 - 2026-10-15 C-38 T-006 N4 d: the whole chrome
//   draws from this one module — the iconfont sprite, the assets/icons
//   svg imports and the ad-hoc inline svgs are gone. Added glyphs
//   (chevron-right, close, dot, plus, search, case-sensitive,
//   whole-word, regex, replace, replace-all, arrow-up, arrow-down,
//   folder, folder-open, file-plus, file-markdown, save-all, close-all,
//   settings, import, info, warning, error, message, check, smile, sad,
//   github, twitter, window-minimize/maximize/restore/close) drawn on
//   the same 16 px grid; chevron-down moved from the Window board's
//   10×10 grid onto the shared grid so every glyph is 0 0 16 16;
//   the rendered svg carries the chrome-icon class; github/twitter are
//   monochrome fill transcriptions (Octicon mark / the historical bird
//   scaled 1024→16) so no brand colour literals ship.
// END_CHANGE_SUMMARY

import { h } from 'vue'

// The board's metrics: 1.4 px stroke at the 16 px grid.
export const CHROME_ICON_STROKE = 1.4

// START_BLOCK_ICON_DESCRIPTORS
// Every part inherits fill="none" stroke="currentColor" stroke-width=1.4
// from the <svg>; a part flagged `fill` flips to fill="currentColor"
// stroke="none" (half-disc wedge, dots, brand marks). `cap`/`join` add
// the board's round caps/joins where the drawing needs them; open path
// strokes always declare round caps (verified by the icon contract
// test). Every glyph is drawn on the single 0 0 16 16 grid.
const part = (tag, attrs, flags = {}) => Object.freeze({ tag, attrs: Object.freeze(attrs), ...flags })

export const CHROME_ICONS = Object.freeze({
  // ── C-40 T-002 title-bar set (canvas Icons board "Redrawn" row) ──
  sidebar: Object.freeze([
    part('rect', { x: 1.8, y: 2.6, width: 12.4, height: 10.8, rx: 2.2 }),
    part('path', { d: 'M6 2.6v10.8' }, { cap: 'round' }),
    part('path', { d: 'M3.4 5.2h1.2M3.4 7.2h1.2' }, { cap: 'round' })
  ]),
  outline: Object.freeze([
    part('path', { d: 'M2.5 4h11M5 8h8.5M5 12h8.5' }, { cap: 'round' }),
    part('circle', { cx: 2.6, cy: 8, r: 0.6 }, { fill: true }),
    part('circle', { cx: 2.6, cy: 12, r: 0.6 }, { fill: true })
  ]),
  auto: Object.freeze([
    part('circle', { cx: 8, cy: 8, r: 6 }),
    part('path', { d: 'M8 2a6 6 0 0 1 0 12z' }, { fill: true })
  ]),
  light: Object.freeze([
    part('circle', { cx: 8, cy: 8, r: 2.8 }),
    part('path', { d: 'M8 1.6v1.4M8 13v1.4M1.6 8H3M13 8h1.4M3.5 3.5l1 1M11.5 11.5l1 1M3.5 12.5l1-1M11.5 4.5l1-1' }, { cap: 'round' })
  ]),
  dark: Object.freeze([
    part('path', { d: 'M13.6 9.6A5.8 5.8 0 0 1 6.4 2.4a5.8 5.8 0 1 0 7.2 7.2z' }, { cap: 'round', join: 'round' })
  ]),
  share: Object.freeze([
    part('path', { d: 'M8 1.8v8.4M5.2 4.4 8 1.6l2.8 2.8' }, { cap: 'round', join: 'round' }),
    part('path', { d: 'M5.4 6.6H4.2a1.4 1.4 0 0 0-1.4 1.4v4.8a1.4 1.4 0 0 0 1.4 1.4h7.6a1.4 1.4 0 0 0 1.4-1.4V8a1.4 1.4 0 0 0-1.4-1.4h-1.2' }, { cap: 'round', join: 'round' })
  ]),
  guide: Object.freeze([
    part('circle', { cx: 8, cy: 8, r: 6.2 }),
    part('path', { d: 'M6.3 6.2a1.8 1.8 0 0 1 3.5.5c0 1.2-1.8 1.5-1.8 2.6' }, { cap: 'round' }),
    part('circle', { cx: 8, cy: 11.4, r: 0.55 }, { fill: true })
  ]),
  split: Object.freeze([
    part('rect', { x: 1.8, y: 2.6, width: 12.4, height: 10.8, rx: 2.2 }),
    part('path', { d: 'M8 2.6v10.8' }, { cap: 'round' })
  ]),
  lock: Object.freeze([
    part('rect', { x: 3.2, y: 7, width: 9.6, height: 6.8, rx: 1.8 }),
    part('path', { d: 'M5.4 7V5.2a2.6 2.6 0 0 1 5.2 0V7' }, { cap: 'round' })
  ]),
  copy: Object.freeze([
    part('rect', { x: 5, y: 5, width: 8.6, height: 8.6, rx: 1.8 }),
    part('path', { d: 'M11 5V3.8A1.6 1.6 0 0 0 9.4 2.2H3.8a1.6 1.6 0 0 0-1.6 1.6v5.6A1.6 1.6 0 0 0 3.8 11H5' }, { cap: 'round', join: 'round' })
  ]),
  menu: Object.freeze([
    part('path', { d: 'M2.5 4.5h11M2.5 8h11M2.5 11.5h11' }, { cap: 'round' })
  ]),
  'chevron-down': Object.freeze([
    // Window board chevron re-gridded from 10×10 to the shared 16 grid.
    part('path', { d: 'M4 6.2 8 10.2l4-4' }, { cap: 'round', join: 'round' })
  ]),
  settings: Object.freeze([
    // Feather-style gear scaled from the 24 grid onto the 16 grid.
    part('circle', { cx: 8, cy: 8, r: 2 }),
    part('path', {
      d: 'M12.93 10a1.1 1.1 0 0 0 .22 1.21l.04.04a1.33 1.33 0 1 1-1.89 1.89l-.04-.04a1.1 1.1 0 0 0-1.21-.22 1.1 1.1 0 0 0-.67 1.01V14a1.33 1.33 0 1 1-2.67 0v-.06A1.1 1.1 0 0 0 6 12.93a1.1 1.1 0 0 0-1.21.22l-.04.04a1.33 1.33 0 1 1-1.89-1.89l.04-.04a1.1 1.1 0 0 0 .22-1.21 1.1 1.1 0 0 0-1.01-.67H2a1.33 1.33 0 1 1 0-2.67h.06A1.1 1.1 0 0 0 3.07 6a1.1 1.1 0 0 0-.22-1.21l-.04-.04a1.33 1.33 0 1 1 1.89-1.89l.04.04a1.1 1.1 0 0 0 1.21.22H6a1.1 1.1 0 0 0 .67-1.01V2a1.33 1.33 0 1 1 2.67 0v.06a1.1 1.1 0 0 0 .67 1.01 1.1 1.1 0 0 0 1.21-.22l.04-.04a1.33 1.33 0 1 1 1.89 1.89l-.04.04a1.1 1.1 0 0 0-.22 1.21V6a1.1 1.1 0 0 0 1.01.67H14a1.33 1.33 0 1 1 0 2.67h-.06a1.1 1.1 0 0 0-1.01.67z'
    }, { cap: 'round', join: 'round' })
  ]),

  // ── C-38 T-006 additions (sidebar, find bar, dialogs, notifications) ──
  'chevron-right': Object.freeze([
    part('path', { d: 'M6 4l3.4 4L6 12' }, { cap: 'round', join: 'round' })
  ]),
  close: Object.freeze([
    part('path', { d: 'M4.2 4.2l7.6 7.6M11.8 4.2l-7.6 7.6' }, { cap: 'round' })
  ]),
  dot: Object.freeze([
    part('circle', { cx: 8, cy: 8, r: 3 }, { fill: true })
  ]),
  plus: Object.freeze([
    part('path', { d: 'M8 3.2v9.6M3.2 8h9.6' }, { cap: 'round' })
  ]),
  search: Object.freeze([
    part('circle', { cx: 6.8, cy: 6.8, r: 4.2 }),
    part('path', { d: 'M10 10l3.2 3.2' }, { cap: 'round' })
  ]),
  // Find-bar options, redrawn at review to fill the 16 grid (the first
  // drawing sat in ~8 px and read as noise at 14–16 px in WebKit).
  'case-sensitive': Object.freeze([
    part('path', { d: 'M1.4 12.6 4.7 3.4 8 12.6' }, { cap: 'round', join: 'round' }),
    part('path', { d: 'M2.6 9.4h4.2' }, { cap: 'round' }),
    part('circle', { cx: 11.6, cy: 10.1, r: 2.5 }),
    part('path', { d: 'M14.1 7.4v5.2' }, { cap: 'round' })
  ]),
  'whole-word': Object.freeze([
    part('path', { d: 'M1.4 10.6v2.4h13.2v-2.4' }, { cap: 'round', join: 'round' }),
    part('circle', { cx: 4.9, cy: 7.4, r: 2.1 }),
    part('path', { d: 'M7 5.3v4.2' }, { cap: 'round' }),
    part('path', { d: 'M9.2 2.6v6.9' }, { cap: 'round' }),
    part('circle', { cx: 11.3, cy: 7.4, r: 2.1 })
  ]),
  regex: Object.freeze([
    part('path', { d: 'M10.6 2v8M7.1 4l7 4M14.1 4l-7 4' }, { cap: 'round' }),
    part('circle', { cx: 3.8, cy: 12.4, r: 1.7 }, { fill: true })
  ]),
  replace: Object.freeze([
    part('path', { d: 'M2.6 5.4h8.2m0 0L8.6 3.2m2.2 2.2-2.2 2.2' }, { cap: 'round', join: 'round' }),
    part('path', { d: 'M13.4 10.6H5.2m0 0 2.2 2.2m-2.2-2.2 2.2-2.2' }, { cap: 'round', join: 'round' })
  ]),
  'replace-all': Object.freeze([
    part('path', {
      d: 'M8 8C7 6.7 6.3 5.8 5.2 5.8a2.2 2.2 0 1 0 0 4.4C6.3 10.2 7 9.3 8 8c1-1.3 1.7-2.2 2.8-2.2a2.2 2.2 0 1 1 0 4.4C9.7 10.2 9 9.3 8 8z'
    }, { cap: 'round', join: 'round' })
  ]),
  'arrow-up': Object.freeze([
    part('path', { d: 'M8 13V3.2M4.4 6.8 8 3.2l3.6 3.6' }, { cap: 'round', join: 'round' })
  ]),
  'arrow-down': Object.freeze([
    part('path', { d: 'M8 3v9.8M4.4 9.2 8 12.8l3.6-3.6' }, { cap: 'round', join: 'round' })
  ]),
  folder: Object.freeze([
    part('path', {
      d: 'M1.8 12.6V4.4c0-.77.63-1.4 1.4-1.4h3.1l1.6 1.8h4.9c.77 0 1.4.63 1.4 1.4v6.4c0 .77-.63 1.4-1.4 1.4H3.2a1.4 1.4 0 0 1-1.4-1.4z'
    }, { cap: 'round', join: 'round' })
  ]),
  'folder-open': Object.freeze([
    part('path', { d: 'M1.8 6.4V4.4c0-.77.63-1.4 1.4-1.4h3.1l1.6 1.8h4.9c.77 0 1.4.63 1.4 1.4v.6' }, { cap: 'round', join: 'round' }),
    part('path', {
      d: 'M1.8 6.4h11.9c.9 0 1.55.87 1.3 1.74l-1 3.5a1.4 1.4 0 0 1-1.34 1.02H3.2a1.4 1.4 0 0 1-1.4-1.4z'
    }, { cap: 'round', join: 'round' })
  ]),
  'file-plus': Object.freeze([
    part('path', { d: 'M3.4 2.2h5.2L12 5.6v8.2H3.4z' }, { cap: 'round', join: 'round' }),
    part('path', { d: 'M8.6 2.2v3.4H12' }, { cap: 'round', join: 'round' }),
    part('path', { d: 'M10.6 9.6h4.2M12.7 7.5v4.2' }, { cap: 'round' })
  ]),
  'file-markdown': Object.freeze([
    part('rect', { x: 2.4, y: 3, width: 11.2, height: 10, rx: 1.4 }),
    part('path', { d: 'M4.9 10.6V5.4l2 2.4 2-2.4v5.2' }, { cap: 'round', join: 'round' }),
    part('path', { d: 'M11 5.8v3.6M9.7 8.1l1.3 1.3 1.3-1.3' }, { cap: 'round', join: 'round' })
  ]),
  'save-all': Object.freeze([
    part('path', { d: 'M6.4 2.6h7v7' }, { cap: 'round', join: 'round' }),
    part('rect', { x: 2.6, y: 6.4, width: 7, height: 7, rx: 1.2 }),
    part('path', { d: 'M4.8 13.4v-3h2.8v3' }, { cap: 'round', join: 'round' })
  ]),
  'close-all': Object.freeze([
    part('path', { d: 'M6.4 2.6h7v7' }, { cap: 'round', join: 'round' }),
    part('rect', { x: 2.6, y: 6.4, width: 7, height: 7, rx: 1.2 }),
    part('path', { d: 'M4.7 8.5l2.8 2.8M7.5 8.5l-2.8 2.8' }, { cap: 'round' })
  ]),
  import: Object.freeze([
    part('path', { d: 'M2.6 10v2.2c0 .77.63 1.4 1.4 1.4h8c.77 0 1.4-.63 1.4-1.4V10' }, { cap: 'round', join: 'round' }),
    part('path', { d: 'M8 2.6V10m0 0L5.8 7.8M8 10l2.2-2.2' }, { cap: 'round', join: 'round' })
  ]),
  info: Object.freeze([
    part('circle', { cx: 8, cy: 8, r: 6 }),
    part('circle', { cx: 8, cy: 5.3, r: 0.55 }, { fill: true }),
    part('path', { d: 'M8 7.2v4' }, { cap: 'round' })
  ]),
  warning: Object.freeze([
    part('path', { d: 'M8 2.6 14 13.2H2z' }, { join: 'round', cap: 'round' }),
    part('path', { d: 'M8 6.6v2.8' }, { cap: 'round' }),
    part('circle', { cx: 8, cy: 11.3, r: 0.55 }, { fill: true })
  ]),
  error: Object.freeze([
    part('circle', { cx: 8, cy: 8, r: 6 }),
    part('path', { d: 'M5.2 8h5.6' }, { cap: 'round' })
  ]),
  message: Object.freeze([
    part('path', {
      d: 'M2.4 4c0-.77.63-1.4 1.4-1.4h8.4c.77 0 1.4.63 1.4 1.4v5.6c0 .77-.63 1.4-1.4 1.4H8.8l-3 2.6v-2.6H3.8c-.77 0-1.4-.63-1.4-1.4z'
    }, { join: 'round', cap: 'round' }),
    part('circle', { cx: 5.4, cy: 6.8, r: 0.55 }, { fill: true }),
    part('circle', { cx: 8, cy: 6.8, r: 0.55 }, { fill: true }),
    part('circle', { cx: 10.6, cy: 6.8, r: 0.55 }, { fill: true })
  ]),
  check: Object.freeze([
    part('path', { d: 'M3.2 8.6l3.4 3.4 6.2-7' }, { cap: 'round', join: 'round' })
  ]),
  smile: Object.freeze([
    part('circle', { cx: 8, cy: 8, r: 6 }),
    part('circle', { cx: 5.9, cy: 6.4, r: 0.55 }, { fill: true }),
    part('circle', { cx: 10.1, cy: 6.4, r: 0.55 }, { fill: true }),
    part('path', { d: 'M5.2 9.6a3.6 3.6 0 0 0 5.6 0' }, { cap: 'round' })
  ]),
  sad: Object.freeze([
    part('circle', { cx: 8, cy: 8, r: 6 }),
    part('circle', { cx: 5.9, cy: 6.4, r: 0.55 }, { fill: true }),
    part('circle', { cx: 10.1, cy: 6.4, r: 0.55 }, { fill: true }),
    part('path', { d: 'M5.2 11a3.6 3.6 0 0 1 5.6 0' }, { cap: 'round' })
  ]),
  // Brand marks are monochrome currentColor fills transcribed onto the
  // 16 grid (Octicon mark-github; the historical bird scaled from the
  // retired 1024-grid sprite) — no brand colour literals.
  github: Object.freeze([
    part('path', {
      d: 'M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z'
    }, { fill: true })
  ]),
  twitter: Object.freeze([
    part('path', {
      d: 'M15.04 3.64q-.6.88-1.45 1.49.01.12.01.37 0 1.16-.34 2.32t-1.03 2.22-1.65 1.88-2.3 1.3-2.88.49q-2.42 0-4.43-1.29.31.04.7.04 2.01 0 3.58-1.23-.94-.02-1.68-.58t-1.02-1.42q.29.04.55.04.38 0 .76-.1-1-.21-1.66-1t-.66-1.83v-.04q.61.34 1.3.37-.59-.39-.94-1.03t-.35-1.37q0-.79.39-1.45 1.08 1.33 2.63 2.13t3.32.89q-.07-.34-.07-.66 0-1.2.84-2.04t2.04-.84q1.25 0 2.11.91.97-.19 1.83-.7-.33 1.03-1.27 1.59.83-.09 1.66-.45z'
    }, { fill: true })
  ]),

  // ── Win/Linux caption buttons (rendered at 10 px, same 16 grid) ──
  'window-minimize': Object.freeze([
    part('path', { d: 'M3.4 8h9.2' }, { cap: 'round' })
  ]),
  'window-maximize': Object.freeze([
    part('rect', { x: 4, y: 4, width: 8, height: 8, rx: 0.6 })
  ]),
  'window-restore': Object.freeze([
    part('path', { d: 'M6 3.4h6.6v6.6' }, { cap: 'round', join: 'round' }),
    part('rect', { x: 3.4, y: 6, width: 6.6, height: 6.6, rx: 0.6 })
  ]),
  'window-close': Object.freeze([
    part('path', { d: 'M4 4l8 8M12 4l-8 8' }, { cap: 'round' })
  ]),

  // ── C-51 T-006: the document-surface expand button (canvas Mermaid) ──
  // Two outward corner brackets and the diagonal — the glyph muya renders
  // inline on every diagram/table figure; this descriptor is the twin
  // pinned byte-identical to muya's EXPAND_ICON_PATH by
  // tests/renderer/muya/block-expand-button.test.js.
  expand: Object.freeze([
    part('path', { d: 'M9.6 2.4h4v4M13.4 2.6 9.2 6.8M6.4 13.6h-4v-4M2.6 13.4l4.2-4.2' }, { cap: 'round', join: 'round' })
  ]),

  // ── C-51 T-011/T-013: the pinned-file row mark (tree + Opened files) ──
  // Filled pushpin silhouette on the shared grid — the set's one
  // fill-only glyph: round head, tapering body, needle. The first
  // stroked drawing (T head + stem lines) read as a thin stick/cross at
  // the 12 px mark size (user smoke 2026-10-17). Rendered at 12 px
  // inside .pin-mark.
  pin: Object.freeze([
    part('circle', { cx: 8, cy: 4.6, r: 3.2 }, { fill: true }),
    part('path', { d: 'M6.3 7.2h3.4l-.5 2.6h-2.4z' }, { fill: true }),
    part('path', { d: 'M6.8 9.8h2.4L8 14.6z' }, { fill: true })
  ])
})
// END_BLOCK_ICON_DESCRIPTORS

export const CHROME_ICON_NAMES = Object.freeze(Object.keys(CHROME_ICONS).sort())

const partAttrs = (partDescriptor) => ({
  ...partDescriptor.attrs,
  ...(partDescriptor.fill ? { fill: 'currentColor', stroke: 'none' } : {}),
  ...(partDescriptor.cap ? { 'stroke-linecap': partDescriptor.cap } : {}),
  ...(partDescriptor.join ? { 'stroke-linejoin': partDescriptor.join } : {})
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
        class: 'chrome-icon',
        viewBox: '0 0 16 16',
        width: this.size,
        height: this.size,
        fill: 'none',
        stroke: 'currentColor',
        'stroke-width': CHROME_ICON_STROKE,
        'aria-hidden': 'true'
      },
      parts.map((partDescriptor, index) => h(partDescriptor.tag, { key: index, ...partAttrs(partDescriptor) }))
    )
  }
}

// START_BLOCK_CHROME_ICON_MARKUP
// String twin of ChromeIcon for template-rendered surfaces (the
// notification service builds its DOM from an HTML template string, no
// Vue). Same descriptors, same chrome-icon class/aria, so the e2e
// "every chrome svg is a ChromeIcon" assertion holds there too.
export const chromeIconMarkup = (name, size = 16, extraClass = '') => {
  const parts = CHROME_ICONS[name]
  if (!parts) return ''
  const body = parts
    .map((partDescriptor) => {
      const attrs = Object.entries(partAttrs(partDescriptor))
        .map(([key, value]) => ` ${key}="${value}"`)
        .join('')
      return `<${partDescriptor.tag}${attrs}></${partDescriptor.tag}>`
    })
    .join('')
  const cls = extraClass ? ` ${extraClass}` : ''
  return `<svg class="chrome-icon${cls}" viewBox="0 0 16 16" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="${CHROME_ICON_STROKE}" aria-hidden="true">${body}</svg>`
}
// END_BLOCK_CHROME_ICON_MARKUP
