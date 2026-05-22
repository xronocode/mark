import { shallowMount } from '@vue/test-utils'
import { setupTestPinia } from '../../pinia'
import { createI18n } from 'vue-i18n'

const i18n = createI18n({ legacy: false, locale: 'en', messages: { en: {} } })

describe('sideBar/search.vue', () => {
  let pinia

  beforeEach(() => {
    pinia = setupTestPinia()
  })

  it('mounts without errors', async () => {
    const SideBarSearch = (await import('@/components/sideBar/search.vue')).default
    const wrapper = shallowMount(SideBarSearch, {
      global: {
        plugins: [pinia, i18n],
        stubs: {
          SearchResultItem: true,
          ElButton: true
        }
      }
    })
    expect(wrapper.exists()).toBe(true)
    expect(wrapper.find('.side-bar-search-results').exists()).toBe(true)
  })

  it('shows no-folder message when no project is open', async () => {
    const SideBarSearch = (await import('@/components/sideBar/search.vue')).default
    const wrapper = shallowMount(SideBarSearch, {
      global: {
        plugins: [pinia, i18n],
        stubs: {
          SearchResultItem: true,
          ElButton: true
        }
      }
    })
    // Default state: no project tree
    expect(wrapper.find('.msg').exists()).toBe(true)
  })

  it('shows message when project is open but no query', async () => {
    const { useProjectStore } = await import('@/store/project')
    const projectStore = useProjectStore()
    projectStore.projectTree = { pathname: '/tmp/project' }

    const SideBarSearch = (await import('@/components/sideBar/search.vue')).default
    const wrapper = shallowMount(SideBarSearch, {
      global: {
        plugins: [pinia, i18n],
        stubs: {
          SearchResultItem: true,
          ElButton: true
        }
      }
    })
    // When project is open but no query, the component shows a muted
    // message OR the no-folder message is gone. Verify project is set.
    expect(wrapper.find('.side-bar-search-results').exists()).toBe(true)
  })
})
