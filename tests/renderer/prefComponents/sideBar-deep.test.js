/**
 * Deep tests for src/renderer/src/prefComponents/tabsBar/searchPanel.vue
 * (C-38 T-003) — replaces the retired sideBar/index.vue deep tests.
 *
 * Targets: filterContent matching (localized + English fields), keyboard
 * navigation, routing of a hit to its new 5-tab home, and the
 * languageChanged index refresh.
 */

import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'

vi.mock('@/i18n', () => ({ t: (key) => key, setLanguage: vi.fn() }))
vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key) => key }),
  createI18n: vi.fn(() => ({ global: { locale: { value: 'en' } } }))
}))

vi.mock('@/_shims/preferences/schema.json', () => ({
  default: {
    autoSave: { description: 'General--Auto save', type: 'boolean' },
    theme: { description: 'Theme--Current theme', type: 'string', enum: ['light', 'dark'] },
    spellOption: { description: 'Spelling--Enable spell checker', type: 'boolean' },
    imageAction: { description: 'Image--Image insert action', type: 'string' },
    customCss: { description: 'Custom CSS--Custom stylesheet', type: 'string' },
    viewOption: { description: 'View--View option', type: 'string' },
    internalOption: { description: 'General--internal', type: 'string' }
  }
}))

const pushMock = vi.fn(() => Promise.resolve())
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: pushMock }),
  useRoute: () => ({ name: 'general', path: '/preference/general' })
}))

import SearchPanel from '@/prefComponents/tabsBar/searchPanel.vue'

describe('tabsBar/searchPanel.vue – deep tests', () => {
  let wrapper

  const openWithQuery = async (query) => {
    wrapper.vm.openPanel()
    await nextTick()
    await wrapper.find('.pref-search-input').setValue(query)
  }

  beforeEach(() => {
    pushMock.mockClear()
    wrapper = mount(SearchPanel)
  })

  afterEach(() => {
    wrapper.unmount()
  })

  describe('filtering', () => {
    it('matches the preference description text', async () => {
      // t() is an identity mock here, so the row shows the i18n key; the
      // match itself comes from the schema description.
      await openWithQuery('Auto save')
      const names = wrapper.findAll('.pref-search-results .name').map((n) => n.text())
      expect(names).toHaveLength(1)
      expect(names[0]).toContain('autoSave')
    })

    it('matches English fields even when the localized text differs', async () => {
      await openWithQuery('Current theme')
      const rows = wrapper.findAll('.pref-search-results li')
      expect(rows.length).toBeGreaterThan(0)
    })

    it('is case-insensitive', async () => {
      await openWithQuery('AUTO SAVE')
      expect(wrapper.findAll('.pref-search-results li').length).toBeGreaterThan(0)
    })

    it('excludes --internal schema entries', async () => {
      await openWithQuery('internal')
      expect(wrapper.findAll('.pref-search-results li').length).toBe(0)
    })
  })

  describe('keyboard navigation', () => {
    it('Enter activates the highlighted result', async () => {
      await openWithQuery('Current theme')
      await wrapper.find('.pref-search-input').trigger('keydown', { key: 'Enter' })
      expect(pushMock).toHaveBeenCalledWith({ path: '/preference/appearance' })
    })

    it('ArrowDown/ArrowUp cycle the highlight', async () => {
      await openWithQuery('e') // matches several entries
      const input = wrapper.find('.pref-search-input')
      const first = wrapper.findAll('.pref-search-results li')[0]
      expect(first.classes()).toContain('highlighted')

      await input.trigger('keydown', { key: 'ArrowDown' })
      const second = wrapper.findAll('.pref-search-results li')[1]
      expect(second.classes()).toContain('highlighted')
      expect(first.classes()).not.toContain('highlighted')

      await input.trigger('keydown', { key: 'ArrowUp' })
      expect(wrapper.findAll('.pref-search-results li')[0].classes()).toContain('highlighted')
    })
  })

  describe('routing hits to the new tabs', () => {
    it('a Theme hit routes to appearance', async () => {
      await openWithQuery('Current theme')
      await wrapper.findAll('.pref-search-results li')[0].trigger('click')
      expect(pushMock).toHaveBeenCalledWith({ path: '/preference/appearance' })
    })

    it('a Spelling hit routes to editor', async () => {
      await openWithQuery('spell checker')
      await wrapper.findAll('.pref-search-results li')[0].trigger('click')
      expect(pushMock).toHaveBeenCalledWith({ path: '/preference/editor' })
    })

    it('an Image hit routes to advanced', async () => {
      await openWithQuery('insert action')
      await wrapper.findAll('.pref-search-results li')[0].trigger('click')
      expect(pushMock).toHaveBeenCalledWith({ path: '/preference/advanced' })
    })

    it('a Custom CSS hit routes to advanced', async () => {
      await openWithQuery('stylesheet')
      await wrapper.findAll('.pref-search-results li')[0].trigger('click')
      expect(pushMock).toHaveBeenCalledWith({ path: '/preference/advanced' })
    })

    it('a View-category hit falls back to general', async () => {
      await openWithQuery('View option')
      await wrapper.findAll('.pref-search-results li')[0].trigger('click')
      expect(pushMock).toHaveBeenCalledWith({ path: '/preference/general' })
    })

    it('routing closes the panel', async () => {
      await openWithQuery('Current theme')
      await wrapper.findAll('.pref-search-results li')[0].trigger('click')
      expect(wrapper.find('.pref-search').exists()).toBe(false)
    })
  })

  describe('locale refresh', () => {
    it('rebuilds the index on the languageChanged window event', async () => {
      await openWithQuery('Auto save')
      expect(wrapper.findAll('.pref-search-results li').length).toBeGreaterThan(0)

      window.dispatchEvent(new CustomEvent('languageChanged', { detail: { language: 'ru' } }))
      await nextTick()
      // Index rebuilt without errors; a fresh query still filters.
      await wrapper.find('.pref-search-input').setValue('theme')
      expect(wrapper.findAll('.pref-search-results li').length).toBeGreaterThan(0)
    })
  })
})
