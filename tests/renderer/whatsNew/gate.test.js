// FILE: tests/renderer/whatsNew/gate.test.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Pin the C-48 What's New startup gate — fresh install records
//            silently, an upgrade shows the sheet once and stamps
//            lastUpdateAt, the same version does nothing, a downgrade
//            records without a sheet — plus the beta-normalization and
//            no-content corners, with a fake clock.
//   SCOPE: evaluateWhatsNewGate pure decision + initWhatsNew persistence
//          writes through an injected fake ipcPrefs.
//   DEPENDS: src/renderer/src/whatsNew/gate.js, src/renderer/src/whatsNew/data.js.
//   LINKS: .grace/changes/active/C-48/spec.xml R-1; V-M-011 scenario-46.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   makeFakeIpc - in-memory prefs facade capturing set() calls.
//   freshInstallOutcome / upgradeOutcome - shared expectations helpers.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - 2026-10-15 C-48 T-001: initial pins.
// END_CHANGE_SUMMARY

import { describe, it, expect } from 'vitest'
import {
  evaluateWhatsNewGate,
  initWhatsNew,
  getRunningVersion,
  LAST_SEEN_VERSION_KEY,
  LAST_UPDATE_AT_KEY
} from '@/whatsNew/gate'
import { getWhatsNewItems, WHATS_NEW_MAX_ITEMS } from '@/whatsNew/data'

const NOW = new Date('2026-10-15T10:30:00')

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
    }
  }
}

describe('whatsNew/data', () => {
  it('ships exactly four items for 2.3.1 and clamps to the cap', () => {
    expect(getWhatsNewItems('2.3.1')).toHaveLength(4)
    expect(WHATS_NEW_MAX_ITEMS).toBe(4)
    expect(getWhatsNewItems('2.3.1').length).toBeLessThanOrEqual(WHATS_NEW_MAX_ITEMS)
  })

  it('normalizes prerelease decorations before the content lookup', () => {
    expect(getWhatsNewItems('2.3.1-beta')).toEqual(getWhatsNewItems('2.3.1'))
    expect(getWhatsNewItems('v2.3.1')).toEqual(getWhatsNewItems('2.3.1'))
  })

  it('returns [] for a version with no content (never an empty sheet)', () => {
    expect(getWhatsNewItems('9.9.9')).toEqual([])
  })
})

describe('whatsNew/gate — evaluateWhatsNewGate', () => {
  it('fresh install: records silently, never shows, flags firstLaunch', () => {
    const out = evaluateWhatsNewGate({ recorded: '', running: '2.3.1', now: NOW })
    expect(out.show).toBe(false)
    expect(out.recordVersion).toBe('2.3.1')
    expect(out.stampUpdateAt).toBe(false)
    expect(out.versionChanged).toBe(false)
    expect(out.firstLaunch).toBe(true)
  })

  it('fresh install with a null/undefined recorded value behaves the same', () => {
    for (const recorded of [null, undefined]) {
      const out = evaluateWhatsNewGate({ recorded, running: '2.3.1', now: NOW })
      expect(out.show).toBe(false)
      expect(out.firstLaunch).toBe(true)
    }
  })

  it('upgrade 2.3.0 → 2.3.1: shows once, records, stamps lastUpdateAt', () => {
    const out = evaluateWhatsNewGate({ recorded: '2.3.0', running: '2.3.1', now: NOW })
    expect(out.show).toBe(true)
    expect(out.recordVersion).toBe('2.3.1')
    expect(out.stampUpdateAt).toBe(true)
    expect(out.stampedAt).toBe(NOW.toISOString())
    expect(out.versionChanged).toBe(true)
    expect(out.firstLaunch).toBe(false)
  })

  it('same version: nothing at all (no write, no sheet)', () => {
    const out = evaluateWhatsNewGate({ recorded: '2.3.1', running: '2.3.1', now: NOW })
    expect(out.show).toBe(false)
    expect(out.recordVersion).toBeNull()
    expect(out.stampUpdateAt).toBe(false)
    expect(out.versionChanged).toBe(false)
  })

  it('downgrade 2.3.1 → 2.3.0: records silently, no sheet, no stamp', () => {
    const out = evaluateWhatsNewGate({ recorded: '2.3.1', running: '2.3.0', now: NOW })
    expect(out.show).toBe(false)
    expect(out.recordVersion).toBe('2.3.0')
    expect(out.stampUpdateAt).toBe(false)
    // Still a changed version — the review flow must treat it as one.
    expect(out.versionChanged).toBe(true)
  })

  it('beta → GA of the same triple is the SAME version (no second sheet)', () => {
    const out = evaluateWhatsNewGate({ recorded: '2.3.1-beta', running: '2.3.1', now: NOW })
    expect(out.show).toBe(false)
    expect(out.recordVersion).toBeNull()
  })

  it('GA → beta of a NEWER triple upgrades and shows the release content', () => {
    const out = evaluateWhatsNewGate({ recorded: '2.3.0', running: '2.3.1-beta.2', now: NOW })
    expect(out.show).toBe(true)
    expect(out.recordVersion).toBe('2.3.1')
  })

  it('upgrade to a version with no content records silently and stamps nothing', () => {
    const out = evaluateWhatsNewGate({ recorded: '2.3.1', running: '9.9.9', now: NOW })
    expect(out.show).toBe(false)
    expect(out.recordVersion).toBe('9.9.9')
    expect(out.stampUpdateAt).toBe(false)
    expect(out.versionChanged).toBe(true)
  })
})

describe('whatsNew/gate — initWhatsNew persistence', () => {
  it('fresh install writes only lastSeenVersion (silent record)', async () => {
    const ipc = makeFakeIpc()
    const out = await initWhatsNew({ ipc, running: '2.3.1', now: NOW })
    expect(out.show).toBe(false)
    expect(ipc.calls).toEqual([{ key: LAST_SEEN_VERSION_KEY, value: '2.3.1' }])
  })

  it('upgrade writes lastSeenVersion and lastUpdateAt (ISO)', async () => {
    const ipc = makeFakeIpc({ [LAST_SEEN_VERSION_KEY]: '2.3.0' })
    const out = await initWhatsNew({ ipc, running: '2.3.1', now: NOW })
    expect(out.show).toBe(true)
    expect(ipc.calls).toEqual([
      { key: LAST_SEEN_VERSION_KEY, value: '2.3.1' },
      { key: LAST_UPDATE_AT_KEY, value: NOW.toISOString() }
    ])
  })

  it('same version performs no writes at all', async () => {
    const ipc = makeFakeIpc({ [LAST_SEEN_VERSION_KEY]: '2.3.1' })
    const out = await initWhatsNew({ ipc, running: '2.3.1', now: NOW })
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
    const out = await initWhatsNew({ ipc, running: '2.3.1', now: NOW })
    expect(out.show).toBe(false)
    expect(out.firstLaunch).toBe(true)
  })

  it('uses the real ipcPrefs facade (mocked tauri invoke) when none is injected', async () => {
    const out = await initWhatsNew({ running: '2.3.1', now: NOW })
    expect(out.show).toBe(false)
    expect(out.firstLaunch).toBe(true)
    expect(out.recordVersion).toBe('2.3.1')
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
