// FILE: tests/e2e/whats-new.spec.ts
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Pin the C-48 What's New boot flow end to end — a recorded
//            previous version shows the sheet once, Esc closes it, and
//            a reload of the same version never shows it again; a fresh
//            install (no recorded version) never shows it.
//   SCOPE: renderer boot against the tauri-shim with prefs backed by
//          localStorage and __APP_VERSION_OVERRIDE__ = 2.3.1.
//   DEPENDS: @playwright/test, ./fixtures/tauri-shim.
//   LINKS: .grace/changes/active/C-48/spec.xml R-1; V-M-011 scenario-45.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   installWhatsNewShim - prefs get/set over localStorage + version override.
//   BOOT_URL - editor boot URL used across app-boot-style specs.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - 2026-10-15 C-48 T-001: initial pins.
// END_CHANGE_SUMMARY

import { test, expect } from '@playwright/test'
import { installTauriShim } from './fixtures/tauri-shim'

const BOOT_URL = '/?type=editor&wid=0&udp=/tmp/mark-e2e&debug=0'

// The dev build's __APP_VERSION__ (2.3.0) predates the 2.3.1 content, so
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
      }
    }
  }, runningVersion)
}

test.describe("What's New (C-48)", () => {
  test.beforeEach(async ({ page }) => {
    await installWhatsNewShim(page, '2.3.1')
  })

  test('upgrade shows the sheet once; Esc closes; reload does not show it again', async ({ page }) => {
    await page.goto(BOOT_URL)

    // Simulate the previous version having been recorded.
    await page.evaluate(() => {
      localStorage.setItem('mark-e2e-prefs:lastSeenVersion', JSON.stringify('2.3.0'))
    })

    // The gate runs during boot — a reload re-evaluates with the seeded
    // previous version and opens the sheet exactly once.
    await page.reload()

    const sheet = page.locator('.ag-whats-new-sheet')
    await expect(sheet).toBeVisible({ timeout: 15_000 })
    await expect(sheet.locator('.eyebrow')).toHaveText('Mark 2.3.1')
    await expect(sheet.locator('.news li')).toHaveCount(4)

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
      '"2.3.1"'
    )
    expect(await page.evaluate(() => localStorage.getItem('mark-e2e-prefs:lastUpdateAt'))).toBeNull()
  })
})
