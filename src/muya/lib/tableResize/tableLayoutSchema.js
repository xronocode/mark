// FILE: src/muya/lib/tableResize/tableLayoutSchema.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: C-TABLE-PROFILE-SCHEMA the single pure owner of the persisted table-layout schema — the valid mode set and the legacy fullWidth/fit precedence, the positive-finite width/manual/ratio/tableWidth decoding, and the two meaningful-entry (non-husk) drop rules shared by the Muya sanitizer (sanitizePersistedEntries) and the renderer migration (migrateTableEntry). Field extraction, mode/legacy precedence and meaningful-entry logic live ONLY here; the consumer adapters keep their own boundary decisions (the 48 px display clamp, the ratio copy versus unit-sum normalization, the explicit-Auto handling).
//   SCOPE: TABLE_LAYOUT_MODES, isTableLayoutMode, isPositiveFinite, resolveTableLayoutMode, filterPositiveWidths, deriveManualFlags, deriveTableWidth, areStorableRatios, isMeaningfulEntry — pure decoding only. No px floor, no clamp, no ratio normalization, no storage/geometry policy: those stay with the named adapters (lib/tableResize/index.js, renderer util tableLayoutRatios.js).
//   DEPENDS: none (framework-free pure functions; no DOM, IPC, storage, window, Vue or Node runtime dependency — Muya stays self-contained).
//   LINKS: .grace/changes/archive/C-TABLE-PROFILE-SCHEMA (spec + plan); .grace/graph/runtime.xml M-012 and .grace/graph/performance.xml M-061 (the consumer records); lib/tableResize/index.js (sanitizePersistedEntries — the Muya-direct adapter); renderer util tableLayoutRatios.js (migrateTableEntry — the store-side adapter; renderer→muya import direction only); .grace/changes/archive/C-PAGE-WIDTH-TABLES T-007/T-008 (the schema v2 origin).
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   TABLE_LAYOUT_MODES - the persisted mode set ('auto' | 'fit' | 'full'); the owner's own copy (index.js TABLE_MODES is NOT re-exported here).
//   isTableLayoutMode - pure: is the value one of TABLE_LAYOUT_MODES.
//   isPositiveFinite - pure: the shared «usable number» predicate (finite and > 0).
//   resolveTableLayoutMode - pure: explicit mode wins, then legacy fullWidth, then legacy fit, else null (absent-mode inheritance stays caller-side).
//   filterPositiveWidths - pure: ordered positive-finite widths; a non-array decodes as [].
//   deriveManualFlags - pure: one boolean per kept width; missing flags and a non-array source read false.
//   deriveTableWidth - pure: positive finite → rounded; everything else → undefined.
//   areStorableRatios - pure: length matches the kept-width count and every value is positive finite (an empty array at zero widths passes — the shared predicate; the renderer's normalizeRatios still rejects length 0 downstream).
//   isMeaningfulEntry - pure: the two shared drop rules — a bare husk with nothing set (rule 1), and a no-fact entry whose only fact is a manual flag (rule 2).
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   - 2026-11-21 C-DOCS-SYNC: C-TABLE-PROFILE-SCHEMA link repointed to .grace/changes/archive/ (the change archived); no behavior change.
//   CURRENT: 2026-11-19 C-TABLE-PROFILE-SCHEMA: new pure owner — the
//   persisted-layout field validation, legacy mode precedence and
//   meaningful-entry rules move here from the two independently maintained
//   adapters (sanitizePersistedEntries, migrateTableEntry), which now
//   delegate to these exports and keep only their boundary differences.
// END_CHANGE_SUMMARY

export const TABLE_LAYOUT_MODES = ['auto', 'fit', 'full']

export const isTableLayoutMode = (mode) => TABLE_LAYOUT_MODES.includes(mode)

export const isPositiveFinite = (value) => Number.isFinite(value) && value > 0

// Explicit mode wins; then legacy fullWidth; then legacy fit; else null.
export const resolveTableLayoutMode = (raw) => {
  if (!raw || typeof raw !== 'object') return null
  if (isTableLayoutMode(raw.mode)) return raw.mode
  if (raw.fullWidth) return 'full'
  if (raw.fit) return 'fit'
  return null
}

// Ordered positive-finite widths; non-array decodes as [].
export const filterPositiveWidths = (raw) => (Array.isArray(raw) ? raw.filter(isPositiveFinite) : [])

// One flag per kept width; missing/absent flags read false.
export const deriveManualFlags = (rawManual, widthCount) => {
  const source = Array.isArray(rawManual) ? rawManual : []
  return Array.from({ length: widthCount }, (_, i) => !!source[i])
}

// Positive finite → rounded; everything else → undefined.
export const deriveTableWidth = (raw) =>
  raw && isPositiveFinite(raw.tableWidth) ? Math.round(raw.tableWidth) : undefined

// Length must equal the kept-width count and every value must be positive finite.
// NOTE: an empty array at zero widths is `true` here — that is the current Muya
// predicate; the renderer's normalizeRatios still rejects length 0 downstream.
export const areStorableRatios = (raw, widthCount) =>
  Array.isArray(raw) && raw.length === widthCount && raw.every(isPositiveFinite)

// The two drop rules both consumers share today (manual, not widths, in rule 2).
export const isMeaningfulEntry = ({ widths, manual, mode, ratios, tableWidth }) => {
  if (widths.length === 0 && !mode && !tableWidth && !ratios) return false
  if (!mode && !tableWidth && !ratios && !manual.some(Boolean)) return false
  return true
}
