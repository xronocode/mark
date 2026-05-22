/**
 * Tests for src/renderer/src/commands/trailingNewline.js
 *
 * Covers: TrailingNewlineCommand class — constructor, run with
 * different trimTrailingNewline values, execute, executeSubcommand, unload.
 */

vi.mock('@/i18n', () => ({
  t: (key) => `t:${key}`
}))

vi.mock('@/bus', () => ({
  default: { emit: vi.fn(), on: vi.fn(), off: vi.fn() }
}))

vi.mock('@/util', () => ({
  delay: () => Promise.resolve(),
  isOsx: false,
  isWindows: false,
  isLinux: true
}))

import TrailingNewlineCommand from '@/commands/trailingNewline'
import bus from '@/bus'

describe('TrailingNewlineCommand', () => {
  let cmd
  let editorState

  beforeEach(() => {
    editorState = {
      currentFile: {
        trimTrailingNewline: 0
      }
    }
    cmd = new TrailingNewlineCommand(editorState)
  })

  it('has correct id', () => {
    expect(cmd.id).toBe('file.trailing-newline')
  })

  it('has placeholder from i18n', () => {
    expect(cmd.placeholder).toBe('t:commandPalette.placeholders.selectOption')
  })

  it('run with trimTrailingNewline=0 highlights trim option', async () => {
    editorState.currentFile.trimTrailingNewline = 0
    await cmd.run()

    expect(cmd.subcommandSelectedIndex).toBe(0)
    expect(cmd.subcommands[0].description).toContain('- current')
  })

  it('run with trimTrailingNewline=1 highlights single newline option', async () => {
    editorState.currentFile.trimTrailingNewline = 1
    await cmd.run()

    expect(cmd.subcommandSelectedIndex).toBe(1)
    expect(cmd.subcommands[1].description).toContain('- current')
  })

  it('run with trimTrailingNewline=3 highlights disabled option', async () => {
    editorState.currentFile.trimTrailingNewline = 3
    await cmd.run()

    expect(cmd.subcommandSelectedIndex).toBe(2)
    expect(cmd.subcommands[2].description).toContain('- current')
  })

  it('run with undefined trimTrailingNewline defaults to disabled (index 2)', async () => {
    editorState.currentFile.trimTrailingNewline = undefined
    await cmd.run()

    expect(cmd.subcommandSelectedIndex).toBe(2)
  })

  it('run populates 3 subcommands', async () => {
    await cmd.run()
    expect(cmd.subcommands).toHaveLength(3)
    expect(cmd.subcommands[0].value).toBe(0)
    expect(cmd.subcommands[1].value).toBe(1)
    expect(cmd.subcommands[2].value).toBe(3)
  })

  it('execute emits show-command-palette after delay', async () => {
    await cmd.execute()
    expect(bus.emit).toHaveBeenCalledWith('show-command-palette', cmd)
  })

  it('executeSubcommand emits mt::set-final-newline with value', async () => {
    await cmd.executeSubcommand(null, 1)
    expect(bus.emit).toHaveBeenCalledWith('mt::set-final-newline', 1)
  })

  it('unload is callable without error', () => {
    expect(() => cmd.unload()).not.toThrow()
  })
})
