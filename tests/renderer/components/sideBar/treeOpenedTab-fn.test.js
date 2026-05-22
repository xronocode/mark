/**
 * Function coverage tests for sideBar/treeOpenedTab.vue
 * Covers: selectFile, removeFileInTab (saved + unsaved)
 */
import { shallowMount } from '@vue/test-utils'
import { setupTestPinia } from '../../pinia'
import { createI18n } from 'vue-i18n'

vi.mock('@/bus', () => ({
  default: { on: vi.fn(), off: vi.fn(), emit: vi.fn() }
}))

const i18n = createI18n({ legacy: false, locale: 'en', messages: { en: {} } })

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
})
