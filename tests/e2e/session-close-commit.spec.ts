// FILE: tests/e2e/session-close-commit.spec.ts
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: C-SESSION-DURABILITY T-006 — the FIRST e2e close↔session-write
//            ordering evidence in the tree. Three injected-write scenarios
//            through the tauri-shim seams prove the window-close commit:
//            (1) a slow mt_prefs_set_many settling UNDER the two-second
//            bound closes only AFTER the write settles (a settlement
//            sentinel lands in __invokeLog strictly before
//            mt_close_window); (2) a never-settling write fires the bound
//            — BLOCK_SESSION_COMMIT_TIMEOUT on the console — and the
//            close still completes; (3) a rejecting write surfaces
//            BLOCK_SESSION_WRITE_FAILED and the close still completes.
//            The bound's value and the timeout-still-closes trade are the
//            predecessor C-SESSION-WRITE-ATOMICITY owner-confirmed
//            decisions, unchanged.
//   SCOPE: renderer-only e2e against vite preview + tauri-shim (no real
//          Tauri IPC, no network, no real window destroy automation).
//   HARNESS: installTauriShim + __mockInvoke per-test overrides; the
//          window-close path is driven through the REAL renderer close
//          channel — app.vue registers LISTEN_FOR_CLOSE on the
//          'mt::ask-for-close' electron bridge (window.electron.ipcRenderer.on
//          → Tauri listen), and the spec fires it with the shim's
//          __emitFakeEvent('mt::ask-for-close'). Ordering evidence reads
//          the shim's __invokeLog (every invoke command is appended in
//          call order); the settlement sentinel is pushed by the injected
//          mt_prefs_set_many handler itself right before it resolves.
//   OPEN ITEM: hosted/native evidence of a REAL window destroy during an
//          injected slow write stays a manual/open item per the
//          predecessor's precedent — the shim proves the commit→command
//          ordering, not a native destroy.
//   DEPENDS: @playwright/test, ./fixtures/tauri-shim.
//   LINKS: .grace/verification/runtime.xml V-M-011 (the
//          C-SESSION-DURABILITY scenario); store/editor.js
//          _boundedSessionCommit / _saveSessionState.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   BOOT_URL - editor boot URL with a named tab (the session profile carries a path).
//   SENTINEL_SETTLED - invoke-log sentinel pushed by the injected set_many handler right before it resolves.
//   ConsoleLine - minimal console message shape collected for marker assertions.
//   bootCloseHarness - boot the real renderer and wire the console collector plus the set_many override.
//   invokeLog - ordered command list read from the shim's __invokeLog.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   v1.0.0 - 2026-11-23 C-SESSION-DURABILITY T-006: new — three
//   meaningful-proof pins (not red-first defect detectors): the precise
//   gap closed is the absent close↔session-write ORDERING evidence at
//   e2e; the close-adjacent characterization spec is renderer-only and
//   proves no ordering.
// END_CHANGE_SUMMARY

import { test, expect, type Page } from '@playwright/test'
import { installTauriShim } from './fixtures/tauri-shim'

const BOOT_URL = '/?type=editor&wid=0&udp=/tmp/mark-e2e&debug=0'
const SENTINEL_SETTLED = 'sentinel:mt_prefs_set_many-settled'

type ConsoleLine = { text: string }

// Boot the real renderer with one NAMED tab open (so the session profile
// carries a path), then hand back helpers to arm an injected
// mt_prefs_set_many and fire the real close channel.
async function bootCloseHarness(page: Page, consoleLines: ConsoleLine[]): Promise<void> {
  page.on('console', (msg) => {
    const text = msg.text()
    if (text.includes('[Session]')) consoleLines.push({ text })
  })
  await installTauriShim(page)
  await page.addInitScript(() => {
    const w = window as any
    w.__invokeLog = []
    w.__mockInvoke = {
      mt_prefs_get: () => null,
      mt_prefs_set: () => null,
      mt_recent_list: () => [],
      mt_fs_stat: () => ({ isFile: true, isDirectory: false })
    }
  })
  await page.goto(BOOT_URL)
  await page.waitForFunction(() => {
    const ls = (window as any).__shimListeners
    if (!ls) return false
    for (const m of ls.values()) if (m.event === 'mt::bootstrap-editor') return true
    return false
  }, undefined, { timeout: 15_000 })
  // Cold launch without files: bootstrap first, wait for the boot flow
  // to settle (the welcome surface mounts), THEN open one named tab
  // through the real open arrival path (the same envelope the shim's
  // mt_open_file default emits) so the session profile carries a path.
  await page.evaluate(() => {
    ;(window as any).__emitFakeEvent('mt::bootstrap-editor', {
      addBlankTab: false,
      markdownList: [],
      lineEnding: 'lf',
      sideBarVisibility: false,
      tabBarVisibility: true,
      sourceCodeModeEnabled: false
    })
  })
  await page.locator('.welcome-screen').waitFor({ state: 'visible', timeout: 15_000 })
  await page.evaluate(() => {
    ;(window as any).__emitFakeEvent('mt::open-new-tab', {
      pathname: '/tmp/session-close-e2e.md',
      filename: 'session-close-e2e.md',
      markdown: '# session close commit\n',
      encoding: { encoding: 'utf8', isBom: false },
      lineEnding: 'lf',
      trimTrailingNewline: 3,
      previewMode: false
    })
  })
  await page.locator('.editor-with-tabs').waitFor({ state: 'visible', timeout: 15_000 })
  // Let the boot-time autosave tick (400 ms debounce) settle BEFORE the
  // per-test write override is armed, so the injected handler only ever
  // sees the close commit's write.
  await page.waitForTimeout(700)
}

async function invokeLog(page: Page): Promise<string[]> {
  return page.evaluate(() => ((window as any).__invokeLog ?? []) as string[])
}

test.describe('session close-commit ordering (C-SESSION-DURABILITY)', () => {
  test('close_waits_for_a_slow_session_write_under_the_bound', async ({ page }) => {
    const consoleLines: ConsoleLine[] = []
    await bootCloseHarness(page, consoleLines)

    // A write that settles well UNDER the two-second bound: the sentinel
    // is appended by the injected handler right before it resolves, so
    // the invoke log carries the settlement point explicitly.
    await page.evaluate((sentinel) => {
      const w = window as any
      w.__mockInvoke.mt_prefs_set_many = async () => {
        await new Promise((resolve) => setTimeout(resolve, 300))
        w.__invokeLog.push(sentinel)
        return null
      }
    }, SENTINEL_SETTLED)
    await page.evaluate(() => {
      ;(window as any).__emitFakeEvent('mt::ask-for-close', null)
    })

    await page.waitForFunction(
      (cmd) => ((window as any).__invokeLog ?? []).includes(cmd),
      'mt_close_window',
      { timeout: 10_000 }
    )
    const log = await invokeLog(page)
    const settled = log.indexOf(SENTINEL_SETTLED)
    const close = log.indexOf('mt_close_window')
    expect(settled, 'the injected write settled').toBeGreaterThan(-1)
    expect(close, 'the close command fired').toBeGreaterThan(-1)
    expect(close, 'mt_close_window fires strictly AFTER the write settled (under the bound)')
      .toBeGreaterThan(settled)
  })

  test('bounded_timeout_still_closes_with_the_write_in_flight', async ({ page }) => {
    test.setTimeout(30_000)
    const consoleLines: ConsoleLine[] = []
    await bootCloseHarness(page, consoleLines)

    // Never-settling write: only the honest bound can complete the close.
    await page.evaluate(() => {
      const w = window as any
      w.__mockInvoke.mt_prefs_set_many = () => new Promise<void>(() => {})
    })
    await page.evaluate(() => {
      ;(window as any).__emitFakeEvent('mt::ask-for-close', null)
    })

    await page.waitForFunction(
      (cmd) => ((window as any).__invokeLog ?? []).includes(cmd),
      'mt_close_window',
      { timeout: 10_000 }
    )
    const markers = consoleLines.map((l) => l.text)
    expect(
      markers.some((t) => t.includes('BLOCK_SESSION_COMMIT_TIMEOUT')),
      `the bound marker is logged: ${markers.join(' | ')}`
    ).toBe(true)
    expect((await invokeLog(page)).includes('mt_close_window')).toBe(true)
  })

  test('rejected_session_write_still_closes_e2e', async ({ page }) => {
    const consoleLines: ConsoleLine[] = []
    await bootCloseHarness(page, consoleLines)

    // Rejecting write: the failure surfaces honestly and the close still
    // completes.
    await page.evaluate(() => {
      const w = window as any
      w.__mockInvoke.mt_prefs_set_many = async () => {
        await new Promise((resolve) => setTimeout(resolve, 50))
        throw new Error('MT_PREFS_SET_MANY_FAILED')
      }
    })
    await page.evaluate(() => {
      ;(window as any).__emitFakeEvent('mt::ask-for-close', null)
    })

    await page.waitForFunction(
      (cmd) => ((window as any).__invokeLog ?? []).includes(cmd),
      'mt_close_window',
      { timeout: 10_000 }
    )
    const markers = consoleLines.map((l) => l.text)
    expect(
      markers.some((t) => t.includes('BLOCK_SESSION_WRITE_FAILED')),
      `the write-failure marker is logged: ${markers.join(' | ')}`
    ).toBe(true)
    expect((await invokeLog(page)).includes('mt_close_window')).toBe(true)
  })
})
