/**
 * Unit tests for src/renderer/src/store/search.js
 *
 * Surface (post-Phase-A6 multi-root):
 *   - state: keyword/isCaseSensitive/isWholeWord/isRegexp/results/running/error/showCancel
 *   - getters: hasQuery, matchCount
 *   - actions:
 *     - SET_KEYWORD(value) — updates keyword + runs search
 *     - TOGGLE_OPTION(name) — flips one of the three flag fields, runs search
 *     - cancelRunning() — calls activeCancel if running
 *     - runSearch() — empty-roots block, empty-keyword reset, dispatch
 *       to RipgrepDirectorySearcher.search, post-search liveRoots filter,
 *       error path, and >100-paths cancellation.
 */

import { setupTestPinia } from '../pinia'

// Stub project + preferences stores with plain objects.
const projectStateProxy = {
  projectTrees: [] as Array<{ pathname: string }>
}
vi.mock('@/store/project', () => ({
  useProjectStore: () => projectStateProxy
}))

const preferencesProxy = {
  searchExclusions: [] as string[],
  searchMaxFileSize: null as null | number,
  searchIncludeHidden: false,
  searchNoIgnore: false,
  searchFollowSymlinks: false
}
vi.mock('@/store/preferences', () => ({
  usePreferencesStore: () => preferencesProxy
}))

// Mock the RipgrepDirectorySearcher class. The real one talks to
// ipcRenderer; we replace it with a per-test-controllable stub.
const searchSpy = vi.fn()
vi.mock('@/node/ripgrepSearcher', () => {
  return {
    default: class FakeRipgrepDirectorySearcher {
      search(...args: unknown[]) {
        return searchSpy(...args)
      }
    }
  }
})

// electron-log shim — already aliased in vitest.config but be defensive
vi.mock('electron-log', () => ({
  default: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() }
}))

describe('store/search', () => {
  beforeEach(() => {
    setupTestPinia()
    projectStateProxy.projectTrees = []
    preferencesProxy.searchExclusions = []
    preferencesProxy.searchMaxFileSize = null
    preferencesProxy.searchIncludeHidden = false
    preferencesProxy.searchNoIgnore = false
    preferencesProxy.searchFollowSymlinks = false
    searchSpy.mockReset()
    // suppress noisy debug logs by default
    vi.spyOn(console, 'debug').mockImplementation(() => {})
  })

  describe('state and getters', () => {
    it('has expected default state', async () => {
      const { useSearchStore } = await import('@/store/search')
      const s = useSearchStore()
      expect(s.keyword).toBe('')
      expect(s.isCaseSensitive).toBe(false)
      expect(s.isWholeWord).toBe(false)
      expect(s.isRegexp).toBe(false)
      expect(s.results).toEqual([])
      expect(s.running).toBe(false)
      expect(s.error).toBe('')
      expect(s.showCancel).toBe(false)
    })

    it('hasQuery getter reflects keyword length', async () => {
      const { useSearchStore } = await import('@/store/search')
      const s = useSearchStore()
      expect(s.hasQuery).toBe(false)
      s.keyword = 'x'
      expect(s.hasQuery).toBe(true)
    })

    it('matchCount sums results[].matches.length', async () => {
      const { useSearchStore } = await import('@/store/search')
      const s = useSearchStore()
      s.results = [
        { matches: [1, 2] },
        { matches: [3] },
        { matches: [] }
      ] as any
      expect(s.matchCount).toBe(3)
    })
  })

  describe('SET_KEYWORD', () => {
    it('updates keyword and triggers runSearch (empty roots → resets)', async () => {
      const { useSearchStore } = await import('@/store/search')
      const s = useSearchStore()
      s.results = [{ matches: [1] }] as any
      s.SET_KEYWORD('hello')
      expect(s.keyword).toBe('hello')
      // No roots → results reset, running false
      expect(s.results).toEqual([])
      expect(s.running).toBe(false)
      expect(searchSpy).not.toHaveBeenCalled()
    })
  })

  describe('TOGGLE_OPTION', () => {
    it('toggles isCaseSensitive flag', async () => {
      const { useSearchStore } = await import('@/store/search')
      const s = useSearchStore()
      s.TOGGLE_OPTION('isCaseSensitive')
      expect(s.isCaseSensitive).toBe(true)
      s.TOGGLE_OPTION('isCaseSensitive')
      expect(s.isCaseSensitive).toBe(false)
    })

    it('toggles isWholeWord flag', async () => {
      const { useSearchStore } = await import('@/store/search')
      const s = useSearchStore()
      s.TOGGLE_OPTION('isWholeWord')
      expect(s.isWholeWord).toBe(true)
    })

    it('toggles isRegexp flag', async () => {
      const { useSearchStore } = await import('@/store/search')
      const s = useSearchStore()
      s.TOGGLE_OPTION('isRegexp')
      expect(s.isRegexp).toBe(true)
    })

    it('unknown option name is a no-op (still calls runSearch)', async () => {
      const { useSearchStore } = await import('@/store/search')
      const s = useSearchStore()
      s.TOGGLE_OPTION('bogus')
      expect(s.isCaseSensitive).toBe(false)
      expect(s.isWholeWord).toBe(false)
      expect(s.isRegexp).toBe(false)
    })
  })

  describe('runSearch', () => {
    it('blocks when projectTrees is empty', async () => {
      const { useSearchStore } = await import('@/store/search')
      const s = useSearchStore()
      s.keyword = 'foo'
      s.results = [{ matches: [1] }] as any
      s.runSearch()
      expect(s.results).toEqual([])
      expect(s.running).toBe(false)
      expect(searchSpy).not.toHaveBeenCalled()
    })

    it('clears results when keyword is empty (with roots)', async () => {
      projectStateProxy.projectTrees = [{ pathname: '/proj' }]
      const { useSearchStore } = await import('@/store/search')
      const s = useSearchStore()
      s.results = [{ matches: [1] }] as any
      s.keyword = ''
      s.runSearch()
      expect(s.results).toEqual([])
      expect(s.running).toBe(false)
      expect(searchSpy).not.toHaveBeenCalled()
    })

    it('dispatches search and applies live-roots filter on resolve', async () => {
      projectStateProxy.projectTrees = [{ pathname: '/proj' }]
      let didMatchCb: any
      const promiseLike: any = Promise.resolve()
      promiseLike.cancel = vi.fn()
      // Mimic searcher API: returns thenable with .cancel
      searchSpy.mockImplementation((roots, keyword, opts) => {
        didMatchCb = opts.didMatch
        // Drive matches synchronously then return an already-resolved
        // promise. We resolve through .then chained inside runSearch.
        didMatchCb({ filePath: '/proj/a.md', matches: [{ line: 1 }] })
        didMatchCb({ filePath: '/elsewhere/b.md', matches: [{ line: 2 }] }) // out of root
        return promiseLike
      })

      const { useSearchStore } = await import('@/store/search')
      const s = useSearchStore()
      s.keyword = 'hello'
      s.runSearch()
      expect(searchSpy).toHaveBeenCalledTimes(1)
      // Wait microtasks so .then runs
      await Promise.resolve()
      await Promise.resolve()
      expect(s.running).toBe(false)
      // /elsewhere/* should be filtered out — only /proj/a.md remains
      expect(s.results.length).toBe(1)
      expect(s.results[0].filePath).toBe('/proj/a.md')
    })

    it('error path resets results to [] and running false', async () => {
      projectStateProxy.projectTrees = [{ pathname: '/proj' }]
      const promiseLike: any = Promise.reject(new Error('boom'))
      promiseLike.cancel = vi.fn()
      // suppress unhandled rejection warning
      promiseLike.catch(() => {})
      searchSpy.mockImplementation(() => promiseLike)

      const { useSearchStore } = await import('@/store/search')
      const s = useSearchStore()
      s.keyword = 'bad'
      s.runSearch()
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
      expect(s.results).toEqual([])
      expect(s.running).toBe(false)
    })

    it('canceling on >100 paths sets error message', async () => {
      projectStateProxy.projectTrees = [{ pathname: '/proj' }]
      // We need to defer didSearchPaths to a microtask — the source
      // closes over `promises` (the chained .then().catch() result)
      // which is in the temporal dead zone during the synchronous
      // call to .search(). Real IPC is async too.
      let didSearchPathsCb: any
      let resolveOuter!: () => void
      const inner = new Promise<void>((r) => { resolveOuter = r })
      ;(inner as any).cancel = vi.fn()
      searchSpy.mockImplementation((_roots, _keyword, opts) => {
        didSearchPathsCb = opts.didSearchPaths
        // Schedule the >100 event for next microtask
        Promise.resolve().then(() => {
          didSearchPathsCb(150)
          resolveOuter()
        })
        return inner
      })

      const { useSearchStore } = await import('@/store/search')
      const s = useSearchStore()
      s.keyword = 'huge'
      s.runSearch()
      // Wait microtasks: didSearchPaths fires, then resolves
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
      expect(s.error).toBe('Showing first 100 results only')
      // Note: source bug — `promises.cancel` inside didSearchPaths
      // resolves to the chained .then().catch() promise which has no
      // .cancel attached. So no cancel is invoked there, but the
      // error message IS set.
    })

    it('passes search options from preferences store', async () => {
      projectStateProxy.projectTrees = [{ pathname: '/proj' }]
      preferencesProxy.searchExclusions = ['.git']
      preferencesProxy.searchMaxFileSize = 1048576
      preferencesProxy.searchIncludeHidden = true
      preferencesProxy.searchNoIgnore = true
      preferencesProxy.searchFollowSymlinks = true

      const promiseLike: any = Promise.resolve()
      promiseLike.cancel = vi.fn()
      searchSpy.mockReturnValue(promiseLike)

      const { useSearchStore } = await import('@/store/search')
      const s = useSearchStore()
      s.isCaseSensitive = true
      s.isWholeWord = true
      s.isRegexp = true
      s.keyword = 'q'
      s.runSearch()
      expect(searchSpy).toHaveBeenCalledTimes(1)
      const [roots, keyword, opts] = searchSpy.mock.calls[0]
      expect(roots).toEqual(['/proj'])
      expect(keyword).toBe('q')
      expect(opts.isCaseSensitive).toBe(true)
      expect(opts.isWholeWord).toBe(true)
      expect(opts.isRegexp).toBe(true)
      expect(opts.exclusions).toEqual(['.git'])
      expect(opts.maxFileSize).toBe(1048576)
      expect(opts.includeHidden).toBe(true)
      expect(opts.noIgnore).toBe(true)
      expect(opts.followSymlinks).toBe(true)
      // window.fileUtils.MARKDOWN_INCLUSIONS comes from setup.ts shim
      expect(opts.inclusions).toEqual(['*.md', '*.markdown'])
    })

    it('filters out falsy/empty pathname roots', async () => {
      projectStateProxy.projectTrees = [
        { pathname: '/proj' },
        null as any,
        { pathname: '' }
      ]
      const promiseLike: any = Promise.resolve()
      promiseLike.cancel = vi.fn()
      searchSpy.mockReturnValue(promiseLike)

      const { useSearchStore } = await import('@/store/search')
      const s = useSearchStore()
      s.keyword = 'q'
      s.runSearch()
      expect(searchSpy).toHaveBeenCalledTimes(1)
      const [roots] = searchSpy.mock.calls[0]
      expect(roots).toEqual(['/proj'])
    })

    it('searcher without cancel does not crash (activeCancel stays null)', async () => {
      projectStateProxy.projectTrees = [{ pathname: '/proj' }]
      // Promise WITHOUT a .cancel attached
      searchSpy.mockReturnValue(Promise.resolve())

      const { useSearchStore } = await import('@/store/search')
      const s = useSearchStore()
      s.keyword = 'x'
      expect(() => s.runSearch()).not.toThrow()
      await Promise.resolve()
      await Promise.resolve()
      expect(s.running).toBe(false)
    })
  })

  describe('cancelRunning', () => {
    // Note: due to a source-side detail, `activeCancel` is set to
    // `promises.cancel` where `promises` is the chained
    // `.then().catch()` result — which has no `.cancel` property.
    // So `cancelRunning()` is effectively a no-op in current code.
    // We verify it doesn't throw, regardless of `running`.
    it('no-op when not running (does not throw)', async () => {
      const { useSearchStore } = await import('@/store/search')
      const s = useSearchStore()
      expect(() => s.cancelRunning()).not.toThrow()
    })

    it('no-op when running but no activeCancel was captured', async () => {
      projectStateProxy.projectTrees = [{ pathname: '/proj' }]
      const promiseLike: any = new Promise(() => {})
      promiseLike.cancel = vi.fn()
      searchSpy.mockReturnValue(promiseLike)

      const { useSearchStore } = await import('@/store/search')
      const s = useSearchStore()
      s.keyword = 'q'
      s.runSearch()
      expect(s.running).toBe(true)
      // Doesn't throw — `activeCancel` is null since it tracks the
      // chained-promise's missing .cancel.
      expect(() => s.cancelRunning()).not.toThrow()
    })
  })

  // C-MULTI-SOURCE-WORKSPACE fix wave: keystroke-canceled generations
  // must never write results nor flip running — the pre-fix bug kept a
  // late root's matches out of the visible result set (owner acceptance
  // С4: "quarterly" typed char-by-char showed only the first root).
  describe('generation guard', () => {
    const tick = async () => {
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    }

    it('a stale generation completing while the newest runs leaves running true', async () => {
      projectStateProxy.projectTrees = [
        { pathname: '/roots/alpha' },
        { pathname: '/roots/beta' }
      ]
      let resolveGen1: () => void = () => {}
      let resolveGen2: () => void = () => {}
      const p1 = new Promise<void>((r) => { resolveGen1 = r })
      const p2 = new Promise<void>((r) => { resolveGen2 = r })
      // No .cancel on either promise: gen1 stays live after the second
      // keystroke, so its late resolution is fully controlled by the test.
      searchSpy.mockReturnValueOnce(p1).mockReturnValueOnce(p2)

      const { useSearchStore } = await import('@/store/search')
      const s = useSearchStore()
      s.SET_KEYWORD('quarterl')
      s.SET_KEYWORD('quarterly')
      expect(s.running).toBe(true)

      resolveGen1()
      await tick()
      // Pre-fix: the stale .then() set running=false (and stomped
      // activeCancel), leaving the live generation uncancellable.
      expect(s.running).toBe(true)

      resolveGen2()
      await tick()
      expect(s.running).toBe(false)
    })

    it('a stale generation completing after the newest cannot overwrite its results', async () => {
      projectStateProxy.projectTrees = [
        { pathname: '/roots/alpha' },
        { pathname: '/roots/beta' }
      ]
      let resolveGen1: () => void = () => {}
      let resolveGen2: () => void = () => {}
      const p1 = new Promise<void>((r) => { resolveGen1 = r })
      const p2 = new Promise<void>((r) => { resolveGen2 = r })
      searchSpy.mockImplementationOnce((_dirs: string[], _pat: string, opts: any) => {
        // Stale generation only ever saw the first root's match.
        opts.didMatch({ filePath: '/roots/alpha/report.md', matches: [{ lineText: 'quarterly numbers are up' }] })
        return p1
      }).mockImplementationOnce((_dirs: string[], _pat: string, opts: any) => {
        opts.didMatch({ filePath: '/roots/alpha/report.md', matches: [{ lineText: 'quarterly numbers are up' }] })
        opts.didMatch({ filePath: '/roots/beta/plan.md', matches: [{ lineText: 'quarterly review plan' }] })
        return p2
      })

      const { useSearchStore } = await import('@/store/search')
      const s = useSearchStore()
      s.SET_KEYWORD('quarterl')
      s.SET_KEYWORD('quarterly')

      resolveGen2()
      await tick()
      expect(s.results).toHaveLength(2)
      expect(s.running).toBe(false)

      // The stale generation lands LAST — pre-fix its partial write
      // (1 file, first root only) replaced the complete result set.
      resolveGen1()
      await tick()
      expect(s.results).toHaveLength(2)
      expect(s.running).toBe(false)
    })
  })
})
