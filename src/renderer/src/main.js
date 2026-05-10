// MUST be the FIRST import: installs window.fileUtils / window.electron /
// window.path / window.commandExists / window.i18nUtils / window.rgPath
// so v1.2.3-ported renderer code resolves these globals at script-eval
// time. Closes F-MAIN-ENTRY-DISABLED. See _shims/install-window-globals.js.
import './_shims/install-window-globals'
import { createApp } from 'vue'
import { createRouter, createWebHashHistory } from 'vue-router'
import bootstrapRenderer from './bootstrap'
import axios from './axios'
import pinia from './store'
import './assets/symbolIcon'

// Element Plus instead of Element UI for Vue 3
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import en from 'element-plus/es/locale/lang/en'

// I18n translation system
import i18nPlugin from './i18n'

// something is wrong here! \/
import services from './services/index'
import routes from './router'
import Main from './Main.vue'

import './assets/styles/index.css'
import './assets/styles/printService.css'

// F-MENU-WIRE-TAURI (B4-pre-alpha step-1): listen for native-menu
// invocations emitted by the Rust backend and dispatch them through
// the existing static command registry. Imported here so the bridge
// is wired before bootstrapRenderer kicks the rest of the app off.
import { installMenuBridge } from './menu-bridge'

// Register all boot-time Tauri event listeners ONCE in a single place
// (`bootstrap-ipc.js`). Replaces the per-action `ipcRenderer.on()`
// pattern that produced the listener-race bug (theme/lang broadcasts
// missed if backend emit beat subscribe).
import { setupIpcListeners } from './bootstrap-ipc'

// -----------------------------------------------

window.marktext = {}
bootstrapRenderer()
installMenuBridge()

// -----------------------------------------------
// Be careful when changing code before this line!

// Create Vue app
const app = createApp(Main)

// Configure Element Plus with locale
app.use(ElementPlus, {
  locale: en
})

const router = createRouter({
  history: createWebHashHistory(),
  // it seems like something might have changed in vue-router? it uses the full "file path" instead of
  // links like /editor if we use the old createWebHistory()
  routes: routes(window.marktext.env.type)
})

app.use(router)
app.use(pinia)
app.use(i18nPlugin)

// Configure axios globally
app.config.globalProperties.$http = axios

// Register services globally
services.forEach((s) => {
  app.config.globalProperties['$' + s.name] = s[s.name]
})

// Register Tauri event listeners AFTER pinia is installed (stores are
// usable inside setupIpcListeners) but BEFORE app.mount (so listeners
// are warm before any component invoke() triggers a backend broadcast).
// Returns a Promise; ignoring is OK here — listen() resolves quickly
// and any in-flight invoke that races us still gets caught when the
// listener finishes registration (Tauri buffers the emit briefly).
setupIpcListeners().catch((e) => console.error('[boot] setupIpcListeners failed:', e))

// -----------------------------------------------
// M-024 perf-splash: dismount helper.
//
// Removes the static #splash-root injected by index.html on first paint.
// Idempotent (HMR re-runs main.js → second call short-circuits with
// BLOCK_HMR_BYPASS). Aria-hidden flip BEFORE .remove() prevents
// screen-reader double-announcement. Cancels the index.html watchdog.
//
// Cross-module: V-M-030 bootMark() reads window.__BOOT_T0__ (set in
// index.html <head> BEFORE this module ever parses). Do NOT reassign.
// -----------------------------------------------
export const dismountSplash = () => {
  if (window.__SPLASH_REPLACED__) {
    console.log('[boot][splash] BLOCK_HMR_BYPASS')
    return false
  }
  const root = document.getElementById('splash-root')
  if (!root) {
    // Already gone (unexpected, but treat as no-op).
    window.__SPLASH_REPLACED__ = true
    return false
  }
  root.setAttribute('aria-hidden', 'true')
  root.remove()
  window.__SPLASH_REPLACED__ = true
  if (window.__SPLASH_WATCHDOG__) {
    clearTimeout(window.__SPLASH_WATCHDOG__)
    window.__SPLASH_WATCHDOG__ = null
  }
  console.log('[boot][splash] BLOCK_REPLACED', performance.now())
  // Dev-only orphan check: if a second #splash-root exists (e.g. accidental
  // duplicate insertion), surface it so we don't leave invisible DOM behind.
  if (process.env.NODE_ENV !== 'production') {
    const orphan = document.getElementById('splash-root')
    if (orphan) {
      console.log('[boot][splash] BLOCK_ORPHAN_DETECTED')
    }
  }
  return true
}

// Mount the app
const mounted = app.mount('#app')
console.log('[boot][splash] BLOCK_VUE_READY', performance.now())
// Dismount synchronously after mount returns. Vue 3 mount is sync (returns
// the root component instance once the initial render has flushed), so the
// splash is replaced on the same task as first paint — no extra frame.
try {
  dismountSplash()
} catch (e) {
  console.log('[boot][splash] BLOCK_VUE_FAILED', (e && e.message) || String(e))
}
// Avoid unused-var lint on `mounted` while keeping the assignment for HMR
// clarity (Vue HMR can read the returned root instance).
void mounted
