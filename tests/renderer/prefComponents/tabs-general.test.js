/**
 * Tests for src/renderer/src/prefComponents/tabs/general/index.vue (C-38 T-004)
 *
 * Covers: every IA §3.1 row renders in its group order (by label key),
 * the macOS default-handler group gating, autoSaveDelay seconds↔ms
 * conversion, the Updates row (version label + file.check-update
 * dispatch), the C-66 automatic-check switch (autoCheckUpdates), and
 * dropped-key rows staying absent.
 */

import { mount, flushPromises } from '@vue/test-utils'
import { setupTestPinia } from '../pinia'

const osState = vi.hoisted(() => ({ isOsx: true }))

vi.mock('@/util', () => ({
  get isOsx () { return osState.isOsx },
  get isWindows () { return !osState.isOsx },
  isLinux: false,
  delay: vi.fn(), serialize: vi.fn(), merge: vi.fn()
}))

vi.mock('@/i18n', () => ({ t: (key) => key, setLanguage: vi.fn() }))
vi.mock('vue-i18n', () => ({
  // Interpolating identity: params become visible in the rendered text.
  useI18n: () => ({ t: (key, params) => (params ? `${key} ${JSON.stringify(params)}` : key) }),
  createI18n: vi.fn(() => ({ global: { locale: { value: 'en' } } }))
}))

vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: vi.fn() },
  ElMessageBox: { confirm: vi.fn() }
}))

vi.mock('@/bus', () => ({ default: { on: vi.fn(), emit: vi.fn(), off: vi.fn() } }))
vi.mock('@/services/notification', () => ({ default: { notify: vi.fn() } }))

vi.mock('common/encoding', () => ({
  ENCODING_NAME_MAP: Object.freeze({ utf8: 'UTF-8', gbk: 'GBK' })
}))

vi.mock('@tauri-apps/api/app', () => ({ getVersion: vi.fn(async () => '9.9.9') }))

const { installSignedUpdate, invokeMock } = vi.hoisted(() => ({
  installSignedUpdate: vi.fn(async () => {}),
  invokeMock: vi.fn()
}))
vi.mock('@/commands', () => ({ default: [], installSignedUpdate }))
vi.mock('@tauri-apps/api/core', () => ({ invoke: invokeMock }))

import GeneralTab from '@/prefComponents/tabs/general/index.vue'
import { usePreferencesStore } from '@/store/preferences'

// Stubs render the label/help props so order and presence are assertable.
const rowStub = {
  props: ['description', 'help', 'value', 'bool', 'options', 'disable', 'onChange'],
  template: '<div class="row-stub" :data-desc="description">{{ description }}{{ help ? "|" + help : "" }}</div>'
}
const buttonRowStub = {
  props: ['description', 'help', 'value', 'danger', 'disable', 'onClick'],
  template: '<div class="row-stub row-button" :data-desc="description">{{ description }}{{ help ? "|" + help : "" }}|{{ value }}</div>'
}
const globalStubs = {
  compound: { template: '<section class="group-stub"><slot name="head"/><slot name="children"/></section>' },
  bool: rowStub,
  'cur-select': rowStub,
  range: rowStub,
  'button-row': buttonRowStub
}

const mountTab = () => mount(GeneralTab, { global: { stubs: globalStubs } })

const rowKeys = (wrapper) => wrapper.findAll('.row-stub').map((r) => r.attributes('data-desc'))
const groupTitles = (wrapper) => wrapper.findAll('.group-stub h6.title').map((h) => h.text())

describe('tabs/general — C-38 T-004 content', () => {
  let wrapper

  beforeEach(() => {
    setupTestPinia()
    installSignedUpdate.mockClear()
    invokeMock.mockReset()
    osState.isOsx = true
  })

  afterEach(() => {
    wrapper?.unmount()
  })

  it('renders every IA §3.1 row in order (macOS: integration group first)', () => {
    wrapper = mountTab()
    // The Updates row's label is the computed `Mark <version>` label, not a
    // locale key; its presence is pinned by the help key on the same row.
    const keys = rowKeys(wrapper)
    expect(keys.slice(0, 7)).toEqual([
      'preferences.general.macosIntegration.defaultForMd',
      'preferences.general.startup.previewModeOnFinderOpen',
      'preferences.general.language.appLanguage',
      'preferences.general.filesAndSaving.autoSave',
      'preferences.general.filesAndSaving.autoSaveDelay',
      'preferences.general.filesAndSaving.defaultEncoding',
      'preferences.general.filesAndSaving.endOfLine'
    ])
    const updatesRow = wrapper.findAllComponents('.row-button').at(-1)
    expect(updatesRow.text()).toContain('preferences.general.updates.help')
  })

  it('renders the group titles in IA order', () => {
    wrapper = mountTab()
    expect(groupTitles(wrapper)).toEqual([
      'preferences.general.macosIntegration.title',
      'preferences.general.startup.title',
      'preferences.general.language.title',
      'preferences.general.filesAndSaving.title',
      'preferences.general.updates.title'
    ])
  })

  it('hides the macOS integration group off macOS', () => {
    osState.isOsx = false
    wrapper = mountTab()
    expect(groupTitles(wrapper)).not.toContain('preferences.general.macosIntegration.title')
    expect(groupTitles(wrapper)[0]).toBe('preferences.general.startup.title')
  })

  it('hides the macOS integration group when the capability is off', () => {
    const store = usePreferencesStore()
    store.buildCapabilities = { ...store.buildCapabilities, setDefaultHandler: false }
    wrapper = mountTab()
    expect(groupTitles(wrapper)).not.toContain('preferences.general.macosIntegration.title')
  })

  it('hides the Updates group when the updater capability is off', () => {
    const store = usePreferencesStore()
    store.buildCapabilities = { ...store.buildCapabilities, updater: false }
    wrapper = mountTab()
    expect(groupTitles(wrapper)).not.toContain('preferences.general.updates.title')
  })

  it('shows the running version and reports the check IN THE ROW (no toast): checking → up to date', async () => {
    let resolveCheck
    invokeMock.mockImplementation((cmd) => cmd === 'mt_updater_check'
      ? new Promise((r) => { resolveCheck = r })
      : Promise.resolve(null))
    wrapper = mountTab()
    await flushPromises()
    const row = () => wrapper.findAllComponents('.row-button').at(-1)
    expect(row().text()).toContain('Mark 9.9.9')
    expect(row().text()).toContain('preferences.general.updates.help')
    const click = row().props('onClick')()
    await flushPromises()
    // While checking: help + button say «checking», the button is disabled,
    // and a second click does not start a second check.
    expect(row().props('disable')).toBe(true)
    expect(row().text()).toContain('preferences.general.updates.checking')
    await row().props('onClick')()
    expect(invokeMock.mock.calls.filter((c) => c[0] === 'mt_updater_check').length).toBe(1)
    resolveCheck({ currentVersion: '9.9.9', available: false })
    await click
    await flushPromises()
    expect(row().props('disable')).toBe(false)
    expect(row().text()).toContain('preferences.general.updates.upToDate')
  })

  it('an available update turns the button into Install, which runs the shared signed flow', async () => {
    const status = { currentVersion: '9.9.9', available: true, latestVersion: '10.0.0' }
    invokeMock.mockImplementation(async (cmd) => (cmd === 'mt_updater_check' ? status : null))
    wrapper = mountTab()
    await flushPromises()
    const row = () => wrapper.findAllComponents('.row-button').at(-1)
    await row().props('onClick')()
    await flushPromises()
    expect(row().text()).toContain('preferences.general.updates.available')
    expect(row().text()).toContain('preferences.general.updates.install')
    await row().props('onClick')()
    await flushPromises()
    expect(installSignedUpdate).toHaveBeenCalledWith(status)
  })

  it('a feed error or a thrown check reports «failed» in the row', async () => {
    invokeMock.mockImplementation(async (cmd) => (cmd === 'mt_updater_check'
      ? { currentVersion: '9.9.9', available: false, statusNote: 'update check failed: offline' }
      : null))
    wrapper = mountTab()
    await flushPromises()
    const row = () => wrapper.findAllComponents('.row-button').at(-1)
    await row().props('onClick')()
    await flushPromises()
    expect(row().text()).toContain('preferences.general.updates.failed')
    invokeMock.mockImplementation(async () => { throw new Error('ipc down') })
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    await row().props('onClick')()
    await flushPromises()
    expect(row().text()).toContain('preferences.general.updates.failed')
    err.mockRestore()
  })

  // C-66 T-003: the automatic-check switch opens the Updates group.
  it('renders the C-66 automatic-check switch bound to autoCheckUpdates', async () => {
    const store = usePreferencesStore()
    const spy = vi.spyOn(store, 'SET_SINGLE_PREFERENCE')
    wrapper = mountTab()
    const autoRow = wrapper
      .findAllComponents('.row-stub')
      .find((c) => c.props('description') === 'preferences.general.updates.autoCheck')
    expect(autoRow).toBeTruthy()
    expect(autoRow.text()).toContain('preferences.general.updates.autoCheckHelp')
    expect(autoRow.props('bool')).toBe(true)
    await autoRow.props('onChange')(false)
    expect(spy).toHaveBeenCalledWith({ type: 'autoCheckUpdates', value: false })
  })

  // ── autoSaveDelay seconds↔milliseconds (IA §4.6) ────────────────────

  it('shows the delay in seconds and converts back to ms on change', async () => {
    const store = usePreferencesStore()
    store.autoSaveDelay = 1500
    wrapper = mountTab()
    // range stub receives the seconds value (1.5), not the stored ms.
    const delayRow = wrapper.findAllComponents('.row-stub').find((c) => c.props('description') === 'preferences.general.filesAndSaving.autoSaveDelay')
    expect(delayRow.attributes('data-desc')).toBeTruthy()
    await wrapper.vm.onAutoSaveDelayChange(2.5)
    expect(store.autoSaveDelay).toBe(2500)
  })

  it('onAutoSaveDelayChange persists through SET_SINGLE_PREFERENCE', async () => {
    const store = usePreferencesStore()
    const spy = vi.spyOn(store, 'SET_SINGLE_PREFERENCE')
    wrapper = mountTab()
    await wrapper.vm.onAutoSaveDelayChange(1)
    expect(spy).toHaveBeenCalledWith({ type: 'autoSaveDelay', value: 1000 })
  })

  // ── default-handler bindings (M-021) ────────────────────────────────

  it('status help reflects the current default handler', async () => {
    const store = usePreferencesStore()
    store.defaultMdHandler = { isDefault: false, currentHandler: 'Typora' }
    wrapper = mountTab()
    expect(wrapper.vm.defaultHandlerStatus).toContain('Typora')
    store.defaultMdHandler = { isDefault: true, currentHandler: 'Mark' }
    await flushPromises()
    expect(wrapper.vm.defaultHandlerStatus).toBe('preferences.general.macosIntegration.statusIsDefault')
  })

  it('refreshes the default handler on mount (macOS only)', async () => {
    const store = usePreferencesStore()
    const spy = vi.spyOn(store, 'REFRESH_DEFAULT_MD_HANDLER').mockResolvedValue(undefined)
    wrapper = mountTab()
    await flushPromises()
    expect(spy).toHaveBeenCalled()

    wrapper.unmount()
    osState.isOsx = false
    spy.mockClear()
    wrapper = mountTab()
    await flushPromises()
    expect(spy).not.toHaveBeenCalled()
  })

  // ── dropped keys stay out of the UI (IA §4.1) ───────────────────────

  it('renders none of the dropped dead preferences', () => {
    wrapper = mountTab()
    const text = wrapper.text()
    for (const dead of ['startUpAction', 'restoreLayoutState', 'defaultDirectoryToOpen', 'openFilesInNewWindow', 'openFolderInNewWindow', 'fileSortBy', 'treePathExcludePatterns']) {
      expect(text).not.toContain(dead)
    }
  })
})
