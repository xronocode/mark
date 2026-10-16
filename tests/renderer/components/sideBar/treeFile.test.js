import { shallowMount } from '@vue/test-utils'
import { setupTestPinia } from '../../pinia'
import { createI18n } from 'vue-i18n'
import { nextTick } from 'vue'

vi.mock('@/bus', () => ({
  default: { on: vi.fn(), off: vi.fn(), emit: vi.fn() }
}))

vi.mock('../../contextMenu/sideBar', () => ({
  showContextMenu: vi.fn()
}))

const i18n = createI18n({
  legacy: false,
  locale: 'en',
  messages: {
    en: {
      sideBar: {
        tree: {
          pinned: 'Pinned'
        }
      }
    }
  }
})

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
        plugins: [pinia, i18n]
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
        plugins: [pinia, i18n]
      }
    })
    expect(wrapper.find('.side-bar-file.current').exists()).toBe(true)
  })

  it('rows carry constant padding — nesting indents via the guide-line containers (C-51 T-001)', async () => {
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
        plugins: [pinia, i18n]
      }
    })
    // No depth*20px formula anymore; only the non-Markdown opacity stays inline.
    const style = wrapper.find('.side-bar-file').attributes('style')
    expect(style).not.toContain('padding-left')
  })

  // ── C-51 T-011: the trailing pin mark on pinned rows ──
  const mountFile = async (pathname) => {
    const TreeFile = (await import('@/components/sideBar/treeFile.vue')).default
    return shallowMount(TreeFile, {
      props: {
        file: {
          id: 'file-1',
          name: pathname.split('/').pop(),
          pathname,
          isMarkdown: true
        },
        depth: 0
      },
      global: {
        plugins: [pinia, i18n]
      }
    })
  }

  it('a pinned row shows the pin mark with its localized «Pinned» label (C-51 T-011)', async () => {
    const { usePinnedStore } = await import('@/store/pinned')
    const pinnedStore = usePinnedStore()
    pinnedStore.pinnedFiles = ['/tmp/readme.md']

    const wrapper = await mountFile('/tmp/readme.md')
    const mark = wrapper.find('.side-bar-file > .pin-mark')
    expect(mark.exists()).toBe(true)
    expect(mark.attributes('title')).toBe('Pinned')
    expect(mark.attributes('aria-label')).toBe('Pinned')
    expect(mark.attributes('role')).toBe('img')
  })

  it('no pin mark while unpinned; pin and unpin update the row immediately (C-51 T-011)', async () => {
    const { usePinnedStore } = await import('@/store/pinned')
    const pinnedStore = usePinnedStore()
    pinnedStore.pinnedFiles = []

    const wrapper = await mountFile('/tmp/readme.md')
    expect(wrapper.find('.side-bar-file > .pin-mark').exists()).toBe(false)

    // pin from any surface (tree context menu / Pinned section) — the
    // reactive store drives the mark.
    await pinnedStore.PIN_FILE('/tmp/readme.md')
    await nextTick()
    expect(wrapper.find('.side-bar-file > .pin-mark').exists()).toBe(true)

    await pinnedStore.UNPIN_FILE('/tmp/readme.md')
    await nextTick()
    expect(wrapper.find('.side-bar-file > .pin-mark').exists()).toBe(false)
  })

  it('another file being pinned does not mark this row (path-keyed)', async () => {
    const { usePinnedStore } = await import('@/store/pinned')
    const pinnedStore = usePinnedStore()
    pinnedStore.pinnedFiles = ['/tmp/other.md']

    const wrapper = await mountFile('/tmp/readme.md')
    expect(wrapper.find('.side-bar-file > .pin-mark').exists()).toBe(false)
  })
})
