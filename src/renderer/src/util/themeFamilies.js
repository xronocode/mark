// FILE: src/renderer/src/util/themeFamilies.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: The 14 light/dark theme families (C-41 spec R-3) as pure data with no window access, so boot shims and the preference migration can import them before window globals exist.
//   SCOPE: THEME_FAMILIES list, the derived member-to-partner map, family lookup by theme id.
//   DEPENDS: none
//   LINKS: M-011, C-41 T-002
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   THEME_FAMILIES - frozen list of the 14 light/dark families in spec R-3 order.
//   themePairs - derived member→partner map (symmetric by construction).
//   themeFamilyOf - resolve the family owning a theme id (undefined when unknown).
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: [v1.0.0 - C-41 T-002 review: extracted from config.js, whose module scope reads window.path; importing config.js from the boot shim / store migration crashed before window globals were installed.]
// END_CHANGE_SUMMARY

// START_BLOCK_THEME_FAMILIES
// C-41 T-002: the shipped theme set is 14 families, each a light/dark pair
// (spec R-3 order). The picker shows families; Auto/Light/Dark picks the
// member. The six members marked "registered by C-41 T-003" exist as ids
// here so the family model, migrations, and pairs are complete — their
// theme CSS, themeColor factories, and registrations land with that task.
export const THEME_FAMILIES = Object.freeze([
  Object.freeze({ id: 'paper', name: 'Paper', light: 'paper', dark: 'ink' }),
  Object.freeze({ id: 'rose-pine', name: 'Rosé Pine', light: 'rose-pine-dawn', dark: 'rose-pine' }),
  Object.freeze({ id: 'catppuccin', name: 'Catppuccin', light: 'catppuccin-latte', dark: 'catppuccin-mocha' }),
  Object.freeze({ id: 'solarized', name: 'Solarized', light: 'solarized-light', dark: 'solarized-dark' }),
  Object.freeze({ id: 'gruvbox', name: 'Gruvbox', light: 'gruvbox-light', dark: 'gruvbox-dark' }),
  Object.freeze({ id: 'everforest', name: 'Everforest', light: 'everforest-light', dark: 'everforest-dark' }),
  Object.freeze({ id: 'tokyo-night', name: 'Tokyo Night', light: 'tokyo-night-light', dark: 'tokyo-night' }),
  Object.freeze({ id: 'ayu', name: 'Ayu', light: 'ayu-light', dark: 'ayu-dark' }),
  Object.freeze({ id: 'one', name: 'One', light: 'one-light', dark: 'one-dark' }),
  Object.freeze({ id: 'dracula', name: 'Dracula', light: 'alucard', dark: 'dracula' }),
  Object.freeze({ id: 'nord', name: 'Nord', light: 'nord-light', dark: 'nord' }),
  Object.freeze({ id: 'kanagawa', name: 'Kanagawa', light: 'kanagawa-lotus', dark: 'kanagawa' }),
  Object.freeze({ id: 'graphite', name: 'Graphite', light: 'graphite', dark: 'graphite-dark' }),
  Object.freeze({ id: 'ulysses', name: 'Ulysses', light: 'ulysses', dark: 'ulysses-dark' })
])

// Derived — every family member maps to its partner. Never hand-edit:
// the derivation keeps the map symmetric for all existing consumers.
export const themePairs = Object.freeze(
  THEME_FAMILIES.reduce((pairs, family) => {
    pairs[family.light] = family.dark
    pairs[family.dark] = family.light
    return pairs
  }, {})
)

// The family owning a theme id (either member), or undefined.
export const themeFamilyOf = (themeId) =>
  THEME_FAMILIES.find((family) => family.light === themeId || family.dark === themeId)
// END_BLOCK_THEME_FAMILIES
