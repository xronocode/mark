/**
 * Tests for sideBar/help.js
 * This module exports two arrays of sidebar icon configurations.
 */

vi.mock('@/i18n', () => ({
  t: vi.fn((key) => key)
}))

vi.mock('@/assets/icons/files.svg', () => ({ default: 'files-icon' }))
vi.mock('@/assets/icons/search.svg', () => ({ default: 'search-icon' }))
vi.mock('@/assets/icons/toc.svg', () => ({ default: 'toc-icon' }))
vi.mock('@/assets/icons/setting.svg', () => ({ default: 'setting-icon' }))

describe('sideBar/help.js', () => {
  it('exports sideBarIcons with expected entries', async () => {
    const { sideBarIcons } = await import('@/components/sideBar/help.js')
    expect(sideBarIcons).toBeDefined()
    expect(Array.isArray(sideBarIcons)).toBe(true)
    expect(sideBarIcons.length).toBe(3)

    const ids = sideBarIcons.map((item) => item.id)
    expect(ids).toContain('files')
    expect(ids).toContain('search')
    expect(ids).toContain('toc')
  })

  it('exports sideBarBottomIcons with settings entry', async () => {
    const { sideBarBottomIcons } = await import('@/components/sideBar/help.js')
    expect(sideBarBottomIcons).toBeDefined()
    expect(Array.isArray(sideBarBottomIcons)).toBe(true)
    expect(sideBarBottomIcons.length).toBe(1)
    expect(sideBarBottomIcons[0].id).toBe('settings')
  })

  it('icon entries have name functions', async () => {
    const { sideBarIcons, sideBarBottomIcons } = await import('@/components/sideBar/help.js')
    for (const icon of [...sideBarIcons, ...sideBarBottomIcons]) {
      expect(typeof icon.name).toBe('function')
      expect(typeof icon.name()).toBe('string')
    }
  })
})
