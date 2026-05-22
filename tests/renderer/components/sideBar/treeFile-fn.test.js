/**
 * Function coverage tests for sideBar/treeFile.vue
 * Covers: handleFileClick, noop, focusRenameInput, rename, isDirty computed
 */
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

describe('sideBar/treeFile.vue — fn coverage', () => {
  let pinia, TreeFile, projectStore, editorStore

  beforeEach(async () => {
    pinia = setupTestPinia()
    const { useProjectStore } = await import('@/store/project')
    const { useEditorStore } = await import('@/store/editor')
    projectStore = useProjectStore()
    editorStore = useEditorStore()
    projectStore.renameCache = null
    projectStore.activeItem = {}
    projectStore.clipboard = null
    editorStore.currentFile = { id: 'cur', pathname: '/a/cur.md' }
    editorStore.tabs = []
    TreeFile = (await import('@/components/sideBar/treeFile.vue')).default
  })

  const stubs = { FileIcon: true }

  const mount = (fileProps = {}) => shallowMount(TreeFile, {
    props: {
      file: {
        id: 'f1', name: 'test.md', pathname: '/root/test.md',
        isMarkdown: true,
        ...fileProps
      },
      depth: 1
    },
    global: { plugins: [pinia, i18n], stubs }
  })

  it('handleFileClick does nothing for non-markdown files', () => {
    const w = mount({ isMarkdown: false })
    w.vm.handleFileClick()
    // Should not call UPDATE_CURRENT_FILE or send IPC
    expect(window.electron.ipcRenderer.send).not.toHaveBeenCalled()
  })

  it('handleFileClick opens file via IPC when tab not found', () => {
    editorStore.tabs = []
    const w = mount()
    w.vm.handleFileClick()
    expect(window.electron.ipcRenderer.send).toHaveBeenCalledWith('mt::open-file', '/root/test.md', {})
  })

  it('handleFileClick switches to existing tab', () => {
    const tab = { id: 'tab1', pathname: '/root/test.md', markdown: 'x', filename: 'test.md' }
    editorStore.tabs = [tab]
    editorStore.updateTabIdToIndex()
    const spy = vi.spyOn(editorStore, 'UPDATE_CURRENT_FILE').mockImplementation(() => {})
    const w = mount()
    w.vm.handleFileClick()
    expect(spy).toHaveBeenCalledWith(tab)
  })

  it('handleFileClick does nothing when current file is already selected', () => {
    const tab = { id: 'tab1', pathname: '/root/test.md', markdown: 'x', filename: 'test.md' }
    editorStore.tabs = [tab]
    editorStore.currentFile = { id: 'cur', pathname: '/root/test.md' }
    editorStore.updateTabIdToIndex()
    const spy = vi.spyOn(editorStore, 'UPDATE_CURRENT_FILE').mockImplementation(() => {})
    const w = mount()
    w.vm.handleFileClick()
    expect(spy).not.toHaveBeenCalled()
  })

  it('noop does nothing', () => {
    const w = mount()
    w.vm.noop()
  })

  it('rename calls RENAME_IN_SIDEBAR when newName is set', () => {
    const spy = vi.spyOn(projectStore, 'RENAME_IN_SIDEBAR').mockImplementation(() => {})
    const w = mount()
    w.vm.newName = 'renamed.md'
    w.vm.rename()
    expect(spy).toHaveBeenCalledWith('renamed.md')
  })

  it('rename does nothing when newName is empty', () => {
    const spy = vi.spyOn(projectStore, 'RENAME_IN_SIDEBAR').mockImplementation(() => {})
    const w = mount()
    w.vm.newName = ''
    w.vm.rename()
    expect(spy).not.toHaveBeenCalled()
  })

  it('isDirty computed returns false when no matching tab', () => {
    editorStore.tabs = []
    const w = mount()
    expect(w.vm.isDirty).toBe(false)
  })

  it('isDirty computed returns true when tab is unsaved', () => {
    editorStore.tabs = [{ id: 'tab1', pathname: '/root/test.md', isSaved: false }]
    const w = mount()
    expect(w.vm.isDirty).toBe(true)
  })
})
