// FILE: tests/renderer/util/menu-checks.test.js
// VERSION: 1.1.0
// START_MODULE_CONTRACT
//   PURPOSE: Pin the View-menu checkmark sync — util/menuChecks pushes the effective state of the native View CheckMenuItems (boot full sync after hydration, per-change single pushes) and never throws on backend rejection. C-40 T-005 owns the four layout/preference toggles; C-PAGE-WIDTH-TABLES T-010 adds the four Page Width preset rows whose exactly-one-checked state follows the effective width (document entry > global setting) for the active document.
//   SCOPE: viewMenuCheckStates / syncViewMenuChecks value mapping incl. the per-OS statusBarVisibility default and stored-user-value precedence, watchViewMenuChecks one-push-per-flip behaviour, rejection swallowing in pushViewMenuCheck, pageWidthMenuStates preset mapping (60/80/110 ch, the 100% Full window sentinel, no check for Custom values), and the width re-sync on tab switch / editorLineWidth change / the panel announcement.
//   DEPENDS: src/renderer/src/util/menuChecks.js, store/layout, store/preferences, store/editor (mocked — the lightweight document holder), util/pageWidthStore (mocked — the entry reader), Pinia, Vitest, tests/renderer/setup.ts window shims + auto-mocked invoke.
//   LINKS: .grace/verification/runtime.xml V-M-011 scenario-57 (renderer half) and V-M-009 scenario-16 (backend half); .grace/changes/archive/C-40 T-005; .grace/changes/active/C-PAGE-WIDTH-TABLES (plan T-010, spec R-13).
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   SET_LANGUAGE_MOCK - hoisted i18n setLanguage spy.
//   EDITOR_STATE - hoisted holder the mocked editor store reads currentFile from (the tab-switch surface).
//   WIDTH_ENTRIES - hoisted pathname → pageWidths entry table the mocked store util serves.
//   makeStores - fresh pinia + layout/preferences stores under the given platform.
//   menuCheckCalls - mt_menu_set_checked portion of the mocked invoke log.
//   menuCheckIds - ids pushed to mt_menu_set_checked, in call order.
//   widthCalls - the four page-width ids portion of the mocked invoke log.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.1.0 - 2026-11-02 C-PAGE-WIDTH-TABLES T-010: the four
//   Page Width preset rows join the sync — the boot full push grows to
//   eight calls (the four C-40 toggles + the four width rows), and the
//   width mapping (preset/Full window/Custom) plus the tab-switch and
//   editorLineWidth re-syncs are pinned over mocked editor-store and
//   pageWidthStore modules (menuChecks imports them dynamically; the
//   store/editor static cycle must stay one-way).
//   v1.0.0 - 2026-10-16 C-40 T-005 initial pins: boot pushes
//   all four ids with the effective state (status bar off on darwin / on
//   elsewhere, stored user value wins), each toggle pushes exactly one
//   call for the flipped item, a rejecting backend never breaks the sync.
// END_CHANGE_SUMMARY

import { setupTestPinia } from '../pinia'

const SET_LANGUAGE_MOCK = vi.hoisted(() => vi.fn(async () => {}))
const WIDTH_ENTRIES = vi.hoisted(() => ({}))
// The mocked editor store's currentFile must be REACTIVE: the width
// re-sync watches the active tab, so a test-driven "tab switch" has to
// trip Vue's reactivity exactly like the pinia store does.
const EDITOR_STATE = await vi.hoisted(async () => {
  const { reactive } = await import('vue')
  return reactive({ file: null })
})

vi.mock('@/i18n', () => ({
  t: (key) => key,
  setLanguage: (...args) => SET_LANGUAGE_MOCK(...args)
}))
vi.mock('@/bus', () => ({ default: { on: vi.fn(), emit: vi.fn(), off: vi.fn() } }))
// The preferences store imports services/notification → util/index.js,
// which reads the window shim at import time.
vi.mock('@/services/notification', () => ({ default: { notify: vi.fn() } }))
// C-PAGE-WIDTH-TABLES T-010: menuChecks pulls the editor store and the
// pageWidth store util through DYNAMIC imports (the store/editor.js
// static cycle stays one-way); the test serves both with lightweight
// stand-ins so the width state is fully controllable.
vi.mock('@/store/editor', () => ({
  // The getter keeps currentFile LIVE — every read goes through the
  // reactive holder, exactly like the pinia store instance would.
  useEditorStore: () => ({
    get currentFile() {
      return EDITOR_STATE.file
    }
  })
}))
vi.mock('@/util/pageWidthStore', () => ({
  loadPageWidthFor: vi.fn(async (pathname) => WIDTH_ENTRIES[pathname] || null),
  movePageWidthEntry: vi.fn(async () => true)
}))

import { invoke } from '@tauri-apps/api/core'
import {
  viewMenuCheckStates,
  pageWidthMenuStates,
  pushViewMenuCheck,
  pushPageWidthMenuChecks,
  syncViewMenuChecks,
  watchViewMenuChecks,
  VIEW_MENU_CHECK_ITEMS,
  PAGE_WIDTH_MENU_IDS,
  PAGE_WIDTH_STATE_EVENT
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

const widthCalls = () =>
  menuCheckCalls().filter(([, args]) => args.id.startsWith('view.page-width'))

describe('util/menuChecks — C-40 T-005 View-menu checkmark sync', () => {
  afterEach(() => {
    // setup.ts re-installs the shim before every test; be tidy anyway.
    window.electron.process.platform = 'darwin'
    EDITOR_STATE.file = null
    for (const key of Object.keys(WIDTH_ENTRIES)) delete WIDTH_ENTRIES[key]
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

  it('exposes exactly the four page-width preset rows and the panel announcement event (T-010)', () => {
    expect(PAGE_WIDTH_MENU_IDS).toEqual([
      'view.page-width.compact',
      'view.page-width.standard',
      'view.page-width.wide',
      'view.page-width.full'
    ])
    expect(PAGE_WIDTH_STATE_EVENT).toBe('mt::document-page-state-changed')
  })

  it('boot sync pushes all eight ids with the effective hydrated state (darwin)', async () => {
    const { layoutStore, preferencesStore } = makeStores('darwin')
    // Hydrated state: sidebar on, tab bar off, outline default on,
    // status bar default OFF on darwin. No document is open (editor
    // store holder empty) and the global setting resolves to the shipped
    // default (768px) — a Custom value, so no width preset is checked.
    layoutStore.SET_LAYOUT({ showSideBar: true, showTabBar: false })

    await syncViewMenuChecks()

    expect(menuCheckCalls()).toEqual([
      ['mt_menu_set_checked', { id: 'view.toggle-sidebar', checked: true }],
      ['mt_menu_set_checked', { id: 'view.toggle-tabbar', checked: false }],
      ['mt_menu_set_checked', { id: 'view.outline', checked: true }],
      ['mt_menu_set_checked', { id: 'view.status-bar', checked: false }],
      ['mt_menu_set_checked', { id: 'view.page-width.compact', checked: false }],
      ['mt_menu_set_checked', { id: 'view.page-width.standard', checked: false }],
      ['mt_menu_set_checked', { id: 'view.page-width.wide', checked: false }],
      ['mt_menu_set_checked', { id: 'view.page-width.full', checked: false }]
    ])
    expect(preferencesStore.outlineRailVisible).toBe(true)
  })

  it('boot sync checks exactly the preset the effective width names (T-010)', async () => {
    // A per-document 110 ch entry beats the global 80 ch setting → Wide.
    const { preferencesStore } = makeStores('darwin')
    preferencesStore.editorLineWidth = '80ch'
    EDITOR_STATE.file = { id: 'tab-1', pathname: '/docs/a.md' }
    WIDTH_ENTRIES['/docs/a.md'] = { value: 110, unit: 'ch' }

    await syncViewMenuChecks()

    expect(widthCalls()).toEqual([
      ['mt_menu_set_checked', { id: 'view.page-width.compact', checked: false }],
      ['mt_menu_set_checked', { id: 'view.page-width.standard', checked: false }],
      ['mt_menu_set_checked', { id: 'view.page-width.wide', checked: true }],
      ['mt_menu_set_checked', { id: 'view.page-width.full', checked: false }]
    ])
  })

  it('maps widths onto presets honestly: compact/standard/full by value+unit, Custom unchecked', () => {
    // Exact value+unit matches only — px and % sizes are Custom rows.
    expect(pageWidthMenuStates({ value: 60, unit: 'ch' }).filter((s) => s.checked)).toEqual([
      { id: 'view.page-width.compact', checked: true }
    ])
    expect(pageWidthMenuStates({ value: 80, unit: 'ch' }).filter((s) => s.checked)).toEqual([
      { id: 'view.page-width.standard', checked: true }
    ])
    expect(pageWidthMenuStates({ value: 100, unit: '%' }).filter((s) => s.checked)).toEqual([
      { id: 'view.page-width.full', checked: true }
    ])
    for (const custom of [
      { value: 750, unit: 'px' },
      { value: 80, unit: '%' },
      { value: 100, unit: 'ch' },
      { value: 768, unit: 'px' }
    ]) {
      expect(
        pageWidthMenuStates(custom).every((s) => !s.checked),
        `${custom.value}${custom.unit} is a Custom row`
      ).toBe(true)
    }
    expect(pageWidthMenuStates(null).every((s) => !s.checked)).toBe(true)
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
    // The width rows bootstrap once the editor-store holder lands (the
    // version-bump getter fires); flush that before asserting singles.
    await vi.waitFor(() => expect(widthCalls()).toHaveLength(4))
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

  it('a width re-sync fires on a tab switch and on an editorLineWidth change (T-010)', async () => {
    const { preferencesStore } = makeStores('darwin')
    const stops = watchViewMenuChecks()
    await vi.waitFor(() => expect(widthCalls()).toHaveLength(4))

    // Tab switch: the mocked editor holder moves to a document with a
    // stored 60 ch entry → Compact checked, the rest unchecked.
    invoke.mockClear()
    EDITOR_STATE.file = { id: 'tab-2', pathname: '/docs/b.md' }
    WIDTH_ENTRIES['/docs/b.md'] = { value: 60, unit: 'ch' }
    await vi.waitFor(() => {
      expect(widthCalls()).toEqual([
        ['mt_menu_set_checked', { id: 'view.page-width.compact', checked: true }],
        ['mt_menu_set_checked', { id: 'view.page-width.standard', checked: false }],
        ['mt_menu_set_checked', { id: 'view.page-width.wide', checked: false }],
        ['mt_menu_set_checked', { id: 'view.page-width.full', checked: false }]
      ])
    })

    // Global write on the SAME document: the per-document entry still
    // governs, so the rows re-push unchanged.
    invoke.mockClear()
    preferencesStore.editorLineWidth = '110ch'
    await vi.waitFor(() => {
      expect(widthCalls()).toEqual([
        ['mt_menu_set_checked', { id: 'view.page-width.compact', checked: true }],
        ['mt_menu_set_checked', { id: 'view.page-width.standard', checked: false }],
        ['mt_menu_set_checked', { id: 'view.page-width.wide', checked: false }],
        ['mt_menu_set_checked', { id: 'view.page-width.full', checked: false }]
      ])
    })

    stops.forEach((stop) => stop())
  })

  it('a rejecting backend never breaks the boot sync (all eight still attempted)', async () => {
    makeStores('darwin')
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    invoke.mockRejectedValueOnce(new Error('no backend command'))

    await expect(syncViewMenuChecks()).resolves.toBeUndefined()

    expect(menuCheckIds()).toEqual([
      'view.toggle-sidebar',
      'view.toggle-tabbar',
      'view.outline',
      'view.status-bar',
      'view.page-width.compact',
      'view.page-width.standard',
      'view.page-width.wide',
      'view.page-width.full'
    ])
    expect(warnSpy).toHaveBeenCalledTimes(1)
    expect(warnSpy.mock.calls[0][0]).toContain('BLOCK_MENU_CHECK_PUSH_FAILED')
  })

  it('a failed pageWidths read degrades to the global tier without throwing (T-010)', async () => {
    const { preferencesStore } = makeStores('darwin')
    preferencesStore.editorLineWidth = '60ch'
    EDITOR_STATE.file = { id: 'tab-3', pathname: '/docs/c.md' }
    WIDTH_ENTRIES['/docs/c.md'] = undefined
    const { loadPageWidthFor } = await import('@/util/pageWidthStore')
    loadPageWidthFor.mockRejectedValueOnce(new Error('prefs read failed'))
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    // pushPageWidthMenuChecks resolves; the read failure names no
    // document tier, so the global 60 ch answers — Compact checked.
    await expect(pushPageWidthMenuChecks()).resolves.toBeUndefined()
    expect(widthCalls()).toEqual([
      ['mt_menu_set_checked', { id: 'view.page-width.compact', checked: true }],
      ['mt_menu_set_checked', { id: 'view.page-width.standard', checked: false }],
      ['mt_menu_set_checked', { id: 'view.page-width.wide', checked: false }],
      ['mt_menu_set_checked', { id: 'view.page-width.full', checked: false }]
    ])
    expect(warnSpy.mock.calls.map((c) => String(c[0]))).toEqual(
      expect.arrayContaining([expect.stringContaining('BLOCK_PAGE_WIDTH_MENU_STATE_FAILED')])
    )
  })

  it('pushViewMenuCheck swallows a rejecting backend without throwing', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    invoke.mockRejectedValue(new Error('menu gone'))

    await expect(
      pushViewMenuCheck('view.outline', false)
    ).resolves.toBeUndefined()
    expect(warnSpy).toHaveBeenCalledTimes(1)

    await expect(
      pushViewMenuCheck('view.page-width.wide', true)
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
