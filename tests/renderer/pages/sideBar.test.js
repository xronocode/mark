/**
 * Settings search panel basics — replaces the retired left-rail tests
 * (src/renderer/src/prefComponents/sideBar/index.vue is dead since the
 * C-38 T-003 toolbar replaced it; the search lives in
 * prefComponents/tabsBar/searchPanel.vue now).
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
    theme: { description: 'Theme--Current theme', type: 'string' }
  }
}))

const pushMock = vi.fn(() => Promise.resolve())
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: pushMock }),
  useRoute: () => ({ name: 'general', path: '/preference/general' })
}))

import SearchPanel from '@/prefComponents/tabsBar/searchPanel.vue'

describe('Settings search panel (tabsBar/searchPanel.vue)', () => {
  let wrapper

  beforeEach(() => {
    pushMock.mockClear()
    wrapper = mount(SearchPanel)
  })

  afterEach(() => {
    wrapper.unmount()
  })

  it('is hidden until openPanel is called', async () => {
    expect(wrapper.find('.pref-search').exists()).toBe(false)
    wrapper.vm.openPanel()
    await nextTick()
    expect(wrapper.find('.pref-search').exists()).toBe(true)
    expect(wrapper.find('.pref-search-input').exists()).toBe(true)
  })

  it('Esc closes the panel and clears the query', async () => {
    wrapper.vm.openPanel()
    await nextTick()
    const input = wrapper.find('.pref-search-input')
    await input.setValue('theme')
    await input.trigger('keydown', { key: 'Escape' })
    expect(wrapper.find('.pref-search').exists()).toBe(false)
    expect(wrapper.find('.pref-search-input').exists()).toBe(false)
  })

  it('emits closed when it closes (the toolbar tracks open state through it)', async () => {
    expect(wrapper.emitted('closed')).toBeUndefined()
    wrapper.vm.openPanel()
    await nextTick()
    await wrapper.find('.pref-search-input').trigger('keydown', { key: 'Escape' })
    expect(wrapper.emitted('closed')).toHaveLength(1)
  })

  it('shows the empty hint when nothing matches', async () => {
    wrapper.vm.openPanel()
    await nextTick()
    await wrapper.find('.pref-search-input').setValue('zzz-no-match')
    expect(wrapper.find('.pref-search-results').exists()).toBe(false)
    expect(wrapper.find('.pref-search-empty').exists()).toBe(true)
  })
})
