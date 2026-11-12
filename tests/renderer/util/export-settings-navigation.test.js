// FILE: tests/renderer/util/export-settings-navigation.test.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Prove Export settings navigation uses the existing remembered-tab key before requesting the existing Settings window.
//   SCOPE: New/existing windows, repeated requests and unavailable storage; no export, new IPC or private bridge.
//   DEPENDS: Vitest, actual tab catalog, injected project window action.
//   LINKS: M-072; V-M-072; C-EXPORT-SETTINGS-SECTION.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
// START_MODULE_MAP
//   openWindow - Existing project-store action boundary.
// END_MODULE_MAP
// START_CHANGE_SUMMARY
//   LAST_CHANGE: 2026-11-12 C-EXPORT-SETTINGS-SECTION: fresh/existing Settings and truthful storage outcomes.
// END_CHANGE_SUMMARY

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LAST_TAB_STORAGE_KEY } from '@/prefComponents/tabsBar/config'
import { openExportSettings } from '@/util/exportSettingsNavigation'

const { openWindow } = vi.hoisted(() => ({ openWindow: vi.fn() }))
vi.mock('@/store/project', () => ({ useProjectStore: () => ({ OPEN_SETTING_WINDOW: openWindow }) }))

describe('Export settings navigation', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
    openWindow.mockReset().mockResolvedValue(undefined)
  })

  it('remembers Export before a newly opened Settings window resolves its root', async () => {
    localStorage.setItem('unrelated', 'keep')
    openWindow.mockImplementation(async () => {
      expect(localStorage.getItem(LAST_TAB_STORAGE_KEY)).toBe('export')
    })
    expect(await openExportSettings()).toBe(true)
    expect(openWindow).toHaveBeenCalledTimes(1)
    expect(localStorage.getItem('unrelated')).toBe('keep')
  })

  it('writes the same existing key for an already-open window', async () => {
    localStorage.setItem(LAST_TAB_STORAGE_KEY, 'appearance')
    expect(await openExportSettings()).toBe(true)
    expect(localStorage.getItem(LAST_TAB_STORAGE_KEY)).toBe('export')
    expect(openWindow).toHaveBeenCalledTimes(1)
  })

  it('refreshes repeated requests even when the persisted tab already says Export', async () => {
    localStorage.setItem(LAST_TAB_STORAGE_KEY, 'export')
    const remove = vi.spyOn(Storage.prototype, 'removeItem')
    expect(await openExportSettings()).toBe(true)
    expect(remove).toHaveBeenCalledWith(LAST_TAB_STORAGE_KEY)
    expect(localStorage.getItem(LAST_TAB_STORAGE_KEY)).toBe('export')
    expect(openWindow).toHaveBeenCalledTimes(1)
  })

  it('still requests Settings and reports false when the tab write fails', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked') })
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(await openExportSettings()).toBe(false)
    expect(openWindow).toHaveBeenCalledTimes(1)
    expect(warning).toHaveBeenCalledWith(expect.stringContaining('BLOCK_EXPORT_SETTINGS_STORAGE_UNAVAILABLE'))
  })

  it('reports an unavailable repeated-request refresh without claiming cross-window navigation', async () => {
    localStorage.setItem(LAST_TAB_STORAGE_KEY, 'export')
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new Error('blocked') })
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(await openExportSettings()).toBe(false)
    expect(openWindow).toHaveBeenCalledTimes(1)
  })
})
