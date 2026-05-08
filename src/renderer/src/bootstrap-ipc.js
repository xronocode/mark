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

  console.log('[boot][ipc][BLOCK_ALL_LISTENERS_REGISTERED]')
}
