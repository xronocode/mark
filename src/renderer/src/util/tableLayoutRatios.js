// FILE: src/renderer/src/util/tableLayoutRatios.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: C-PAGE-WIDTH-TABLES T-008 (M-061) the store-side pure maths of the tableLayouts schema v2 — the ratios (fractions of the table width) that let persisted column sizes survive window resizes, zoom, page-width changes and Fit↔Full switches, plus the one-way migration of the legacy px-only entries (the fullWidth/fit booleans become the v2 mode field; a stored fit:true — the retired fake fit — opens in the honest Fit page). The muya counterpart of the apply/re-apply maths lives in src/muya/lib/tableResize/tableFit.js (muya stays self-contained); this module owns what the persistence layer needs: normalize, derive, apply, migrate.
//   SCOPE: Pure transforms only — normalizeRatios (sanitize + unit-sum correction), ratiosFromWidths, applyRatios (ratios + frame → px widths floored at minima, summing to the frame), migrateTableEntry (schema v1 → v2: legacy fullWidth/fit booleans → mode, idempotent by construction), MIN_TABLE_COLUMN_PX (the shared 48px floor). No IO, no DOM, no imports — unit-pinnable with plain objects.
//   DEPENDS: none (framework-free pure functions).
//   LINKS: .grace/changes/active/C-PAGE-WIDTH-TABLES (plan T-008, spec R-8/R-10, corners C-8/C-9); .grace/graph/performance.xml M-061; util/tableLayoutStore.js (the store consuming migrateTableEntry + normalizeRatios); src/muya/lib/tableResize/index.js + tableFit.js (the muya-side sanitize/apply counterparts); store/preferences.js rememberTableColumnSizes (the consumption gate).
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   MIN_TABLE_COLUMN_PX - the floor any applied/floored column keeps (48px, the drag-clamp floor).
//   normalizeRatios - pure: raw array + expected length → positive fractions summing to 1 (scaled), or null.
//   ratiosFromWidths - pure: px widths → fractions of their sum (null when the sum collapses).
//   applyRatios - pure: ratios + frame (+ optional minima) → integer px widths summing to round(frame).
//   migrateTableEntry - pure: schema v1 entry → v2 { widths, manual, mode?, ratios?, tableWidth? } (legacy booleans become mode; re-running changes nothing).
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - 2026-11-02 C-PAGE-WIDTH-TABLES T-008: new
//   module. tableLayouts entries gain ratios + an explicit tableWidth and
//   a mode field replacing the legacy fullWidth/fit booleans; the fake-fit
//   flag migrates one-way to the honest Fit page (owner gate №4) and the
//   migration is idempotent (corner C-8: a second run changes nothing).
// END_CHANGE_SUMMARY

export const MIN_TABLE_COLUMN_PX = 48

// START_BLOCK_RATIO_TRANSFORMS
// Positive fractions summing to 1 (the last share absorbs the rounding so
// the sum is exact). The raw values may come from a hand-edited profile —
// anything non-positive or non-finite rejects the whole array (the entry
// keeps its px widths, only the ratios are dropped).
export const normalizeRatios = (raw, expectedLength) => {
  if (!Array.isArray(raw) || raw.length !== expectedLength || expectedLength === 0) return null
  if (!raw.every(r => Number.isFinite(r) && r > 0)) return null
  const total = raw.reduce((sum, r) => sum + r, 0)
  if (!(total > 0)) return null
  const scaled = raw.map(r => r / total)
  const drift = 1 - scaled.reduce((sum, r) => sum + r, 0)
  scaled[scaled.length - 1] += drift
  return scaled
}

export const ratiosFromWidths = (widths) => {
  if (!Array.isArray(widths) || widths.length === 0) return null
  const total = widths.reduce((sum, w) => sum + (Number.isFinite(w) && w > 0 ? w : 0), 0)
  if (!(total > 0)) return null
  return widths.map(w => (Number.isFinite(w) && w > 0 ? w : 0) / total)
}

// Re-apply proportions to a new frame (window resize, zoom, page width,
// Fit↔Full): each column takes its share, floors at its minimum (the
// measured minContent when the caller has extents, the 48px floor
// otherwise), and the space the floors consume comes back off the columns
// that still have room — the widths sum to the frame again.
export const applyRatios = (ratios, frameWidth, minima = [], minColumnPx = MIN_TABLE_COLUMN_PX) => {
  if (!Array.isArray(ratios) || ratios.length === 0 ||
    !Number.isFinite(frameWidth) || frameWidth <= 0) return null
  if (!ratios.every(r => Number.isFinite(r) && r > 0)) return null
  const floorOf = (i) => (Number.isFinite(minima[i]) && minima[i] >= 1 ? minima[i] : minColumnPx)
  const widths = ratios.map((r, i) => Math.max(r * frameWidth, floorOf(i)))
  // Give the consumed floor space back, proportionally off the donors.
  for (let guard = ratios.length + 1; guard > 0; guard--) {
    const used = widths.reduce((sum, w) => sum + w, 0)
    const excess = used - frameWidth
    if (excess <= 0.5) break
    const donors = []
    let room = 0
    for (let i = 0; i < widths.length; i++) {
      const spare = widths[i] - floorOf(i)
      if (spare > 0.5) {
        donors.push(i)
        room += spare
      }
    }
    if (donors.length === 0 || room <= 0) break
    const take = Math.min(excess, room)
    for (const i of donors) {
      widths[i] -= take * (widths[i] - floorOf(i)) / room
    }
  }
  // Integer snap whose sum is exactly the frame (largest remainder).
  const rounded = widths.map(w => Math.round(w))
  let residual = Math.round(frameWidth) - rounded.reduce((sum, w) => sum + w, 0)
  while (residual !== 0) {
    let pick = -1
    for (let i = 0; i < rounded.length; i++) {
      if (residual < 0) {
        if (rounded[i] > Math.ceil(floorOf(i)) && (pick === -1 || rounded[i] > rounded[pick])) pick = i
      } else if (pick === -1 || rounded[i] < rounded[pick]) pick = i
    }
    if (pick === -1) break
    rounded[pick] += residual > 0 ? 1 : -1
    residual += residual > 0 ? -1 : 1
  }
  return rounded
}
// END_BLOCK_RATIO_TRANSFORMS

// START_BLOCK_SCHEMA_V2_MIGRATION
// Schema v1: { widths, manual, fullWidth, fit } (px-only, the fake-fit
// flags). Schema v2: { widths, manual, mode?, ratios?, tableWidth? } —
// the mode is 'fit' | 'full' (absent = Auto), ratios are the stored
// proportions, tableWidth the side-wall-set explicit width.
// The migration is one-way and IDEMPOTENT (corner C-8): a v2 entry reads
// back as the same v2 entry; the legacy booleans are never written again.
// Full width wins a contradictory legacy pair; a bare legacy fit:true —
// the retired fake fit — opens in the honest Fit page (owner gate №4:
// the intent «keep it inside the column» is exactly what the new mode
// delivers).
export const migrateTableEntry = (raw) => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const widths = Array.isArray(raw.widths)
    ? raw.widths.filter(w => Number.isFinite(w) && w > 0).map(w => Math.round(w))
    : []
  const manual = Array.isArray(raw.manual)
    ? widths.map((_, i) => !!raw.manual[i])
    : widths.map(() => false)
  let mode
  if (raw.mode === 'fit' || raw.mode === 'full') mode = raw.mode
  else if (raw.fullWidth) mode = 'full'
  else if (raw.fit) mode = 'fit'
  const ratios = normalizeRatios(raw.ratios, widths.length) || undefined
  const tableWidth = Number.isFinite(raw.tableWidth) && raw.tableWidth > 0
    ? Math.round(raw.tableWidth)
    : undefined
  if (widths.length === 0 && !mode && !tableWidth && !ratios) return null
  if (!mode && !tableWidth && !ratios && !manual.some(Boolean)) return null
  const entry = { widths, manual }
  if (mode) entry.mode = mode
  if (ratios) entry.ratios = ratios
  if (tableWidth) entry.tableWidth = tableWidth
  return entry
}
// END_BLOCK_SCHEMA_V2_MIGRATION
