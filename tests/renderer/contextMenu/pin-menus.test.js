// FILE: tests/renderer/contextMenu/pin-menus.test.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: C-51 T-002 unit tests for the Pin/Unpin context-menu items — label factories, handler dispatch, and the sidebar menu spec (item present for Markdown files only, labelled by pinned state).
//   SCOPE: contextMenu/sideBar/{menuItems,index,actions} and contextMenu/tabs/{menuItems,actions} exports over the mocked i18n t (key passthrough) and ipcRenderer invoke.
//   DEPENDS: src/renderer/src/contextMenu/**, src/renderer/src/store/pinned, tests/renderer/setup.ts window.electron shim.
//   LINKS: .grace/changes/archive/C-51 T-002; .grace/verification/runtime.xml V-M-011.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   POPUP_CHANNEL - IPC channel the native context menus go through.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - 2026-10-16 C-51 T-002: initial tests.
// END_CHANGE_SUMMARY

import { setupTestPinia } from '../pinia'

const POPUP_CHANNEL = 'mt::window-popup-context-menu'

vi.mock('@/i18n', () => ({ t: (key) => key, setLanguage: vi.fn() }))
vi.mock('@/bus', () => ({
  default: { on: vi.fn(), off: vi.fn(), emit: vi.fn() }
}))
vi.mock('@/services/notification', () => ({
  default: { notify: vi.fn() }
}))

describe('contextMenu pin items (C-51 T-002)', () => {
  let bus

  const lastPopupItems = () => {
    const calls = window.electron.ipcRenderer.invoke.mock.calls.filter(
      (c) => c[0] === POPUP_CHANNEL
    )
    return calls.length ? calls[calls.length - 1][1].items : []
  }

  beforeEach(async () => {
    setupTestPinia()
    window.electron.ipcRenderer.invoke.mockReset()
    window.electron.ipcRenderer.invoke.mockResolvedValue(undefined)
    bus = (await import('@/bus')).default
    bus.emit.mockClear()
  })

  describe('sideBar menu', () => {
    it('getPIN labels by pinned state', async () => {
      const { getPIN } = await import('@/contextMenu/sideBar/menuItems')
      expect(getPIN(false)).toEqual({ label: 'contextMenu.sideBar.pin', id: 'pinFileMenuItem' })
      expect(getPIN(true)).toEqual({ label: 'contextMenu.sideBar.unpin', id: 'pinFileMenuItem' })
    })

    it('includes Pin for Markdown files and omits it for folders', async () => {
      const { showContextMenu } = await import('@/contextMenu/sideBar')
      const event = { clientX: 1, clientY: 2 }

      await showContextMenu(event, false, { isMarkdownFile: true, isPinned: false })
      const fileItems = lastPopupItems()
      expect(fileItems).toContainEqual({ label: 'contextMenu.sideBar.pin', id: 'pinFileMenuItem' })

      await showContextMenu(event, false)
      const folderItems = lastPopupItems()
      expect(folderItems.some((i) => i.id === 'pinFileMenuItem')).toBe(false)
    })

    it('HANDLERS.pinFileMenuItem emits SIDEBAR::pin-file', async () => {
      const { HANDLERS } = await import('@/contextMenu/sideBar/menuItems')
      HANDLERS.pinFileMenuItem()
      expect(bus.emit).toHaveBeenCalledWith('SIDEBAR::pin-file')
    })
  })

  describe('tabs menu', () => {
    it('getPIN labels by pinned state', async () => {
      const { getPIN } = await import('@/contextMenu/tabs/menuItems')
      expect(getPIN(false)).toEqual({ label: 'contextMenu.tabs.pin', id: 'pinFile' })
      expect(getPIN(true)).toEqual({ label: 'contextMenu.tabs.unpin', id: 'pinFile' })
    })

    it('HANDLERS.pinFile emits TABS::pin-file with the tab id', async () => {
      const { HANDLERS } = await import('@/contextMenu/tabs/menuItems')
      HANDLERS.pinFile('tab-7')
      expect(bus.emit).toHaveBeenCalledWith('TABS::pin-file', 'tab-7')
    })

    it('showContextMenu includes the Pin item for saved tabs and keys the label on the pinned store', async () => {
      const { usePinnedStore } = await import('@/store/pinned')
      const pinnedStore = usePinnedStore()
      pinnedStore.pinnedFiles = ['/tmp/saved.md']

      const { showContextMenu } = await import('@/contextMenu/tabs')
      await showContextMenu({ clientX: 0, clientY: 0 }, { id: 't1', pathname: '/tmp/saved.md' })
      const items = lastPopupItems()
      const pin = items.find((i) => i.id === 'pinFile')
      expect(pin).toEqual({ label: 'contextMenu.tabs.unpin', id: 'pinFile', enabled: true })

      // untitled tab → item disabled (still present, matching RENAME etc.)
      await showContextMenu({ clientX: 0, clientY: 0 }, { id: 't2', pathname: '' })
      const untitled = lastPopupItems().find((i) => i.id === 'pinFile')
      expect(untitled.enabled).toBe(false)
    })
  })
})
