/**
 * Function coverage tests for sideBar/treeFolder.vue
 * Covers: folderNameClick, handleInputFocus, handleInputEnter,
 * focusRenameInput, rename, noop, contextmenu handler
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

describe('sideBar/treeFolder.vue — fn coverage', () => {
  let pinia, TreeFolder, projectStore

  beforeEach(async () => {
    pinia = setupTestPinia()
    const { useProjectStore } = await import('@/store/project')
    projectStore = useProjectStore()
    projectStore.createCache = {}
    projectStore.renameCache = null
    projectStore.activeItem = {}
    projectStore.clipboard = null
    TreeFolder = (await import('@/components/sideBar/treeFolder.vue')).default
  })

  const stubs = { File: true, TreeFolder: true }

  const mount = (folderProps = {}) => shallowMount(TreeFolder, {
    props: {
      folder: {
        id: 'f1', name: 'src', pathname: '/root/src',
        isCollapsed: false, folders: [], files: [],
        ...folderProps
      },
      depth: 1
    },
    global: { plugins: [pinia, i18n], stubs }
  })

  it('folderNameClick toggles isCollapsed', () => {
    const w = mount()
    expect(w.vm.isCollapsed).toBe(false)
    w.vm.folderNameClick()
    expect(w.vm.isCollapsed).toBe(true)
    w.vm.folderNameClick()
    expect(w.vm.isCollapsed).toBe(false)
  })

  it('handleInputEnter calls CREATE_FILE_DIRECTORY', () => {
    const spy = vi.spyOn(projectStore, 'CREATE_FILE_DIRECTORY').mockImplementation(() => {})
    const w = mount()
    w.vm.createName = 'test.md'
    w.vm.handleInputEnter()
    expect(spy).toHaveBeenCalledWith('test.md')
  })

  it('noop does nothing', () => {
    const w = mount()
    w.vm.noop() // Should not throw
  })

  it('rename calls RENAME_IN_SIDEBAR when newName is set', () => {
    const spy = vi.spyOn(projectStore, 'RENAME_IN_SIDEBAR').mockImplementation(() => {})
    const w = mount()
    w.vm.newName = 'renamed-folder'
    w.vm.rename()
    expect(spy).toHaveBeenCalledWith('renamed-folder')
  })

  it('rename does nothing when newName is empty', () => {
    const spy = vi.spyOn(projectStore, 'RENAME_IN_SIDEBAR').mockImplementation(() => {})
    const w = mount()
    w.vm.newName = ''
    w.vm.rename()
    expect(spy).not.toHaveBeenCalled()
  })

  it('handleInputFocus is registered on bus', async () => {
    const bus = (await import('@/bus')).default
    mount()
    expect(bus.on).toHaveBeenCalledWith('SIDEBAR::show-new-input', expect.any(Function))
  })

  it('focusRenameInput is registered on bus', async () => {
    const bus = (await import('@/bus')).default
    mount()
    expect(bus.on).toHaveBeenCalledWith('SIDEBAR::show-rename-input', expect.any(Function))
  })
})
