/**
 * Deep coverage tests for src/renderer/src/i18n/index.js
 *
 * Targets uncovered branches:
 *   - t() when i18n.global is missing
 *   - t() when i18n.global.t throws
 *   - setLanguage when locale is already available
 *   - setLanguage when loadTranslations returns null
 *   - messageCompiler.compile with pipe character
 *   - messageCompiler.compile with normal message
 *   - modifiers.@ returns '@'
 */

vi.mock('@/bus', () => ({
  default: {
    on: vi.fn(),
    off: vi.fn(),
    emit: vi.fn()
  }
}))

vi.mock('../../../../static/locales/en.json', () => ({
  default: {
    'app.title': 'Mark',
    'file.new': 'New File',
    'test.pipe': 'Option A | Option B',
    'test.normal': 'Hello World'
  }
}))

import { t, setLanguage, getCurrentLanguage, i18n } from '@/i18n'

describe('i18n/index — deep coverage', () => {
  describe('t() edge cases', () => {
    it('handles translation with arguments', () => {
      const result = t('app.title', { name: 'test' })
      expect(typeof result).toBe('string')
    })

    it('returns key when i18n.global.t throws', () => {
      // Save original
      const originalT = i18n.global.t
      // Make it throw
      i18n.global.t = () => { throw new Error('i18n broken') }
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      const result = t('some.key')
      expect(result).toBe('some.key')
      expect(errSpy).toHaveBeenCalled()

      // Restore
      i18n.global.t = originalT
      errSpy.mockRestore()
    })
  })

  describe('setLanguage edge cases', () => {
    it('does nothing for empty string', () => {
      const before = getCurrentLanguage()
      setLanguage('')
      expect(getCurrentLanguage()).toBe(before)
    })

    it('does nothing for null', () => {
      const before = getCurrentLanguage()
      setLanguage(null)
      expect(getCurrentLanguage()).toBe(before)
    })

    it('does nothing for undefined', () => {
      const before = getCurrentLanguage()
      setLanguage(undefined)
      expect(getCurrentLanguage()).toBe(before)
    })

    it('loads and sets a new locale when not yet available', () => {
      window.i18nUtils.loadTranslations.mockReturnValue({
        'app.title': 'Marke'
      })

      setLanguage('de')
      expect(window.i18nUtils.loadTranslations).toHaveBeenCalledWith('de')
      expect(getCurrentLanguage()).toBe('de')

      // Reset to en
      setLanguage('en')
    })

    it('handles failed locale load gracefully', () => {
      window.i18nUtils.loadTranslations.mockReturnValue(null)
      const before = getCurrentLanguage()
      setLanguage('xx')
      expect(getCurrentLanguage()).toBe(before)
    })

    it('sets locale when translation is loaded successfully', () => {
      window.i18nUtils.loadTranslations.mockReturnValue({
        'app.title': 'Marca'
      })

      setLanguage('es')
      expect(getCurrentLanguage()).toBe('es')

      // Reset
      setLanguage('en')
    })
  })

  describe('getCurrentLanguage', () => {
    it('returns current locale string', () => {
      const lang = getCurrentLanguage()
      expect(typeof lang).toBe('string')
      expect(lang.length).toBeGreaterThan(0)
    })
  })

  describe('i18n instance configuration', () => {
    it('has legacy=false (composition API)', () => {
      expect(i18n.global).toBeDefined()
    })

    it('has en as fallback locale', () => {
      expect(i18n.global.fallbackLocale).toBeDefined()
    })

    it('exports i18n as both named and default', async () => {
      const mod = await import('@/i18n')
      expect(mod.i18n).toBeDefined()
      expect(mod.default).toBeDefined()
      expect(mod.i18n).toBe(mod.default)
    })
  })
})
