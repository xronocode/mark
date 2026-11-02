// FILE: tests/e2e/perf/helpers/experimental.js
// VERSION: 1.0.1
// START_MODULE_CONTRACT
//   PURPOSE: Shared C-LARGE-DOC-WAVE-A T-006 helper — enable the session-latched experimental progressive-mount toggle THROUGH THE REAL Settings UI and read the per-session served-opens counter from the Experimental tab, plus the WAVEA_EXPERIMENTAL=1 hook the Stage 0 characterization suites call.
//   SCOPE: Playwright-side orchestration only (tests/e2e/perf/**). Opens the real Settings surface as a second page in the editor page's own browser context (the exact URL every existing settings spec loads — in production this window is spawned by the Mark menu / command palette through mt::open-setting-window, which the renderer-only harness cannot spawn), clicks the real Experimental tab and the real switch, and carries the two content-free cross-window events (mt::experimental-progressive-mount / mt::experimental-progressive-served) between the settings page and the editor page through the shim's plugin:event|emit seam — reproducing real Tauri emit semantics (a broadcast reaches every window including self). Never touches the toggle through store mutation, never bypasses the SET_EXPERIMENTAL_PROGRESSIVE_MOUNT action, and is a no-op when WAVEA_EXPERIMENTAL is unset.
//   DEPENDS: @playwright/test Page, tests/e2e/fixtures/tauri-shim (installTauriShim for the settings page), tests/e2e/fixtures/helpers (bootEditor/openFileTab re-exports), src/renderer/src/prefComponents/tabs/experimental (the real UI driven), src/renderer/src/store/preferences (SET_EXPERIMENTAL_PROGRESSIVE_MOUNT / LISTEN_EXPERIMENTAL_PROGRESSIVE_MOUNT semantics).
//   LINKS: .grace/changes/active/C-LARGE-DOC-WAVE-A (spec R-4/R-7; plan T-006, corner-10); tests/e2e/perf/progressive-mount.spec.ts; tests/e2e/perf/progressive-failsafe.spec.ts; the three characterization suites (WAVEA_EXPERIMENTAL hook); tests/e2e/settings-shell.spec.ts (the settings-URL precedent).
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   WAVEA_EXPERIMENTAL - true when the environment requests toggle-on runs (WAVEA_EXPERIMENTAL=1); gates every enabling side effect.
//   SETTINGS_URL - the real Settings window URL (query-string form every existing settings spec loads).
//   COUNTER_LINE_RE - locale pattern of the en counter line ("This session: N progressive / N legacy opens").
//   settingsPages - WeakMap editor page → its live settings page (one per browser context; closed with it).
//   bridgedPages - WeakSet of pages that already carry the __waveaForwardEvent binding (exposeFunction is once-per-Page; the in-page override is re-armed per navigation).
//   installEventBroadcast - wires one page's plugin:event|emit to real Tauri emit semantics: local dispatch (self echo) plus forwarding to the sibling page binding.
//   ensureSettingsPage - creates (once per editor page) the real Settings page in the same context and bridges it with the editor page.
//   enableExperimentalProgressiveMount - clicks the REAL Settings › Experimental › toggle and proves the flag landed in the editor page's store.
//   disableExperimentalProgressiveMount - clicks the real switch OFF and proves the flag fell (legacy-comparison opens).
//   getServeCounters - reads the per-session served-opens counter line from the Experimental tab of the Settings page.
//   waveaExperimentalBeforeAll - beforeAll-style hook for the characterization suites: arms the wrapper when WAVEA_EXPERIMENTAL=1, no-op otherwise.
//   bootEditor - fixtures/helpers bootEditor wrapper: after a real boot, enables the toggle through the real UI when WAVEA_EXPERIMENTAL=1 (pass-through otherwise) — the one-line import swap the three Stage 0 suites take.
// END_MODULE_MAP
// (openFileTab is a pass-through re-export of the shared fixture opener —
// an export, not a local, so it stays out of the LOCALS map; the suites'
// single import-line swap then covers both names.)
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.1 - 2026-11-02 C-LARGE-DOC-WAVE-A T-006: re-navigation
//   hardening — the editor-side emit override is re-armed after every
//   editor-page navigation (bootEditor runs page.goto per boot), exposeFunction
//   is registered once per Page (WeakSet guard), and enabling proves the
//   EDITOR page's flag (a stale-on settings switch after a re-navigation is
//   flipped off→on to re-broadcast; production semantics: a relaunched window
//   starts with the session-latched flag off until flipped again).
//   v1.0.0 - 2026-11-02 C-LARGE-DOC-WAVE-A T-006: initial
//   helper — real-UI toggle enabling through a bridged Settings page,
//   counter-line reading, and the WAVEA_EXPERIMENTAL boot wrapper hook.
// END_CHANGE_SUMMARY

import { expect } from '@playwright/test'
import { installTauriShim } from '../../fixtures/tauri-shim'
import { bootEditor as bootEditorBase, openFileTab as openFileTabBase } from '../../fixtures/helpers'

const WAVEA_EXPERIMENTAL = process.env.WAVEA_EXPERIMENTAL === '1'

// The real Settings window URL — the same page every existing settings spec
// loads (settings-shell.spec.ts). In production this window is spawned by
// the Mark menu / command palette via mt::open-setting-window; the
// renderer-only harness has no real window spawning, so the helper creates
// the identical page inside the editor page's own browser context.
const SETTINGS_URL = '/?type=settings&wid=0&udp=/tmp/mark-e2e&debug=0'

// The harness shim pins language: 'en', so the counter line always renders
// the en template "This session: {n} progressive / {n} legacy opens".
const COUNTER_LINE_RE = /(\d+)\s+progressive\s*\/\s*(\d+)\s+legacy/

// One live settings page per editor page (same browser context, so it is
// torn down with the test). WeakMap: no page outlives its test.
const settingsPages = new WeakMap()

// Pages that already carry the __waveaForwardEvent binding. exposeFunction
// throws on a duplicate registration, but the binding itself survives page
// navigation — so it is exposed once per Page object, while the in-page
// emit override below is re-installed per document (a navigation wipes it).
const bridgedPages = new WeakSet()

// Reproduce real Tauri emit semantics on one page: emit(event, payload) is a
// BROADCAST — every window's listener fires, including the emitter's own.
// The harness shim's plugin:event|emit default is a no-op; overriding it to
// (a) dispatch locally through the shim's own __emitFakeEvent (the self
// echo the store design relies on for its counters) and (b) forward to the
// sibling page through an exposed binding restores exactly the production
// channel the T-004 cross-window events ride. Handlers never emit, so the
// bridge cannot loop.
async function installEventBroadcast (page, siblingPage) {
  if (!bridgedPages.has(page)) {
    bridgedPages.add(page)
    await page.exposeFunction('__waveaForwardEvent', async (args) => {
      try {
        await siblingPage.evaluate(({ event, payload }) => {
          if (typeof window.__emitFakeEvent === 'function') {
            window.__emitFakeEvent(event, payload)
          }
        }, { event: args && args.event, payload: args && args.payload })
      } catch {
        /* the sibling closed first — its context teardown wins */
      }
    })
  }
  await page.evaluate(() => {
    const w = window
    if (!w.__mockInvoke) w.__mockInvoke = {}
    if (w.__waveaBroadcastInstalled) return
    w.__waveaBroadcastInstalled = true
    w.__mockInvoke['plugin:event|emit'] = (args) => {
      const { event, payload } = args || {}
      if (event && typeof w.__emitFakeEvent === 'function') {
        try { w.__emitFakeEvent(event, payload) } catch { /* listener error */ }
      }
      if (typeof w.__waveaForwardEvent === 'function') {
        try { w.__waveaForwardEvent({ event, payload }) } catch { /* best effort */ }
      }
      return null
    }
  })
}

// Create (once per editor page) the real Settings page in the same context
// and bridge the two pages' event seams in both directions. The editor-side
// bridge is re-armed on every call: bootEditor navigates the editor page per
// boot, and each navigation wipes the in-page emit override (the exposed
// binding survives; the in-page install is idempotent per document).
async function ensureSettingsPage (page) {
  const existing = settingsPages.get(page)
  const settings = existing && !existing.isClosed()
    ? existing
    : await page.context().newPage()

  if (settings === existing) {
    await installEventBroadcast(page, settings)
    return settings
  }

  await installTauriShim(settings)
  const url = new URL(SETTINGS_URL, page.url()).toString()
  await settings.goto(url)
  await settings.locator('.pref-container').waitFor({ state: 'visible', timeout: 15_000 })

  await installEventBroadcast(settings, page)
  await installEventBroadcast(page, settings)
  settingsPages.set(page, settings)
  return settings
}

/**
 * Enable the experimental progressive-mount toggle THROUGH THE REAL UI:
 * open the real Settings surface, click the Experimental tab, click the
 * session-latched switch (the SET_EXPERIMENTAL_PROGRESSIVE_MOUNT action —
 * never a store mutation), and prove the flip landed in the editor page's
 * own preferences store through the cross-window event channel.
 *
 * Must be called on a BOOTED editor page, before the opens it should serve.
 * Idempotent per editor-page DOCUMENT: the proof is the editor page's own
 * store flag, so a re-navigation (every bootEditor runs page.goto) that
 * reset the session-latched in-memory flag re-broadcasts by flipping the
 * real switch off and back on — exactly what a user does after a window
 * relaunch, whose production semantics are "the flag is off until flipped
 * again" (session-latched, never persisted).
 */
async function enableExperimentalProgressiveMount (page) {
  const settings = await ensureSettingsPage(page)

  // The editor page's CURRENT flag (a fresh navigation starts it false).
  const editorFlagOn = async () => page.evaluate(() => {
    const pinia = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia
    const store = pinia._s.get('preferences')
    return !!(store && store.experimentalProgressiveMount === true)
  })

  // The real tab, the real route: the Experimental tab of the Settings shell.
  const tab = settings.locator('.pref-toolbar [data-tab="experimental"]')
  await tab.click()
  await expect(tab).toHaveAttribute('aria-selected', 'true')
  await settings.locator('.pref-tab-page--experimental').waitFor({ state: 'visible', timeout: 10_000 })

  // The real switch. Flip only when the EDITOR page's flag is not already
  // on — the settings page's own switch state can be stale-on after an
  // editor re-navigation, in which case an off→on pair re-broadcasts.
  const toggle = settings.locator('.pref-tab-page--experimental button.pref-switch[role="switch"]')
  await expect(toggle).toBeVisible()
  if (!(await editorFlagOn())) {
    const checked = await toggle.getAttribute('aria-checked')
    if (checked === 'true') {
      await toggle.click()
      await page.waitForFunction(
        () => {
          const pinia = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia
          const store = pinia._s.get('preferences')
          return !!(store && store.experimentalProgressiveMount === false)
        },
        undefined,
        { timeout: 10_000 }
      )
    }
    await toggle.click()
  }

  // The flip reached the EDITOR page's store through the real event chain
  // (SET_EXPERIMENTAL_PROGRESSIVE_MOUNT → mt::experimental-progressive-mount
  // → LISTEN_EXPERIMENTAL_PROGRESSIVE_MOUNT). Never resolve on a local
  // mutation: the assertion is the production cross-window proof.
  await page.waitForFunction(
    () => {
      const pinia = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia
      const store = pinia._s.get('preferences')
      return !!(store && store.experimentalProgressiveMount === true)
    },
    undefined,
    { timeout: 10_000 }
  )
  return true
}

/**
 * Disable the toggle through the same real UI (the legacy-comparison opens
 * of the progressive suites): click the real switch off and prove the editor
 * page's store flag fell. Idempotent when already off.
 */
async function disableExperimentalProgressiveMount (page) {
  const settings = await ensureSettingsPage(page)
  const tab = settings.locator('.pref-toolbar [data-tab="experimental"]')
  const active = await tab.getAttribute('aria-selected')
  if (active !== 'true') {
    await tab.click()
  }
  await settings.locator('.pref-tab-page--experimental').waitFor({ state: 'visible', timeout: 10_000 })
  const toggle = settings.locator('.pref-tab-page--experimental button.pref-switch[role="switch"]')
  const checked = await toggle.getAttribute('aria-checked')
  if (checked === 'true') {
    await toggle.click()
  }
  await page.waitForFunction(
    () => {
      const pinia = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia
      const store = pinia._s.get('preferences')
      return !!(store && store.experimentalProgressiveMount === false)
    },
    undefined,
    { timeout: 10_000 }
  )
  return true
}

/**
 * Read the per-session served-opens counters from the Experimental tab's
 * counter line (the real UI surface — the same line a user reads). Returns
 * { progressive, legacy, text, toggleOn }.
 */
async function getServeCounters (page) {
  const settings = await ensureSettingsPage(page)
  const tab = settings.locator('.pref-toolbar [data-tab="experimental"]')
  const active = await tab.getAttribute('aria-selected')
  if (active !== 'true') {
    await tab.click()
  }
  await settings.locator('.pref-tab-page--experimental').waitFor({ state: 'visible', timeout: 10_000 })

  const line = settings.locator('.pref-tab-page--experimental .pref-row--info .pref-row-help')
  const text = (await line.innerText({ timeout: 5_000 })).trim()
  const m = COUNTER_LINE_RE.exec(text)
  if (!m) {
    throw new Error(`experimental counter line did not match the en template: "${text}"`)
  }
  const toggleOn = await settings
    .locator('.pref-tab-page--experimental button.pref-switch[role="switch"]')
    .getAttribute('aria-checked')
  return {
    progressive: Number.parseInt(m[1], 10),
    legacy: Number.parseInt(m[2], 10),
    toggleOn: toggleOn === 'true',
    text
  }
}

/**
 * BeforeAll-style hook for the Stage 0 characterization suites (plan T-006):
 * a no-op unless WAVEA_EXPERIMENTAL=1. The per-page enabling itself rides
 * the bootEditor wrapper below — a Playwright beforeAll receives no test
 * page, and the session-latched flag lives per page, so the hook arms the
 * wrapper and the wrapper does the real-UI click right after each boot,
 * before the suite's first open.
 */
function waveaExperimentalBeforeAll () {
  if (!WAVEA_EXPERIMENTAL) return false
  // eslint-disable-next-line no-console
  console.log('[wavea-experimental] WAVEA_EXPERIMENTAL=1 — progressive toggle will be enabled through the real Settings UI after every boot')
  return true
}

/**
 * bootEditor wrapper (the WAVEA_EXPERIMENTAL hook): real boot first, then —
 * only when WAVEA_EXPERIMENTAL=1 — enable the toggle through the real
 * Settings UI so every subsequent open of the calling suite is served by
 * the progressive path. Without the env var this is the shared fixture
 * byte-for-byte (same call, same awaits, no extra pages).
 */
async function bootEditor (page, opts) {
  await bootEditorBase(page, opts)
  if (WAVEA_EXPERIMENTAL) {
    await enableExperimentalProgressiveMount(page)
  }
}

// Pass-through re-export: the characterization suites swap ONE import line
// (from '../fixtures/helpers' to './helpers/experimental') and every name
// they already use keeps resolving.
export { openFileTabBase as openFileTab }

export {
  WAVEA_EXPERIMENTAL,
  enableExperimentalProgressiveMount,
  disableExperimentalProgressiveMount,
  getServeCounters,
  waveaExperimentalBeforeAll,
  bootEditor
}
