vi.mock('@/bus', () => ({
  default: { on: vi.fn(), off: vi.fn(), emit: vi.fn() }
}))

vi.mock('@/i18n', () => ({
  t: vi.fn((key) => key)
}))

describe('contextMenu/sideBar/menuItems.js', () => {
  it('exports SEPARATOR object', async () => {
    const { SEPARATOR } = await import('@/contextMenu/sideBar/menuItems.js')
    expect(SEPARATOR).toEqual({ type: 'separator' })
  })

  it('exports factory functions that return menu specs', async () => {
    const mod = await import('@/contextMenu/sideBar/menuItems.js')
    const factories = [
      'getNEW_FILE', 'getNEW_DIRECTORY', 'getCOPY', 'getCUT',
      'getPASTE', 'getRENAME', 'getDELETE', 'getSHOW_IN_FOLDER'
    ]
    for (const name of factories) {
      expect(typeof mod[name]).toBe('function')
      const item = mod[name]()
      expect(item).toHaveProperty('label')
      expect(item).toHaveProperty('id')
    }
  })

  it('exports HANDLERS map with correct ids', async () => {
    const { HANDLERS } = await import('@/contextMenu/sideBar/menuItems.js')
    const expectedIds = [
      'newFileMenuItem', 'newDirectoryMenuItem', 'copyMenuItem',
      'cutMenuItem', 'pasteMenuItem', 'renameMenuItem',
      'deleteMenuItem', 'showInFolderMenuItem'
    ]
    for (const id of expectedIds) {
      expect(typeof HANDLERS[id]).toBe('function')
    }
  })

  it('exports backward-compatible constant specs', async () => {
    const mod = await import('@/contextMenu/sideBar/menuItems.js')
    const constants = ['NEW_FILE', 'NEW_DIRECTORY', 'COPY', 'CUT', 'PASTE', 'RENAME', 'DELETE', 'SHOW_IN_FOLDER']
    for (const name of constants) {
      expect(mod[name]).toHaveProperty('label')
      expect(mod[name]).toHaveProperty('id')
    }
  })
})
