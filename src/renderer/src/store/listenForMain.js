import { defineStore } from 'pinia'
import bus from '../bus'
import { useLayoutStore } from './layout'

export const useListenForMainStore = defineStore('listenForMain', {
  state: () => ({}),
  actions: {
    LISTEN_FOR_EDIT() {
      const layoutStore = useLayoutStore()
      window.electron.ipcRenderer.on('mt::editor-edit-action', (e, type) => {
        if (type === 'findInFolder') {
          layoutStore.SET_LAYOUT({
            rightColumn: 'search',
            showSideBar: true
          })
        }
        bus.emit(type, type)
      })
    },

    LISTEN_FOR_SHOW_DIALOG() {
      window.electron.ipcRenderer.on('mt::about-dialog', () => {
        bus.emit('aboutDialog')
      })
      window.electron.ipcRenderer.on('mt::show-export-dialog', (e, type) => {
        bus.emit('showExportDialog', type)
      })
    },

    LISTEN_FOR_PARAGRAPH_INLINE_STYLE() {
      window.electron.ipcRenderer.on('mt::editor-paragraph-action', (e, { type }) => {
        bus.emit('paragraph', type)
      })
      window.electron.ipcRenderer.on('mt::editor-format-action', (e, { type }) => {
        bus.emit('format', type)
      })
    }
  }
})
