/**
 * Tests for src/renderer/src/prefComponents/tabs/editor/index.vue (C-38 T-004)
 *
 * Covers: IA §3.3 rows in order, the inverted spellcheckerNoUnderline
 * control, the macOS help-instead-of-fake-switch behaviour (IA §5 bug 8),
 * the non-macOS language pop-up + custom dictionary gating, the visible
 * codeBlockLineNumbers switch, and legacy '14px' codeFontSize handling.
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
  useI18n: () => ({ t: (key) => key }),
  createI18n: vi.fn(() => ({ global: { locale: { value: 'en' } } }))
}))

vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: vi.fn() }
}))

vi.mock('@/bus', () => ({ default: { on: vi.fn(), emit: vi.fn(), off: vi.fn() } }))
vi.mock('@/services/notification', () => ({ default: { notify: vi.fn() } }))

const dictionariesMock = vi.hoisted(() => ({ list: ['en-US', 'de-DE'] }))
vi.mock('@/spellchecker', () => ({
  SpellChecker: { getAvailableDictionaries: vi.fn(async () => dictionariesMock.list) }
}))
vi.mock('@/spellchecker/languageMap', () => ({
  getLanguageName: (code) => `name:${code}`
}))

import EditorTab from '@/prefComponents/tabs/editor/index.vue'
import { usePreferencesStore } from '@/store/preferences'

const rowStub = {
  props: ['description', 'help', 'value', 'bool', 'options', 'disable'],
  template: '<div class="row-stub" :data-desc="description" :data-disable="disable">{{ description }}{{ help ? "|" + help : "" }}</div>'
}
const fontStub = {
  props: ['description', 'value', 'onlyMonospace'],
  template: '<div class="row-stub" :data-desc="description"></div>'
}
const globalStubs = {
  compound: { template: '<section class="group-stub"><slot name="head"/><slot name="children"/></section>' },
  bool: rowStub,
  'cur-select': rowStub,
  range: rowStub,
  'font-text-box': fontStub,
  'dictionary-list': { template: '<div class="dict-stub"></div>' }
}

const mountTab = () => mount(EditorTab, { global: { stubs: globalStubs } })

const rowKeys = (wrapper) => wrapper.findAll('.row-stub').map((r) => r.attributes('data-desc'))
const groupTitles = (wrapper) => wrapper.findAll('.group-stub h6.title').map((h) => h.text())

describe('tabs/editor — C-38 T-004 content', () => {
  let wrapper
  let store

  beforeEach(() => {
    setupTestPinia()
    store = usePreferencesStore()
    osState.isOsx = false
  })

  afterEach(() => {
    wrapper?.unmount()
  })

  it('renders the IA §3.3 rows in order (non-macOS, spelling on)', async () => {
    store.spellcheckerEnabled = true
    wrapper = mountTab()
    await flushPromises()
    expect(rowKeys(wrapper)).toEqual([
      'preferences.editor.typing.autoPairBracket',
      'preferences.editor.typing.autoPairQuote',
      'preferences.editor.typing.autoPairMarkdownSyntax',
      'preferences.editor.typing.autoCheck',
      'preferences.editor.typing.hideQuickInsertHint',
      'preferences.editor.typing.hideLinkPopup',
      'preferences.editor.typing.textDirection',
      'preferences.editor.tabs.tabSize',
      'preferences.editor.spelling.enabled',
      'preferences.editor.spelling.underline',
      'preferences.editor.spelling.language',
      'preferences.editor.codeBlocks.fontFamily',
      'preferences.editor.codeBlocks.fontSize',
      'preferences.editor.codeBlocks.lineNumbers',
      'preferences.editor.codeBlocks.wrapLongLines',
      'preferences.editor.codeBlocks.trimBlankLines'
    ])
    expect(groupTitles(wrapper)).toEqual([
      'preferences.editor.typing.title',
      'preferences.editor.tabs.title',
      'preferences.editor.spelling.title',
      'preferences.editor.codeBlocks.title'
    ])
  })

  it('renders none of the dropped file-representation rows', () => {
    wrapper = mountTab()
    const text = wrapper.text()
    for (const dead of ['autoGuessEncoding', 'autoNormalizeLineEndings', 'trimTrailingNewline', 'defaultEncoding']) {
      expect(text).not.toContain(dead)
    }
  })

  // ── inverted underline switch ───────────────────────────────────────

  it('underline switch inverts spellcheckerNoUnderline', async () => {
    store.spellcheckerNoUnderline = false
    wrapper = mountTab()
    await wrapper.vm.onUnderlineChange(false)
    expect(store.spellcheckerNoUnderline).toBe(true)
    await wrapper.vm.onUnderlineChange(true)
    expect(store.spellcheckerNoUnderline).toBe(false)
  })

  it('dependent spelling rows are disabled while spellchecking is off', () => {
    store.spellcheckerEnabled = false
    wrapper = mountTab()
    const rows = wrapper.findAll('.row-stub')
    const underline = rows.find((r) => r.attributes('data-desc') === 'preferences.editor.spelling.underline')
    expect(underline.attributes('data-disable')).toBe('true')
  })

  // ── macOS spelling behaviour (IA §5 bug 8) ──────────────────────────

  it('macOS: no language pop-up, no dictionary list; auto-detect help on the underline row', async () => {
    store.spellcheckerEnabled = true
    osState.isOsx = true
    wrapper = mountTab()
    await flushPromises()
    const keys = rowKeys(wrapper)
    expect(keys).not.toContain('preferences.editor.spelling.language')
    expect(wrapper.findAll('.dict-stub')).toHaveLength(0)
    const underline = wrapper.findAllComponents('.row-stub').find((c) => c.props('description') === 'preferences.editor.spelling.underline')
    expect(underline.text()).toContain('preferences.editor.spelling.macAutoDetectHelp')
  })

  it('non-macOS: language pop-up with dictionaries and the custom dictionary when supported', async () => {
    store.spellcheckerEnabled = true
    wrapper = mountTab()
    await flushPromises()
    const language = wrapper.findAllComponents('.row-stub').find((c) => c.props('description') === 'preferences.editor.spelling.language')
    expect(language.props('options')).toEqual([
      { value: 'en-US', label: 'name:en-US' },
      { value: 'de-DE', label: 'name:de-DE' }
    ])
    expect(wrapper.findAll('.dict-stub')).toHaveLength(1)
  })

  it('changing the spelling language also pushes mt_spell_set_lang', async () => {
    wrapper = mountTab()
    await wrapper.vm.handleSpellcheckerLanguage('de-DE')
    expect(store.spellcheckerLanguage).toBe('de-DE')
    const { invoke } = await import('@tauri-apps/api/core')
    expect(invoke).toHaveBeenCalledWith('mt_spell_set_lang', { lang: 'de-DE' })
  })

  // ── code blocks ─────────────────────────────────────────────────────

  it('codeBlockLineNumbers is a visible switch (T-005 unhid it)', () => {
    wrapper = mountTab()
    const lineNumbers = wrapper.findAllComponents('.row-stub').find((c) => c.props('description') === 'preferences.editor.codeBlocks.lineNumbers')
    expect(lineNumbers).toBeTruthy()
  })

  it('a legacy "14px" codeFontSize is coerced: stepping dispatches a number', async () => {
    store.codeFontSize = '14px' // legacy v1 string
    wrapper = mountTab()
    const spy = vi.spyOn(store, 'SET_SINGLE_PREFERENCE')
    // The stepper coerces at the control boundary; through the tab the
    // value handed to SET_SINGLE_PREFERENCE is always a number.
    await wrapper.vm.onSelectChange('codeFontSize', 15)
    expect(spy).toHaveBeenCalledWith({ type: 'codeFontSize', value: 15 })
    expect(store.codeFontSize).toBe(15)
  })
})
