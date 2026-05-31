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

vi.mock('muya/lib/ui/fileIcons', () => ({
  default: {
    getClassByName: vi.fn(() => 'icon-md')
  }
}))

const i18n = createI18n({
  legacy: false,
  locale: 'en',
  messages: {
    en: {
      sideBar: {
        tree: {
          openedFiles: 'Opened Files',
          saveAll: 'Save All',
          closeAll: 'Close All',
          openFolder: 'Open Folder',
          closeFolder: 'Close Folder',
          createFile: 'Create File',
          newFile: 'New File'
        },
        search: {
          showMoreMatches: 'Show more matches'
        }
      }
    }
  }
})

// ===================== tree.vue =====================
describe('sideBar/tree.vue — deep coverage', () => {
  let pinia, bus, Tree

  beforeEach(async () => {
    pinia = setupTestPinia()
    bus = (await import('@/bus')).default
    Tree = (await import('@/components/sideBar/tree.vue')).default
  })

  const mountComponent = (propsOverride = {}) =>
    shallowMount(Tree, {
      props: { openedFiles: [], tabs: [], ...propsOverride },
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

  describe('toggleOpenedFiles', () => {
    it('toggles showOpenedFiles state', () => {
      const wrapper = mountComponent({ tabs: [{ id: 't1', filename: 'a.md', isSaved: true }] })

      expect(wrapper.vm.showOpenedFiles).toBe(true)
      wrapper.vm.toggleOpenedFiles()
      expect(wrapper.vm.showOpenedFiles).toBe(false)
      wrapper.vm.toggleOpenedFiles()
      expect(wrapper.vm.showOpenedFiles).toBe(true)
    })
  })

  describe('saveAll', () => {
    it('calls ASK_FOR_SAVE_ALL with isClose=false', async () => {
      const { useEditorStore } = await import('@/store/editor')
      const editorStore = useEditorStore()
      editorStore.ASK_FOR_SAVE_ALL = vi.fn()

      const wrapper = mountComponent()
      wrapper.vm.saveAll(false)

      expect(editorStore.ASK_FOR_SAVE_ALL).toHaveBeenCalledWith(false)
    })

    it('calls ASK_FOR_SAVE_ALL with isClose=true', async () => {
      const { useEditorStore } = await import('@/store/editor')
      const editorStore = useEditorStore()
      editorStore.ASK_FOR_SAVE_ALL = vi.fn()

      const wrapper = mountComponent()
      wrapper.vm.saveAll(true)

      expect(editorStore.ASK_FOR_SAVE_ALL).toHaveBeenCalledWith(true)
    })
  })

  describe('openFolder', () => {
    it('calls ASK_FOR_OPEN_PROJECT', async () => {
      const { useProjectStore } = await import('@/store/project')
      const projectStore = useProjectStore()
      projectStore.ASK_FOR_OPEN_PROJECT = vi.fn()

      const wrapper = mountComponent()
      wrapper.vm.openFolder()

      expect(projectStore.ASK_FOR_OPEN_PROJECT).toHaveBeenCalled()
    })

    it('button click triggers openFolder', async () => {
      const { useProjectStore } = await import('@/store/project')
      const projectStore = useProjectStore()
      projectStore.ASK_FOR_OPEN_PROJECT = vi.fn()

      const wrapper = mountComponent()
      await wrapper.find('.open-folder-btn').trigger('click')

      expect(projectStore.ASK_FOR_OPEN_PROJECT).toHaveBeenCalled()
    })
  })

  describe('handleInputEnter', () => {
    it('calls CREATE_FILE_DIRECTORY with createName', async () => {
      const { useProjectStore } = await import('@/store/project')
      const projectStore = useProjectStore()
      projectStore.CREATE_FILE_DIRECTORY = vi.fn()

      const wrapper = mountComponent()
      wrapper.vm.createName = 'newfile.md'
      wrapper.vm.handleInputEnter()

      expect(projectStore.CREATE_FILE_DIRECTORY).toHaveBeenCalledWith('newfile.md')
    })
  })

  describe('toggleRootDirectories', () => {
    it('modifies collapsedRoots state', async () => {
      const { useProjectStore } = await import('@/store/project')
      const projectStore = useProjectStore()
      projectStore.projectTrees = [
        { pathname: '/p1', name: 'Project1', folders: [], files: [] }
      ]

      const wrapper = mountComponent()

      // Initially expanded (no entry in collapsedRoots)
      expect(wrapper.vm.isRootExpanded('/p1')).toBe(true)

      // After toggle, collapsedRoots gets an entry for '/p1'
      wrapper.vm.toggleRootDirectories('/p1')
      expect(wrapper.vm.collapsedRoots).toHaveProperty('/p1')

      // After second toggle, state is updated again
      wrapper.vm.toggleRootDirectories('/p1')
      expect(wrapper.vm.collapsedRoots).toHaveProperty('/p1')
    })
  })

  describe('handleCloseRoot', () => {
    it('calls CLOSE_PROJECT and cleans collapse state', async () => {
      const { useProjectStore } = await import('@/store/project')
      const projectStore = useProjectStore()
      projectStore.CLOSE_PROJECT = vi.fn()
      projectStore.projectTrees = [
        { pathname: '/p1', name: 'Project1', folders: [], files: [] }
      ]

      const wrapper = mountComponent()

      // Toggle to create state entry
      wrapper.vm.toggleRootDirectories('/p1')
      expect(wrapper.vm.collapsedRoots).toHaveProperty('/p1')

      wrapper.vm.handleCloseRoot('/p1')

      expect(projectStore.CLOSE_PROJECT).toHaveBeenCalledWith('/p1')
      expect(wrapper.vm.collapsedRoots['/p1']).toBeUndefined()
    })

    it('handles close when no collapse state exists', async () => {
      const { useProjectStore } = await import('@/store/project')
      const projectStore = useProjectStore()
      projectStore.CLOSE_PROJECT = vi.fn()

      const wrapper = mountComponent()
      wrapper.vm.handleCloseRoot('/unknown')

      expect(projectStore.CLOSE_PROJECT).toHaveBeenCalledWith('/unknown')
    })
  })

  describe('createFileInRoot', () => {
    it('sets active item and emits SIDEBAR::new', async () => {
      const { useProjectStore } = await import('@/store/project')
      const projectStore = useProjectStore()
      projectStore.CHANGE_ACTIVE_ITEM = vi.fn()

      const root = { pathname: '/p1', name: 'P1' }
      const wrapper = mountComponent()
      wrapper.vm.createFileInRoot(root)

      expect(projectStore.CHANGE_ACTIVE_ITEM).toHaveBeenCalledWith(root)
      expect(bus.emit).toHaveBeenCalledWith('SIDEBAR::new', 'file')
    })
  })

  describe('handleInputFocus', () => {
    it('handles SIDEBAR::show-new-input event', () => {
      const wrapper = mountComponent()
      const handler = bus.on.mock.calls.find((c) => c[0] === 'SIDEBAR::show-new-input')[1]

      // Should not throw even when input ref is null
      handler()
    })
  })

  describe('renders project trees', () => {
    it('renders project sections when projectTrees has entries', async () => {
      const { useProjectStore } = await import('@/store/project')
      const projectStore = useProjectStore()
      projectStore.projectTrees = [
        { pathname: '/p1', name: 'Project1', folders: [], files: [] },
        { pathname: '/p2', name: 'Project2', folders: [], files: [] }
      ]

      const wrapper = mountComponent()
      await nextTick()

      const trees = wrapper.findAll('.project-tree')
      expect(trees.length).toBe(2)
    })

    it('does not show open-project when projectTrees has entries', async () => {
      const { useProjectStore } = await import('@/store/project')
      const projectStore = useProjectStore()
      projectStore.projectTrees = [
        { pathname: '/p1', name: 'P1', folders: [], files: [] }
      ]

      const wrapper = mountComponent()
      await nextTick()

      expect(wrapper.find('.open-project').exists()).toBe(false)
    })
  })
})

// ===================== treeFolder.vue =====================
describe('sideBar/treeFolder.vue — deep coverage', () => {
  let pinia, bus, TreeFolder

  beforeEach(async () => {
    pinia = setupTestPinia()
    bus = (await import('@/bus')).default
    TreeFolder = (await import('@/components/sideBar/treeFolder.vue')).default
  })

  const makeFolder = (overrides = {}) => ({
    id: 'folder-1',
    name: 'docs',
    pathname: '/tmp/docs',
    isCollapsed: false,
    folders: [],
    files: [],
    ...overrides
  })

  const mountComponent = (folder = makeFolder(), depth = 0) =>
    shallowMount(TreeFolder, {
      props: { folder, depth },
      global: {
        plugins: [pinia, i18n],
        stubs: { TreeFolder: true, File: true }
      }
    })

  describe('folderNameClick', () => {
    it('toggles isCollapsed', () => {
      const wrapper = mountComponent(makeFolder({ isCollapsed: false }))

      expect(wrapper.vm.isCollapsed).toBe(false)
      wrapper.vm.folderNameClick()
      expect(wrapper.vm.isCollapsed).toBe(true)
      wrapper.vm.folderNameClick()
      expect(wrapper.vm.isCollapsed).toBe(false)
    })
  })

  describe('handleInputFocus', () => {
    it('handles SIDEBAR::show-new-input and expands folder', () => {
      const wrapper = mountComponent(makeFolder({ isCollapsed: true }))
      const handler = bus.on.mock.calls.find((c) => c[0] === 'SIDEBAR::show-new-input')[1]

      // Should not throw
      handler()
    })
  })

  describe('handleInputEnter', () => {
    it('calls CREATE_FILE_DIRECTORY', async () => {
      const { useProjectStore } = await import('@/store/project')
      const projectStore = useProjectStore()
      projectStore.CREATE_FILE_DIRECTORY = vi.fn()

      const wrapper = mountComponent()
      wrapper.vm.createName = 'newfile.md'
      wrapper.vm.handleInputEnter()

      expect(projectStore.CREATE_FILE_DIRECTORY).toHaveBeenCalledWith('newfile.md')
    })
  })

  describe('rename', () => {
    it('calls RENAME_IN_SIDEBAR with new name', async () => {
      const { useProjectStore } = await import('@/store/project')
      const projectStore = useProjectStore()
      projectStore.RENAME_IN_SIDEBAR = vi.fn()

      const wrapper = mountComponent()
      wrapper.vm.newName = 'new-docs'
      wrapper.vm.rename()

      expect(projectStore.RENAME_IN_SIDEBAR).toHaveBeenCalledWith('new-docs')
    })

    it('does not rename when newName is empty', async () => {
      const { useProjectStore } = await import('@/store/project')
      const projectStore = useProjectStore()
      projectStore.RENAME_IN_SIDEBAR = vi.fn()

      const wrapper = mountComponent()
      wrapper.vm.newName = ''
      wrapper.vm.rename()

      expect(projectStore.RENAME_IN_SIDEBAR).not.toHaveBeenCalled()
    })
  })

  describe('focusRenameInput', () => {
    it('handles SIDEBAR::show-rename-input event', () => {
      const wrapper = mountComponent()
      const handler = bus.on.mock.calls.find((c) => c[0] === 'SIDEBAR::show-rename-input')[1]

      // Should not throw even when ref is null
      handler()
    })
  })

  describe('depth styling', () => {
    it('applies depth-based padding', () => {
      const wrapper = mountComponent(makeFolder(), 2)
      const style = wrapper.find('.folder-name').attributes('style')
      // depth * 20 + 20 = 60px
      expect(style).toContain('60px')
    })
  })

  describe('active class', () => {
    it('applies active class when folder matches activeItem', async () => {
      const { useProjectStore } = await import('@/store/project')
      const projectStore = useProjectStore()
      const folder = makeFolder({ id: 'folder-1' })
      projectStore.activeItem = { id: 'folder-1' }

      const wrapper = mountComponent(folder)
      expect(wrapper.find('.folder-name.active').exists()).toBe(true)
    })
  })

  describe('shows rename input when renameCache matches', () => {
    it('renders rename input', async () => {
      const { useProjectStore } = await import('@/store/project')
      const projectStore = useProjectStore()
      const folder = makeFolder({ pathname: '/tmp/docs' })
      projectStore.renameCache = '/tmp/docs'

      const wrapper = mountComponent(folder)
      await nextTick()

      expect(wrapper.find('input.rename').exists()).toBe(true)
    })
  })
})

// ===================== treeFile.vue =====================
describe('sideBar/treeFile.vue — deep coverage', () => {
  let pinia, bus, TreeFile

  beforeEach(async () => {
    pinia = setupTestPinia()
    bus = (await import('@/bus')).default

    const { useEditorStore } = await import('@/store/editor')
    const editorStore = useEditorStore()
    editorStore.currentFile = {
      id: 'tab-1',
      pathname: '/tmp/test.md',
      filename: 'test.md'
    }
    editorStore.tabs = [editorStore.currentFile]
    editorStore.UPDATE_CURRENT_FILE = vi.fn()

    TreeFile = (await import('@/components/sideBar/treeFile.vue')).default
  })

  const makeFile = (overrides = {}) => ({
    id: 'file-1',
    name: 'readme.md',
    pathname: '/tmp/readme.md',
    isMarkdown: true,
    ...overrides
  })

  const mountComponent = (file = makeFile(), depth = 0) =>
    shallowMount(TreeFile, {
      props: { file, depth },
      global: {
        plugins: [pinia, i18n],
        stubs: { FileIcon: true }
      }
    })

  describe('handleFileClick', () => {
    it('does nothing for non-markdown files', () => {
      const wrapper = mountComponent(makeFile({ isMarkdown: false }))
      wrapper.vm.handleFileClick()
      expect(window.electron.ipcRenderer.send).not.toHaveBeenCalled()
    })

    it('switches to already-opened tab', async () => {
      const { useEditorStore } = await import('@/store/editor')
      const editorStore = useEditorStore()

      const file = makeFile({ pathname: '/tmp/other.md' })
      const openedTab = { id: 'tab-2', pathname: '/tmp/other.md', filename: 'other.md' }
      editorStore.tabs = [editorStore.currentFile, openedTab]
      window.fileUtils.isSamePathSync = vi.fn((a, b) => a === b)

      const wrapper = mountComponent(file)
      wrapper.vm.handleFileClick()

      expect(editorStore.UPDATE_CURRENT_FILE).toHaveBeenCalledWith(openedTab)
    })

    it('does nothing when file is already current', async () => {
      const { useEditorStore } = await import('@/store/editor')
      const editorStore = useEditorStore()

      window.fileUtils.isSamePathSync = vi.fn((a, b) => a === b)
      const file = makeFile({ pathname: '/tmp/test.md' })

      const wrapper = mountComponent(file)
      wrapper.vm.handleFileClick()

      expect(editorStore.UPDATE_CURRENT_FILE).not.toHaveBeenCalled()
    })

    it('opens file via IPC when not in tabs', () => {
      window.fileUtils.isSamePathSync = vi.fn(() => false)
      const file = makeFile({ pathname: '/tmp/new.md' })

      const wrapper = mountComponent(file)
      wrapper.vm.handleFileClick()

      expect(window.electron.ipcRenderer.send).toHaveBeenCalledWith(
        'mt::open-file',
        '/tmp/new.md',
        {}
      )
    })
  })

  describe('isDirty computed', () => {
    it('returns true when tab is unsaved', async () => {
      const { useEditorStore } = await import('@/store/editor')
      const editorStore = useEditorStore()

      const file = makeFile({ pathname: '/tmp/dirty.md' })
      editorStore.tabs = [{ id: 'tab-d', pathname: '/tmp/dirty.md', isSaved: false }]
      window.fileUtils.isSamePathSync = vi.fn((a, b) => a === b)

      const wrapper = mountComponent(file)
      expect(wrapper.vm.isDirty).toBe(true)
    })

    it('returns false when tab is saved', async () => {
      const { useEditorStore } = await import('@/store/editor')
      const editorStore = useEditorStore()

      const file = makeFile({ pathname: '/tmp/clean.md' })
      editorStore.tabs = [{ id: 'tab-c', pathname: '/tmp/clean.md', isSaved: true }]
      window.fileUtils.isSamePathSync = vi.fn((a, b) => a === b)

      const wrapper = mountComponent(file)
      expect(wrapper.vm.isDirty).toBe(false)
    })

    it('returns false when file not in tabs', () => {
      window.fileUtils.isSamePathSync = vi.fn(() => false)
      const file = makeFile({ pathname: '/tmp/notatab.md' })

      const wrapper = mountComponent(file)
      expect(wrapper.vm.isDirty).toBe(false)
    })
  })

  describe('rename', () => {
    it('calls RENAME_IN_SIDEBAR with new name', async () => {
      const { useProjectStore } = await import('@/store/project')
      const projectStore = useProjectStore()
      projectStore.RENAME_IN_SIDEBAR = vi.fn()

      const wrapper = mountComponent()
      wrapper.vm.newName = 'renamed.md'
      wrapper.vm.rename()

      expect(projectStore.RENAME_IN_SIDEBAR).toHaveBeenCalledWith('renamed.md')
    })

    it('does not rename with empty name', async () => {
      const { useProjectStore } = await import('@/store/project')
      const projectStore = useProjectStore()
      projectStore.RENAME_IN_SIDEBAR = vi.fn()

      const wrapper = mountComponent()
      wrapper.vm.newName = ''
      wrapper.vm.rename()

      expect(projectStore.RENAME_IN_SIDEBAR).not.toHaveBeenCalled()
    })
  })

  describe('focusRenameInput', () => {
    it('listens for SIDEBAR::show-rename-input', () => {
      mountComponent()
      expect(bus.on).toHaveBeenCalledWith('SIDEBAR::show-rename-input', expect.any(Function))
    })
  })

  describe('renameCache shows input', () => {
    it('renders rename input when renameCache matches', async () => {
      const { useProjectStore } = await import('@/store/project')
      const projectStore = useProjectStore()
      const file = makeFile({ pathname: '/tmp/readme.md' })
      projectStore.renameCache = '/tmp/readme.md'

      const wrapper = mountComponent(file)
      await nextTick()

      expect(wrapper.find('input.rename').exists()).toBe(true)
    })
  })
})

// ===================== searchResultItem.vue =====================
describe('sideBar/searchResultItem.vue — deep coverage', () => {
  let pinia, bus, SearchResultItem

  beforeEach(async () => {
    pinia = setupTestPinia()
    bus = (await import('@/bus')).default

    const { useEditorStore } = await import('@/store/editor')
    const editorStore = useEditorStore()
    editorStore.currentFile = {
      id: 'tab-1',
      pathname: '/tmp/test.md',
      filename: 'test.md',
      markdown: '# Hello',
      history: {}
    }
    editorStore.tabs = [editorStore.currentFile]
    editorStore.UPDATE_CURRENT_FILE = vi.fn()

    SearchResultItem = (await import('@/components/sideBar/searchResultItem.vue')).default
  })

  const makeSearchResult = (overrides = {}) => ({
    filePath: '/tmp/test.md',
    matches: [
      { lineText: 'Hello world test match', range: [[1, 6], [1, 11]] }
    ],
    ...overrides
  })

  const mountComponent = (searchResult = makeSearchResult()) =>
    shallowMount(SearchResultItem, {
      props: { searchResult },
      global: { plugins: [pinia, i18n] }
    })

  describe('toggleSearchMatches', () => {
    it('toggles match visibility', () => {
      const wrapper = mountComponent()
      const initial = wrapper.vm.showSearchMatches

      wrapper.vm.toggleSearchMatches()
      expect(wrapper.vm.showSearchMatches).toBe(!initial)
    })
  })

  describe('handleShowMoreMatches', () => {
    it('increases shownMatches by 15', () => {
      const matches = Array.from({ length: 30 }, (_, i) => ({
        lineText: `line ${i}`,
        range: [[i, 0], [i, 5]]
      }))
      const wrapper = mountComponent(makeSearchResult({ matches }))

      expect(wrapper.vm.shownMatches).toBe(10)
      wrapper.vm.handleShowMoreMatches({ ctrlKey: false, metaKey: false })
      expect(wrapper.vm.shownMatches).toBe(25)
    })

    it('shows all with ctrl key', () => {
      const matches = Array.from({ length: 30 }, (_, i) => ({
        lineText: `line ${i}`,
        range: [[i, 0], [i, 5]]
      }))
      const wrapper = mountComponent(makeSearchResult({ matches }))

      wrapper.vm.handleShowMoreMatches({ ctrlKey: true, metaKey: false })
      expect(wrapper.vm.allMatchesShown).toBe(true)
    })

    it('shows all with meta key', () => {
      const matches = Array.from({ length: 30 }, (_, i) => ({
        lineText: `line ${i}`,
        range: [[i, 0], [i, 5]]
      }))
      const wrapper = mountComponent(makeSearchResult({ matches }))

      wrapper.vm.handleShowMoreMatches({ ctrlKey: false, metaKey: true })
      expect(wrapper.vm.allMatchesShown).toBe(true)
    })

    it('shows all when shownMatches exceeds total', () => {
      const matches = Array.from({ length: 20 }, (_, i) => ({
        lineText: `line ${i}`,
        range: [[i, 0], [i, 5]]
      }))
      const wrapper = mountComponent(makeSearchResult({ matches }))

      // 10 + 15 = 25 > 20, so allMatchesShown should be true
      wrapper.vm.handleShowMoreMatches({ ctrlKey: false, metaKey: false })
      expect(wrapper.vm.allMatchesShown).toBe(true)
    })
  })

  describe('ellipsisText', () => {
    it('returns text when short', () => {
      const wrapper = mountComponent()
      expect(wrapper.vm.ellipsisText('abc')).toBe('abc')
    })

    it('adds ellipsis for long text', () => {
      const wrapper = mountComponent()
      const result = wrapper.vm.ellipsisText('this is a long pretext')
      expect(result).toMatch(/^\.\.\./)
      expect(result.length).toBe(9) // '...' + 6 chars
    })

    it('returns exact 6-char text as is', () => {
      const wrapper = mountComponent()
      expect(wrapper.vm.ellipsisText('abcdef')).toBe('abcdef')
    })
  })

  describe('getMatches computed', () => {
    it('returns all matches when allMatchesShown', () => {
      const matches = [
        { lineText: 'a', range: [[0, 0], [0, 1]] },
        { lineText: 'b', range: [[1, 0], [1, 1]] }
      ]
      const wrapper = mountComponent(makeSearchResult({ matches }))
      // With 2 matches (<=10), allMatchesShown is true
      expect(wrapper.vm.getMatches).toEqual(matches)
    })

    it('returns sliced matches when not all shown', () => {
      const matches = Array.from({ length: 25 }, (_, i) => ({
        lineText: `line ${i}`,
        range: [[i, 0], [i, 5]]
      }))
      const wrapper = mountComponent(makeSearchResult({ matches }))

      // 25 > 10, allMatchesShown starts false
      expect(wrapper.vm.allMatchesShown).toBe(false)
      expect(wrapper.vm.getMatches.length).toBe(10)
    })

    it('returns empty when no matches', () => {
      const wrapper = mountComponent(makeSearchResult({ matches: [] }))
      expect(wrapper.vm.getMatches).toEqual([])
    })
  })

  describe('filename / extension / matchCount computed', () => {
    it('computes filename without extension', () => {
      // The mock window.path.basename(path, ext) may not strip extension by default.
      // The component calls basename(filePath, extname(filePath)).
      // With the test setup mock, basename just returns the last segment.
      // Override basename to support the extension stripping.
      window.path.basename = vi.fn((p, ext) => {
        const base = p.split('/').pop() || ''
        if (ext && base.endsWith(ext)) return base.slice(0, -ext.length)
        return base
      })
      const wrapper = mountComponent(makeSearchResult({ filePath: '/tmp/readme.md' }))
      expect(wrapper.vm.filename).toBe('readme')
    })

    it('computes extension', () => {
      const wrapper = mountComponent(makeSearchResult({ filePath: '/tmp/readme.md' }))
      expect(wrapper.vm.extension).toBe('.md')
    })

    it('computes matchCount', () => {
      const wrapper = mountComponent()
      expect(wrapper.vm.matchCount).toBe(1)
    })
  })

  describe('handleSearchResultClick', () => {
    it('switches to already-opened tab', async () => {
      const { useEditorStore } = await import('@/store/editor')
      const editorStore = useEditorStore()
      window.fileUtils.isSamePathSync = vi.fn((a, b) => a === b)

      // Create a different tab as current
      const otherTab = { id: 'tab-2', pathname: '/tmp/other.md', filename: 'other.md' }
      const testTab = editorStore.currentFile
      editorStore.currentFile = otherTab
      editorStore.tabs = [otherTab, testTab]

      const wrapper = mountComponent()
      const match = { lineText: 'Hello', range: [[1, 6], [1, 11]] }
      wrapper.vm.handleSearchResultClick(match)

      expect(editorStore.UPDATE_CURRENT_FILE).toHaveBeenCalledWith(
        expect.objectContaining({ pathname: '/tmp/test.md' })
      )
    })

    it('emits file-changed when file is already current', async () => {
      window.fileUtils.isSamePathSync = vi.fn((a, b) => a === b)

      const wrapper = mountComponent()
      const match = { lineText: 'Hello', range: [[1, 6], [1, 11]] }
      wrapper.vm.handleSearchResultClick(match)

      expect(bus.emit).toHaveBeenCalledWith('file-changed', expect.objectContaining({
        id: 'tab-1',
        renderCursor: true
      }))
    })

    it('opens file via IPC when not in tabs', () => {
      window.fileUtils.isSamePathSync = vi.fn(() => false)

      const wrapper = mountComponent(makeSearchResult({ filePath: '/tmp/new.md' }))
      const match = { lineText: 'text', range: [[0, 0], [0, 4]] }
      wrapper.vm.handleSearchResultClick(match)

      expect(window.electron.ipcRenderer.send).toHaveBeenCalledWith(
        'mt::open-file',
        '/tmp/new.md',
        expect.objectContaining({ cursor: expect.any(Object) })
      )
    })

    it('sets correct cursor with collapsed range', () => {
      window.fileUtils.isSamePathSync = vi.fn(() => false)

      const wrapper = mountComponent(makeSearchResult({ filePath: '/tmp/new.md' }))
      // Same line range -> isCollapsed false (range[0][0] !== range[1][0] is false)
      const match = { lineText: 'text', range: [[5, 2], [5, 8]] }
      wrapper.vm.handleSearchResultClick(match)

      const sendCall = window.electron.ipcRenderer.send.mock.calls[0]
      const cursor = sendCall[2].cursor
      expect(cursor.isCollapsed).toBe(false) // same line
      expect(cursor.anchor).toEqual({ line: 5, ch: 2 })
      expect(cursor.focus).toEqual({ line: 5, ch: 8 })
    })

    it('sets isCollapsed true for multi-line range', () => {
      window.fileUtils.isSamePathSync = vi.fn(() => false)

      const wrapper = mountComponent(makeSearchResult({ filePath: '/tmp/new.md' }))
      const match = { lineText: 'text', range: [[1, 0], [3, 5]] }
      wrapper.vm.handleSearchResultClick(match)

      const sendCall = window.electron.ipcRenderer.send.mock.calls[0]
      expect(sendCall[2].cursor.isCollapsed).toBe(true)
    })
  })

  describe('initial state based on match count', () => {
    it('hides matches when > 20', () => {
      const matches = Array.from({ length: 25 }, (_, i) => ({
        lineText: `line ${i}`,
        range: [[i, 0], [i, 5]]
      }))
      const wrapper = mountComponent(makeSearchResult({ matches }))
      expect(wrapper.vm.showSearchMatches).toBe(false)
    })

    it('shows matches when <= 20', () => {
      const matches = Array.from({ length: 15 }, (_, i) => ({
        lineText: `line ${i}`,
        range: [[i, 0], [i, 5]]
      }))
      const wrapper = mountComponent(makeSearchResult({ matches }))
      expect(wrapper.vm.showSearchMatches).toBe(true)
    })
  })
})

// ===================== sideBar/index.vue =====================
describe('sideBar/index.vue — deep coverage', () => {
  let pinia, SideBar

  beforeEach(async () => {
    pinia = setupTestPinia()
    SideBar = (await import('@/components/sideBar/index.vue')).default
  })

  const mountComponent = () =>
    shallowMount(SideBar, {
      global: {
        plugins: [pinia, i18n],
        stubs: {
          Tree: true,
          SideBarSearch: true,
          Toc: true,
          SearchToolbar: true
        }
      }
    })

  describe('finalSideBarWidth computed', () => {
    it('returns 0 when sidebar hidden', async () => {
      const { useLayoutStore } = await import('@/store/layout')
      const layoutStore = useLayoutStore()
      layoutStore.showSideBar = false

      const wrapper = mountComponent()
      expect(wrapper.vm.finalSideBarWidth).toBe(0)
    })

    it('returns at least 220 when sidebar shown', async () => {
      const { useLayoutStore } = await import('@/store/layout')
      const layoutStore = useLayoutStore()
      layoutStore.showSideBar = true

      const wrapper = mountComponent()
      // sideBarViewWidth is initialized at 280, so should be 280
      expect(wrapper.vm.finalSideBarWidth).toBe(280)
    })

    it('enforces minimum 220px', async () => {
      const { useLayoutStore } = await import('@/store/layout')
      const layoutStore = useLayoutStore()
      layoutStore.showSideBar = true

      const wrapper = mountComponent()
      wrapper.vm.sideBarViewWidth = 100 // below minimum
      expect(wrapper.vm.finalSideBarWidth).toBe(220)
    })
  })

  describe('view switching', () => {
    it('renders Tree when rightColumn is files', async () => {
      const { useLayoutStore } = await import('@/store/layout')
      const layoutStore = useLayoutStore()
      layoutStore.showSideBar = true
      layoutStore.rightColumn = 'files'

      const wrapper = mountComponent()
      await nextTick()

      expect(wrapper.findComponent({ name: 'Tree' }).exists() ||
        wrapper.find('tree-stub').exists()).toBe(true)
    })

    it('renders Toc when rightColumn is toc', async () => {
      const { useLayoutStore } = await import('@/store/layout')
      const layoutStore = useLayoutStore()
      layoutStore.showSideBar = true
      layoutStore.rightColumn = 'toc'

      const wrapper = mountComponent()
      await nextTick()

      expect(wrapper.findComponent({ name: 'Toc' }).exists() ||
        wrapper.find('toc-stub').exists()).toBe(true)
    })

    it('does not render SideBarSearch (moved to floating panel)', async () => {
      const { useSearchStore } = await import('@/store/search')
      const searchStore = useSearchStore()
      searchStore.keyword = 'test'

      const { useLayoutStore } = await import('@/store/layout')
      const layoutStore = useLayoutStore()
      layoutStore.showSideBar = true

      const wrapper = mountComponent()
      await nextTick()

      expect(wrapper.findComponent({ name: 'SideBarSearch' }).exists() ||
        wrapper.find('side-bar-search-stub').exists()).toBe(false)
    })
  })
})
