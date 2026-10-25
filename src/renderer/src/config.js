// FILE: src/renderer/src/config.js
// VERSION: 1.2.0
// START_MODULE_CONTRACT
//   PURPOSE: Renderer-wide constants — style tag ids, default fonts and
//            theme, the theme family model (C-41 T-002 + the C-51 T-007
//            Docs/macOS families), and dark-theme classification lists.
//   SCOPE: Static configuration only; no DOM or store access.
//   DEPENDS: window.path (boot shim); util/themeFamilies (re-exported).
//   LINKS: .grace/graph/runtime.xml M-011; .grace/verification/runtime.xml
//          V-M-011 scenario-48 (C-41 T-002) and scenario-60 (C-51 T-007).
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   PATH_SEPARATOR - platform path separator from the boot shim.
//   THEME_STYLE_ID - injected theme style tag id (util/theme.js).
//   COMMON_STYLE_ID - injected common style tag id (util/theme.js).
//   DEFAULT_EDITOR_FONT_FAMILY - prose font fallback stack.
//   DEFAULT_CODE_FONT_FAMILY - code font fallback stack.
//   DEFAULT_STYLE - boot-fallback style block (theme: paper, C-41 T-001).
//   THEME_FAMILIES - frozen list of the 16 light/dark families (C-41 T-002 spec R-3 order + C-51 T-007 Docs/macOS).
//   themePairs - derived member→partner map (symmetric by construction, C-41 T-002).
//   themeFamilyOf - resolve the family owning a theme id (undefined when unknown).
//   railscastsThemes - dark classification list (dark CodeMirror theme, body.dark, color-scheme: dark).
//   oneDarkThemes - dark classification list using the One Dark CodeMirror theme.
//   isDarkTheme - dark classification predicate over the two lists.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.2.0 - 2026-10-16 C-51 T-007: docs-dark and macos-dark
//   join railscastsThemes (dark classification for the new Docs and macOS
//   family members); THEME_FAMILIES gains the two families via
//   util/themeFamilies.js.
//   v1.1.1 - 2026-10-15 C-38 T-004: DEFAULT_STYLE.codeFontSize
//   becomes the number 14 (was the v1 '14px' string — the boot fallback fed
//   the "14px px"/NaNem code path, IA §5 bug 2).
//   v1.1.0 - 2026-10-15 C-41 T-002: the theme set becomes 14
//   light/dark families (THEME_FAMILIES, spec R-3 order); themePairs is now
//   derived from it (every member maps to its partner, symmetric by
//   construction) and the 13 retired ids (light, dark, material-dark,
//   rose-pine-moon, tokyo-night-storm, ayu-mirage, monokai-pro, nightfox,
//   palenight, horizon-dark, synthwave-84, cyberdream, oxocarbon-dark)
//   leave railscastsThemes and every other list — stored values migrate via
//   util/themeMigration.js. The six new members (one-light, alucard,
//   nord-light, kanagawa-lotus, graphite-dark, ulysses-dark) are referenced
//   as ids here; their CSS and registration land with C-41 T-003.
// END_CHANGE_SUMMARY

export const PATH_SEPARATOR = window.path.sep

export const THEME_STYLE_ID = 'ag-theme'
export const COMMON_STYLE_ID = 'ag-common-style'

export const DEFAULT_EDITOR_FONT_FAMILY =
  '"Open Sans", "Clear Sans", "Helvetica Neue", Helvetica, Arial, sans-serif, Segoe UI Emoji, Apple Color Emoji, "Noto Color Emoji"'
export const DEFAULT_CODE_FONT_FAMILY =
  '"DejaVu Sans Mono", "Source Code Pro", "Droid Sans Mono", monospace'
export const DEFAULT_STYLE = Object.freeze({
  codeFontFamily: DEFAULT_CODE_FONT_FAMILY,
  // C-38 T-004 (IA §5 bug 2): a number, not the v1 '14px' string — the
  // stepper and util/theme.js both expect a numeric size (legacy stored
  // strings are coerced at the control boundary).
  codeFontSize: 14,
  hideScrollbar: false,
  // C-41 T-001: Paper is the light default for new profiles (the effective
  // theme under followSystemTheme=true resolves via util/autoTheme.js).
  theme: 'paper'
})

// C-41 T-002: families live in util/themeFamilies.js (pure, no window
// access) and are re-exported here for existing consumers.
export { THEME_FAMILIES, themePairs, themeFamilyOf } from './util/themeFamilies'

export const railscastsThemes = Object.freeze([
  // C-41 T-001: Ink is the dark brand default — dark classification gives
  // it the dark CodeMirror theme, body.dark, and color-scheme: dark.
  // C-41 T-002: the retired dark ids are gone; graphite-dark and
  // ulysses-dark join with C-41 T-003.
  'ink',
  // C-41 T-003: dark members of the Graphite and Ulysses families.
  'graphite-dark',
  'ulysses-dark',
  // C-51 T-007: dark members of the Docs and macOS families.
  'docs-dark',
  'macos-dark',
  // C-GITHUB-THEME: dark member of the Primer family.
  'github-dark',
  'dracula',
  'nord',
  'catppuccin-mocha',
  'gruvbox-dark',
  'tokyo-night',
  'solarized-dark',
  'ayu-dark',
  'everforest-dark',
  'rose-pine',
  'kanagawa'
])
export const oneDarkThemes = Object.freeze(['one-dark'])

export const isDarkTheme = (theme) => {
  return railscastsThemes.includes(theme) || oneDarkThemes.includes(theme)
}
