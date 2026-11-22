import { shallowMount } from '@vue/test-utils'
import { setupTestPinia } from '../../pinia'
import { createI18n } from 'vue-i18n'

// POSIX path contract (the setup shim installs a posix window.path); under
// the vite-8 define config.PATH_SEPARATOR follows the build host, which on
// the Windows CI runner is '\\' and breaks the POSIX path pins.
vi.mock('@/config', () => ({ PATH_SEPARATOR: '/' }))
vi.mock('@/bus', () => ({
  default: { on: vi.fn(), off: vi.fn(), emit: vi.fn() }
}))

const i18n = createI18n({ legacy: false, locale: 'en', messages: { en: {} } })

describe('sideBar/searchResultItem.vue', () => {
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

  const makeSearchResult = (overrides = {}) => ({
    filePath: '/tmp/test.md',
    matches: [
      {
        lineText: 'Hello world test match',
        range: [[1, 6], [1, 11]]
      }
    ],
    ...overrides
  })

  it('mounts without errors', async () => {
    const SearchResultItem = (await import('@/components/sideBar/searchResultItem.vue')).default
    const wrapper = shallowMount(SearchResultItem, {
      props: {
        searchResult: makeSearchResult()
      },
      global: {
        plugins: [pinia, i18n]
      }
    })
    expect(wrapper.exists()).toBe(true)
    expect(wrapper.find('.search-result-item').exists()).toBe(true)
  })

  it('displays filename and match count', async () => {
    const SearchResultItem = (await import('@/components/sideBar/searchResultItem.vue')).default
    const wrapper = shallowMount(SearchResultItem, {
      props: {
        searchResult: makeSearchResult()
      },
      global: {
        plugins: [pinia, i18n]
      }
    })
    expect(wrapper.find('.match-count').text()).toBe('1')
  })

  it('shows highlight text in matches', async () => {
    const SearchResultItem = (await import('@/components/sideBar/searchResultItem.vue')).default
    const wrapper = shallowMount(SearchResultItem, {
      props: {
        searchResult: makeSearchResult()
      },
      global: {
        plugins: [pinia, i18n]
      }
    })
    // With 1 match, matches should be shown by default (count <= 20)
    expect(wrapper.find('.highlight').exists()).toBe(true)
    expect(wrapper.find('.highlight').text()).toBe('world')
  })

  it('toggle collapses matches on arrow click', async () => {
    const SearchResultItem = (await import('@/components/sideBar/searchResultItem.vue')).default
    const wrapper = shallowMount(SearchResultItem, {
      props: {
        searchResult: makeSearchResult()
      },
      global: {
        plugins: [pinia, i18n]
      }
    })
    expect(wrapper.find('.matches').exists()).toBe(true)
    // Click the arrow icon to toggle
    await wrapper.find('.icon-arrow').trigger('click')
    expect(wrapper.find('.matches').exists()).toBe(false)
  })
})

// ── C-SEARCH-RESULT-CONTRACT: open-at-match cursor pins ─────────────
// Activating a match line (click AND keyboard — one shared open-at-match
// code path) must invoke mt::open-file with the honest bounds cursor:
// anchor ch = range[0][1], focus ch = range[1][1] — never undefined.
// The array-form fixture pins stay green unchanged.
describe('sideBar/searchResultItem.vue — open-at-match cursor pins (C-SEARCH-RESULT-CONTRACT)', () => {
  let pinia

  const cursorI18n = createI18n({ legacy: false, locale: 'en', messages: { en: {} } })

  const makeResult = (overrides = {}) => ({
    filePath: '/tmp/test.md',
    matches: [{ lineText: 'Hello world test match', range: [[1, 6], [1, 11]] }],
    ...overrides
  })

  beforeEach(async () => {
    pinia = setupTestPinia()
    const { useEditorStore } = await import('@/store/editor')
    const editorStore = useEditorStore()
    editorStore.currentFile = null
    // No open tabs — every activation takes the mt::open-file invoke path.
    editorStore.tabs = []
  })

  const mountItem = async (searchResult) => {
    const SearchResultItem = (await import('@/components/sideBar/searchResultItem.vue')).default
    return shallowMount(SearchResultItem, {
      props: { searchResult },
      global: { plugins: [pinia, cursorI18n] }
    })
  }

  it('click activation invokes mt::open-file with the honest bounds cursor', async () => {
    const wrapper = await mountItem(makeResult())
    await wrapper.find('.matches ul li').trigger('click')
    expect(window.electron.ipcRenderer.invoke).toHaveBeenCalledWith(
      'mt::open-file',
      '/tmp/test.md',
      {
        cursor: {
          // isCollapsed compares range ROWS (1 === 1), not columns.
          isCollapsed: false,
          anchor: { line: 1, ch: 6 },
          focus: { line: 1, ch: 11 }
        }
      }
    )
  })

  it('keyboard activation routes into the same open-at-match code path', async () => {
    const wrapper = await mountItem(makeResult())
    const row = wrapper.find('.matches ul li')
    expect(row.attributes('tabindex')).toBe('0')
    await row.trigger('keydown.enter')
    expect(window.electron.ipcRenderer.invoke).toHaveBeenCalledWith(
      'mt::open-file',
      '/tmp/test.md',
      {
        cursor: {
          // isCollapsed compares range ROWS (1 === 1), not columns.
          isCollapsed: false,
          anchor: { line: 1, ch: 6 },
          focus: { line: 1, ch: 11 }
        }
      }
    )
  })

  it('the zero-pair fixture opens at line start with no highlight', async () => {
    const wrapper = await mountItem(
      makeResult({ matches: [{ lineText: 'bounds unavailable line', range: [[0, 0], [0, 0]] }] })
    )
    const row = wrapper.find('.matches ul li')
    expect(row.find('.highlight').text()).toBe('')
    await row.trigger('click')
    expect(window.electron.ipcRenderer.invoke).toHaveBeenCalledWith(
      'mt::open-file',
      '/tmp/test.md',
      {
        cursor: {
          // isCollapsed compares range ROWS (0 === 0).
          isCollapsed: false,
          anchor: { line: 0, ch: 0 },
          focus: { line: 0, ch: 0 }
        }
      }
    )
  })
})

// ── C-MULTI-SOURCE-WORKSPACE: owning-root label ────────────────────

describe('sideBar/searchResultItem.vue — owning-root label (C-MULTI-SOURCE-WORKSPACE)', () => {
  let pinia

  const makeResult = (overrides = {}) => ({
    filePath: '/tmp/test.md',
    matches: [{ lineText: 'Hello world test match', range: [[1, 6], [1, 11]] }],
    ...overrides
  })

  beforeEach(async () => {
    pinia = setupTestPinia()
    const { useEditorStore } = await import('@/store/editor')
    const editorStore = useEditorStore()
    editorStore.currentFile = { id: 'tab-1', pathname: '/tmp/test.md', filename: 'test.md' }
    editorStore.tabs = [editorStore.currentFile]
  })

  const mountItem = async (searchResult) => {
    const SearchResultItem = (await import('@/components/sideBar/searchResultItem.vue')).default
    return shallowMount(SearchResultItem, {
      props: { searchResult },
      global: { plugins: [pinia, i18n] }
    })
  }

  it('shows the root name plus relative directory under the owning root', async () => {
    const { useProjectStore } = await import('@/store/project')
    const projectStore = useProjectStore()
    projectStore.projectTrees = [
      { pathname: '/tmp/Notes', name: 'Notes' },
      { pathname: '/tmp/repo', name: 'repo' }
    ]

    const wrapper = await mountItem(makeResult({ filePath: '/tmp/Notes/2026/plan.md' }))
    expect(wrapper.find('.folder-path').exists()).toBe(true)
    expect(wrapper.find('.folder-path').text()).toBe('Notes/2026')
  })

  it('shows the bare root name when the file sits directly in the root', async () => {
    const { useProjectStore } = await import('@/store/project')
    const projectStore = useProjectStore()
    projectStore.projectTrees = [{ pathname: '/tmp/Notes', name: 'Notes' }]

    const wrapper = await mountItem(makeResult({ filePath: '/tmp/Notes/plan.md' }))
    expect(wrapper.find('.folder-path').text()).toBe('Notes')
  })

  it('picks the longest owning root when roots nest', async () => {
    const { useProjectStore } = await import('@/store/project')
    const projectStore = useProjectStore()
    projectStore.projectTrees = [
      { pathname: '/tmp', name: 'tmp' },
      { pathname: '/tmp/Notes', name: 'Notes' }
    ]

    const wrapper = await mountItem(makeResult({ filePath: '/tmp/Notes/plan.md' }))
    expect(wrapper.find('.folder-path').text()).toBe('Notes')
  })

  it('hides the label when no open root owns the file', async () => {
    const { useProjectStore } = await import('@/store/project')
    const projectStore = useProjectStore()
    projectStore.projectTrees = []

    const wrapper = await mountItem(makeResult({ filePath: '/tmp/loose/plan.md' }))
    expect(wrapper.find('.folder-path').exists()).toBe(false)
  })
})
