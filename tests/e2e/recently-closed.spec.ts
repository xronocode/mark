// FILE: tests/e2e/recently-closed.spec.ts
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Pin the FIX-009 current-run recovery in the built renderer — closing tabs fills the session-scoped history, the strip's count-badged button and popover reopen one entry or all (deterministic strip order with the active tab restored), the welcome block offers the same recovery after the last tab closes, and an independent reopen consumes the entry.
//   SCOPE: store/recentlyClosed + tabs.vue strip button/popover + welcome recovery block over the Tauri shim; no native dialogs, no ⇧⌘T native accelerator (menu-ridden — covered by the affordance-audit walk dispatching file.reopen-closed-tab).
//   DEPENDS: @playwright/test, ./fixtures/tauri-shim, the built renderer served by `npm run preview`.
//   LINKS: .grace/changes/active/C-FIX-009-RECENTLY-CLOSED; unit twins tests/renderer/store/recently-closed.test.js and tests/renderer/components/tabs-recently-closed.test.js.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   ROOT - the fake project folder of the closed documents.
//   installClosedShim - per-test fake prefs/filesystem with a mt_open_file round trip.
//   boot - cold launch without files (addBlankTab).
//   tabNames - the tab bar file names in order plus the active one.
//   historyCount - the recently-closed store entry count through the pinia state.
//   openDoc - one mt_open_file invoke (arrival funnel) for a pathname.
//   openThreeDocs - open alpha/beta/gamma and wait for three tabs and an empty history.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - 2026-10-21 C-FIX-009-RECENTLY-CLOSED: new — fails without the record hook (no strip button after a close), without deterministic Reopen-all ordering, and when an independent reopen does not consume the entry.
// END_CHANGE_SUMMARY

import { test, expect, Page } from '@playwright/test'
import { installTauriShim } from './fixtures/tauri-shim'

const ROOT = '/tmp/mark-e2e-recently-closed'

async function installClosedShim(page: Page, documents: Record<string, string> = {}) {
  await page.addInitScript(({ root, documents }) => {
    ;(window as any).__mockInvoke = {
      ...(window as any).__mockInvoke,
      mt_prefs_get: () => null,
      mt_prefs_set: () => null,
      mt_fs_stat: ({ path }: { path: string }) => ({
        isFile: path.endsWith('.md') && !path.includes('gone'),
        isDirectory: path === root,
        size: 10,
        mode: 0,
        mtimeMs: Date.now(),
        isSymbolicLink: false
      }),
      mt_walk_project: () => null,
      mt_open_file: (args: any) => {
        const p = Array.isArray(args?.args) ? args.args[0] : args?.pathname
        ;(window as any).__emitFakeEvent('mt::open-new-tab', {
          pathname: p,
          filename: p.split('/').pop(),
          markdown: documents[p] ?? `# ${p.split('/').pop()}\n`,
          isUtf8BomEncoded: false,
          lineEnding: 'lf',
          adjustLineEndingOnSave: false
        })
        return null
      }
    }
  }, { root: ROOT, documents })
}

async function boot(page: Page) {
  await page.goto('/?type=editor&wid=0&udp=/tmp/mark-e2e&debug=0')
  await page.waitForFunction(() => {
    const ls = (window as any).__shimListeners
    if (!ls) return false
    for (const m of ls.values()) if (m.event === 'mt::bootstrap-editor') return true
    return false
  }, undefined, { timeout: 15_000 })
  await page.evaluate(() => {
    ;(window as any).__emitFakeEvent('mt::bootstrap-editor', {
      addBlankTab: true,
      markdownList: [],
      lineEnding: 'lf',
      sideBarVisibility: true,
      tabBarVisibility: true,
      sourceCodeModeEnabled: false
    })
  })
}

const tabNames = (page: Page) => page.evaluate(() => {
  const items = Array.from(document.querySelectorAll('.tabs-container li'))
  return {
    names: items.map((li) => (li.querySelector('.name, .filename, span') as HTMLElement | null)?.textContent?.trim() || li.textContent!.trim()),
    active: (document.querySelector('.tabs-container li.active') as HTMLElement | null)?.textContent?.trim() || ''
  }
})

const historyCount = (page: Page) => page.evaluate(() => {
  const el = document.querySelector('#app') as any
  const state = el?.__vue_app__?.config?.globalProperties?.$pinia?.state?.value
  return (state?.recentlyClosed?.entries || []).length
})

const openDoc = (page: Page, pathname: string) =>
  page.evaluate((p) => (window as any).__mockInvoke.mt_open_file({ args: [p] }), pathname)

// Open three named documents (alpha active), ready to be closed.
const openThreeDocs = async (page: Page) => {
  await openDoc(page, `${ROOT}/alpha.md`)
  await openDoc(page, `${ROOT}/beta.md`)
  await openDoc(page, `${ROOT}/gamma.md`)
  await expect.poll(async () => (await tabNames(page)).names.length, { timeout: 10_000 }).toBe(3)
  await expect.poll(async () => historyCount(page)).toBe(0)
}

test.describe('recently closed tabs (FIX-009 current-run recovery)', () => {
  test.beforeEach(async ({ page }) => {
    await installTauriShim(page)
    await installClosedShim(page)
  })

  test('closing tabs fills the history; the strip button count matches; Reopen all restores strip order and the active tab', async ({ page }) => {
    await boot(page)
    await openThreeDocs(page)

    // Close gamma (active) and then beta by their own close glyphs; the
    // strip stays up with alpha, so the recovery button renders beside
    // the + (at zero tabs the welcome block owns recovery instead).
    await page.locator('.tabs-container li', { hasText: 'gamma' }).locator('.close-icon').click()
    await page.locator('.tabs-container li', { hasText: 'beta' }).locator('.close-icon').click()
    await expect.poll(async () => (await tabNames(page)).names.length).toBe(1)
    await expect.poll(async () => historyCount(page)).toBe(2)
    await expect(page.locator('.recently-closed-toggle .recently-closed-badge')).toHaveText('2')

    // Reopen all through the strip popover: beta and gamma come back in
    // strip order after alpha, and gamma (active at its close) ends
    // selected.
    await page.locator('.recently-closed-toggle').click()
    await expect(page.locator('.recently-closed-popover')).toBeVisible()
    await expect(page.locator('.recently-closed-popover .rc-row')).toHaveCount(2)
    await page.locator('.recently-closed-popover .rc-reopen-all').click()

    await expect.poll(async () => (await tabNames(page)).names.length, { timeout: 10_000 }).toBe(3)
    const tabs = await tabNames(page)
    expect(tabs.names[0]).toContain('alpha.md')
    expect(tabs.names[1]).toContain('beta.md')
    expect(tabs.names[2]).toContain('gamma.md')
    // gamma was the active tab at its close time — deterministic Reopen
    // all re-selects it even though beta reopens first.
    expect(tabs.active).toContain('gamma.md')
    await expect.poll(async () => historyCount(page)).toBe(0)
  })

  test('the popover reopens one entry and consumes it; a missing file drops with a notice', async ({ page }) => {
    await boot(page)
    await openDoc(page, `${ROOT}/alpha.md`)
    await openDoc(page, `${ROOT}/gone.md`)
    await expect.poll(async () => (await tabNames(page)).names.length).toBe(2)

    // Close gone.md (the active one) by its own glyph; alpha keeps the
    // strip — and the recovery button — on screen.
    await page.locator('.tabs-container li', { hasText: 'gone' }).locator('.close-icon').click()
    await expect.poll(async () => historyCount(page)).toBe(1)

    await page.locator('.recently-closed-toggle').click()
    // The single row is the missing gone.md: dropped with the localized
    // notice, nothing reopens.
    await page.locator('.recently-closed-popover .rc-row-button').first().click()
    await expect.poll(async () => historyCount(page)).toBe(0)
    await expect.poll(async () => (await tabNames(page)).names.length).toBe(1)

    // Close alpha too, then reopen it through the popover row.
    await page.locator('.tabs-container li', { hasText: 'alpha' }).locator('.close-icon').click()
    // alpha was the last tab: the welcome block owns this reopen.
    await page.locator('.row-recovery').first().click()
    await expect.poll(async () => (await tabNames(page)).names.length, { timeout: 10_000 }).toBe(1)
    expect((await tabNames(page)).names[0]).toContain('alpha.md')
    await expect.poll(async () => historyCount(page)).toBe(0)
  })

  test('an independent reopen consumes the entry (arrival funnel)', async ({ page }) => {
    await boot(page)
    await openDoc(page, `${ROOT}/alpha.md`)
    await openDoc(page, `${ROOT}/beta.md`)
    await page.locator('.tabs-container li.active .close-icon').first().click() // closes beta (active)
    await expect.poll(async () => historyCount(page)).toBe(1)

    // Open beta again through the generic open path (Recent files /
    // dialog funnel in the product): the closed-tab entry is consumed.
    await openDoc(page, `${ROOT}/beta.md`)
    await expect.poll(async () => historyCount(page)).toBe(0)
    await expect.poll(async () => (await tabNames(page)).names.length).toBe(2)
    // Consumed history means no strip button.
    await expect(page.locator('.recently-closed-toggle')).toHaveCount(0)
  })

  test('the welcome block recovers when the last tab closes mid-run', async ({ page }) => {
    await boot(page)
    await openDoc(page, `${ROOT}/alpha.md`)
    await openDoc(page, `${ROOT}/beta.md`)
    for (let i = 0; i < 2; i++) {
      await page.locator('.tabs-container li.active .close-icon').first().click()
      await page.waitForTimeout(50)
    }
    await expect(page.locator('.welcome-screen')).toBeVisible()

    // Primary action = reopen the NEWEST closed tab. The active tab
    // (beta) closed first, alpha closed last — so alpha is newest.
    await page.locator('.row-recovery').first().click()
    await expect.poll(async () => (await tabNames(page)).names.length, { timeout: 10_000 }).toBe(1)
    expect((await tabNames(page)).names[0]).toContain('alpha.md')
    await expect.poll(async () => historyCount(page)).toBe(1)
  })
})
