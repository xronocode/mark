vi.mock('@/bus', () => ({
  default: { on: vi.fn(), off: vi.fn(), emit: vi.fn() }
}))

vi.mock('@/i18n', () => ({
  t: vi.fn((key) => key)
}))

describe('contextMenu/tabs/index.js', () => {
  it('exports showContextMenu function', async () => {
    const mod = await import('@/contextMenu/tabs/index.js')
    expect(typeof mod.showContextMenu).toBe('function')
  })

  it('showContextMenu invokes ipcRenderer.invoke', async () => {
    const { showContextMenu } = await import('@/contextMenu/tabs/index.js')
    const event = { clientX: 50, clientY: 100 }
    const tab = { id: 'tab-1', pathname: '/tmp/test.md' }

    window.electron.ipcRenderer.invoke.mockResolvedValueOnce(null)

    await showContextMenu(event, tab)

    expect(window.electron.ipcRenderer.invoke).toHaveBeenCalledWith(
      'mt::window-popup-context-menu',
      expect.objectContaining({
        items: expect.any(Array),
        x: 50,
        y: 100
      })
    )
  })

  it('disables rename/copyPath/showInFolder when tab has no pathname', async () => {
    const { showContextMenu } = await import('@/contextMenu/tabs/index.js')
    const event = { clientX: 0, clientY: 0 }
    const tab = { id: 'tab-1', pathname: '' }

    window.electron.ipcRenderer.invoke.mockResolvedValueOnce(null)

    await showContextMenu(event, tab)

    const call = window.electron.ipcRenderer.invoke.mock.calls[0]
    const items = call[1].items
    const renameItem = items.find((item) => item.id === 'renameFile')
    const copyPathItem = items.find((item) => item.id === 'copyPath')
    const showInFolderItem = items.find((item) => item.id === 'showInFolder')
    expect(renameItem.enabled).toBe(false)
    expect(copyPathItem.enabled).toBe(false)
    expect(showInFolderItem.enabled).toBe(false)
  })
})
