// FILE: src/renderer/src/util/themeSwatchColors.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Resolve the three swatch colours (background, text, accent) for every theme id straight from the shipped theme CSS, so the Settings family tiles can never drift from the real themes (C-38 T-004).
//   SCOPE: Pure string parsing over the themeCssFactories output; one-level var() resolution and safe fallbacks. No DOM, no window access.
//   DEPENDS: util/themeColor (themeCssFactories).
//   LINKS: .grace/changes/archive/C-38 T-004; prefComponents/tabs/appearance; .grace/graph/runtime.xml M-011.
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   (local) readThemeVar - first literal value of a --var in a CSS string, resolving exactly one var() indirection.
//   themeSwatchColors - memoized theme id → { bg, fg, accent } parsed from the theme CSS (fallbacks: paper-ish neutrals / the settings accent).
//   familySwatchColors - family → { light: {...}, dark: {...} } for the Appearance tile halves.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: [v1.0.0 - 2026-10-15 C-38 T-004: initial module — replaces the hard-coded per-theme swatch palette the old theme page carried (a second colour table that drifted from the shipped themes).]
// END_CHANGE_SUMMARY

import { themeCssFactories } from './themeColor'

const FALLBACK_LIGHT = { bg: '#ffffff', fg: '#1d1d1f', accent: '#007aff' }
const FALLBACK_DARK = { bg: '#1d1d1f', fg: '#ececec', accent: '#0a84ff' }

// START_BLOCK_READ_THEME_VAR
// Themes declare their variables as literal colours; a few chain through
// one var() reference (e.g. --focusColor: var(--themeColor)). Resolve at
// most one level — deeper chains do not exist in the shipped set.
const readThemeVar = (css, name) => {
  const match = css.match(new RegExp(`--${name}:\\s*([^;]+)`))
  if (!match) return ''
  let value = match[1].trim()
  if (value.startsWith('var(')) {
    const ref = value.slice(4, -1).trim().replace(/^--/, '')
    const refMatch = css.match(new RegExp(`--${ref}:\\s*([^;]+)`))
    value = refMatch ? refMatch[1].trim() : ''
  }
  // Only pass through values a CSS colour property can consume.
  return /^(#|rgba?\(|hsla?\(|[a-z])/i.test(value) ? value : ''
}
// END_BLOCK_READ_THEME_VAR

const swatchOf = (themeId, fallback) => {
  const factory = themeCssFactories[themeId]
  if (!factory) return fallback
  const css = factory()
  return {
    bg: readThemeVar(css, 'editorBgColor') || fallback.bg,
    fg: readThemeVar(css, 'editorColor') || fallback.fg,
    accent: readThemeVar(css, 'themeColor') || readThemeVar(css, 'linkColor') || fallback.accent
  }
}

// Memoized: the CSS strings are static, so each theme parses once.
const cache = new Map()

// START_BLOCK_THEME_SWATCH_COLORS
// theme id → { bg, fg, accent } straight from the theme CSS variables
// (--editorBgColor / --editorColor / --themeColor, falling back to the
// link colour and then to neutral defaults for unknown ids).
export const themeSwatchColors = (themeId, fallback = FALLBACK_LIGHT) => {
  if (!cache.has(themeId)) {
    cache.set(themeId, swatchOf(themeId, fallback))
  }
  return cache.get(themeId)
}
// END_BLOCK_THEME_SWATCH_COLORS

// START_BLOCK_FAMILY_SWATCH_COLORS
// A family tile shows the light member on the left half and the dark
// member on the right half — colours resolved per member with per-mode
// fallbacks.
export const familySwatchColors = (family) => ({
  light: themeSwatchColors(family.light, FALLBACK_LIGHT),
  dark: themeSwatchColors(family.dark, FALLBACK_DARK)
})
// END_BLOCK_FAMILY_SWATCH_COLORS
