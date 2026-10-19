// FILE: tests/e2e/whats-new.spec.ts
// VERSION: 1.3.0
// START_MODULE_CONTRACT
//   PURPOSE: Pin the C-48 What's New boot flow end to end — a recorded
//            previous version shows the sheet once, Esc closes it, and
//            a reload of the same version never shows it again; a fresh
//            install (no recorded version) never shows it; a pre-C-48
//            (2.3.1) profile — legacy keys but no lastSeenVersion — shows
//            it once. C-53 pins: the sheet carries the four D-1 items,
//            the «Also» line and the «See everything new» link that
//            opens the GitHub release page through the opener plugin.
//   SCOPE: renderer boot against the tauri-shim with prefs backed by
//          localStorage and __APP_VERSION_OVERRIDE__ = 2.5.0.
//   DEPENDS: @playwright/test, ./fixtures/tauri-shim.
//   LINKS: .grace/changes/active/C-53/spec.xml R-1 (D-1 sheet);
//          .grace/changes/archive/C-48/spec.xml R-1; V-M-011 scenario-46.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   installWhatsNewShim - prefs get/set/get_all over localStorage + version override.
//   BOOT_URL - editor boot URL used across app-boot-style specs.
//   waitForBoot - wait until the Vue app has rendered children.
//   waitForGateRecord - wait until the boot gate persisted lastSeenVersion.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.3.0 - 2026-10-18 release 2.5.0: What's New pins move to the 2.5.0 sheet (the previous release 2.4.0 becomes the upgrade source).
//   v1.2.0 - 2026-10-17 C-53 T-001/R-1: the D-1 item titles,
//   the «Also» line and the «See everything new» footer link are pinned;
//   a new case drives the link and asserts the opener plugin receives the
//   v2.5.0 release URL (window.electron.shell.openExternal →
//   plugin:opener|open_url) while the sheet stays open.
//   PREV: v1.1.0 - 2026-10-15 C-48 review fix: mt_prefs_get_all is
//   backed by the same localStorage store (with a just-stamped m005
//   mt_migration marker, as a real first boot has); new case: a 2.3.1
//   profile (old marker + recentFolders, no lastSeenVersion) shows the
//   sheet once.
//   PREV: v1.0.0 - 2026-10-15 C-48 T-001: initial pins.
// END_CHANGE_SUMMARY

import { test, expect } from '@playwright/test'
import { installTauriShim } from './fixtures/tauri-shim'

const BOOT_URL = '/?type=editor&wid=0&udp=/tmp/mark-e2e&debug=0'

// The dev build's __APP_VERSION__ (2.3.1) predates the 2.5.0 content, so
// the gate reads an explicit e2e override global instead.
async function installWhatsNewShim(page: import('@playwright/test').Page, runningVersion: string) {
  await installTauriShim(page)
  await page.addInitScript((version: string) => {
    ;(window as any).__APP_VERSION_OVERRIDE__ = version
    ;(window as any).__mockInvoke = {
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
      // seeded its own (legacy profile case).
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
      }
    }
  }, runningVersion)
}

async function waitForBoot(page: import('@playwright/test').Page) {
  await page.waitForFunction(() => {
    const el = document.getElementById('app')
    return !!el && el.children.length > 0
  })
}

// The startup gate runs detached from mount — wait until this boot's own
// lastSeenVersion write landed before re-seeding the profile, or the
// boot write can race (and overwrite) the seed.
async function waitForGateRecord(page: import('@playwright/test').Page) {
  await page.waitForFunction(() => localStorage.getItem('mark-e2e-prefs:lastSeenVersion') !== null)
}

test.describe("What's New (C-48)", () => {
  test.beforeEach(async ({ page }) => {
    await installWhatsNewShim(page, '2.5.0')
  })

  test('upgrade shows the sheet once; Esc closes; reload does not show it again', async ({ page }) => {
    await page.goto(BOOT_URL)
    await waitForGateRecord(page)

    // Simulate the previous version having been recorded.
    await page.evaluate(() => {
      localStorage.setItem('mark-e2e-prefs:lastSeenVersion', JSON.stringify('2.4.0'))
    })

    // The gate runs during boot — a reload re-evaluates with the seeded
    // previous version and opens the sheet exactly once.
    await page.reload()

    const sheet = page.locator('.ag-whats-new-sheet')
    await expect(sheet).toBeVisible({ timeout: 15_000 })
    await expect(sheet.locator('.eyebrow')).toHaveText('Mark 2.5.0')
    await expect(sheet.locator('.news li')).toHaveCount(4)

    // C-55: the four approved items render with their titles.
    const titles = sheet.locator('.news li b')
    await expect(titles.nth(0)).toHaveText('Diagrams as pictures')
    await expect(titles.nth(1)).toHaveText('A look for each diagram')
    await expect(titles.nth(2)).toHaveText('Print and PDF, each direct')
    await expect(titles.nth(3)).toHaveText('Copy images back out')
    // The «Also» line and both footer links.
    await expect(sheet.locator('.also')).toContainText('clears Recent')
    await expect(sheet.locator('.foot-links .guide-link').first())
      .toHaveText('See everything new ↗')
    await expect(sheet.locator('.foot-links .guide-link').nth(1)).toHaveText('See the guide')

    // Esc closes it.
    await sheet.press('Escape')
    await expect(sheet).toBeHidden()

    // The boot gate persisted the seen version — reload never re-shows.
    await page.reload()
    await page.waitForFunction(() => {
      const el = document.getElementById('app')
      return !!el && el.children.length > 0
    })
    await page.waitForTimeout(1_000)
    await expect(page.locator('.ag-whats-new-sheet')).toHaveCount(0)

    // lastUpdateAt was stamped for the C-46 welcome footer (7-day window).
    const stamped = await page.evaluate(() =>
      localStorage.getItem('mark-e2e-prefs:lastUpdateAt')
    )
    expect(stamped).not.toBeNull()
    expect(() => JSON.parse(stamped as string)).not.toThrow()
  })

  test('a fresh install records silently and never shows the sheet', async ({ page }) => {
    await page.goto(BOOT_URL)
    await page.waitForFunction(() => {
      const el = document.getElementById('app')
      return !!el && el.children.length > 0
    })
    await page.waitForTimeout(1_000)

    await expect(page.locator('.ag-whats-new-sheet')).toHaveCount(0)
    // The version was recorded without any sheet.
    expect(await page.evaluate(() => localStorage.getItem('mark-e2e-prefs:lastSeenVersion'))).toBe(
      '"2.5.0"'
    )
    expect(await page.evaluate(() => localStorage.getItem('mark-e2e-prefs:lastUpdateAt'))).toBeNull()
  })

  test('a 2.3.1 profile (legacy keys, no lastSeenVersion) shows the sheet once', async ({ page }) => {
    await page.goto(BOOT_URL)
    await waitForBoot(page)
    await waitForGateRecord(page)

    // Rebuild the profile as 2.3.1 left it: no lastSeenVersion (C-48 did
    // not exist), an m005 marker stamped 30 days ago, and folder history.
    await page.evaluate(() => {
      for (const k of Object.keys(localStorage)) {
        if (k.startsWith('mark-e2e-prefs:')) localStorage.removeItem(k)
      }
      localStorage.setItem(
        'mark-e2e-prefs:mt_migration',
        JSON.stringify({
          app_version: 'alpha',
          schema_version: 1,
          marker_written_at: Math.floor(Date.now() / 1000) - 30 * 86400
        })
      )
      localStorage.setItem('mark-e2e-prefs:recentFolders', JSON.stringify(['/tmp/mark-e2e']))
    })

    await page.reload()
    const sheet = page.locator('.ag-whats-new-sheet')
    await expect(sheet).toBeVisible({ timeout: 15_000 })
    await expect(sheet.locator('.eyebrow')).toHaveText('Mark 2.5.0')
    expect(await page.evaluate(() => localStorage.getItem('mark-e2e-prefs:lastSeenVersion'))).toBe(
      '"2.5.0"'
    )

    await sheet.press('Escape')
    await expect(sheet).toBeHidden()

    // Once only: the version is recorded now.
    await page.reload()
    await waitForBoot(page)
    await page.waitForTimeout(1_000)
    await expect(page.locator('.ag-whats-new-sheet')).toHaveCount(0)
  })

  // START_BLOCK_C53_RELEASE_LINK
  // C-53 R-1: the «See everything new» link opens the GitHub release page
  // through the app's external-link path (window.electron.shell.openExternal
  // → @tauri-apps/plugin-opener openUrl → plugin:opener|open_url) and keeps
  // the sheet open — the browser takes focus, the user closes the sheet.
  test('"See everything new" opens the v2.5.0 release page externally and keeps the sheet open', async ({ page }) => {
    await page.goto(BOOT_URL)
    await waitForGateRecord(page)
    await page.evaluate(() => {
      localStorage.setItem('mark-e2e-prefs:lastSeenVersion', JSON.stringify('2.4.0'))
    })
    await page.reload()

    const sheet = page.locator('.ag-whats-new-sheet')
    await expect(sheet).toBeVisible({ timeout: 15_000 })

    // The opener override can only land once the shim's init script has
    // installed window.__mockInvoke (i.e. after a load).
    const openedUrls: unknown[] = []
    await page.exposeFunction('__recordOpenUrl', (args: unknown) => {
      openedUrls.push(args)
      return null
    })
    await page.evaluate(() => {
      ;(window as any).__mockInvoke['plugin:opener|open_url'] = (args: any) =>
        (window as any).__recordOpenUrl(args)
    })

    await sheet.locator('.foot-links .guide-link').first().click()
    await expect
      .poll(() => openedUrls.map((a: any) => a?.url), { timeout: 5_000 })
      .toEqual(['https://github.com/xronocode/mark/releases/tag/v2.5.0'])
    await expect(sheet).toBeVisible()
  })
  // END_BLOCK_C53_RELEASE_LINK
})
