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

// Element Plus — deep per-component imports for tree-shaking
import { makeInstaller } from 'element-plus/es/make-installer.mjs'
import { ElAutocomplete } from 'element-plus/es/components/autocomplete/index.mjs'
import { ElButton } from 'element-plus/es/components/button/index.mjs'
import { ElCheckbox } from 'element-plus/es/components/checkbox/index.mjs'
import { ElCol } from 'element-plus/es/components/col/index.mjs'
import { ElDialog } from 'element-plus/es/components/dialog/index.mjs'
import { ElForm, ElFormItem } from 'element-plus/es/components/form/index.mjs'
import { ElInput } from 'element-plus/es/components/input/index.mjs'
import { ElInputNumber } from 'element-plus/es/components/input-number/index.mjs'
import { ElRadio, ElRadioGroup } from 'element-plus/es/components/radio/index.mjs'
import { ElRow } from 'element-plus/es/components/row/index.mjs'
import { ElSelect, ElOption } from 'element-plus/es/components/select/index.mjs'
import { ElSlider } from 'element-plus/es/components/slider/index.mjs'
import { ElSwitch } from 'element-plus/es/components/switch/index.mjs'
import { ElTable, ElTableColumn } from 'element-plus/es/components/table/index.mjs'
import { ElTabs, ElTabPane } from 'element-plus/es/components/tabs/index.mjs'
import { ElTooltip } from 'element-plus/es/components/tooltip/index.mjs'
import { ElTree } from 'element-plus/es/components/tree/index.mjs'
import 'element-plus/dist/index.css'
import en from 'element-plus/es/locale/lang/en'

const ElementPlusPartial = makeInstaller([
  ElAutocomplete, ElButton, ElCheckbox, ElCol, ElDialog,
  ElForm, ElFormItem, ElInput, ElInputNumber, ElOption,
  ElRadio, ElRadioGroup, ElRow, ElSelect, ElSlider,
  ElSwitch, ElTabPane, ElTable, ElTableColumn, ElTabs,
  ElTooltip, ElTree
])

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

app.use(ElementPlusPartial, { locale: en })

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

// Mount the app. Splash stays visible until app.vue applies the theme
// and calls dismountSplash() — this prevents the white flash between
// splash removal and theme CSS injection.
const mounted = app.mount('#app')
console.log('[boot][splash] BLOCK_VUE_READY', performance.now())
void mounted
