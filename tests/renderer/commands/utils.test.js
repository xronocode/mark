/**
 * Tests for src/renderer/src/commands/utils.js
 *
 * Covers: isUpdatable() — platform-specific runtime update check.
 */

describe('isUpdatable', () => {
  let isUpdatable

  beforeEach(async () => {
    vi.resetModules()
  })

  it('returns false when app-update.yml does not exist', async () => {
    window.electron.resourcesPath = '/app'
    window.fileUtils.isFile = vi.fn(() => false)
    window.path.join = vi.fn((...parts) => parts.join('/'))

    const mod = await import('@/commands/utils')
    isUpdatable = mod.isUpdatable

    expect(isUpdatable()).toBe(false)
  })

  it('returns true when running as AppImage', async () => {
    window.electron.resourcesPath = '/app'
    window.fileUtils.isFile = vi.fn(() => true)
    window.electron.process.env = { APPIMAGE: '/path/to/app.AppImage' }
    window.path.join = vi.fn((...parts) => parts.join('/'))

    const mod = await import('@/commands/utils')
    isUpdatable = mod.isUpdatable

    expect(isUpdatable()).toBe(true)
  })

  it('returns false when app-update.yml exists but not AppImage and not Windows', async () => {
    window.electron.resourcesPath = '/app'
    window.fileUtils.isFile = vi.fn((p) => {
      if (p.includes('app-update.yml')) return true
      return false
    })
    window.electron.process.env = {}
    window.electron.process.platform = 'darwin'
    window.path.join = vi.fn((...parts) => parts.join('/'))

    const mod = await import('@/commands/utils')
    isUpdatable = mod.isUpdatable

    expect(isUpdatable()).toBe(false)
  })
})
