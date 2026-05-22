vi.mock('@/bus', () => ({
  default: { on: vi.fn(), off: vi.fn(), emit: vi.fn() }
}))

vi.mock('@/i18n', () => ({
  t: vi.fn((key) => key)
}))

describe('contextMenu/sideBar/index.js', () => {
  it('exports showContextMenu function', async () => {
    const mod = await import('@/contextMenu/sideBar/index.js')
    expect(typeof mod.showContextMenu).toBe('function')
  })

  it('showContextMenu invokes ipcRenderer.invoke with menu items', async () => {
    const { showContextMenu } = await import('@/contextMenu/sideBar/index.js')
    const event = { clientX: 100, clientY: 200 }

    window.electron.ipcRenderer.invoke.mockResolvedValueOnce(null)

    await showContextMenu(event, true)

    expect(window.electron.ipcRenderer.invoke).toHaveBeenCalledWith(
      'mt::window-popup-context-menu',
      expect.objectContaining({
        items: expect.any(Array),
        x: 100,
        y: 200
      })
    )
  })

  it('disables paste when hasPathCache is false', async () => {
    const { showContextMenu } = await import('@/contextMenu/sideBar/index.js')
    const event = { clientX: 0, clientY: 0 }

    window.electron.ipcRenderer.invoke.mockResolvedValueOnce(null)

    await showContextMenu(event, false)

    const call = window.electron.ipcRenderer.invoke.mock.calls[0]
    const items = call[1].items
    const pasteItem = items.find((item) => item.id === 'pasteMenuItem')
    expect(pasteItem.enabled).toBe(false)
  })
})
