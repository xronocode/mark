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
  // Path B-clean W6: Tauri Window API direct call. Backend stub
  // mt_request_window_content_size was a known no-op (deferred to
  // F-WINDOW-AUTO-RESIZE); auto-snap-on-toggle stays disabled per
  // that follow-up — but the IPC compat layer is gone.
  try {
    const { getCurrentWindow, LogicalSize } = await import('@tauri-apps/api/window')
    const win = getCurrentWindow()
    const size = await win.outerSize()
    // Preserve current height; only widen to ideal. Caller flags
    // showSideBar=false → narrows back. Skip if user has disabled
    // auto-resize (mirrors v1 main-process gating).
    void LogicalSize // import kept for future use; current impl uses outerSize+setSize
    // For alpha we keep this conservative: log intent only. F-WINDOW-AUTO-RESIZE
    // will wire actual setSize once Stage Manager interaction is cleared.
    void size
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
        // Path B-clean W6: mt::update-sidebar-menu was a known stub
        // (F-MENU-WIRE-TAURI-RECENT). Persistence happens via prefs
        // broadcast below; native menu sync waits for that follow-up.
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
     * Path B-clean W6: 2 IPC listeners moved to bootstrap-ipc.js
     * (mt::set-view-layout + mt::toggle-view-layout-entry — both
     * were menu-driven layout sync events that had no Rust emitter
     * shipped, so they were dormant; kept for future menu wiring).
     * Bus subscription stays inline.
     */
    LISTEN_FOR_LAYOUT() {
      bus.on('view:toggle-layout-entry', (entryName) => {
        this.TOGGLE_LAYOUT_ENTRY(entryName)
        // mt::view-layout-changed persists layout state via legacy
        // mt_view_layout_changed Rust command. Kept on legacy
        // ipcRenderer.send because backend command still exists in
        // m_v1_compat.rs and works; W6 disassembly would migrate it
        // to a canonical module but that's an invasive move out of
        // scope for the renderer-clean wave.
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
