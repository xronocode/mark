// FILE: tests/renderer/whatsNew/gate.test.js
// VERSION: 1.2.0
// START_MODULE_CONTRACT
//   PURPOSE: Pin the C-48 What's New startup gate — fresh install records
//            silently, an upgrade shows the sheet once and stamps
//            lastUpdateAt, the same version does nothing, a downgrade
//            records without a sheet — plus the beta-normalization and
//            no-content corners, with a fake clock.
//   SCOPE: evaluateWhatsNewGate pure decision + initWhatsNew persistence
//          writes through an injected fake ipcPrefs.
//   DEPENDS: src/renderer/src/whatsNew/gate.js, src/renderer/src/whatsNew/data.js.
//   LINKS: .grace/changes/archive/C-48/spec.xml R-1; V-M-011 scenario-46.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   NOW - fixed fake-clock instant shared by every case.
//   NOW_SECS - NOW as unix seconds (m005 mt_migration.marker_written_at unit).
//   makeFakeIpc - in-memory prefs facade (get/set/getAll) capturing set() calls.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.2.0 - 2026-10-18 release 2.5.0: What's New pins move to the 2.5.0 sheet (the previous release 2.4.0 becomes the upgrade source).
//   v1.1.0 - 2026-10-15 C-48 review fix: legacy-install pins —
//   a 2.3.0 profile (no lastSeenVersion, but an old mt_migration marker or
//   session/recent-folder history) is an upgrade and shows the sheet once;
//   a profile with only a fresh marker stays a silent fresh install;
//   snapshotBootPrefs degrades to null; resolveWhatsNewVersion fallback.
//   MODULE_MAP synced.
//   PREV: v1.0.0 - 2026-10-15 C-48 T-001: initial pins.
// END_CHANGE_SUMMARY

import { describe, it, expect, vi } from 'vitest'
import {
  evaluateWhatsNewGate,
  detectLegacyInstall,
  snapshotBootPrefs,
  LEGACY_MARKER_MIN_AGE_MS,
  initWhatsNew,
  getRunningVersion,
  LAST_SEEN_VERSION_KEY,
  LAST_UPDATE_AT_KEY
} from '@/whatsNew/gate'
import { getWhatsNewItems, resolveWhatsNewVersion, WHATS_NEW_MAX_ITEMS } from '@/whatsNew/data'

const NOW = new Date('2026-10-15T10:30:00')
const NOW_SECS = Math.floor(NOW.getTime() / 1000)

// TOP-LEVEL fake prefs facade (TEST/LOCALS: top-level locals only).
const makeFakeIpc = (initial = {}) => {
  const store = { ...initial }
  const calls = []
  return {
    calls,
    async get(key) {
      return key in store ? store[key] : null
    },
    async set(key, value) {
      store[key] = value
      calls.push({ key, value })
    },
    async getAll() {
      return { ...store }
    }
  }
}

describe('whatsNew/data', () => {
  it('ships exactly four items for 2.5.0 and clamps to the cap', () => {
    expect(getWhatsNewItems('2.5.0')).toHaveLength(4)
    expect(WHATS_NEW_MAX_ITEMS).toBe(4)
    expect(getWhatsNewItems('2.5.0').length).toBeLessThanOrEqual(WHATS_NEW_MAX_ITEMS)
  })

  it('normalizes prerelease decorations before the content lookup', () => {
    expect(getWhatsNewItems('2.5.0-beta')).toEqual(getWhatsNewItems('2.5.0'))
    expect(getWhatsNewItems('v2.5.0')).toEqual(getWhatsNewItems('2.5.0'))
  })

  it('returns [] for a version with no content (never an empty sheet)', () => {
    expect(getWhatsNewItems('9.9.9')).toEqual([])
  })

  it('resolveWhatsNewVersion keeps a version with content and falls back to the newest otherwise', () => {
    expect(resolveWhatsNewVersion('2.5.0-beta')).toBe('2.5.0')
    expect(resolveWhatsNewVersion('2.5.1')).toBe('2.5.0')
    expect(resolveWhatsNewVersion('0.0.0')).toBe('2.5.0')
    expect(getWhatsNewItems(resolveWhatsNewVersion('garbage')).length).toBeGreaterThan(0)
  })
})

describe('whatsNew/gate — evaluateWhatsNewGate', () => {
  it('fresh install: records silently, never shows, flags firstLaunch', () => {
    const out = evaluateWhatsNewGate({ recorded: '', running: '2.5.0', now: NOW })
    expect(out.show).toBe(false)
    expect(out.recordVersion).toBe('2.5.0')
    expect(out.stampUpdateAt).toBe(false)
    expect(out.versionChanged).toBe(false)
    expect(out.firstLaunch).toBe(true)
  })

  it('fresh install with a null/undefined recorded value behaves the same', () => {
    for (const recorded of [null, undefined]) {
      const out = evaluateWhatsNewGate({ recorded, running: '2.5.0', now: NOW })
      expect(out.show).toBe(false)
      expect(out.firstLaunch).toBe(true)
    }
  })

  it('upgrade 2.4.0 → 2.5.0: shows once, records, stamps lastUpdateAt', () => {
    const out = evaluateWhatsNewGate({ recorded: '2.4.0', running: '2.5.0', now: NOW })
    expect(out.show).toBe(true)
    expect(out.recordVersion).toBe('2.5.0')
    expect(out.stampUpdateAt).toBe(true)
    expect(out.stampedAt).toBe(NOW.toISOString())
    expect(out.versionChanged).toBe(true)
    expect(out.firstLaunch).toBe(false)
  })

  it('same version: nothing at all (no write, no sheet)', () => {
    const out = evaluateWhatsNewGate({ recorded: '2.5.0', running: '2.5.0', now: NOW })
    expect(out.show).toBe(false)
    expect(out.recordVersion).toBeNull()
    expect(out.stampUpdateAt).toBe(false)
    expect(out.versionChanged).toBe(false)
  })

  it('downgrade 2.5.0 → 2.4.0: records silently, no sheet, no stamp', () => {
    const out = evaluateWhatsNewGate({ recorded: '2.5.0', running: '2.4.0', now: NOW })
    expect(out.show).toBe(false)
    expect(out.recordVersion).toBe('2.4.0')
    expect(out.stampUpdateAt).toBe(false)
    // Still a changed version — the review flow must treat it as one.
    expect(out.versionChanged).toBe(true)
  })

  it('beta → GA of the same triple is the SAME version (no second sheet)', () => {
    const out = evaluateWhatsNewGate({ recorded: '2.5.0-beta', running: '2.5.0', now: NOW })
    expect(out.show).toBe(false)
    expect(out.recordVersion).toBeNull()
  })

  it('GA → beta of a NEWER triple upgrades and shows the release content', () => {
    const out = evaluateWhatsNewGate({ recorded: '2.4.0', running: '2.5.0-beta.2', now: NOW })
    expect(out.show).toBe(true)
    expect(out.recordVersion).toBe('2.5.0')
  })

  it('upgrade to a version with no content records silently and stamps nothing', () => {
    const out = evaluateWhatsNewGate({ recorded: '2.5.0', running: '9.9.9', now: NOW })
    expect(out.show).toBe(false)
    expect(out.recordVersion).toBe('9.9.9')
    expect(out.stampUpdateAt).toBe(false)
    expect(out.versionChanged).toBe(true)
  })
})

describe('whatsNew/gate — detectLegacyInstall', () => {
  it('a fresh profile (marker stamped seconds ago, nothing else) is not legacy', () => {
    const prefs = { mt_migration: { app_version: 'alpha', schema_version: 1, marker_written_at: NOW_SECS - 5 } }
    expect(detectLegacyInstall(prefs, NOW)).toEqual({ legacy: false, signals: [] })
  })

  it('an mt_migration marker older than the slack window proves an existing profile', () => {
    const old = NOW_SECS - Math.ceil(LEGACY_MARKER_MIN_AGE_MS / 1000) - 1
    const out = detectLegacyInstall({ mt_migration: { marker_written_at: old } }, NOW)
    expect(out.legacy).toBe(true)
    expect(out.signals).toEqual(['migrationMarker'])
  })

  it('non-empty lastSessionTabs / recentFolders prove earlier use', () => {
    expect(detectLegacyInstall({ lastSessionTabs: ['/a.md'] }, NOW).signals).toEqual(['lastSessionTabs'])
    expect(detectLegacyInstall({ recentFolders: ['/p'] }, NOW).signals).toEqual(['recentFolders'])
    expect(detectLegacyInstall({ lastSessionTabs: [], recentFolders: [] }, NOW).legacy).toBe(false)
  })

  it('ordinary preference keys, recentDocuments and workspaceRoot are NOT signals (fresh-launch writable)', () => {
    const prefs = {
      theme: 'dark',
      fontSize: 18,
      recentDocuments: ['/opened-from-finder.md'],
      workspaceRoot: '/cli-folder',
      mt_migration: { marker_written_at: NOW_SECS }
    }
    expect(detectLegacyInstall(prefs, NOW).legacy).toBe(false)
  })

  it('null / garbage snapshots degrade to not-legacy', () => {
    for (const prefs of [null, undefined, 'x', 42]) {
      expect(detectLegacyInstall(prefs, NOW).legacy).toBe(false)
    }
    expect(detectLegacyInstall({ mt_migration: { marker_written_at: 'soon' } }, NOW).legacy).toBe(false)
  })
})

describe('whatsNew/gate — legacy (pre-C-48) upgrade', () => {
  it('no recorded version + legacy profile → upgrade: shows once, records, stamps', () => {
    const out = evaluateWhatsNewGate({ recorded: '', running: '2.5.0', now: NOW, legacyInstall: true })
    expect(out.show).toBe(true)
    expect(out.recordVersion).toBe('2.5.0')
    expect(out.stampUpdateAt).toBe(true)
    expect(out.versionChanged).toBe(true)
    expect(out.firstLaunch).toBe(false)
    expect(out.legacyUpgrade).toBe(true)
  })

  it('initWhatsNew: a 2.3.0 profile (old marker + session tabs, no lastSeenVersion) shows the sheet', async () => {
    const ipc = makeFakeIpc({
      mt_migration: { marker_written_at: NOW_SECS - 30 * 86400 },
      lastSessionTabs: ['/notes/a.md'],
      theme: 'dark'
    })
    const out = await initWhatsNew({ ipc, running: '2.5.0', now: NOW })
    expect(out.show).toBe(true)
    expect(out.firstLaunch).toBe(false)
    expect(ipc.calls).toEqual([
      { key: LAST_SEEN_VERSION_KEY, value: '2.5.0' },
      { key: LAST_UPDATE_AT_KEY, value: NOW.toISOString() }
    ])
    // Recorded now — the next boot is "same version" and never re-shows.
    const again = await initWhatsNew({ ipc, running: '2.5.0', now: NOW })
    expect(again.show).toBe(false)
  })

  it('initWhatsNew: a fresh profile (only a just-stamped marker) records silently', async () => {
    const ipc = makeFakeIpc({ mt_migration: { marker_written_at: NOW_SECS - 2 } })
    const out = await initWhatsNew({ ipc, running: '2.5.0', now: NOW })
    expect(out.show).toBe(false)
    expect(out.firstLaunch).toBe(true)
    expect(ipc.calls).toEqual([{ key: LAST_SEEN_VERSION_KEY, value: '2.5.0' }])
  })

  it('initWhatsNew reads legacy signals from the injected boot snapshot, not the live store', async () => {
    // The live store already has boot-time writes; the pre-boot snapshot
    // is what decides.
    const ipc = makeFakeIpc({ lastSessionTabs: ['/written-this-boot.md'] })
    const fresh = await initWhatsNew({
      ipc,
      running: '2.5.0',
      now: NOW,
      bootPrefs: Promise.resolve({ mt_migration: { marker_written_at: NOW_SECS } })
    })
    expect(fresh.show).toBe(false)

    const ipc2 = makeFakeIpc({})
    const legacy = await initWhatsNew({
      ipc: ipc2,
      running: '2.5.0',
      now: NOW,
      bootPrefs: Promise.resolve({ recentFolders: ['/p'] })
    })
    expect(legacy.show).toBe(true)
  })

  it('snapshotBootPrefs degrades to null without getAll or on a failing read', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(await snapshotBootPrefs({ get: async () => null })).toBeNull()
    expect(
      await snapshotBootPrefs({
        getAll: async () => {
          throw new Error('ipc down')
        }
      })
    ).toBeNull()
    expect(await snapshotBootPrefs(makeFakeIpc({ a: 1 }))).toEqual({ a: 1 })
    warn.mockRestore()
  })
})

describe('whatsNew/gate — initWhatsNew persistence', () => {
  it('fresh install writes only lastSeenVersion (silent record)', async () => {
    const ipc = makeFakeIpc()
    const out = await initWhatsNew({ ipc, running: '2.5.0', now: NOW })
    expect(out.show).toBe(false)
    expect(ipc.calls).toEqual([{ key: LAST_SEEN_VERSION_KEY, value: '2.5.0' }])
  })

  it('upgrade writes lastSeenVersion and lastUpdateAt (ISO)', async () => {
    const ipc = makeFakeIpc({ [LAST_SEEN_VERSION_KEY]: '2.3.0' })
    const out = await initWhatsNew({ ipc, running: '2.5.0', now: NOW })
    expect(out.show).toBe(true)
    expect(ipc.calls).toEqual([
      { key: LAST_SEEN_VERSION_KEY, value: '2.5.0' },
      { key: LAST_UPDATE_AT_KEY, value: NOW.toISOString() }
    ])
  })

  it('same version performs no writes at all', async () => {
    const ipc = makeFakeIpc({ [LAST_SEEN_VERSION_KEY]: '2.5.0' })
    const out = await initWhatsNew({ ipc, running: '2.5.0', now: NOW })
    expect(out.show).toBe(false)
    expect(ipc.calls).toEqual([])
  })

  it('a failing ipc read degrades to the fresh-install path (records)', async () => {
    const ipc = {
      get: async () => {
        throw new Error('prefs unavailable')
      },
      set: async () => {}
    }
    const out = await initWhatsNew({ ipc, running: '2.5.0', now: NOW })
    expect(out.show).toBe(false)
    expect(out.firstLaunch).toBe(true)
  })

  it('uses the real ipcPrefs facade (mocked tauri invoke) when none is injected', async () => {
    const out = await initWhatsNew({ running: '2.5.0', now: NOW })
    expect(out.show).toBe(false)
    expect(out.firstLaunch).toBe(true)
    expect(out.recordVersion).toBe('2.5.0')
  })
})

describe('whatsNew/gate — getRunningVersion', () => {
  it('prefers the e2e override global and falls back to the safe default', () => {
    globalThis.__APP_VERSION_OVERRIDE__ = '9.8.7'
    expect(getRunningVersion()).toBe('9.8.7')
    delete globalThis.__APP_VERSION_OVERRIDE__
    // No __APP_VERSION__ define in the vitest pipeline — the typeof guard
    // must degrade instead of throwing.
    expect(getRunningVersion()).toBe('0.0.0')
  })
})
