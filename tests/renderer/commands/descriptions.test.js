/**
 * Tests for src/renderer/src/commands/descriptions.js
 *
 * Covers: getCommandDescriptionById default export — i18n lookup
 * for known command IDs, fallback to raw ID for unknown ones.
 */

vi.mock('@/i18n', () => ({
  t: vi.fn((key) => `translated:${key}`)
}))

import getDescription from '@/commands/descriptions'

describe('getCommandDescriptionById', () => {
  it('returns translated string for known command ID', () => {
    const result = getDescription('file.save')
    expect(result).toBe('translated:commands.file.save')
  })

  it('returns translated string for edit commands', () => {
    expect(getDescription('edit.undo')).toBe('translated:commands.edit.undo')
    expect(getDescription('edit.redo')).toBe('translated:commands.edit.redo')
    expect(getDescription('edit.copy')).toBe('translated:commands.edit.copy')
    expect(getDescription('edit.paste')).toBe('translated:commands.edit.paste')
  })

  it('returns translated string for paragraph commands', () => {
    expect(getDescription('paragraph.heading-1')).toBe('translated:commands.paragraph.heading1')
    expect(getDescription('paragraph.table')).toBe('translated:commands.paragraph.table')
  })

  it('returns translated string for format commands', () => {
    expect(getDescription('format.strong')).toBe('translated:commands.format.strong')
    expect(getDescription('format.emphasis')).toBe('translated:commands.format.emphasis')
  })

  it('returns translated string for window commands', () => {
    expect(getDescription('window.minimize')).toBe('translated:commands.window.minimize')
  })

  it('returns translated string for view commands', () => {
    expect(getDescription('view.toggle-sidebar')).toBe('translated:commands.view.toggleSidebar')
  })

  it('returns translated string for tab commands', () => {
    expect(getDescription('tabs.cycleForward')).toBe('translated:commands.tabs.cycleForward')
  })

  it('returns translated string for docs commands', () => {
    expect(getDescription('docs.user-guide')).toBe('translated:commands.docs.userGuide')
  })

  it('returns translated string for spellchecker command', () => {
    expect(getDescription('spellchecker.switch-language')).toBe(
      'translated:commands.spellchecker.switchLanguage'
    )
  })

  it('returns translated string for mt commands', () => {
    expect(getDescription('mt.hide')).toBe('translated:commands.mt.hide')
  })

  it('returns the raw ID for unknown command IDs', () => {
    expect(getDescription('unknown.command')).toBe('unknown.command')
  })

  it('returns raw ID for empty string', () => {
    expect(getDescription('')).toBe('')
  })

  it('handles all file operation commands', () => {
    const fileCommands = [
      'file.new-window', 'file.new-tab', 'file.open-file', 'file.open-folder',
      'file.quick-open', 'file.import-file', 'file.save', 'file.save-as',
      'file.export-file', 'file.move-file', 'file.rename-file',
      'file.toggle-auto-save', 'file.change-encoding', 'file.line-ending',
      'file.trailing-newline', 'file.preferences', 'file.print', 'file.zoom',
      'file.check-update', 'file.close', 'file.close-tab', 'file.close-window',
      'file.quit'
    ]
    for (const cmd of fileCommands) {
      const result = getDescription(cmd)
      expect(result).not.toBe(cmd) // all should be translated
    }
  })
})
