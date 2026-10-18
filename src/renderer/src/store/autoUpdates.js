// FILE: src/renderer/src/store/autoUpdates.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: C-66 launch-time update check — the once-per-24 h gate
//            (What's New deferral, App Store gate, autoCheckUpdates
//            switch), the skip-this-version memory, and the non-modal
//            notice state consumed by components/updateNotice.
//   SCOPE: Pure gate decisions (evaluateAutoUpdateGate,
//          evaluateUpdateNotice) + the Pinia store actions
//          RUN_LAUNCH_CHECK / DISMISS_NOTICE / SKIP_VERSION /
//          INSTALL_UPDATE. No download/progress UI
//          (F-UPDATER-PROGRESS-UI); the signed install itself is
//          commands/index.js installSignedUpdate, shared with
//          file.check-update.
//   DEPENDS: pinia; util/version.js; ipc/runtime prefs facade
//            (injectable); @tauri-apps/api/core invoke (lazy, injectable);
//            commands/index.js installSignedUpdate (lazy — avoids the
//            commands-module side effects at store import time).
//   LINKS: .grace/changes/active/C-66/spec.xml R-1..R-5;
//          pages/app.vue START_BLOCK_C66_UPDATE_CHECK (boot wiring after
//          the What's New gate + FETCH_BUILD_MODE);
//          components/updateNotice (renders this.notice);
//          src-tauri/src/m016_updater.rs mt_updater_check;
//          .grace/graph/runtime.xml M-016 / M-011.
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   AUTO_CHECK_UPDATES_KEY - prefs key for the Settings › General › Updates switch (default on).
//   LAST_UPDATE_CHECK_AT_KEY - prefs key with the ISO time of the last COMPLETED automatic check (drives the 24 h throttle).
//   SKIPPED_UPDATE_VERSION_KEY - prefs key with the version hidden by «Skip this version».
//   CHECK_INTERVAL_MS - 24 h minimum spacing between automatic checks.
//   evaluateAutoUpdateGate - pure gate: { check, reason } from build mode, What's New deferral, switch state and the 24 h clock.
//   evaluateUpdateNotice - pure decision: { show, version, reason } for an mt_updater_check status against the skipped version.
//   useAutoUpdatesStore - Pinia store: RUN_LAUNCH_CHECK (boot init), DISMISS_NOTICE (Later), SKIP_VERSION, INSTALL_UPDATE (shared signed install flow).
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - 2026-10-19 C-66 T-001/T-002: the store leaves
//   its dead shell — a launch-time check (max once per 24 h, persisted
//   lastUpdateCheckAt) runs mt_updater_check when autoCheckUpdates is on
//   and the build has the updater capability; a newer, not-skipped
//   version queues the non-modal notice ({ visible, version, status });
//   offline/feed errors are silent (log markers) and never advance the
//   clock or the skip state. Update/Later/Skip actions: install reuses
//   commands/index.js installSignedUpdate, Later just dismisses, Skip
//   persists skippedUpdateVersion (a later version shows again).
//   PREV: dead-code shell documented 2026-08-07 (listeners for channels
//   the Tauri backend never emitted).
// END_CHANGE_SUMMARY

import { defineStore } from 'pinia'
import { normalizeVersion } from '../util/version'

export const AUTO_CHECK_UPDATES_KEY = 'autoCheckUpdates'
export const LAST_UPDATE_CHECK_AT_KEY = 'lastUpdateCheckAt'
export const SKIPPED_UPDATE_VERSION_KEY = 'skippedUpdateVersion'

// R-1: at most one automatic check per 24 h.
export const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000

// START_BLOCK_EVALUATE_AUTO_UPDATE_GATE
// Pure gate, fake-clock friendly (all time flows in via `now`). Order is
// load-bearing and mirrors the spec's priority:
//   app-store build     → never check (R-5; the store updates the app)
//   What's New sheet    → deferred to the next launch (R-3; the clock is
//                         NOT advanced, so the next launch re-evaluates)
//   switch off          → never check automatically (R-1/corner-6)
//   last check < 24 h   → throttled (corner-1)
//   otherwise           → due
// An unparseable/absent lastCheckAt counts as "never checked". The
// boundary is inclusive: a check exactly 24 h old is due again.
export const evaluateAutoUpdateGate = ({
  isDesktopBuild = true,
  whatsNewShown = false,
  autoCheckUpdates = true,
  lastCheckAt = '',
  now = new Date()
} = {}) => {
  if (!isDesktopBuild) return { check: false, reason: 'app-store' }
  if (whatsNewShown) return { check: false, reason: 'whats-new-deferred' }
  if (!autoCheckUpdates) return { check: false, reason: 'disabled' }
  const lastMs = Date.parse(String(lastCheckAt))
  const nowMs = now instanceof Date ? now.getTime() : Date.parse(String(now))
  if (Number.isFinite(lastMs) && Number.isFinite(nowMs) && nowMs - lastMs < CHECK_INTERVAL_MS) {
    return { check: false, reason: 'throttled' }
  }
  return { check: true, reason: 'due' }
}
// END_BLOCK_EVALUATE_AUTO_UPDATE_GATE

// START_BLOCK_EVALUATE_UPDATE_NOTICE
// Pure decision over an mt_updater_check status (m016 UpdateStatus:
// { currentVersion, available, latestVersion, downloadUrl, statusNote }).
//   no status / non-object → nothing (defensive; the shim resolves
//                            undefined for unknown commands)
//   statusNote present     → feed/plugin failure or the MAS-managed note:
//                            silent (corner-2)
//   available !== true     → up to date: nothing
//   no parseable version   → defensive: nothing
//   latest === skipped     → hidden until a LATER version ships (corner-3;
//                            "v2.6.0" and "2.6.0" are the same version)
export const evaluateUpdateNotice = ({ status = null, skippedVersion = '' } = {}) => {
  if (!status || typeof status !== 'object') {
    return { show: false, version: '', reason: 'no-status' }
  }
  if (status.statusNote) return { show: false, version: '', reason: 'check-note' }
  if (status.available !== true) return { show: false, version: '', reason: 'not-available' }
  const version = normalizeVersion(status.latestVersion)
  if (!version) return { show: false, version: '', reason: 'no-version' }
  if (skippedVersion && normalizeVersion(skippedVersion) === version) {
    return { show: false, version, reason: 'skipped' }
  }
  return { show: true, version, reason: 'available' }
}
// END_BLOCK_EVALUATE_UPDATE_NOTICE

export const useAutoUpdatesStore = defineStore('autoUpdates', {
  state: () => ({
    /**
     * The non-modal corner notice (components/updateNotice renders it).
     * `status` keeps the mt_updater_check answer that queued the notice —
     * INSTALL_UPDATE hands it to the shared signed install flow.
     */
    notice: { visible: false, version: '', status: null }
  }),

  actions: {
    // START_BLOCK_RUN_LAUNCH_CHECK
    // Boot init, called by pages/app.vue AFTER initWhatsNew (deferral
    // input) and FETCH_BUILD_MODE (build gate input). Everything is
    // injectable for tests: prefs facade, invoker, clock, both gate
    // inputs. Offline / IPC failure and statusNote answers are silent and
    // leave lastUpdateCheckAt untouched, so the next launch retries
    // (corner-2). Only a completed, note-free check advances the clock —
    // including one whose update is skipped (the check succeeded; the
    // notice alone stays hidden).
    async RUN_LAUNCH_CHECK({
      ipc = null,
      invokeFn = null,
      now = new Date(),
      whatsNewShown = false,
      isDesktopBuild = null
    } = {}) {
      const facade = ipc || (await import('../ipc/runtime')).ipcPrefs

      let autoCheckUpdates = true
      let lastCheckAt = ''
      let skippedVersion = ''
      try {
        autoCheckUpdates = (await facade.get(AUTO_CHECK_UPDATES_KEY)) !== false
        lastCheckAt = (await facade.get(LAST_UPDATE_CHECK_AT_KEY)) || ''
        skippedVersion = (await facade.get(SKIPPED_UPDATE_VERSION_KEY)) || ''
      } catch (e) {
        console.error('[autoUpdates][RUN_LAUNCH_CHECK][BLOCK_PREFS_READ_FAILED]', e)
      }

      // Desktop fail-open, mirroring FETCH_BUILD_MODE's default handling:
      // an absent m048 answer (dev shim, older binary) keeps the check on.
      const isDesktop = isDesktopBuild === null || isDesktopBuild === undefined ? true : !!isDesktopBuild

      const gate = evaluateAutoUpdateGate({
        isDesktopBuild: isDesktop,
        whatsNewShown,
        autoCheckUpdates,
        lastCheckAt,
        now
      })
      if (!gate.check) {
        console.log(`[autoUpdates][RUN_LAUNCH_CHECK][BLOCK_GATE_SKIPPED reason=${gate.reason}]`)
        return { ...gate, checked: false }
      }

      let invoke = invokeFn
      if (!invoke) {
        invoke = (await import('@tauri-apps/api/core')).invoke
      }

      let status = null
      try {
        status = await invoke('mt_updater_check')
      } catch (e) {
        console.warn('[autoUpdates][RUN_LAUNCH_CHECK][BLOCK_CHECK_FAILED]', e)
        return { ...gate, checked: false, error: true }
      }

      if (!status || status.statusNote) {
        // Feed/plugin failure (m016 answers Ok with a statusNote) or an
        // empty answer: silent, no stamp — the 24 h clock must not
        // advance on a check that never reached the feed (corner-2).
        console.log('[autoUpdates][RUN_LAUNCH_CHECK][BLOCK_CHECK_QUIET]')
        return { ...gate, checked: false, quiet: true }
      }

      const stampedAt = now instanceof Date ? now.toISOString() : String(now)
      try {
        await facade.set(LAST_UPDATE_CHECK_AT_KEY, stampedAt)
      } catch (e) {
        console.error('[autoUpdates][RUN_LAUNCH_CHECK][BLOCK_STAMP_FAILED]', e)
      }

      const decision = evaluateUpdateNotice({ status, skippedVersion })
      if (decision.show) {
        this.notice = { visible: true, version: decision.version, status }
        console.log(
          `[autoUpdates][RUN_LAUNCH_CHECK][BLOCK_NOTICE_QUEUED version=${decision.version}]`
        )
      }
      console.log(
        `[autoUpdates][RUN_LAUNCH_CHECK][BLOCK_CHECK_DONE available=${status.available === true} show=${decision.show}]`
      )
      return { ...gate, checked: true, decision }
    },
    // END_BLOCK_RUN_LAUNCH_CHECK

    // Later: dismiss only. The 24 h stamp from the check that queued the
    // notice stays, so the notice reappears no earlier than the next
    // daily check with an update available (R-2).
    DISMISS_NOTICE() {
      this.notice.visible = false
    },

    // START_BLOCK_SKIP_VERSION
    // «Skip this version»: persist the normalized version and hide. A
    // later version shows again (evaluateUpdateNotice compares against
    // this key); un-skipping is not offered — Settings › General ›
    // «Check for updates» ignores the skip and always reports.
    async SKIP_VERSION({ ipc = null } = {}) {
      const version = this.notice.version
      this.notice.visible = false
      if (!version) return
      try {
        const facade = ipc || (await import('../ipc/runtime')).ipcPrefs
        await facade.set(SKIPPED_UPDATE_VERSION_KEY, version)
        console.log(`[autoUpdates][SKIP_VERSION][BLOCK_SKIP_PERSISTED version=${version}]`)
      } catch (e) {
        console.error('[autoUpdates][SKIP_VERSION][BLOCK_SKIP_FAILED]', e)
      }
    },
    // END_BLOCK_SKIP_VERSION

    // START_BLOCK_INSTALL_UPDATE
    // Update: hand the queued mt_updater_check status to the very same
    // signed install flow the manual command runs (commands/index.js
    // installSignedUpdate — check → downloadAndInstall → relaunch, with
    // its own toasts and error notification). The notice hides first;
    // the flow owns everything the user sees afterwards.
    async INSTALL_UPDATE() {
      const status = this.notice.status
      this.notice.visible = false
      if (!status) {
        console.error('[autoUpdates][INSTALL_UPDATE][BLOCK_INSTALL_NO_STATUS]')
        return
      }
      try {
        const { installSignedUpdate } = await import('../commands')
        await installSignedUpdate(status)
      } catch (e) {
        console.error('[autoUpdates][INSTALL_UPDATE][BLOCK_INSTALL_DISPATCH_FAILED]', e)
      }
    }
    // END_BLOCK_INSTALL_UPDATE
  }
})
