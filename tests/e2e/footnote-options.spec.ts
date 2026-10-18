// FILE: tests/e2e/footnote-options.spec.ts
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Verify live footnote preference changes in the real renderer without reopening documents.
//   SCOPE: Backend preference broadcasts, saved and unsaved buffers, undo/redo and cached background tabs in Chromium and WebKit.
//   DEPENDS: Playwright, tauri-shim, bootEditor/openFileTab helpers.
//   LINKS: .grace/changes/archive/C-60; .grace/verification/runtime.xml V-M-012 scenario-24 and V-M-011.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
// START_MODULE_MAP
//   DOC - named footnotes and ordinary editable text.
//   setFootnotes - deliver the same preference broadcast as the Settings window.
//   currentState - capture content and editing metadata from the real Pinia store.
// END_MODULE_MAP
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - 2026-10-18 C-60: immediate option application without content/history/cache regressions.
// END_CHANGE_SUMMARY

import { test, expect, type Page } from '@playwright/test'
import { installTauriShim } from './fixtures/tauri-shim'
import { bootEditor, openFileTab } from './fixtures/helpers'

const DOC = '# Footnotes\n\nEditable paragraph with a note[^history].\n\n[^history]: Evidence with `code`.\n\n[^second]: More evidence.\n'

async function setFootnotes(page: Page, footnote: boolean) {
  await page.evaluate(value => {
    ;(window as any).__emitFakeEvent('mt::user-preference', { footnote: value })
  }, footnote)
}

async function currentState(page: Page) {
  return page.evaluate(() => {
    const pinia = (document.querySelector('#app') as any).__vue_app__.config.globalProperties.$pinia
    const file = pinia.state.value.editor.currentFile
    return {
      id: file.id, markdown: file.markdown, isSaved: file.isSaved,
      revision: file.contentRevision, index: file.history?.index,
      length: file.history?.stack.length
    }
  })
}

test.describe('live footnote preference (C-60)', () => {
  test.beforeEach(async ({ page }) => {
    await installTauriShim(page)
    await page.addInitScript(() => {
      ;(window as any).__mockInvoke.mt_prefs_get_all = () => ({
        theme: 'paper', language: 'en', footnote: false,
        autoSave: false, spellcheckerEnabled: false, followSystemTheme: false,
        lightModeTheme: 'paper', darkModeTheme: 'ink'
      })
    })
    await bootEditor(page)
    await openFileTab(page, '/tmp/c60/footnotes.md', DOC)
  })

  test('on and off immediately rebuild definitions while a saved file stays unchanged', async ({ page }) => {
    const notes = page.locator('.editor-with-tabs figure[data-role="FOOTNOTE"]')
    await expect(notes).toHaveCount(0)
    const before = await currentState(page)
    expect(before.isSaved).toBe(true)
    await setFootnotes(page, true)
    await expect(notes).toHaveCount(2)
    expect(await currentState(page)).toEqual(before)
    await page.screenshot({ path: `test-results/c60-footnotes-${test.info().project.name}.png` })
    await setFootnotes(page, false)
    await expect(notes).toHaveCount(0)
    expect(await currentState(page)).toEqual(before)
  })

  test('unsaved edits survive the toggle and undo/redo keeps the selected grammar', async ({ page }) => {
    const paragraph = page.locator('.editor-with-tabs p', { hasText: 'Editable paragraph' }).first()
    await paragraph.click()
    await page.keyboard.press('End')
    await page.keyboard.type(' Unsaved edit.')
    await expect.poll(async () => (await currentState(page)).markdown).toContain('Unsaved edit.')
    const edited = await currentState(page)
    expect(edited.isSaved).toBe(false)
    await setFootnotes(page, true)
    const notes = page.locator('.editor-with-tabs figure[data-role="FOOTNOTE"]')
    await expect(notes).toHaveCount(2)
    expect(await currentState(page)).toEqual(edited)
    await page.evaluate(() => (window as any).__emitFakeEvent('mt::menu-invoked', 'edit.undo'))
    await expect.poll(async () => (await currentState(page)).markdown).not.toContain('Unsaved edit.')
    await expect(notes).toHaveCount(2)
    await page.evaluate(() => (window as any).__emitFakeEvent('mt::menu-invoked', 'edit.redo'))
    await expect.poll(async () => (await currentState(page)).markdown).toBe(edited.markdown)
    await expect(notes).toHaveCount(2)
  })

  test('switching tabs cannot resurrect blocks parsed with the old setting', async ({ page }) => {
    await openFileTab(page, '/tmp/c60/other.md', DOC.replace('# Footnotes', '# Other'))
    await setFootnotes(page, true)
    const notes = page.locator('.editor-with-tabs figure[data-role="FOOTNOTE"]')
    await expect(notes).toHaveCount(2)
    await page.locator('.tabs-container li', { hasText: 'footnotes.md' }).click()
    await expect(page.locator('.editor-with-tabs h1')).toContainText('Footnotes')
    await expect(notes).toHaveCount(2)
    await setFootnotes(page, false)
    await expect(notes).toHaveCount(0)
    await page.locator('.tabs-container li', { hasText: 'other.md' }).click()
    await expect(page.locator('.editor-with-tabs h1')).toContainText('Other')
    await expect(notes).toHaveCount(0)
    expect((await currentState(page)).isSaved).toBe(true)
  })

  test('the source-side Split View mirror also invalidates background block caches', async ({ page }) => {
    await openFileTab(page, '/tmp/c60/other.md', DOC.replace('# Footnotes', '# Other'))
    await page.evaluate(() => (window as any).__emitFakeEvent('mt::menu-invoked', 'view.split-view'))
    await page.evaluate(() => (window as any).__emitFakeEvent('mt::menu-invoked', 'view.source-code-mode'))
    await expect(page.locator('.editor-wrapper.is-mirror')).toBeVisible()
    await setFootnotes(page, true)
    await expect(page.locator('figure[data-role="FOOTNOTE"]')).toHaveCount(2)
    await page.evaluate(() => (window as any).__emitFakeEvent('mt::menu-invoked', 'view.source-code-mode'))
    await page.locator('.tabs-container li', { hasText: 'footnotes.md' }).click()
    await expect(page.locator('.editor-with-tabs h1')).toContainText('Footnotes')
    await expect(page.locator('figure[data-role="FOOTNOTE"]')).toHaveCount(2)
    expect((await currentState(page)).isSaved).toBe(true)
  })
})
