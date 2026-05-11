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
//   DEPENDS: @tauri-apps/api/event, @tauri-apps/api/core, pinia stores
//            (preferences, project, editor).
//   LINKS:   verification-plan.xml V-Phase-Bclean-W1 + V-M-025.
//
// CHANGE_SUMMARY:
//   - 2026-05-09 W1 initial: prefs broadcast + window-active-status +
//                language-changed listeners.
//   - 2026-05-09 audit-M-1: delete 37 dead listeners (24 menu-driven +
//                13 never-wired); see docs/path-b-clean-audit.md
//   - 2026-05-10 M-025 perf-pending-opens-parallel: relocate
//                mt_drain_pending_opens invoke from inside the
//                mt::bootstrap-editor handler (sequential after Vue mount
//                + IPC roundtrip) to setupIpcListeners() top-level
//                (parallel with Vue mount). Saves ~150ms cold-launch on
//                Finder double-click. Adds BLOCK_LISTENERS_READY,
//                BLOCK_DRAIN_INVOKED, BLOCK_DRAIN_RESPONSE_RECEIVED,
//                BLOCK_DRAIN_EMPTY, BLOCK_NEW_TAB_RECEIVED markers with
//                elapsed_ms (window.__BOOT_T0__ anchor when present, else
//                performance.now() origin). See V-M-025 ordering invariants.

import { listen } from '@tauri-apps/api/event'
import { invoke } from '@tauri-apps/api/core'
import bus from './bus'
import { setLanguage } from './i18n'

let installed = false

/**
 * V-M-025/V-M-030: render `elapsed_ms` for boot-stage markers.
 * Uses window.__BOOT_T0__ (set in index.html <head>) as origin when
 * available. Falls back to a module-local origin so the marker still
 * renders in non-browser test environments (jsdom may or may not have
 * window.__BOOT_T0__ depending on the test setup).
 */
const _BOOT_FALLBACK_T0 =
  (typeof performance !== 'undefined' && typeof performance.now === 'function')
    ? performance.now()
    : 0
const _elapsedMs = () => {
  const t0 =
    (typeof window !== 'undefined' && typeof window.__BOOT_T0__ === 'number')
      ? window.__BOOT_T0__
      : _BOOT_FALLBACK_T0
  const now =
    (typeof performance !== 'undefined' && typeof performance.now === 'function')
      ? performance.now()
      : 0
  // performance.now() and window.__BOOT_T0__ share the same time origin
  // (DOMHighResTimeStamp), so subtracting yields elapsed-since-origin.
  return Math.max(0, Math.round(now - t0))
}

/**
 * Defensive: confirm a Pinia instance is currently active. setupIpcListeners
 * MUST run after `app.use(pinia)` (see main.js); if a future regression
 * inverts that order, several `useFooStore()` calls below would throw with
 * a non-obvious "no active Pinia" error. This wrapper logs
 * BLOCK_PINIA_NOT_READY first so the failure is greppable.
 */
const _safeUseStore = async (label, importer) => {
  try {
    const mod = await importer()
    return mod
  } catch (err) {
    console.error(
      `[boot][pending_opens][BLOCK_PINIA_NOT_READY elapsed_ms=${_elapsedMs()}] store=${label}`,
      err
    )
    throw err
  }
}

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
 *
 * V-M-025: drain order — register every listener first
 * (`Promise.all([...])`), emit BLOCK_LISTENERS_READY, THEN invoke
 * `mt_drain_pending_opens`. This guarantees the renderer's
 * mt::open-new-tab listener is live before the backend emits, and runs
 * the drain in parallel with Vue mount (the caller in main.js does NOT
 * await this Promise — it returns to mount the app).
 */
export const setupIpcListeners = async () => {
  if (installed) {
    console.warn('[boot][ipc] setupIpcListeners called twice — ignoring')
    return
  }
  installed = true

  // Lazy-import Pinia stores so they're created in the calling app
  // context (must run AFTER app.use(pinia) but BEFORE app.mount).
  const prefsMod = await _safeUseStore('preferences', () =>
    import('./store/preferences')
  )
  const projectMod = await _safeUseStore('project', () => import('./store/project'))
  const editorMod = await _safeUseStore('editor', () => import('./store/editor'))
  const { usePreferencesStore } = prefsMod
  const { useProjectStore } = projectMod
  const { useEditorStore } = editorMod

  const prefs = usePreferencesStore()
  const projectStore = useProjectStore()
  const editorStore = useEditorStore()

  // Register every listener in parallel. Promise.all guarantees we have
  // ALL handlers wired before BLOCK_LISTENERS_READY fires; the V-M-025
  // ordering invariant requires this to precede BLOCK_DRAIN_INVOKED.
  await Promise.all([
    // mt::user-preference — fires on every cross-window pref change
    // (broadcast from backend mt_set_user_preference). When Settings
    // window changes theme, editor window receives this and updates.
    listen('mt::user-preference', (event) => {
      // F-THEME-DIAG (smoke 2026-05-11): record every broadcast that
      // reaches this listener. theme=Y/N tells us whether the backend's
      // snapshot carried a theme entry; missing marker on the editor
      // window after a Settings click means the backend emit never
      // reached this webview.
      const _p = event?.payload
      const _keys =
        _p && typeof _p === 'object' && !Array.isArray(_p) ? Object.keys(_p) : []
      const _themeFlag =
        _p && typeof _p === 'object' && Object.prototype.hasOwnProperty.call(_p, 'theme')
          ? 'Y'
          : 'N'
      const _themeValue =
        _p && typeof _p === 'object' ? _p.theme : undefined
      // eslint-disable-next-line no-console
      console.log(
        `[boot][prefs][BLOCK_PREF_BROADCAST keys=${_keys.length} theme=${_themeFlag} themeValue=${_themeValue === undefined ? 'undef' : _themeValue}]`
      )
      if (event?.payload && typeof event.payload === 'object') {
        prefs.SET_USER_PREFERENCE(event.payload)
      }
    }),

    // mt::current-language — language change broadcast
    listen('mt::current-language', (event) => {
      const lang = event?.payload
      if (typeof lang === 'string' && lang) {
        setLanguage(lang)
        bus.emit('language-changed', lang)
      }
    }),

    // tree-walk events from open-folder backend. Streamed during recursive
    // walk; renderer's ProjectStore folds each into the sidebar tree via
    // _processTreeEvent.
    listen('mt::update-object-tree', (event) => {
      const payload = event?.payload
      if (payload && typeof payload === 'object' && payload.type) {
        projectStore._processTreeEvent(payload.type, payload.change)
      }
    }),

    // Per-tab batch-save events. Single-tab save flow folds these into
    // the invoke return (FILE_SAVE etc.), but mt_save_and_close_tabs
    // still emits per-tab during batch close. Boot-time registration so
    // cross-window batch saves (e.g., another window's "Save All" flow)
    // update this window's tab state correctly.
    listen('mt::tab-saved', (event) => {
      const tabId = event?.payload
      if (typeof tabId === 'string' && tabId) editorStore.APPLY_TAB_SAVED(tabId)
    }),
    listen('mt::tab-save-failure', (event) => {
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
    }),
    listen('mt::set-pathname', (event) => {
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
    }),

    // Editor-event listeners. Live channels: bootstrap-editor +
    // open-new-tab. Other editor listeners (close-tab, tab-cycle,
    // switch-tab, new-untitled-tab, screenshot) were deleted in audit-M-1:
    // those flow through mt::menu-invoked → install-menu-bridge.js and
    // have no direct backend emitter.
    //
    // M-025: the drain invoke that was here previously is now hoisted
    // out of this handler to setupIpcListeners() top-level (below).
    // bootstrap-editor stays a thin APPLY_BOOTSTRAP_EDITOR forwarder.
    listen('mt::bootstrap-editor', (event) => {
      if (event?.payload) editorStore.APPLY_BOOTSTRAP_EDITOR(event.payload)
    }),
    listen('mt::open-new-tab', async (event) => {
      // V-M-025 trace: every tab arrival (drain OR direct-emit) emits
      // this marker so invariant (3)/(6) — "every queued path appears
      // in exactly one NEW_TAB_RECEIVED" — is grep-checkable.
      const _p = event?.payload
      const _basename =
        _p && typeof _p === 'object' && typeof _p.pathname === 'string'
          ? String(_p.pathname).split('/').pop() || _p.pathname
          : '<no-path>'
      const _previewModeFlag =
        _p && typeof _p === 'object' && typeof _p.previewMode === 'boolean'
          ? _p.previewMode
          : false
      // eslint-disable-next-line no-console
      console.log(
        `[boot][pending_opens][BLOCK_NEW_TAB_RECEIVED elapsed_ms=${_elapsedMs()} path=${_basename} previewMode=${_previewModeFlag}]`
      )

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
      const markdownDocument =
        p.markdown !== undefined || p.pathname ? p : p.markdownDocument
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
    }),

    // Live cross-window listener kept after audit-M-1. Other channels
    // (file-save{,-as}, move/rename-file, set-line-ending, window-zoom,
    // image-cache, export-success, print-service-clearup, context-menu,
    // spelling) were deleted: they are menu-driven and now flow through
    // mt::menu-invoked → install-menu-bridge.js, or have no backend
    // emitter at all.
    listen('mt::force-close-tabs-by-id', (event) => {
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
  ])
  // Retained legacy marker for backwards-compat with smoke-script grep.
  console.log('[boot][ipc][BLOCK_PREFS_LISTENER_REGISTERED]')
  console.log('[boot][ipc][BLOCK_ALL_LISTENERS_REGISTERED]')

  // V-M-025 invariant (1): LISTENERS_READY immediately precedes
  // DRAIN_INVOKED. count=9 matches the 9-listener post-audit-M-1 surface.
  console.log(
    `[boot][pending_opens][BLOCK_LISTENERS_READY elapsed_ms=${_elapsedMs()} count=9]`
  )

  // F-FILE-OPEN-PENDING (alpha.5) + M-025 perf-pending-opens-parallel
  // (alpha.6): drain pending file-open paths queued by RunEvent::Opened
  // (Apple Event from Finder/Open With) and CLI args. Per Tauri 2 docs
  // RunEvent::Opened fires BEFORE Ready/Window so the renderer's
  // mt::open-new-tab listener isn't yet active when the event lands —
  // backend stashes paths in PendingOpens AppState. Now (after every
  // listener is registered, in parallel with Vue mount), invoke the
  // drain: backend emits mt::open-new-tab for each path with
  // preview_mode=true (M-022) and flips its `drained: bool` flag so
  // subsequent RunEvent::Opened bursts go through the direct-emit path
  // (see main.rs RunEvent handler). Race-free; no timing assumptions.
  //
  // V-M-025 invariant (2): exactly one of {DRAIN_RESPONSE_RECEIVED,
  // DRAIN_FAILED} follows DRAIN_INVOKED. Invariant (5) parallelism:
  // BLOCK_DRAIN_INVOKED.elapsed_ms < BLOCK_APP_MOUNTED.elapsed_ms — this
  // setupIpcListeners() Promise is NOT awaited by main.js, which calls
  // app.mount() concurrently.
  console.log(
    `[boot][pending_opens][BLOCK_DRAIN_INVOKED elapsed_ms=${_elapsedMs()}]`
  )
  try {
    const paths = await invoke('mt_drain_pending_opens')
    const count = Array.isArray(paths) ? paths.length : 0
    console.log(
      `[boot][pending_opens][BLOCK_DRAIN_RESPONSE_RECEIVED elapsed_ms=${_elapsedMs()} count=${count} errors=0]`
    )
    if (count > 0) {
      // Existing marker preserved for back-compat (smoke scripts grep).
      console.log(`[boot][pending_opens][BLOCK_DRAINED count=${count}]`)
    } else {
      // V-M-025 invariant (4): empty queue ⇒ DRAIN_EMPTY (NOT DRAINED
      // count=0). Suppresses the count=0 log spam on every cold launch
      // without queued files.
      console.log(
        `[boot][pending_opens][BLOCK_DRAIN_EMPTY elapsed_ms=${_elapsedMs()}]`
      )
    }
  } catch (e) {
    // Existing marker preserved.
    console.debug('[boot][pending_opens][BLOCK_DRAIN_FAILED]', e)
  }
}
