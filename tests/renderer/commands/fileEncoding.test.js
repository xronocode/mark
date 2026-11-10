import { delay } from '@/util'
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
  delay: vi.fn(() => Promise.resolve()),
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
      CAN_CHANGE_DOCUMENT_FORMAT: vi.fn(() => true),
      _notifyFormatError: vi.fn(),
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

    const current = cmd.subcommands.find((s) => s.description.includes('- t:fileFormat.current'))
    expect(current).toBeDefined()
    expect(current.id).toBe('utf8')
  })

  it('run highlights current encoding as first entry', async () => {
    await cmd.run()

    expect(cmd.subcommandSelectedIndex).toBeGreaterThanOrEqual(0)
    const selected = cmd.subcommands[cmd.subcommandSelectedIndex]
    expect(selected.description).toContain('- t:fileFormat.current')
  })

  it('run handles BOM encoding', async () => {
    editorState.currentFile.encoding = { encoding: 'utf8', isBom: true }

    await cmd.run()

    expect(cmd.subcommandSelectedIndex).toBe(0)
    expect(cmd.subcommands[0].id).toBe('utf8-bom')
    expect(cmd.subcommands[0].description).toContain('- t:fileFormat.current')
  })

  it('execute emits show-command-palette after delay', async () => {
    await cmd.execute()
    expect(bus.emit).toHaveBeenCalledWith('show-command-palette', cmd)
  })

  it('executeSubcommand emits mt::set-file-encoding for non-BOM', async () => {
    await cmd.executeSubcommand('utf8')
    expect(bus.emit).toHaveBeenCalledWith('mt::set-file-encoding', { encoding: 'utf8', isBom: false })
  })

  it('executeSubcommand applies an explicit Unicode BOM policy', async () => {
    vi.mocked(bus.emit).mockClear()
    await cmd.executeSubcommand('utf8-bom')
    expect(bus.emit).toHaveBeenCalledWith('mt::set-file-encoding', { encoding: 'utf8', isBom: true })
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
  it('refuses an active composition before delay, palette or dispatch', async () => {
    editorState.CAN_CHANGE_DOCUMENT_FORMAT.mockReturnValue(false)
    vi.mocked(bus.emit).mockClear(); vi.mocked(delay).mockClear()
    await cmd.run(); await cmd.execute(); await cmd.executeSubcommand('utf8', 'crlf')
    expect(delay).not.toHaveBeenCalled(); expect(bus.emit).not.toHaveBeenCalled()
  })

  it('offers explicit Unicode BOM policies and explains unavailable codecs without an action', async () => {
    await cmd.run()
    expect(cmd.subcommands.find(item => item.id === 'utf16le-bom').value).toEqual({ encoding: 'utf16le', isBom: true })
    expect(cmd.subcommands.find(item => item.id === 'utf16le').value).toEqual({ encoding: 'utf16le', isBom: false })
    const unavailable = cmd.subcommands.find(item => item.id === 'gb2312')
    expect(unavailable.disabled).toBe(true); expect(unavailable.description).toContain('fileFormat.unavailable.gb2312')
    vi.mocked(bus.emit).mockClear(); await cmd.executeSubcommand('gb2312')
    expect(bus.emit).not.toHaveBeenCalled()
  })

})
