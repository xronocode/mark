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
 *       error path, stale-completion discard on every runSearch path,
 *       and the honest delivered-match cap (C-SEARCH-LIFECYCLE-DISCARD;
 *       the mock-fed "canceling on >100 paths" pin was replaced — the
 *       searchedPaths event never exists on the wire).
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
  // C-SEARCH-ERROR-VISIBILITY: the documented schema value is a string
  // ("1048576" / "1K" / "2M" / "3G" / empty); the number branch stays
  // for the legacy-persisted-value tolerance pin.
  searchMaxFileSize: null as null | number | string,
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
      // C-SEARCH-ERROR-VISIBILITY: the honest-partial state starts false.
      expect(s.partialResults).toBe(false)
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

    // C-SEARCH-LIFECYCLE-DISCARD T-001: replaces the mock-fed
    // ">100 paths" error pin — the searchedPaths
    // event it drove never exists on the wire, so the limit is now an
    // honest delivered-match cap: grouped envelopes counted on their
    // matches (the matchCount unit), the crossing envelope sliced to the
    // exact remaining count, the walk cancelled through the raw-promise
    // seam, the set marked partial, the error voice left empty (a cap is
    // not a failure).
    it('caps the displayed set at 100 delivered matches and marks it partial', async () => {
      projectStateProxy.projectTrees = [{ pathname: '/proj' }]
      const makeMatches = (n: number) => Array.from({ length: n }, (_, i) => ({ line: i + 1 }))
      let didMatchCb: any
      let resolveOuter!: () => void
      const inner = new Promise<void>((r) => { resolveOuter = r })
      // The real raw promise's cancel settles the walk with resolve.
      ;(inner as any).cancel = vi.fn(() => { resolveOuter() })
      searchSpy.mockImplementation((_roots, _keyword, opts) => {
        didMatchCb = opts.didMatch
        // The envelopes must arrive asynchronously — the source's cancel
        // seam closes over the raw promise constant, so synchronous
        // delivery would hit the documented temporal dead zone the old
        // pin's comment described. Real IPC is async too.
        Promise.resolve()
          .then(() => didMatchCb({ filePath: '/proj/a.md', matches: makeMatches(40) }))
          .then(() => didMatchCb({ filePath: '/proj/b.md', matches: makeMatches(40) }))
          .then(() => didMatchCb({ filePath: '/proj/c.md', matches: makeMatches(40) }))
          .then(() => didMatchCb({ filePath: '/proj/d.md', matches: makeMatches(10) }))
        return inner
      })

      const { useSearchStore } = await import('@/store/search')
      const s = useSearchStore()
      s.keyword = 'huge'
      s.runSearch()
      await new Promise((r) => setTimeout(r, 0))
      await new Promise((r) => setTimeout(r, 0))
      // Exactly the promised 100 delivered matches — the crossing
      // envelope (c.md) is sliced to the remaining 20, and the post-cap
      // envelope (d.md) is dropped with no zero-match entry emitted.
      expect(s.matchCount).toBe(100)
      expect(s.results.map((r: any) => r.matches.length)).toEqual([40, 40, 20])
      expect(s.results).toHaveLength(3)
      // The walk was cancelled through the raw-promise seam, exactly once.
      expect((inner as any).cancel).toHaveBeenCalledTimes(1)
      // A cap is not a failure — the error voice stays empty — and the
      // set is marked partial through the #303 state (no backend
      // terminal involved).
      expect(s.error).toBe('')
      expect(s.partialResults).toBe(true)
      expect(s.running).toBe(false)

      // A subsequent keystroke clears the partial state.
      searchSpy.mockImplementation((_roots, _keyword, opts) => {
        Promise.resolve().then(() => {
          opts.didMatch({ filePath: '/proj/small.md', matches: [{ line: 1 }] })
        })
        const settled: any = Promise.resolve()
        settled.cancel = vi.fn()
        return settled
      })
      s.SET_KEYWORD('small')
      await new Promise((r) => setTimeout(r, 0))
      await new Promise((r) => setTimeout(r, 0))
      expect(s.partialResults).toBe(false)
      expect(s.matchCount).toBe(1)
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
    // Macrotask drain: the completion path chains several microtask
    // hops (didComplete, partial handling, generation guard) — a real
    // timer tick drains them all deterministically.
    const tick = async () => {
      await new Promise((r) => setTimeout(r, 0))
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

  // C-SEARCH-LIFECYCLE-DISCARD T-001: every runSearch path claims the
  // generation ahead of any early return, so a completion belonging to a
  // prior generation can never overwrite a reset — clearing the keyword,
  // losing the roots or an invalid size limit while a search runs
  // discards the late completion instead of letting the old matches
  // come back.
  describe('stale completion discard (C-SEARCH-LIFECYCLE-DISCARD)', () => {
    const tick = async () => {
      await new Promise((r) => setTimeout(r, 0))
    }

    it('clearing the keyword while a search is running does not bring the old matches back', async () => {
      projectStateProxy.projectTrees = [{ pathname: '/proj' }]
      let didMatchCb: any
      let resolveOuter!: () => void
      const inner = new Promise<void>((r) => { resolveOuter = r })
      ;(inner as any).cancel = vi.fn()
      searchSpy.mockImplementation((_roots, _keyword, opts) => {
        didMatchCb = opts.didMatch
        return inner
      })

      const { useSearchStore } = await import('@/store/search')
      const s = useSearchStore()
      s.SET_KEYWORD('stale')
      expect(s.running).toBe(true)
      // A match for the in-flight generation is delivered...
      didMatchCb({ filePath: '/proj/a.md', matches: [{ line: 1 }] })
      // ...then the user empties the input while the search still runs.
      s.SET_KEYWORD('')
      expect(s.results).toEqual([])
      expect(s.running).toBe(false)
      // The supersede path cancelled the in-flight generation exactly once.
      expect((inner as any).cancel).toHaveBeenCalledTimes(1)

      // The cancelled searcher settles with resolve (mt::search-cancel
      // settles the raw promise) — the late completion lands on a stale
      // generation and must be dropped.
      resolveOuter()
      await tick()
      expect(s.results).toEqual([])
      expect(s.running).toBe(false)
      expect(s.partialResults).toBe(false)
      // No further cancel after settle.
      expect((inner as any).cancel).toHaveBeenCalledTimes(1)
    })

    it('losing the opened roots while a search runs discards the late completion', async () => {
      projectStateProxy.projectTrees = [{ pathname: '/proj' }]
      let didMatchCb: any
      let resolveOuter!: () => void
      const inner = new Promise<void>((r) => { resolveOuter = r })
      ;(inner as any).cancel = vi.fn()
      searchSpy.mockImplementation((_roots, _keyword, opts) => {
        didMatchCb = opts.didMatch
        return inner
      })

      const { useSearchStore } = await import('@/store/search')
      const s = useSearchStore()
      s.keyword = 'stale'
      s.runSearch()
      didMatchCb({ filePath: '/proj/a.md', matches: [{ line: 1 }] })
      // All roots close mid-search — the refresh runSearch hits the
      // empty-roots early return.
      projectStateProxy.projectTrees = []
      s.runSearch()
      expect(s.results).toEqual([])
      expect(s.running).toBe(false)

      resolveOuter()
      await tick()
      expect(s.results).toEqual([])
      expect(s.running).toBe(false)
      expect(s.partialResults).toBe(false)
    })

    it('an invalid max file size while a search runs discards the late completion', async () => {
      projectStateProxy.projectTrees = [{ pathname: '/proj' }]
      let didMatchCb: any
      let resolveOuter!: () => void
      const inner = new Promise<void>((r) => { resolveOuter = r })
      ;(inner as any).cancel = vi.fn()
      searchSpy.mockImplementation((_roots, _keyword, opts) => {
        didMatchCb = opts.didMatch
        return inner
      })

      const { useSearchStore } = await import('@/store/search')
      const s = useSearchStore()
      s.keyword = 'stale'
      s.runSearch()
      didMatchCb({ filePath: '/proj/a.md', matches: [{ line: 1 }] })
      // The stored preference becomes invalid mid-search — the refresh
      // runSearch fails at the boundary.
      preferencesProxy.searchMaxFileSize = '12X'
      s.runSearch()
      expect(s.error).toBe('Invalid max file size: 12X')
      expect(s.results).toEqual([])
      expect(s.running).toBe(false)

      resolveOuter()
      await tick()
      expect(s.results).toEqual([])
      expect(s.running).toBe(false)
      expect(s.partialResults).toBe(false)
      preferencesProxy.searchMaxFileSize = null
    })

    it('a superseding keystroke discards the earlier generation before it ever writes', async () => {
      projectStateProxy.projectTrees = [
        { pathname: '/roots/alpha' },
        { pathname: '/roots/beta' }
      ]
      let didMatch1: any
      let resolveGen1: () => void = () => {}
      let resolveGen2: () => void = () => {}
      const p1 = new Promise<void>((r) => { resolveGen1 = r })
      const p2 = new Promise<void>((r) => { resolveGen2 = r })
      searchSpy.mockImplementationOnce((_dirs: string[], _pat: string, opts: any) => {
        didMatch1 = opts.didMatch
        return p1
      }).mockImplementationOnce(() => p2)

      const { useSearchStore } = await import('@/store/search')
      const s = useSearchStore()
      s.SET_KEYWORD('quarterl')
      didMatch1({ filePath: '/roots/alpha/report.md', matches: [{ lineText: 'quarterly' }] })
      s.SET_KEYWORD('quarterly')
      // The superseded generation settles first — its collected matches
      // must never reach the displayed set while the newest run holds.
      resolveGen1()
      await tick()
      expect(s.results).toEqual([])
      expect(s.running).toBe(true)

      resolveGen2()
      await tick()
      expect(s.running).toBe(false)
    })
  })

  // C-SEARCH-ERROR-VISIBILITY T-002: parseSearchMaxFileSize at the store
  // boundary accepts the documented preferences-schema format —
  // "1048576", "1K", "2M", "3G", empty → no limit — and converts to
  // bytes; an invalid limit fails the search before any searcher call
  // or spawn.
  describe('parseSearchMaxFileSize (C-SEARCH-ERROR-VISIBILITY)', () => {
    it.each([
      ['1048576', 1048576],
      ['1K', 1024],
      ['2M', 2097152],
      ['3G', 3221225472]
    ])('accepts the documented schema value %s → %i bytes', async (raw, expected) => {
      const { parseSearchMaxFileSize } = await import('@/store/search')
      expect(parseSearchMaxFileSize(raw)).toBe(expected)
    })

    it('treats empty/absent as no limit (null)', async () => {
      const { parseSearchMaxFileSize } = await import('@/store/search')
      expect(parseSearchMaxFileSize('')).toBe(null)
      expect(parseSearchMaxFileSize(null)).toBe(null)
      expect(parseSearchMaxFileSize(undefined)).toBe(null)
    })

    it('rejects values outside the documented schema as invalid (undefined)', async () => {
      const { parseSearchMaxFileSize } = await import('@/store/search')
      expect(parseSearchMaxFileSize('12X')).toBeUndefined()
      expect(parseSearchMaxFileSize('abc')).toBeUndefined()
      expect(parseSearchMaxFileSize('-5')).toBeUndefined()
    })
  })

  // C-SEARCH-ERROR-VISIBILITY T-002: the store's voice — an invalid
  // limit never spawns, rejections surface a stable error message and
  // keep streamed results only when the terminal marked them partial,
  // and a cancelled search resolves quietly.
  describe('store failure and partial state (C-SEARCH-ERROR-VISIBILITY)', () => {
    const tick = async () => {
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    }

    it('an invalid maxFileSize sets the error state and performs no searcher call', async () => {
      projectStateProxy.projectTrees = [{ pathname: '/proj' }]
      preferencesProxy.searchMaxFileSize = '12X'
      const { useSearchStore } = await import('@/store/search')
      const s = useSearchStore()
      s.keyword = 'q'
      s.runSearch()
      expect(searchSpy).not.toHaveBeenCalled()
      expect(s.running).toBe(false)
      expect(s.error).toBe('Invalid max file size: 12X')
      expect(s.results).toEqual([])
      expect(s.partialResults).toBe(false)
    })

    it('a valid limit that suppresses candidates marks the result set partial', async () => {
      projectStateProxy.projectTrees = [{ pathname: '/proj' }]
      preferencesProxy.searchMaxFileSize = '1K'
      const promiseLike: any = Promise.resolve()
      promiseLike.cancel = vi.fn()
      searchSpy.mockImplementation((_roots: string[], _kw: string, opts: any) => {
        // A size limit suppressed every candidate except one streamed
        // hit, and the terminal honestly marked the set partial.
        opts.didMatch({ filePath: '/proj/a.md', matches: [{ line: 1 }] })
        opts.didComplete({ partial: true })
        return promiseLike
      })
      const { useSearchStore } = await import('@/store/search')
      const s = useSearchStore()
      s.keyword = 'q'
      s.runSearch()
      await tick()
      expect(s.results).toHaveLength(1)
      expect(s.partialResults).toBe(true)
      expect(s.error).toBe('')
    })

    it('the rejection path sets a non-empty error message', async () => {
      projectStateProxy.projectTrees = [{ pathname: '/proj' }]
      const promiseLike: any = Promise.reject(new Error('rg exited with code 2'))
      promiseLike.cancel = vi.fn()
      promiseLike.catch(() => {})
      searchSpy.mockReturnValue(promiseLike)
      const { useSearchStore } = await import('@/store/search')
      const s = useSearchStore()
      s.keyword = 'bad'
      s.runSearch()
      await tick()
      expect(s.error).toBe('rg exited with code 2')
      expect(s.running).toBe(false)
    })

    it('the rejection keeps streamed results only when marked partial', async () => {
      projectStateProxy.projectTrees = [{ pathname: '/proj' }]
      let rejectOuter!: (e: Error) => void
      const inner = new Promise<void>((_r, reject) => { rejectOuter = reject })
      ;(inner as any).cancel = vi.fn()
      ;(inner as any).catch(() => {})
      searchSpy.mockImplementation((_roots: string[], _kw: string, opts: any) => {
        opts.didMatch({ filePath: '/proj/partial-hit.md', matches: [{ line: 1 }] })
        opts.didComplete({ partial: true })
        Promise.resolve().then(() => rejectOuter(new Error('boom')))
        return inner
      })
      const { useSearchStore } = await import('@/store/search')
      const s = useSearchStore()
      s.keyword = 'q'
      s.runSearch()
      await tick()
      expect(s.error).not.toBe('')
      expect(s.partialResults).toBe(true)
      expect(s.results).toHaveLength(1)
      expect(s.results[0].filePath).toBe('/proj/partial-hit.md')
    })

    it('the rejection drops streamed results when not marked partial', async () => {
      projectStateProxy.projectTrees = [{ pathname: '/proj' }]
      let rejectOuter!: (e: Error) => void
      const inner = new Promise<void>((_r, reject) => { rejectOuter = reject })
      ;(inner as any).cancel = vi.fn()
      ;(inner as any).catch(() => {})
      searchSpy.mockImplementation((_roots: string[], _kw: string, opts: any) => {
        opts.didMatch({ filePath: '/proj/a.md', matches: [{ line: 1 }] })
        Promise.resolve().then(() => rejectOuter(new Error('boom')))
        return inner
      })
      const { useSearchStore } = await import('@/store/search')
      const s = useSearchStore()
      s.keyword = 'q'
      s.runSearch()
      await tick()
      expect(s.error).not.toBe('')
      expect(s.partialResults).toBe(false)
      expect(s.results).toEqual([])
    })

    it('a cancelled search resolves quietly without a failure message', async () => {
      projectStateProxy.projectTrees = [{ pathname: '/proj' }]
      let resolveOuter!: () => void
      const promiseLike: any = new Promise<void>((resolve) => { resolveOuter = resolve })
      promiseLike.cancel = vi.fn(() => { resolveOuter() })
      searchSpy.mockImplementation((_roots: string[], _kw: string, opts: any) => {
        opts.didMatch({ filePath: '/proj/a.md', matches: [{ line: 1 }] })
        return promiseLike
      })
      const { useSearchStore } = await import('@/store/search')
      const s = useSearchStore()
      s.keyword = 'q'
      s.runSearch()
      expect(s.running).toBe(true)
      s.cancelRunning()
      await tick()
      expect(s.error).toBe('')
      expect(s.partialResults).toBe(false)
      expect(s.running).toBe(false)
      // Streamed hits stay visible but unmarked — neither failure nor
      // partial renders for a cancelled search.
      expect(s.results).toHaveLength(1)
    })

    it('a stale generation rejection cannot write the error state', async () => {
      projectStateProxy.projectTrees = [{ pathname: '/proj' }]
      let rejectGen1!: (e: Error) => void
      let resolveGen2!: () => void
      const p1 = new Promise<void>((_r, reject) => { rejectGen1 = reject })
      const p2 = new Promise<void>((resolve) => { resolveGen2 = resolve })
      ;(p1 as any).cancel = vi.fn()
      ;(p2 as any).cancel = vi.fn()
      ;(p1 as any).catch(() => {})
      ;(p2 as any).catch(() => {})
      searchSpy.mockReturnValueOnce(p1).mockReturnValueOnce(p2)
      const { useSearchStore } = await import('@/store/search')
      const s = useSearchStore()
      s.SET_KEYWORD('quarterl')
      s.SET_KEYWORD('quarterly')
      resolveGen2()
      await tick()
      expect(s.error).toBe('')
      // The stale generation rejects LAST — it must not write.
      rejectGen1(new Error('stale boom'))
      await tick()
      expect(s.error).toBe('')
      expect(s.running).toBe(false)
    })
  })
})
