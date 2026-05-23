/**
 * Module-local tests for the M-021 default-handler actions on
 * src/renderer/src/store/preferences.js.
 *
 * Covers (per agent contract):
 *   1. REFRESH_DEFAULT_MD_HANDLER happy → state populated
 *   2. REFRESH_DEFAULT_MD_HANDLER reject → state preserved + console.error
 *   3. SET_DEFAULT_MD_HANDLER happy → invokes set + REFRESH chain
 *   4. SET_DEFAULT_MD_HANDLER reject → notice.notify(error) + no state change
 *   5. UNSET_DEFAULT_MD_HANDLER happy → invokes unset + REFRESH chain
 *   6. UNSET_DEFAULT_MD_HANDLER reject → notice.notify(error) + no state change
 *   7. State default → defaultMdHandler.isDefault === false initially
 */

import { setupTestPinia } from '../pinia'

// ─── per-file mocks ────────────────────────────────────────────────
// notice.notify is the user-visible side-effect on success / error paths.
const noticeNotifyMock = vi.fn()
vi.mock('@/services/notification', () => ({
  default: { notify: noticeNotifyMock }
}))

// i18n mock — preferences.js imports setLanguage at module top.
vi.mock('@/i18n', () => ({
  t: (key: string) => key,
  setLanguage: vi.fn()
}))

// Bus singleton mock to keep module-level state contained per file.
vi.mock('@/bus', () => ({
  default: {
    on: vi.fn(),
    emit: vi.fn(),
    off: vi.fn()
  }
}))

import { invoke } from '@tauri-apps/api/core'

describe('store/preferences — M-021 default-handler actions', () => {
  beforeEach(() => {
    setupTestPinia()
    noticeNotifyMock.mockReset()
  })

  it('state default — defaultMdHandler.isDefault is false initially', async () => {
    const { usePreferencesStore } = await import('@/store/preferences')
    const s = usePreferencesStore()
    expect(s.defaultMdHandler).toEqual({ isDefault: false, currentHandler: null })
  })

  describe('REFRESH_DEFAULT_MD_HANDLER', () => {
    it('happy — populates state from invoke result', async () => {
      ;(invoke as any).mockResolvedValueOnce({
        isDefault: true,
        currentHandler: 'com.xronocode.mark'
      })
      const { usePreferencesStore } = await import('@/store/preferences')
      const s = usePreferencesStore()
      await s.REFRESH_DEFAULT_MD_HANDLER()
      expect(invoke).toHaveBeenCalledWith('mt_get_default_md_handler')
      expect(s.defaultMdHandler.isDefault).toBe(true)
      expect(s.defaultMdHandler.currentHandler).toBe('com.xronocode.mark')
    })

    it('null result — invoke resolves with null → state preserved, warning logged', async () => {
      ;(invoke as any).mockResolvedValueOnce(null)
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const { usePreferencesStore } = await import('@/store/preferences')
      const s = usePreferencesStore()
      await s.REFRESH_DEFAULT_MD_HANDLER()
      expect(s.defaultMdHandler.isDefault).toBe(false)
      expect(s.defaultMdHandler.currentHandler).toBe(null)
      expect(warnSpy).toHaveBeenCalled()
      warnSpy.mockRestore()
    })

    it('error — invoke rejects → state preserved, console.error called', async () => {
      ;(invoke as any).mockRejectedValueOnce(new Error('boom'))
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const { usePreferencesStore } = await import('@/store/preferences')
      const s = usePreferencesStore()
      // Pre-state: defaults
      expect(s.defaultMdHandler.isDefault).toBe(false)
      await expect(s.REFRESH_DEFAULT_MD_HANDLER()).resolves.toBeUndefined()
      expect(s.defaultMdHandler.isDefault).toBe(false)
      expect(s.defaultMdHandler.currentHandler).toBe(null)
      expect(errSpy).toHaveBeenCalled()
      errSpy.mockRestore()
    })
  })

  describe('SET_DEFAULT_MD_HANDLER', () => {
    it('happy — invokes set then chains REFRESH and notifies success', async () => {
      ;(invoke as any)
        .mockResolvedValueOnce(undefined) // set
        .mockResolvedValueOnce({ isDefault: true, currentHandler: 'com.xronocode.mark' }) // refresh
      const { usePreferencesStore } = await import('@/store/preferences')
      const s = usePreferencesStore()
      await s.SET_DEFAULT_MD_HANDLER()
      // First: the set command
      expect((invoke as any).mock.calls[0][0]).toBe('mt_set_default_md_handler')
      // Second: the chained refresh
      expect((invoke as any).mock.calls[1][0]).toBe('mt_get_default_md_handler')
      expect(s.defaultMdHandler.isDefault).toBe(true)
      expect(noticeNotifyMock).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'primary' })
      )
    })

    it('error — set rejects → notice error, no REFRESH chain, state unchanged', async () => {
      ;(invoke as any).mockRejectedValueOnce(new Error('boom'))
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const { usePreferencesStore } = await import('@/store/preferences')
      const s = usePreferencesStore()
      await s.SET_DEFAULT_MD_HANDLER()
      // Only one invoke call (the failed set) — no refresh chain.
      expect((invoke as any).mock.calls.length).toBe(1)
      expect(s.defaultMdHandler.isDefault).toBe(false)
      expect(noticeNotifyMock).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'error' })
      )
      expect(errSpy).toHaveBeenCalled()
      errSpy.mockRestore()
    })
  })

  describe('UNSET_DEFAULT_MD_HANDLER', () => {
    it('happy — invokes unset then chains REFRESH and notifies success', async () => {
      ;(invoke as any)
        .mockResolvedValueOnce(undefined) // unset
        .mockResolvedValueOnce({ isDefault: false, currentHandler: null }) // refresh
      const { usePreferencesStore } = await import('@/store/preferences')
      const s = usePreferencesStore()
      // Pre-seed as default to make the transition observable.
      s.defaultMdHandler = { isDefault: true, currentHandler: 'com.xronocode.mark' }
      await s.UNSET_DEFAULT_MD_HANDLER()
      expect((invoke as any).mock.calls[0][0]).toBe('mt_unset_default_md_handler')
      expect((invoke as any).mock.calls[1][0]).toBe('mt_get_default_md_handler')
      expect(s.defaultMdHandler.isDefault).toBe(false)
      expect(s.defaultMdHandler.currentHandler).toBe(null)
      expect(noticeNotifyMock).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'primary' })
      )
    })

    it('error — unset rejects → notice error, no REFRESH chain, state unchanged', async () => {
      ;(invoke as any).mockRejectedValueOnce(new Error('boom'))
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const { usePreferencesStore } = await import('@/store/preferences')
      const s = usePreferencesStore()
      s.defaultMdHandler = { isDefault: true, currentHandler: 'com.xronocode.mark' }
      await s.UNSET_DEFAULT_MD_HANDLER()
      expect((invoke as any).mock.calls.length).toBe(1)
      // State preserved (no REFRESH ran on error).
      expect(s.defaultMdHandler.isDefault).toBe(true)
      expect(noticeNotifyMock).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'error' })
      )
      expect(errSpy).toHaveBeenCalled()
      errSpy.mockRestore()
    })
  })
})
