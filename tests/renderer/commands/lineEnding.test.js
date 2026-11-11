import { delay } from '@/util'
/**
 * Tests for src/renderer/src/commands/lineEnding.js
 *
 * Covers: LineEndingCommand class — constructor, run, execute,
 * executeSubcommand, unload.
 */

vi.mock('@/i18n', () => ({
  t: (key) => `t:${key}`
}))

vi.mock('@/bus', () => ({
  default: { emit: vi.fn(), on: vi.fn(), off: vi.fn() }
}))

vi.mock('@/util', () => ({
  delay: vi.fn(() => Promise.resolve()),
  isOsx: false,
  isWindows: false,
  isLinux: true
}))

import LineEndingCommand from '@/commands/lineEnding'
import bus from '@/bus'

describe('LineEndingCommand', () => {
  let cmd
  let editorState

  beforeEach(() => {
    editorState = {
      CAN_CHANGE_DOCUMENT_FORMAT: vi.fn(() => true),
      _notifyFormatError: vi.fn(),
      currentFile: {
        lineEnding: 'lf'
      }
    }
    cmd = new LineEndingCommand(editorState)
  })

  it('has correct id', () => {
    expect(cmd.id).toBe('file.line-ending')
  })

  it('has placeholder from i18n', () => {
    expect(cmd.placeholder).toBe('t:commandPalette.placeholders.selectOption')
  })

  it('initializes with crlf and lf subcommands', () => {
    expect(cmd.subcommands).toHaveLength(2)
    expect(cmd.subcommands[0].value).toBe('crlf')
    expect(cmd.subcommands[1].value).toBe('lf')
  })

  it('run highlights lf when currentFile lineEnding is lf', async () => {
    await cmd.run()

    expect(cmd.subcommandSelectedIndex).toBe(1)
    expect(cmd.subcommands[1].description).toContain('- current')
    expect(cmd.subcommands[0].description).not.toContain('- current')
  })

  it('run highlights crlf when currentFile lineEnding is crlf', async () => {
    editorState.currentFile.lineEnding = 'crlf'
    await cmd.run()

    expect(cmd.subcommandSelectedIndex).toBe(0)
    expect(cmd.subcommands[0].description).toContain('- current')
    expect(cmd.subcommands[1].description).not.toContain('- current')
  })

  it('execute emits show-command-palette after delay', async () => {
    await cmd.execute()
    expect(bus.emit).toHaveBeenCalledWith('show-command-palette', cmd)
  })

  it('executeSubcommand emits mt::set-line-ending with value', async () => {
    await cmd.executeSubcommand(null, 'crlf')
    expect(bus.emit).toHaveBeenCalledWith('mt::set-line-ending', 'crlf')
  })

  it('unload is callable', () => {
    expect(() => cmd.unload()).not.toThrow()
  })
  it('refuses an active composition before delay, palette or dispatch', async () => {
    editorState.CAN_CHANGE_DOCUMENT_FORMAT.mockReturnValue(false)
    vi.mocked(bus.emit).mockClear(); vi.mocked(delay).mockClear()
    await cmd.run(); await cmd.execute(); await cmd.executeSubcommand('utf8', 'crlf')
    expect(delay).not.toHaveBeenCalled(); expect(bus.emit).not.toHaveBeenCalled()
  })

  it('shows no implicit LF choice for mixed source and allows only an explicit supported choice', async () => {
    editorState.currentFile.isMixedLineEndings = true
    await cmd.run()
    expect(cmd.subcommandSelectedIndex).toBe(-1)
    expect(cmd.subcommands.every(item => !item.description.includes(' - current'))).toBe(true)
    await cmd.executeSubcommand('file.line-ending-lf', 'lf')
    expect(bus.emit).toHaveBeenCalledWith('mt::set-line-ending', 'lf')
  })

})
