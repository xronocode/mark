import { defineStore } from 'pinia'
import bus from '../bus'

export const useListenForMainStore = defineStore('listenForMain', {
  state: () => ({}),
  actions: {
    EDITOR_EDIT_ACTION(type) {
      if (type === 'findInFolder') {
        bus.emit('projectSearch')
        return
      }
      bus.emit(type, type)
    },

    /**
     * IPC listeners live in bootstrap-ipc.js (boot-time registration).
     * Bus subscription kept inline since it doesn't cross IPC.
     */
    LISTEN_FOR_EDIT() {
      bus.on('mt::editor-edit-action', (type) => {
        this.EDITOR_EDIT_ACTION(type)
      })
    }
  }
})
