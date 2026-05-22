/**
 * Tests for src/renderer/src/commands/spellcheckerLanguage.js
 *
 * Covers: SpellcheckerLanguageCommand class — constructor, run,
 * execute, executeSubcommand, unload.
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

vi.mock('@/services/notification', () => ({
  default: { notify: vi.fn() }
}))

vi.mock('@/spellchecker', () => ({
  SpellChecker: {
    getAvailableDictionaries: vi.fn(async () => ['en-US', 'fr-FR', 'de-DE'])
  }
}))

vi.mock('@/spellchecker/languageMap', () => ({
  getLanguageName: (code) => `Language:${code}`
}))

import SpellcheckerLanguageCommand from '@/commands/spellcheckerLanguage'
import bus from '@/bus'
import notice from '@/services/notification'

describe('SpellcheckerLanguageCommand', () => {
  let cmd
  let spellchecker

  beforeEach(() => {
    spellchecker = {
      isEnabled: true,
      lang: 'en-US'
    }
    cmd = new SpellcheckerLanguageCommand(spellchecker)
  })

  it('has correct id', () => {
    expect(cmd.id).toBe('spellchecker.switch-language')
  })

  it('has placeholder from i18n', () => {
    expect(cmd.placeholder).toBe('t:commandPalette.placeholders.selectLanguage')
  })

  it('run populates subcommands from available dictionaries', async () => {
    await cmd.run()

    expect(cmd.subcommands).toHaveLength(3)
    expect(cmd.subcommands[0].value).toBe('en-US')
    expect(cmd.subcommands[1].value).toBe('fr-FR')
    expect(cmd.subcommands[2].value).toBe('de-DE')
  })

  it('run sets descriptions using getLanguageName', async () => {
    await cmd.run()
    expect(cmd.subcommands[0].description).toBe('Language:en-US')
  })

  it('run highlights current language', async () => {
    await cmd.run()

    expect(cmd.subcommandSelectedIndex).toBe(0)
  })

  it('run defaults to en-US when no dicts available', async () => {
    const { SpellChecker } = await import('@/spellchecker')
    SpellChecker.getAvailableDictionaries.mockResolvedValueOnce([])

    await cmd.run()

    expect(cmd.subcommands).toHaveLength(1)
    expect(cmd.subcommands[0].value).toBe('en-US')
  })

  it('execute emits show-command-palette after delay', async () => {
    await cmd.execute()
    expect(bus.emit).toHaveBeenCalledWith('show-command-palette', cmd)
  })

  it('executeSubcommand emits switch-spellchecker-language when enabled', async () => {
    await cmd.run()
    await cmd.executeSubcommand(cmd.subcommands[1].id)

    expect(bus.emit).toHaveBeenCalledWith('switch-spellchecker-language', 'fr-FR')
  })

  it('executeSubcommand shows notification when spellchecker is disabled', async () => {
    spellchecker.isEnabled = false
    await cmd.run()
    await cmd.executeSubcommand(cmd.subcommands[0].id)

    expect(notice.notify).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Spelling',
        type: 'warning'
      })
    )
  })

  it('unload clears subcommands', () => {
    cmd.subcommands = [{ id: 'test' }]
    cmd.unload()
    expect(cmd.subcommands).toEqual([])
  })
})
