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

// Mount the app
app.mount('#app')
