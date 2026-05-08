import { createPinia, defineStore } from 'pinia'

const pinia = createPinia()

// Main store for global states
export const useMainStore = defineStore('main', {
  state: () => ({
    platform: window.electron.process.platform, // platform of system `darwin` | `win32` | `linux`
    appVersion: window.electron.process.env.MARKTEXT_VERSION_STRING, // Mark version string
    windowActive: true, // whether current window is active or focused
    init: false // whether Mark is initialized
  }),

  getters: {
    // Add any getters here if needed
  },

  actions: {
    SET_WIN_STATUS(status) {
      this.windowActive = status
    },

    SET_INITIALIZED() {
      this.init = true
    },

    /**
     * Path B-clean W1: cross-window focus/blur listener moved to
     * src/renderer/src/bootstrap-ipc.js (registered ONCE at boot).
     * This action is kept as a no-op alias for app.vue's existing
     * `mainStore.LISTEN_WIN_STATUS()` call so the diff stays small.
     * Will be deleted in W4 wave when app.vue's onMounted IPC list is
     * cleaned up.
     */
    LISTEN_WIN_STATUS() {
      // no-op; see bootstrap-ipc.js
    }
  }
})

export default pinia
