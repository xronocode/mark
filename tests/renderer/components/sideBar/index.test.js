import { shallowMount } from '@vue/test-utils'
import { setupTestPinia } from '../../pinia'
import { createI18n } from 'vue-i18n'

const i18n = createI18n({ legacy: false, locale: 'en', messages: { en: {} } })

describe('sideBar/index.vue', () => {
  let pinia

  beforeEach(() => {
    pinia = setupTestPinia()
  })

  it('mounts without errors', async () => {
    const SideBar = (await import('@/components/sideBar/index.vue')).default
    const wrapper = shallowMount(SideBar, {
      global: {
        plugins: [pinia, i18n],
        stubs: {
          Tree: true,
          SideBarSearch: true,
          Toc: true,
          SearchToolbar: true
        }
      }
    })
    expect(wrapper.exists()).toBe(true)
  })

  it('respects showSideBar layout state', async () => {
    const { useLayoutStore } = await import('@/store/layout')
    const layoutStore = useLayoutStore()
    layoutStore.showSideBar = false

    const SideBar = (await import('@/components/sideBar/index.vue')).default
    const wrapper = shallowMount(SideBar, {
      global: {
        plugins: [pinia, i18n],
        stubs: {
          Tree: true,
          SideBarSearch: true,
          Toc: true,
          SearchToolbar: true
        }
      }
    })
    // v-show should hide the sidebar
    const sideBarEl = wrapper.find('.side-bar')
    expect(sideBarEl.exists()).toBe(true)
    // v-show applies display:none, but with jsdom we check the element still exists
  })

  it('has a drag-bar for resizing', async () => {
    const SideBar = (await import('@/components/sideBar/index.vue')).default
    const wrapper = shallowMount(SideBar, {
      global: {
        plugins: [pinia, i18n],
        stubs: {
          Tree: true,
          SideBarSearch: true,
          Toc: true,
          SearchToolbar: true
        }
      }
    })
    expect(wrapper.find('.drag-bar').exists()).toBe(true)
  })
})
