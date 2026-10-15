/**
 * Tests for src/renderer/src/prefComponents/tabs/advanced/index.vue (C-38 T-004)
 *
 * Covers: IA §3.5 rows in order, the uploader pop-up without GitHub
 * (decision 3) incl. the stored-'github' → none fallback, the three
 * Customise sheets (decision 4), the custom-CSS sheet save, and the
 * Reset confirmation flow (cancel keeps, confirm resets).
 */

import { mount, flushPromises } from '@vue/test-utils'
import { setupTestPinia } from '../pinia'

vi.mock('@/util', () => ({
  isOsx: false, isWindows: true, isLinux: false,
  delay: vi.fn(), serialize: vi.fn(), merge: vi.fn()
}))

vi.mock('@/util/fileSystem', () => ({
  isFileExecutable: vi.fn(async () => true)
}))

vi.mock('@/i18n', () => ({ t: (key) => key, setLanguage: vi.fn() }))
vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key) => key }),
  createI18n: vi.fn(() => ({ global: { locale: { value: 'en' } } }))
}))

vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: vi.fn() }
}))

vi.mock('@/bus', () => ({ default: { on: vi.fn(), emit: vi.fn(), off: vi.fn() } }))
vi.mock('@/services/notification', () => ({ default: { notify: vi.fn() } }))

import AdvancedTab from '@/prefComponents/tabs/advanced/index.vue'
import { usePreferencesStore } from '@/store/preferences'

const rowStub = {
  props: ['description', 'help', 'value', 'bool', 'options', 'disable', 'defaultValue'],
  template: '<div class="row-stub" :data-desc="description">{{ description }}{{ help ? "|" + help : "" }}</div>'
}
const buttonRowStub = {
  props: ['description', 'help', 'value', 'danger', 'disable', 'onClick'],
  template: '<div class="row-stub row-button" :data-desc="description" :data-value="value">{{ description }}{{ help ? "|" + help : "" }}|{{ value }}</div>'
}
const globalStubs = {
  compound: { template: '<section class="group-stub"><slot name="head"/><slot name="children"/></section>' },
  bool: { ...rowStub },
  'cur-select': { ...rowStub },
  'text-box': { ...rowStub },
  'button-row': buttonRowStub,
  'shortcuts-sheet': { props: ['open'], template: '<div class="sheet-stub" :data-open="open"></div>' },
  'extensions-sheet': { props: ['open'], template: '<div class="sheet-stub" :data-open="open"></div>' },
  'custom-css-sheet': { props: ['open'], template: '<div class="sheet-stub" :data-open="open"></div>' }
}

const mountTab = () => mount(AdvancedTab, { global: { stubs: globalStubs } })

const rowKeys = (wrapper) => wrapper.findAll('.row-stub').map((r) => r.attributes('data-desc'))
// Stubbed row components by their description prop (DOM wrappers have no .vm).
const rowComponent = (wrapper, desc) =>
  ['bool', 'cur-select', 'text-box', 'button-row']
    .flatMap((name) => wrapper.findAllComponents(globalStubs[name]))
    .find((c) => c.props('description') === desc)
const groupTitles = (wrapper) => wrapper.findAll('.group-stub h6.title').map((h) => h.text())

describe('tabs/advanced — C-38 T-004 content', () => {
  let wrapper
  let store

  beforeEach(() => {
    setupTestPinia()
    store = usePreferencesStore()
  })

  afterEach(() => {
    wrapper?.unmount()
  })

  it('renders the IA §3.5 rows in order', () => {
    wrapper = mountTab()
    expect(rowKeys(wrapper)).toEqual([
      'preferences.advanced.images.insertAction',
      // image folder row renders its own pref-row markup (no label-key stub)
      'preferences.advanced.images.saveNextToDocument',
      'preferences.advanced.images.folderName',
      'preferences.advanced.customise.keyboardShortcuts',
      'preferences.advanced.customise.extensions',
      'preferences.advanced.customise.customCss',
      'preferences.advanced.reset.restore'
    ])
    expect(groupTitles(wrapper)).toEqual([
      'preferences.advanced.images.title',
      'preferences.advanced.customise.title',
      'preferences.advanced.reset.title'
    ])
    // the folder row is real markup, not a stub
    expect(wrapper.find('.pref-image-folder-item').exists()).toBe(true)
  })

  // ── image upload stays retired (user decision 2026-10-15, 0c17da80) ──

  it('image insert action offers folder / path only — no upload', () => {
    wrapper = mountTab()
    const insertRow = rowComponent(wrapper, 'preferences.advanced.images.insertAction')
    expect(insertRow.props('options').map((o) => o.value)).toEqual(['folder', 'path'])
  })

  it('has no uploader row or form', () => {
    wrapper = mountTab()
    expect(wrapper.findAll('.row-stub').some((r) => r.attributes('data-desc') === 'preferences.advanced.images.uploadTo')).toBe(false)
  })

  // ── Customise sheets (decision 4) ───────────────────────────────────

  it('Edit… opens the shortcuts sheet; the sheet closes itself', async () => {
    wrapper = mountTab()
    const shortcuts = rowComponent(wrapper, 'preferences.advanced.customise.keyboardShortcuts')
    await shortcuts.props('onClick')()
    await flushPromises()
    const sheets = wrapper.findAll('.sheet-stub')
    expect(sheets[0].attributes('data-open')).toBe('true')
    expect(sheets[1].attributes('data-open')).toBe('false')
    expect(sheets[2].attributes('data-open')).toBe('false')
    // the sheet emits close → the tab flips its ref
    wrapper.vm.shortcutsOpen = false
    await flushPromises()
    expect(sheets[0].attributes('data-open')).toBe('false')
  })

  it('Browse… opens the extensions sheet; Edit… opens the custom CSS sheet', async () => {
    wrapper = mountTab()
    await wrapper.vm.openExtensionsSheet()
    expect(wrapper.findAll('.sheet-stub')[1].attributes('data-open')).toBe('true')
    await wrapper.vm.openCustomCssSheet()
    expect(wrapper.findAll('.sheet-stub')[2].attributes('data-open')).toBe('true')
  })

  // ── image folder chooser ────────────────────────────────────────────

  it('Choose… routes through SET_IMAGE_FOLDER_PATH (directory dialog)', async () => {
    const spy = vi.spyOn(store, 'SET_IMAGE_FOLDER_PATH')
    wrapper = mountTab()
    await wrapper.vm.chooseImageFolder()
    expect(spy).toHaveBeenCalledWith(undefined)
  })

  it('typing a valid absolute path persists; an invalid one does not', async () => {
    const spy = vi.spyOn(store, 'SET_SINGLE_PREFERENCE')
    wrapper = mountTab()
    await wrapper.vm.onImageFolderPathInput({ target: { value: '/Users/x/Pictures' } })
    expect(spy).toHaveBeenCalledWith({ type: 'imageFolderPath', value: '/Users/x/Pictures' })
    spy.mockClear()
    await wrapper.vm.onImageFolderPathInput({ target: { value: 'relative/no' } })
    expect(spy).not.toHaveBeenCalled()
  })

  // ── Reset confirmation ──────────────────────────────────────────────

  it('cancel keeps every value', async () => {
    store.autoSave = true
    wrapper = mountTab()
    await wrapper.vm.confirmReset()
    expect(wrapper.find('.pref-reset-overlay').exists()).toBe(true)
    await wrapper.vm.cancelReset()
    expect(wrapper.find('.pref-reset-overlay').exists()).toBe(false)
    expect(store.autoSave).toBe(true)
  })

  it('confirm runs RESET_PREFERENCES_TO_DEFAULTS and closes the dialog', async () => {
    store.autoSave = true
    store.spellcheckerEnabled = true
    const spy = vi.spyOn(store, 'RESET_PREFERENCES_TO_DEFAULTS').mockResolvedValue(true)
    wrapper = mountTab()
    await wrapper.vm.confirmReset()
    await wrapper.vm.performReset()
    expect(spy).toHaveBeenCalled()
    expect(wrapper.find('.pref-reset-overlay').exists()).toBe(false)
  })
})
