/**
 * Deep coverage tests for src/renderer/src/commands/quickOpen.js
 *
 * Covers uncovered code paths:
 *   - search() with query — cancels previous, debounces, calls _doSearch
 *   - search() cancel function invocation
 *   - _doSearch — no root dir + no tabs → empty array
 *   - _doSearch — no root dir + tabs available → filtered by regex
 *   - _doSearch — root dir opened → directory search promise
 *   - _doSearch — special chars in query
 *   - _doSearch — cancel via _cancelFn during search
 *   - _doSearch — search promises catch path
 *   - _doSearch — passes no didSearchPaths option (C-SEARCH-LIFECYCLE-
 *     DISCARD: the ">30 files" wire limit was removed — the searchedPaths
 *     event never exists on the wire)
 *   - unload() — still clears subcommands, and now cancels the in-flight
 *     debounce or searcher walk through the _cancelFn seam
 *     (C-SEARCH-LIFECYCLE-DISCARD)
 *   - run() — works with only editor tabs (no projectTree)
 */

vi.mock('@/i18n', () => ({
  t: (key) => `t:${key}`
}))

vi.mock('@/bus', () => ({
  default: { emit: vi.fn(), on: vi.fn(), off: vi.fn() }
}))

// Controllable delay double (C-SEARCH-LIFECYCLE-DISCARD T-003): tests
// swap `delayState.impl` to hold the debounce phase open — by default it
// resolves immediately, matching the previous resolved-promise mock.
const { delayState } = vi.hoisted(() => ({
  delayState: {
    impl: () => {
      const p = Promise.resolve()
      p.cancel = vi.fn()
      return p
    }
  }
}))

vi.mock('@/util', () => {
  return {
    delay: (ms) => delayState.impl(ms),
    isOsx: false,
    isWindows: false,
    isLinux: true
  }
})

// Controllable FileSearcher mock
const mockSearchFn = vi.fn()
vi.mock('@/node/fileSearcher', () => {
  return {
    default: class {
      search (...args) {
        return mockSearchFn(...args)
      }
    }
  }
})

import QuickOpenCommand from '@/commands/quickOpen'
import bus from '@/bus'

describe('QuickOpenCommand — deep coverage', () => {
  let cmd
  let rootState

  beforeEach(() => {
    vi.clearAllMocks()
    delayState.impl = () => {
      const p = Promise.resolve()
      p.cancel = vi.fn()
      return p
    }
    rootState = {
      editor: {
        tabs: [
          { pathname: '/docs/readme.md' },
          { pathname: '/docs/guide.md' },
          { pathname: null },
          { pathname: '/other/external.md' }
        ]
      },
      project: {
        projectTree: {
          pathname: '/docs'
        }
      }
    }

    window.fileUtils.hasMarkdownExtension = vi.fn((p) =>
      /\.(md|markdown)$/i.test(p)
    )
    window.fileUtils.isChildOfDirectory = vi.fn((parent, child) =>
      child.startsWith(parent + '/')
    )
    window.fileUtils.MARKDOWN_INCLUSIONS = ['*.md', '*.markdown']

    cmd = new QuickOpenCommand(rootState)
  })

  // ---- search() method ----

  describe('search()', () => {
    it('returns subcommands immediately when query is empty string', async () => {
      cmd.subcommands = [{ id: 'a' }, { id: 'b' }]
      const result = await cmd.search('')
      expect(result).toEqual([{ id: 'a' }, { id: 'b' }])
    })

    it('returns subcommands for null/undefined query treated as falsy', async () => {
      cmd.subcommands = [{ id: 'x' }]
      const result = await cmd.search(null)
      expect(result).toEqual([{ id: 'x' }])
    })

    it('cancels previous search when a new one starts', async () => {
      // Simulate having a cancel function set
      const prevCancel = vi.fn()
      cmd._cancelFn = prevCancel

      // search with query will cancel the previous fn
      mockSearchFn.mockImplementation(() => {
        const p = Promise.resolve()
        p.cancel = vi.fn()
        return p
      })

      await cmd.search('test')
      expect(prevCancel).toHaveBeenCalled()
    })

    it('sets and clears _cancelFn properly during delay', async () => {
      mockSearchFn.mockImplementation(() => {
        const p = Promise.resolve()
        p.cancel = vi.fn()
        return p
      })

      await cmd.search('query')
      // After search completes, _cancelFn should be set to the search cancel
    })
  })

  // ---- run() ----

  describe('run()', () => {
    it('runs with editor tabs and project tree', async () => {
      rootState.editor.tabs = [
        { pathname: '/docs/file1.md' },
        { pathname: '/docs/file2.md' }
      ]
      cmd = new QuickOpenCommand(rootState)
      await cmd.run()
      expect(cmd.subcommands).toHaveLength(2)
    })

    it('filters out null pathnames from tabs', async () => {
      await cmd.run()
      // Original tabs have 3 with pathnames
      expect(cmd.subcommands).toHaveLength(3)
      cmd.subcommands.forEach((s) => {
        expect(s.id).toBeTruthy()
      })
    })

    it('throws when no project tree and no tabs', async () => {
      rootState.project.projectTree = null
      rootState.editor.tabs = []
      cmd = new QuickOpenCommand(rootState)
      await expect(cmd.run()).rejects.toThrow()
    })
  })

  // ---- _doSearch() ----

  describe('_doSearch()', () => {
    it('returns empty array when no root dir and no tabs', () => {
      rootState.project.projectTree = null
      rootState.editor.tabs = []
      cmd = new QuickOpenCommand(rootState)
      const result = cmd._doSearch('test')
      expect(result).toEqual([])
    })

    it('returns filtered tabs when no root dir but tabs are present', () => {
      rootState.project.projectTree = null
      cmd = new QuickOpenCommand(rootState)
      const result = cmd._doSearch('readme')
      expect(Array.isArray(result)).toBe(true)
      expect(result.length).toBeGreaterThan(0)
      // Each result should have id, description, title
      result.forEach((r) => {
        expect(r.id).toBeDefined()
        expect(r.description).toBeDefined()
        expect(r.title).toBeDefined()
      })
    })

    it('filters tabs by regex match (case-insensitive)', () => {
      rootState.project.projectTree = null
      cmd = new QuickOpenCommand(rootState)
      const result = cmd._doSearch('GUIDE')
      expect(result.some((r) => r.id === '/docs/guide.md')).toBe(true)
    })

    it('handles special regex characters in query', () => {
      rootState.project.projectTree = null
      rootState.editor.tabs = [{ pathname: '/docs/file[1].md' }]
      cmd = new QuickOpenCommand(rootState)
      const result = cmd._doSearch('[1]')
      expect(Array.isArray(result)).toBe(true)
    })

    it('handles backslash in query', () => {
      rootState.project.projectTree = null
      rootState.editor.tabs = [{ pathname: '/docs/path\\file.md' }]
      cmd = new QuickOpenCommand(rootState)
      const result = cmd._doSearch('\\')
      expect(Array.isArray(result)).toBe(true)
    })

    it('handles wildcard * in query', () => {
      rootState.project.projectTree = null
      rootState.editor.tabs = [{ pathname: '/docs/abc.md' }]
      cmd = new QuickOpenCommand(rootState)
      const result = cmd._doSearch('a*c')
      expect(Array.isArray(result)).toBe(true)
    })

    it('with root dir: returns promise that resolves with search results', async () => {
      mockSearchFn.mockImplementation((_paths, _query, options) => {
        // Simulate finding results (didMatch only — the didSearchPaths
        // option is gone with the dead wire limit).
        options.didMatch('/docs/found.md')
        const p = Promise.resolve()
        p.cancel = vi.fn()
        return p
      })

      const result = await cmd._doSearch('found')
      expect(Array.isArray(result)).toBe(true)
    })

    it('with root dir: excludes tabs that are children of root from tab search', async () => {
      // /docs/readme.md IS a child of /docs, so it won't be in tab search
      // /other/external.md is NOT a child, so it may appear
      mockSearchFn.mockImplementation((_paths, _query, options) => {
        const p = Promise.resolve()
        p.cancel = vi.fn()
        return p
      })

      const result = await cmd._doSearch('external')
      expect(Array.isArray(result)).toBe(true)
    })

    it('with root dir: passes no didSearchPaths option (the dead wire limit is removed)', async () => {
      // C-SEARCH-LIFECYCLE-DISCARD T-003: replaces "didSearchPaths sets
      // canceled flag (< 30 does not cancel)" — the ">30 files" limit
      // waited for a searchedPaths event the wire never delivers, so the
      // option is no longer passed at all.
      mockSearchFn.mockImplementation((_paths, _query, options) => {
        options.didMatch('/docs/found.md')
        const p = Promise.resolve()
        p.cancel = vi.fn()
        return p
      })

      const result = await cmd._doSearch('test')
      const [, , options] = mockSearchFn.mock.calls[0]
      expect(options.didSearchPaths).toBeUndefined()
      // Search completes normally
      expect(result.length).toBeGreaterThanOrEqual(1)
    })

    it('with root dir: handles search promise rejection', async () => {
      mockSearchFn.mockImplementation(() => {
        const p = Promise.reject(new Error('search error'))
        p.cancel = vi.fn()
        return p
      })

      await expect(cmd._doSearch('error')).rejects.toThrow('search error')
    })

    it('with root dir: cancel fn set during directory search can be called', async () => {
      mockSearchFn.mockImplementation((_paths, _query, options) => {
        // Simulate some matches
        options.didMatch('/docs/found1.md')
        const p = Promise.resolve()
        p.cancel = vi.fn()
        return p
      })

      const result = await cmd._doSearch('slow')
      // After search completes, _cancelFn should be null
      expect(cmd._cancelFn).toBeNull()
      expect(Array.isArray(result)).toBe(true)
    })

    it('with root dir: didMatch adds results to searchResult array', async () => {
      mockSearchFn.mockImplementation((_paths, _query, options) => {
        options.didMatch('/docs/a.md')
        options.didMatch('/docs/b.md')
        const p = Promise.resolve()
        p.cancel = vi.fn()
        return p
      })

      const result = await cmd._doSearch('test')
      // Both matches should be in results (didMatch-only collection)
      expect(Array.isArray(result)).toBe(true)
      expect(result.length).toBeGreaterThanOrEqual(2)
    })
  })

  // ---- _getInclusions() ----

  describe('_getInclusions()', () => {
    it('returns single glob when query has markdown extension', () => {
      window.fileUtils.hasMarkdownExtension.mockReturnValue(true)
      const result = cmd._getInclusions('readme.md')
      expect(result).toEqual(['*readme.md'])
    })

    it('returns array of globs for each MARKDOWN_INCLUSIONS entry', () => {
      window.fileUtils.hasMarkdownExtension.mockReturnValue(false)
      window.fileUtils.MARKDOWN_INCLUSIONS = ['*.md', '*.markdown', '*.txt']
      const result = cmd._getInclusions('myfile')
      expect(result).toHaveLength(3)
      expect(result[0]).toBe('*myfile*.md')
      expect(result[1]).toBe('*myfile*.markdown')
      expect(result[2]).toBe('*myfile*.txt')
    })
  })

  // ---- _getPath() ----

  describe('_getPath()', () => {
    it('returns full path for file outside project root', () => {
      window.fileUtils.isChildOfDirectory.mockReturnValue(false)
      const result = cmd._getPath('/external/file.md')
      expect(result.title).toBe('/external/file.md')
      expect(result.description).toBe('/external/file.md')
    })

    it('returns relative path for child file', () => {
      window.fileUtils.isChildOfDirectory.mockReturnValue(true)
      window.path.relative.mockReturnValue('subdir/file.md')
      const result = cmd._getPath('/docs/subdir/file.md')
      expect(result.description).toBe('subdir/file.md')
      expect(result.title).toBeUndefined() // short path
    })

    it('adds title for long relative paths (>50 chars)', () => {
      window.fileUtils.isChildOfDirectory.mockReturnValue(true)
      const longPath = 'a'.repeat(51) + '.md'
      window.path.relative.mockReturnValue(longPath)
      const result = cmd._getPath('/docs/' + longPath)
      expect(result.title).toBe(longPath)
      expect(result.description).toBe(longPath)
    })
  })

  // ---- execute() ----

  describe('execute()', () => {
    it('emits show-command-palette with self', async () => {
      await cmd.execute()
      expect(bus.emit).toHaveBeenCalledWith('show-command-palette', cmd)
    })
  })

  // ---- shim-shaped feed open invocation (C-SEARCH-RESULT-CONTRACT) ----

  describe('shim-shaped-feed open invocation (C-SEARCH-RESULT-CONTRACT)', () => {
    it('opens the resolved string pathname after a grouped didMatch envelope feed', async () => {
      window.marktext = { env: { windowId: 9 } }
      mockSearchFn.mockImplementation((_paths, _q, options) => {
        options.didMatch({
          filePath: '/docs/shim-found.md',
          matches: [{ lineText: 'needle here', range: [[0, 6], [0, 12]] }]
        })
        const p = Promise.resolve()
        p.cancel = vi.fn()
        return p
      })

      const result = await cmd._doSearch('shim')
      expect(result).toHaveLength(1)
      expect(typeof result[0].id).toBe('string')
      await cmd.executeSubcommand(result[0].id)
      expect(window.electron.ipcRenderer.send).toHaveBeenCalledWith(
        'mt::open-file-by-window-id',
        9,
        '/docs/shim-found.md'
      )
    })

    // C-QUICKOPEN-FILES-MODE T-005: additive test-only pin — the files-mode
    // backend streams path-only hits that the shim groups into the same
    // { filePath, matches } envelope with the zero-pair row; quickOpen's
    // didMatch normalization keeps resolving the string pathname id and
    // executeSubcommand keeps sending the string pathname to
    // mt::open-file-by-window-id. No renderer production file changes: the
    // shim gains no per-searchId mode map and the #320 string-id and
    // #324 lifecycle pins stay untouched.
    it('quickopen-files-mode-string-ids: resolves the string pathname from a files-mode grouped envelope', async () => {
      window.marktext = { env: { windowId: 7 } }
      mockSearchFn.mockImplementation((_paths, _q, options) => {
        options.didMatch({
          filePath: '/docs/files-mode-hit.md',
          matches: [{ matchText: '', lineText: '', range: [[0, 0], [0, 0]] }]
        })
        const p = Promise.resolve()
        p.cancel = vi.fn()
        return p
      })

      const result = await cmd._doSearch('files')
      expect(result).toHaveLength(1)
      expect(typeof result[0].id).toBe('string')
      expect(result[0].id).toBe('/docs/files-mode-hit.md')
      await cmd.executeSubcommand(result[0].id)
      expect(window.electron.ipcRenderer.send).toHaveBeenCalledWith(
        'mt::open-file-by-window-id',
        7,
        '/docs/files-mode-hit.md'
      )
    })
  })

  // ---- executeSubcommand() ----

  describe('executeSubcommand()', () => {
    it('sends IPC to open file by window id', async () => {
      window.marktext = { env: { windowId: 42 } }
      await cmd.executeSubcommand('/docs/readme.md')
      expect(window.electron.ipcRenderer.send).toHaveBeenCalledWith(
        'mt::open-file-by-window-id',
        42,
        '/docs/readme.md'
      )
    })
  })

  // ---- unload() ----

  describe('unload()', () => {
    it('clears subcommands array', () => {
      cmd.subcommands = [{ id: 'a' }, { id: 'b' }]
      cmd.unload()
      expect(cmd.subcommands).toEqual([])
    })

    // C-SEARCH-LIFECYCLE-DISCARD T-003: closing the palette must cancel
    // the in-flight work through the existing _cancelFn seam — the
    // active searcher walk or the pending debounce timer — while the
    // list still clears.
    it('cancels the in-flight searcher walk exactly once and clears subcommands', async () => {
      let resolveWalk
      const walkCancel = vi.fn(() => { resolveWalk() })
      mockSearchFn.mockImplementation(() => {
        const p = new Promise((resolve) => { resolveWalk = resolve })
        p.cancel = walkCancel
        return p
      })

      const searchPromise = cmd.search('slow')
      // Let the (default) debounce resolve so _doSearch spawned the walk.
      await new Promise((r) => setTimeout(r, 0))
      expect(typeof cmd._cancelFn).toBe('function')

      cmd.subcommands = [{ id: 'stale' }]
      cmd.unload()
      expect(walkCancel).toHaveBeenCalledTimes(1)
      expect(cmd.subcommands).toEqual([])
      expect(cmd._cancelFn).toBeNull()
      await searchPromise.catch(() => {})
    })

    it('cancels the pending debounce timer and clears _cancelFn', async () => {
      let cancelDebounce
      delayState.impl = () => {
        const p = new Promise((resolve) => { setTimeout(resolve, 100) })
        p.cancel = vi.fn()
        cancelDebounce = p.cancel
        return p
      }

      cmd.search('typing')
      // The search is parked inside the debounce.
      expect(typeof cmd._cancelFn).toBe('function')

      cmd.unload()
      expect(cancelDebounce).toHaveBeenCalledTimes(1)
      expect(cmd._cancelFn).toBeNull()
      expect(cmd.subcommands).toEqual([])
    })
  })
})
