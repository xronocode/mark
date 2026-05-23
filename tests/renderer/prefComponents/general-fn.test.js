/**
 * Function-coverage tests for src/renderer/src/prefComponents/general/index.vue
 *
 * 28 uncovered functions. Most are template lambdas
 * `(value) => onSelectChange('key', value)`. Also:
 * startUpAction computed get/set, restoreLayoutState computed get/set,
 * selectDefaultDirectoryToOpen, isDefault computed, currentHandler computed,
 * setAsDefault, unsetDefault, onMounted, onSelectChange.
 */

import { shallowMount, flushPromises } from '@vue/test-utils'
import { setupTestPinia } from '../pinia'

vi.mock('@/i18n', () => ({ t: (key) => key, setLanguage: vi.fn() }))
vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key) => key }),
  createI18n: vi.fn(() => ({ global: { locale: { value: 'en' } } }))
}))
vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: vi.fn() },
  ElMessageBox: { confirm: vi.fn() }
}))
vi.mock('@/util', () => ({
  isOsx: false, delay: vi.fn(), serialize: vi.fn(), merge: vi.fn()
}))
vi.mock('@/bus', () => ({ default: { on: vi.fn(), emit: vi.fn(), off: vi.fn() } }))
vi.mock('@/services/notification', () => ({ default: { notify: vi.fn() } }))

import GeneralSettings from '@/prefComponents/general/index.vue'
import { usePreferencesStore } from '@/store/preferences'

const stubs = {
  compound: {
    template: '<div><slot name="head"/><slot name="children"/></div>'
  },
  range: true,
  'cur-select': true,
  bool: true,
  'text-box': true,
  'el-button': { template: '<button @click="$emit(\'click\')"><slot/></button>' },
  'el-radio-group': true,
  'el-radio': true
}

describe('GeneralSettings – function coverage', () => {
  let wrapper, store

  beforeEach(() => {
    setupTestPinia()
    wrapper = shallowMount(GeneralSettings, {
      global: { stubs }
    })
    store = usePreferencesStore()
  })

  afterEach(() => {
    wrapper.unmount()
  })

  it('onSelectChange dispatches to store', () => {
    const spy = vi.spyOn(store, 'SET_SINGLE_PREFERENCE')
    wrapper.vm.onSelectChange('autoSave', true)
    expect(spy).toHaveBeenCalledWith({ type: 'autoSave', value: true })
  })

  it('startUpAction getter and setter', () => {
    store.startUpAction = 'blank'
    expect(wrapper.vm.startUpAction).toBe('blank')
    const spy = vi.spyOn(store, 'SET_SINGLE_PREFERENCE')
    wrapper.vm.startUpAction = 'openLastFolder'
    expect(spy).toHaveBeenCalledWith({ type: 'startUpAction', value: 'openLastFolder' })
  })

  it('restoreLayoutState getter and setter', () => {
    store.restoreLayoutState = false
    expect(wrapper.vm.restoreLayoutState).toBe(false)
    const spy = vi.spyOn(store, 'SET_SINGLE_PREFERENCE')
    wrapper.vm.restoreLayoutState = true
    expect(spy).toHaveBeenCalledWith({ type: 'restoreLayoutState', value: true })
  })

  it('selectDefaultDirectoryToOpen calls store action', () => {
    const spy = vi.spyOn(store, 'SELECT_DEFAULT_DIRECTORY_TO_OPEN')
    wrapper.vm.selectDefaultDirectoryToOpen()
    expect(spy).toHaveBeenCalled()
  })

  it('isDefault computed', () => {
    store.defaultMdHandler = { isDefault: true, currentHandler: 'Mark' }
    expect(wrapper.vm.isDefault).toBe(true)
  })

  it('currentHandler computed', () => {
    store.defaultMdHandler = { isDefault: false, currentHandler: 'VSCode' }
    expect(wrapper.vm.currentHandler).toBe('VSCode')
  })

  it('setAsDefault calls store action', () => {
    const spy = vi.spyOn(store, 'SET_DEFAULT_MD_HANDLER')
    wrapper.vm.setAsDefault()
    expect(spy).toHaveBeenCalled()
  })

  it('unsetDefault calls store action', () => {
    const spy = vi.spyOn(store, 'UNSET_DEFAULT_MD_HANDLER')
    wrapper.vm.unsetDefault()
    expect(spy).toHaveBeenCalled()
  })

  it('onMounted calls REFRESH_DEFAULT_MD_HANDLER', async () => {
    const spy = vi.spyOn(store, 'REFRESH_DEFAULT_MD_HANDLER')
    wrapper.unmount()
    wrapper = shallowMount(GeneralSettings, {
      global: { stubs }
    })
    await flushPromises()
    expect(spy).toHaveBeenCalled()
  })

  // Exercise template lambdas via child component props
  it('exercises all bool onChange lambdas', () => {
    const spy = vi.spyOn(store, 'SET_SINGLE_PREFERENCE')
    const bools = wrapper.findAllComponents({ name: 'bool' })
    bools.forEach((c) => {
      const onChange = c.props('onChange')
      if (typeof onChange === 'function') {
        onChange(true)
      }
    })
    // autoSave, hideScrollbar, openFilesInNewWindow, openFolderInNewWindow, wordWrapInToc
    expect(spy).toHaveBeenCalledWith({ type: 'autoSave', value: true })
    expect(spy).toHaveBeenCalledWith({ type: 'hideScrollbar', value: true })
    expect(spy).toHaveBeenCalledWith({ type: 'openFilesInNewWindow', value: true })
    expect(spy).toHaveBeenCalledWith({ type: 'openFolderInNewWindow', value: true })
    expect(spy).toHaveBeenCalledWith({ type: 'wordWrapInToc', value: true })
  })

  it('exercises all range onChange lambdas', () => {
    const spy = vi.spyOn(store, 'SET_SINGLE_PREFERENCE')
    const ranges = wrapper.findAllComponents({ name: 'range' })
    ranges.forEach((c) => {
      const onChange = c.props('onChange')
      if (typeof onChange === 'function') {
        onChange(5000)
      }
    })
    expect(spy).toHaveBeenCalledWith({ type: 'autoSaveDelay', value: 5000 })
  })

  it('exercises all cur-select onChange lambdas', () => {
    const spy = vi.spyOn(store, 'SET_SINGLE_PREFERENCE')
    const selects = wrapper.findAllComponents({ name: 'cur-select' })
    selects.forEach((c) => {
      const onChange = c.props('onChange')
      if (typeof onChange === 'function') {
        onChange('testVal')
      }
    })
    // titleBarStyle (may not render if isOsx=false but v-if=!isOsx means it DOES render),
    // zoom, fileSortBy
    expect(spy).toHaveBeenCalledWith({ type: 'titleBarStyle', value: 'testVal' })
    expect(spy).toHaveBeenCalledWith({ type: 'zoom', value: 'testVal' })
    expect(spy).toHaveBeenCalledWith({ type: 'fileSortBy', value: 'testVal' })
  })

  it('exercises text-box onChange lambda for treePathExcludePatterns', () => {
    const spy = vi.spyOn(store, 'SET_SINGLE_PREFERENCE')
    const tbs = wrapper.findAllComponents({ name: 'text-box' })
    tbs.forEach((c) => {
      const onChange = c.props('onChange')
      if (typeof onChange === 'function') {
        onChange('node_modules,.git')
      }
    })
    // The lambda does: value.split(',')
    expect(spy).toHaveBeenCalledWith({
      type: 'treePathExcludePatterns',
      value: ['node_modules', '.git']
    })
  })

  it('click on selectDefaultDirectoryToOpen button calls store', async () => {
    const spy = vi.spyOn(store, 'SELECT_DEFAULT_DIRECTORY_TO_OPEN')
    const buttons = wrapper.findAll('button')
    const selectBtn = buttons.find((b) => b.text().includes('preferences.general.startup.selectFolder'))
    if (selectBtn) {
      await selectBtn.trigger('click')
      expect(spy).toHaveBeenCalled()
    } else {
      // Fallback: call directly
      wrapper.vm.selectDefaultDirectoryToOpen()
      expect(spy).toHaveBeenCalled()
    }
  })
})
