// FILE: tests/renderer/muya/table-layout-schema.test.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: C-TABLE-PROFILE-SCHEMA pin the shared persisted-layout schema owner directly — the mode set and legacy fullWidth-over-fit precedence, the absent-mode inheritance verdict (null, never a mode invented here), unknown mode strings, positive-finite width filtering, per-kept-width manual flag derivation, ratio validity (matching length plus all positive finite, including the pinned empty-array-at-zero-widths verdict), tableWidth rounding, both meaningful-entry drop rules, and raw-input immutability. Independently stated expectations — none are derived from the adapters.
//   SCOPE: src/muya/lib/tableResize/tableLayoutSchema.js exports only (TABLE_LAYOUT_MODES, isTableLayoutMode, isPositiveFinite, resolveTableLayoutMode, filterPositiveWidths, deriveManualFlags, deriveTableWidth, areStorableRatios, isMeaningfulEntry). The consumer boundaries (sanitizePersistedEntries, migrateTableEntry) are pinned in their own suites.
//   DEPENDS: Vitest; the pure owner module (zero imports — loads anywhere jsdom loads).
//   LINKS: .grace/changes/active/C-TABLE-PROFILE-SCHEMA (spec + plan T-001); the consumer twins tests/renderer/muya/table-layout-persistence.test.js, tests/renderer/util/table-layout-ratios.test.js and tests/renderer/store/table-layout-store.test.js (the scoped C-TABLE-PROFILE-SCHEMA blocks); src/muya/lib/tableResize/index.js and src/renderer/src/util/tableLayoutRatios.js (the delegating adapters).
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   (no local helpers — the suite pins the owner's exports directly)
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   CURRENT: 2026-11-19 C-TABLE-PROFILE-SCHEMA T-001: new owner-direct
//   suite — mode/legacy precedence, width/manual decoding, ratio and
//   tableWidth validity (with the empty-ratios-at-zero-widths pin), both
//   husk rules and raw-input immutability.
// END_CHANGE_SUMMARY

import { describe, expect, it } from 'vitest'
import {
  TABLE_LAYOUT_MODES,
  areStorableRatios,
  deriveManualFlags,
  deriveTableWidth,
  filterPositiveWidths,
  isMeaningfulEntry,
  isPositiveFinite,
  isTableLayoutMode,
  resolveTableLayoutMode
} from 'muya/lib/tableResize/tableLayoutSchema'

describe('tableLayoutSchema — the shared persisted-layout schema owner (C-TABLE-PROFILE-SCHEMA)', () => {
  describe('mode resolution and legacy precedence', () => {
    it('an explicit valid mode wins over contradictory legacy flags', () => {
      expect(TABLE_LAYOUT_MODES).toEqual(['auto', 'fit', 'full'])
      expect(isTableLayoutMode('fit')).toBe(true)
      expect(isTableLayoutMode('FIT')).toBe(false)
      expect(resolveTableLayoutMode({ mode: 'fit', fullWidth: true, fit: true })).toBe('fit')
      expect(resolveTableLayoutMode({ mode: 'full', fit: true })).toBe('full')
      expect(resolveTableLayoutMode({ mode: 'auto', fullWidth: true })).toBe('auto')
    })

    it('legacy fullWidth beats legacy fit in a contradictory pair', () => {
      expect(resolveTableLayoutMode({ fullWidth: true, fit: true })).toBe('full')
      expect(resolveTableLayoutMode({ fullWidth: true, fit: false })).toBe('full')
      expect(resolveTableLayoutMode({ fullWidth: false, fit: true })).toBe('fit')
    })

    it('an absent mode and absent legacy flags resolve to null (inheritance stays caller-side)', () => {
      expect(resolveTableLayoutMode({ widths: [120] })).toBeNull()
      expect(resolveTableLayoutMode({})).toBeNull()
    })

    it('an unknown mode string is not a mode and legacy flags still apply', () => {
      expect(resolveTableLayoutMode({ mode: 'bogus', fullWidth: true })).toBe('full')
      expect(resolveTableLayoutMode({ mode: 'bogus', fit: true })).toBe('fit')
      expect(resolveTableLayoutMode({ mode: 'bogus' })).toBeNull()
      expect(resolveTableLayoutMode({ mode: '' })).toBeNull()
    })

    it('a non-object raw resolves to null', () => {
      expect(resolveTableLayoutMode(null)).toBeNull()
      expect(resolveTableLayoutMode('full')).toBeNull()
      expect(resolveTableLayoutMode(42)).toBeNull()
      expect(resolveTableLayoutMode([])).toBeNull()
    })
  })

  describe('width and manual-flag decoding', () => {
    it('keeps only positive finite widths, in order', () => {
      expect(isPositiveFinite(1)).toBe(true)
      expect(isPositiveFinite(0)).toBe(false)
      expect(isPositiveFinite(-1)).toBe(false)
      expect(isPositiveFinite(Infinity)).toBe(false)
      expect(isPositiveFinite(NaN)).toBe(false)
      expect(filterPositiveWidths([120, 47.9, 0, -1, NaN, Infinity, 'x', null, 80.5]))
        .toEqual([120, 47.9, 80.5])
    })

    it('a non-array widths field decodes as empty', () => {
      expect(filterPositiveWidths(null)).toEqual([])
      expect(filterPositiveWidths(undefined)).toEqual([])
      expect(filterPositiveWidths('120')).toEqual([])
      expect(filterPositiveWidths(42)).toEqual([])
      expect(filterPositiveWidths({ length: 1 })).toEqual([])
    })

    it('one manual flag aligns per kept width; missing flags read false', () => {
      expect(deriveManualFlags([true], 3)).toEqual([true, false, false])
      expect(deriveManualFlags([false, true], 2)).toEqual([false, true])
      expect(deriveManualFlags([true, false], 0)).toEqual([])
    })

    it('a non-array manual field decodes as all-false flags', () => {
      expect(deriveManualFlags(null, 2)).toEqual([false, false])
      expect(deriveManualFlags(undefined, 2)).toEqual([false, false])
      expect(deriveManualFlags('yes', 1)).toEqual([false])
      expect(deriveManualFlags('yes', 0)).toEqual([])
    })
  })

  describe('ratio and tableWidth decoding', () => {
    it('ratios are storable only at matching length with every value positive finite', () => {
      expect(areStorableRatios([0.5, 0.25], 2)).toBe(true)
      expect(areStorableRatios([0.5], 2)).toBe(false)
      expect(areStorableRatios([0.5, 0.5, 0.5], 2)).toBe(false)
      expect(areStorableRatios([1, -0.5], 2)).toBe(false)
      expect(areStorableRatios([1, 0], 2)).toBe(false)
      expect(areStorableRatios([1, NaN], 2)).toBe(false)
      expect(areStorableRatios('0.5,0.5', 2)).toBe(false)
      expect(areStorableRatios(null, 2)).toBe(false)
      expect(areStorableRatios([], 1)).toBe(false)
    })

    it('an empty ratios array at zero widths passes the shared predicate (pinned)', () => {
      // Intentional asymmetry (spec CAUTION): the Muya boundary then keeps
      // `ratios: []` on the zero-width record, while the renderer's
      // normalizeRatios rejects length 0 and its migration drops the entry.
      expect(areStorableRatios([], 0)).toBe(true)
    })

    it('tableWidth rounds a positive finite value and rejects the rest', () => {
      expect(deriveTableWidth({ tableWidth: 800.4 })).toBe(800)
      expect(deriveTableWidth({ tableWidth: 799.5 })).toBe(800)
      expect(deriveTableWidth({ tableWidth: 800 })).toBe(800)
      expect(deriveTableWidth({ tableWidth: 0 })).toBeUndefined()
      expect(deriveTableWidth({ tableWidth: -100 })).toBeUndefined()
      expect(deriveTableWidth({ tableWidth: Infinity })).toBeUndefined()
      expect(deriveTableWidth({ tableWidth: NaN })).toBeUndefined()
      expect(deriveTableWidth({ tableWidth: '800' })).toBeUndefined()
      expect(deriveTableWidth({})).toBeUndefined()
      expect(deriveTableWidth(null)).toBeUndefined()
    })
  })

  describe('meaningful-entry rules', () => {
    it('a bare husk with nothing set is not meaningful', () => {
      expect(isMeaningfulEntry({
        widths: [], manual: [false], mode: null, ratios: undefined, tableWidth: undefined
      })).toBe(false)
    })

    it('a mode alone, a tableWidth alone, ratios alone and widths alone are each meaningful', () => {
      expect(isMeaningfulEntry({
        widths: [], manual: [], mode: 'full', ratios: undefined, tableWidth: undefined
      })).toBe(true)
      expect(isMeaningfulEntry({
        widths: [], manual: [], mode: null, ratios: undefined, tableWidth: 500
      })).toBe(true)
      expect(isMeaningfulEntry({
        widths: [], manual: [], mode: null, ratios: [1], tableWidth: undefined
      })).toBe(true)
      // A dragged width (a true manual flag next to it) is a user fact too;
      // the same widths with all-auto flags stay the default layout (rule 2).
      expect(isMeaningfulEntry({
        widths: [120], manual: [true], mode: null, ratios: undefined, tableWidth: undefined
      })).toBe(true)
      expect(isMeaningfulEntry({
        widths: [120], manual: [false], mode: null, ratios: undefined, tableWidth: undefined
      })).toBe(false)
    })

    it('a manual flag alone with no mode/widths/ratios/tableWidth is not meaningful', () => {
      // Rule 1 drops the zero-width record before the flag can count.
      expect(isMeaningfulEntry({
        widths: [], manual: [true], mode: null, ratios: undefined, tableWidth: undefined
      })).toBe(false)
    })
  })

  describe('input immutability', () => {
    it('decoding never mutates the raw entry or returns its arrays by reference', () => {
      const raw = {
        widths: [120.6, 80, -5],
        manual: [true],
        ratios: [0.6, 0.4],
        tableWidth: 200.4,
        fullWidth: false,
        fit: false
      }
      const snapshot = JSON.stringify(raw)

      const widths = filterPositiveWidths(raw.widths)
      expect(widths).toEqual([120.6, 80])
      expect(widths).not.toBe(raw.widths)
      widths.push(999)
      expect(raw.widths).toEqual([120.6, 80, -5])

      const manual = deriveManualFlags(raw.manual, 2)
      expect(manual).toEqual([true, false])
      expect(manual).not.toBe(raw.manual)

      expect(deriveTableWidth(raw)).toBe(200)
      expect(resolveTableLayoutMode(raw)).toBeNull()
      expect(areStorableRatios(raw.ratios, 2)).toBe(true)

      expect(JSON.stringify(raw)).toBe(snapshot)
    })
  })
})
