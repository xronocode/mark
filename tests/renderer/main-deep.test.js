/**
 * Deep coverage tests for src/renderer/src/main.js
 *
 * Tests the app creation, plugin registration, service registration,
 * and mount flow by mocking all heavy dependencies.
 */

// Mock all imports before they're loaded

vi.mock('@/bootstrap', () => ({
  default: vi.fn(() => {
    // main.js sets window.marktext = {} right before calling bootstrapRenderer(),
    // so we set env here to match the real bootstrap behavior
    window.marktext.env = { type: 'editor' }
  })
}))

vi.mock('@/menu-bridge', () => ({
  installMenuBridge: vi.fn()
}))

vi.mock('@/bootstrap-ipc', () => ({
  setupIpcListeners: vi.fn(async () => undefined)
}))

vi.mock('@/_shims/install-window-globals', () => ({}))

vi.mock('@/assets/symbolIcon', () => ({}))

vi.mock('@/assets/styles/index.css', () => ({}))
vi.mock('@/assets/styles/printService.css', () => ({}))
vi.mock('element-plus/dist/index.css', () => ({}))

vi.mock('@/axios', () => ({
  default: { get: vi.fn(), post: vi.fn() }
}))

vi.mock('@/store', () => {
  const { createPinia } = require('pinia')
  return { default: createPinia() }
})

vi.mock('@/i18n', () => ({
  default: { install: vi.fn() },
  i18n: { global: { t: (k) => k } },
  t: (k) => k,
  setLanguage: vi.fn()
}))

vi.mock('@/services/index', () => ({
  default: [
    {
      name: 'notification',
      notification: { notify: vi.fn() }
    }
  ]
}))

vi.mock('@/router', () => ({
  default: vi.fn(() => [
    { path: '/', component: {} }
  ])
}))

vi.mock('@/Main.vue', () => ({
  default: { template: '<div id="app"><router-view /></div>' }
}))

// Mock element-plus components
vi.mock('element-plus/es/make-installer.mjs', () => ({
  makeInstaller: vi.fn(() => ({ install: vi.fn() }))
}))

vi.mock('element-plus/es/components/autocomplete/index.mjs', () => ({ ElAutocomplete: {} }))
vi.mock('element-plus/es/components/button/index.mjs', () => ({ ElButton: {} }))
vi.mock('element-plus/es/components/checkbox/index.mjs', () => ({ ElCheckbox: {} }))
vi.mock('element-plus/es/components/col/index.mjs', () => ({ ElCol: {} }))
vi.mock('element-plus/es/components/dialog/index.mjs', () => ({ ElDialog: {} }))
vi.mock('element-plus/es/components/form/index.mjs', () => ({ ElForm: {}, ElFormItem: {} }))
vi.mock('element-plus/es/components/input/index.mjs', () => ({ ElInput: {} }))
vi.mock('element-plus/es/components/input-number/index.mjs', () => ({ ElInputNumber: {} }))
vi.mock('element-plus/es/components/radio/index.mjs', () => ({ ElRadio: {}, ElRadioGroup: {} }))
vi.mock('element-plus/es/components/row/index.mjs', () => ({ ElRow: {} }))
vi.mock('element-plus/es/components/select/index.mjs', () => ({ ElSelect: {}, ElOption: {} }))
vi.mock('element-plus/es/components/slider/index.mjs', () => ({ ElSlider: {} }))
vi.mock('element-plus/es/components/switch/index.mjs', () => ({ ElSwitch: {} }))
vi.mock('element-plus/es/components/table/index.mjs', () => ({ ElTable: {}, ElTableColumn: {} }))
vi.mock('element-plus/es/components/tabs/index.mjs', () => ({ ElTabs: {}, ElTabPane: {} }))
vi.mock('element-plus/es/components/tooltip/index.mjs', () => ({ ElTooltip: {} }))
vi.mock('element-plus/es/components/tree/index.mjs', () => ({ ElTree: {} }))
vi.mock('element-plus/es/locale/lang/en', () => ({ default: {} }))

// Mock vue's createApp to intercept the app creation
const mockApp = {
  use: vi.fn().mockReturnThis(),
  component: vi.fn().mockReturnThis(),
  mount: vi.fn(),
  config: { globalProperties: {} }
}

vi.mock('vue', async () => {
  const actual = await vi.importActual('vue')
  return {
    ...actual,
    createApp: vi.fn(() => mockApp)
  }
})

vi.mock('vue-router', async () => {
  const actual = await vi.importActual('vue-router')
  return {
    ...actual,
    createRouter: vi.fn(() => ({ install: vi.fn() })),
    createWebHashHistory: vi.fn(() => ({}))
  }
})

describe('main.js — app creation flow', () => {
  // main.js runs top-level side-effects on first import (module cache),
  // so all assertions must live in a single test to avoid cache issues.
  it('creates app, registers plugins, services, axios, and mounts', async () => {
    const { createApp } = await import('vue')
    const bootstrapRenderer = (await import('@/bootstrap')).default
    const { installMenuBridge } = await import('@/menu-bridge')
    const { setupIpcListeners } = await import('@/bootstrap-ipc')

    // Import main.js to trigger the entire setup
    await import('@/main.js')

    // bootstrapRenderer should have been called
    expect(bootstrapRenderer).toHaveBeenCalled()

    // installMenuBridge should have been called
    expect(installMenuBridge).toHaveBeenCalled()

    // createApp should have been called with Main component
    expect(createApp).toHaveBeenCalled()

    // app.use should have been called for ElementPlus, router, pinia, i18n
    expect(mockApp.use).toHaveBeenCalled()
    expect(mockApp.use.mock.calls.length).toBeGreaterThanOrEqual(4)

    // app.mount should have been called with '#app'
    expect(mockApp.mount).toHaveBeenCalledWith('#app')

    // setupIpcListeners should have been called
    expect(setupIpcListeners).toHaveBeenCalled()

    // window.marktext should be set
    expect(window.marktext).toBeDefined()

    // window.__BOOT_T0__ should be set
    expect(window.__BOOT_T0__).toBeDefined()
    expect(typeof window.__BOOT_T0__).toBe('number')

    // Services registered as global properties
    expect(mockApp.config.globalProperties.$notification).toBeDefined()

    // Axios registered as $http global property
    expect(mockApp.config.globalProperties.$http).toBeDefined()
  })
})
