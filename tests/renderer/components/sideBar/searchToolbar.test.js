import { shallowMount } from '@vue/test-utils'
import { setupTestPinia } from '../../pinia'
import { createI18n } from 'vue-i18n'

const i18n = createI18n({ legacy: false, locale: 'en', messages: { en: {} } })

describe('sideBar/searchToolbar.vue', () => {
  let pinia

  beforeEach(() => {
    pinia = setupTestPinia()
  })

  it('mounts without errors', async () => {
    const SearchToolbar = (await import('@/components/sideBar/searchToolbar.vue')).default
    const wrapper = shallowMount(SearchToolbar, {
      global: {
        plugins: [pinia, i18n],
        stubs: {
          ElTooltip: true
        }
      }
    })
    expect(wrapper.exists()).toBe(true)
    expect(wrapper.find('.search-toolbar').exists()).toBe(true)
  })

  it('renders a search input', async () => {
    const SearchToolbar = (await import('@/components/sideBar/searchToolbar.vue')).default
    const wrapper = shallowMount(SearchToolbar, {
      global: {
        plugins: [pinia, i18n],
        stubs: {
          ElTooltip: true
        }
      }
    })
    expect(wrapper.find('.search-input').exists()).toBe(true)
  })

  it('renders search-options section with option buttons', async () => {
    const SearchToolbar = (await import('@/components/sideBar/searchToolbar.vue')).default
    const wrapper = shallowMount(SearchToolbar, {
      global: {
        plugins: [pinia, i18n],
        stubs: {
          ElTooltip: { template: '<div><slot /></div>' }
        }
      }
    })
    const opts = wrapper.findAll('.opt')
    expect(opts.length).toBe(3)
  })

  it('toggles case-sensitive option', async () => {
    const { useSearchStore } = await import('@/store/search')
    const searchStore = useSearchStore()
    searchStore.TOGGLE_OPTION = vi.fn()

    const SearchToolbar = (await import('@/components/sideBar/searchToolbar.vue')).default
    const wrapper = shallowMount(SearchToolbar, {
      global: {
        plugins: [pinia, i18n],
        stubs: {
          ElTooltip: { template: '<div><slot /></div>' }
        }
      }
    })
    const opts = wrapper.findAll('.opt')
    await opts[0].trigger('click')
    expect(searchStore.TOGGLE_OPTION).toHaveBeenCalledWith('isCaseSensitive')
  })
})
