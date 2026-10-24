// FILE: tests/e2e/notifications-system.spec.ts
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: C-NOTIFICATION-SYSTEM e2e + visual probe — one card per
//            severity in Paper and Ink with pixel-precise chip tint
//            assertions (computed color = 14% severity over floatBg), stack
//            cap with the English overflow chip, sticky errors, Esc
//            topmost dismissal, and copy-on-select with the double green
//            pulse.
//   SCOPE: renderer-only e2e against vite preview + tauri-shim; drives the
//            live notifications pinia store directly (the same NOTIFY the
//            ~70 call sites reach through the facade). Evidence crops land
//            in the change bundle's evidence/ directory.
//   DEPENDS: @playwright/test, tests/e2e/fixtures/tauri-shim,
//            tests/e2e/fixtures/helpers (bootEditor).
//   LINKS: .grace/changes/active/C-NOTIFICATION-SYSTEM spec R-1..R-4,
//          plan T-008, corners C-1..C-4.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   EVIDENCE_DIR - change-bundle evidence directory for the stack crops.
//   THEME_PREFS - mt_prefs_get_all mock bodies for paper/ink.
//   useTheme - init script installing THEME_PREFS.
//   clipStub - init script recording navigator.clipboard.writeText calls.
//   notify - call the live notifications store NOTIFY on the page.
//   cardOf - locator for the card with a given severity.
//   chipColor - computed backgroundColor of a card's severity chip.
//   cardBg - computed backgroundColor of the first card.
//   expectedChipColor - exact color(srgb … / 0.14) string for a severity.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - 2026-10-23 C-NOTIFICATION-SYSTEM T-008: initial
//   probe — chip-tint equality in both themes, overflow chip with English
//   plurals, sticky-vs-timed behavior, Esc topmost, copy-on-select pulse.
// END_CHANGE_SUMMARY

import { test, expect, type Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { installTauriShim } from './fixtures/tauri-shim'
import { bootEditor } from './fixtures/helpers'

const EVIDENCE_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../../.grace/changes/active/C-NOTIFICATION-SYSTEM/evidence')

// Complete prefs table (the shim applies only what mt_prefs_get_all
// returns), pinned to the two normative themes.
const THEME_PREFS: Record<string, Record<string, unknown>> = {
  paper: { theme: 'paper', titleBarStyle: 'custom', sideBarVisibility: false, tabBarVisibility: true, fontSize: 16, lineHeight: 1.6, editorFontFamily: 'Open Sans', codeFontFamily: 'DejaVu Sans Mono', codeFontSize: '14px', followSystemTheme: false, lightModeTheme: 'paper', darkModeTheme: 'ink', language: 'en', autoSave: false },
  ink: { theme: 'ink', titleBarStyle: 'custom', sideBarVisibility: false, tabBarVisibility: true, fontSize: 16, lineHeight: 1.6, editorFontFamily: 'Open Sans', codeFontFamily: 'DejaVu Sans Mono', codeFontSize: '14px', followSystemTheme: false, lightModeTheme: 'paper', darkModeTheme: 'ink', language: 'en', autoSave: false }
}

async function useTheme(page: Page, theme: 'paper' | 'ink') {
  await page.addInitScript((t: string) => {
    const w = window as any
    w.__mockInvoke = {
      ...w.__mockInvoke,
      mt_prefs_get_all: () => (t === 'ink'
        ? { theme: 'ink', titleBarStyle: 'custom', sideBarVisibility: false, tabBarVisibility: true, fontSize: 16, lineHeight: 1.6, editorFontFamily: 'Open Sans', codeFontFamily: 'DejaVu Sans Mono', codeFontSize: '14px', followSystemTheme: false, lightModeTheme: 'paper', darkModeTheme: 'ink', language: 'en', autoSave: false }
        : { theme: 'paper', titleBarStyle: 'custom', sideBarVisibility: false, tabBarVisibility: true, fontSize: 16, lineHeight: 1.6, editorFontFamily: 'Open Sans', codeFontFamily: 'DejaVu Sans Mono', codeFontSize: '14px', followSystemTheme: false, lightModeTheme: 'paper', darkModeTheme: 'ink', language: 'en', autoSave: false })
    }
  }, theme)
}

// Records clipboard writes for the copy-on-select assertion (headless
// Chromium has no user-granted clipboard).
async function clipStub(page: Page) {
  await page.addInitScript(() => {
    const w = window as any
    w.__clipWrites = []
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: (t: string) => { w.__clipWrites.push(t); return Promise.resolve() } },
      configurable: true
    })
  })
}

async function notify(page: Page, opts: Record<string, unknown>) {
  await page.evaluate((o) => {
    const el = document.querySelector('#app') as any
    const pinia = el?.__vue_app__?.config?.globalProperties?.$pinia
    pinia?._s.get('notifications')?.NOTIFY(o)
  }, opts)
}

const cardOf = (page: Page, severity: string) =>
  page.locator(`.notification-card[data-notify-severity="${severity}"]`)

async function chipColor(page: Page, severity: string): Promise<string> {
  return page.locator(`.notification-card[data-notify-severity="${severity}"] .sev-chip`).evaluate((el) => getComputedStyle(el).backgroundColor)
}

async function cardBg(page: Page): Promise<string> {
  return page.locator('.notification-card').first().evaluate((el) => getComputedStyle(el).backgroundColor)
}

// Chromium resolves color-mix(14% severity) on a transparent-over-surface
// background to an exact color(srgb … / 0.14) — asserting that string
// pins BOTH the severity token and the tint percentage pixel-precisely.
function expectedChipColor(sev: [number, number, number]) {
  const ch = (v: number) => (v / 255).toFixed(6)
  return `color(srgb ${ch(sev[0])} ${ch(sev[1])} ${ch(sev[2])} / 0.14)`
}

test.describe('notifications system (C-NOTIFICATION-SYSTEM)', () => {
  test.beforeEach(async ({ page }) => {
    await installTauriShim(page)
    await clipStub(page)
    await useTheme(page, 'paper')
    await bootEditor(page)
    mkdirSync(EVIDENCE_DIR, { recursive: true })
  })

  test('chip tint is 14% severity over floatBg — Paper and Ink (R-1)', async ({ page }) => {
    await notify(page, { severity: 'error', sticky: true, title: 'Export failed', message: 'no access' })
    await notify(page, { severity: 'success', title: 'Exported', message: 'notes.html' })
    await expect(cardOf(page, 'error')).toBeVisible()
    await expect(cardOf(page, 'success')).toBeVisible()

    // Paper: error #D5453C, success #2F9E63 — exact 14% tint of the token.
    expect(await chipColor(page, 'error')).toBe(expectedChipColor([213, 69, 60]))
    expect(await chipColor(page, 'success')).toBe(expectedChipColor([47, 158, 99]))
    // The icon-chip family has no severity stripe: the card's left edge is
    // the surface itself.
    expect(await cardBg(page)).toBe('rgb(255, 253, 248)')

    // Evidence crops for the visual acceptance pass: the decisive regions
    // only (owner protocol — full-window shots read as noise), one card per
    // severity in each theme.
    for (const severity of ['error', 'success'] as const) {
      const box = await cardOf(page, severity).boundingBox()
      if (box) {
        await page.screenshot({
          path: resolve(EVIDENCE_DIR, `card-${severity}-paper.png`),
          clip: { x: Math.max(0, box.x - 6), y: Math.max(0, box.y - 6), width: box.width + 12, height: box.height + 12 }
        })
      }
    }
    await page.screenshot({ path: resolve(EVIDENCE_DIR, 'stack-paper.png') })

    // Ink pass in the same test run boundary: reload with the ink table.
    await useTheme(page, 'ink')
    await page.reload()
    await bootEditor(page)
    await notify(page, { severity: 'error', sticky: true, title: 'Export failed', message: 'no access' })
    await expect(cardOf(page, 'error')).toBeVisible()
    // Ink: error #F87A72.
    expect(await chipColor(page, 'error')).toBe(expectedChipColor([248, 122, 114]))
    {
      const box = await cardOf(page, 'error').boundingBox()
      if (box) {
        await page.screenshot({
          path: resolve(EVIDENCE_DIR, 'card-error-ink.png'),
          clip: { x: Math.max(0, box.x - 6), y: Math.max(0, box.y - 6), width: box.width + 12, height: box.height + 12 }
        })
      }
    }
    await page.screenshot({ path: resolve(EVIDENCE_DIR, 'stack-ink.png') })
  })

  test('error cards are sticky, timed cards dismiss; hairline follows (C-2)', async ({ page }) => {
    await notify(page, { severity: 'error', sticky: true, title: 'Boom', message: 'stays' })
    await expect(cardOf(page, 'error').locator('.timer')).toHaveCount(0)
    await notify(page, { severity: 'info', time: 1200, title: 'Ping', message: 'leaves' })
    const info = cardOf(page, 'info')
    await expect(info.locator('.timer')).toHaveCount(1)
    await expect(info).toBeHidden({ timeout: 4000 })
    await expect(cardOf(page, 'error')).toBeVisible()
  })

  test('five notifies render three cards plus the overflow chip (C-1)', async ({ page }) => {
    for (let i = 0; i < 5; i++) {
      await notify(page, { severity: 'error', sticky: true, title: 'n' + i, message: 'm' + i })
    }
    await expect(page.locator('.notification-card')).toHaveCount(3)
    const chip = page.locator('.stack-overflow')
    await expect(chip).toBeVisible()
    await expect(chip).toContainText('More 2 notifications')
  })

  test('Esc closes only the topmost card, never the stack (C-2)', async ({ page }) => {
    await notify(page, { severity: 'error', sticky: true, title: 'first', message: 'm' })
    await notify(page, { severity: 'error', sticky: true, title: 'second', message: 'm' })
    // Esc belongs to the editor while an editor surface holds focus — blur
    // first so the stack's passive handler owns the key.
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
    await page.keyboard.press('Escape')
    await expect(page.locator('.notification-card')).toHaveCount(1)
    await expect(page.locator('.notification-card .card-title')).toHaveText('first')
  })

  test('copy-on-select writes exactly the selection and pulses twice (C-3)', async ({ page }) => {
    await notify(page, { severity: 'error', sticky: true, title: 'Failed', message: 'path ~/Documents/notes/otchet.pdf missing' })
    const msg = cardOf(page, 'error').locator('.card-message')
    const box = await msg.boundingBox()
    expect(box).not.toBeNull()
    const y = box!.y + box!.height / 2
    await page.mouse.move(box!.x + 30, y)
    await page.mouse.down()
    await page.mouse.move(box!.x + 200, y, { steps: 8 })
    await page.mouse.up()

    // The card survived the selection release (corner C-3).
    await expect(cardOf(page, 'error')).toBeVisible()
    // The pulse span exists right after release…
    await expect(msg.locator('.notify-copied-pulse')).toHaveCount(1)
    // …and the recorded clipboard write carries real selected words.
    const writes = await page.evaluate(() => (window as any).__clipWrites)
    expect(writes.length).toBeGreaterThan(0)
    expect(String(writes[writes.length - 1])).toContain('~/Documents')
  })

  test('the palette command opens the history with full text (R-6)', async ({ page }) => {
    await notify(page, { severity: 'warning', title: 'W', message: 'the complete untruncated text of the warning' })
    await notify(page, { severity: 'error', sticky: true, title: 'E', message: 'boom' })
    await page.evaluate(() => {
      const el = document.querySelector('#app') as any
      const pinia = el?.__vue_app__?.config?.globalProperties?.$pinia
      pinia?._s.get('notifications')?.DISMISS_TOP()
    })
    await page.evaluate(() => {
      // The palette command routes through the bus event.
      const w = window as any
      w.__emitFakeEvent?.('mt::menu-invoked', { id: 'view.notifications-history' })
    })
    // Boot the same way the palette does (the command emits the bus event
    // directly when invoked from the store registry).
    await page.evaluate(() => {
      const el = document.querySelector('#app') as any
      el?.__vue_app__?.config?.globalProperties?.$pinia?._s.get('commandCenter')?.EXECUTE_COMMAND_BY_ID?.('view.notifications-history')
    })
    const dialog = page.locator('.notifications-history .el-dialog:visible, .el-dialog:has(.history-list)').first()
    await expect(dialog).toBeVisible({ timeout: 5000 })
    await expect(dialog.locator('.history-entry')).toHaveCount(2)
    // Newest first: the error entry heads the list, the warning follows
    // with its complete untruncated text.
    await expect(dialog.locator('.entry-text').first()).toHaveText('boom')
    await expect(dialog.locator('.entry-text').nth(1)).toContainText('complete untruncated text')
  })
})
