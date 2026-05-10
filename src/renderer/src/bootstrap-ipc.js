// MODULE_CONTRACT
//   PURPOSE: Boot-time Tauri event listener registration. Replaces the
//            per-action `ipcRenderer.on()` pattern in store/preferences.js,
//            store/index.js, i18n/index.js with a SINGLE registration
//            call at app boot. Eliminates the listener-race bug that
//            produced the theme-broken-after-Settings-click smoke
//            regression.
//   SCOPE:   Only listeners that need to fire BEFORE any invoke() can
//            arrive (cross-window broadcasts + initial-state pushes
//            from main process). Per-component listeners that fire
//            AFTER user interaction stay in their component as bus.on
//            or local listen() calls.
//   DEPENDS: @tauri-apps/api/event, pinia stores (preferences, project, editor).
//   LINKS:   verification-plan.xml V-Phase-Bclean-W1.
//
// CHANGE_SUMMARY:
//   - 2026-05-09 W1 initial: prefs broadcast + window-active-status +
//                language-changed listeners.
//   - 2026-05-09 audit-M-1: delete 37 dead listeners (24 menu-driven +
//                13 never-wired); see docs/path-b-clean-audit.md

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
 * lost.
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

  const prefs = usePreferencesStore()

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

  // tree-walk events from open-folder backend. Streamed during recursive
  // walk; renderer's ProjectStore folds each into the sidebar tree via
  // _processTreeEvent.
  const { useProjectStore } = await import('./store/project')
  const projectStore = useProjectStore()
  await listen('mt::update-object-tree', (event) => {
    const payload = event?.payload
    if (payload && typeof payload === 'object' && payload.type) {
      projectStore._processTreeEvent(payload.type, payload.change)
    }
  })

  // Per-tab batch-save events. Single-tab save flow folds these into
  // the invoke return (FILE_SAVE etc.), but mt_save_and_close_tabs
  // still emits per-tab during batch close. Boot-time registration so
  // cross-window batch saves (e.g., another window's "Save All" flow)
  // update this window's tab state correctly.
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

  // Editor-event listeners. Live channels: bootstrap-editor +
  // open-new-tab. Other editor listeners (close-tab, tab-cycle,
  // switch-tab, new-untitled-tab, screenshot) were deleted in audit-M-1:
  // those flow through mt::menu-invoked → install-menu-bridge.js and
  // have no direct backend emitter.
  await listen('mt::bootstrap-editor', async (event) => {
    if (event?.payload) editorStore.APPLY_BOOTSTRAP_EDITOR(event.payload)
    // F-FILE-OPEN-PENDING (alpha.5): drain pending file-open paths
    // queued by RunEvent::Opened (Apple Event from Finder/Open With)
    // and CLI args. Per Tauri 2 docs RunEvent::Opened fires BEFORE
    // Ready/Window so the renderer's mt::open-new-tab listener isn't
    // yet active when the event lands — backend stashes paths in
    // PendingOpens AppState. Now (after bootstrap-editor → renderer
    // fully wired), invoke the drain: backend emits mt::open-new-tab
    // for each path with preview_mode=true (M-022: Finder-launched
    // files start read-only). Race-free; no timing assumptions.
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      const paths = await invoke('mt_drain_pending_opens')
      if (Array.isArray(paths) && paths.length) {
        console.debug(`[boot][pending_opens][BLOCK_DRAINED count=${paths.length}]`)
      }
    } catch (e) {
      console.debug('[boot][pending_opens][BLOCK_DRAIN_FAILED]', e)
    }
  })
  await listen('mt::open-new-tab', async (event) => {
    // v1 sent (markdownDocument, options, selected); via Tauri the
    // payload is a single object — pick fields tolerantly.
    const p = event?.payload
    if (!p || typeof p !== 'object') {
      // F-01: malformed payload (string / null / missing) — log marker
      // for verification and bail without touching tabs.
      // eslint-disable-next-line no-console
      console.debug('[editor][preview][BLOCK_PAYLOAD_INVALID reason=missing-field]')
      return
    }
    const markdownDocument = p.markdown !== undefined || p.pathname ? p : p.markdownDocument
    const options = p.options || {}
    const selected = typeof p.selected === 'boolean' ? p.selected : true
    if (markdownDocument) {
      editorStore.NEW_TAB_WITH_CONTENT({ markdownDocument, options, selected })
    } else {
      editorStore.NEW_UNTITLED_TAB({})
    }
    // M-022: preview-mode flag is set by Agent A's backend hook on
    // Finder/CLI-launched files. Apply AFTER tab creation so the new
    // tab id resolves through editorStore.currentFile (or the last
    // pushed tab when selected=false). We gate on the user pref so the
    // setting takes effect immediately without a relaunch.
    if (p.previewMode) {
      const { usePreferencesStore: _usePref } = await import('./store/preferences')
      const _prefs = _usePref()
      if (typeof p.previewMode !== 'boolean') {
        // eslint-disable-next-line no-console
        console.debug('[editor][preview][BLOCK_PAYLOAD_INVALID reason=wrong-type]')
        return
      }
      if (!_prefs.previewModeOnFinderOpen) return
      const newTabId = selected
        ? editorStore.currentFile && editorStore.currentFile.id
        : editorStore.tabs.length
          ? editorStore.tabs[editorStore.tabs.length - 1].id
          : null
      if (newTabId) editorStore.APPLY_PREVIEW_MODE(newTabId, true)
    }
  })

  // Live cross-window listener kept after audit-M-1. Other channels
  // (file-save{,-as}, move/rename-file, set-line-ending, window-zoom,
  // image-cache, export-success, print-service-clearup, context-menu,
  // spelling) were deleted: they are menu-driven and now flow through
  // mt::menu-invoked → install-menu-bridge.js, or have no backend
  // emitter at all.
  await listen('mt::force-close-tabs-by-id', (event) => {
    const list = event?.payload
    if (Array.isArray(list) && list.length) editorStore.CLOSE_TABS(list)
  })
  // C-1 fix: the legacy mt::update-file listener was dead. Backend
  // emits file-watcher events on mt::watch::event (see m013b/watch.rs);
  // the renderer subscribes through ipcWatch in project.js#ADD_PROJECT,
  // which translates kind=create/modify/remove into _processTreeEvent
  // + APPLY_FILE_CHANGE calls. No boot-time listener is needed for
  // file-watch — subscriptions are per-root and scoped to project life.

  // Additional listeners (listenForMain edit-action, about-dialog,
  // show-export-dialog, editor-paragraph-action, editor-format-action,
  // layout set-view-layout / toggle-view-layout-entry, commandCenter
  // keybindings-response / execute-command-by-id, notifications
  // show-notification / pandoc-not-exists) were deleted in audit-M-1:
  // all are either menu-driven (route through mt::menu-invoked →
  // install-menu-bridge.js) or have no Rust emitter. See
  // docs/path-b-clean-audit.md.

  console.log('[boot][ipc][BLOCK_ALL_LISTENERS_REGISTERED]')
}
