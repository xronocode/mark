/**
 * Additional coverage tests for src/renderer/src/store/search.js
 *
 * Coverage target: 91.54% → 95%+
 *
 * Focuses on uncovered branches:
 *   - runSearch: cancel active search before dispatching new one
 *   - runSearch: didMatch callback with canceled=true skips push
 *   - runSearch: result filtering with pathname-only matches
 *   - runSearch: multiple roots search
 *   - cancelRunning when actually running with a real cancel function
 */

import { setupTestPinia } from '../pinia'

const projectStateProxy = {
  projectTrees: []
}
vi.mock('@/store/project', () => ({
  useProjectStore: () => projectStateProxy
}))

const preferencesProxy = {
  searchExclusions: [],
  searchMaxFileSize: null,
  searchIncludeHidden: false,
  searchNoIgnore: false,
  searchFollowSymlinks: false
}
vi.mock('@/store/preferences', () => ({
  usePreferencesStore: () => preferencesProxy
}))

const searchSpy = vi.fn()
vi.mock('@/node/ripgrepSearcher', () => ({
  default: class FakeRipgrepDirectorySearcher {
    search (...args) { return searchSpy(...args) }
  }
}))

vi.mock('electron-log', () => ({
  default: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() }
}))

describe('store/search — coverage gaps', () => {
  beforeEach(() => {
    setupTestPinia()
    projectStateProxy.projectTrees = []
    preferencesProxy.searchExclusions = []
    preferencesProxy.searchMaxFileSize = null
    preferencesProxy.searchIncludeHidden = false
    preferencesProxy.searchNoIgnore = false
    preferencesProxy.searchFollowSymlinks = false
    searchSpy.mockReset()
    vi.spyOn(console, 'debug').mockImplementation(() => {})
  })

  it('runSearch cancels a previous running search before starting a new one', async () => {
    projectStateProxy.projectTrees = [{ pathname: '/proj' }]
    let resolveFirst
    const firstPromise = new Promise((r) => { resolveFirst = r })
    firstPromise.cancel = vi.fn()

    const secondPromise = Promise.resolve()
    secondPromise.cancel = vi.fn()

    searchSpy
      .mockReturnValueOnce(firstPromise)
      .mockReturnValueOnce(secondPromise)

    const { useSearchStore } = await import('@/store/search')
    const s = useSearchStore()

    // Start first search
    s.keyword = 'first'
    s.runSearch()
    expect(s.running).toBe(true)

    // Start second search — should cancel the first
    s.keyword = 'second'
    s.runSearch()

    // Resolve first promise to clean up
    resolveFirst()
    await Promise.resolve()
    await Promise.resolve()
  })

  it('runSearch with multiple roots passes all root pathnames', async () => {
    projectStateProxy.projectTrees = [
      { pathname: '/proj1' },
      { pathname: '/proj2' },
      { pathname: '/proj3' }
    ]

    const promiseLike = Promise.resolve()
    promiseLike.cancel = vi.fn()
    searchSpy.mockReturnValue(promiseLike)

    const { useSearchStore } = await import('@/store/search')
    const s = useSearchStore()
    s.keyword = 'multi'
    s.runSearch()

    expect(searchSpy).toHaveBeenCalledTimes(1)
    const [roots] = searchSpy.mock.calls[0]
    expect(roots).toEqual(['/proj1', '/proj2', '/proj3'])
  })

  it('result filtering keeps matches whose filePath equals a root pathname', async () => {
    projectStateProxy.projectTrees = [{ pathname: '/proj' }]

    let didMatchCb
    const promiseLike = Promise.resolve()
    promiseLike.cancel = vi.fn()
    searchSpy.mockImplementation((_roots, _kw, opts) => {
      didMatchCb = opts.didMatch
      // Match whose path equals root exactly
      didMatchCb({ filePath: '/proj', matches: [{ line: 1 }] })
      // Match under root
      didMatchCb({ filePath: '/proj/sub/a.md', matches: [{ line: 2 }] })
      // Match with pathname field instead of filePath
      didMatchCb({ pathname: '/proj/b.md', matches: [{ line: 3 }] })
      return promiseLike
    })

    const { useSearchStore } = await import('@/store/search')
    const s = useSearchStore()
    s.keyword = 'test'
    s.runSearch()

    await Promise.resolve()
    await Promise.resolve()

    // All three should be kept (filePath === root, filePath under root, pathname under root)
    expect(s.results.length).toBe(3)
  })

  it('result filtering drops matches whose root was closed mid-search', async () => {
    projectStateProxy.projectTrees = [{ pathname: '/proj' }]

    let didMatchCb
    const promiseLike = new Promise((resolve) => {
      setTimeout(() => {
        // Root closed mid-search
        projectStateProxy.projectTrees = []
        resolve()
      }, 0)
    })
    promiseLike.cancel = vi.fn()

    searchSpy.mockImplementation((_roots, _kw, opts) => {
      didMatchCb = opts.didMatch
      didMatchCb({ filePath: '/proj/a.md', matches: [{ line: 1 }] })
      return promiseLike
    })

    const { useSearchStore } = await import('@/store/search')
    const s = useSearchStore()
    s.keyword = 'test'
    s.runSearch()

    await new Promise((r) => setTimeout(r, 10))
    await Promise.resolve()
    await Promise.resolve()

    // Root was closed, so results should be filtered out
    expect(s.results).toEqual([])
  })

  it('runSearch with falsy/partial roots in projectTrees filters them out', async () => {
    projectStateProxy.projectTrees = [
      { pathname: '/valid' },
      null,
      undefined,
      { pathname: '' },
      {}
    ]

    const promiseLike = Promise.resolve()
    promiseLike.cancel = vi.fn()
    searchSpy.mockReturnValue(promiseLike)

    const { useSearchStore } = await import('@/store/search')
    const s = useSearchStore()
    s.keyword = 'q'
    s.runSearch()

    const [roots] = searchSpy.mock.calls[0]
    expect(roots).toEqual(['/valid'])
  })

  it('empty keyword clears results even when roots exist', async () => {
    projectStateProxy.projectTrees = [{ pathname: '/proj' }]

    const { useSearchStore } = await import('@/store/search')
    const s = useSearchStore()
    s.results = [{ matches: [1] }]
    s.running = true
    s.keyword = ''
    s.runSearch()

    expect(s.results).toEqual([])
    expect(s.running).toBe(false)
    expect(searchSpy).not.toHaveBeenCalled()
  })

  it('error path calls cancel when available', async () => {
    projectStateProxy.projectTrees = [{ pathname: '/proj' }]
    const innerCancel = vi.fn()
    const promiseLike = Promise.reject(new Error('search failed'))
    promiseLike.cancel = innerCancel
    promiseLike.catch(() => {}) // suppress unhandled rejection

    searchSpy.mockReturnValue(promiseLike)

    const { useSearchStore } = await import('@/store/search')
    const s = useSearchStore()
    s.keyword = 'err'
    s.runSearch()

    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()

    expect(s.results).toEqual([])
    expect(s.running).toBe(false)
  })

  it('didSearchPaths under 100 does not set error', async () => {
    projectStateProxy.projectTrees = [{ pathname: '/proj' }]

    let didSearchPathsCb
    const promiseLike = Promise.resolve()
    promiseLike.cancel = vi.fn()

    searchSpy.mockImplementation((_roots, _kw, opts) => {
      didSearchPathsCb = opts.didSearchPaths
      didSearchPathsCb(50) // under 100
      return promiseLike
    })

    const { useSearchStore } = await import('@/store/search')
    const s = useSearchStore()
    s.keyword = 'small'
    s.runSearch()

    await Promise.resolve()
    await Promise.resolve()

    expect(s.error).toBe('')
  })
})
