// FILE: tests/renderer/store/pinned.test.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: C-51 T-002 unit tests for store/pinned.js — pin/unpin/toggle, append order, drag reorder bounds, persistence through the ipcPrefs key, load sanitizing, and the SIDEBAR::pin-file + TABS::pin-file wiring.
//   SCOPE: Pinia store actions over the mocked @tauri-apps/api/core invoke; project-store bus handler dispatch.
//   DEPENDS: src/renderer/src/store/pinned.js, src/renderer/src/store/project.js, tests/renderer/setup.ts (invoke mock + window shims).
//   LINKS: .grace/changes/active/C-51 T-002; .grace/verification/runtime.xml V-M-011.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   prefsStore - in-test backing map for mt::prefs::get / mt::prefs::set.
//   installPrefsInvoke - per-test invoke implementation over prefsStore.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - 2026-10-16 C-51 T-002: initial tests.
// END_CHANGE_SUMMARY

import { setupTestPinia } from '../pinia'
import { invoke } from '@tauri-apps/api/core'
import { usePinnedStore, PINNED_FILES_KEY } from '@/store/pinned'

vi.mock('@/bus', () => ({
  default: { on: vi.fn(), off: vi.fn(), emit: vi.fn() }
}))

vi.mock('@/services/notification', () => ({
  default: { notify: vi.fn() }
}))

// Backing map so persistence round-trips like the real prefs store.
const prefsStore = new Map()

const installPrefsInvoke = () => {
  prefsStore.clear()
  // ipcInvoke translates 'mt::prefs::*' to 'mt_prefs_*' before invoke.
  invoke.mockImplementation(async (cmd, args) => {
    if (cmd === 'mt_prefs_get') {
      return prefsStore.has(args?.key) ? prefsStore.get(args?.key) : null
    }
    if (cmd === 'mt_prefs_set') {
      prefsStore.set(args?.key, args?.value)
      return null
    }
    return undefined
  })
}

describe('store/pinned.js (C-51 T-002)', () => {
  beforeEach(() => {
    installPrefsInvoke()
    setupTestPinia()
  })

  it('pins a file, appends further pins in order and persists each write', async () => {
    const pinned = usePinnedStore()
    expect(await pinned.PIN_FILE('/tmp/a.md')).toBe(true)
    expect(await pinned.PIN_FILE('/tmp/b.md')).toBe(true)
    // duplicate pin is a no-op
    expect(await pinned.PIN_FILE('/tmp/a.md')).toBe(false)

    expect(pinned.pinnedFiles).toEqual(['/tmp/a.md', '/tmp/b.md'])
    expect(prefsStore.get(PINNED_FILES_KEY)).toEqual(['/tmp/a.md', '/tmp/b.md'])
    expect(pinned.isPinned('/tmp/a.md')).toBe(true)
    expect(pinned.isPinned('/tmp/zz.md')).toBe(false)
  })

  it('unpins and toggles', async () => {
    const pinned = usePinnedStore()
    await pinned.PIN_FILE('/tmp/a.md')
    await pinned.PIN_FILE('/tmp/b.md')

    expect(await pinned.UNPIN_FILE('/tmp/a.md')).toBe(true)
    expect(pinned.pinnedFiles).toEqual(['/tmp/b.md'])
    expect(await pinned.UNPIN_FILE('/tmp/a.md')).toBe(false)

    // toggle flips both ways
    expect(await pinned.TOGGLE_PIN('/tmp/c.md')).toBe(true)
    expect(await pinned.TOGGLE_PIN('/tmp/c.md')).toBe(false)
    expect(pinned.pinnedFiles).toEqual(['/tmp/b.md'])
  })

  it('reorders by drag move and persists the new order', async () => {
    const pinned = usePinnedStore()
    await pinned.PIN_FILE('/tmp/1.md')
    await pinned.PIN_FILE('/tmp/2.md')
    await pinned.PIN_FILE('/tmp/3.md')

    // drag the first row onto the last position
    expect(await pinned.MOVE_PINNED({ from: 0, to: 2 })).toBe(true)
    expect(pinned.pinnedFiles).toEqual(['/tmp/2.md', '/tmp/3.md', '/tmp/1.md'])
    expect(prefsStore.get(PINNED_FILES_KEY)).toEqual(['/tmp/2.md', '/tmp/3.md', '/tmp/1.md'])

    // out-of-range / same-position drops are no-ops
    expect(await pinned.MOVE_PINNED({ from: 0, to: 5 })).toBe(false)
    expect(await pinned.MOVE_PINNED({ from: 1, to: 1 })).toBe(false)
    expect(pinned.pinnedFiles).toEqual(['/tmp/2.md', '/tmp/3.md', '/tmp/1.md'])
  })

  it('loads the persisted list and sanitizes corrupt entries', async () => {
    prefsStore.set(PINNED_FILES_KEY, ['/tmp/a.md', 42, '', '/tmp/b.md', '/tmp/a.md'])
    const pinned = usePinnedStore()
    expect(await pinned.LOAD_PINNED_FILES()).toEqual(['/tmp/a.md', '/tmp/b.md'])
    expect(pinned.pinnedFiles).toEqual(['/tmp/a.md', '/tmp/b.md'])
  })

  it('keeps state when the prefs backend is degraded', async () => {
    invoke.mockImplementation(async (cmd) => {
      if (cmd === 'mt_prefs_get') throw new Error('degraded')
      if (cmd === 'mt_prefs_set') throw new Error('degraded')
      return undefined
    })
    const pinned = usePinnedStore()
    await expect(pinned.LOAD_PINNED_FILES()).resolves.toEqual([])
    // in-memory pin still works; persistence failure does not throw
    await expect(pinned.PIN_FILE('/tmp/x.md')).resolves.toBe(true)
    expect(pinned.pinnedFiles).toEqual(['/tmp/x.md'])
  })

  it('SIDEBAR::pin-file toggles the project store active item (tree context menu path)', async () => {
    const bus = (await import('@/bus')).default
    const { useProjectStore } = await import('@/store/project')
    const projectStore = useProjectStore()
    const pinned = usePinnedStore()
    projectStore.LISTEN_FOR_SIDEBAR_CONTEXT_MENU()

    const handler = bus.on.mock.calls.find((c) => c[0] === 'SIDEBAR::pin-file')[1]
    projectStore.activeItem = { pathname: '/tmp/tree-file.md', isFile: true }
    handler()
    await new Promise((r) => setTimeout(r, 0))
    expect(pinned.pinnedFiles).toEqual(['/tmp/tree-file.md'])

    // second invocation unpins (toggle)
    handler()
    await new Promise((r) => setTimeout(r, 0))
    expect(pinned.pinnedFiles).toEqual([])
  })

  it('TABS::pin-file toggles the tab pathname (tab context menu path)', async () => {
    const bus = (await import('@/bus')).default
    const { HANDLERS } = await import('@/contextMenu/tabs/menuItems')
    const pinned = usePinnedStore()

    // contextMenu/tabs/actions.pinFile emits TABS::pin-file; tabs.vue's
    // handler resolves the tab id → pathname → TOGGLE_PIN. Simulate the
    // registered handler with the same lookup it performs.
    const tabs = [{ id: 't1', pathname: '/tmp/tab-file.md' }, { id: 't2' }]
    bus.on.mockImplementation(() => {})
    HANDLERS.pinFile('t1')
    expect(bus.emit).toHaveBeenCalledWith('TABS::pin-file', 't1')

    const onPinFile = (tabId) => {
      const tab = tabs.find((f) => f.id === tabId)
      if (!tab || !tab.pathname) return
      pinned.TOGGLE_PIN(tab.pathname)
    }
    onPinFile('t2') // untitled tab → no-op
    expect(pinned.pinnedFiles).toEqual([])
    onPinFile('t1')
    await new Promise((r) => setTimeout(r, 0))
    expect(pinned.pinnedFiles).toEqual(['/tmp/tab-file.md'])
  })
})
