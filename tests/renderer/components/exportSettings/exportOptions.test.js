/**
 * exportOptions helpers — C-EXPORT-SINGLE-PAGE T-001.
 *
 * The pure helpers the single-page export dialog rides on: margin
 * presets (matching in both directions, custom fallback — corner-3) and
 * the header/footer slot → legacy type derivation (corner-2), plus the
 * legacy list getters the dialog still consumes.
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('@/i18n', () => ({ t: vi.fn(key => key) }))

import {
  MARGIN_PRESETS,
  getMarginPresetList,
  matchMarginPreset,
  deriveHeaderFooterType,
  getPageSizeList,
  getHeaderFooterTypes,
  getExportThemeList
} from '@/components/exportSettings/exportOptions'

describe('exportSettings/exportOptions (C-EXPORT-SINGLE-PAGE)', () => {
  describe('margin presets (R-3)', () => {
    it('lists narrow/normal/wide/custom with localized labels', () => {
      const list = getMarginPresetList()
      expect(list.map(o => o.value)).toEqual(['narrow', 'normal', 'wide', 'custom'])
      for (const entry of list) {
        expect(entry.label).toBe(`exportSettings.options.marginPresets.${entry.value}`)
      }
    })

    it('every preset matches itself and "normal" mirrors the factory margins', () => {
      for (const [name, preset] of Object.entries(MARGIN_PRESETS)) {
        expect(matchMarginPreset(preset)).toBe(name)
      }
      expect(MARGIN_PRESETS.normal).toEqual({
        pageMarginTop: 20,
        pageMarginRight: 15,
        pageMarginBottom: 20,
        pageMarginLeft: 15
      })
    })

    it('falls back to custom on any deviation or missing values', () => {
      expect(matchMarginPreset({ pageMarginTop: 21, pageMarginRight: 15, pageMarginBottom: 20, pageMarginLeft: 15 })).toBe('custom')
      expect(matchMarginPreset({ pageMarginTop: 20, pageMarginRight: 15, pageMarginBottom: 20 })).toBe('custom')
      expect(matchMarginPreset({})).toBe('custom')
      expect(matchMarginPreset(null)).toBe('custom')
      expect(matchMarginPreset(undefined)).toBe('custom')
    })

    it('compares numerically so string inputs still match', () => {
      expect(matchMarginPreset({
        pageMarginTop: '20',
        pageMarginRight: '15',
        pageMarginBottom: 20,
        pageMarginLeft: 15
      })).toBe('normal')
    })
  })

  describe('header/footer slot derivation (R-4, corner-2)', () => {
    it('all-empty (or cleared back to empty) derives type 0 — key omitted by the caller', () => {
      expect(deriveHeaderFooterType()).toBe(0)
      expect(deriveHeaderFooterType({})).toBe(0)
      expect(deriveHeaderFooterType({ left: '', center: '', right: '' })).toBe(0)
      expect(deriveHeaderFooterType({ left: '   ', center: '', right: '' })).toBe(0)
    })

    it('centre-only text derives type 1 (single cell)', () => {
      expect(deriveHeaderFooterType({ center: 'H' })).toBe(1)
      expect(deriveHeaderFooterType({ left: '', center: 'H', right: '' })).toBe(1)
      // three-cell legacy shape with empty sides normalizes to single-cell
      expect(deriveHeaderFooterType({ left: '', center: 'H', right: '' })).toBe(1)
    })

    it('any side slot with text derives type 2 (three cells)', () => {
      expect(deriveHeaderFooterType({ left: 'L' })).toBe(2)
      expect(deriveHeaderFooterType({ right: 'R' })).toBe(2)
      expect(deriveHeaderFooterType({ left: 'L', center: 'C', right: 'R' })).toBe(2)
      expect(deriveHeaderFooterType({ left: 'L', center: '', right: '' })).toBe(2)
    })
  })

  describe('legacy list getters stay intact', () => {
    it('page sizes, header/footer types and themes keep their values', () => {
      expect(getPageSizeList().map(o => o.value)).toEqual(
        ['A3', 'A4', 'A5', 'Legal', 'Letter', 'Tabloid', 'custom']
      )
      expect(getHeaderFooterTypes().map(o => o.value)).toEqual([0, 1, 2])
      expect(getExportThemeList().map(o => o.value)).toEqual(
        ['academic', 'default', 'liber']
      )
    })
  })
})
