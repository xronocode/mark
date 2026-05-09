/**
 * Phase-4 Wave-2 (agent 1): unit tests for `store/layout.js`.
 *
 * Coverage targets:
 *   - state.sideBarWidth init: localStorage-seeded vs missing/default 280
 *   - SET_LAYOUT(layout): showSideBar branch (calls prefs.SET_SINGLE_PREFERENCE)
 *     + Object.assign for arbitrary fields
 *   - TOGGLE_LAYOUT_ENTRY(entryName): generic toggle; showSideBar branch
 *     persists prefs + calls requestWindowResize
 *   - SET_SIDE_BAR_WIDTH: clamp >=220, persist localStorage, mutate state
 *   - REQUEST_INITIAL_WINDOW_RESIZE: invokes requestWindowResize via Tauri
 *     Window API
 *   - LISTEN_FOR_LAYOUT: bus subscription + ipcRenderer.send on toggle
 *   - DISPATCH_LAYOUT_MENU_ITEMS: ipcRenderer.send with current showTabBar
 *     + showSideBar
 *   - CHANGE_SIDE_BAR_WIDTH: delegates to SET_SIDE_BAR_WIDTH
 *   - requestWindowResize: tolerates Tauri Window API failures (warns,
 *     does not throw).
 *
 * Pitfall mitigations (from Wave-1 collected gotchas):
 *   #1 — usePreferencesStore is mocked as a plain-object store stub via
 *        `vi.fn(() => plainObject)` rather than a defineStore factory.
 *   #2 — stub object exposed on globalThis.__layoutStubs.preferences so
 *        individual tests can poke at SET_SINGLE_PREFERENCE.
 *   #4 — bus mocked at both `@/bus` and `../bus` to cover module dedup
 *        edge cases.
 */

import { setupTestPinia } from '../pinia'

// ─── per-file mocks ────────────────────────────────────────────────

const __preferencesStub: Record<string, any> = {
  SET_SINGLE_PREFERENCE: vi.fn()
}

vi.mock('@/store/preferences', () => ({
  usePreferencesStore: vi.fn(() => __preferencesStub)
}))

// Layout.js imports `../bus`. Alias `@/` resolves to src/renderer/src so
// `@/bus` and `../bus` resolve to the same module — but mock both shapes
// to be defensive (Wave-1 pitfall #4).
const busOnMock = vi.fn()
const busEmitMock = vi.fn()
const busOffMock = vi.fn()
vi.mock('@/bus', () => ({
  default: { on: busOnMock, emit: busEmitMock, off: busOffMock }
}))
vi.mock('../bus', () => ({
  default: { on: busOnMock, emit: busEmitMock, off: busOffMock }
}))

;(globalThis as any).__layoutStubs = {
  preferences: __preferencesStub
}

// ─── test suite ────────────────────────────────────────────────────

describe('store/layout', () => {
  beforeEach(() => {
    setupTestPinia()
    __preferencesStub.SET_SINGLE_PREFERENCE = vi.fn()
    busOnMock.mockReset()
    busEmitMock.mockReset()
    busOffMock.mockReset()
    localStorage.clear()
    vi.resetModules()
  })

  describe('initial sideBarWidth', () => {
    it('falls back to clamp floor (220) when localStorage has no entry', async () => {
      // Note: layout.js does `+localStorage.getItem(...)` which is +null=0,
      // then Math.max(0, 220) → 220. The literal 280 default in the file
      // is unreachable in jsdom since localStorage.getItem is never
      // strictly non-string. Document the actual behaviour here so future
      // refactors of the init logic catch this surprise.
      vi.resetModules()
      const mod = await import('@/store/layout')
      const layout = mod.useLayoutStore()
      expect(layout.sideBarWidth).toBe(220)
    })

    it('reads stored width and clamps to >=220', async () => {
      localStorage.setItem('side-bar-width', '350')
      vi.resetModules()
      const mod = await import('@/store/layout')
      const layout = mod.useLayoutStore()
      expect(layout.sideBarWidth).toBe(350)
    })

    it('clamps stored width below 220 up to 220', async () => {
      localStorage.setItem('side-bar-width', '100')
      vi.resetModules()
      const mod = await import('@/store/layout')
      const layout = mod.useLayoutStore()
      expect(layout.sideBarWidth).toBe(220)
    })
  })

  describe('SET_LAYOUT', () => {
    it('persists sideBarVisibility via prefs when showSideBar is included', async () => {
      const { useLayoutStore } = await import('@/store/layout')
      const layout = useLayoutStore()
      layout.SET_LAYOUT({ showSideBar: true })
      expect(__preferencesStub.SET_SINGLE_PREFERENCE).toHaveBeenCalledWith({
        type: 'sideBarVisibility',
        value: true
      })
      expect(layout.showSideBar).toBe(true)
    })

    it('Object.assigns arbitrary fields without prefs side-effect when showSideBar absent', async () => {
      const { useLayoutStore } = await import('@/store/layout')
      const layout = useLayoutStore()
      layout.SET_LAYOUT({ rightColumn: 'toc', showTabBar: true })
      expect(layout.rightColumn).toBe('toc')
      expect(layout.showTabBar).toBe(true)
      expect(__preferencesStub.SET_SINGLE_PREFERENCE).not.toHaveBeenCalled()
    })

    it('coerces showSideBar to boolean for prefs', async () => {
      const { useLayoutStore } = await import('@/store/layout')
      const layout = useLayoutStore()
      layout.SET_LAYOUT({ showSideBar: 0 as unknown as boolean })
      // 0 is not undefined, so prefs is called with !!0 → false.
      expect(__preferencesStub.SET_SINGLE_PREFERENCE).toHaveBeenCalledWith({
        type: 'sideBarVisibility',
        value: false
      })
    })
  })

  describe('TOGGLE_LAYOUT_ENTRY', () => {
    it('flips a non-sidebar entry without prefs side-effect', async () => {
      const { useLayoutStore } = await import('@/store/layout')
      const layout = useLayoutStore()
      expect(layout.showTabBar).toBe(false)
      layout.TOGGLE_LAYOUT_ENTRY('showTabBar')
      expect(layout.showTabBar).toBe(true)
      expect(__preferencesStub.SET_SINGLE_PREFERENCE).not.toHaveBeenCalled()
    })

    it('persists prefs + calls requestWindowResize when toggling showSideBar', async () => {
      const { useLayoutStore } = await import('@/store/layout')
      const winApi = await import('@tauri-apps/api/window')
      const layout = useLayoutStore()
      layout.TOGGLE_LAYOUT_ENTRY('showSideBar')
      expect(layout.showSideBar).toBe(true)
      expect(__preferencesStub.SET_SINGLE_PREFERENCE).toHaveBeenCalledWith({
        type: 'sideBarVisibility',
        value: true
      })
      // requestWindowResize is async and uses dynamic import; let it settle.
      await new Promise((r) => setTimeout(r, 0))
      expect((winApi as any).getCurrentWindow).toHaveBeenCalled()
    })
  })

  describe('SET_SIDE_BAR_WIDTH', () => {
    it('clamps to 220, persists localStorage, mutates state', async () => {
      const { useLayoutStore } = await import('@/store/layout')
      const layout = useLayoutStore()
      layout.SET_SIDE_BAR_WIDTH(150)
      expect(localStorage.getItem('side-bar-width')).toBe('220')
      // state mirrors raw input (only clamp is applied to localStorage).
      expect(layout.sideBarWidth).toBe(150)
    })

    it('passes through values >=220 untouched', async () => {
      const { useLayoutStore } = await import('@/store/layout')
      const layout = useLayoutStore()
      layout.SET_SIDE_BAR_WIDTH(400)
      expect(localStorage.getItem('side-bar-width')).toBe('400')
      expect(layout.sideBarWidth).toBe(400)
    })
  })

  describe('REQUEST_INITIAL_WINDOW_RESIZE', () => {
    it('invokes the Tauri Window API without throwing', async () => {
      const { useLayoutStore } = await import('@/store/layout')
      const winApi = await import('@tauri-apps/api/window')
      const layout = useLayoutStore()
      layout.REQUEST_INITIAL_WINDOW_RESIZE()
      await new Promise((r) => setTimeout(r, 0))
      expect((winApi as any).getCurrentWindow).toHaveBeenCalled()
    })

    it('logs a warning and does not throw when the Window API fails', async () => {
      const { useLayoutStore } = await import('@/store/layout')
      const winApi = await import('@tauri-apps/api/window')
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      ;(winApi as any).getCurrentWindow.mockImplementationOnce(() => {
        throw new Error('boom')
      })
      const layout = useLayoutStore()
      expect(() => layout.REQUEST_INITIAL_WINDOW_RESIZE()).not.toThrow()
      await new Promise((r) => setTimeout(r, 0))
      expect(warn).toHaveBeenCalled()
      warn.mockRestore()
    })
  })

  describe('LISTEN_FOR_LAYOUT', () => {
    it('subscribes to view:toggle-layout-entry on bus', async () => {
      const { useLayoutStore } = await import('@/store/layout')
      const layout = useLayoutStore()
      layout.LISTEN_FOR_LAYOUT()
      expect(busOnMock).toHaveBeenCalledWith(
        'view:toggle-layout-entry',
        expect.any(Function)
      )
    })

    it('toggles entry + sends mt::view-layout-changed when bus fires', async () => {
      const { useLayoutStore } = await import('@/store/layout')
      const layout = useLayoutStore()
      layout.LISTEN_FOR_LAYOUT()
      const handler = busOnMock.mock.calls[0][1] as (n: string) => void
      handler('showTabBar')
      expect(layout.showTabBar).toBe(true)
      expect(window.electron.ipcRenderer.send).toHaveBeenCalledWith(
        'mt::view-layout-changed',
        1,
        { showTabBar: true }
      )
    })
  })

  describe('DISPATCH_LAYOUT_MENU_ITEMS', () => {
    it('sends current showTabBar+showSideBar via ipcRenderer', async () => {
      const { useLayoutStore } = await import('@/store/layout')
      const layout = useLayoutStore()
      layout.showSideBar = true
      layout.showTabBar = false
      layout.DISPATCH_LAYOUT_MENU_ITEMS()
      expect(window.electron.ipcRenderer.send).toHaveBeenCalledWith(
        'mt::view-layout-changed',
        1,
        { showTabBar: false, showSideBar: true }
      )
    })
  })

  describe('CHANGE_SIDE_BAR_WIDTH', () => {
    it('delegates to SET_SIDE_BAR_WIDTH', async () => {
      const { useLayoutStore } = await import('@/store/layout')
      const layout = useLayoutStore()
      layout.CHANGE_SIDE_BAR_WIDTH(300)
      expect(localStorage.getItem('side-bar-width')).toBe('300')
      expect(layout.sideBarWidth).toBe(300)
    })
  })
})
