import { shallowMount } from '@vue/test-utils'
import { setupTestPinia } from '../../pinia'
import { createI18n } from 'vue-i18n'

vi.mock('@/bus', () => ({
  default: { on: vi.fn(), off: vi.fn(), emit: vi.fn() }
}))

vi.mock('../../contextMenu/sideBar', () => ({
  showContextMenu: vi.fn()
}))

vi.mock('muya/lib/ui/fileIcons', () => ({
  default: {
    getClassByName: vi.fn(() => 'icon-md')
  }
}))

const i18n = createI18n({ legacy: false, locale: 'en', messages: { en: {} } })

describe('sideBar/treeFile.vue', () => {
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

  it('mounts without errors', async () => {
    const TreeFile = (await import('@/components/sideBar/treeFile.vue')).default
    const wrapper = shallowMount(TreeFile, {
      props: {
        file: {
          id: 'file-1',
          name: 'readme.md',
          pathname: '/tmp/readme.md',
          isMarkdown: true
        },
        depth: 0
      },
      global: {
        plugins: [pinia, i18n],
        stubs: {
          FileIcon: true
        }
      }
    })
    expect(wrapper.exists()).toBe(true)
    expect(wrapper.find('.side-bar-file').exists()).toBe(true)
    expect(wrapper.find('span').text()).toBe('readme.md')
  })

  it('applies current class when file matches currentFile', async () => {
    const TreeFile = (await import('@/components/sideBar/treeFile.vue')).default
    const wrapper = shallowMount(TreeFile, {
      props: {
        file: {
          id: 'file-1',
          name: 'test.md',
          pathname: '/tmp/test.md',
          isMarkdown: true
        },
        depth: 0
      },
      global: {
        plugins: [pinia, i18n],
        stubs: {
          FileIcon: true
        }
      }
    })
    expect(wrapper.find('.side-bar-file.current').exists()).toBe(true)
  })

  it('applies depth-based padding', async () => {
    const TreeFile = (await import('@/components/sideBar/treeFile.vue')).default
    const wrapper = shallowMount(TreeFile, {
      props: {
        file: {
          id: 'file-1',
          name: 'deep.md',
          pathname: '/tmp/deep.md',
          isMarkdown: true
        },
        depth: 2
      },
      global: {
        plugins: [pinia, i18n],
        stubs: {
          FileIcon: true
        }
      }
    })
    const style = wrapper.find('.side-bar-file').attributes('style')
    expect(style).toContain('padding-left')
    // depth * 20 + 20 = 60px
    expect(style).toContain('60px')
  })
})
