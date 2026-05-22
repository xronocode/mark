vi.mock('@/bus', () => ({
  default: { on: vi.fn(), off: vi.fn(), emit: vi.fn() }
}))

vi.mock('@/i18n', () => ({
  t: vi.fn((key) => key)
}))

describe('contextMenu/tabs/menuItems.js', () => {
  it('exports SEPARATOR object', async () => {
    const { SEPARATOR } = await import('@/contextMenu/tabs/menuItems.js')
    expect(SEPARATOR).toEqual({ type: 'separator' })
  })

  it('exports factory functions that return menu specs', async () => {
    const mod = await import('@/contextMenu/tabs/menuItems.js')
    const factories = [
      'getCLOSE_THIS', 'getCLOSE_OTHERS', 'getCLOSE_SAVED', 'getCLOSE_ALL',
      'getRENAME', 'getCOPY_PATH', 'getSHOW_IN_FOLDER'
    ]
    for (const name of factories) {
      expect(typeof mod[name]).toBe('function')
      const item = mod[name]()
      expect(item).toHaveProperty('label')
      expect(item).toHaveProperty('id')
    }
  })

  it('exports HANDLERS map with correct ids', async () => {
    const { HANDLERS } = await import('@/contextMenu/tabs/menuItems.js')
    const expectedIds = [
      'closeThisTab', 'closeOtherTabs', 'closeSavedTabs',
      'closeAllTabs', 'renameFile', 'copyPath', 'showInFolder'
    ]
    for (const id of expectedIds) {
      expect(typeof HANDLERS[id]).toBe('function')
    }
  })

  it('handler closeThisTab calls bus emit', async () => {
    const bus = (await import('@/bus')).default
    const { HANDLERS } = await import('@/contextMenu/tabs/menuItems.js')
    HANDLERS.closeThisTab('tab-1')
    expect(bus.emit).toHaveBeenCalledWith('TABS::close-this', 'tab-1')
  })

  it('handler closeSavedTabs works without tab id', async () => {
    const bus = (await import('@/bus')).default
    const { HANDLERS } = await import('@/contextMenu/tabs/menuItems.js')
    HANDLERS.closeSavedTabs()
    expect(bus.emit).toHaveBeenCalledWith('TABS::close-saved')
  })

  it('exports backward-compatible constant specs', async () => {
    const mod = await import('@/contextMenu/tabs/menuItems.js')
    const constants = ['CLOSE_THIS', 'CLOSE_OTHERS', 'CLOSE_SAVED', 'CLOSE_ALL', 'RENAME', 'COPY_PATH', 'SHOW_IN_FOLDER']
    for (const name of constants) {
      expect(mod[name]).toHaveProperty('label')
      expect(mod[name]).toHaveProperty('id')
    }
  })
})
