import { shallowMount } from '@vue/test-utils'
import { setupTestPinia } from '../pinia'
import { createI18n } from 'vue-i18n'

vi.mock('@/bus', () => ({
  default: { on: vi.fn(), off: vi.fn(), emit: vi.fn() }
}))

vi.mock('@/assets/icons/searchIcons/iconCase.svg', () => ({ default: { template: '<svg/>' } }))
vi.mock('@/assets/icons/searchIcons/iconWord.svg', () => ({ default: { template: '<svg/>' } }))
vi.mock('@/assets/icons/searchIcons/iconRegex.svg', () => ({ default: { template: '<svg/>' } }))

vi.mock('underscore', () => ({
  debounce: (fn) => fn
}))

const i18n = createI18n({ legacy: false, locale: 'en', messages: { en: {} } })

describe('search/index.vue', () => {
  let pinia

  beforeEach(async () => {
    pinia = setupTestPinia()
    const { useEditorStore } = await import('@/store/editor')
    const editorStore = useEditorStore()
    editorStore.currentFile = {
      id: 'tab-1',
      searchMatches: null
    }
  })

  it('mounts without errors', async () => {
    const Search = (await import('@/components/search/index.vue')).default
    const wrapper = shallowMount(Search, {
      global: {
        plugins: [pinia, i18n],
        stubs: {
          ElTooltip: true,
          FindCaseIcon: true,
          FindWordIcon: true,
          FindRegexIcon: true
        }
      }
    })
    expect(wrapper.exists()).toBe(true)
  })

  it('is hidden by default', async () => {
    const Search = (await import('@/components/search/index.vue')).default
    const wrapper = shallowMount(Search, {
      global: {
        plugins: [pinia, i18n],
        stubs: {
          ElTooltip: true,
          FindCaseIcon: true,
          FindWordIcon: true,
          FindRegexIcon: true
        }
      }
    })
    // showSearch is false by default, so the search bar is hidden via v-show
    const bar = wrapper.find('.search-bar')
    expect(bar.exists()).toBe(true)
    // v-show sets display none
    expect(bar.isVisible()).toBe(false)
  })
})
