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
     * Path B-clean W6: IPC listeners moved to bootstrap-ipc.js
     * (boot-time registration). Bus subscription kept inline since
     * it doesn't cross IPC.
     */
    LISTEN_FOR_EDIT() {
      bus.on('mt::editor-edit-action', (type) => {
        this.EDITOR_EDIT_ACTION(type)
      })
    }
  }
})
