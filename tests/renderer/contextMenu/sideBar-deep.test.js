/**
 * Deep coverage tests for contextMenu/sideBar/
 *
 * Targets uncovered branches:
 *   - showContextMenu: handler dispatch when clickedId is valid
 *   - showContextMenu: handler dispatch when clickedId is null
 *   - HANDLERS: each handler calls the correct action
 *   - All sidebar actions emit correct bus events
 */

vi.mock('@/bus', () => ({
  default: { on: vi.fn(), off: vi.fn(), emit: vi.fn() }
}))

vi.mock('@/i18n', () => ({
  t: vi.fn((key) => key)
}))

describe('contextMenu/sideBar — deep coverage', () => {
  describe('showContextMenu handler dispatch', () => {
    it('dispatches newFileMenuItem handler', async () => {
      const bus = (await import('@/bus')).default
      const { showContextMenu } = await import('@/contextMenu/sideBar/index.js')

      window.electron.ipcRenderer.invoke.mockResolvedValueOnce('newFileMenuItem')
      await showContextMenu({ clientX: 0, clientY: 0 }, true)

      expect(bus.emit).toHaveBeenCalledWith('SIDEBAR::new', 'file')
    })

    it('dispatches newDirectoryMenuItem handler', async () => {
      const bus = (await import('@/bus')).default
      const { showContextMenu } = await import('@/contextMenu/sideBar/index.js')

      window.electron.ipcRenderer.invoke.mockResolvedValueOnce('newDirectoryMenuItem')
      await showContextMenu({ clientX: 0, clientY: 0 }, true)

      expect(bus.emit).toHaveBeenCalledWith('SIDEBAR::new', 'directory')
    })

    it('dispatches copyMenuItem handler', async () => {
      const bus = (await import('@/bus')).default
      const { showContextMenu } = await import('@/contextMenu/sideBar/index.js')

      window.electron.ipcRenderer.invoke.mockResolvedValueOnce('copyMenuItem')
      await showContextMenu({ clientX: 0, clientY: 0 }, true)

      expect(bus.emit).toHaveBeenCalledWith('SIDEBAR::copy-cut', 'copy')
    })

    it('dispatches cutMenuItem handler', async () => {
      const bus = (await import('@/bus')).default
      const { showContextMenu } = await import('@/contextMenu/sideBar/index.js')

      window.electron.ipcRenderer.invoke.mockResolvedValueOnce('cutMenuItem')
      await showContextMenu({ clientX: 0, clientY: 0 }, true)

      expect(bus.emit).toHaveBeenCalledWith('SIDEBAR::copy-cut', 'cut')
    })

    it('dispatches pasteMenuItem handler', async () => {
      const bus = (await import('@/bus')).default
      const { showContextMenu } = await import('@/contextMenu/sideBar/index.js')

      window.electron.ipcRenderer.invoke.mockResolvedValueOnce('pasteMenuItem')
      await showContextMenu({ clientX: 0, clientY: 0 }, true)

      expect(bus.emit).toHaveBeenCalledWith('SIDEBAR::paste')
    })

    it('dispatches renameMenuItem handler', async () => {
      const bus = (await import('@/bus')).default
      const { showContextMenu } = await import('@/contextMenu/sideBar/index.js')

      window.electron.ipcRenderer.invoke.mockResolvedValueOnce('renameMenuItem')
      await showContextMenu({ clientX: 0, clientY: 0 }, true)

      expect(bus.emit).toHaveBeenCalledWith('SIDEBAR::rename')
    })

    it('dispatches deleteMenuItem handler', async () => {
      const bus = (await import('@/bus')).default
      const { showContextMenu } = await import('@/contextMenu/sideBar/index.js')

      window.electron.ipcRenderer.invoke.mockResolvedValueOnce('deleteMenuItem')
      await showContextMenu({ clientX: 0, clientY: 0 }, true)

      expect(bus.emit).toHaveBeenCalledWith('SIDEBAR::remove')
    })

    it('dispatches showInFolderMenuItem handler', async () => {
      const bus = (await import('@/bus')).default
      const { showContextMenu } = await import('@/contextMenu/sideBar/index.js')

      window.electron.ipcRenderer.invoke.mockResolvedValueOnce('showInFolderMenuItem')
      await showContextMenu({ clientX: 0, clientY: 0 }, true)

      expect(bus.emit).toHaveBeenCalledWith('SIDEBAR::show-in-folder')
    })

    it('does nothing when clickedId is null', async () => {
      const bus = (await import('@/bus')).default
      bus.emit.mockClear()
      const { showContextMenu } = await import('@/contextMenu/sideBar/index.js')

      window.electron.ipcRenderer.invoke.mockResolvedValueOnce(null)
      await showContextMenu({ clientX: 0, clientY: 0 }, false)

      const sidebarCalls = bus.emit.mock.calls.filter(c => c[0].startsWith('SIDEBAR::'))
      expect(sidebarCalls).toHaveLength(0)
    })

    it('does nothing when clickedId is unknown', async () => {
      const bus = (await import('@/bus')).default
      bus.emit.mockClear()
      const { showContextMenu } = await import('@/contextMenu/sideBar/index.js')

      window.electron.ipcRenderer.invoke.mockResolvedValueOnce('nonexistent')
      await showContextMenu({ clientX: 0, clientY: 0 }, false)

      const sidebarCalls = bus.emit.mock.calls.filter(c => c[0].startsWith('SIDEBAR::'))
      expect(sidebarCalls).toHaveLength(0)
    })
  })

  describe('sideBar actions directly', () => {
    it('newFile emits SIDEBAR::new file', async () => {
      const bus = (await import('@/bus')).default
      const { newFile } = await import('@/contextMenu/sideBar/actions.js')
      newFile()
      expect(bus.emit).toHaveBeenCalledWith('SIDEBAR::new', 'file')
    })

    it('newDirectory emits SIDEBAR::new directory', async () => {
      const bus = (await import('@/bus')).default
      const { newDirectory } = await import('@/contextMenu/sideBar/actions.js')
      newDirectory()
      expect(bus.emit).toHaveBeenCalledWith('SIDEBAR::new', 'directory')
    })

    it('copy emits SIDEBAR::copy-cut copy', async () => {
      const bus = (await import('@/bus')).default
      const { copy } = await import('@/contextMenu/sideBar/actions.js')
      copy()
      expect(bus.emit).toHaveBeenCalledWith('SIDEBAR::copy-cut', 'copy')
    })

    it('cut emits SIDEBAR::copy-cut cut', async () => {
      const bus = (await import('@/bus')).default
      const { cut } = await import('@/contextMenu/sideBar/actions.js')
      cut()
      expect(bus.emit).toHaveBeenCalledWith('SIDEBAR::copy-cut', 'cut')
    })

    it('paste emits SIDEBAR::paste', async () => {
      const bus = (await import('@/bus')).default
      const { paste } = await import('@/contextMenu/sideBar/actions.js')
      paste()
      expect(bus.emit).toHaveBeenCalledWith('SIDEBAR::paste')
    })

    it('rename emits SIDEBAR::rename', async () => {
      const bus = (await import('@/bus')).default
      const { rename } = await import('@/contextMenu/sideBar/actions.js')
      rename()
      expect(bus.emit).toHaveBeenCalledWith('SIDEBAR::rename')
    })

    it('remove emits SIDEBAR::remove', async () => {
      const bus = (await import('@/bus')).default
      const { remove } = await import('@/contextMenu/sideBar/actions.js')
      remove()
      expect(bus.emit).toHaveBeenCalledWith('SIDEBAR::remove')
    })

    it('showInFolder emits SIDEBAR::show-in-folder', async () => {
      const bus = (await import('@/bus')).default
      const { showInFolder } = await import('@/contextMenu/sideBar/actions.js')
      showInFolder()
      expect(bus.emit).toHaveBeenCalledWith('SIDEBAR::show-in-folder')
    })
  })

  describe('sideBar menuItems', () => {
    it('HANDLERS map covers all menu item ids', async () => {
      const { HANDLERS } = await import('@/contextMenu/sideBar/menuItems.js')
      const expectedIds = [
        'newFileMenuItem', 'newDirectoryMenuItem', 'copyMenuItem', 'cutMenuItem',
        'pasteMenuItem', 'renameMenuItem', 'deleteMenuItem', 'showInFolderMenuItem'
      ]
      for (const id of expectedIds) {
        expect(typeof HANDLERS[id]).toBe('function')
      }
    })

    it('backward-compat constants have label and id', async () => {
      const mod = await import('@/contextMenu/sideBar/menuItems.js')
      const constants = ['NEW_FILE', 'NEW_DIRECTORY', 'COPY', 'CUT', 'PASTE', 'RENAME', 'DELETE', 'SHOW_IN_FOLDER']
      for (const name of constants) {
        expect(mod[name]).toHaveProperty('label')
        expect(mod[name]).toHaveProperty('id')
      }
    })
  })
})
