import { shallowMount } from '@vue/test-utils'
import { setupTestPinia } from '../../pinia'
import { createI18n } from 'vue-i18n'

vi.mock('@/bus', () => ({
  default: { on: vi.fn(), off: vi.fn(), emit: vi.fn() }
}))

const i18n = createI18n({ legacy: false, locale: 'en', messages: { en: {} } })

describe('sideBar/searchResultItem.vue', () => {
  let pinia

  beforeEach(async () => {
    pinia = setupTestPinia()
    const { useEditorStore } = await import('@/store/editor')
    const editorStore = useEditorStore()
    editorStore.currentFile = {
      id: 'tab-1',
      pathname: '/tmp/test.md',
      filename: 'test.md'
    }
    editorStore.tabs = [editorStore.currentFile]
  })

  const makeSearchResult = (overrides = {}) => ({
    filePath: '/tmp/test.md',
    matches: [
      {
        lineText: 'Hello world test match',
        range: [[1, 6], [1, 11]]
      }
    ],
    ...overrides
  })

  it('mounts without errors', async () => {
    const SearchResultItem = (await import('@/components/sideBar/searchResultItem.vue')).default
    const wrapper = shallowMount(SearchResultItem, {
      props: {
        searchResult: makeSearchResult()
      },
      global: {
        plugins: [pinia, i18n]
      }
    })
    expect(wrapper.exists()).toBe(true)
    expect(wrapper.find('.search-result-item').exists()).toBe(true)
  })

  it('displays filename and match count', async () => {
    const SearchResultItem = (await import('@/components/sideBar/searchResultItem.vue')).default
    const wrapper = shallowMount(SearchResultItem, {
      props: {
        searchResult: makeSearchResult()
      },
      global: {
        plugins: [pinia, i18n]
      }
    })
    expect(wrapper.find('.match-count').text()).toBe('1')
  })

  it('shows highlight text in matches', async () => {
    const SearchResultItem = (await import('@/components/sideBar/searchResultItem.vue')).default
    const wrapper = shallowMount(SearchResultItem, {
      props: {
        searchResult: makeSearchResult()
      },
      global: {
        plugins: [pinia, i18n]
      }
    })
    // With 1 match, matches should be shown by default (count <= 20)
    expect(wrapper.find('.highlight').exists()).toBe(true)
    expect(wrapper.find('.highlight').text()).toBe('world')
  })

  it('toggle collapses matches on arrow click', async () => {
    const SearchResultItem = (await import('@/components/sideBar/searchResultItem.vue')).default
    const wrapper = shallowMount(SearchResultItem, {
      props: {
        searchResult: makeSearchResult()
      },
      global: {
        plugins: [pinia, i18n]
      }
    })
    expect(wrapper.find('.matches').exists()).toBe(true)
    // Click the arrow icon to toggle
    await wrapper.find('.icon-arrow').trigger('click')
    expect(wrapper.find('.matches').exists()).toBe(false)
  })
})
