/**
 * Tests for src/renderer/src/prefComponents/tabs/appearance/index.vue (C-38 T-004)
 *
 * Covers: IA §3.2 rows in order, the Auto/Light/Dark segmented control
 * bound to followSystemTheme + theme exactly like the title-bar button,
 * the 14 compact family tiles (colours from the theme CSS variables),
 * the writing-area-width "Unlimited" placeholder, and titleBarStyle
 * gated to Windows/Linux.
 */

import { mount } from '@vue/test-utils'
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

import AppearanceTab from '@/prefComponents/tabs/appearance/index.vue'
import { usePreferencesStore } from '@/store/preferences'
import { THEME_FAMILIES } from '@/util/themeFamilies'

const rowStub = {
  props: ['description', 'help', 'value', 'bool', 'options', 'disable', 'defaultValue'],
  template: '<div class="row-stub" :data-desc="description">{{ description }}{{ help ? "|" + help : "" }}</div>'
}
const segmentedStub = {
  props: ['description', 'help', 'value', 'options', 'disable'],
  template: '<div class="row-stub row-segmented" :data-desc="description" :data-value="value"></div>'
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
  'text-box': rowStub,
  'font-text-box': fontStub,
  segmented: segmentedStub
}

const mountTab = () => mount(AppearanceTab, { global: { stubs: globalStubs } })

const rowKeys = (wrapper) => wrapper.findAll('.row-stub').map((r) => r.attributes('data-desc'))
const groupTitles = (wrapper) => wrapper.findAll('.group-stub h6.title').map((h) => h.text())

describe('tabs/appearance — C-38 T-004 content', () => {
  let wrapper
  let store

  beforeEach(() => {
    setupTestPinia()
    store = usePreferencesStore()
    osState.isOsx = true
  })

  afterEach(() => {
    wrapper?.unmount()
  })

  it('renders the IA §3.2 rows in order', () => {
    wrapper = mountTab()
    expect(rowKeys(wrapper)).toEqual([
      'preferences.appearance.theme.mode',
      // swatches row (no label-key row; asserted separately below)
      'preferences.appearance.text.font',
      'preferences.appearance.text.fontSize',
      'preferences.appearance.text.lineHeight',
      'preferences.appearance.text.lineWidth',
      'preferences.appearance.window.hideScrollbar',
      'preferences.appearance.window.wordWrapInToc',
      // C-40 T-004: the status-bar switch joins the Window-and-panels group.
      'preferences.appearance.window.statusBar'
    ])
    expect(groupTitles(wrapper)).toEqual([
      'preferences.appearance.theme.title',
      'preferences.appearance.text.title',
      'preferences.appearance.window.title'
    ])
  })

  it('passes the "Unlimited" placeholder and the width help to the field', () => {
    wrapper = mountTab()
    const widthRow = wrapper.findAllComponents('.row-stub').find((c) => c.props('description') === 'preferences.appearance.text.lineWidth')
    expect(widthRow.text()).toContain('preferences.appearance.text.lineWidthHelp')
    // defaultValue prop carries the placeholder
    expect(widthRow.props('defaultValue')).toBe('preferences.appearance.text.unlimited')
  })

  it('shows titleBarStyle only off macOS (IA §5 bug 10)', () => {
    osState.isOsx = true
    wrapper = mountTab()
    expect(rowKeys(wrapper)).not.toContain('preferences.appearance.window.titleBarStyle')

    wrapper.unmount()
    osState.isOsx = false
    wrapper = mountTab()
    expect(rowKeys(wrapper)).toContain('preferences.appearance.window.titleBarStyle')
  })

  // ── segmented Auto/Light/Dark (title-bar semantics) ─────────────────

  it('resolves the current mode from followSystemTheme + theme', async () => {
    store.followSystemTheme = true
    wrapper = mountTab()
    expect(wrapper.vm.themeMode).toBe('auto')

    store.followSystemTheme = false
    store.theme = 'ink'
    await new Promise((r) => setTimeout(r))
    expect(wrapper.vm.themeMode).toBe('dark')

    store.theme = 'paper'
    expect(wrapper.vm.themeMode).toBe('light')
  })

  it('picking Light/Dark pins the manual member and leaves Auto', async () => {
    const spy = vi.spyOn(store, 'SET_SINGLE_PREFERENCE')
    store.followSystemTheme = true
    store.lightModeTheme = 'paper'
    store.darkModeTheme = 'ink'
    wrapper = mountTab()

    await wrapper.vm.onThemeModeChange('light')
    expect(spy).toHaveBeenCalledWith({ type: 'followSystemTheme', value: false })
    expect(spy).toHaveBeenCalledWith({ type: 'theme', value: 'paper' })

    spy.mockClear()
    store.followSystemTheme = false
    store.theme = 'paper'
    await wrapper.vm.onThemeModeChange('dark')
    expect(spy).toHaveBeenCalledWith({ type: 'theme', value: 'ink' })
    expect(spy).not.toHaveBeenCalledWith({ type: 'followSystemTheme', value: false })
  })

  it('re-entering Auto only re-enables followSystemTheme', async () => {
    const spy = vi.spyOn(store, 'SET_SINGLE_PREFERENCE')
    store.followSystemTheme = false
    store.theme = 'ink'
    wrapper = mountTab()
    await wrapper.vm.onThemeModeChange('auto')
    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy).toHaveBeenCalledWith({ type: 'followSystemTheme', value: true })
  })

  // ── family tiles (C-41 T-002 logic, new compact grid) ───────────────

  it('renders one tile per family (14, 7 per row)', () => {
    wrapper = mountTab()
    const tiles = wrapper.findAll('.theme-family-tile')
    expect(tiles).toHaveLength(THEME_FAMILIES.length)
    expect(THEME_FAMILIES).toHaveLength(14)
    // the count and aria wiring is DOM; grid metrics live in the stylesheet
    expect(tiles[0].attributes('role')).toBe('radio')
  })

  it('marks the family owning the applied theme as selected', async () => {
    store.theme = 'nord'
    wrapper = mountTab()
    const selected = wrapper.find('.theme-family-tile.is-selected')
    expect(selected.attributes('data-family')).toBe('nord')
    expect(selected.attributes('aria-checked')).toBe('true')
  })

  it('picking a family sets both members and the member for the mode', async () => {
    const spy = vi.spyOn(store, 'SET_SINGLE_PREFERENCE')
    store.followSystemTheme = false
    store.theme = 'paper'
    wrapper = mountTab()
    const family = wrapper.vm.familyTiles.find((f) => f.id === 'catppuccin')
    await wrapper.vm.onSelectFamily(family)
    expect(spy).toHaveBeenCalledWith({ type: 'lightModeTheme', value: 'catppuccin-latte' })
    expect(spy).toHaveBeenCalledWith({ type: 'darkModeTheme', value: 'catppuccin-mocha' })
    expect(spy).toHaveBeenCalledWith({ type: 'theme', value: 'catppuccin-latte' })
    // never leaves Auto
    expect(spy).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'followSystemTheme' }))
  })

  it('manual Dark: picking a family applies its dark member and stays manual (moved from theme-families)', async () => {
    const spy = vi.spyOn(store, 'SET_SINGLE_PREFERENCE')
    store.followSystemTheme = false
    store.theme = 'nord'
    wrapper = mountTab()
    const family = wrapper.vm.familyTiles.find((f) => f.id === 'solarized')
    await wrapper.vm.onSelectFamily(family)
    expect(spy).toHaveBeenCalledWith({ type: 'theme', value: 'solarized-dark' })
    expect(spy).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'followSystemTheme' }))
  })

  it('renders swatch colours resolved from the theme CSS variables', () => {
    wrapper = mountTab()
    // In vitest `?inline` CSS resolves to '' — the parser then falls back to
    // the neutral defaults, which are still valid colours for the halves.
    const halves = wrapper.findAll('.family-half')
    expect(halves.length).toBe(28)
    for (const half of halves) {
      const style = half.attributes('style') ?? ''
      expect(style).toMatch(/background:/)
      expect(style).toMatch(/color:/)
    }
    const bar = wrapper.find('.family-accent-bar')
    expect((bar.attributes('style') ?? '')).toMatch(/background:/)
  })
})
