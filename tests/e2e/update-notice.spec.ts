// FILE: tests/e2e/update-notice.spec.ts
// VERSION: 1.1.0
// START_MODULE_CONTRACT
//   PURPOSE: Pin the C-66 automatic update check end to end against a
//            mocked mt_updater_check — the notice with its three buttons
//            after exactly one background check, the 24 h throttle, Skip
//            persisting (a later version shows again), Later dismissing,
//            offline silence without advancing the clock, What's New
//            deferral, the App Store gate and the autoCheckUpdates switch.
//   SCOPE: renderer boot against the tauri-shim with prefs + feed backed
//          by localStorage and __APP_VERSION_OVERRIDE__ = 2.5.0.
//   DEPENDS: @playwright/test, ./fixtures/tauri-shim.
//   LINKS: .grace/changes/archive/C-66/spec.xml R-1..R-5 + CornerMatrix
//          corner-1..corner-6; .grace/verification/runtime.xml V-M-016
//          scenario-8.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   installUpdateNoticeShim - prefs + mt_updater_check + build mode over localStorage/__mockInvoke; the feed answer is re-read per call so a test can change it mid-flight; also carries the install-flow handlers (mt_rollback_prepare, plugin:updater|check re-reading 'mark-e2e-feed', plugin:updater|download_and_install, plugin:process|relaunch) over the same shim table.
//   BOOT_URL - editor boot URL used across app-boot-style specs.
//   waitForBoot - wait until the Vue app has rendered children.
//   noticeCheckCount - per-load mt_updater_check invocations from __invokeLog.
//   backDateLastCheck - move lastUpdateCheckAt 25 h into the past.
//   Feed - test helper (Feed).
//   ShimOptions - test helper (ShimOptions).
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   - 2026-11-23 v1.1.0 C-UPDATER-NET-BOUNDS T-007: the shared install
//     flow over the shim — __mockInvoke gains mt_rollback_prepare (the
//     fail-closed first step), plugin:updater|check re-reading the same
//     'mark-e2e-feed' key per call (the freshness mechanism),
//     plugin:updater|download_and_install and an inert
//     plugin:process|relaunch; the new freshness spec
//     feed_move_between_notice_and_click_toasts_the_fresh_version pins
//     that the progress toast names the version the flow's fresh plugin
//     re-check answers (2.7.0) after the queued notice was built from an
//     older feed (2.6.0), exactly one download_and_install invoke, and
//     no real relaunch in the shim run. The C-66 matrix keeps its body.
//   LAST_CHANGE: v1.0.1 - 2026-10-19 orchestrator review: fixed against real runs (async polls, reload-safe fakes, selectors).
//   v1.0.0 - 2026-10-19 C-66 T-002: initial matrix — notice
//   + three buttons, Later, Skip/next-version, 24 h throttle, offline
//   silence, What's New deferral, App Store gate, switch off, Ink theme
//   visibility.
// END_CHANGE_SUMMARY

import { test, expect, type Page } from '@playwright/test'
import { installTauriShim } from './fixtures/tauri-shim'

const BOOT_URL = '/?type=editor&wid=0&udp=/tmp/mark-e2e&debug=0'

type Feed = {
  available?: boolean
  latestVersion?: string | null
  statusNote?: string | null
  throw?: string
}

type ShimOptions = {
  running?: string
  feed?: Feed
  buildMode?: Record<string, unknown> | null
  seed?: Record<string, unknown>
}

// The dev build's __APP_VERSION__ predates the shipped content, so the
// gate and the update check read an explicit e2e override global. The
// feed answer is read from localStorage on every call ('mark-e2e-feed')
// so a test can change what the "server" says between loads.
async function installUpdateNoticeShim(page: Page, opts: ShimOptions = {}) {
  const running = opts.running ?? '2.5.0'
  const feed = opts.feed ?? { available: true, latestVersion: '2.6.0' }
  await installTauriShim(page)
  await page.addInitScript(
    ({ running, feed, buildMode, seed }) => {
      ;(window as any).__APP_VERSION_OVERRIDE__ = running
      ;(window as any).__invokeLog = []
      // Seed once per test: a reload is a «next launch» and must see what
      // the previous launch wrote (re-seeding reset lastSeenVersion).
      if (!sessionStorage.getItem('mark-e2e-seeded')) {
        for (const [key, value] of Object.entries(seed ?? {})) {
          localStorage.setItem(`mark-e2e-prefs:${key}`, JSON.stringify(value))
        }
        sessionStorage.setItem('mark-e2e-seeded', '1')
      }
      const mock: Record<string, (args: any) => any> = {
        mt_prefs_get: ({ key }: { key: string }) => {
          const raw = localStorage.getItem(`mark-e2e-prefs:${key}`)
          return raw === null ? null : JSON.parse(raw)
        },
        mt_prefs_set: ({ key, value }: { key: string; value: unknown }) => {
          localStorage.setItem(`mark-e2e-prefs:${key}`, JSON.stringify(value))
          return null
        },
        // Snapshot of the same store. A real first boot always has the m005
        // migration marker stamped seconds ago — seed it unless the test
        // seeded its own (What's New legacy-profile cases).
        mt_prefs_get_all: () => {
          const all: Record<string, unknown> = {
            mt_migration: {
              app_version: 'alpha',
              schema_version: 1,
              marker_written_at: Math.floor(Date.now() / 1000)
            }
          }
          for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i) as string
            if (k.startsWith('mark-e2e-prefs:')) {
              all[k.slice('mark-e2e-prefs:'.length)] = JSON.parse(localStorage.getItem(k) as string)
            }
          }
          return all
        },
        mt_updater_check: () => {
          const raw = localStorage.getItem('mark-e2e-feed')
          const answer: any = raw === null ? feed : JSON.parse(raw)
          if (answer.throw) throw new Error(answer.throw)
          return {
            currentVersion: running,
            available: !!answer.available,
            latestVersion: answer.latestVersion ?? null,
            downloadUrl: null,
            statusNote: answer.statusNote ?? null
          }
        },
        // C-UPDATER-NET-BOUNDS T-007: the shared install flow over the
        // same shim table. plugin:updater|check re-reads the SAME
        // 'mark-e2e-feed' key on every call — the freshness mechanism:
        // the flow's fresh plugin re-check answers whatever the feed
        // says NOW, not what queued the notice.
        mt_rollback_prepare: () => null,
        'plugin:updater|check': () => {
          const raw = localStorage.getItem('mark-e2e-feed')
          const answer: any = raw === null ? feed : JSON.parse(raw)
          if (!answer.available) return null
          return {
            rid: 1,
            currentVersion: running,
            version: answer.latestVersion,
            body: null,
            date: null,
            rawJson: {}
          }
        },
        'plugin:updater|download_and_install': () => null,
        'plugin:process|relaunch': () => null
      }
      if (buildMode) mock.mt_build_mode = () => buildMode
      ;(window as any).__mockInvoke = mock
    },
    { running, feed, buildMode: opts.buildMode ?? null, seed: opts.seed ?? null }
  )
}

async function waitForBoot(page: Page) {
  await page.waitForFunction(() => {
    const el = document.getElementById('app')
    return !!el && el.children.length > 0
  })
}

// mt_updater_check invocations in THIS load (the invoke log resets per
// load — counts are always per-launch, which is exactly the unit under
// test: at most one check per launch).
async function noticeCheckCount(page: Page): Promise<number> {
  return page.evaluate(
    () => ((window as any).__invokeLog ?? []).filter((c: string) => c === 'mt_updater_check')
      .length
  )
}

async function backDateLastCheck(page: Page) {
  await page.evaluate(() => {
    localStorage.setItem(
      'mark-e2e-prefs:lastUpdateCheckAt',
      JSON.stringify(new Date(Date.now() - 25 * 3600_000).toISOString())
    )
  })
}

test.describe('Automatic update check (C-66)', () => {
  test('shows the notice with the three buttons after exactly one background check', async ({
    page
  }) => {
    await installUpdateNoticeShim(page)
    await page.goto(BOOT_URL)

    const notice = page.locator('.notification-card')
    await expect(notice).toBeVisible({ timeout: 15_000 })
    await expect(notice.locator('.card-title')).toHaveText('Mark 2.6.0 is available')
    await expect(notice.locator('.action-btn')).toHaveText(['Update', 'Later', 'Skip this version'])

    expect(await noticeCheckCount(page)).toBe(1)
    // The completed check advanced the 24 h clock.
    const stamped = await page.evaluate(() =>
      localStorage.getItem('mark-e2e-prefs:lastUpdateCheckAt')
    )
    expect(stamped).not.toBeNull()
  })

  test('Later dismisses and the 24 h clock keeps the next launch quiet (corner-1)', async ({
    page
  }) => {
    await installUpdateNoticeShim(page)
    await page.goto(BOOT_URL)
    const notice = page.locator('.notification-card')
    await expect(notice).toBeVisible({ timeout: 15_000 })

    await notice.locator('.action-btn', { hasText: 'Later' }).click()
    await expect(notice).toBeHidden()
    // Nothing was skipped by dismissing.
    const skippedAfterLater = await page.evaluate(() =>
      localStorage.getItem('mark-e2e-prefs:skippedUpdateVersion')
    )
    expect(skippedAfterLater).toBeNull()

    await page.reload()
    await waitForBoot(page)
    await page.waitForTimeout(1_000)
    await expect(page.locator('.notification-card')).toHaveCount(0)
    expect(await noticeCheckCount(page)).toBe(0)
  })

  test('Skip persists; the same version stays hidden and a later one shows again (corner-3)', async ({
    page
  }) => {
    await installUpdateNoticeShim(page)
    await page.goto(BOOT_URL)
    const notice = page.locator('.notification-card')
    await expect(notice).toBeVisible({ timeout: 15_000 })

    await notice.locator('.action-btn', { hasText: 'Skip this version' }).click()
    await expect(notice).toBeHidden()
    // The prefs write is async (IPC) — poll the persisted key.
    await expect.poll(() => page.evaluate(() =>
      localStorage.getItem('mark-e2e-prefs:skippedUpdateVersion')
    )).toBe('"2.6.0"')

    // A later check (clock back-dated past 24 h) with the same feed stays hidden…
    await backDateLastCheck(page)
    await page.reload()
    await waitForBoot(page)
    await page.waitForTimeout(1_000)
    expect(await noticeCheckCount(page)).toBe(1)
    await expect(page.locator('.notification-card')).toHaveCount(0)

    // …but 2.6.1 shows again.
    await page.evaluate(() =>
      localStorage.setItem(
        'mark-e2e-feed',
        JSON.stringify({ available: true, latestVersion: '2.6.1' })
      )
    )
    await backDateLastCheck(page)
    await page.reload()
    await expect(page.locator('.notification-card .card-title')).toHaveText(
      'Mark 2.6.1 is available',
      { timeout: 15_000 }
    )
  })

  test('an offline feed is silent, does not advance the clock, and retries next launch (corner-2)', async ({
    page
  }) => {
    await installUpdateNoticeShim(page, { feed: { throw: 'network unreachable' } })
    await page.goto(BOOT_URL)
    await waitForBoot(page)
    await page.waitForTimeout(1_500)

    await expect(page.locator('.notification-card')).toHaveCount(0)
    expect(await noticeCheckCount(page)).toBe(1)
    const stampedOffline = await page.evaluate(() =>
      localStorage.getItem('mark-e2e-prefs:lastUpdateCheckAt')
    )
    expect(stampedOffline).toBeNull()

    // Back online (the feed answer lives in localStorage): the next launch
    // checks again because nothing was stamped.
    await page.evaluate(() =>
      localStorage.setItem(
        'mark-e2e-feed',
        JSON.stringify({ available: true, latestVersion: '2.6.0' })
      )
    )
    await page.reload()
    await expect(page.locator('.notification-card .card-title')).toHaveText(
      'Mark 2.6.0 is available',
      { timeout: 15_000 }
    )
  })

  test('a feed statusNote answer is silent and unstamped (corner-2 variant)', async ({ page }) => {
    await installUpdateNoticeShim(page, {
      feed: { available: false, statusNote: 'update check failed: 503' }
    })
    await page.goto(BOOT_URL)
    await waitForBoot(page)
    await page.waitForTimeout(1_500)

    await expect(page.locator('.notification-card')).toHaveCount(0)
    const stampedNote = await page.evaluate(() =>
      localStorage.getItem('mark-e2e-prefs:lastUpdateCheckAt')
    )
    expect(stampedNote).toBeNull()
  })

  test('the App Store build never checks and never shows (corner-5)', async ({ page }) => {
    await installUpdateNoticeShim(page, {
      buildMode: { mode: 'app-store', updater: false, review: true }
    })
    await page.goto(BOOT_URL)
    await waitForBoot(page)
    await page.waitForTimeout(1_500)

    expect(await noticeCheckCount(page)).toBe(0)
    await expect(page.locator('.notification-card')).toHaveCount(0)
    const stampedMas = await page.evaluate(() =>
      localStorage.getItem('mark-e2e-prefs:lastUpdateCheckAt')
    )
    expect(stampedMas).toBeNull()
  })

  test('a What’s New sheet in the same launch defers the notice to the next launch (corner-4)', async ({
    page
  }) => {
    await installUpdateNoticeShim(page, { seed: { lastSeenVersion: '2.4.0' } })
    await page.goto(BOOT_URL)

    const sheet = page.locator('.ag-whats-new-sheet')
    await expect(sheet).toBeVisible({ timeout: 15_000 })
    await expect(page.locator('.notification-card')).toHaveCount(0)
    expect(await noticeCheckCount(page)).toBe(0)
    // Deferral does not advance the clock either.
    const stampedDeferred = await page.evaluate(() =>
      localStorage.getItem('mark-e2e-prefs:lastUpdateCheckAt')
    )
    expect(stampedDeferred).toBeNull()

    await sheet.press('Escape')
    await expect(sheet).toBeHidden()

    // Next launch: no sheet anymore, the deferred check runs and the
    // notice appears.
    await page.reload()
    await expect(page.locator('.notification-card .card-title')).toHaveText(
      'Mark 2.6.0 is available',
      { timeout: 15_000 }
    )
  })

  test('autoCheckUpdates off performs no background check (corner-6)', async ({ page }) => {
    await installUpdateNoticeShim(page, { seed: { autoCheckUpdates: false } })
    await page.goto(BOOT_URL)
    await waitForBoot(page)
    await page.waitForTimeout(1_500)

    expect(await noticeCheckCount(page)).toBe(0)
    await expect(page.locator('.notification-card')).toHaveCount(0)
  })

  test('renders under the Ink theme (dark tokens via the shared CSS variables)', async ({ page }) => {
    await installUpdateNoticeShim(page, {
      seed: { theme: 'ink', followSystemTheme: false, lightModeTheme: 'ink', darkModeTheme: 'ink' }
    })
    await page.goto(BOOT_URL)
    await expect(page.locator('.notification-card')).toBeVisible({ timeout: 15_000 })
    await expect(page.locator('.notification-card .card-title')).toHaveText(
      'Mark 2.6.0 is available'
    )
  })

  // C-UPDATER-NET-BOUNDS T-007: the queued notice is built from the
  // launch check's feed answer; the shared install flow re-checks
  // fresh through the plugin (the shim's plugin:updater|check re-reads
  // 'mark-e2e-feed' per call), so the visible progress toast names the
  // feed's CURRENT version — never the stale queued one.
  test('feed_move_between_notice_and_click_toasts_the_fresh_version', async ({ page }) => {
    await installUpdateNoticeShim(page)
    await page.goto(BOOT_URL)
    const notice = page.locator('.notification-card')
    await expect(notice).toBeVisible({ timeout: 15_000 })
    await expect(notice.locator('.card-title')).toHaveText('Mark 2.6.0 is available')

    // The feed moves between the queued notice and the click: what the
    // notice queued (2.6.0) is no longer what the feed answers (2.7.0).
    await page.evaluate(() =>
      localStorage.setItem(
        'mark-e2e-feed',
        JSON.stringify({ available: true, latestVersion: '2.7.0' })
      )
    )

    await notice.locator('.action-btn', { hasText: 'Update' }).click()
    await expect(notice).toBeHidden()

    // The flow's fresh plugin re-check answers B; the visible progress
    // toast in the notification stack names 2.7.0 and no visible
    // string names the stale 2.6.0.
    const progressToast = page.locator('.notification-card .card-title', {
      hasText: 'Updating to Mark 2.7.0…'
    })
    await expect(progressToast).toBeVisible({ timeout: 10_000 })
    const visibleTitles = await page.locator('.notification-card .card-title').allTextContents()
    for (const title of visibleTitles) {
      expect(title, 'no visible string names the stale queued version').not.toContain('2.6.0')
    }

    // Exactly one download_and_install invoke for the whole click; the
    // shim's relaunch handler stays a quiet no-op — nothing actually
    // relaunches in the shim run (the page neither navigates nor
    // reloads).
    const invokeLog = await page.evaluate(() => (window as any).__invokeLog ?? [])
    expect(
      invokeLog.filter((cmd: string) => cmd === 'plugin:updater|download_and_install')
    ).toHaveLength(1)
    expect(invokeLog, 'the fail-closed prepare precedes the plugin check').toContain(
      'mt_rollback_prepare'
    )
    expect(invokeLog.indexOf('mt_rollback_prepare')).toBeLessThan(
      invokeLog.indexOf('plugin:updater|check')
    )
    // The shim's relaunch stays inert — the page neither navigates nor
    // reloads (the boot document URL survives; the hash-router suffix
    // the app itself appends is not a navigation).
    expect(new URL(page.url()).pathname + new URL(page.url()).search).toBe(BOOT_URL)
  })
})
