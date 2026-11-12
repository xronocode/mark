// FILE: src/renderer/src/util/exportPageDefaults.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Remember explicitly configured future-export page defaults without changing legacy appearance storage.
//   SCOPE: Five-field typed hydration, fresh cross-window reads and a same-realm fallback with explicit write success.
//   DEPENDS: Browser localStorage and JSON.
//   LINKS: .grace/graph/features.xml M-072; .grace/verification/features.xml V-M-072; C-EXPORT-SETTINGS-SECTION.
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
// START_MODULE_MAP
//   DEFAULT_EXPORT_PAGE_OPTIONS - Return a fresh factory page-default snapshot.
//   getRememberedExportPageOptions - Read current persisted values with independent typed fallbacks.
//   rememberExportPageOptions - Store a canonical snapshot and report whether it persisted.
// END_MODULE_MAP
// START_CHANGE_SUMMARY
//   LAST_CHANGE: 2026-11-11 C-EXPORT-SETTINGS-SECTION: separate future-export geometry/title from legacy appearance options.
// END_CHANGE_SUMMARY

const STORAGE_KEY = 'mark-export-page-options'
const PAGE_SIZES = new Set(['A3', 'A4', 'A5', 'Legal', 'Letter', 'Tabloid', 'custom'])

export const DEFAULT_EXPORT_PAGE_OPTIONS = () => ({
  pageSize: 'A4',
  pageSizeWidth: 210,
  pageSizeHeight: 297,
  isLandscape: false,
  htmlTitle: ''
})

const normalize = (input) => {
  const result = DEFAULT_EXPORT_PAGE_OPTIONS()
  if (!input || typeof input !== 'object' || Array.isArray(input)) return result
  const owns = key => Object.prototype.hasOwnProperty.call(input, key)
  if (owns('pageSize') && PAGE_SIZES.has(input.pageSize)) result.pageSize = input.pageSize
  for (const key of ['pageSizeWidth', 'pageSizeHeight']) {
    if (owns(key) && Number.isFinite(input[key]) && input[key] >= 10 && input[key] <= 2000) result[key] = input[key]
  }
  if (owns('isLandscape') && typeof input.isLandscape === 'boolean') result.isLandscape = input.isLandscape
  if (owns('htmlTitle') && typeof input.htmlTitle === 'string') result.htmlTitle = input.htmlTitle
  return result
}

let remembered = DEFAULT_EXPORT_PAGE_OPTIONS()
let hasUnpersistedWrite = false

// START_BLOCK_READ_EXPORT_PAGE_DEFAULTS
export const getRememberedExportPageOptions = () => {
  // A rejected write must not be replaced by an older persisted value in this
  // same realm. The caller was told that the new choice is not durable.
  if (hasUnpersistedWrite) return { ...remembered }
  let raw
  try {
    raw = window.localStorage.getItem(STORAGE_KEY)
  } catch {
    return { ...remembered }
  }
  try {
    remembered = normalize(raw === null ? null : JSON.parse(raw))
  } catch {
    remembered = DEFAULT_EXPORT_PAGE_OPTIONS()
  }
  return { ...remembered }
}
// END_BLOCK_READ_EXPORT_PAGE_DEFAULTS

// START_BLOCK_WRITE_EXPORT_PAGE_DEFAULTS
export const rememberExportPageOptions = (options) => {
  remembered = normalize(options)
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(remembered))
    hasUnpersistedWrite = false
    return true
  } catch {
    hasUnpersistedWrite = true
    return false
  }
}
// END_BLOCK_WRITE_EXPORT_PAGE_DEFAULTS
