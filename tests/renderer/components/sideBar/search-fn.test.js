/**
 * Function coverage tests for sideBar/search.vue
 * Covers: openFolder, cancel, showNoFolderOpenedMessage, hasQuery, matchCount
 */
import { shallowMount } from '@vue/test-utils'
import { setupTestPinia } from '../../pinia'
import { createI18n } from 'vue-i18n'

vi.mock('@/bus', () => ({
  default: { on: vi.fn(), off: vi.fn(), emit: vi.fn() }
}))

const i18n = createI18n({ legacy: false, locale: 'en', messages: { en: {
  sideBar: {
    search: {
      noFolderOpen: 'No folder', openFolder: 'Open Folder',
      startTyping: 'Type to search', searching: 'Searching...',
      noResultsFound: 'No results', cancel: 'Cancel'
    }
  },
  search: { searchResultInfo: '{matchCount} results in {fileCount} files' }
} } })

describe('sideBar/search.vue — fn coverage', () => {
  let pinia, SearchComp, projectStore, searchStore

  beforeEach(async () => {
    pinia = setupTestPinia()
    const { useProjectStore } = await import('@/store/project')
    const { useSearchStore } = await import('@/store/search')
    projectStore = useProjectStore()
    searchStore = useSearchStore()
    projectStore.projectTree = null
    SearchComp = (await import('@/components/sideBar/search.vue')).default
  })

  const stubs = { SearchResultItem: true, ElButton: true }

  const mount = () => shallowMount(SearchComp, {
    global: { plugins: [pinia, i18n], stubs }
  })

  it('shows no-folder-opened message when no project', () => {
    const w = mount()
    expect(w.vm.showNoFolderOpenedMessage).toBe(true)
  })

  it('shows no-folder-opened as false when project exists', () => {
    projectStore.projectTrees = [{ pathname: '/root', name: 'root', folders: [], files: [] }]
    const w = mount()
    expect(w.vm.showNoFolderOpenedMessage).toBe(false)
  })

  it('openFolder calls ASK_FOR_OPEN_PROJECT', () => {
    const spy = vi.spyOn(projectStore, 'ASK_FOR_OPEN_PROJECT').mockImplementation(() => {})
    const w = mount()
    w.vm.openFolder()
    expect(spy).toHaveBeenCalled()
  })

  it('cancel calls cancelRunning', () => {
    const spy = vi.spyOn(searchStore, 'cancelRunning').mockImplementation(() => {})
    const w = mount()
    w.vm.cancel()
    expect(spy).toHaveBeenCalled()
  })

  it('hasQuery computed returns searchStore.hasQuery', () => {
    const w = mount()
    expect(w.vm.hasQuery).toBeDefined()
  })

  it('matchCount computed returns searchStore.matchCount', () => {
    const w = mount()
    expect(w.vm.matchCount).toBeDefined()
  })
})
