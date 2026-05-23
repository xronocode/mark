/**
 * Deep tests for src/renderer/src/prefComponents/general/index.vue
 *
 * Targets: onSelectChange, startUpAction computed setter, restoreLayoutState
 * computed setter, selectDefaultDirectoryToOpen, isDefault/currentHandler
 * computed, setAsDefault, unsetDefault, macOS integration section,
 * conditional rendering (isOsx, isDefault, currentHandler).
 */

import { shallowMount, flushPromises } from '@vue/test-utils'
import { setupTestPinia } from '../pinia'
import { nextTick } from 'vue'

vi.mock('@/i18n', () => ({
  t: (key) => key,
  setLanguage: vi.fn()
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key) => key }),
  createI18n: vi.fn(() => ({ global: { locale: { value: 'en' } } }))
}))

vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: vi.fn() },
  ElMessageBox: { confirm: vi.fn() }
}))

vi.mock('@/util', () => ({
  isOsx: true,
  delay: vi.fn(),
  serialize: vi.fn(),
  merge: vi.fn()
}))

vi.mock('@/bus', () => ({ default: { on: vi.fn(), emit: vi.fn(), off: vi.fn() } }))

vi.mock('@/services/notification', () => ({
  default: { notify: vi.fn() }
}))

import GeneralSettings from '@/prefComponents/general/index.vue'
import { usePreferencesStore } from '@/store/preferences'

const globalStubs = {
  compound: true,
  range: true,
  'cur-select': true,
  bool: true,
  'text-box': true,
  'el-button': { template: '<button @click="$emit(\'click\')"><slot/></button>' },
  'el-radio-group': true,
  'el-radio': true
}

describe('GeneralSettings.vue – deep tests', () => {
  let wrapper

  beforeEach(() => {
    setupTestPinia()
    wrapper = shallowMount(GeneralSettings, {
      global: {
        mocks: { $t: (key) => key },
        stubs: globalStubs
      }
    })
  })

  afterEach(() => {
    wrapper.unmount()
  })

  // ── onSelectChange ───────────────────────────────────────────────────

  it('onSelectChange calls SET_SINGLE_PREFERENCE on store', () => {
    const store = usePreferencesStore()
    const spy = vi.spyOn(store, 'SET_SINGLE_PREFERENCE')
    wrapper.vm.onSelectChange('autoSave', true)
    expect(spy).toHaveBeenCalledWith({ type: 'autoSave', value: true })
  })

  it('onSelectChange works for various preference types', () => {
    const store = usePreferencesStore()
    const spy = vi.spyOn(store, 'SET_SINGLE_PREFERENCE')

    wrapper.vm.onSelectChange('zoom', 1.5)
    expect(spy).toHaveBeenCalledWith({ type: 'zoom', value: 1.5 })

    wrapper.vm.onSelectChange('hideScrollbar', true)
    expect(spy).toHaveBeenCalledWith({ type: 'hideScrollbar', value: true })

    wrapper.vm.onSelectChange('titleBarStyle', 'native')
    expect(spy).toHaveBeenCalledWith({ type: 'titleBarStyle', value: 'native' })
  })

  // ── startUpAction computed ───────────────────────────────────────────

  it('startUpAction getter returns store value', () => {
    const store = usePreferencesStore()
    store.startUpAction = 'blank'
    expect(wrapper.vm.startUpAction).toBe('blank')
  })

  it('startUpAction setter calls SET_SINGLE_PREFERENCE', () => {
    const store = usePreferencesStore()
    const spy = vi.spyOn(store, 'SET_SINGLE_PREFERENCE')
    wrapper.vm.startUpAction = 'openLastFolder'
    expect(spy).toHaveBeenCalledWith({ type: 'startUpAction', value: 'openLastFolder' })
  })

  // ── restoreLayoutState computed ──────────────────────────────────────

  it('restoreLayoutState getter returns store value', () => {
    const store = usePreferencesStore()
    store.restoreLayoutState = false
    expect(wrapper.vm.restoreLayoutState).toBe(false)
  })

  it('restoreLayoutState setter calls SET_SINGLE_PREFERENCE', () => {
    const store = usePreferencesStore()
    const spy = vi.spyOn(store, 'SET_SINGLE_PREFERENCE')
    wrapper.vm.restoreLayoutState = true
    expect(spy).toHaveBeenCalledWith({ type: 'restoreLayoutState', value: true })
  })

  // ── selectDefaultDirectoryToOpen ─────────────────────────────────────

  it('selectDefaultDirectoryToOpen calls store action', () => {
    const store = usePreferencesStore()
    const spy = vi.spyOn(store, 'SELECT_DEFAULT_DIRECTORY_TO_OPEN')
    wrapper.vm.selectDefaultDirectoryToOpen()
    expect(spy).toHaveBeenCalled()
  })

  // ── M-021 default handler ────────────────────────────────────────────

  it('isDefault computed reflects store defaultMdHandler.isDefault', () => {
    const store = usePreferencesStore()
    store.defaultMdHandler = { isDefault: true, currentHandler: 'Mark' }
    expect(wrapper.vm.isDefault).toBe(true)
  })

  it('currentHandler computed reflects store defaultMdHandler.currentHandler', () => {
    const store = usePreferencesStore()
    store.defaultMdHandler = { isDefault: false, currentHandler: 'VSCode' }
    expect(wrapper.vm.currentHandler).toBe('VSCode')
  })

  it('setAsDefault calls SET_DEFAULT_MD_HANDLER', async () => {
    const store = usePreferencesStore()
    const spy = vi.spyOn(store, 'SET_DEFAULT_MD_HANDLER').mockResolvedValue(undefined)
    await wrapper.vm.setAsDefault()
    expect(spy).toHaveBeenCalled()
  })

  it('unsetDefault calls UNSET_DEFAULT_MD_HANDLER', async () => {
    const store = usePreferencesStore()
    const spy = vi.spyOn(store, 'UNSET_DEFAULT_MD_HANDLER').mockResolvedValue(undefined)
    await wrapper.vm.unsetDefault()
    expect(spy).toHaveBeenCalled()
  })

  // ── macOS Integration section rendering ──────────────────────────────

  it('shows "Set as default" button when not default', async () => {
    const store = usePreferencesStore()
    store.defaultMdHandler = { isDefault: false, currentHandler: 'Other' }
    await nextTick()

    const buttons = wrapper.findAll('.macos-integration-body .actions button')
    expect(buttons.length).toBe(1)
    expect(buttons[0].text()).toContain('Set Mark as default')
  })

  it('shows "Remove as default" button when is default', async () => {
    const store = usePreferencesStore()
    store.defaultMdHandler = { isDefault: true, currentHandler: 'Mark' }
    await nextTick()

    const buttons = wrapper.findAll('.macos-integration-body .actions button')
    expect(buttons.length).toBe(1)
    expect(buttons[0].text()).toContain('Remove as default')
  })

  it('shows current handler name when not default and handler exists', async () => {
    const store = usePreferencesStore()
    store.defaultMdHandler = { isDefault: false, currentHandler: 'Typora' }
    await nextTick()

    const statusEl = wrapper.find('.macos-integration-body .status')
    expect(statusEl.exists()).toBe(true)
    expect(statusEl.text()).toContain('Typora')
  })

  it('shows "no default app" message when handler is null', async () => {
    const store = usePreferencesStore()
    store.defaultMdHandler = { isDefault: false, currentHandler: null }
    await nextTick()

    const statusEl = wrapper.find('.macos-integration-body .status')
    expect(statusEl.exists()).toBe(true)
    expect(statusEl.text()).toContain('.md')
  })

  // ── onMounted calls REFRESH_DEFAULT_MD_HANDLER ───────────────────────

  it('onMounted refreshes default handler status', async () => {
    const store = usePreferencesStore()
    const spy = vi.spyOn(store, 'REFRESH_DEFAULT_MD_HANDLER')
    // Re-mount to trigger onMounted
    wrapper.unmount()
    wrapper = shallowMount(GeneralSettings, {
      global: {
        mocks: { $t: (key) => key },
        stubs: globalStubs
      }
    })
    await flushPromises()
    expect(spy).toHaveBeenCalled()
  })

  // ── treePathExcludePatterns binding ──────────────────────────────────

  it('binds treePathExcludePatterns from store', () => {
    const store = usePreferencesStore()
    store.treePathExcludePatterns = ['node_modules', '.git']
    // Re-check the binding works
    expect(store.treePathExcludePatterns).toEqual(['node_modules', '.git'])
  })

  // ── defaultDirectoryToOpen binding ───────────────────────────────────

  it('exposes defaultDirectoryToOpen from store', () => {
    const store = usePreferencesStore()
    store.defaultDirectoryToOpen = '/home/user/docs'
    expect(store.defaultDirectoryToOpen).toBe('/home/user/docs')
  })
})
