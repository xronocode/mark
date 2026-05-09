import { defineStore } from 'pinia'
import bus from '../bus'
import { usePreferencesStore } from './preferences'

const width = localStorage.getItem('side-bar-width')
const sideBarWidth = typeof +width === 'number' ? Math.max(+width, 220) : 280

// V-A5-2: comfortable editor content width. Final window content width is
// computed as `EDITOR_IDEAL_CONTENT_WIDTH + (showSideBar ? sideBarWidth : 0)`.
// Tuned for ~80-char prose lines plus chrome and scrollbar breathing room.
const EDITOR_IDEAL_CONTENT_WIDTH = 820

async function requestWindowResize (state) {
  const sidebarPart = state.showSideBar ? state.sideBarWidth : 0
  const targetWidth = sidebarPart + EDITOR_IDEAL_CONTENT_WIDTH
  // eslint-disable-next-line no-console
  console.debug(`[Layout][TOGGLE_LAYOUT_ENTRY][BLOCK_REQUEST_RESIZE] showSideBar=${state.showSideBar} sidebarPart=${sidebarPart} targetWidth=${targetWidth}`)
  // Logging stub: the actual win.setSize(new LogicalSize(...)) call is gated
  // behind F-WINDOW-AUTO-RESIZE. We still touch the window handle here so
  // shim wiring is exercised and any Tauri-side regression surfaces early.
  // Auto-snap-on-toggle stays disabled until Stage-Manager interaction is
  // cleared per that follow-up.
  try {
    const { getCurrentWindow } = await import('@tauri-apps/api/window')
    const win = getCurrentWindow()
    await win.outerSize()
  } catch (e) {
    console.warn('[layout] requestWindowResize failed', e)
  }
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
        // mt::update-sidebar-menu is a known stub (F-MENU-WIRE-TAURI-RECENT).
        // Persistence happens via the prefs broadcast below; native menu
        // sync waits for that follow-up.
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
    /**
     * Two IPC listeners (mt::set-view-layout + mt::toggle-view-layout-entry)
     * were menu-driven layout sync events that had no Rust emitter shipped,
     * so they were dormant; their bootstrap subscriptions live in
     * bootstrap-ipc.js, kept for future menu wiring. The bus subscription
     * stays inline here.
     */
    LISTEN_FOR_LAYOUT() {
      bus.on('view:toggle-layout-entry', (entryName) => {
        this.TOGGLE_LAYOUT_ENTRY(entryName)
        // mt::view-layout-changed persists layout state via the v1-compat
        // mt_view_layout_changed Rust command (m_v1_compat.rs). We stay on
        // the ipcRenderer shim because the backend command lives in the
        // compat layer and is not surfaced through the canonical M-013a
        // typed contract; migration to ipcInvoke would require adding a
        // v1-compat command to the canonical surface.
        const { windowId } = window.marktext.env
        window.electron.ipcRenderer.send('mt::view-layout-changed', windowId, {
          [entryName]: this[entryName]
        })
      })
    },

    DISPATCH_LAYOUT_MENU_ITEMS() {
      const { windowId } = window.marktext.env
      const { showTabBar, showSideBar } = this
      // Same as above — legacy ipcRenderer.send to mt_view_layout_changed.
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
