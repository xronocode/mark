/**
 * Tests for src/renderer/src/spellchecker/index.js
 *
 * Covers: SpellChecker class — constructor, isEnabled, activateSpellchecker,
 * deactivateSpellchecker, lang getter/setter, switchLanguage,
 * getAvailableDictionaries.
 */

import { invoke } from '@tauri-apps/api/core'

// Need to control isOsx per test
const { mockState } = vi.hoisted(() => ({ mockState: { isOsx: false } }))
vi.mock('@/util', () => ({
  get isOsx() { return mockState.isOsx },
  isWindows: false,
  isLinux: true
}))

import { SpellChecker } from '@/spellchecker/index'

describe('SpellChecker', () => {
  beforeEach(() => {
    mockState.isOsx = false
    vi.mocked(invoke).mockReset()
    vi.mocked(invoke).mockResolvedValue(undefined)
  })

  describe('constructor', () => {
    it('sets enabled and lang from params', () => {
      const sc = new SpellChecker(true, 'en-US')
      expect(sc.enabled).toBe(true)
      expect(sc.currentSpellcheckerLanguage).toBe('en-US')
      expect(sc.isProviderAvailable).toBe(true)
    })

    it('defaults enabled to true', () => {
      const sc = new SpellChecker()
      expect(sc.enabled).toBe(true)
    })

    it('defaults lang to undefined', () => {
      const sc = new SpellChecker()
      expect(sc.currentSpellcheckerLanguage).toBeUndefined()
    })
  })

  describe('isEnabled', () => {
    it('returns true when provider available and enabled', () => {
      const sc = new SpellChecker(true, 'en-US')
      expect(sc.isEnabled).toBe(true)
    })

    it('returns false when disabled', () => {
      const sc = new SpellChecker(false, 'en-US')
      expect(sc.isEnabled).toBe(false)
    })

    it('returns false when provider not available', () => {
      const sc = new SpellChecker(true, 'en-US')
      sc.isProviderAvailable = false
      expect(sc.isEnabled).toBe(false)
    })
  })

  describe('lang getter', () => {
    it('returns language when enabled', () => {
      const sc = new SpellChecker(true, 'en-US')
      expect(sc.lang).toBe('en-US')
    })

    it('returns empty string when disabled', () => {
      const sc = new SpellChecker(false, 'en-US')
      expect(sc.lang).toBe('')
    })
  })

  describe('lang setter', () => {
    it('sets currentSpellcheckerLanguage', () => {
      const sc = new SpellChecker(true, 'en-US')
      sc.lang = 'fr-FR'
      expect(sc.currentSpellcheckerLanguage).toBe('fr-FR')
    })
  })

  describe('activateSpellchecker', () => {
    it('enables spell checker on macOS via invoke', async () => {
      mockState.isOsx = true
      const sc = new SpellChecker(false, 'en-US')

      const result = await sc.activateSpellchecker('en-US')

      expect(result).toBe(true)
      expect(sc.enabled).toBe(true)
      expect(invoke).toHaveBeenCalledWith('mt_spell_set_enabled', { enabled: true })
    })

    it('calls switchLanguage on non-macOS', async () => {
      mockState.isOsx = false
      const sc = new SpellChecker(false, 'en-US')
      vi.mocked(invoke).mockResolvedValue(undefined)

      const result = await sc.activateSpellchecker('de-DE')

      expect(result).toBe(true)
      expect(sc.enabled).toBe(true)
    })

    it('uses current language when no lang param on non-macOS', async () => {
      mockState.isOsx = false
      const sc = new SpellChecker(false, 'fr-FR')
      vi.mocked(invoke).mockResolvedValue(undefined)

      await sc.activateSpellchecker()

      expect(invoke).toHaveBeenCalledWith('mt_spell_set_lang', { lang: 'fr-FR' })
    })

    it('deactivates on error and rethrows', async () => {
      mockState.isOsx = true
      const sc = new SpellChecker(false, 'en-US')
      vi.mocked(invoke).mockRejectedValueOnce(new Error('fail'))

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      await expect(sc.activateSpellchecker('en-US')).rejects.toThrow('fail')
      expect(sc.enabled).toBe(false)
      expect(sc.isProviderAvailable).toBe(false)

      warnSpy.mockRestore()
    })
  })

  describe('deactivateSpellchecker', () => {
    it('sets enabled and isProviderAvailable to false', () => {
      const sc = new SpellChecker(true, 'en-US')

      sc.deactivateSpellchecker()

      expect(sc.enabled).toBe(false)
      expect(sc.isProviderAvailable).toBe(false)
    })

    it('calls invoke with enabled: false', () => {
      const sc = new SpellChecker(true, 'en-US')

      sc.deactivateSpellchecker()

      expect(invoke).toHaveBeenCalledWith('mt_spell_set_enabled', { enabled: false })
    })

    it('handles invoke failure gracefully', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      vi.mocked(invoke).mockRejectedValueOnce(new Error('fail'))

      const sc = new SpellChecker(true, 'en-US')
      expect(() => sc.deactivateSpellchecker()).not.toThrow()

      warnSpy.mockRestore()
    })
  })

  describe('switchLanguage', () => {
    it('returns true on macOS without calling invoke', async () => {
      mockState.isOsx = true
      const sc = new SpellChecker(true, 'en-US')

      const result = await sc.switchLanguage('de-DE')
      expect(result).toBe(true)
    })

    it('throws for empty language on non-macOS', async () => {
      mockState.isOsx = false
      const sc = new SpellChecker(true, 'en-US')

      await expect(sc.switchLanguage('')).rejects.toThrow(
        'Expected non-empty language'
      )
    })

    it('throws for null/undefined language on non-macOS', async () => {
      mockState.isOsx = false
      const sc = new SpellChecker(true, 'en-US')

      await expect(sc.switchLanguage(null)).rejects.toThrow()
    })

    it('calls invoke and sets lang on success', async () => {
      mockState.isOsx = false
      const sc = new SpellChecker(true, 'en-US')

      const result = await sc.switchLanguage('de-DE')

      expect(result).toBe(true)
      expect(invoke).toHaveBeenCalledWith('mt_spell_set_lang', { lang: 'de-DE' })
      expect(sc.currentSpellcheckerLanguage).toBe('de-DE')
    })

    it('returns false when not enabled', async () => {
      mockState.isOsx = false
      const sc = new SpellChecker(false, 'en-US')

      const result = await sc.switchLanguage('de-DE')
      expect(result).toBe(false)
    })
  })

  describe('getAvailableDictionaries', () => {
    it('returns empty array on macOS', async () => {
      mockState.isOsx = true
      const result = await SpellChecker.getAvailableDictionaries()
      expect(result).toEqual([])
    })

    it('calls invoke on non-macOS', async () => {
      mockState.isOsx = false
      vi.mocked(invoke).mockResolvedValueOnce(['en-US', 'de-DE'])

      const result = await SpellChecker.getAvailableDictionaries()
      expect(result).toEqual(['en-US', 'de-DE'])
    })

    it('returns empty array on invoke failure', async () => {
      mockState.isOsx = false
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      vi.mocked(invoke).mockRejectedValueOnce(new Error('not implemented'))

      const result = await SpellChecker.getAvailableDictionaries()
      expect(result).toEqual([])

      warnSpy.mockRestore()
    })
  })
})
