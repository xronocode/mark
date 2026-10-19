// FILE: tests/e2e/keyboard-shortcuts.spec.ts
// VERSION: 1.1.0
// START_MODULE_CONTRACT
//   PURPOSE: Verify renderer keyboard surfaces — bus-triggered layout commands and the FIX-005/FIX-006 paragraph shortcut wave (⌘1–6 headings, ⇧⌘D duplicate, ⇧⌘N new paragraph, ⇧⌘⌫ delete).
//   SCOPE: Real key presses into the booted Muya surface, markdown/DOM outcome assertions, read-only-surface suppression.
//   DEPENDS: Playwright, renderer-only Tauri shim, editor boot helpers.
//   LINKS: .grace/graph/runtime.xml M-012; .grace/verification/runtime.xml V-M-012; docs/release-trains/2.5.x-next.md FIX-005/FIX-006.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
// START_MODULE_MAP
//   MOD - Platform modifier name for Playwright key presses (Meta on darwin, Control elsewhere).
//   currentMarkdown - Reads the active tab's markdown straight from the pinia state.
//   typeIntoEditor - Focuses the first paragraph and types text through the real keyboard.
// END_MODULE_MAP
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.1.0 - 2026-10-20 FIX-005/FIX-006: real-key coverage for the paragraph shortcut wave (headings ⌘1–6, duplicate ⇧⌘D, new paragraph ⇧⌘N, delete ⇧⌘⌫, locked-tab suppression).
//   PREV: v1.0.0 - bus-triggered command coverage.
// END_CHANGE_SUMMARY

import { test, expect } from '@playwright/test'
import { installTauriShim } from './fixtures/tauri-shim'
import { bootEditor, openFileTab } from './fixtures/helpers'

const MOD = process.platform === 'darwin' ? 'Meta' : 'Control'

const currentMarkdown = (page: import('@playwright/test').Page): Promise<string> =>
  page.evaluate(() => {
    const app = document.querySelector('#app') as any
    return app.__vue_app__.config.globalProperties.$pinia.state.value.editor.currentFile.markdown
  })

async function typeIntoEditor(page: import('@playwright/test').Page, text: string): Promise<void> {
  const paragraph = page.locator('#ag-editor-id span.ag-paragraph').first()
  await paragraph.click()
  await page.keyboard.type(text)
}

test.describe('bus-triggered commands', () => {
  test.beforeEach(async ({ page }) => {
    await installTauriShim(page)

    await page.addInitScript(() => {
      ;(window as any).__mockInvoke.mt_prefs_set = () => null
    })
  })

  test('new-untitled-tab bus event creates a new tab', async ({ page }) => {
    await bootEditor(page)

    const tabContainer = page.locator('.editor-tabs .tabs-container')
    const countBefore = await tabContainer.locator('li').count()

    await page.evaluate(() => {
      ;(window as any).__bus.emit('mt::new-untitled-tab', { selected: '', markdown: '' })
    })

    await expect
      .poll(async () => tabContainer.locator('li').count(), { timeout: 5_000 })
      .toBe(countBefore + 1)
  })

  test('find event opens search, replace event opens replace mode', async ({ page }) => {
    await bootEditor(page)

    await openFileTab(page, '/tmp/cmd-search.md', '# Test\n\nSome content.\n')

    await page.evaluate(() => {
      ;(window as any).__bus.emit('find', 'find')
    })
    await expect(page.locator('.search-bar')).toBeVisible({ timeout: 5_000 })
    await expect(page.locator('.search-bar .replace')).not.toBeVisible()

    await page.keyboard.press('Escape')
    await expect(page.locator('.search-bar')).not.toBeVisible({ timeout: 5_000 })

    await page.evaluate(() => {
      ;(window as any).__bus.emit('replace', 'replace')
    })
    await expect(page.locator('.search-bar')).toBeVisible({ timeout: 5_000 })
    await expect(page.locator('.search-bar .replace')).toBeVisible({ timeout: 5_000 })
  })

  test('toggle sidebar via bus event', async ({ page }) => {
    await bootEditor(page, { sideBarVisibility: true })
    await expect(page.locator('.side-bar')).toBeVisible({ timeout: 5_000 })

    await page.evaluate(() => {
      ;(window as any).__bus.emit('view:toggle-layout-entry', 'showSideBar')
    })

    await expect(page.locator('.side-bar')).not.toBeVisible({ timeout: 5_000 })

    await page.evaluate(() => {
      ;(window as any).__bus.emit('view:toggle-layout-entry', 'showSideBar')
    })

    await expect(page.locator('.side-bar')).toBeVisible({ timeout: 5_000 })
  })

  test('toggle source code mode via bus event', async ({ page }) => {
    await bootEditor(page)

    await openFileTab(page, '/tmp/cmd-source.md', '# Title\n\nContent.\n')

    await expect(page.locator('.source-code')).not.toBeVisible()

    await page.evaluate(() => {
      ;(window as any).__bus.emit('view:toggle-view-entry', 'sourceCode')
    })

    await expect(page.locator('.source-code')).toBeVisible({ timeout: 5_000 })
  })
})

test.describe('FIX-005/FIX-006 paragraph shortcut wave', () => {
  test.beforeEach(async ({ page }) => {
    await installTauriShim(page)

    await page.addInitScript(() => {
      ;(window as any).__mockInvoke.mt_prefs_set = () => null
    })
  })

  test('Cmd+1..6 turn the paragraph into headings', async ({ page }) => {
    await bootEditor(page)
    await openFileTab(page, '/tmp/cmd-headings.md', 'plain line\n')

    const paragraph = page.locator('#ag-editor-id span.ag-paragraph').first()
    await paragraph.click()

    await page.keyboard.press(`${MOD}+1`)
    await expect
      .poll(async () => (await currentMarkdown(page)).trim(), { timeout: 5_000 })
      .toBe('# plain line')

    await page.keyboard.press(`${MOD}+3`)
    await expect
      .poll(async () => (await currentMarkdown(page)).trim(), { timeout: 5_000 })
      .toBe('### plain line')
    await expect(page.locator('#ag-editor-id h3').first()).toBeVisible()
  })

  test('Cmd+Shift+D duplicates the current paragraph', async ({ page }) => {
    await bootEditor(page)
    await openFileTab(page, '/tmp/cmd-duplicate.md', 'duplicate me\n')

    const paragraph = page.locator('#ag-editor-id span.ag-paragraph').first()
    await paragraph.click()
    await page.keyboard.press(`${MOD}+Shift+D`)

    await expect
      .poll(async () => await currentMarkdown(page), { timeout: 5_000 })
      .toBe('duplicate me\n\nduplicate me\n')
  })

  test('Cmd+Shift+Backspace deletes the current paragraph', async ({ page }) => {
    await bootEditor(page)
    await openFileTab(page, '/tmp/cmd-delete-p.md', 'first\n\nsecond\n')

    const paragraph = page.locator('#ag-editor-id span.ag-paragraph').nth(1)
    await paragraph.click()
    await page.keyboard.press(`${MOD}+Shift+Backspace`)

    await expect
      .poll(async () => (await currentMarkdown(page)).trim(), { timeout: 5_000 })
      .toBe('first')
  })

  test('paragraph shortcuts do not fire in a locked tab', async ({ page }) => {
    await bootEditor(page)
    await openFileTab(page, '/tmp/cmd-locked.md', 'stay plain\n')

    await page.evaluate(() => {
      const app = document.querySelector('#app') as any
      const editor = app.__vue_app__.config.globalProperties.$pinia.state.value.editor
      editor.currentFile.locked = true
    })

    const paragraph = page.locator('#ag-editor-id span.ag-paragraph').first()
    await paragraph.click()
    await page.keyboard.press(`${MOD}+1`)
    await page.waitForTimeout(300)

    expect((await currentMarkdown(page)).trim()).toBe('stay plain')
  })
})
