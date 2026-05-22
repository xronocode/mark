/**
 * Deep coverage tests for contextMenu/tabs/
 *
 * Targets uncovered branches:
 *   - showContextMenu: handler dispatch when clickedId is valid
 *   - showContextMenu: handler dispatch when clickedId is null (no selection)
 *   - HANDLERS: each handler calls the correct action with tabId
 */

vi.mock('@/bus', () => ({
  default: { on: vi.fn(), off: vi.fn(), emit: vi.fn() }
}))

vi.mock('@/i18n', () => ({
  t: vi.fn((key) => key)
}))

describe('contextMenu/tabs — deep coverage', () => {
  describe('showContextMenu handler dispatch', () => {
    it('calls the correct handler when a valid clickedId is returned', async () => {
      const bus = (await import('@/bus')).default
      const { showContextMenu } = await import('@/contextMenu/tabs/index.js')

      const event = { clientX: 10, clientY: 20 }
      const tab = { id: 'tab-42', pathname: '/tmp/test.md' }

      // Simulate user clicking "closeThisTab"
      window.electron.ipcRenderer.invoke.mockResolvedValueOnce('closeThisTab')

      await showContextMenu(event, tab)

      expect(bus.emit).toHaveBeenCalledWith('TABS::close-this', 'tab-42')
    })

    it('does not call any handler when clickedId is null', async () => {
      const bus = (await import('@/bus')).default
      bus.emit.mockClear()
      const { showContextMenu } = await import('@/contextMenu/tabs/index.js')

      const event = { clientX: 10, clientY: 20 }
      const tab = { id: 'tab-42', pathname: '/tmp/test.md' }

      window.electron.ipcRenderer.invoke.mockResolvedValueOnce(null)

      await showContextMenu(event, tab)

      // bus.emit should NOT have been called with any TABS:: event
      const tabsCalls = bus.emit.mock.calls.filter(c => c[0].startsWith('TABS::'))
      expect(tabsCalls).toHaveLength(0)
    })

    it('does not call any handler when clickedId is unknown', async () => {
      const bus = (await import('@/bus')).default
      bus.emit.mockClear()
      const { showContextMenu } = await import('@/contextMenu/tabs/index.js')

      window.electron.ipcRenderer.invoke.mockResolvedValueOnce('unknownAction')

      await showContextMenu({ clientX: 0, clientY: 0 }, { id: 'x', pathname: '' })

      const tabsCalls = bus.emit.mock.calls.filter(c => c[0].startsWith('TABS::'))
      expect(tabsCalls).toHaveLength(0)
    })

    it('dispatches closeOtherTabs handler', async () => {
      const bus = (await import('@/bus')).default
      const { showContextMenu } = await import('@/contextMenu/tabs/index.js')

      window.electron.ipcRenderer.invoke.mockResolvedValueOnce('closeOtherTabs')
      await showContextMenu({ clientX: 0, clientY: 0 }, { id: 'tab-1', pathname: '/a.md' })

      expect(bus.emit).toHaveBeenCalledWith('TABS::close-others', 'tab-1')
    })

    it('dispatches renameFile handler', async () => {
      const bus = (await import('@/bus')).default
      const { showContextMenu } = await import('@/contextMenu/tabs/index.js')

      window.electron.ipcRenderer.invoke.mockResolvedValueOnce('renameFile')
      await showContextMenu({ clientX: 0, clientY: 0 }, { id: 'tab-1', pathname: '/a.md' })

      expect(bus.emit).toHaveBeenCalledWith('TABS::rename', 'tab-1')
    })

    it('dispatches copyPath handler', async () => {
      const bus = (await import('@/bus')).default
      const { showContextMenu } = await import('@/contextMenu/tabs/index.js')

      window.electron.ipcRenderer.invoke.mockResolvedValueOnce('copyPath')
      await showContextMenu({ clientX: 0, clientY: 0 }, { id: 'tab-1', pathname: '/a.md' })

      expect(bus.emit).toHaveBeenCalledWith('TABS::copy-path', 'tab-1')
    })

    it('dispatches showInFolder handler', async () => {
      const bus = (await import('@/bus')).default
      const { showContextMenu } = await import('@/contextMenu/tabs/index.js')

      window.electron.ipcRenderer.invoke.mockResolvedValueOnce('showInFolder')
      await showContextMenu({ clientX: 0, clientY: 0 }, { id: 'tab-1', pathname: '/a.md' })

      expect(bus.emit).toHaveBeenCalledWith('TABS::show-in-folder', 'tab-1')
    })

    it('dispatches closeAllTabs handler', async () => {
      const bus = (await import('@/bus')).default
      const { showContextMenu } = await import('@/contextMenu/tabs/index.js')

      window.electron.ipcRenderer.invoke.mockResolvedValueOnce('closeAllTabs')
      await showContextMenu({ clientX: 0, clientY: 0 }, { id: 'tab-1', pathname: '' })

      expect(bus.emit).toHaveBeenCalledWith('TABS::close-all')
    })
  })
})
