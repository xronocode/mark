// FILE: tests/renderer/util/menu-checks.test.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Pin the C-40 T-005 View-menu checkmark sync — util/menuChecks pushes the effective state of the four native View CheckMenuItems (boot full sync after hydration, per-change single pushes) and never throws on backend rejection.
//   SCOPE: viewMenuCheckStates / syncViewMenuChecks value mapping incl. the per-OS statusBarVisibility default and stored-user-value precedence, watchViewMenuChecks one-push-per-flip behaviour, rejection swallowing in pushViewMenuCheck.
//   DEPENDS: src/renderer/src/util/menuChecks.js, store/layout, store/preferences, Pinia, Vitest, tests/renderer/setup.ts window shims + auto-mocked invoke.
//   LINKS: .grace/verification/runtime.xml V-M-011 scenario-57 (renderer half) and V-M-009 scenario-16 (backend half); .grace/changes/archive/C-40 T-005.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   SET_LANGUAGE_MOCK - hoisted i18n setLanguage spy.
//   makeStores - fresh pinia + layout/preferences stores under the given platform.
//   menuCheckCalls - mt_menu_set_checked portion of the mocked invoke log.
//   menuCheckIds - ids pushed to mt_menu_set_checked, in call order.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - 2026-10-16 C-40 T-005 initial pins: boot pushes
//   all four ids with the effective state (status bar off on darwin / on
//   elsewhere, stored user value wins), each toggle pushes exactly one
//   call for the flipped item, a rejecting backend never breaks the sync.
// END_CHANGE_SUMMARY

import { setupTestPinia } from '../pinia'

const SET_LANGUAGE_MOCK = vi.hoisted(() => vi.fn(async () => {}))
vi.mock('@/i18n', () => ({
  t: (key) => key,
  setLanguage: (...args) => SET_LANGUAGE_MOCK(...args)
}))
vi.mock('@/bus', () => ({ default: { on: vi.fn(), emit: vi.fn(), off: vi.fn() } }))
// The preferences store imports services/notification → util/index.js,
// which reads the window shim at import time.
vi.mock('@/services/notification', () => ({ default: { notify: vi.fn() } }))

import { invoke } from '@tauri-apps/api/core'
import {
  viewMenuCheckStates,
  pushViewMenuCheck,
  syncViewMenuChecks,
  watchViewMenuChecks,
  VIEW_MENU_CHECK_ITEMS
} from '@/util/menuChecks'
import { useLayoutStore } from '@/store/layout'
import { usePreferencesStore } from '@/store/preferences'

// Create both stores fresh under the given platform. Platform must be
// set BEFORE the preferences store is first used — the per-OS
// statusBarVisibility default resolves at store creation.
const makeStores = (platform = 'darwin') => {
  setupTestPinia()
  window.electron.process.platform = platform
  return {
    layoutStore: useLayoutStore(),
    preferencesStore: usePreferencesStore()
  }
}

const menuCheckCalls = () =>
  invoke.mock.calls.filter(([cmd]) => cmd === 'mt_menu_set_checked')

const menuCheckIds = () => menuCheckCalls().map(([, args]) => args.id)

describe('util/menuChecks — C-40 T-005 View-menu checkmark sync', () => {
  afterEach(() => {
    // setup.ts re-installs the shim before every test; be tidy anyway.
    window.electron.process.platform = 'darwin'
    vi.restoreAllMocks()
  })

  it('maps the four native view ids onto the owning store fields', () => {
    expect(VIEW_MENU_CHECK_ITEMS.map((item) => item.id)).toEqual([
      'view.toggle-sidebar',
      'view.toggle-tabbar',
      'view.outline',
      'view.status-bar'
    ])
  })

  it('boot sync pushes all four ids with the effective hydrated state (darwin)', async () => {
    const { layoutStore, preferencesStore } = makeStores('darwin')
    // Hydrated state: sidebar on, tab bar off, outline default on,
    // status bar default OFF on darwin.
    layoutStore.SET_LAYOUT({ showSideBar: true, showTabBar: false })

    await syncViewMenuChecks()

    expect(menuCheckCalls()).toEqual([
      ['mt_menu_set_checked', { id: 'view.toggle-sidebar', checked: true }],
      ['mt_menu_set_checked', { id: 'view.toggle-tabbar', checked: false }],
      ['mt_menu_set_checked', { id: 'view.outline', checked: true }],
      ['mt_menu_set_checked', { id: 'view.status-bar', checked: false }]
    ])
    expect(preferencesStore.outlineRailVisible).toBe(true)
  })

  it('status bar pushes checked:true on the win32/linux platform default', async () => {
    for (const platform of ['win32', 'linux']) {
      invoke.mockClear()
      makeStores(platform)
      await syncViewMenuChecks()
      expect(
        menuCheckCalls().find(([, args]) => args.id === 'view.status-bar'),
        `${platform} default must be visible`
      ).toEqual(['mt_menu_set_checked', { id: 'view.status-bar', checked: true }])
    }
  })

  it('a stored user value wins over the platform default', async () => {
    const { preferencesStore } = makeStores('darwin')
    // Hydration path: the stored statusBarVisibility lands via
    // SET_USER_PREFERENCE (ASK_FOR_USER_PREFERENCE).
    preferencesStore.SET_USER_PREFERENCE({ statusBarVisibility: true })

    await syncViewMenuChecks()

    expect(
      menuCheckCalls().find(([, args]) => args.id === 'view.status-bar')
    ).toEqual(['mt_menu_set_checked', { id: 'view.status-bar', checked: true }])
  })

  it('each later toggle pushes exactly one call for the flipped item', async () => {
    const { layoutStore, preferencesStore } = makeStores('darwin')
    const stops = watchViewMenuChecks()
    invoke.mockClear()

    // Tab bar: layout-store flip (the TOGGLE_LAYOUT_ENTRY path the
    // view.toggle-tabbar command takes).
    layoutStore.TOGGLE_LAYOUT_ENTRY('showTabBar')
    await vi.waitFor(() => {
      expect(menuCheckCalls()).toEqual([
        ['mt_menu_set_checked', { id: 'view.toggle-tabbar', checked: true }]
      ])
    })

    // Outline: preferences-store flip (the view.outline command path).
    invoke.mockClear()
    preferencesStore.outlineRailVisible = false
    await vi.waitFor(() => {
      expect(menuCheckCalls()).toEqual([
        ['mt_menu_set_checked', { id: 'view.outline', checked: false }]
      ])
    })

    // Status bar: preferences-store flip (the view.status-bar path).
    invoke.mockClear()
    preferencesStore.statusBarVisibility = true
    await vi.waitFor(() => {
      expect(menuCheckCalls()).toEqual([
        ['mt_menu_set_checked', { id: 'view.status-bar', checked: true }]
      ])
    })

    // Sidebar: layout-store flip.
    invoke.mockClear()
    layoutStore.showSideBar = true
    await vi.waitFor(() => {
      expect(menuCheckCalls()).toEqual([
        ['mt_menu_set_checked', { id: 'view.toggle-sidebar', checked: true }]
      ])
    })

    stops.forEach((stop) => stop())
  })

  it('a rejecting backend never breaks the boot sync (all four still attempted)', async () => {
    makeStores('darwin')
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    invoke.mockRejectedValueOnce(new Error('no backend command'))

    await expect(syncViewMenuChecks()).resolves.toBeUndefined()

    expect(menuCheckIds()).toEqual([
      'view.toggle-sidebar',
      'view.toggle-tabbar',
      'view.outline',
      'view.status-bar'
    ])
    expect(warnSpy).toHaveBeenCalledTimes(1)
    expect(warnSpy.mock.calls[0][0]).toContain('BLOCK_MENU_CHECK_PUSH_FAILED')
  })

  it('pushViewMenuCheck swallows a rejecting backend without throwing', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    invoke.mockRejectedValue(new Error('menu gone'))

    await expect(
      pushViewMenuCheck('view.outline', false)
    ).resolves.toBeUndefined()
    expect(warnSpy).toHaveBeenCalledTimes(1)

    await expect(
      pushViewMenuCheck('view.status-bar', true)
    ).resolves.toBeUndefined()
    expect(warnSpy).toHaveBeenCalledTimes(2)
  })

  it('viewMenuCheckStates coerces every value to a strict boolean', () => {
    makeStores('darwin')
    const states = viewMenuCheckStates()
    for (const { checked } of states) {
      expect(checked === true || checked === false).toBe(true)
    }
  })
})
