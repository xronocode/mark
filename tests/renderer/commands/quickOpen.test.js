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
