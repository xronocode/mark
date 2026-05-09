import { defineStore } from 'pinia'
import bus from '../bus'
import { useLayoutStore } from './layout'

export const useListenForMainStore = defineStore('listenForMain', {
  state: () => ({}),
  actions: {
    EDITOR_EDIT_ACTION(type) {
      const layoutStore = useLayoutStore()
      if (type === 'findInFolder') {
        layoutStore.SET_LAYOUT({
          rightColumn: 'search',
          showSideBar: true
        })
      }
      bus.emit(type, type)
    },

    /**
     * Path B-clean W6: 5 IPC listeners moved to bootstrap-ipc.js
     * (boot-time registration). Bus subscriptions kept inline since
     * they don't cross IPC. All three actions reduce to no-op aliases
     * for app.vue's existing onMounted calls; deletion in a final
     * post-W6 cleanup pass.
     */
    LISTEN_FOR_EDIT() {
      bus.on('mt::editor-edit-action', (type) => {
        this.EDITOR_EDIT_ACTION(type)
      })
    },

    LISTEN_FOR_SHOW_DIALOG() {
      // no-op; see bootstrap-ipc.js
    },

    LISTEN_FOR_PARAGRAPH_INLINE_STYLE() {
      // no-op; see bootstrap-ipc.js
    }
  }
})
