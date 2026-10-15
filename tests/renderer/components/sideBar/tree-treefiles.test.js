// FILE: tests/renderer/components/sideBar/tree-treefiles.test.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: C-51 T-001 unit tests for tree.vue's root view (Markdown-only filter, empty-root placeholder on visible lists, folder-switcher row) and treeFile.vue's context-menu pin options.
//   SCOPE: shallowMount of tree.vue with Folder/File/OpenedFile/FileSections stubbed; mount of treeFile.vue with the context menu mocked.
//   DEPENDS: components/sideBar/{tree.vue,treeFile.vue}, store/{project,preferences,pinned}, tests/renderer/setup.ts.
//   LINKS: .grace/changes/active/C-51 T-001/T-002; .grace/verification/runtime.xml V-M-011.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   makeFile/makeRoot - model fixtures (treeCtrl shape).
//   i18n - test fixture / helper.
//   makeFile - test fixture / helper.
//   makeRoot - test fixture / helper.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - 2026-10-16 C-51 T-001/T-002: initial tests.
// END_CHANGE_SUMMARY

import { setupTestPinia } from '../../pinia'
import { shallowMount, mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'

vi.mock('@/bus', () => ({
  default: { on: vi.fn(), off: vi.fn(), emit: vi.fn() }
}))

vi.mock('muya/lib/ui/fileIcons', () => ({
  default: { getClassByName: vi.fn(() => 'icon-md') }
}))

const i18n = createI18n({
  legacy: false,
  locale: 'en',
  messages: {
    en: {
      sideBar: {
        tree: {
          openedFiles: 'Opened files',
          saveAll: 'Save All',
          closeAll: 'Close All',
          openFolder: 'Open Folder',
          closeFolder: 'Close folder',
          createFile: 'Create File',
          newFile: 'New file',
          recentFolders: 'Recent',
          openOrSwitchFolder: 'Open or switch folder'
        }
      }
    }
  }
})

const makeFile = (name, isMarkdown, pathname) => ({
  id: `file-${name}`,
  name,
  pathname: pathname || `/tmp/proj/${name}`,
  isFile: true,
  isDirectory: false,
  isMarkdown
})

const makeRoot = (files = [], folders = []) => ({
  pathname: '/tmp/proj',
  name: 'proj',
  isDirectory: true,
  isFile: false,
  isMarkdown: false,
  folders,
  files
})

describe('sideBar/tree.vue — C-51 T-001 view filter + switcher', () => {
  let pinia, Tree, projectStore, preferenceStore

  beforeEach(async () => {
    pinia = setupTestPinia()
    const { useProjectStore } = await import('@/store/project')
    const { usePreferencesStore } = await import('@/store/preferences')
    projectStore = useProjectStore()
    preferenceStore = usePreferencesStore()
    Tree = (await import('@/components/sideBar/tree.vue')).default
  })

  const mountTree = (props = {}) =>
    shallowMount(Tree, {
      props: { openedFiles: [], tabs: [], ...props },
      global: {
        plugins: [pinia, i18n],
        stubs: { Folder: true, File: true, OpenedFile: true, FileSections: true, TransitionGroup: true }
      }
    })

  it('root view lists only Markdown files by default and all files when treeShowAllFiles is on', async () => {
    const root = makeRoot([makeFile('a.md', true), makeFile('b.png', false)])
    projectStore.projectTrees = [root]
    const wrapper = mountTree()

    expect(wrapper.vm.rootFilesOf(root).map((f) => f.name)).toEqual(['a.md'])
    preferenceStore.treeShowAllFiles = true
    await wrapper.vm.$nextTick()
    expect(wrapper.vm.rootFilesOf(root).map((f) => f.name)).toEqual(['a.md', 'b.png'])
  })

  it('folders without Markdown below are hidden at the root level too', async () => {
    const emptyDir = { id: 'd1', name: 'empty', pathname: '/tmp/proj/empty', folders: [], files: [] }
    const fullDir = {
      id: 'd2',
      name: 'full',
      pathname: '/tmp/proj/full',
      folders: [],
      files: [makeFile('note.md', true, '/tmp/proj/full/note.md')]
    }
    const root = makeRoot([], [emptyDir, fullDir])
    projectStore.projectTrees = [root]
    const wrapper = mountTree()

    expect(wrapper.vm.rootFoldersOf(root).map((f) => f.name)).toEqual(['full'])
    preferenceStore.treeShowAllFiles = true
    await wrapper.vm.$nextTick()
    expect(wrapper.vm.rootFoldersOf(root)).toHaveLength(2)
  })

  it('the empty-root placeholder keys on the visible lists, not the model', async () => {
    // root holding only a png: model is non-empty but the default view is
    const onlyPng = makeRoot([makeFile('b.png', false)])
    projectStore.projectTrees = [onlyPng]
    let wrapper = mountTree()
    expect(wrapper.find('.new-file-row').exists()).toBe(true)

    preferenceStore.treeShowAllFiles = true
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.new-file-row').exists()).toBe(false)

    preferenceStore.treeShowAllFiles = false
    projectStore.projectTrees = [makeRoot([makeFile('a.md', true)])]
    wrapper = mountTree()
    expect(wrapper.find('.new-file-row').exists()).toBe(false)
  })

  it('renders the folder-switcher row; the name and chevron open the folder picker', async () => {
    projectStore.projectTrees = [makeRoot()]
    const wrapper = mountTree()
    const switcher = wrapper.find('.folder-switcher')
    expect(switcher.exists()).toBe(true)
    expect(switcher.find('.switcher-chevron').exists()).toBe(true)

    const spy = vi.spyOn(projectStore, 'ASK_FOR_OPEN_PROJECT').mockImplementation(() => {})
    await switcher.find('span').trigger('click')
    expect(spy).toHaveBeenCalledTimes(1)
    await switcher.find('.switcher-chevron').trigger('click')
    expect(spy).toHaveBeenCalledTimes(2)
  })

  it('the left chevron still toggles root collapse', async () => {
    projectStore.projectTrees = [makeRoot()]
    const wrapper = mountTree()
    expect(wrapper.vm.isRootExpanded('/tmp/proj')).toBe(true)
    // shallowMount stubs ChromeIcon, so a DOM click on the stub never
    // reaches the @click listener — invoke the bound handler instead.
    const chevron = wrapper.findComponent('.folder-switcher .icon-arrow')
    expect(typeof chevron.vm.$attrs.onClick).toBe('function')
    await chevron.vm.$attrs.onClick(new MouseEvent('click'))
    expect(wrapper.vm.isRootExpanded('/tmp/proj')).toBe(false)
  })
})

describe('sideBar/treeFile.vue — C-51 T-002 pin context-menu options', () => {
  let pinia

  beforeEach(async () => {
    pinia = setupTestPinia()
  })

  const showContextMenuMock = vi.hoisted(() => vi.fn())
  vi.mock('@/contextMenu/sideBar', () => ({ showContextMenu: showContextMenuMock }))

  const mountFile = async (file) => {
    const TreeFile = (await import('@/components/sideBar/treeFile.vue')).default
    return mount(TreeFile, {
      props: { file, depth: 0 },
      global: { plugins: [pinia, i18n], stubs: { FileIcon: true } }
    })
  }

  it('passes isMarkdownFile + isPinned for a Markdown file row', async () => {
    const { usePinnedStore } = await import('@/store/pinned')
    usePinnedStore().pinnedFiles = ['/tmp/proj/a.md']
    showContextMenuMock.mockClear()
    const wrapper = await mountFile(makeFile('a.md', true))
    await wrapper.find('.side-bar-file').trigger('contextmenu')
    expect(showContextMenuMock).toHaveBeenCalledWith(
      expect.anything(),
      false,
      { isMarkdownFile: true, isPinned: true }
    )
  })

  it('passes isMarkdownFile false for a non-Markdown row (no Pin item)', async () => {
    showContextMenuMock.mockClear()
    const wrapper = await mountFile(makeFile('b.png', false))
    await wrapper.find('.side-bar-file').trigger('contextmenu')
    const opts = showContextMenuMock.mock.calls[0][2]
    expect(opts.isMarkdownFile).toBe(false)
  })
})
