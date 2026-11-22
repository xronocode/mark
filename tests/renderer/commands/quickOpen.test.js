/**
 * Tests for src/renderer/src/commands/quickOpen.js
 *
 * Covers: QuickOpenCommand class — constructor, run, search, execute,
 * executeSubcommand, unload, _getInclusions, _getPath.
 */

vi.mock('@/i18n', () => ({
  t: (key) => `t:${key}`
}))

vi.mock('@/bus', () => ({
  default: { emit: vi.fn(), on: vi.fn(), off: vi.fn() }
}))

vi.mock('@/util', () => ({
  delay: () => {
    const p = Promise.resolve()
    p.cancel = () => {}
    return p
  },
  isOsx: false,
  isWindows: false,
  isLinux: true
}))

vi.mock('@/node/fileSearcher', () => {
  return {
    default: class {
      search() {
        const p = Promise.resolve()
        p.cancel = () => {}
        return p
      }
    }
  }
})

import QuickOpenCommand from '@/commands/quickOpen'
import bus from '@/bus'

describe('QuickOpenCommand', () => {
  let cmd
  let rootState

  beforeEach(() => {
    rootState = {
      editor: {
        tabs: [
          { pathname: '/docs/a.md' },
          { pathname: '/docs/b.md' },
          { pathname: null }
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

  it('has correct id', () => {
    expect(cmd.id).toBe('file.quick-open')
  })

  it('has placeholder from i18n', () => {
    expect(cmd.placeholder).toBe('t:commandPalette.placeholders.searchFileToOpen')
  })

  it('run populates subcommands from tabs with pathnames', async () => {
    await cmd.run()
    expect(cmd.subcommands).toHaveLength(2)
    expect(cmd.subcommands[0].id).toBe('/docs/a.md')
    expect(cmd.subcommands[1].id).toBe('/docs/b.md')
  })

  it('run throws when no project tree and no tabs', async () => {
    rootState.project.projectTree = null
    rootState.editor.tabs = []
    cmd = new QuickOpenCommand(rootState)

    await expect(cmd.run()).rejects.toThrow()
  })

  it('search returns subcommands when query is empty', async () => {
    cmd.subcommands = [{ id: 'test' }]
    const result = await cmd.search('')
    expect(result).toEqual([{ id: 'test' }])
  })

  it('execute emits show-command-palette', async () => {
    await cmd.execute()
    expect(bus.emit).toHaveBeenCalledWith('show-command-palette', cmd)
  })

  it('executeSubcommand sends IPC to open file', async () => {
    window.marktext = { env: { windowId: 1 } }
    await cmd.executeSubcommand('/docs/a.md')
    expect(window.electron.ipcRenderer.send).toHaveBeenCalledWith(
      'mt::open-file-by-window-id',
      1,
      '/docs/a.md'
    )
  })

  it('unload clears subcommands', () => {
    cmd.subcommands = [{ id: 'test' }]
    cmd.unload()
    expect(cmd.subcommands).toEqual([])
  })

  it('_getInclusions returns markdown-suffixed globs for non-md query', () => {
    const result = cmd._getInclusions('foo')
    expect(result.length).toBe(2)
    expect(result[0]).toContain('foo')
  })

  it('_getInclusions returns single glob for query with markdown extension', () => {
    window.fileUtils.hasMarkdownExtension = vi.fn(() => true)
    const result = cmd._getInclusions('readme.md')
    expect(result).toEqual(['*readme.md'])
  })

  it('_getPath returns relative path for child of project root', () => {
    window.path.relative = vi.fn(() => 'a.md')
    const result = cmd._getPath('/docs/a.md')
    expect(result.description).toBe('a.md')
  })

  it('_getPath returns full path for file outside project root', () => {
    window.fileUtils.isChildOfDirectory = vi.fn(() => false)
    const result = cmd._getPath('/other/file.md')
    expect(result.description).toBe('/other/file.md')
    expect(result.title).toBe('/other/file.md')
  })

  it('_getPath adds title for long relative paths', () => {
    window.path.relative = vi.fn(() => 'a'.repeat(60) + '.md')
    const result = cmd._getPath('/docs/' + 'a'.repeat(60) + '.md')
    expect(result.title).toBeDefined()
  })
})

// ── C-SEARCH-RESULT-CONTRACT: quickopen-string-ids ──────────────────
// Today's window-shim content-spawn delivers didMatch the GROUPED
// envelope ({ filePath, matches }) rows; pushed raw, id becomes an
// object and no disk result can be opened. The consumer must normalize
// the envelope back to string pathnames where didMatch receives it.
describe('quickopen-string-ids (C-SEARCH-RESULT-CONTRACT)', () => {
  let cmd
  let rootState

  beforeEach(() => {
    rootState = {
      editor: { tabs: [] },
      project: { projectTree: { pathname: '/docs' } }
    }
    window.fileUtils.hasMarkdownExtension = vi.fn(() => false)
    window.fileUtils.isChildOfDirectory = vi.fn(
      (parent, child) => typeof child === 'string' && child.startsWith(parent + '/')
    )
    window.fileUtils.MARKDOWN_INCLUSIONS = ['*.md']
    window.path.relative = vi.fn((from, to) => to.slice(from.length + 1))
    cmd = new QuickOpenCommand(rootState)
  })

  const shimFeed = (options) => {
    options.didMatch({
      filePath: '/docs/found-a.md',
      matches: [{ lineText: 'needle here', range: [[0, 6], [0, 12]] }]
    })
    options.didMatch({
      filePath: '/docs/sub/found-b.md',
      matches: [{ lineText: 'other needle' }]
    })
    const p = Promise.resolve()
    p.cancel = vi.fn()
    return p
  }

  it('normalizes the shim-shaped grouped envelope so every id is a pathname string', async () => {
    const getPathCalls = []
    window.path.relative = vi.fn((from, to) => {
      getPathCalls.push(to)
      return to.slice(from.length + 1)
    })
    cmd._directorySearcher.search = vi.fn((_paths, _q, options) => shimFeed(options))

    const result = await cmd._doSearch('found')
    expect(result.length).toBe(2)
    for (const item of result) {
      expect(typeof item.id).toBe('string')
      expect(item.id.startsWith('/docs/')).toBe(true)
    }
    expect(result.map((i) => i.id)).toEqual(['/docs/found-a.md', '/docs/sub/found-b.md'])
    // isChildOfDirectory and window.path.relative keep their string contracts.
    for (const p of getPathCalls) expect(typeof p).toBe('string')
    for (const call of window.fileUtils.isChildOfDirectory.mock.calls) {
      expect(typeof call[1]).toBe('string')
    }
  })

  it('executeSubcommand sends the string pathname to mt::open-file-by-window-id', async () => {
    window.marktext = { env: { windowId: 7 } }
    cmd._directorySearcher.search = vi.fn((_paths, _q, options) => shimFeed(options))

    const result = await cmd._doSearch('found')
    await cmd.executeSubcommand(result[0].id)
    expect(window.electron.ipcRenderer.send).toHaveBeenCalledWith(
      'mt::open-file-by-window-id',
      7,
      '/docs/found-a.md'
    )
  })

  it('keeps plain-string didMatch deliveries working (today\'s searcher shape)', async () => {
    cmd._directorySearcher.search = vi.fn((_paths, _q, options) => {
      options.didMatch('/docs/string-path.md')
      const p = Promise.resolve()
      p.cancel = vi.fn()
      return p
    })
    const result = await cmd._doSearch('string')
    expect(result.map((i) => i.id)).toEqual(['/docs/string-path.md'])
  })

  it('drops non-string shapes without a string filePath', async () => {
    cmd._directorySearcher.search = vi.fn((_paths, _q, options) => {
      options.didMatch(42)
      options.didMatch(null)
      options.didMatch({ matches: [] })
      options.didMatch({ filePath: '/docs/kept.md', matches: [] })
      const p = Promise.resolve()
      p.cancel = vi.fn()
      return p
    })
    const result = await cmd._doSearch('kept')
    expect(result.map((i) => i.id)).toEqual(['/docs/kept.md'])
  })
})
