/**
 * Tests for src/renderer/src/prefComponents/tabs/markdown/index.vue (C-38 T-004)
 *
 * Covers: IA §3.4 rows in order, the Compact/Spaced segmented control
 * mapping onto preferLooseListItem, option lists in plain IA wording,
 * and the dropped preferHeadingStyle row staying absent.
 */

import { mount } from '@vue/test-utils'
import { setupTestPinia } from '../pinia'

vi.mock('@/util', () => ({
  isOsx: false, isWindows: true, isLinux: false,
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

import MarkdownTab from '@/prefComponents/tabs/markdown/index.vue'
import { usePreferencesStore } from '@/store/preferences'
import { getListIndentationOptions, getFrontmatterTypeOptions } from '@/prefComponents/tabs/markdown/config'

const rowStub = {
  props: ['description', 'help', 'value', 'bool', 'options', 'disable'],
  template: '<div class="row-stub" :data-desc="description">{{ description }}{{ help ? "|" + help : "" }}</div>'
}
const segmentedStub = {
  props: ['description', 'help', 'value', 'options', 'disable'],
  template: '<div class="row-stub" :data-desc="description" :data-value="value"></div>'
}
const globalStubs = {
  compound: { template: '<section class="group-stub"><slot name="head"/><slot name="children"/></section>' },
  bool: rowStub,
  'cur-select': rowStub,
  segmented: segmentedStub
}

const mountTab = () => mount(MarkdownTab, { global: { stubs: globalStubs } })

const rowKeys = (wrapper) => wrapper.findAll('.row-stub').map((r) => r.attributes('data-desc'))
const groupTitles = (wrapper) => wrapper.findAll('.group-stub h6.title').map((h) => h.text())

describe('tabs/markdown — C-38 T-004 content', () => {
  let wrapper
  let store

  beforeEach(() => {
    setupTestPinia()
    store = usePreferencesStore()
  })

  afterEach(() => {
    wrapper?.unmount()
  })

  it('renders the IA §3.4 rows in order', () => {
    wrapper = mountTab()
    expect(rowKeys(wrapper)).toEqual([
      'preferences.markdown.lists.spacing',
      'preferences.markdown.lists.bulletCharacter',
      'preferences.markdown.lists.orderedListFormat',
      'preferences.markdown.lists.indentation',
      'preferences.markdown.extensions.footnote',
      'preferences.markdown.extensions.math',
      'preferences.markdown.extensions.superSubScript',
      'preferences.markdown.extensions.frontmatterFormat',
      'preferences.markdown.extensions.frontmatterProperties',
      'preferences.markdown.compatibility.allowHtml',
      'preferences.markdown.compatibility.gitlabFlavored',
      'preferences.markdown.compatibility.sequenceDiagramStyle'
    ])
    expect(groupTitles(wrapper)).toEqual([
      'preferences.markdown.lists.title',
      'preferences.markdown.extensions.title',
      'preferences.markdown.compatibility.title'
    ])
  })

  // ── RU math label / schema gap (IA §5 bug 11): the row uses mathEnabled ──

  it('exposes the mathEnabled row (schema + locale gap closed)', () => {
    wrapper = mountTab()
    expect(wrapper.text()).toContain('preferences.markdown.extensions.math')
  })

  it('renders none of the dropped rows (preferHeadingStyle)', () => {
    wrapper = mountTab()
    expect(wrapper.text()).not.toContain('preferHeadingStyle')
  })

  // ── list spacing segmented mapping ──────────────────────────────────

  it('maps preferLooseListItem to Compact/Spaced both ways', async () => {
    store.preferLooseListItem = true
    wrapper = mountTab()
    expect(wrapper.vm.listSpacing).toBe('spaced')
    await wrapper.vm.onListSpacingChange('compact')
    expect(store.preferLooseListItem).toBe(false)
    await wrapper.vm.onListSpacingChange('spaced')
    expect(store.preferLooseListItem).toBe(true)
  })

  it('segmented row receives the compact/spaced value', () => {
    store.preferLooseListItem = false
    wrapper = mountTab()
    const spacing = wrapper.findAll('.row-stub').find((r) => r.attributes('data-desc') === 'preferences.markdown.lists.spacing')
    expect(spacing.attributes('data-value')).toBe('compact')
  })

  // ── plain-language option lists ─────────────────────────────────────

  it('list indentation options use IA wording (align/tab/spaces)', () => {
    expect(getListIndentationOptions()).toEqual([
      { label: 'preferences.markdown.lists.indentAlignWithText', value: 'dfm' },
      { label: 'preferences.markdown.lists.indentTab', value: 'tab' },
      { label: 'preferences.markdown.lists.indentOneSpace', value: 1 },
      { label: 'preferences.markdown.lists.indentTwoSpaces', value: 2 },
      { label: 'preferences.markdown.lists.indentThreeSpaces', value: 3 },
      { label: 'preferences.markdown.lists.indentFourSpaces', value: 4 }
    ])
  })

  it('front matter options are YAML/TOML/JSON(;)/JSON({)', () => {
    expect(getFrontmatterTypeOptions()).toEqual([
      { label: 'YAML', value: '-' },
      { label: 'TOML', value: '+' },
      { label: 'preferences.markdown.extensions.frontmatterJsonSemicolon', value: ';' },
      { label: 'preferences.markdown.extensions.frontmatterJsonBrace', value: '{' }
    ])
  })
})
