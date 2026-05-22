vi.mock('@/bus', () => ({
  default: { on: vi.fn(), off: vi.fn(), emit: vi.fn() }
}))

describe('contextMenu/tabs/actions.js', () => {
  let bus

  beforeEach(async () => {
    bus = (await import('@/bus')).default
  })

  it('closeThis emits TABS::close-this with tabId', async () => {
    const { closeThis } = await import('@/contextMenu/tabs/actions.js')
    closeThis('tab-1')
    expect(bus.emit).toHaveBeenCalledWith('TABS::close-this', 'tab-1')
  })

  it('closeOthers emits TABS::close-others with tabId', async () => {
    const { closeOthers } = await import('@/contextMenu/tabs/actions.js')
    closeOthers('tab-1')
    expect(bus.emit).toHaveBeenCalledWith('TABS::close-others', 'tab-1')
  })

  it('closeSaved emits TABS::close-saved', async () => {
    const { closeSaved } = await import('@/contextMenu/tabs/actions.js')
    closeSaved()
    expect(bus.emit).toHaveBeenCalledWith('TABS::close-saved')
  })

  it('closeAll emits TABS::close-all', async () => {
    const { closeAll } = await import('@/contextMenu/tabs/actions.js')
    closeAll()
    expect(bus.emit).toHaveBeenCalledWith('TABS::close-all')
  })

  it('rename emits TABS::rename with tabId', async () => {
    const { rename } = await import('@/contextMenu/tabs/actions.js')
    rename('tab-1')
    expect(bus.emit).toHaveBeenCalledWith('TABS::rename', 'tab-1')
  })

  it('copyPath emits TABS::copy-path with tabId', async () => {
    const { copyPath } = await import('@/contextMenu/tabs/actions.js')
    copyPath('tab-1')
    expect(bus.emit).toHaveBeenCalledWith('TABS::copy-path', 'tab-1')
  })

  it('showInFolder emits TABS::show-in-folder with tabId', async () => {
    const { showInFolder } = await import('@/contextMenu/tabs/actions.js')
    showInFolder('tab-1')
    expect(bus.emit).toHaveBeenCalledWith('TABS::show-in-folder', 'tab-1')
  })
})
