// FILE: src/renderer/src/prefComponents/tabsBar/config.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Catalog for the C-38 T-003 Settings shell — the 5 toolbar tabs, the legacy-route redirect map, the schema-category → tab routing map for settings search, and the remembered-tab persistence.
//   SCOPE: Static tab metadata + pure helpers (tabPath, tabTitle, readLastTab, writeLastTab); no Vue rendering, no store access.
//   DEPENDS: none (icons are attached by tabsBar/index.vue via icons.js).
//   LINKS: .grace/changes/archive/C-38; .grace/graph/runtime.xml M-011; .grace/verification/runtime.xml V-M-011.
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   TABS - the 5 shell tabs in display order ({ id, labelKey, path }).
//   TAB_IDS - id array, single source of truth for valid tab ids.
//   LEGACY_ROUTE_REDIRECTS - old 9-route → new 5-tab path map (deep links and menu items keep working).
//   CATEGORY_TO_TAB - schema.json search categories → tab id (Theme → appearance, Spelling → editor, Image/Custom CSS → advanced …).
//   LAST_TAB_STORAGE_KEY - localStorage key for the remembered tab.
//   tabPath - id → '/preference/<id>' (identity-safe: unknown ids fall back to general).
//   tabTitle - window title for a tab label (macOS: bare label; Windows/Linux: '<label> — Mark').
//   readLastTab - persisted tab id or 'general' (try/catch around localStorage; invalid values fall back).
//   writeLastTab - persists a tab id (try/catch; silently ignores storage failures).
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.1.0 - 2026-10-15 C-38 T-004: CATEGORY_TO_TAB gains the
//   appearance/advanced categories the rewritten schema.json now uses
//   (search hits route to the IA §3 home of their row); legacy spellings
//   keep their mappings.
//   v1.0.0 - 2026-10-15 C-38 T-003 — new Settings shell tab catalog replacing the 9-entry sideBar rail (getCategory); legacy routes redirect, search categories route to the 5 tabs, last tab persists to localStorage.
// END_CHANGE_SUMMARY

// The 5 tabs of the redesigned Settings window (C-38 N2 IA). Labels come
// from the i18n key so every locale shows a native tab name.
export const TABS = [
  { id: 'general', labelKey: 'preferences.tabs.general', path: '/preference/general' },
  { id: 'appearance', labelKey: 'preferences.tabs.appearance', path: '/preference/appearance' },
  { id: 'editor', labelKey: 'preferences.tabs.editor', path: '/preference/editor' },
  { id: 'markdown', labelKey: 'preferences.tabs.markdown', path: '/preference/markdown' },
  { id: 'advanced', labelKey: 'preferences.tabs.advanced', path: '/preference/advanced' }
]

export const TAB_IDS = TABS.map((t) => t.id)

// START_BLOCK_LEGACY_ROUTE_REDIRECTS
// The 9 pre-redesign routes. general/editor/markdown keep their paths
// (the new tabs own them); the other six redirect so old deep links,
// bookmarks and menu dispatches land on the owning tab per the N2 IA
// (docs/design/settings-ia-2026-10-15.md §3).
export const LEGACY_ROUTE_REDIRECTS = {
  spelling: '/preference/editor',
  theme: '/preference/appearance',
  image: '/preference/advanced',
  keybindings: '/preference/advanced',
  language: '/preference/general',
  extensions: '/preference/advanced'
}
// END_BLOCK_LEGACY_ROUTE_REDIRECTS

// START_BLOCK_CATEGORY_TO_TAB
// schema.json categories (the part before '--' in a description) → tab.
// C-38 T-004: the schema categories follow the new IA (General /
// Appearance / Editor / Markdown / Advanced); the legacy spellings
// (spelling/theme/image/custom css) stay mapped for older schema copies
// and everything without an explicit home falls back to general.
export const CATEGORY_TO_TAB = {
  general: 'general',
  appearance: 'appearance',
  editor: 'editor',
  markdown: 'markdown',
  advanced: 'advanced',
  spelling: 'editor',
  theme: 'appearance',
  image: 'advanced',
  'custom css': 'advanced'
}
// END_BLOCK_CATEGORY_TO_TAB

// Remembered tab persistence. localStorage (not a preference key): the
// last tab is window state, not a user setting others should sync to.
export const LAST_TAB_STORAGE_KEY = 'settings.lastTab'

export const tabPath = (id) => `/preference/${TAB_IDS.includes(id) ? id : 'general'}`

// START_BLOCK_TAB_TITLE
// The native window title follows the active tab (mockup: macOS shows the
// bare tab name, Windows/Linux append the app name).
export const tabTitle = (label, isMac) => {
  const text = typeof label === 'string' && label.length ? label : 'Settings'
  return isMac ? text : `${text} — Mark`
}
// END_BLOCK_TAB_TITLE

export const readLastTab = () => {
  try {
    const stored = window.localStorage.getItem(LAST_TAB_STORAGE_KEY)
    return TAB_IDS.includes(stored) ? stored : 'general'
  } catch (e) {
    return 'general'
  }
}

export const writeLastTab = (id) => {
  if (!TAB_IDS.includes(id)) return
  try {
    window.localStorage.setItem(LAST_TAB_STORAGE_KEY, id)
  } catch (e) {
    // Private-mode/quota failures must never break tab switching.
  }
}
