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
