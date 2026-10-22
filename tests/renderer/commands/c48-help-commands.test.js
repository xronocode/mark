// FILE: tests/renderer/commands/c48-help-commands.test.js
// VERSION: 1.2.0
// START_MODULE_CONTRACT
//   PURPOSE: Pin the C-48 Help commands — help.rate opens the https App
//            Store write-review URL (inside the MAS opener:default scope)
//            and swallows an opener rejection with a log marker;
//            help.whats-new always opens a version that has content.
//   SCOPE: commands/index.js help.rate + help.whats-new execute paths with
//          mocked bus/stores/i18n and the setup.ts window.electron double.
//   DEPENDS: Vitest, @/commands/index, @/whatsNew/data.
//   LINKS: .grace/changes/archive/C-48/spec.xml R-1, R-2; V-M-011 scenario-46.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   findCmd - registry lookup by command id.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.3.0 - 2026-10-22 release 2.7.0 draft: the latest-with-content fallback follows the reviewed 2.7.0 sheet while publication remains separately authorized.
//   PREV: v1.1.0 - 2026-10-18 release 2.5.0: What's New pins move to the 2.5.0 sheet (the previous release 2.4.0 becomes the upgrade source).
//   v1.0.0 - 2026-10-15 C-48 review fix: initial pins (https
//   rate URL + rejection catch; What's New latest-with-content fallback).
// END_CHANGE_SUMMARY

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@/i18n', () => ({ t: (key) => `t:${key}` }))
vi.mock('@/services/notification', () => ({ default: { notify: vi.fn() } }))
vi.mock('@/bus', () => ({ default: { emit: vi.fn(), on: vi.fn(), off: vi.fn() } }))
vi.mock('@/util', () => ({
  delay: () => Promise.resolve(),
  isOsx: true,
  isWindows: false,
  isLinux: false,
  getUniqueId: () => 'id'
}))
vi.mock('@/store/preferences', () => ({ usePreferencesStore: () => ({}) }))
vi.mock('@/commands/utils', () => ({ isUpdatable: () => false }))
vi.mock('@/store/project', () => ({ useProjectStore: () => ({}) }))
vi.mock('@/store/editor', () => ({ useEditorStore: () => ({ currentFile: null }) }))

import commands, { RATE_MARK_URL } from '@/commands/index'
import bus from '@/bus'
import { getWhatsNewItems } from '@/whatsNew/data'

const findCmd = (id) => commands.find((c) => c.id === id)

describe('C-48 help.rate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('opens the https App Store write-review URL (never macappstore://)', async () => {
    await findCmd('help.rate').execute()
    expect(window.electron.shell.openExternal).toHaveBeenCalledWith(RATE_MARK_URL)
    const url = window.electron.shell.openExternal.mock.calls[0][0]
    expect(url.startsWith('https://apps.apple.com/')).toBe(true)
    expect(url).toContain('id6814590464')
    expect(url).toContain('action=write-review')
  })

  it('an opener rejection is caught and logged, never unhandled', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    window.electron.shell.openExternal.mockRejectedValueOnce(new Error('not allowed by scope'))
    await expect(findCmd('help.rate').execute()).resolves.toBeUndefined()
    expect(err).toHaveBeenCalledWith(
      '[commands][help.rate][BLOCK_OPEN_REVIEW_PAGE_FAILED]',
      expect.any(Error)
    )
    err.mockRestore()
  })
})

describe('C-48 help.whats-new', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    delete globalThis.__APP_VERSION_OVERRIDE__
  })

  it('a running version with content opens its own notes', async () => {
    globalThis.__APP_VERSION_OVERRIDE__ = '2.5.0'
    await findCmd('help.whats-new').execute()
    expect(bus.emit).toHaveBeenCalledWith('whatsNewDialog', { version: '2.5.0' })
  })

  it('a running version without content falls back to the newest release that has some', async () => {
    globalThis.__APP_VERSION_OVERRIDE__ = '2.5.1'
    await findCmd('help.whats-new').execute()
    const [event, payload] = bus.emit.mock.calls[0]
    expect(event).toBe('whatsNewDialog')
    expect(payload.version).toBe('2.7.0')
    expect(getWhatsNewItems(payload.version).length).toBeGreaterThan(0)
  })
})
