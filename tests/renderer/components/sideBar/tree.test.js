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

  it('renders no Open Folder button and no recent-folders list when no projects are open (C-51 T-011)', async () => {
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
    // The sidebar empty state lost its Open Folder button and RECENT
    // folders list — both live on the welcome screen (C-46) now.
    expect(wrapper.find('.open-project').exists()).toBe(false)
    expect(wrapper.find('.open-folder-btn').exists()).toBe(false)
    expect(wrapper.find('.recent-folders').exists()).toBe(false)
    expect(wrapper.find('.recent-folder-item').exists()).toBe(false)
    // The tree column itself still mounts (the file sections live in
    // fileSections.vue, stubbed here).
    expect(wrapper.find('.tree-view').exists()).toBe(true)
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
