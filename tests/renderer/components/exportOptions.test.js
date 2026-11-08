/**
 * Tests for exportSettings/exportOptions.js
 */

vi.mock('@/i18n', () => ({
  t: vi.fn((key) => key)
}))

describe('exportOptions.js', () => {
  it('exports getPageSizeList with expected page sizes', async () => {
    const { getPageSizeList } = await import('@/components/exportSettings/exportOptions.js')
    const list = getPageSizeList()
    expect(Array.isArray(list)).toBe(true)
    expect(list.length).toBeGreaterThan(0)
    const values = list.map((item) => item.value)
    expect(values).toContain('A3')
    expect(values).toContain('A4')
    expect(values).toContain('A5')
    expect(values).toContain('Letter')
    expect(values).toContain('Legal')
    expect(values).toContain('custom')
  })

  it('exports getHeaderFooterTypes', async () => {
    const { getHeaderFooterTypes } = await import('@/components/exportSettings/exportOptions.js')
    const types = getHeaderFooterTypes()
    expect(Array.isArray(types)).toBe(true)
    expect(types.length).toBe(3)
    expect(types[0].value).toBe(0) // None
  })

  it('exports getHeaderFooterStyles', async () => {
    const { getHeaderFooterStyles } = await import('@/components/exportSettings/exportOptions.js')
    const styles = getHeaderFooterStyles()
    expect(Array.isArray(styles)).toBe(true)
    expect(styles.length).toBe(3)
  })

  it('exports getExportThemeList', async () => {
    const { getExportThemeList } = await import('@/components/exportSettings/exportOptions.js')
    const themes = getExportThemeList()
    expect(Array.isArray(themes)).toBe(true)
    expect(themes.length).toBeGreaterThan(0)
    const values = themes.map((item) => item.value)
    expect(values).toContain('default')
    expect(values).toContain('academic')
  })

  it('exports backward-compatible constant arrays', async () => {
    const mod = await import('@/components/exportSettings/exportOptions.js')
    expect(Array.isArray(mod.pageSizeList)).toBe(true)
    expect(Array.isArray(mod.headerFooterTypes)).toBe(true)
    expect(Array.isArray(mod.headerFooterStyles)).toBe(true)
    expect(Array.isArray(mod.exportThemeList)).toBe(true)
  })
})

// C-EXPORT-SINGLE-PAGE T-001: the pure helpers the single-page dialog
// rides on — margin presets (corner-3) and the header/footer slot →
// legacy type derivation (corner-2).
describe('exportOptions.js — C-EXPORT-SINGLE-PAGE helpers', () => {
  describe('margin presets (R-3)', () => {
    it('lists narrow/normal/wide/custom with localized labels', async () => {
      const { getMarginPresetList } = await import('@/components/exportSettings/exportOptions.js')
      const list = getMarginPresetList()
      expect(list.map(o => o.value)).toEqual(['narrow', 'normal', 'wide', 'custom'])
      for (const entry of list) {
        expect(entry.label).toBe(`exportSettings.options.marginPresets.${entry.value}`)
      }
    })

    it('every preset matches itself and "normal" mirrors the factory margins', async () => {
      const { MARGIN_PRESETS, matchMarginPreset } = await import('@/components/exportSettings/exportOptions.js')
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

    it('falls back to custom on any deviation or missing values', async () => {
      const { matchMarginPreset } = await import('@/components/exportSettings/exportOptions.js')
      expect(matchMarginPreset({ pageMarginTop: 21, pageMarginRight: 15, pageMarginBottom: 20, pageMarginLeft: 15 })).toBe('custom')
      expect(matchMarginPreset({ pageMarginTop: 20, pageMarginRight: 15, pageMarginBottom: 20 })).toBe('custom')
      expect(matchMarginPreset({})).toBe('custom')
      expect(matchMarginPreset(null)).toBe('custom')
      expect(matchMarginPreset(undefined)).toBe('custom')
    })

    it('compares numerically so string inputs still match', async () => {
      const { matchMarginPreset } = await import('@/components/exportSettings/exportOptions.js')
      expect(matchMarginPreset({
        pageMarginTop: '20',
        pageMarginRight: '15',
        pageMarginBottom: 20,
        pageMarginLeft: 15
      })).toBe('normal')
    })
  })

  describe('header/footer slot derivation (R-4, corner-2)', () => {
    it('all-empty (or cleared back to empty) derives type 0 — key omitted by the caller', async () => {
      const { deriveHeaderFooterType } = await import('@/components/exportSettings/exportOptions.js')
      expect(deriveHeaderFooterType()).toBe(0)
      expect(deriveHeaderFooterType({})).toBe(0)
      expect(deriveHeaderFooterType({ left: '', center: '', right: '' })).toBe(0)
      expect(deriveHeaderFooterType({ left: '   ', center: '', right: '' })).toBe(0)
    })

    it('centre-only text derives type 1 (single cell); a three-cell legacy shape with empty sides normalizes to it', async () => {
      const { deriveHeaderFooterType } = await import('@/components/exportSettings/exportOptions.js')
      expect(deriveHeaderFooterType({ center: 'H' })).toBe(1)
      expect(deriveHeaderFooterType({ left: '', center: 'H', right: '' })).toBe(1)
    })

    it('any side slot with text derives type 2 (three cells)', async () => {
      const { deriveHeaderFooterType } = await import('@/components/exportSettings/exportOptions.js')
      expect(deriveHeaderFooterType({ left: 'L' })).toBe(2)
      expect(deriveHeaderFooterType({ right: 'R' })).toBe(2)
      expect(deriveHeaderFooterType({ left: 'L', center: 'C', right: 'R' })).toBe(2)
      expect(deriveHeaderFooterType({ left: 'L', center: '', right: '' })).toBe(2)
    })
  })
})
