/**
 * Function coverage tests for sideBar/treeOpenedTab.vue
 * Covers: selectFile, removeFileInTab (saved + unsaved), the trailing
 * pinned mark (C-51 T-011)
 */
import { shallowMount } from '@vue/test-utils'
import { setupTestPinia } from '../../pinia'
import { createI18n } from 'vue-i18n'
import { nextTick } from 'vue'

vi.mock('@/bus', () => ({
  default: { on: vi.fn(), off: vi.fn(), emit: vi.fn() }
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

describe('sideBar/treeOpenedTab.vue — fn coverage', () => {
  let pinia, OpenedTab, editorStore

  beforeEach(async () => {
    pinia = setupTestPinia()
    const { useEditorStore } = await import('@/store/editor')
    editorStore = useEditorStore()
    editorStore.currentFile = { id: 'cur' }
    editorStore.tabs = []
    OpenedTab = (await import('@/components/sideBar/treeOpenedTab.vue')).default
  })

  const mount = (fileProps = {}) => shallowMount(OpenedTab, {
    props: {
      file: {
        id: 'tab1', filename: 'a.md', pathname: '/a.md',
        isSaved: true, markdown: 'hello',
        ...fileProps
      }
    },
    global: { plugins: [pinia, i18n] }
  })

  it('selectFile calls UPDATE_CURRENT_FILE when different from current', () => {
    const spy = vi.spyOn(editorStore, 'UPDATE_CURRENT_FILE').mockImplementation(() => {})
    const w = mount()
    w.vm.selectFile({ id: 'tab1' })
    expect(spy).toHaveBeenCalled()
  })

  it('selectFile does nothing when file is already current', () => {
    editorStore.currentFile = { id: 'tab1' }
    const spy = vi.spyOn(editorStore, 'UPDATE_CURRENT_FILE').mockImplementation(() => {})
    const w = mount()
    w.vm.selectFile({ id: 'tab1' })
    expect(spy).not.toHaveBeenCalled()
  })

  it('removeFileInTab calls FORCE_CLOSE_TAB for saved file', () => {
    const spy = vi.spyOn(editorStore, 'FORCE_CLOSE_TAB').mockImplementation(() => {})
    const w = mount({ isSaved: true })
    w.vm.removeFileInTab({ id: 'tab1', isSaved: true })
    expect(spy).toHaveBeenCalled()
  })

  it('removeFileInTab calls CLOSE_UNSAVED_TAB for unsaved file', () => {
    const spy = vi.spyOn(editorStore, 'CLOSE_UNSAVED_TAB').mockImplementation(() => {})
    const w = mount({ isSaved: false })
    w.vm.removeFileInTab({ id: 'tab1', isSaved: false })
    expect(spy).toHaveBeenCalled()
  })

  // ── C-51 T-011: the trailing pinned mark on Opened-files rows ──

  it('a pinned opened-file row shows the pin mark with its localized label (C-51 T-011)', async () => {
    const { usePinnedStore } = await import('@/store/pinned')
    const pinnedStore = usePinnedStore()
    pinnedStore.pinnedFiles = ['/a.md']

    const w = mount()
    const mark = w.find('.opened-file > .pin-mark')
    expect(mark.exists()).toBe(true)
    expect(mark.attributes('title')).toBe('Pinned')
    expect(mark.attributes('aria-label')).toBe('Pinned')
    expect(mark.attributes('role')).toBe('img')
    // the name span keeps its own slot — the mark trails it
    expect(w.find('.opened-file > span.name').text()).toBe('a.md')
  })

  it('unpinning removes the mark from the opened-file row immediately (C-51 T-011)', async () => {
    const { usePinnedStore } = await import('@/store/pinned')
    const pinnedStore = usePinnedStore()
    pinnedStore.pinnedFiles = ['/a.md']

    const w = mount()
    expect(w.find('.opened-file > .pin-mark').exists()).toBe(true)

    await pinnedStore.UNPIN_FILE('/a.md')
    await nextTick()
    expect(w.find('.opened-file > .pin-mark').exists()).toBe(false)
  })

  it('no pin mark while the tab is not pinned', async () => {
    const { usePinnedStore } = await import('@/store/pinned')
    const pinnedStore = usePinnedStore()
    pinnedStore.pinnedFiles = ['/somewhere-else.md']

    const w = mount()
    expect(w.find('.opened-file > .pin-mark').exists()).toBe(false)
  })
})
