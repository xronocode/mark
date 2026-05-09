/**
 * Unit tests for src/renderer/src/store/preferences.js
 *
 * Covers:
 *   - state defaults (spot-check)
 *   - getAll getter
 *   - SET_USER_PREFERENCE: copies known keys, ignores unknown,
 *     calls setLanguage when language differs
 *   - SET_MODE / TOGGLE_VIEW_MODE
 *   - ASK_FOR_USER_PREFERENCE: invoke success + reject paths
 *   - SET_SINGLE_PREFERENCE: state update + invoke + language side-effect
 *   - SET_USER_DATA: invoke success + reject
 *   - SET_IMAGE_FOLDER_PATH: delegates to SET_SINGLE_PREFERENCE
 *   - SELECT_DEFAULT_DIRECTORY_TO_OPEN: deferred warn
 *   - LISTEN_TOGGLE_VIEW: bus handler dispatches TOGGLE + view state
 *   - DISPATCH_EDITOR_VIEW_STATE: ipcRenderer.send with windowId/viewState
 */

import { setupTestPinia } from '../pinia'

// ─── per-file mocks ────────────────────────────────────────────────
const setLanguageMock = vi.fn()

vi.mock('@/i18n', () => ({
  t: (key: string) => key,
  setLanguage: setLanguageMock
}))

// Bus per-file mock — singleton would leak listeners across files.
const busOnMock = vi.fn()
const busEmitMock = vi.fn()
const busOffMock = vi.fn()

vi.mock('@/bus', () => ({
  default: {
    on: busOnMock,
    emit: busEmitMock,
    off: busOffMock
  }
}))

import { invoke } from '@tauri-apps/api/core'

describe('store/preferences', () => {
  beforeEach(() => {
    setupTestPinia()
    setLanguageMock.mockReset()
    busOnMock.mockReset()
    busEmitMock.mockReset()
    busOffMock.mockReset()
  })

  it('state defaults — spot-check critical fields', async () => {
    const { usePreferencesStore } = await import('@/store/preferences')
    const s = usePreferencesStore()

    expect(s.autoSave).toBe(false)
    expect(s.theme).toBe('light')
    expect(s.titleBarStyle).toBe('custom')
    expect(s.tabSize).toBe(4)
    expect(s.language).toBe('en')
    expect(s.fontSize).toBe(16)
    expect(s.zoom).toBe(1.0)
    expect(s.preferHeadingStyle).toBe('atx')
  })

  it('getAll getter returns the live state object', async () => {
    const { usePreferencesStore } = await import('@/store/preferences')
    const s = usePreferencesStore()
    expect(s.getAll.theme).toBe('light')
    s.theme = 'dark'
    expect(s.getAll.theme).toBe('dark')
  })

  describe('SET_USER_PREFERENCE', () => {
    it('copies known keys and ignores unknown keys', async () => {
      const { usePreferencesStore } = await import('@/store/preferences')
      const s = usePreferencesStore()
      s.SET_USER_PREFERENCE({ theme: 'dark', tabSize: 2, bogusKey: 'nope' })
      expect(s.theme).toBe('dark')
      expect(s.tabSize).toBe(2)
      expect((s as any).bogusKey).toBeUndefined()
    })

    it('skips undefined values', async () => {
      const { usePreferencesStore } = await import('@/store/preferences')
      const s = usePreferencesStore()
      s.theme = 'dark'
      s.SET_USER_PREFERENCE({ theme: undefined, tabSize: 8 })
      expect(s.theme).toBe('dark')
      expect(s.tabSize).toBe(8)
    })

    it('calls setLanguage when language changes', async () => {
      const { usePreferencesStore } = await import('@/store/preferences')
      const s = usePreferencesStore()
      s.SET_USER_PREFERENCE({ language: 'de' })
      expect(setLanguageMock).toHaveBeenCalledWith('de')
    })

    it('does NOT call setLanguage when language matches current', async () => {
      const { usePreferencesStore } = await import('@/store/preferences')
      const s = usePreferencesStore()
      s.SET_USER_PREFERENCE({ language: 'en' })
      expect(setLanguageMock).not.toHaveBeenCalled()
    })

    it('does NOT call setLanguage when language is missing/undefined', async () => {
      const { usePreferencesStore } = await import('@/store/preferences')
      const s = usePreferencesStore()
      s.SET_USER_PREFERENCE({ theme: 'dark' })
      expect(setLanguageMock).not.toHaveBeenCalled()
    })
  })

  it('SET_MODE sets state[type] = checked', async () => {
    const { usePreferencesStore } = await import('@/store/preferences')
    const s = usePreferencesStore()
    s.SET_MODE({ type: 'typewriter', checked: true })
    expect(s.typewriter).toBe(true)
    s.SET_MODE({ type: 'typewriter', checked: false })
    expect(s.typewriter).toBe(false)
  })

  it('TOGGLE_VIEW_MODE flips the boolean', async () => {
    const { usePreferencesStore } = await import('@/store/preferences')
    const s = usePreferencesStore()
    expect(s.sideBarVisibility).toBe(false)
    s.TOGGLE_VIEW_MODE('sideBarVisibility')
    expect(s.sideBarVisibility).toBe(true)
    s.TOGGLE_VIEW_MODE('sideBarVisibility')
    expect(s.sideBarVisibility).toBe(false)
  })

  describe('ASK_FOR_USER_PREFERENCE', () => {
    it('on success applies returned prefs via SET_USER_PREFERENCE', async () => {
      ;(invoke as any).mockResolvedValueOnce({ theme: 'dark', tabSize: 8 })
      const { usePreferencesStore } = await import('@/store/preferences')
      const s = usePreferencesStore()
      await s.ASK_FOR_USER_PREFERENCE()
      expect(invoke).toHaveBeenCalledWith('mt_prefs_get_all')
      expect(s.theme).toBe('dark')
      expect(s.tabSize).toBe(8)
    })

    it('on reject logs and does not throw', async () => {
      ;(invoke as any).mockRejectedValueOnce(new Error('boom'))
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const { usePreferencesStore } = await import('@/store/preferences')
      const s = usePreferencesStore()
      await expect(s.ASK_FOR_USER_PREFERENCE()).resolves.toBeUndefined()
      expect(errSpy).toHaveBeenCalled()
      errSpy.mockRestore()
    })

    it('non-object response is tolerated (no SET_USER_PREFERENCE call)', async () => {
      ;(invoke as any).mockResolvedValueOnce(null)
      const { usePreferencesStore } = await import('@/store/preferences')
      const s = usePreferencesStore()
      const before = s.theme
      await s.ASK_FOR_USER_PREFERENCE()
      expect(s.theme).toBe(before)
    })
  })

  describe('SET_SINGLE_PREFERENCE', () => {
    it('updates state immediately and invokes mt_prefs_set', async () => {
      ;(invoke as any).mockResolvedValueOnce(undefined)
      const { usePreferencesStore } = await import('@/store/preferences')
      const s = usePreferencesStore()
      await s.SET_SINGLE_PREFERENCE({ type: 'tabSize', value: 8 })
      expect(s.tabSize).toBe(8)
      expect(invoke).toHaveBeenCalledWith('mt_prefs_set', { key: 'tabSize', value: 8 })
    })

    it('calls setLanguage when type === "language"', async () => {
      ;(invoke as any).mockResolvedValueOnce(undefined)
      const { usePreferencesStore } = await import('@/store/preferences')
      const s = usePreferencesStore()
      await s.SET_SINGLE_PREFERENCE({ type: 'language', value: 'de' })
      expect(setLanguageMock).toHaveBeenCalledWith('de')
      expect(s.language).toBe('de')
    })

    it('on invoke failure state stays updated and error is logged', async () => {
      ;(invoke as any).mockRejectedValueOnce(new Error('boom'))
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const { usePreferencesStore } = await import('@/store/preferences')
      const s = usePreferencesStore()
      await s.SET_SINGLE_PREFERENCE({ type: 'tabSize', value: 2 })
      expect(s.tabSize).toBe(2)
      expect(errSpy).toHaveBeenCalled()
      errSpy.mockRestore()
    })
  })

  describe('SET_USER_DATA', () => {
    it('invokes mt_prefs_set on success', async () => {
      ;(invoke as any).mockResolvedValueOnce(undefined)
      const { usePreferencesStore } = await import('@/store/preferences')
      const s = usePreferencesStore()
      await s.SET_USER_DATA({ type: 'githubToken', value: 'gho_xxx' })
      expect(invoke).toHaveBeenCalledWith('mt_prefs_set', { key: 'githubToken', value: 'gho_xxx' })
    })

    it('logs on failure', async () => {
      ;(invoke as any).mockRejectedValueOnce(new Error('boom'))
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const { usePreferencesStore } = await import('@/store/preferences')
      const s = usePreferencesStore()
      await s.SET_USER_DATA({ type: 'githubToken', value: 'gho_xxx' })
      expect(errSpy).toHaveBeenCalled()
      errSpy.mockRestore()
    })
  })

  it('SET_IMAGE_FOLDER_PATH delegates to SET_SINGLE_PREFERENCE', async () => {
    ;(invoke as any).mockResolvedValueOnce(undefined)
    const { usePreferencesStore } = await import('@/store/preferences')
    const s = usePreferencesStore()
    s.SET_IMAGE_FOLDER_PATH('/img/path')
    // state mutation is sync (SET_SINGLE_PREFERENCE updates state before awaiting)
    expect(s.imageFolderPath).toBe('/img/path')
    // Allow the inner async dynamic import + invoke to complete.
    await new Promise((r) => setTimeout(r, 0))
    await new Promise((r) => setTimeout(r, 0))
    expect(invoke).toHaveBeenCalledWith('mt_prefs_set', { key: 'imageFolderPath', value: '/img/path' })
  })

  it('SELECT_DEFAULT_DIRECTORY_TO_OPEN warns (deferred)', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { usePreferencesStore } = await import('@/store/preferences')
    const s = usePreferencesStore()
    s.SELECT_DEFAULT_DIRECTORY_TO_OPEN()
    expect(warnSpy).toHaveBeenCalled()
    warnSpy.mockRestore()
  })

  it('LISTEN_TOGGLE_VIEW registers bus handler that toggles + dispatches', async () => {
    const { usePreferencesStore } = await import('@/store/preferences')
    const s = usePreferencesStore()
    s.LISTEN_TOGGLE_VIEW()

    expect(busOnMock).toHaveBeenCalledWith('view:toggle-view-entry', expect.any(Function))
    const handler = busOnMock.mock.calls[0][1] as (entry: string) => void

    // Capture initial value, fire handler
    const before = s.sideBarVisibility
    handler('sideBarVisibility')
    expect(s.sideBarVisibility).toBe(!before)

    // DISPATCH_EDITOR_VIEW_STATE should have been called → ipcRenderer.send
    expect((window.electron.ipcRenderer.send as any)).toHaveBeenCalledWith(
      'mt::view-layout-changed',
      1, // windowId from setup.ts shim
      { sideBarVisibility: !before }
    )
  })

  it('DISPATCH_EDITOR_VIEW_STATE sends windowId+viewState via ipcRenderer', async () => {
    const { usePreferencesStore } = await import('@/store/preferences')
    const s = usePreferencesStore()
    s.DISPATCH_EDITOR_VIEW_STATE({ tabBarVisibility: true })
    expect((window.electron.ipcRenderer.send as any)).toHaveBeenCalledWith(
      'mt::view-layout-changed',
      1,
      { tabBarVisibility: true }
    )
  })
})
