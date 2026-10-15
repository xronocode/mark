// FILE: src/renderer/src/whatsNew/gate.js
// VERSION: 1.1.0
// START_MODULE_CONTRACT
//   PURPOSE: C-48 What's New startup gate — decide, from the persisted
//            lastSeenVersion and the running version, whether the sheet
//            shows once on this launch, and what to persist.
//   SCOPE: pure decision function + legacy-install detection (pre-C-48
//          profiles without lastSeenVersion) + the boot-time init that
//          reads/writes the prefs keys (lastSeenVersion, lastUpdateAt)
//          via ipcPrefs.
//   DEPENDS: util/version.js; whatsNew/data.js; ipc/runtime prefs;
//          @tauri-apps/api/core is never imported here directly — the
//          ipcPrefs facade is injectable for tests.
//   LINKS: .grace/changes/archive/C-48/spec.xml R-1; pages/app.vue calls
//          initWhatsNew at boot; C-46's welcome footer reads lastUpdateAt.
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   LAST_SEEN_VERSION_KEY - prefs key persisting the last seen version.
//   LAST_UPDATE_AT_KEY - prefs key with the ISO timestamp of the last update (C-46 footer, 7-day window).
//   LEGACY_MARKER_MIN_AGE_MS - minimum age of the m005 mt_migration marker that proves a pre-existing profile.
//   detectLegacyInstall - pure: does a prefs snapshot belong to an already-used (pre-C-48) install?
//   evaluateWhatsNewGate - pure gate: fresh install records silently, upgrade (incl. legacy profile) shows once, downgrade records silently.
//   snapshotBootPrefs - start the boot prefs snapshot (getAll) before this boot writes anything; never rejects.
//   getRunningVersion - __APP_VERSION__ (with an e2e override hook).
//   initWhatsNew - boot init: read, evaluate, persist, return the outcome for the caller to open the sheet.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.1.0 - 2026-10-15 C-48 review fix: 2.3.0 profiles carry
//   no lastSeenVersion, so the gate treated every existing user as a fresh
//   install and the 2.3.1 sheet never showed. detectLegacyInstall reads a
//   boot prefs snapshot (mt_migration.marker_written_at older than 1 h, or
//   non-empty lastSessionTabs / recentFolders) and evaluateWhatsNewGate
//   treats "no recorded version + legacy" as an upgrade. Fixed the
//   downgrade-branch comment (an unparseable recorded string sorts below a
//   parseable running version, so it takes the upgrade branch, not this one).
//   PREV: v1.0.0 - 2026-10-15 C-48 T-001: initial module.
// END_CHANGE_SUMMARY

import { compareVersions, normalizeVersion } from '../util/version'
import { getWhatsNewItems } from './data'

export const LAST_SEEN_VERSION_KEY = 'lastSeenVersion'
export const LAST_UPDATE_AT_KEY = 'lastUpdateAt'

// START_BLOCK_DETECT_LEGACY_INSTALL
// Profiles written by 2.3.0 and earlier have no lastSeenVersion, so "no
// recorded version" alone cannot tell a fresh install from an existing
// user. Signals (read from a prefs snapshot taken before this boot
// writes anything):
//   - mt_migration.marker_written_at (unix seconds) — m005 stamps it on
//     the very first Rust boot of a profile and never rewrites it. On a
//     fresh install it is seconds old; on an existing profile it predates
//     this launch. One hour of slack absorbs clock jitter.
//   - non-empty lastSessionTabs / recentFolders — only written after the
//     user opened files or folders in an earlier session.
// Deliberately NOT signals: recentDocuments / workspaceRoot (a first
// launch via Finder or the CLI can write them before the gate runs) and
// ordinary preference keys (the e2e shim and future boot code may seed
// them; a false "upgrade" would show the sheet on a fresh install).
export const LEGACY_MARKER_MIN_AGE_MS = 60 * 60 * 1000

export const detectLegacyInstall = (prefs, now = new Date()) => {
  if (!prefs || typeof prefs !== 'object') return { legacy: false, signals: [] }
  const signals = []
  const marker = prefs.mt_migration
  const writtenAt = marker && typeof marker === 'object' ? Number(marker.marker_written_at) : NaN
  const nowMs = now instanceof Date ? now.getTime() : Number(now)
  if (
    Number.isFinite(writtenAt) &&
    writtenAt > 0 &&
    Number.isFinite(nowMs) &&
    nowMs - writtenAt * 1000 >= LEGACY_MARKER_MIN_AGE_MS
  ) {
    signals.push('migrationMarker')
  }
  for (const key of ['lastSessionTabs', 'recentFolders']) {
    if (Array.isArray(prefs[key]) && prefs[key].length > 0) signals.push(key)
  }
  return { legacy: signals.length > 0, signals }
}
// END_BLOCK_DETECT_LEGACY_INSTALL

// START_BLOCK_SNAPSHOT_BOOT_PREFS
// pages/app.vue calls this first thing in onMounted — before hydration,
// the legacy zoom migration or session restore can write — and hands the
// promise to initWhatsNew. Resolves null on any failure (no getAll on the
// facade, IPC error) so the gate degrades to "no legacy signals".
export const snapshotBootPrefs = async (ipc = null) => {
  try {
    const facade = ipc || (await import('../ipc/runtime')).ipcPrefs
    if (!facade || typeof facade.getAll !== 'function') return null
    const all = await facade.getAll()
    return all && typeof all === 'object' ? all : null
  } catch (e) {
    console.warn('[whatsNew][snapshotBootPrefs][BLOCK_SNAPSHOT_FAILED]', e)
    return null
  }
}
// END_BLOCK_SNAPSHOT_BOOT_PREFS

// START_BLOCK_GET_RUNNING_VERSION
// __APP_VERSION__ is a vite define (package.json version). e2e drives the
// gate against shipped content ("2.3.1") that may differ from the dev
// build's version, so Playwright sets __APP_VERSION_OVERRIDE__ in an
// addInitScript before the renderer loads.
export const getRunningVersion = () => {
  if (typeof globalThis.__APP_VERSION_OVERRIDE__ === 'string') {
    return globalThis.__APP_VERSION_OVERRIDE__
  }
  // eslint-disable-next-line no-undef
  return typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.0.0'
}
// END_BLOCK_GET_RUNNING_VERSION

// START_BLOCK_EVALUATE_WHATS_NEW_GATE
// Pure gate, fake-clock friendly (all time flows in via `now`).
//
//   no recorded version  → fresh install: record silently, never show
//     … + legacyInstall   → a pre-C-48 profile (2.3.0 never recorded the
//                          version): treated as an upgrade below
//   recorded === running → nothing to do (no write, no sheet)
//   running < recorded   → downgrade: record silently, no sheet, no stamp
//   running > recorded   → upgrade: show once (only when the running
//                          version has content), record, stamp
//                          lastUpdateAt for the C-46 7-day footer window
//
// Versions normalize first, so "2.3.1-beta" and "2.3.1" are the same
// version and a beta→GA flip never re-shows the sheet. Returns:
//   { show, version, recordVersion, stampUpdateAt, versionChanged, firstLaunch }
//   recordVersion null → no prefs write needed; stampUpdateAt true → the
//   caller/init also writes lastUpdateAt (ISO) for this boot's `now`.
export const evaluateWhatsNewGate = ({
  recorded,
  running,
  now = new Date(),
  legacyInstall = false
}) => {
  const runningVersion = normalizeVersion(running)
  const recordedVersion = normalizeVersion(recorded)

  if (!recordedVersion && !legacyInstall) {
    return {
      show: false,
      version: runningVersion,
      recordVersion: runningVersion,
      stampUpdateAt: false,
      versionChanged: false,
      firstLaunch: true
    }
  }

  // A legacy profile has no recorded version to compare — it is by
  // definition older than the running build (C-48 introduced the key).
  const cmp = recordedVersion ? compareVersions(runningVersion, recordedVersion) : 1
  if (cmp === 0) {
    return {
      show: false,
      version: runningVersion,
      recordVersion: null,
      stampUpdateAt: false,
      versionChanged: false,
      firstLaunch: false
    }
  }

  if (cmp < 0) {
    // Downgrade: record what actually runs, but never celebrate it.
    // (An unparseable recorded string never lands here against a real
    // running version: compareVersions sorts the parseable side higher,
    // so a corrupt record is treated as an upgrade below.)
    return {
      show: false,
      version: runningVersion,
      recordVersion: runningVersion,
      stampUpdateAt: false,
      versionChanged: true,
      firstLaunch: false
    }
  }

  // Upgrade: only a version with real content gets the sheet — an entry
  // gap records silently instead of showing an empty sheet, and only a
  // shown sheet stamps lastUpdateAt (the footer link must lead somewhere).
  const hasContent = getWhatsNewItems(runningVersion).length > 0
  return {
    show: hasContent,
    version: runningVersion,
    recordVersion: runningVersion,
    stampUpdateAt: hasContent,
    versionChanged: true,
    firstLaunch: false,
    legacyUpgrade: !recordedVersion,
    stampedAt: now instanceof Date ? now.toISOString() : String(now)
  }
}
// END_BLOCK_EVALUATE_WHATS_NEW_GATE

// START_BLOCK_INIT_WHATS_NEW
// Boot wiring. Reads the recorded version through the ipcPrefs facade
// (injectable), evaluates the gate, persists what the gate says, and
// returns the outcome — the caller decides how to open the sheet
// (pages/app.vue emits whatsNewDialog so the sheet component owns its
// own visibility, focus trap, and Help-menu reopen path).
//
// `bootPrefs` is the snapshotBootPrefs() promise (or object) started
// before this boot wrote anything; without one, init takes its own
// snapshot (unit tests, or a caller that does not care about ordering).
export const initWhatsNew = async ({
  ipc = null,
  running = getRunningVersion(),
  now = new Date(),
  bootPrefs = undefined
} = {}) => {
  let recorded = ''
  try {
    const facade = ipc || (await import('../ipc/runtime')).ipcPrefs
    recorded = (await facade.get(LAST_SEEN_VERSION_KEY)) || ''
  } catch {
    recorded = ''
  }

  let legacyInstall = false
  if (!normalizeVersion(recorded)) {
    const snapshot = bootPrefs === undefined ? await snapshotBootPrefs(ipc) : await bootPrefs
    const { legacy, signals } = detectLegacyInstall(snapshot, now)
    legacyInstall = legacy
    console.log(
      `[whatsNew][init][BLOCK_LEGACY_CHECK legacy=${legacy} signals=${signals.join(',') || 'none'}]`
    )
  }

  const outcome = evaluateWhatsNewGate({ recorded, running, now, legacyInstall })

  if (outcome.recordVersion !== null || outcome.stampUpdateAt) {
    try {
      const facade = ipc || (await import('../ipc/runtime')).ipcPrefs
      if (outcome.recordVersion !== null) {
        await facade.set(LAST_SEEN_VERSION_KEY, outcome.recordVersion)
      }
      if (outcome.stampUpdateAt) {
        await facade.set(
          LAST_UPDATE_AT_KEY,
          outcome.stampedAt || (now instanceof Date ? now.toISOString() : String(now))
        )
      }
    } catch (e) {
      console.error('[whatsNew][init][BLOCK_PERSIST_FAILED]', e)
    }
  }

  if (outcome.show) {
    console.log(`[whatsNew][init][BLOCK_SHEET_QUEUED version=${outcome.version}]`)
  }
  return outcome
}
// END_BLOCK_INIT_WHATS_NEW
