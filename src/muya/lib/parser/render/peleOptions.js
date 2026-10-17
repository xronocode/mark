// FILE: src/muya/lib/parser/render/peleOptions.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Per-type pele render options (C-55 R-4) — the C-51 lab sizes re-expressed in pele's option surface (fontSize/padding), the global measurement font (the same chrome stack the --pele-font variable displays, so layout measurement matches the rendered text), and the C-34 fit-column policy (no maxWidth: pele emits width=natural + max-width:100%, which the pipeline's --mark-zoom max-width builds on).
//   SCOPE: buildPeleRenderOptions(type, tokens) and the SCROLLABLE_LAB_TYPES table; no DOM access, no caching.
//   DEPENDS: ./diagramTheme (DEFAULT_DIAGRAM_FONT for the fontless fallback).
//   LINKS: .grace/changes/active/C-55 R-4; .grace/changes/archive/C-51 (lab sizes); .grace/graph/runtime.xml M-012.
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   DEFAULT_PELE_FONT_SIZE - the global label size (15px — the accepted C-51 lab size).
//   buildPeleRenderOptions - diagram type + theme tokens → pele RenderOptions (fontFamily/fontSize from the theme, per-type lab overrides).
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - 2026-10-17 C-55: first version. The mermaid
//   per-type initialize config (useWidth/axisFormat/taskFontSize/bitWidth…)
//   collapses to pele's much smaller option surface: a global fontSize of
//   15 (the lab look), the chrome font stack for measurement, and the
//   smaller label sizes for the four lab-tuned types. Fit-column behaviour
//   comes from pele's default output (width=natural, max-width:100%) plus
//   the pipeline's zoomable max-width — no useMaxWidth flag exists anymore.
// END_CHANGE_SUMMARY

import { DEFAULT_DIAGRAM_FONT } from './diagramTheme'

// The accepted C-51 lab size — labels at 15px read comfortably at
// fit-to-column scale; pele's own default is 16px.
export const DEFAULT_PELE_FONT_SIZE = 15

// START_BLOCK_PELE_LAB_TYPES
// The four C-51 "group-3" types keep their natural size (wide charts
// scroll inside the block via the ag-pele-preview CSS) and the lab's
// smaller label sizes. Every other type renders with the global size and
// default spacing — including all the new pele-only bonus types, which
// have no mermaid-era tuning to preserve.
const SCROLLABLE_LAB_TYPES = Object.freeze({
  gantt: { fontSize: 13 },
  journey: { fontSize: 14 },
  timeline: { fontSize: 13, padding: 8 },
  packet: { fontSize: 13 }
})
// END_BLOCK_PELE_LAB_TYPES

/**
 * Build the pele RenderOptions for one diagram.
 *
 * The font family must be passed as an OPTION (not only via --pele-font):
 * pele measures label text with these values to lay out nodes, so the
 * measurement font and the displayed font (the variable) must agree. The
 * chrome font is application-constant, which keeps the code-only SVG cache
 * key sound.
 *
 * @param {string|null} type pele DiagramType (or null when undetectable)
 * @param {object} tokens theme tokens (readActiveThemeTokens shape)
 * @returns {object} pele RenderOptions (fontFamily, fontSize, per-type overrides)
 */
export const buildPeleRenderOptions = (type, tokens = null) => {
  const font = (tokens && tokens.font) || DEFAULT_DIAGRAM_FONT
  return {
    fontFamily: font,
    fontSize: DEFAULT_PELE_FONT_SIZE,
    ...(SCROLLABLE_LAB_TYPES[type] || {})
  }
}
