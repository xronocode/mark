// FILE: src/renderer/src/whatsNew/gate.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: C-48 What's New startup gate — decide, from the persisted
//            lastSeenVersion and the running version, whether the sheet
//            shows once on this launch, and what to persist.
//   SCOPE: pure decision function + the boot-time init that reads/writes
//          the prefs keys (lastSeenVersion, lastUpdateAt) via ipcPrefs.
//   DEPENDS: util/version.js; whatsNew/data.js; ipc/runtime prefs;
//          @tauri-apps/api/core is never imported here directly — the
//          ipcPrefs facade is injectable for tests.
//   LINKS: .grace/changes/active/C-48/spec.xml R-1; pages/app.vue calls
//          initWhatsNew at boot; C-46's welcome footer reads lastUpdateAt.
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   LAST_SEEN_VERSION_KEY - prefs key persisting the last seen version.
//   LAST_UPDATE_AT_KEY - prefs key with the ISO timestamp of the last update (C-46 footer, 7-day window).
//   evaluateWhatsNewGate - pure gate: fresh install records silently, upgrade shows once, downgrade records silently.
//   getRunningVersion - __APP_VERSION__ (with an e2e override hook).
//   initWhatsNew - boot init: read, evaluate, persist, return the outcome for the caller to open the sheet.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - 2026-10-15 C-48 T-001: initial module.
// END_CHANGE_SUMMARY

import { compareVersions, normalizeVersion } from '../util/version'
import { getWhatsNewItems } from './data'

export const LAST_SEEN_VERSION_KEY = 'lastSeenVersion'
export const LAST_UPDATE_AT_KEY = 'lastUpdateAt'

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
export const evaluateWhatsNewGate = ({ recorded, running, now = new Date() }) => {
  const runningVersion = normalizeVersion(running)
  const recordedVersion = normalizeVersion(recorded)

  if (!recordedVersion) {
    return {
      show: false,
      version: runningVersion,
      recordVersion: runningVersion,
      stampUpdateAt: false,
      versionChanged: false,
      firstLaunch: true
    }
  }

  const cmp = compareVersions(runningVersion, recordedVersion)
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
    // Downgrade (or an unparseable recorded string that sorts higher):
    // record what actually runs, but never celebrate it.
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
export const initWhatsNew = async ({
  ipc = null,
  running = getRunningVersion(),
  now = new Date()
} = {}) => {
  let recorded = ''
  try {
    const facade = ipc || (await import('../ipc/runtime')).ipcPrefs
    recorded = (await facade.get(LAST_SEEN_VERSION_KEY)) || ''
  } catch {
    recorded = ''
  }

  const outcome = evaluateWhatsNewGate({ recorded, running, now })

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
