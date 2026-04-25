import { defineStore } from 'pinia'
import bus from '../bus'
import { usePreferencesStore } from './preferences'

const width = localStorage.getItem('side-bar-width')
const sideBarWidth = typeof +width === 'number' ? Math.max(+width, 220) : 280

// V-A5-2: comfortable editor content width. Final window content width is
// computed as `EDITOR_IDEAL_CONTENT_WIDTH + (showSideBar ? sideBarWidth : 0)`.
// Tuned for ~80-char prose lines plus chrome and scrollbar breathing room.
const EDITOR_IDEAL_CONTENT_WIDTH = 820

function requestWindowResize (state) {
  const sidebarPart = state.showSideBar ? state.sideBarWidth : 0
  const targetWidth = sidebarPart + EDITOR_IDEAL_CONTENT_WIDTH
  // eslint-disable-next-line no-console
  console.debug(`[Layout][TOGGLE_LAYOUT_ENTRY][BLOCK_REQUEST_RESIZE] showSideBar=${state.showSideBar} sidebarPart=${sidebarPart} targetWidth=${targetWidth}`)
  window.electron.ipcRenderer.send('mt::request-window-content-size', { width: targetWidth })
}

export const useLayoutStore = defineStore('layout', {
  state: () => ({
    rightColumn: 'files',
    showSideBar: false,
    showTabBar: false,
    sideBarWidth
  }),
  actions: {
    SET_LAYOUT(layout) {
      if (layout.showSideBar !== undefined) {
        const { windowId } = global.marktext.env
        window.electron.ipcRenderer.send('mt::update-sidebar-menu', windowId, !!layout.showSideBar)
        const preferencesStore = usePreferencesStore()
        preferencesStore.SET_SINGLE_PREFERENCE({
          type: 'sideBarVisibility',
          value: !!layout.showSideBar
        })
      }
      Object.assign(this, layout)
    },
    TOGGLE_LAYOUT_ENTRY(entryName) {
      this[entryName] = !this[entryName]
      if (entryName === 'showSideBar') {
        const preferencesStore = usePreferencesStore()
        preferencesStore.SET_SINGLE_PREFERENCE({
          type: 'sideBarVisibility',
          value: !!this.showSideBar
        })
        requestWindowResize(this)
      }
    },

    REQUEST_INITIAL_WINDOW_RESIZE() {
      // Called once after editor bootstrap so window snaps to ideal width.
      // Main process gates on `autoSnapWindowWidth` preference + window
      // state, so this is safe to call unconditionally.
      requestWindowResize(this)
    },
    SET_SIDE_BAR_WIDTH(width) {
      // TODO: Add side bar to session (GH#732).
      localStorage.setItem('side-bar-width', Math.max(+width, 220))
      this.sideBarWidth = width
    },
    LISTEN_FOR_LAYOUT() {
      window.electron.ipcRenderer.on('mt::set-view-layout', (e, layout) => {
        if (layout.rightColumn) {
          this.SET_LAYOUT({
            ...layout,
            rightColumn: layout.rightColumn === this.rightColumn ? '' : layout.rightColumn,
            showSideBar: true
          })
        } else {
          this.SET_LAYOUT(layout)
        }
        this.DISPATCH_LAYOUT_MENU_ITEMS()
      })

      window.electron.ipcRenderer.on('mt::toggle-view-layout-entry', (event, entryName) => {
        this.TOGGLE_LAYOUT_ENTRY(entryName)
        this.DISPATCH_LAYOUT_MENU_ITEMS()
      })

      bus.on('view:toggle-layout-entry', (entryName) => {
        this.TOGGLE_LAYOUT_ENTRY(entryName)
        const { windowId } = global.marktext.env
        window.electron.ipcRenderer.send('mt::view-layout-changed', windowId, {
          [entryName]: this[entryName]
        })
      })
    },

    DISPATCH_LAYOUT_MENU_ITEMS() {
      const { windowId } = global.marktext.env
      const { showTabBar, showSideBar } = this
      window.electron.ipcRenderer.send('mt::view-layout-changed', windowId, {
        showTabBar,
        showSideBar
      })
    },

    CHANGE_SIDE_BAR_WIDTH(width) {
      this.SET_SIDE_BAR_WIDTH(width)
    }
  }
})
