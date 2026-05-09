import equal from 'deep-equal'
import bus from '../bus'
import { hasKeys, getUniqueId, deepClone } from '../util'
import listToTree from '../util/listToTree'
import {
  createDocumentState,
  getOptionsFromState,
  getSingleFileState,
  getBlankFileState
} from './help'
import notice from '../services/notification'
import {
  FileEncodingCommand,
  LineEndingCommand,
  QuickOpenCommand,
  TrailingNewlineCommand
} from '../commands'
import { defineStore } from 'pinia'
import { ElMessageBox } from 'element-plus'
import { usePreferencesStore } from './preferences'
import { useProjectStore } from './project'
import { useLayoutStore } from './layout'
import { useMainStore } from '.'
import { i18n } from '../i18n'

const autoSaveTimers = new Map()

export const useEditorStore = defineStore('editor', {
  state: () => ({
    currentFile: {},
    tabs: [],
    tabIdToIndex: {},
    listToc: [], // Used for equal check and for searching for the correct github-slug to jump to
    toc: []
  }),

  actions: {
    updateTabIdToIndex() {
      this.tabIdToIndex = this.tabs.reduce((map, tab, index) => {
        map[tab.id] = index
        return map
      }, {})
    },

    /**
     * Copies the specified heading's github-slug to the clipboard.
     * @param {string} id The heading-id to copy.
     */
    copyGithubSlug(key) {
      const item = this.listToc.find((i) => i.slug === key)

      if (item) {
        window.electron.clipboard.writeText(`#${item.githubSlug}`)
        notice.notify({
          title: i18n.global.t('store.editor.anchorLinkCopied'),
          type: 'primary',
          time: 2000,
          showConfirm: false
        })
      } else {
        console.warn(i18n.global.t('store.editor.tocItemNotFound', { key }))
      }
    },

    /**
     * Update scroll position for the currentFile
     */
    updateScrollPosition(id, scrollTop) {
      if (!(id in this.tabIdToIndex)) {
        console.warn('updateScrollPosition: Cannot find tab index for id:', id)
        return
      }

      this.tabs[this.tabIdToIndex[id]].scrollTop = scrollTop
    },

    /**
     * Push a tab specific notification on stack that never disappears.
     */
    pushTabNotification(data) {
      const defaultAction = () => {}
      const { tabId, msg } = data
      const action = data.action || defaultAction
      const showConfirm = data.showConfirm || false
      const style = data.style || 'info'
      // Whether only one notification should exist.
      const exclusiveType = data.exclusiveType || ''

      const tab = this.tabs.find((t) => t.id === tabId)
      if (!tab) {
        console.error(i18n.global.t('store.editor.tabNotFound'))
        return
      }

      const { notifications } = tab

      // Remove the old notification if only one should exist.
      if (exclusiveType) {
        const index = notifications.findIndex((n) => n.exclusiveType === exclusiveType)
        if (index >= 0) {
          // Reorder current notification
          notifications.splice(index, 1)
        }
      }

      // Push new notification on stack.
      notifications.push({
        msg,
        showConfirm,
        style,
        exclusiveType,
        action
      })
    },

    loadChange(change) {
      const { tabs, currentFile } = this
      const { data, pathname } = change
      const {
        isMixedLineEndings,
        lineEnding,
        adjustLineEndingOnSave,
        trimTrailingNewline,
        encoding,
        markdown,
        filename
      } = data
      const options = { encoding, lineEnding, adjustLineEndingOnSave, trimTrailingNewline }
      // Create a new document and update few entires later.
      const newFileState = getSingleFileState({ markdown, filename, pathname, options })

      const tab = tabs.find((t) => window.fileUtils.isSamePathSync(t.pathname, pathname))
      if (!tab) {
        // The tab may be closed in the meanwhile.
        console.error('loadChange: Cannot find tab in tab list.')
        notice.notify({
          title: i18n.global.t('store.editor.errorLoadingTabTitle'),
          message: i18n.global.t('store.editor.errorLoadingTabMessage'),
          type: 'error',
          time: 20000,
          showConfirm: false
        })
        return
      }

      // Backup few entries that we need to restore later.
      const oldId = tab.id
      const oldNotifications = tab.notifications
      let oldHistory = null
      if (tab.history.index >= 0 && tab.history.stack.length >= 1) {
        // Allow to restore the old document.
        oldHistory = {
          stack: [tab.history.stack[tab.history.index]],
          index: 0
        }

        // Free reference from array
        tab.history.index--
        tab.history.stack.pop()
      }

      // Update file content and restore some entries.
      Object.assign(tab, newFileState)
      tab.id = oldId
      tab.notifications = oldNotifications
      if (oldHistory) {
        tab.history = oldHistory
      }

      if (isMixedLineEndings) {
        this.pushTabNotification({
          tabId: tab.id,
          msg: i18n.global.t('store.editor.mixedLineEndingsNormalized', {
            name: filename,
            lineEnding: lineEnding.toUpperCase()
          }),
          showConfirm: false,
          style: 'info',
          exclusiveType: ''
        })
      }

      // Reload the editor if the tab is currently opened.
      if (pathname === currentFile.pathname) {
        // save current state first
        this.currentFile = tab
        const { id, cursor, history, scrollTop, muyaIndexCursor } = tab // Should not use blocks history as this is loaded from disk
        bus.emit('file-changed', {
          id,
          markdown,
          muyaIndexCursor,
          cursor,
          renderCursor: true,
          history,
          scrollTop
        })
      }
    },

    FORMAT_LINK_CLICK({ data, dirname }) {
      // Check if the link starts with a #, that is a local anchor link.

      if (data.href.length > 0 && data.href[0] === '#') {
        const anchorSlug = data.href.substring(1)
        if (!anchorSlug) return

        // Find the block with the anchor slug from the TOC
        for (const item of this.listToc) {
          if (item.githubSlug === anchorSlug) {
            // Scroll to the corresponding element that matches this github-slug
            bus.emit('scroll-to-header', item.slug)
            return
          }
        }

        return
      }

      window.electron.ipcRenderer.send('mt::format-link-click', { data, dirname })
    },

    // image path auto complement
    ASK_FOR_IMAGE_AUTO_PATH(src) {
      const { pathname } = this.currentFile
      if (pathname) {
        let rs
        const promise = new Promise((resolve) => {
          rs = resolve
        })
        const id = getUniqueId()
        window.electron.ipcRenderer.once(`mt::response-of-image-path-${id}`, (_, files) => {
          rs(files)
        })
        window.electron.ipcRenderer.send('mt::ask-for-image-auto-path', {
          pathname,
          src,
          id,
          currentFile: deepClone(this.currentFile)
        })
        return promise
      } else {
        return Promise.resolve([])
      }
    },

    SEARCH(value) {
      this.currentFile.searchMatches = JSON.parse(JSON.stringify(value)) // deep clone to trigger state changes
    },

    SHOW_IMAGE_DELETION_URL(deletionUrl) {
      notice
        .notify({
          title: i18n.global.t('store.editor.imageDeletionUrlTitle'),
          message: i18n.global.t('store.editor.imageDeletionUrlMessage', { url: deletionUrl }),
          showConfirm: true,
          time: 20000
        })
        .then(() => {
          window.electron.clipboard.writeText(deletionUrl)
        })
    },

    // We need to update line endings menu when changing tabs.
    UPDATE_LINE_ENDING_MENU() {
      const { lineEnding } = this.currentFile
      if (lineEnding) {
        const { windowId } = window.marktext.env
        window.electron.ipcRenderer.send('mt::update-line-ending-menu', windowId, lineEnding)
      }
    },

    /**
     * invoke returns SavedTabState directly. Backend writes the file
     * and returns {id,pathname,filename,isSaved}. Renderer applies
     * state via APPLY_SAVE_OUTCOME — no listener race for the per-tab
     * save ack.
     */
    async FILE_SAVE() {
      const projectStore = useProjectStore()
      const { id, filename, pathname, markdown } = this.currentFile
      const defaultPath = getRootFolderFromState(projectStore)
      if (!id) return
      try {
        const { invoke } = await import('@tauri-apps/api/core')
        const outcome = await invoke('mt_response_file_save', {
          id,
          filename,
          pathname: pathname || null,
          markdown,
          defaultPath: defaultPath || null
        })
        if (outcome) this.APPLY_SAVE_OUTCOME(outcome)
      } catch (e) {
        notice.notify({
          title: i18n.global.t('dialog.saveFailure'),
          message: String(e),
          type: 'error',
          time: 20000,
          showConfirm: false
        })
      }
    },

    /**
     * Applies a SavedTabState ({id, pathname, filename, isSaved})
     * returned from mt_response_file_save / mt_response_file_save_as.
     * Replaces the listener-driven mt::tab-saved + mt::set-pathname
     * update path. Idempotent — also called from the bootstrap-ipc.js
     * batch-save listener for cross-window mt_save_and_close_tabs flow.
     */
    APPLY_SAVE_OUTCOME(outcome) {
      if (!outcome || !outcome.id) return
      const tab = this.tabs.find((t) => t.id === outcome.id)
      if (!tab) return
      // Pathname change (save-as or first save of untitled)
      if (outcome.pathname && outcome.pathname !== tab.pathname) {
        // Drop any existing tab pointing at the same path (overwrite
        // semantics that mt::set-pathname listener used to enforce).
        const existing = this.tabs.find(
          (t) => t.id !== outcome.id && window.fileUtils.isSamePathSync(t.pathname, outcome.pathname)
        )
        if (existing) this.CLOSE_TAB(existing)
        tab.pathname = outcome.pathname
        tab.filename = outcome.filename || tab.filename
        if (outcome.id === this.currentFile.id && outcome.pathname) {
          window.DIRNAME = window.path.dirname(outcome.pathname)
        }
      }
      tab.isSaved = !!outcome.isSaved
      if (
        tab.isSaved &&
        tab.history &&
        tab.history.lastEditIndex >= 0 &&
        tab.history.lastEditIndex < tab.history.stack.length
      ) {
        tab.lastSavedHistoryId = tab.history.stack[tab.history.lastEditIndex].id
      }
    },

    /**
     * IPC listener moved to bootstrap-ipc.js; bus subscription stays
     * inline.
     */
    LISTEN_FOR_SAVE() {
      bus.on('mt::editor-ask-file-save', () => {
        this.FILE_SAVE()
      })
    },

    async FILE_SAVE_AS() {
      const projectStore = useProjectStore()
      const { id, filename, markdown } = this.currentFile
      const defaultPath = getRootFolderFromState(projectStore)
      if (!id) return
      try {
        const { invoke } = await import('@tauri-apps/api/core')
        const outcome = await invoke('mt_response_file_save_as', {
          id,
          filename,
          markdown,
          defaultPath: defaultPath || null
        })
        if (outcome) this.APPLY_SAVE_OUTCOME(outcome)
      } catch (e) {
        notice.notify({
          title: i18n.global.t('dialog.saveFailure'),
          message: String(e),
          type: 'error',
          time: 20000,
          showConfirm: false
        })
      }
    },

    /**
     * IPC listener moved to bootstrap-ipc.js; bus subscription stays
     * inline.
     */
    LISTEN_FOR_SAVE_AS() {
      bus.on('mt::editor-ask-file-save-as', () => {
        this.FILE_SAVE_AS()
      })
    },

    /**
     * Public action — invoked by bootstrap-ipc.js mt::tab-saved
     * listener for cross-window batch-save. Same logic as the inline
     * v1 listener body had.
     */
    APPLY_TAB_SAVED(tabId) {
      const tab = this.tabs.find((f) => f.id === tabId)
      if (
        tab &&
        tab.history &&
        tab.history.lastEditIndex >= 0 &&
        tab.history.lastEditIndex < tab.history.stack.length
      ) {
        tab.lastSavedHistoryId = tab.history.stack[tab.history.lastEditIndex].id
        tab.isSaved = true
      }
    },

    /**
     * Public action — invoked by bootstrap-ipc.js mt::tab-save-failure
     * listener for cross-window batch-save errors. Surfaces user-
     * visible toast + dirties the tab.
     */
    APPLY_TAB_SAVE_FAILURE(tabId, msg) {
      const tab = this.tabs.find((t) => t.id === tabId)
      if (!tab) {
        notice.notify({
          title: i18n.global.t('dialog.saveFailure'),
          message: msg,
          type: 'error',
          time: 20000,
          showConfirm: false
        })
        return
      }
      tab.isSaved = false
      this.pushTabNotification({
        tabId,
        msg: i18n.global.t('store.editor.errorWhileSaving', { msg }),
        style: 'crit'
      })
    },

    LISTEN_FOR_CLOSE() {
      const projectStore = useProjectStore()
      window.electron.ipcRenderer.on('mt::ask-for-close', async () => {
        const unsavedFiles = this.tabs
          .filter((file) => !file.isSaved)
          .map((file) => {
            const { id, filename, pathname, markdown } = file
            const options = getOptionsFromState(file)
            return {
              id,
              filename,
              pathname,
              markdown,
              options,
              defaultPath: getRootFolderFromState(projectStore)
            }
          })

        if (!unsavedFiles.length) {
          window.electron.ipcRenderer.send('mt::close-window')
          return
        }

        // F-LIFECYCLE-WIRE (B4-pre-alpha-step-3): renderer-driven save
        // confirmation dialog. v1.2.3 used the Electron main process
        // for this; in Tauri port the renderer owns the dialog because
        // it already has the dirty-tab state and Element Plus is loaded.
        // Cancel-on-close (X / Escape) keeps the window open so users
        // never lose work to a misclicked close button.
        const tabCount = unsavedFiles.length
        const namedCount = unsavedFiles.filter((f) => f.pathname).length
        const message =
          namedCount === tabCount
            ? `${tabCount} tab${tabCount > 1 ? 's have' : ' has'} unsaved changes. Save them before closing?`
            : `${tabCount} tab${tabCount > 1 ? 's have' : ' has'} unsaved changes. ${tabCount - namedCount} ${tabCount - namedCount > 1 ? 'are' : 'is'} untitled and cannot be auto-saved — Save will commit the named ${namedCount} and discard the rest.`
        try {
          await ElMessageBox.confirm(message, 'Unsaved changes', {
            confirmButtonText: namedCount > 0 ? 'Save & Close' : 'Discard & Close',
            cancelButtonText: "Don't Save",
            type: 'warning',
            distinguishCancelAndClose: true,
            closeOnClickModal: false,
            closeOnPressEscape: true
          })
          // Confirm pressed.
          if (namedCount > 0) {
            // Save first — backend emits force-close-tabs-by-id for
            // successfully-saved IDs (renderer closes those tabs) but
            // does NOT destroy window. We send mt::close-window only
            // after save succeeds; if any save fails the await rejects
            // and we abort close so the user can retry.
            try {
              await window.electron.ipcRenderer.invoke(
                'mt::save-and-close-tabs',
                deepClone(unsavedFiles)
              )
              window.electron.ipcRenderer.send('mt::close-window')
            } catch (err) {
              notice.notify({
                title: 'Save failed',
                type: 'error',
                message: String(err)
              })
              // window stays open; dirty tabs remain
            }
          } else {
            // No named tabs to save — Save button labelled "Discard &
            // Close" so confirm = discard.
            window.electron.ipcRenderer.send('mt::close-window')
          }
        } catch (action) {
          if (action === 'cancel') {
            // "Don't Save" → discard everything and close
            window.electron.ipcRenderer.send('mt::close-window')
          }
          // 'close' (X) or 'pressEscape' → keep window open, no IPC
        }
      })
    },

    ASK_FOR_SAVE_ALL(closeTabs) {
      const { tabs } = this
      const projectStore = useProjectStore()
      const unsavedFiles = tabs
        .filter((file) => !(file.isSaved && /[^\n]/.test(file.markdown)))
        .map((file) => {
          const { id, filename, pathname, markdown } = file
          const options = getOptionsFromState(file)
          return {
            id,
            filename,
            pathname,
            markdown,
            options,
            defaultPath: getRootFolderFromState(projectStore)
          }
        })

      if (closeTabs) {
        if (unsavedFiles.length) {
          this.CLOSE_TABS(tabs.filter((f) => f.isSaved).map((f) => f.id))
          window.electron.ipcRenderer.send('mt::save-and-close-tabs', deepClone(unsavedFiles))
        } else {
          this.CLOSE_TABS(tabs.map((f) => f.id))
        }
      } else {
        window.electron.ipcRenderer.send('mt::save-tabs', deepClone(unsavedFiles))
      }
    },

    /**
     * Untitled tab → save-as picker (same flow as FILE_SAVE_AS);
     * existing tab → mt::response-file-move-to event (handled by the
     * m_v1_compat shim; full migration of the move flow is deferred).
     */
    async MOVE_FILE_TO() {
      const { id, pathname } = this.currentFile
      if (!id) return
      if (!pathname) {
        await this.FILE_SAVE_AS()
      } else {
        // Move to a new (maybe) folder — still legacy IPC because
        // mt_response_file_move_to backend lives in m_v1_compat.
        window.electron.ipcRenderer.send('mt::response-file-move-to', { id, pathname })
      }
    },

    LISTEN_FOR_MOVE_TO() {
      // IPC listener lives in bootstrap-ipc.js; bus subscription only.
      bus.on('mt::editor-move-file', () => {
        this.MOVE_FILE_TO()
      })
    },

    /**
     * IPC listener moved to bootstrap-ipc.js; bus subscription stays.
     */
    LISTEN_FOR_RENAME() {
      bus.on('mt::editor-rename-file', () => {
        this.RESPONSE_FOR_RENAME()
      })
    },

    /**
     * Untitled file → save-as flow; existing file → bus.emit('rename')
     * so the title-bar inline-rename UI takes over.
     */
    async RESPONSE_FOR_RENAME() {
      const { id, pathname } = this.currentFile
      if (!id) return
      if (!pathname) {
        await this.FILE_SAVE_AS()
      } else {
        bus.emit('rename')
      }
    },

    // ask for main process to rename this file to a new name `newFilename`
    RENAME(newFilename) {
      const { id, pathname, filename } = this.currentFile
      if (typeof filename === 'string' && filename !== newFilename) {
        const newPathname = window.path.join(window.path.dirname(pathname), newFilename)
        window.electron.ipcRenderer.send('mt::rename', {
          id,
          pathname,
          newPathname,
          currentFile: deepClone(this.currentFile)
        })
      }
    },

    UPDATE_CURRENT_FILE(currentFile) {
      const oldCurrentFile = this.currentFile
      if (!oldCurrentFile.id || oldCurrentFile.id !== currentFile.id) {
        const { id, markdown, cursor, history, pathname, scrollTop, blocks, muyaIndexCursor } =
          currentFile
        window.DIRNAME = pathname ? window.path.dirname(pathname) : ''
        this.currentFile = currentFile

        if (!this.tabs.some((file) => file.id === currentFile.id)) {
          this.tabs.push(currentFile)
          this.updateTabIdToIndex()
        }

        bus.emit('file-changed', {
          id,
          markdown,
          cursor,
          muyaIndexCursor,
          renderCursor: true,
          history,
          scrollTop,
          blocks
        })
      }

      this.UPDATE_LINE_ENDING_MENU()
    },

    // This events are only used during window creation.
    LISTEN_FOR_BOOTSTRAP_WINDOW() {
      const preferencesStore = usePreferencesStore()
      const layoutStore = useLayoutStore()
      const projectStore = useProjectStore()
      const mainStore = useMainStore()

      // Delay load runtime commands and initialize commands.
      setTimeout(() => {
        bus.emit('cmd::register-command', new FileEncodingCommand(this))
        bus.emit(
          'cmd::register-command',
          new QuickOpenCommand({
            editor: this,
            preferences: preferencesStore,
            project: projectStore
          })
        )
        bus.emit('cmd::register-command', new LineEndingCommand(this))
        bus.emit('cmd::register-command', new TrailingNewlineCommand(this))

        setTimeout(() => {
          window.electron.ipcRenderer.send('mt::request-keybindings')
          bus.emit('cmd::sort-commands')
        }, 100)
      }, 400)

      // mt::bootstrap-editor listener lives in bootstrap-ipc.js —
      // it calls APPLY_BOOTSTRAP_EDITOR below.
    },

    /**
     * Applies the boot-time editor configuration blast (sidebar/tabbar
     * visibility, source-code mode, initial tabs). Called from the
     * bootstrap-ipc.js mt::bootstrap-editor listener. Idempotent
     * enough to be re-played by tests.
     */
    APPLY_BOOTSTRAP_EDITOR(config) {
      const {
        addBlankTab,
        markdownList,
        lineEnding,
        sideBarVisibility,
        tabBarVisibility,
        sourceCodeModeEnabled
      } = config || {}

      const mainStore = useMainStore()
      const preferencesStore = usePreferencesStore()
      const layoutStore = useLayoutStore()

      window.electron.ipcRenderer.send('mt::window-initialized')
      mainStore.SET_INITIALIZED()
      preferencesStore.SET_USER_PREFERENCE({ endOfLine: lineEnding })
      layoutStore.SET_LAYOUT({
        rightColumn: 'files',
        showSideBar: !!sideBarVisibility,
        showTabBar: !!tabBarVisibility
      })
      layoutStore.DISPATCH_LAYOUT_MENU_ITEMS()
      layoutStore.REQUEST_INITIAL_WINDOW_RESIZE()
      preferencesStore.SET_MODE({
        type: 'sourceCode',
        checked: !!sourceCodeModeEnabled
      })

      if (addBlankTab) {
        this.NEW_UNTITLED_TAB({ selected: true })
      } else if (Array.isArray(markdownList) && markdownList.length) {
        let isFirst = true
        for (const markdown of markdownList) {
          this.NEW_UNTITLED_TAB({ markdown, selected: isFirst })
          isFirst = false
        }
      }
    },

    /**
     * open-new-tab + new-untitled-tab IPC listeners live in
     * bootstrap-ipc.js. Bus subscription kept inline since it doesn't
     * cross IPC. Action stays as a no-op alias for app.vue.
     */
    LISTEN_FOR_NEW_TAB() {
      bus.on('mt::new-untitled-tab', ({ selected = true, markdown = '' }) => {
        this.NEW_UNTITLED_TAB({ markdown, selected })
      })
    },

    CLOSE_TAB(file = null) {
      if (!file) {
        file = this.currentFile
      }
      if (!hasKeys(file)) return

      if (file.isSaved) {
        this.FORCE_CLOSE_TAB(file)
      } else {
        this.CLOSE_UNSAVED_TAB(file)
      }
    },

    /**
     * close-tab / tab-cycle / switch-tab IPC listeners live in
     * bootstrap-ipc.js. Bus subscriptions kept inline since they
     * don't cross IPC.
     */
    LISTEN_FOR_CLOSE_TAB() {
      bus.on('mt::editor-close-tab', () => {
        this.CLOSE_TAB()
      })
    },

    LISTEN_FOR_TAB_CYCLE() {
      bus.on('mt::tabs-cycle-left', () => {
        this.CYCLE_TABS(false)
      })
      bus.on('mt::tabs-cycle-right', () => {
        this.CYCLE_TABS(true)
      })
    },

    FORCE_CLOSE_TAB(file) {
      const { tabs, currentFile } = this
      const index = tabs.findIndex((t) => t.id === file.id)
      if (index > -1) {
        tabs.splice(index, 1)
        this.updateTabIdToIndex()
      }

      if (file.id && autoSaveTimers.has(file.id)) {
        const timer = autoSaveTimers.get(file.id)
        clearTimeout(timer)
        autoSaveTimers.delete(file.id)
      }

      this.updateTabIdToIndex() // Update before sending it out to prevent stale mappings.

      if (file.id === currentFile.id) {
        const fileState = this.tabs[index] || this.tabs[index - 1] || this.tabs[0] || {}
        this.currentFile = fileState
        if (typeof fileState.markdown === 'string') {
          const { id, markdown, cursor, history, pathname, scrollTop, blocks, muyaIndexCursor } =
            fileState
          window.DIRNAME = pathname ? window.path.dirname(pathname) : ''
          bus.emit('file-changed', {
            id,
            markdown,
            cursor,
            muyaIndexCursor,
            renderCursor: true,
            history,
            scrollTop,
            blocks
          })
        } else {
          window.DIRNAME = ''
        }
      }

      if (this.tabs.length === 0) {
        this.listToc = []
        this.toc = []
      }

      const { pathname } = file
      if (pathname) {
        window.electron.ipcRenderer.send('mt::window-tab-closed', pathname)
      }
    },

    async CLOSE_UNSAVED_TAB(file) {
      // F-LIFECYCLE-WIRE (B4-pre-alpha-step-3): renderer-driven confirm
      // dialog before discarding/saving an unsaved tab on Cmd+W. v1.2.3
      // would silently save+close which surprised the 2026-05-08 smoke
      // user ("ничего не появляется"). Three outcomes mirror the
      // window-close dialog in LISTEN_FOR_CLOSE.
      const { id, pathname, filename, markdown } = file
      const options = getOptionsFromState(file)
      const named = !!pathname
      const message = named
        ? `"${filename}" has unsaved changes. Save before closing the tab?`
        : `"${filename}" is unsaved and untitled — closing the tab will discard it.`
      try {
        await ElMessageBox.confirm(message, 'Unsaved changes', {
          confirmButtonText: named ? 'Save & Close' : 'Discard & Close',
          cancelButtonText: "Don't Save",
          type: 'warning',
          distinguishCancelAndClose: true,
          closeOnClickModal: false,
          closeOnPressEscape: true
        })
        // Confirm
        if (named) {
          window.electron.ipcRenderer.send('mt::save-and-close-tabs', [
            { id, pathname, filename, markdown, options: deepClone(options) }
          ])
        } else {
          // No path → can't save; treat confirm as Discard
          this.FORCE_CLOSE_TAB(file)
        }
      } catch (action) {
        if (action === 'cancel') {
          // "Don't Save" → discard tab
          this.FORCE_CLOSE_TAB(file)
        }
        // 'close' (X) or 'pressEscape' → keep tab open
      }
    },

    CLOSE_OTHER_TABS(file) {
      this.tabs
        .filter((f) => f.id !== file.id)
        .forEach((tab) => {
          this.CLOSE_TAB(tab)
        })
    },

    CLOSE_SAVED_TABS() {
      this.tabs
        .filter((f) => f.isSaved)
        .forEach((tab) => {
          this.CLOSE_TAB(tab)
        })
    },

    CLOSE_ALL_TABS() {
      this.tabs.slice().forEach((tab) => {
        this.CLOSE_TAB(tab)
      })
    },

    CLOSE_TABS(tabIdList) {
      if (!tabIdList || tabIdList.length === 0) return

      let tabIndex = 0
      tabIdList.forEach((id) => {
        const index = this.tabs.findIndex((f) => f.id === id)
        if (index === -1) return

        const { pathname } = this.tabs[index]

        if (pathname) {
          window.electron.ipcRenderer.send('mt::window-tab-closed', pathname)
        }

        this.tabs.splice(index, 1)
        if (this.currentFile.id === id) {
          this.currentFile = {}
          window.DIRNAME = ''
          if (tabIdList.length === 1) {
            tabIndex = index
          }
        }
      })

      this.updateTabIdToIndex() // Update before sending it out to prevent stale mappings.

      if (!this.currentFile.id && this.tabs.length > 0) {
        this.currentFile = this.tabs[tabIndex] || this.tabs[tabIndex - 1] || this.tabs[0] || {}
        if (typeof this.currentFile.markdown === 'string') {
          const { id, markdown, cursor, history, pathname, scrollTop, blocks, muyaIndexCursor } =
            this.currentFile
          window.DIRNAME = pathname ? window.path.dirname(pathname) : ''
          bus.emit('file-changed', {
            id,
            markdown,
            cursor,
            muyaIndexCursor,
            renderCursor: true,
            history,
            scrollTop,
            blocks
          })
        }
      }

      if (this.tabs.length === 0) {
        this.listToc = []
        this.toc = []
      }
    },

    EXCHANGE_TABS_BY_ID(tabIDs) {
      const { fromId, toId } = tabIDs
      const { tabs } = this
      const moveItem = (arr, from, to) => {
        if (from === to) return true
        const len = arr.length
        const item = arr.splice(from, 1)
        if (item.length === 0) return false

        arr.splice(to, 0, item[0])
        return arr.length === len
      }

      const fromIndex = tabs.findIndex((t) => t.id === fromId)
      if (fromIndex === -1) return

      if (!toId) {
        moveItem(tabs, fromIndex, tabs.length - 1)
      } else {
        const toIndex = tabs.findIndex((t) => t.id === toId)
        if (toIndex === -1) return
        const realToIndex = fromIndex < toIndex ? toIndex - 1 : toIndex
        moveItem(tabs, fromIndex, realToIndex)
      }
      this.updateTabIdToIndex()
    },

    RENAME_FILE(file) {
      this.UPDATE_CURRENT_FILE(file)
      bus.emit('rename')
    },

    // Direction is a boolean where false is left and true right.
    CYCLE_TABS(direction) {
      const { tabs, currentFile } = this
      if (tabs.length <= 1) {
        return
      }

      const currentIndex = tabs.findIndex((t) => t.id === currentFile.id)
      if (currentIndex === -1) {
        console.error('CYCLE_TABS: Cannot find current tab index.')
        return
      }

      let nextTabIndex = 0
      if (!direction) {
        // Switch tab to the left.
        nextTabIndex = currentIndex === 0 ? tabs.length - 1 : currentIndex - 1
      } else {
        // Switch tab to the right.
        nextTabIndex = (currentIndex + 1) % tabs.length
      }

      const nextTab = tabs[nextTabIndex]
      if (!nextTab || !nextTab.id) {
        console.error(`CYCLE_TABS: Cannot find next tab (index="${nextTabIndex}").`)
        return
      }

      this.UPDATE_CURRENT_FILE(nextTab)
    },

    SWITCH_TAB_BY_FILEPATH(filePath) {
      const { tabs } = this

      if (!filePath) {
        console.warn('Invalid file path:', filePath)
        return
      }

      const nextTabIndex = tabs.findIndex((t) => t.pathname === filePath)
      if (nextTabIndex === -1) {
        console.error('Cannot find tab with pathname:', filePath)
        return
      }
      this.UPDATE_CURRENT_FILE(tabs[nextTabIndex])
    },

    SWITCH_TAB_BY_INDEX(nextTabIndex) {
      const { tabs, currentFile } = this
      if (nextTabIndex < 0 || nextTabIndex >= tabs.length) {
        console.warn('Invalid tab index:', nextTabIndex)
        return
      }

      const currentIndex = tabs.findIndex((t) => t.id === currentFile.id)
      if (currentIndex === -1) {
        console.error('Cannot find current tab index.')
        return
      }

      const nextTab = tabs[nextTabIndex]
      if (!nextTab || !nextTab.id) {
        console.error(`Cannot find tab by index="${nextTabIndex}".`)
        return
      }
      this.UPDATE_CURRENT_FILE(nextTab)
    },

    /**
     * Create a new untitled tab optional from a markdown string.
     *
     * @param {*} _ The store context - not used.
     * @param {{markdown?: string, selected?: boolean}} obj Optional markdown string
     * and whether the tab should become the selected tab (true if not set).
     */
    NEW_UNTITLED_TAB({ markdown: markdownString, selected }) {
      if (selected == null) {
        selected = true
      }

      this.SHOW_TAB_VIEW(false)

      const preferencesStore = usePreferencesStore()
      const { defaultEncoding, endOfLine } = preferencesStore
      const fileState = getBlankFileState(this.tabs, defaultEncoding, endOfLine, markdownString)

      if (selected) {
        const { id, markdown } = fileState
        this.UPDATE_CURRENT_FILE(fileState)
        bus.emit('file-loaded', { id, markdown })
      } else {
        this.tabs.push(fileState)
        this.updateTabIdToIndex()
      }
    },

    /**
     * Create a new tab from the given markdown document.
     *
     * @param {*} _ The store context - not used.
     * @param {{markdownDocument: IMarkdownDocumentRaw, selected?: boolean}} obj The markdown document
     * and optional whether the tab should become the selected tab (true if not set).
     */
    NEW_TAB_WITH_CONTENT({ markdownDocument, options = {}, selected }) {
      if (!markdownDocument) {
        console.warn('Cannot create a file tab without a markdown document!')
        this.NEW_UNTITLED_TAB({})
        return
      }

      if (typeof selected === 'undefined') {
        selected = true
      }

      const { currentFile, tabs } = this
      const { pathname } = markdownDocument
      const existingTab = tabs.find((t) => window.fileUtils.isSamePathSync(t.pathname, pathname))
      if (existingTab) {
        this.UPDATE_CURRENT_FILE(existingTab)
        return
      }

      let keepTabBarState = false
      if (currentFile) {
        const { isSaved, pathname } = currentFile
        if (isSaved && !pathname) {
          keepTabBarState = true
          this.FORCE_CLOSE_TAB(currentFile)
        }
      }

      if (!keepTabBarState) {
        this.SHOW_TAB_VIEW(false)
      }

      const { markdown, isMixedLineEndings } = markdownDocument
      const docState = createDocumentState(Object.assign(markdownDocument, options))
      const { id, cursor } = docState

      if (selected) {
        this.UPDATE_CURRENT_FILE(docState)
        bus.emit('file-loaded', { id, markdown, cursor })
      } else {
        this.updateTabIdToIndex()
        this.tabs.push(docState)
      }

      if (isMixedLineEndings) {
        const { filename, lineEnding } = markdownDocument
        this.pushTabNotification({
          tabId: id,
          msg: i18n.global.t('store.editor.mixedLineEndingsNormalized', {
            name: filename,
            lineEnding: lineEnding.toUpperCase()
          })
        })
      }
    },

    SHOW_TAB_VIEW(always) {
      const { tabs } = this
      const layoutStore = useLayoutStore()
      if (always || tabs.length === 1) {
        layoutStore.SET_LAYOUT({ showTabBar: true })
        layoutStore.DISPATCH_LAYOUT_MENU_ITEMS()
      }
    },

    SET_SAVE_STATUS_WHEN_REMOVE({ pathname }) {
      this.tabs.forEach((f) => {
        if (f.pathname === pathname) {
          f.isSaved = false
        }
      })
    },

    // Content change from realtime preview editor and source code editor
    // There is a chance that this event is fired AFTER the tab is switched.
    LISTEN_FOR_CONTENT_CHANGE({
      id,
      markdown,
      wordCount,
      cursor,
      muyaIndexCursor,
      history,
      toc,
      blocks
    }) {
      const preferencesStore = usePreferencesStore()
      const { autoSave } = preferencesStore
      if (!id) {
        throw new Error('Listen for document change but id was not set!')
      } else if (this.tabs.length === 0) {
        return
      } else if (!(id in this.tabIdToIndex)) {
        // This only happens when the sourceCode tries to write a stale id via prepareTabSwitch() but the tab
        // has already been closed. In this case we can safely ignore the update.
        return
      }

      const tab = this.tabs[this.tabIdToIndex[id]]

      const { filename, pathname, markdown: oldMarkdown, trimTrailingNewline } = tab

      markdown = adjustTrailingNewlines(markdown, trimTrailingNewline)
      tab.markdown = markdown

      if (oldMarkdown.length === 0 && markdown.length === 1 && markdown[0] === '\n') {
        return
      }

      if (wordCount) tab.wordCount = wordCount
      if (cursor) tab.cursor = cursor
      if (muyaIndexCursor) tab.muyaIndexCursor = muyaIndexCursor
      if (history) tab.history = history
      if (blocks) tab.blocks = blocks

      // Only update TOC if it's the current file
      if (id === this.currentFile.id && toc && !equal(toc, this.listToc)) {
        this.listToc = toc
        this.toc = listToTree(toc)
      }

      if (
        tab.history.lastEditIndex >= 0 &&
        tab.history.stack[tab.history.lastEditIndex].id !== tab.lastSavedHistoryId
      ) {
        tab.isSaved = false
        if (pathname && autoSave) {
          const options = getOptionsFromState(tab)
          this.HANDLE_AUTO_SAVE({
            id,
            filename,
            pathname,
            markdown,
            options
          })
        }
      } else tab.isSaved = true // An undo can trigger this
    },

    HANDLE_AUTO_SAVE({ id, filename, pathname, markdown, options }) {
      if (!id || !pathname) {
        throw new Error('HANDLE_AUTO_SAVE: Invalid tab.')
      }

      const preferencesStore = usePreferencesStore()
      const projectStore = useProjectStore()
      const { autoSaveDelay } = preferencesStore

      if (autoSaveTimers.has(id)) {
        const timer = autoSaveTimers.get(id)
        clearTimeout(timer)
        autoSaveTimers.delete(id)
      }

      const timer = setTimeout(async () => {
        autoSaveTimers.delete(id)

        const tab = this.tabs.find((t) => t.id === id)
        if (tab && !tab.isSaved) {
          const defaultPath = getRootFolderFromState(projectStore)
          // Auto-save through canonical invoke. Untitled tabs skip
          // auto-save (would open picker mid-edit which is awful UX).
          // Named tabs write straight through.
          if (!pathname) return
          try {
            const { invoke } = await import('@tauri-apps/api/core')
            const outcome = await invoke('mt_response_file_save', {
              id,
              filename,
              pathname: pathname || null,
              markdown,
              defaultPath: defaultPath || null
            })
            if (outcome) this.APPLY_SAVE_OUTCOME(outcome)
          } catch (e) {
            console.warn('[editor][auto-save] failed', e)
          }
        }
      }, autoSaveDelay)
      autoSaveTimers.set(id, timer)
    },

    SELECTION_CHANGE(changes) {
      const { start, end } = changes
      if (start.key === end.key && start.block.text) {
        const value = start.block.text.substring(start.offset, end.offset)
        this.currentFile.searchMatches = {
          matches: [],
          index: -1,
          value
        }
      }

      const { windowId } = window.marktext.env
      window.electron.ipcRenderer.send(
        'mt::editor-selection-changed',
        windowId,
        createApplicationMenuState(changes)
      )
    },

    SELECTION_FORMATS(formats) {
      const { windowId } = window.marktext.env
      window.electron.ipcRenderer.send(
        'mt::update-format-menu',
        windowId,
        createSelectionFormatState(formats)
      )
    },

    EXPORT({ type, content, pageOptions }) {
      if (!hasKeys(this.currentFile)) return

      let title = ''
      const { listToc } = this
      if (listToc && listToc.length > 0) {
        let headerRef = listToc[0]
        const len = Math.min(listToc.length, 6)
        for (let i = 1; i < len; ++i) {
          if (headerRef.lvl === 1) break
          const header = listToc[i]
          if (headerRef.lvl > header.lvl) {
            headerRef = header
          }
        }
        title = headerRef.content
      }

      const { filename, pathname } = this.currentFile
      window.electron.ipcRenderer.send('mt::response-export', {
        type,
        title,
        content,
        filename,
        pathname,
        pageOptions
      })
    },

    APPLY_EXPORT_SUCCESS(filePath) {
      if (!filePath) return
      notice
        .notify({
          title: i18n.global.t('store.editor.exportSuccessTitle'),
          message: i18n.global.t('store.editor.exportSuccessMessage', {
            name: window.path.basename(filePath)
          }),
          showConfirm: true
        })
        .then(() => {
          window.electron.shell.showItemInFolder(filePath)
        })
    },

    PRINT_RESPONSE() {
      window.electron.ipcRenderer.send('mt::response-print')
    },

    SET_LINE_ENDING(lineEnding) {
      const { lineEnding: oldLineEnding } = this.currentFile
      if (lineEnding !== oldLineEnding) {
        this.currentFile.lineEnding = lineEnding
        this.currentFile.adjustLineEndingOnSave = lineEnding !== 'lf'
        this.currentFile.isSaved = true
        this.UPDATE_LINE_ENDING_MENU()
      }
    },

    LINTEN_FOR_SET_LINE_ENDING() {
      // IPC listener lives in bootstrap-ipc.js; bus subscription only.
      bus.on('mt::set-line-ending', (lineEnding) => {
        this.SET_LINE_ENDING(lineEnding)
      })
    },

    LINTEN_FOR_SET_ENCODING() {
      bus.on('mt::set-file-encoding', (encodingName) => {
        const { encoding } = this.currentFile.encoding
        if (encoding !== encodingName) {
          this.currentFile.encoding.encoding = encodingName
          this.currentFile.encoding.isBom = false
          this.currentFile.isSaved = true
        }
      })
    },

    LINTEN_FOR_SET_FINAL_NEWLINE() {
      bus.on('mt::set-final-newline', (value) => {
        const { trimTrailingNewline } = this.currentFile
        if (trimTrailingNewline !== value) {
          this.currentFile.trimTrailingNewline = value
          this.currentFile.isSaved = true
        }
      })
    },

    APPLY_FILE_CHANGE(type, change) {
      const preferencesStore = usePreferencesStore()
      const { tabs } = this
      const { pathname } = change || {}
      if (!pathname) return
      const tab = tabs.find((t) => window.fileUtils.isSamePathSync(t.pathname, pathname))
      if (!tab) {
        console.error(`APPLY_FILE_CHANGE: Cannot find tab for path "${pathname}".`)
        return
      }
      const { id, isSaved, filename } = tab
      switch (type) {
        case 'unlink':
          tab.isSaved = false
          this.pushTabNotification({
            tabId: id,
            msg: i18n.global.t('store.editor.fileRemovedOnDisk', { name: filename }),
            style: 'warn',
            showConfirm: false,
            exclusiveType: 'file_changed'
          })
          break
        case 'add':
        case 'change': {
          const { autoSave } = preferencesStore
          if (autoSave) {
            if (autoSaveTimers.has(id)) {
              clearTimeout(autoSaveTimers.get(id))
              autoSaveTimers.delete(id)
            }
            if (isSaved) {
              this.loadChange(change)
              return
            }
          }
          tab.isSaved = false
          this.pushTabNotification({
            tabId: id,
            msg: i18n.global.t('store.editor.fileChangedOnDisk', { name: filename }),
            showConfirm: true,
            exclusiveType: 'file_changed',
            action: (status) => {
              if (status) this.loadChange(change)
            }
          })
          break
        }
        default:
          console.error(`APPLY_FILE_CHANGE: Invalid type "${type}"`)
      }
    },

    ASK_FOR_IMAGE_PATH() {
      // step-8k: sendSync → invoke. Returns Promise<string>; muya's
      // ImagePathPicker plugin awaits the picker result, so the async
      // semantics propagate cleanly through editor.vue:imagePathPicker.
      return window.electron.ipcRenderer.invoke('mt::ask-for-image-path')
    },

    EDIT_ZOOM(zoomFactor) {
      const preferencesStore = usePreferencesStore()
      zoomFactor = Number.parseFloat(zoomFactor.toFixed(3))
      const { zoom } = preferencesStore
      if (zoom !== zoomFactor) {
        preferencesStore.SET_SINGLE_PREFERENCE({ type: 'zoom', value: zoomFactor })
      }
      window.electron.webFrame.setZoomFactor(zoomFactor)
    },

    LISTEN_WINDOW_ZOOM() {
      // IPC listener lives in bootstrap-ipc.js; bus subscription only.
      bus.on('mt::window-zoom', (zoomFactor) => {
        this.EDIT_ZOOM(zoomFactor)
      })
    }
  }
})

// ----------------------------------------------------------------------------

/**
 * Return the opened root folder or an empty string.
 *
 * @param {object} projectStore The project store instance.
 */
const getRootFolderFromState = (projectStore) => {
  const openedFolder = projectStore.projectTree
  if (openedFolder) {
    return openedFolder.pathname
  }
  return ''
}

/**
 * Trim the final newlines according `trimTrailingNewlineOption`.
 *
 * @param {string} markdown The text to trim.
 * @param {*} trimTrailingNewlineOption The option how we should trim the final newlines.
 */
const adjustTrailingNewlines = (markdown, trimTrailingNewlineOption) => {
  if (!markdown) {
    return ''
  }

  switch (trimTrailingNewlineOption) {
    // Trim trailing newlines.
    case 0: {
      return trimTrailingNewlines(markdown)
    }
    // Ensure single trailing newline.
    case 1: {
      // Muya will always add a final new line to the markdown text. Check first whether
      // only one newline exist to prevent copying the string.
      const lastIndex = markdown.length - 1
      if (markdown[lastIndex] === '\n') {
        if (markdown.length === 1) {
          // Just return nothing because adding a final new line makes no sense.
          return ''
        } else if (markdown[lastIndex - 1] !== '\n') {
          return markdown
        }
      }

      // Otherwise trim trailing newlines and add one.
      markdown = trimTrailingNewlines(markdown)
      if (markdown.length === 0) {
        // Just return nothing because adding a final new line makes no sense.
        return ''
      }
      return markdown + '\n'
    }
    // Disabled, use text as it is.
    default:
      return markdown
  }
}

/**
 * Trim trailing newlines from `text`.
 *
 * @param {string} text The text to trim.
 */
const trimTrailingNewlines = (text) => {
  return text.replace(/[\r?\n]+$/, '')
}

/**
 * Creates a object that contains the application menu state.
 *
 * @param {*} selection The selection.
 * @returns A object that represents the application menu state.
 */
const createApplicationMenuState = ({ start, end, affiliation }) => {
  const state = {
    isDisabled: false,
    // Whether multiple lines are selected.
    isMultiline: start.key !== end.key,
    // List information - a list must be selected.
    isLooseListItem: false,
    isTaskList: false,
    // Whether the selection is code block like (math, html or code block).
    isCodeFences: false,
    // Whether a code block line is selected.
    isCodeContent: false,
    // Whether the selection contains a table.
    isTable: false,
    // Contains keys about the selection type(s) (string, boolean) like "ul: true".
    affiliation: {}
  }
  const { isMultiline } = state

  // Get code block information from selection.
  if (
    (start.block.functionType === 'cellContent' && end.block.functionType === 'cellContent') ||
    (start.type === 'span' && start.block.functionType === 'codeContent') ||
    (end.type === 'span' && end.block.functionType === 'codeContent')
  ) {
    // A code block like block is selected (code, math, ...).
    state.isCodeFences = true

    // A code block line is selected.
    if (start.block.functionType === 'codeContent' || end.block.functionType === 'codeContent') {
      state.isCodeContent = true
    }
  }

  // Query list information.
  if (affiliation.length >= 1 && /ul|ol/.test(affiliation[0].type)) {
    const listBlock = affiliation[0]
    state.affiliation[listBlock.type] = true
    state.isLooseListItem = listBlock.children[0].isLooseListItem
    state.isTaskList = listBlock.listType === 'task'
  } else if (affiliation.length >= 3 && affiliation[1].type === 'li') {
    const listItem = affiliation[1]
    const listType = listItem.listItemType === 'order' ? 'ol' : 'ul'
    state.affiliation[listType] = true
    state.isLooseListItem = listItem.isLooseListItem
    state.isTaskList = listItem.listItemType === 'task'
  }

  // Search with block depth 3 (e.g. "ul -> li -> p" where p is the actually paragraph inside the list (item)).
  for (const b of affiliation.slice(0, 3)) {
    if (b.type === 'pre' && b.functionType) {
      if (/frontmatter|html|multiplemath|code$/.test(b.functionType)) {
        state.isCodeFences = true
        state.affiliation[b.functionType] = true
      }
      break
    } else if (b.type === 'figure' && b.functionType) {
      if (b.functionType === 'table') {
        state.isTable = true
        state.isDisabled = true
      }
      break
    } else if (isMultiline && /^h{1,6}$/.test(b.type)) {
      // Multiple block elements are selected.
      state.affiliation = {}
      break
    } else {
      if (!state.affiliation[b.type]) {
        state.affiliation[b.type] = true
      }
    }
  }

  // Clean up
  if (Object.getOwnPropertyNames(state.affiliation).length >= 2 && state.affiliation.p) {
    delete state.affiliation.p
  }
  if ((state.affiliation.ul || state.affiliation.ol) && state.affiliation.li) {
    delete state.affiliation.li
  }
  return state
}

/**
 * Creates a object that contains the formats selection state.
 *
 * @param {*} formats The selection formats.
 * @returns A object that represents the formats menu state.
 */
const createSelectionFormatState = (formats) => {
  const state = {}
  for (const item of formats) {
    state[item.type] = true
  }
  return state
}
