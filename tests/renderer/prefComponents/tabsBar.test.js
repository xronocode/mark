/**
 * Tests for src/renderer/src/prefComponents/tabsBar/index.vue (C-38 T-003)
 *
 * Covers: the 5 toolbar tabs render, active state follows route.name,
 * clicks route to the tab path, per-OS toolbar styling (isOsx), and the
 * ⌘F/Ctrl+F settings-search toggle.
 */

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

  it('renders the toolbar with all 5 tabs and data-tab ids', () => {
    wrapper = mountBar()
    expect(wrapper.find('nav.pref-toolbar').exists()).toBe(true)
    const ids = wrapper.findAll('.pref-tab').map((b) => b.attributes('data-tab'))
    expect(ids).toEqual(['general', 'appearance', 'editor', 'markdown', 'advanced'])
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
