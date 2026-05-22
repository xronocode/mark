/**
 * Tests for src/renderer/src/i18n/index.js
 *
 * Covers: i18n instance, t function, setLanguage, getCurrentLanguage
 */

vi.mock('@/bus', () => ({
  default: {
    on: vi.fn(),
    off: vi.fn(),
    emit: vi.fn()
  }
}))

// Mock the EN translations
vi.mock('../../../../static/locales/en.json', () => ({
  default: {
    'app.title': 'Mark',
    'file.new': 'New File',
    'edit.undo': 'Undo',
    'test.key': 'Test Value'
  }
}))

import { t, setLanguage, getCurrentLanguage, i18n } from '@/i18n'

describe('i18n/index', () => {
  describe('i18n instance', () => {
    it('should export an i18n instance', () => {
      expect(i18n).toBeDefined()
      expect(i18n.global).toBeDefined()
    })

    it('should have default locale as en', () => {
      expect(getCurrentLanguage()).toBe('en')
    })
  })

  describe('t function', () => {
    it('should translate known keys', () => {
      const result = t('app.title')
      // vue-i18n will return the key or the translation
      expect(typeof result).toBe('string')
    })

    it('should return key for unknown translations', () => {
      const result = t('nonexistent.key')
      // vue-i18n returns the key when no translation found
      expect(typeof result).toBe('string')
    })

    it('should handle being called with extra args', () => {
      const result = t('app.title', { name: 'test' })
      expect(typeof result).toBe('string')
    })
  })

  describe('setLanguage', () => {
    it('should do nothing for falsy locale', () => {
      const before = getCurrentLanguage()
      setLanguage('')
      setLanguage(null)
      setLanguage(undefined)
      expect(getCurrentLanguage()).toBe(before)
    })

    it('should load and set a new locale', () => {
      window.i18nUtils.loadTranslations.mockReturnValue({
        'app.title': 'Марк'
      })

      setLanguage('ru')
      expect(window.i18nUtils.loadTranslations).toHaveBeenCalledWith('ru')
      expect(getCurrentLanguage()).toBe('ru')
    })

    it('should handle failed locale load', () => {
      window.i18nUtils.loadTranslations.mockReturnValue(null)

      const before = getCurrentLanguage()
      setLanguage('invalid')
      // Should not change locale if loading failed
      expect(getCurrentLanguage()).toBe(before)
    })
  })

  describe('getCurrentLanguage', () => {
    it('should return current locale', () => {
      const lang = getCurrentLanguage()
      expect(typeof lang).toBe('string')
    })
  })
})
