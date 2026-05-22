import { shallowMount } from '@vue/test-utils'
import { setupTestPinia } from '../../pinia'
import { createI18n } from 'vue-i18n'

vi.mock('@/bus', () => ({
  default: { on: vi.fn(), off: vi.fn(), emit: vi.fn() }
}))

const i18n = createI18n({ legacy: false, locale: 'en', messages: { en: {} } })

describe('sideBar/tree.vue', () => {
  let pinia

  beforeEach(() => {
    pinia = setupTestPinia()
  })

  it('mounts without errors', async () => {
    const Tree = (await import('@/components/sideBar/tree.vue')).default
    const wrapper = shallowMount(Tree, {
      props: {
        openedFiles: [],
        tabs: []
      },
      global: {
        plugins: [pinia, i18n],
        stubs: {
          Folder: true,
          File: true,
          OpenedFile: true,
          TransitionGroup: true
        }
      }
    })
    expect(wrapper.exists()).toBe(true)
    expect(wrapper.find('.tree-view').exists()).toBe(true)
  })

  it('shows open-folder button when no projects', async () => {
    const Tree = (await import('@/components/sideBar/tree.vue')).default
    const wrapper = shallowMount(Tree, {
      props: {
        openedFiles: [],
        tabs: []
      },
      global: {
        plugins: [pinia, i18n],
        stubs: {
          Folder: true,
          File: true,
          OpenedFile: true,
          TransitionGroup: true
        }
      }
    })
    expect(wrapper.find('.open-project').exists()).toBe(true)
    expect(wrapper.find('.button-primary').exists()).toBe(true)
  })

  it('renders opened files section when tabs are present', async () => {
    const Tree = (await import('@/components/sideBar/tree.vue')).default
    const wrapper = shallowMount(Tree, {
      props: {
        openedFiles: [],
        tabs: [{ id: 'tab-1', filename: 'test.md', isSaved: true }]
      },
      global: {
        plugins: [pinia, i18n],
        stubs: {
          Folder: true,
          File: true,
          OpenedFile: true,
          TransitionGroup: true
        }
      }
    })
    expect(wrapper.find('.opened-files').exists()).toBe(true)
  })

  it('hides opened files section when tabs are empty', async () => {
    const Tree = (await import('@/components/sideBar/tree.vue')).default
    const wrapper = shallowMount(Tree, {
      props: {
        openedFiles: [],
        tabs: []
      },
      global: {
        plugins: [pinia, i18n],
        stubs: {
          Folder: true,
          File: true,
          OpenedFile: true,
          TransitionGroup: true
        }
      }
    })
    expect(wrapper.find('.opened-files').exists()).toBe(false)
  })
})
