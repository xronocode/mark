import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
/**
 * Tests for src/renderer/src/prefComponents/tabsBar/index.vue (C-38 T-003)
 *
 * Covers: the 5 toolbar tabs render, active state follows route.name,
 * clicks route to the tab path, per-OS toolbar styling (isOsx), and the
 * ⌘F/Ctrl+F settings-search toggle. C-COMPACT-WINDOWS-FIT adds the
 * toolbar fit pins (mac floor kept, base shrink allowance, label
 * ellipsis on both variants, the focus outline) and the de-locale
 * stress catalog.
 */

// START_MODULE_CONTRACT
//   PURPOSE: Unit pins for the Settings toolbar — variant presence and routing through the hoisted osState mock (both style variants), the ⌘F/Ctrl+F search toggle, and the C-COMPACT-WINDOWS-FIT fit shape (mac 76px floor kept, base min-width: 0 allowance, shared-label ellipsis, the :focus-visible accent outline) with the de stress catalog. jsdom has no layout engine: the geometric no-overflow proof lives in the settings-shell e2e walker.
//   SCOPE: Vue/jsdom component tests plus source-level readFileSync pins per the established canon.
//   DEPENDS: Vitest, Vue Test Utils, static/locales/de.json, prefComponents/tabsBar.
//   LINKS: C-COMPACT-WINDOWS-FIT; .grace/graph/runtime.xml M-011; tests/e2e/settings-shell.spec.ts.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   osState - the hoisted isOsx mock driving BOTH toolbar style variants.
//   mountBar - mounts the real TabsBar.
//   pushMock - captured router push calls (vue-router stub).
//   routeRef - the rendered tabs-bar root element ref for walker assertions.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: C-COMPACT-WINDOWS-FIT T-002: toolbar fit pins — both variants render seven tabs, the mac 76px floor and base min-width: 0 pinned in the sfc, the shared label ellipsis pinned, the :focus-visible outline pinned, and the de stress catalog names "Erscheinungsbild".
// END_CHANGE_SUMMARY

import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'

const osState = vi.hoisted(() => ({ isOsx: true }))

vi.mock('@/util', () => ({
  // Getters: the component reads the binding at render/call time.
  get isOsx () { return osState.isOsx },
  get isWindows () { return !osState.isOsx },
  isLinux: false
}))

vi.mock('@/i18n', () => ({ t: (key) => key, setLanguage: vi.fn() }))
vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key) => key, locale: { value: 'en' } }),
  createI18n: vi.fn(() => ({ global: { locale: { value: 'en' } } }))
}))

vi.mock('@/_shims/preferences/schema.json', () => ({
  default: {
    autoSave: { description: 'General--Auto save', type: 'boolean' },
    theme: { description: 'Theme--Current theme', type: 'string' }
  }
}))

const pushMock = vi.fn(() => Promise.resolve())
const routeRef = { name: 'general', path: '/preference/general' }

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: pushMock }),
  useRoute: () => routeRef
}))

import TabsBar from '@/prefComponents/tabsBar/index.vue'

const mountBar = () => mount(TabsBar)

describe('tabsBar/index.vue – Settings toolbar', () => {
  let wrapper

  beforeEach(() => {
    pushMock.mockClear()
    routeRef.name = 'general'
    osState.isOsx = true
  })

  afterEach(() => {
    wrapper?.unmount()
  })

  it('renders the toolbar with all tabs and data-tab ids (5 IA tabs + experimental)', () => {
    wrapper = mountBar()
    expect(wrapper.find('nav.pref-toolbar').exists()).toBe(true)
    const ids = wrapper.findAll('.pref-tab').map((b) => b.attributes('data-tab'))
    expect(ids).toEqual(['general', 'appearance', 'editor', 'markdown', 'export', 'advanced', 'experimental'])
  })

  it('renders an icon and a label per tab', () => {
    wrapper = mountBar()
    wrapper.findAll('.pref-tab').forEach((tab) => {
      expect(tab.find('svg').exists()).toBe(true)
      expect(tab.find('.pref-tab-label').exists()).toBe(true)
    })
  })

  it('marks the active tab from route.name (aria-selected)', () => {
    routeRef.name = 'appearance'
    wrapper = mountBar()
    const active = wrapper.find('.pref-tab[aria-selected="true"]')
    expect(active.attributes('data-tab')).toBe('appearance')
    expect(active.classes()).toContain('pref-tab--active')
  })

  it('clicking a tab routes to its path', async () => {
    wrapper = mountBar()
    await wrapper.find('[data-tab="markdown"]').trigger('click')
    expect(pushMock).toHaveBeenCalledWith({ path: '/preference/markdown' })
  })

  it('does not re-push when the active tab is clicked', async () => {
    routeRef.name = 'general'
    wrapper = mountBar()
    await wrapper.find('[data-tab="general"]').trigger('click')
    expect(pushMock).not.toHaveBeenCalled()
  })

  describe('per-OS styling', () => {
    it('uses the centred macOS toolbar when isOsx', () => {
      osState.isOsx = true
      wrapper = mountBar()
      expect(wrapper.find('nav.pref-toolbar--mac').exists()).toBe(true)
      expect(wrapper.find('nav.pref-toolbar--underline').exists()).toBe(false)
    })

    it('uses underline tabs when not macOS', () => {
      osState.isOsx = false
      wrapper = mountBar()
      expect(wrapper.find('nav.pref-toolbar--underline').exists()).toBe(true)
      expect(wrapper.find('nav.pref-toolbar--mac').exists()).toBe(false)
    })

    // C-51 T-008: the macOS Settings window has a transparent title bar over
    // full-size content; the toolbar is the drag surface and reserves the
    // 28 px traffic-light strip.
    it('is a window drag region with the title-bar strip on macOS only', () => {
      osState.isOsx = true
      wrapper = mountBar()
      expect(wrapper.find('nav.pref-toolbar').attributes()).toHaveProperty('data-tauri-drag-region')
      wrapper.unmount()
      osState.isOsx = false
      wrapper = mountBar()
      expect(wrapper.find('nav.pref-toolbar').attributes()).not.toHaveProperty('data-tauri-drag-region')
      const sfc = readFileSync(resolve(__dirname, '../../../src/renderer/src/prefComponents/tabsBar/index.vue'), 'utf8')
      expect(sfc).toMatch(/\.pref-toolbar--mac \{[^}]*padding: 30px 12px 8px;/)
    })

    // C-COMPACT-WINDOWS-FIT T-002: both variants stay inside the fixed
    // 640x620 window. jsdom has no layout engine, so these pins carry
    // variant presence and the CSS shape; the geometric no-overflow
    // proof (every .pref-tab rect inside the viewport, toolbar
    // scrollWidth at most innerWidth, the de "Erscheinungsbild" stress)
    // lives in tests/e2e/settings-shell.spec.ts.
    it('keeps both variants inside the fixed window: mac floor kept, base shrink allowed, labels ellipsize', () => {
      // The hoisted osState mock drives BOTH style variants; all seven
      // tabs render on each.
      osState.isOsx = true
      wrapper = mountBar()
      expect(wrapper.findAll('.pref-tab')).toHaveLength(7)
      wrapper.unmount()
      osState.isOsx = false
      wrapper = mountBar()
      expect(wrapper.findAll('.pref-tab')).toHaveLength(7)
      wrapper.unmount()

      const sfc = readFileSync(resolve(__dirname, '../../../src/renderer/src/prefComponents/tabsBar/index.vue'), 'utf8')
      // The mac variant keeps its 76px floor (7×76px + 24px padding +
      // gaps always fit 640px, so the floor never itself overflows).
      expect(sfc).toMatch(/\.pref-toolbar--mac \.pref-tab \{[^}]*min-width: 76px;/)
      // The base tab gains the 0 shrink allowance.
      expect(sfc).toMatch(/\.pref-toolbar \.pref-tab \{[^}]*min-width: 0;/)
      // The shared label rule ellipsizes on BOTH variants.
      expect(sfc).toMatch(
        /\.pref-toolbar \.pref-tab-label \{[^}]*overflow: hidden;[^}]*white-space: nowrap;[^}]*text-overflow: ellipsis;/
      )
      // Keyboard focus carries the canon accent outline.
      expect(sfc).toMatch(/\.pref-toolbar \.pref-tab:focus-visible \{[^}]*outline: 2px solid var\(--prefAccent\);[^}]*outline-offset: 1px;/)

      // The de stress catalog: the longest shipped tab label across the
      // ten locales comes from the de locale's appearance tab.
      const de = JSON.parse(
        readFileSync(resolve(__dirname, '../../../static/locales/de.json'), 'utf8')
      )
      expect(de.preferences.tabs.appearance).toBe('Erscheinungsbild')
    })

    it('the Settings window gets the transparent title bar on macOS', () => {
      const rs = readFileSync(resolve(__dirname, '../../../src-tauri/src/m_v1_compat.rs'), 'utf8')
      expect(rs).toContain('run_on_main_thread(move || settings_transparent_titlebar(&w))')
      expect(rs).toContain('setTitlebarAppearsTransparent')
      expect(rs).toContain('1 << 15')
    })
  })

  describe('⌘F settings search toggle', () => {
    it('opens the search panel on Cmd+F and closes it on the second press', async () => {
      wrapper = mountBar()
      expect(wrapper.find('.pref-search').exists()).toBe(false)

      window.dispatchEvent(
        new KeyboardEvent('keydown', { metaKey: true, key: 'f', cancelable: true })
      )
      await nextTick()
      expect(wrapper.find('.pref-search').exists()).toBe(true)

      window.dispatchEvent(
        new KeyboardEvent('keydown', { metaKey: true, key: 'f', cancelable: true })
      )
      await nextTick()
      expect(wrapper.find('.pref-search').exists()).toBe(false)
    })

    it('Ctrl+F works for Windows/Linux', async () => {
      osState.isOsx = false
      wrapper = mountBar()
      window.dispatchEvent(
        new KeyboardEvent('keydown', { ctrlKey: true, key: 'f', cancelable: true })
      )
      await nextTick()
      expect(wrapper.find('.pref-search').exists()).toBe(true)
    })

    it('ignores unrelated shortcuts', async () => {
      wrapper = mountBar()
      window.dispatchEvent(
        new KeyboardEvent('keydown', { metaKey: true, key: 'g', cancelable: true })
      )
      await nextTick()
      expect(wrapper.find('.pref-search').exists()).toBe(false)
    })
  })
})
