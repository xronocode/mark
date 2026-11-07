// FILE: tests/renderer/util/table-layout-ratios.test.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: C-PAGE-WIDTH-TABLES T-008: pin the schema-v2 ratio persistence of tableLayouts — the pure ratio maths (normalize/derive/apply with the minima floors), the store sanitize carrying ratios + tableWidth + mode next to the px widths, the one-way idempotent v1→v2 migration (a legacy fit:true — the retired fake fit — opens in the honest Fit page; re-running the migration changes nothing), the v2 save→load round trip through the store IO, and the unchanged cap/prune/rename rules over the new shape.
//   SCOPE: src/renderer/src/util/tableLayoutRatios.js (normalizeRatios, ratiosFromWidths, applyRatios, migrateTableEntry, MIN_TABLE_COLUMN_PX) and the tableLayoutStore.js flows over v2 entries (sanitizeEntry, normalizeStore version, saveTableLayoutsFor/loadTableLayoutsFor with a fake IO).
//   DEPENDS: Vitest; a fake prefs IO (the store/twin pattern of table-layout-store.test.js).
//   LINKS: .grace/changes/active/C-PAGE-WIDTH-TABLES (plan T-008; spec R-8/R-10; corners C-8/C-9); .grace/graph/performance.xml M-061; src/renderer/src/util/tableLayoutRatios.js; src/renderer/src/util/tableLayoutStore.js; src/muya/lib/tableResize (the muya-side sanitize/apply counterpart, pinned in tests/renderer/muya/).
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   sum - reducer helper for width arrays.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - 2026-11-02 C-PAGE-WIDTH-TABLES T-008: new
//   suite over the new module and the v2 store — ratios round-trip,
//   Fit↔Full re-application maths, the idempotent legacy migration
//   (corner C-8) and the renormalisation rule for the store-level entry
//   shapes (the inserted-column share is muya's reconcile, pinned there).
// END_CHANGE_SUMMARY

import { describe, expect, it } from 'vitest'
import {
  MIN_TABLE_COLUMN_PX,
  applyRatios,
  migrateTableEntry,
  normalizeRatios,
  ratiosFromWidths
} from '@/util/tableLayoutRatios'
import {
  EMPTY_STORE,
  loadTableLayoutsFor,
  normalizeStore,
  sanitizeEntry,
  saveTableLayoutsFor
} from '@/util/tableLayoutStore'

const sum = (values) => values.reduce((total, w) => total + w, 0)

describe('normalizeRatios / ratiosFromWidths', () => {
  it('normalizes positive fractions to an exact unit sum', () => {
    expect(normalizeRatios([1, 3], 2)).toEqual([0.25, 0.75])
    const scaled = normalizeRatios([2, 2, 4], 3)
    expect(sum(scaled)).toBeCloseTo(1, 12)
  })

  it('rejects wrong lengths, non-positive and non-finite entries', () => {
    expect(normalizeRatios([0.5, 0.5], 3)).toBeNull()
    expect(normalizeRatios([0.5, -1], 2)).toBeNull()
    expect(normalizeRatios([0.5, NaN], 2)).toBeNull()
    expect(normalizeRatios([], 0)).toBeNull()
  })

  it('ratiosFromWidths derives fractions from px widths', () => {
    expect(ratiosFromWidths([120, 360])).toEqual([0.25, 0.75])
    expect(ratiosFromWidths([0, 0])).toBeNull()
  })
})

describe('applyRatios — the re-application maths (corner C-9)', () => {
  it('re-applies the stored proportions to a new frame', () => {
    // 120/360 stored on a 480 frame → applied to 960 → 240/720.
    expect(applyRatios([0.25, 0.75], 960)).toEqual([240, 720])
  })

  it('sums exactly to the frame after the integer snap', () => {
    const widths = applyRatios([1 / 3, 1 / 3, 1 / 3], 1000)
    expect(sum(widths)).toBe(1000)
    expect(Math.max(...widths) - Math.min(...widths)).toBeLessThanOrEqual(1)
  })

  it('floors columns at their minima and takes the space off the donors', () => {
    // A 0.1 share of 1000 = 100 < the 200 floor; the donors give the 100
    // back and the sum stays the frame.
    const widths = applyRatios([0.1, 0.45, 0.45], 1000, [200])
    expect(sum(widths)).toBe(1000)
    expect(widths[0]).toBeGreaterThanOrEqual(200)
    expect(widths[1]).toBeLessThan(450)
  })

  it('falls back to the 48px module floor without measured minima', () => {
    const widths = applyRatios([0.02, 0.98], 200)
    expect(widths[0]).toBeGreaterThanOrEqual(MIN_TABLE_COLUMN_PX)
    expect(sum(widths)).toBe(200)
  })

  it('refuses unusable ratios/frames', () => {
    expect(applyRatios(null, 500)).toBeNull()
    expect(applyRatios([1], 0)).toBeNull()
    expect(applyRatios([0, 1], 500)).toBeNull()
  })
})

describe('migrateTableEntry — the idempotent v1→v2 migration (corner C-8)', () => {
  it('migrates a legacy fit:true entry to the honest Fit page', () => {
    const v2 = migrateTableEntry({ widths: [120, 80], manual: [true, false], fullWidth: false, fit: true })
    expect(v2).toEqual({ widths: [120, 80], manual: [true, false], mode: 'fit' })
  })

  it('Full width wins a contradictory legacy pair', () => {
    expect(migrateTableEntry({ widths: [], manual: [], fullWidth: true, fit: true }).mode).toBe('full')
  })

  it('carries ratios and the explicit table width into v2', () => {
    const entry = migrateTableEntry({
      widths: [200, 600],
      manual: [true, true],
      ratios: [0.25, 0.75],
      tableWidth: 800
    })
    expect(entry.ratios).toEqual([0.25, 0.75])
    expect(entry.tableWidth).toBe(800)
  })

  it('drops invalid ratios but keeps the entry', () => {
    const entry = migrateTableEntry({ widths: [120, 80], manual: [true, false], ratios: [0.5] })
    expect(entry.ratios).toBeUndefined()
    expect(entry.widths).toEqual([120, 80])
  })

  it('running the migration twice changes nothing (idempotent)', () => {
    const once = migrateTableEntry({ widths: [120, 80], manual: [true, false], fit: true })
    const twice = migrateTableEntry(once)
    expect(twice).toEqual(once)
    expect(Object.keys(twice).sort()).toEqual(['manual', 'mode', 'widths'])
  })

  it('a v1 entry with only a manual drag stays a px entry (no mode invented)', () => {
    expect(migrateTableEntry({ widths: [90], manual: [true], fullWidth: false, fit: false }))
      .toEqual({ widths: [90], manual: [true] })
  })

  it('refuses husks and malformed shapes', () => {
    expect(migrateTableEntry(null)).toBeNull()
    expect(migrateTableEntry({ widths: [], manual: [] })).toBeNull()
    expect(migrateTableEntry('nope')).toBeNull()
  })
})

describe('the store over schema v2', () => {
  it('sanitizeEntry passes through the migration rules', () => {
    expect(sanitizeEntry({ widths: [120.4, -5], manual: [true], fullWidth: false })).toEqual({
      widths: [120], manual: [true]
    })
    expect(sanitizeEntry({ widths: [], manual: [], fit: true })).toEqual({
      widths: [], manual: [], mode: 'fit'
    })
    expect(sanitizeEntry({ widths: [], manual: [], fullWidth: true })).toEqual({
      widths: [], manual: [], mode: 'full'
    })
  })

  it('normalizeStore always returns version 2 and migrates v1 files', () => {
    const store = normalizeStore({
      version: 1,
      files: {
        '/a.md': {
          updatedAt: 10,
          '0#2:abc': { widths: [100, 200], manual: [true, false], fit: true }
        }
      }
    })
    expect(store.version).toBe(2)
    expect(store.files['/a.md']['0#2:abc']).toEqual({
      widths: [100, 200], manual: [true, false], mode: 'fit'
    })
  })

  it('EMPTY_STORE is the v2 shape', () => {
    expect(EMPTY_STORE).toEqual({ version: 2, files: {} })
  })

  it('a v2 entry round-trips save → load with ratios and mode intact', async () => {
    const backing = {}
    const io = {
      get: async (key) => backing[key],
      set: async (key, value) => { backing[key] = value }
    }
    const entries = {
      '0#2:x': { widths: [200, 600], manual: [true, true], ratios: [0.25, 0.75], mode: 'full' },
      '1#3:y': { widths: [90, 90, 90], manual: [true, false, false], tableWidth: 270 }
    }
    await saveTableLayoutsFor('/doc.md', entries, io)
    const restored = await loadTableLayoutsFor('/doc.md', io)
    expect(restored['0#2:x']).toEqual({
      widths: [200, 600], manual: [true, true], ratios: [0.25, 0.75], mode: 'full'
    })
    expect(restored['1#3:y'].tableWidth).toBe(270)
    // And the persisted store itself is v2.
    expect(backing.tableLayouts.version).toBe(2)
  })

  it('an auto table with ratios stays a stored-but-unapplied entry (R-10)', async () => {
    const backing = {}
    const io = {
      get: async (key) => backing[key],
      set: async (key, value) => { backing[key] = value }
    }
    // No mode: the entry is plain Auto — ratios stored, nothing applied.
    await saveTableLayoutsFor('/auto.md', {
      '0#2:a': { widths: [100, 300], manual: [true, true], ratios: [0.25, 0.75] }
    }, io)
    const restored = await loadTableLayoutsFor('/auto.md', io)
    expect(restored['0#2:a'].mode).toBeUndefined()
    expect(restored['0#2:a'].ratios).toEqual([0.25, 0.75])
  })
})
