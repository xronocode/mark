/**
 * Additional coverage tests for src/renderer/src/store/preferences.js
 *
 * Coverage target: 94.91% → 95%+
 *
 * Focuses on uncovered branches:
 *   - SET_SINGLE_PREFERENCE with unknown key (import.meta.env.DEV warn)
 *   - SET_USER_PREFERENCE with null / non-object preference arg
 *   - SET_USER_PREFERENCE with empty object (no keys)
 */

import { setupTestPinia } from '../pinia'
import { invoke } from '@tauri-apps/api/core'

const setLanguageMock = vi.fn()
vi.mock('@/i18n', () => ({
  t: (k) => k,
  setLanguage: setLanguageMock
}))

vi.mock('@/bus', () => ({
  default: { on: vi.fn(), emit: vi.fn(), off: vi.fn() }
}))

vi.mock('@/services/notification', () => ({
  default: { notify: vi.fn(async () => undefined) }
}))

describe('store/preferences — coverage gaps', () => {
  beforeEach(() => {
    setupTestPinia()
    setLanguageMock.mockReset()
  })

  describe('SET_SINGLE_PREFERENCE — unknown key', () => {
    it('returns early without setting state or invoking when key is unknown', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const { usePreferencesStore } = await import('@/store/preferences')
      const s = usePreferencesStore()

      await s.SET_SINGLE_PREFERENCE({ type: 'totallyBogusKey', value: 42 })

      // Should not have invoked backend
      expect(invoke).not.toHaveBeenCalledWith('mt_prefs_set', expect.anything())
      // In DEV mode, should log a warning
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('unknown key')
      )
      warnSpy.mockRestore()
    })
  })

  describe('SET_USER_PREFERENCE — edge cases', () => {
    it('handles string preference gracefully (non-object)', async () => {
      const { usePreferencesStore } = await import('@/store/preferences')
      const s = usePreferencesStore()
      const before = s.theme
      expect(() => s.SET_USER_PREFERENCE('bogus')).not.toThrow()
      expect(s.theme).toBe(before)
    })

    it('handles empty object (no keys to copy)', async () => {
      const { usePreferencesStore } = await import('@/store/preferences')
      const s = usePreferencesStore()
      const before = s.theme
      s.SET_USER_PREFERENCE({})
      expect(s.theme).toBe(before)
      // No setLanguage call for empty object
      expect(setLanguageMock).not.toHaveBeenCalled()
    })

    it('handles numeric preference gracefully', async () => {
      const { usePreferencesStore } = await import('@/store/preferences')
      const s = usePreferencesStore()
      expect(() => s.SET_USER_PREFERENCE(42)).not.toThrow()
    })
  })

  describe('SET_SINGLE_PREFERENCE — language side-effect', () => {
    it('does not call setLanguage when type is not "language"', async () => {
      ;(invoke).mockResolvedValueOnce(undefined)
      const { usePreferencesStore } = await import('@/store/preferences')
      const s = usePreferencesStore()
      await s.SET_SINGLE_PREFERENCE({ type: 'theme', value: 'dark' })
      expect(setLanguageMock).not.toHaveBeenCalled()
    })
  })
})
