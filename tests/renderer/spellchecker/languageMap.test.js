/**
 * Tests for src/renderer/src/spellchecker/languageMap.js
 *
 * Covers: getLanguageName — ISO code lookups, Hunspell dictionary
 * lookups, fallback behavior.
 */

vi.mock('iso-639-1', () => ({
  default: {
    getNativeName: vi.fn((code) => {
      const map = {
        en: 'English',
        fr: 'Francais',
        de: 'Deutsch',
        ru: 'Русский'
      }
      return map[code] || ''
    })
  }
}))

import { getLanguageName } from '@/spellchecker/languageMap'

describe('getLanguageName', () => {
  it('returns null for empty string', () => {
    expect(getLanguageName('')).toBeNull()
  })

  it('returns null for null', () => {
    expect(getLanguageName(null)).toBeNull()
  })

  it('returns null for undefined', () => {
    expect(getLanguageName(undefined)).toBeNull()
  })

  it('returns null for single character', () => {
    expect(getLanguageName('e')).toBeNull()
  })

  it('returns native name with code for 2-letter code', () => {
    const result = getLanguageName('en')
    expect(result).toBe('English (en)')
  })

  it('returns native name with code for 4-letter code (e.g. en-US)', () => {
    // First tries Hunspell (5 chars), falls back to 2-letter lookup
    const result = getLanguageName('en-US')
    // en-US is in HUNSPELL map, so returns that label
    expect(result).toBe('English (en-US)')
  })

  it('returns native name for fr', () => {
    const result = getLanguageName('fr')
    expect(result).toBe('Francais (fr)')
  })

  it('returns Unknown for unrecognized language code', () => {
    const result = getLanguageName('xx')
    expect(result).toBe('Unknown (xx)')
  })

  it('handles longer codes by truncating to 2 chars for lookup', () => {
    const result = getLanguageName('de-AT')
    // de-AT not in Hunspell, falls back to "de" → "Deutsch"
    expect(result).toBe('Deutsch (de-AT)')
  })

  it('returns Unknown for unrecognized 5-char code with no ISO match', () => {
    const result = getLanguageName('xx-YY')
    expect(result).toBe('Unknown (xx-YY)')
  })

  it('handles 3-letter code', () => {
    const result = getLanguageName('eng')
    expect(result).toBe('English (eng)')
  })
})
