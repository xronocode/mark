// MODULE_CONTRACT
//   PURPOSE: Path B-clean wave W1 — boot-time Tauri event listener
//            registration. Replaces the per-action `ipcRenderer.on()`
//            pattern in store/preferences.js, store/index.js, i18n/
//            index.js with a SINGLE registration call at app boot.
//            Eliminates the listener-race bug that produced the
//            theme-broken-after-Settings-click smoke regression.
//   SCOPE:   Only listeners that need to fire BEFORE any invoke() can
//            arrive (cross-window broadcasts + initial-state pushes
//            from main process). Per-component listeners that fire
//            AFTER user interaction stay in their component as bus.on
//            or local listen() calls.
//   DEPENDS: @tauri-apps/api/event, pinia stores (preferences, main).
//   LINKS:   docs/path-bclean-step1-inventory.md (W1 wave site list),
//            verification-plan.xml V-Phase-Bclean-W1.
//
// CHANGE_SUMMARY:
//   - 2026-05-09 W1 initial: prefs broadcast + window-active-status +
//                language-changed listeners.

import { listen } from '@tauri-apps/api/event'
import bus from './bus'
import { setLanguage } from './i18n'

let installed = false

/**
 * Register every Tauri event listener that the app needs at boot.
 * Idempotent — second call is a no-op + warning. The Tauri-side
 * unlisten handles are NOT collected (app-lifetime listeners; freed
 * on process exit).
 *
 * Boot-stage contract: this function MUST resolve before any
 * `invoke()` call that could trigger a backend broadcast. Otherwise
 * the broadcast lands before the listener is ready and the event is
 * lost (the bug Path B-clean is fixing).
 */
export const setupIpcListeners = async () => {
  if (installed) {
    console.warn('[boot][ipc] setupIpcListeners called twice — ignoring')
    return
  }
  installed = true

  // Lazy-import Pinia stores so they're created in the calling app
  // context (must run AFTER app.use(pinia) but BEFORE app.mount).
  const { usePreferencesStore } = await import('./store/preferences')
  const { useMainStore } = await import('./store')

  const prefs = usePreferencesStore()
  const main = useMainStore()

  // mt::user-preference — fires on every cross-window pref change
  // (broadcast from backend mt_set_user_preference). When Settings
  // window changes theme, editor window receives this and updates.
  await listen('mt::user-preference', (event) => {
    if (event?.payload && typeof event.payload === 'object') {
      prefs.SET_USER_PREFERENCE(event.payload)
    }
  })
  console.log('[boot][ipc][BLOCK_PREFS_LISTENER_REGISTERED]')

  // mt::current-language — language change broadcast
  await listen('mt::current-language', (event) => {
    const lang = event?.payload
    if (typeof lang === 'string' && lang) {
      setLanguage(lang)
      bus.emit('language-changed', lang)
    }
  })

  // language-changed — same payload, separate channel for backwards-compat
  // with i18n module's old listen pattern. Single emitter eventually.
  await listen('language-changed', (event) => {
    const lang = event?.payload
    if (typeof lang === 'string' && lang) {
      setLanguage(lang)
      bus.emit('language-changed', lang)
    }
  })

  // mt::window-active-status — focus/blur for current window
  await listen('mt::window-active-status', (event) => {
    const status = event?.payload?.status
    if (typeof status === 'boolean') {
      main.windowActive = status
    }
  })

  // Path B-clean W3: tree-walk events from open-folder backend.
  // Streamed during recursive walk; renderer's ProjectStore folds
  // each into the sidebar tree via _processTreeEvent.
  const { useProjectStore } = await import('./store/project')
  const projectStore = useProjectStore()
  await listen('mt::update-object-tree', (event) => {
    const payload = event?.payload
    if (payload && typeof payload === 'object' && payload.type) {
      projectStore._processTreeEvent(payload.type, payload.change)
    }
  })

  // Path B-clean review M-7: command-palette + view-mode-entry
  // listeners (formerly preferences.js LISTEN_FOR_VIEW). Boot-time
  // registration eliminates the listener-race the W1 wave already
  // closed for prefs broadcasts.
  await listen('mt::show-command-palette', () => {
    bus.emit('show-command-palette')
  })
  await listen('mt::toggle-view-mode-entry', (event) => {
    const entryName = event?.payload
    if (typeof entryName === 'string' && entryName) {
      prefs.TOGGLE_VIEW_MODE(entryName)
      prefs.DISPATCH_EDITOR_VIEW_STATE({ [entryName]: prefs[entryName] })
    }
  })

  // Path B-clean W2a: per-tab batch-save events. Single-tab save
  // flow now folds these into the invoke return (FILE_SAVE etc.),
  // but mt_save_and_close_tabs still emits per-tab during batch
  // close. Boot-time registration so cross-window batch saves
  // (e.g., another window's "Save All" flow) update this window's
  // tab state correctly.
  const { useEditorStore } = await import('./store/editor')
  const editorStore = useEditorStore()
  await listen('mt::tab-saved', (event) => {
    const tabId = event?.payload
    if (typeof tabId === 'string' && tabId) editorStore.APPLY_TAB_SAVED(tabId)
  })
  await listen('mt::tab-save-failure', (event) => {
    // Backend emits as Vec<(String, String)> tuple; serializes to
    // [id, msg]. event.payload may be either array shape or object.
    const p = event?.payload
    let id = ''
    let msg = ''
    if (Array.isArray(p)) {
      id = String(p[0] || '')
      msg = String(p[1] || '')
    } else if (p && typeof p === 'object') {
      id = String(p.id || '')
      msg = String(p.msg || p.message || '')
    }
    if (id) editorStore.APPLY_TAB_SAVE_FAILURE(id, msg)
  })
  await listen('mt::set-pathname', (event) => {
    // Same batch-save fallback. Single-window save path uses invoke
    // return value via APPLY_SAVE_OUTCOME; this listener picks up
    // cross-window emits if backend ever decides to push pathname
    // updates outside the invoke ack.
    const fi = event?.payload
    if (fi && typeof fi === 'object' && fi.id) {
      editorStore.APPLY_SAVE_OUTCOME({
        id: fi.id,
        pathname: fi.pathname,
        filename: fi.filename,
        isSaved: true
      })
    }
  })

  // Path B-clean W2b: editor-event listeners (open-new-tab,
  // new-untitled-tab, close-tab, tab-cycle, switch-tab, screenshot,
  // bootstrap-editor). Single boot registration replaces 10+
  // per-action listener installs in editor.js.
  await listen('mt::screenshot-captured', () => {
    bus.emit('screenshot-captured')
  })
  await listen('mt::bootstrap-editor', (event) => {
    if (event?.payload) editorStore.APPLY_BOOTSTRAP_EDITOR(event.payload)
  })
  await listen('mt::open-new-tab', (event) => {
    // v1 sent (markdownDocument, options, selected); via Tauri the
    // payload is a single object — pick fields tolerantly.
    const p = event?.payload
    if (p && typeof p === 'object') {
      const markdownDocument = p.markdown !== undefined || p.pathname ? p : p.markdownDocument
      const options = p.options || {}
      const selected = typeof p.selected === 'boolean' ? p.selected : true
      if (markdownDocument) {
        editorStore.NEW_TAB_WITH_CONTENT({ markdownDocument, options, selected })
      } else {
        editorStore.NEW_UNTITLED_TAB({})
      }
    }
  })
  await listen('mt::new-untitled-tab', (event) => {
    const p = event?.payload
    const selected = (p && typeof p.selected === 'boolean') ? p.selected : true
    const markdown = (p && typeof p.markdown === 'string') ? p.markdown : ''
    editorStore.NEW_UNTITLED_TAB({ markdown, selected })
  })
  await listen('mt::editor-close-tab', () => {
    editorStore.CLOSE_TAB()
  })
  await listen('mt::tabs-cycle-left', () => {
    editorStore.CYCLE_TABS(false)
  })
  await listen('mt::tabs-cycle-right', () => {
    editorStore.CYCLE_TABS(true)
  })
  await listen('mt::switch-tab-by-index', (event) => {
    const index = event?.payload
    if (typeof index === 'number') editorStore.SWITCH_TAB_BY_INDEX(index)
  })
  await listen('mt::switch-tab-by-file_path', (event) => {
    const filePath = event?.payload
    if (typeof filePath === 'string') editorStore.SWITCH_TAB_BY_FILEPATH(filePath)
  })

  // Path B-clean W5: editor-event IPC listeners (line-ending,
  // export, file-watcher, zoom, image-cache, context menu, spelling).
  // Most are bus.emit forwarders; a few have inline state updates
  // that became APPLY_* actions.
  await listen('mt::editor-ask-file-save', () => {
    editorStore.FILE_SAVE()
  })
  await listen('mt::editor-ask-file-save-as', () => {
    editorStore.FILE_SAVE_AS()
  })
  await listen('mt::editor-move-file', () => {
    editorStore.MOVE_FILE_TO()
  })
  await listen('mt::editor-rename-file', () => {
    editorStore.RESPONSE_FOR_RENAME()
  })
  await listen('mt::force-close-tabs-by-id', (event) => {
    const list = event?.payload
    if (Array.isArray(list) && list.length) editorStore.CLOSE_TABS(list)
  })
  await listen('mt::set-line-ending', (event) => {
    const lineEnding = event?.payload
    if (typeof lineEnding === 'string') editorStore.SET_LINE_ENDING(lineEnding)
  })
  await listen('mt::update-file', (event) => {
    const p = event?.payload
    if (p && typeof p === 'object' && p.type) {
      editorStore.APPLY_FILE_CHANGE(p.type, p.change)
    }
  })
  await listen('mt::window-zoom', (event) => {
    const z = event?.payload
    if (typeof z === 'number') editorStore.EDIT_ZOOM(z)
  })
  await listen('mt::invalidate-image-cache', () => {
    bus.emit('invalidate-image-cache')
  })
  await listen('mt::export-success', (event) => {
    const p = event?.payload
    const filePath = (p && typeof p === 'object') ? p.filePath : null
    if (filePath) editorStore.APPLY_EXPORT_SUCCESS(filePath)
  })
  await listen('mt::print-service-clearup', () => {
    bus.emit('print-service-clearup')
  })
  // Context menu
  await listen('mt::cm-copy-as-rich', () => bus.emit('copyAsRich', 'copyAsRich'))
  await listen('mt::cm-copy-as-html', () => bus.emit('copyAsHtml', 'copyAsHtml'))
  await listen('mt::cm-paste-as-plain-text', () => bus.emit('pasteAsPlainText', 'pasteAsPlainText'))
  await listen('mt::cm-insert-paragraph', (event) => {
    bus.emit('insertParagraph', event?.payload)
  })
  await listen('mt::spelling-replace-misspelling', (event) => {
    bus.emit('replace-misspelling', event?.payload)
  })
  await listen('mt::spelling-show-switch-language', () => {
    bus.emit('open-command-spellchecker-switch-language')
  })

  // Path B-clean W6: listenForMain + layout + commandCenter +
  // notification listeners. All bus.emit forwarders or APPLY_*
  // action calls.
  const { useListenForMainStore } = await import('./store/listenForMain')
  const lfm = useListenForMainStore()
  await listen('mt::editor-edit-action', (event) => {
    const type = event?.payload
    if (type) lfm.EDITOR_EDIT_ACTION(type)
  })
  await listen('mt::about-dialog', () => bus.emit('aboutDialog'))
  await listen('mt::show-export-dialog', (event) => {
    bus.emit('showExportDialog', event?.payload)
  })
  await listen('mt::editor-paragraph-action', (event) => {
    const p = event?.payload
    const type = (p && typeof p === 'object') ? p.type : p
    if (type) bus.emit('paragraph', type)
  })
  await listen('mt::editor-format-action', (event) => {
    const p = event?.payload
    const type = (p && typeof p === 'object') ? p.type : p
    if (type) bus.emit('format', type)
  })

  // Layout listeners (kept dormant until F-MENU-WIRE-TAURI emits).
  const { useLayoutStore } = await import('./store/layout')
  const layoutStore = useLayoutStore()
  await listen('mt::set-view-layout', (event) => {
    const layout = event?.payload
    if (layout && typeof layout === 'object') {
      if (layout.rightColumn) {
        layoutStore.SET_LAYOUT({
          ...layout,
          rightColumn: layout.rightColumn === layoutStore.rightColumn ? '' : layout.rightColumn,
          showSideBar: true
        })
      } else {
        layoutStore.SET_LAYOUT(layout)
      }
      layoutStore.DISPATCH_LAYOUT_MENU_ITEMS()
    }
  })
  await listen('mt::toggle-view-layout-entry', (event) => {
    const entryName = event?.payload
    if (typeof entryName === 'string') {
      layoutStore.TOGGLE_LAYOUT_ENTRY(entryName)
      layoutStore.DISPATCH_LAYOUT_MENU_ITEMS()
    }
  })

  // Command center (keybindings + execute-by-id)
  const { useCommandCenterStore } = await import('./store/commandCenter')
  const ccStore = useCommandCenterStore()
  await listen('mt::keybindings-response', (event) => {
    const map = event?.payload
    if (map && typeof map === 'object') ccStore.APPLY_KEYBINDINGS(map)
  })
  await listen('mt::execute-command-by-id', (event) => {
    const id = event?.payload
    if (typeof id === 'string') ccStore.EXECUTE_COMMAND_BY_ID(id)
  })

  // Notifications
  const { useNotificationStore } = await import('./store/notification')
  const noteStore = useNotificationStore()
  await listen('mt::show-notification', (event) => {
    noteStore.SHOW_NOTIFICATION(event?.payload)
  })
  await listen('mt::pandoc-not-exists', (event) => {
    noteStore.SHOW_PANDOC_MISSING(event?.payload)
  })

  console.log('[boot][ipc][BLOCK_ALL_LISTENERS_REGISTERED]')
}
