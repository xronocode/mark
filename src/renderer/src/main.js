import { createApp } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'
import bootstrapRenderer from './bootstrap'
import axios from './axios'
import pinia from './store'
import './assets/symbolIcon'

// Element Plus instead of Element UI for Vue 3
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import en from 'element-plus/es/locale/lang/en'

// something is wrong here! \/
import services from './services/index'
import routes from './router'
import Main from './Main.vue'

import './assets/styles/index.css'
import './assets/styles/printService.css'

// -----------------------------------------------

global.marktext = {}
bootstrapRenderer()

// -----------------------------------------------
// Be careful when changing code before this line!

// Create Vue app
const app = createApp(Main)

// Configure Element Plus with locale
app.use(ElementPlus, {
  locale: en
})

const router = createRouter({
  history: createWebHistory(),
  routes: routes(global.marktext.env.type)
})

app.use(router)
app.use(pinia)

// Configure axios globally
app.config.globalProperties.$http = axios

// Register services globally
services.forEach((s) => {
  app.config.globalProperties['$' + s.name] = s[s.name]
})

// Mount the app
app.mount('#app')
