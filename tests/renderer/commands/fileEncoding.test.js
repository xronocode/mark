/**
 * Tests for src/renderer/src/commands/fileEncoding.js
 *
 * Covers: FileEncodingCommand class — run, execute, executeSubcommand, unload.
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

import FileEncodingCommand from '@/commands/fileEncoding'
import bus from '@/bus'

describe('FileEncodingCommand', () => {
  let cmd
  let editorState

  beforeEach(() => {
    editorState = {
      currentFile: {
        encoding: { encoding: 'utf8', isBom: false }
      }
    }
    cmd = new FileEncodingCommand(editorState)
  })

  it('has correct id and description', () => {
    expect(cmd.id).toBe('file.change-encoding')
    expect(cmd.description).toBeDefined()
  })

  it('has placeholder from i18n', () => {
    expect(cmd.placeholder).toBe('t:commandPalette.placeholders.selectOption')
  })

  it('run populates subcommands from ENCODING_NAME_MAP', async () => {
    await cmd.run()
    expect(cmd.subcommands.length).toBeGreaterThan(0)
  })

  it('run highlights current encoding (non-BOM)', async () => {
    await cmd.run()

    const current = cmd.subcommands.find((s) => s.description.includes('- current'))
    expect(current).toBeDefined()
    expect(current.id).toBe('utf8')
  })

  it('run highlights current encoding as first entry', async () => {
    await cmd.run()

    expect(cmd.subcommandSelectedIndex).toBeGreaterThanOrEqual(0)
    const selected = cmd.subcommands[cmd.subcommandSelectedIndex]
    expect(selected.description).toContain('- current')
  })

  it('run handles BOM encoding', async () => {
    editorState.currentFile.encoding = { encoding: 'utf8', isBom: true }

    await cmd.run()

    expect(cmd.subcommandSelectedIndex).toBe(0)
    expect(cmd.subcommands[0].id).toBe('utf8-bom')
    expect(cmd.subcommands[0].description).toContain('- current')
  })

  it('execute emits show-command-palette after delay', async () => {
    await cmd.execute()
    expect(bus.emit).toHaveBeenCalledWith('show-command-palette', cmd)
  })

  it('executeSubcommand emits mt::set-file-encoding for non-BOM', async () => {
    await cmd.executeSubcommand('utf8')
    expect(bus.emit).toHaveBeenCalledWith('mt::set-file-encoding', 'utf8')
  })

  it('executeSubcommand ignores BOM encodings', async () => {
    vi.mocked(bus.emit).mockClear()
    await cmd.executeSubcommand('utf8-bom')
    expect(bus.emit).not.toHaveBeenCalledWith('mt::set-file-encoding', expect.anything())
  })

  it('unload clears subcommands', () => {
    cmd.subcommands = [{ id: 'test' }]
    cmd.unload()
    expect(cmd.subcommands).toEqual([])
  })

  it('_getCurrentEncoding returns encoding from currentFile', () => {
    const enc = cmd._getCurrentEncoding()
    expect(enc).toEqual({ encoding: 'utf8', isBom: false })
  })

  it('_getCurrentEncoding returns empty object when no currentFile', () => {
    editorState.currentFile = null
    const enc = cmd._getCurrentEncoding()
    expect(enc).toEqual({})
  })
})
