/**
 * Deep tests for src/renderer/src/prefComponents/spellchecker/index.vue
 *
 * Targets: handleSpellcheckerEnabled, handleSpellcheckerLanguage,
 * onSelectChange, handleDeleteClick, getAvailableDictionaries,
 * onMounted logic, custom dictionary rendering.
 */

import { shallowMount, flushPromises } from '@vue/test-utils'
import { setupTestPinia } from '../pinia'
import { nextTick } from 'vue'
import { invoke } from '@tauri-apps/api/core'

vi.mock('@/i18n', () => ({
  t: (key) => key,
  setLanguage: vi.fn()
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key) => key }),
  createI18n: vi.fn(() => ({ global: { locale: { value: 'en' } } }))
}))

vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: vi.fn() }
}))

vi.mock('@element-plus/icons-vue', () => ({
  Delete: { template: '<span />' }
}))

const logErrorMock = vi.fn()
vi.mock('electron-log', () => ({
  default: {
    error: (...args) => logErrorMock(...args),
    warn: vi.fn(),
    info: vi.fn()
  }
}))

vi.mock('@/util', () => ({
  isOsx: false,
  delay: vi.fn()
}))

vi.mock('@/spellchecker', () => ({
  SpellChecker: {
    getAvailableDictionaries: vi.fn(async () => ['en-US', 'fr-FR', 'de-DE'])
  }
}))

vi.mock('@/spellchecker/languageMap', () => ({
  getLanguageName: vi.fn((code) => `Language(${code})`)
}))

const notifyMock = vi.fn()
vi.mock('@/services/notification', () => ({
  default: { notify: (...args) => notifyMock(...args) }
}))

vi.mock('@/bus', () => ({ default: { on: vi.fn(), emit: vi.fn(), off: vi.fn() } }))

import SpellcheckerSettings from '@/prefComponents/spellchecker/index.vue'
import { usePreferencesStore } from '@/store/preferences'

const globalStubs = {
  compound: true,
  'cur-select': true,
  bool: true,
  'el-table': true,
  'el-table-column': true,
  'el-button': { template: '<button @click="$emit(\'click\')"><slot/></button>' },
  Delete: true
}

describe('SpellcheckerSettings.vue – deep tests', () => {
  let wrapper

  beforeEach(() => {
    setupTestPinia()
    // Mock invoke for custom dictionary words
    invoke.mockImplementation(async (cmd) => {
      if (cmd === 'mt_spell_get_custom_dictionary_words') {
        return ['hello', 'world', 'custom']
      }
      if (cmd === 'mt_spell_remove_word') {
        return true
      }
      if (cmd === 'mt_spell_set_lang') {
        return undefined
      }
      return undefined
    })

    wrapper = shallowMount(SpellcheckerSettings, {
      global: {
        mocks: { $t: (key) => key },
        stubs: globalStubs
      }
    })
  })

  afterEach(() => {
    wrapper.unmount()
    notifyMock.mockClear()
    logErrorMock.mockClear()
  })

  // ── onMounted ────────────────────────────────────────────────────────

  it('onMounted loads available dictionaries (non-macOS)', async () => {
    await flushPromises()
    expect(wrapper.vm.availableDictionaries).toHaveLength(3)
    expect(wrapper.vm.availableDictionaries[0]).toEqual({
      value: 'en-US',
      label: 'Language(en-US)'
    })
  })

  it('onMounted loads custom dictionary words', async () => {
    await flushPromises()
    expect(wrapper.vm.wordsInCustomDictionary).toHaveLength(3)
    expect(wrapper.vm.wordsInCustomDictionary[0]).toEqual({ word: 'hello' })
  })

  it('onMounted handles custom dictionary error gracefully', async () => {
    wrapper.unmount()
    invoke.mockImplementation(async (cmd) => {
      if (cmd === 'mt_spell_get_custom_dictionary_words') {
        throw new Error('not implemented')
      }
      return undefined
    })
    wrapper = shallowMount(SpellcheckerSettings, {
      global: { mocks: { $t: (key) => key }, stubs: globalStubs }
    })
    await flushPromises()
    // Should not throw, wordsInCustomDictionary should remain empty
    expect(wrapper.vm.wordsInCustomDictionary).toEqual([])
  })

  // ── handleSpellcheckerEnabled ────────────────────────────────────────

  it('handleSpellcheckerEnabled calls SET_SINGLE_PREFERENCE', () => {
    const store = usePreferencesStore()
    const spy = vi.spyOn(store, 'SET_SINGLE_PREFERENCE')
    wrapper.vm.handleSpellcheckerEnabled(true)
    expect(spy).toHaveBeenCalledWith({ type: 'spellcheckerEnabled', value: true })
  })

  it('handleSpellcheckerEnabled with false disables spellchecker', () => {
    const store = usePreferencesStore()
    const spy = vi.spyOn(store, 'SET_SINGLE_PREFERENCE')
    wrapper.vm.handleSpellcheckerEnabled(false)
    expect(spy).toHaveBeenCalledWith({ type: 'spellcheckerEnabled', value: false })
  })

  // ── handleSpellcheckerLanguage ───────────────────────────────────────

  it('handleSpellcheckerLanguage updates preference and invokes tauri command', async () => {
    const store = usePreferencesStore()
    const spy = vi.spyOn(store, 'SET_SINGLE_PREFERENCE')
    await wrapper.vm.handleSpellcheckerLanguage('fr-FR')
    expect(spy).toHaveBeenCalledWith({ type: 'spellcheckerLanguage', value: 'fr-FR' })
    expect(invoke).toHaveBeenCalledWith('mt_spell_set_lang', { lang: 'fr-FR' })
  })

  it('handleSpellcheckerLanguage handles set-lang failure gracefully', async () => {
    invoke.mockImplementation(async (cmd) => {
      if (cmd === 'mt_spell_set_lang') {
        throw new Error('set-lang failed')
      }
      return undefined
    })
    // Should not throw
    await expect(wrapper.vm.handleSpellcheckerLanguage('de-DE')).resolves.toBeUndefined()
  })

  // ── onSelectChange ───────────────────────────────────────────────────

  it('onSelectChange dispatches for spellcheckerNoUnderline', () => {
    const store = usePreferencesStore()
    const spy = vi.spyOn(store, 'SET_SINGLE_PREFERENCE')
    wrapper.vm.onSelectChange('spellcheckerNoUnderline', true)
    expect(spy).toHaveBeenCalledWith({ type: 'spellcheckerNoUnderline', value: true })
  })

  // ── handleDeleteClick ────────────────────────────────────────────────

  it('handleDeleteClick removes word from custom dictionary on success', async () => {
    await flushPromises() // let onMounted populate the list
    expect(wrapper.vm.wordsInCustomDictionary).toHaveLength(3)

    await wrapper.vm.handleDeleteClick({ word: 'hello' })
    await flushPromises()

    expect(wrapper.vm.wordsInCustomDictionary).toHaveLength(2)
    expect(wrapper.vm.wordsInCustomDictionary.find((w) => w.word === 'hello')).toBeUndefined()
  })

  it('handleDeleteClick shows error notification on failure', async () => {
    invoke.mockImplementation(async (cmd) => {
      if (cmd === 'mt_spell_remove_word') {
        return false
      }
      if (cmd === 'mt_spell_get_custom_dictionary_words') {
        return ['test']
      }
      return undefined
    })
    wrapper.unmount()
    wrapper = shallowMount(SpellcheckerSettings, {
      global: { mocks: { $t: (key) => key }, stubs: globalStubs }
    })
    await flushPromises()

    await wrapper.vm.handleDeleteClick({ word: 'test' })
    await flushPromises()

    expect(notifyMock).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'error' })
    )
  })

  it('handleDeleteClick handles invoke error', async () => {
    invoke.mockImplementation(async (cmd) => {
      if (cmd === 'mt_spell_remove_word') {
        throw new Error('remove failed')
      }
      if (cmd === 'mt_spell_get_custom_dictionary_words') {
        return ['test']
      }
      return undefined
    })
    wrapper.unmount()
    wrapper = shallowMount(SpellcheckerSettings, {
      global: { mocks: { $t: (key) => key }, stubs: globalStubs }
    })
    await flushPromises()

    await wrapper.vm.handleDeleteClick({ word: 'test' })
    await flushPromises()

    expect(logErrorMock).toHaveBeenCalled()
  })

  it('handleDeleteClick does nothing for invalid input', async () => {
    await wrapper.vm.handleDeleteClick(null)
    await wrapper.vm.handleDeleteClick({ word: 123 })
    // No error should be thrown
    expect(true).toBe(true)
  })

  // ── Store bindings ───────────────────────────────────────────────────

  it('reflects spellcheckerEnabled from store', () => {
    const store = usePreferencesStore()
    store.spellcheckerEnabled = true
    expect(wrapper.vm.spellcheckerEnabled).toBe(true)
  })

  it('reflects spellcheckerNoUnderline from store', () => {
    const store = usePreferencesStore()
    store.spellcheckerNoUnderline = true
    expect(wrapper.vm.spellcheckerNoUnderline).toBe(true)
  })

  it('reflects spellcheckerLanguage from store', () => {
    const store = usePreferencesStore()
    store.spellcheckerLanguage = 'fr-FR'
    expect(wrapper.vm.spellcheckerLanguage).toBe('fr-FR')
  })

  // ── Conditional rendering ────────────────────────────────────────────

  it('renders custom dictionary section when not macOS and spellchecker enabled', async () => {
    const store = usePreferencesStore()
    store.spellcheckerEnabled = true
    await nextTick()

    expect(wrapper.find('h6.title').exists()).toBe(true)
  })
})
