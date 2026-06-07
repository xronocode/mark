describe('isUpdatable', () => {
  let isUpdatable

  beforeEach(async () => {
    vi.resetModules()
  })

  it('returns true when Tauri internals are present', async () => {
    window.__TAURI_INTERNALS__ = {}
    const mod = await import('@/commands/utils')
    isUpdatable = mod.isUpdatable
    expect(isUpdatable()).toBe(true)
    delete window.__TAURI_INTERNALS__
  })

  it('returns false when not running in Tauri', async () => {
    delete window.__TAURI_INTERNALS__
    const mod = await import('@/commands/utils')
    isUpdatable = mod.isUpdatable
    expect(isUpdatable()).toBe(false)
  })
})
