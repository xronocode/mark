import { shallowMount } from '@vue/test-utils'
import { setupTestPinia } from '../../pinia'
import { createI18n } from 'vue-i18n'

vi.mock('@/bus', () => ({
  default: { on: vi.fn(), off: vi.fn(), emit: vi.fn() }
}))

vi.mock('../../contextMenu/sideBar', () => ({
  showContextMenu: vi.fn()
}))

const i18n = createI18n({ legacy: false, locale: 'en', messages: { en: {} } })

describe('sideBar/treeFolder.vue', () => {
  let pinia

  beforeEach(() => {
    pinia = setupTestPinia()
  })

  it('mounts without errors', async () => {
    const TreeFolder = (await import('@/components/sideBar/treeFolder.vue')).default
    const wrapper = shallowMount(TreeFolder, {
      props: {
        folder: {
          id: 'folder-1',
          name: 'docs',
          pathname: '/tmp/docs',
          isCollapsed: false,
          folders: [],
          files: []
        },
        depth: 0
      },
      global: {
        plugins: [pinia, i18n],
        stubs: {
          TreeFolder: true,
          File: true
        }
      }
    })
    expect(wrapper.exists()).toBe(true)
    expect(wrapper.find('.side-bar-folder').exists()).toBe(true)
  })

  it('renders folder name', async () => {
    const TreeFolder = (await import('@/components/sideBar/treeFolder.vue')).default
    const wrapper = shallowMount(TreeFolder, {
      props: {
        folder: {
          id: 'folder-1',
          name: 'src',
          pathname: '/tmp/src',
          isCollapsed: false,
          folders: [],
          files: []
        },
        depth: 0
      },
      global: {
        plugins: [pinia, i18n],
        stubs: {
          TreeFolder: true,
          File: true
        }
      }
    })
    expect(wrapper.find('.folder-name span').text()).toBe('src')
  })

  it('toggles collapse on click', async () => {
    const TreeFolder = (await import('@/components/sideBar/treeFolder.vue')).default
    const wrapper = shallowMount(TreeFolder, {
      props: {
        folder: {
          id: 'folder-1',
          name: 'docs',
          pathname: '/tmp/docs',
          isCollapsed: false,
          folders: [],
          files: []
        },
        depth: 0
      },
      global: {
        plugins: [pinia, i18n],
        stubs: {
          TreeFolder: true,
          File: true
        }
      }
    })
    // Initially expanded (isCollapsed: false)
    expect(wrapper.find('.folder-contents').exists()).toBe(true)
    // Click folder name to collapse
    await wrapper.find('.folder-name').trigger('click')
    expect(wrapper.find('.folder-contents').exists()).toBe(false)
  })
})
