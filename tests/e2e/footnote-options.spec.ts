// FILE: tests/e2e/footnote-options.spec.ts
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Verify live footnote preference changes in the real renderer without reopening documents.
//   SCOPE: Backend preference broadcasts, saved and unsaved buffers, undo/redo and cached background tabs in Chromium and WebKit.
//   DEPENDS: Playwright, tauri-shim, bootEditor/openFileTab helpers.
//   LINKS: M-011, M-012
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
// START_MODULE_MAP
//   DOC - named footnotes and ordinary editable text.
//   setFootnotes - deliver the same preference broadcast as the Settings window.
//   currentState - capture content and editing metadata from the real Pinia store.
//   tabStates - capture the same invariants for every open tab.
//   sourceText - read the mounted editable source buffer.
//   cachedBlocks - observe the actual background parse cache without changing it.
//   editableSourceSplit - enter the selected tab's split through menu commands and verify both writable surfaces.
// END_MODULE_MAP
// START_CHANGE_SUMMARY
//   LAST_CHANGE: 2026-11-10 C-STABILIZE-SPLIT-E2E: verify preference-only rebuilds in editable source-side split, both-tab metadata/cache invariants and shared undo/redo under the current grammar.
//   PREV: v1.0.0 - 2026-10-18 C-60: immediate option application without content/history/cache regressions.
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

async function tabStates(page: Page) {
  return page.evaluate(() => {
    const editor = (document.querySelector('#app') as any).__vue_app__.config.globalProperties.$pinia.state.value.editor
    return editor.tabs.map((file: any) => ({
      id: file.id, markdown: file.markdown, isSaved: file.isSaved,
      revision: file.contentRevision, index: file.history?.index, length: file.history?.stack.length
    })).sort((a: any, b: any) => String(a.id).localeCompare(String(b.id)))
  })
}
async function sourceText(page: Page): Promise<string> {
  return page.locator('.split-pane-source .CodeMirror').evaluate(element => (element as any).CodeMirror.getValue())
}
async function cachedBlocks(page: Page, pathname: string): Promise<boolean> {
  return page.evaluate(pathname => {
    const editor = (document.querySelector('#app') as any).__vue_app__.config.globalProperties.$pinia.state.value.editor
    const tab = editor.tabs.find((file: any) => file.pathname === pathname)
    return Array.isArray(tab?.blocks) && tab.blocks.length > 0
  }, pathname)
}

async function editableSourceSplit(page: Page) {
  const mode = await page.evaluate(() => {
    const pinia = (document.querySelector('#app') as any).__vue_app__.config.globalProperties.$pinia
    return { split: pinia.state.value.editor.currentFile.splitView, source: pinia.state.value.preferences.sourceCode }
  })
  // Split is per tab; source mode is global. A tab switch can legitimately
  // return to full-window source until this tab is explicitly split too.
  if (!mode.split) await page.evaluate(() => (window as any).__emitFakeEvent('mt::menu-invoked', 'view.split-view'))
  if (!mode.source) await page.evaluate(() => (window as any).__emitFakeEvent('mt::menu-invoked', 'view.source-code-mode'))
  await expect(page.locator('.split-view.is-split')).toBeVisible()
  await expect(page.locator('.split-pane-rich .editor-component')).toHaveAttribute('contenteditable', 'true')
  await expect(page.locator('.split-pane-source .CodeMirror')).toBeVisible()
  expect(await page.locator('.split-pane-source .CodeMirror').evaluate(element => (element as any).CodeMirror.getOption('readOnly'))).toBe(false)
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

  test('the editable source-side Split View reparses companions and invalidates background caches without edits', async ({ page }) => {
    // Populate the legacy rich tab's real parse cache through normal caret
    // navigation, then leave it in the background while the companion is active.
    await page.locator('.editor-with-tabs p', { hasText: 'Editable paragraph' }).first().click()
    await page.keyboard.press('End')
    await expect.poll(() => cachedBlocks(page, '/tmp/c60/footnotes.md')).toBe(true)
    await openFileTab(page, '/tmp/c60/other.md', DOC.replace('# Footnotes', '# Other'))
    await editableSourceSplit(page)
    const rich = page.locator('.split-pane-rich')
    const source = page.locator('.split-pane-source .CodeMirror')
    const otherId = (await currentState(page)).id
    const before = await tabStates(page)
    const sourceBefore = await sourceText(page)
    await setFootnotes(page, true)
    await expect(rich.locator('figure[data-role="FOOTNOTE"]')).toHaveCount(2)
    expect(await tabStates(page)).toEqual(before)
    expect(await sourceText(page)).toBe(sourceBefore)
    expect(await cachedBlocks(page, '/tmp/c60/footnotes.md')).toBe(false)

    await page.locator('.tabs-container li', { hasText: 'footnotes.md' }).click()
    await expect(rich.locator('h1')).toContainText('Footnotes')
    await editableSourceSplit(page)
    await expect(rich.locator('figure[data-role="FOOTNOTE"]')).toHaveCount(2)
    expect((await currentState(page)).isSaved).toBe(true)
    await expect.poll(() => sourceText(page)).toBe((await currentState(page)).markdown)
    // A real source edit remains the one undoable action when the grammar
    // changes; the preference itself must add no content/history revision.
    await source.evaluate(element => {
      const cm = (element as any).CodeMirror
      cm.focus(); cm.setCursor({ line: 2, ch: cm.getLine(2).length })
    })
    await page.keyboard.type(' Source undo.')
    await expect.poll(async () => (await currentState(page)).markdown).toContain(' Source undo.')
    await rich.locator('h1').click() // Flush the shared typing owner before the snapshot.
    const edited = await currentState(page)
    const editedTabs = await tabStates(page)
    expect(edited.isSaved).toBe(false)
    await setFootnotes(page, false)
    await expect(rich.locator('figure[data-role="FOOTNOTE"]')).toHaveCount(0)
    expect(await tabStates(page)).toEqual(editedTabs)
    expect(await sourceText(page)).toBe(edited.markdown)
    await source.evaluate(element => (element as any).CodeMirror.focus())
    await page.evaluate(() => (window as any).__emitFakeEvent('mt::menu-invoked', 'edit.undo'))
    await expect.poll(async () => (await currentState(page)).markdown).not.toContain(' Source undo.')
    await expect(rich.locator('figure[data-role="FOOTNOTE"]')).toHaveCount(0)
    await page.evaluate(() => (window as any).__emitFakeEvent('mt::menu-invoked', 'edit.redo'))
    await expect.poll(async () => (await currentState(page)).markdown).toBe(edited.markdown)
    await expect(rich.locator('figure[data-role="FOOTNOTE"]')).toHaveCount(0)
    const replayed = await tabStates(page)
    await setFootnotes(page, true)
    await expect(rich.locator('figure[data-role="FOOTNOTE"]')).toHaveCount(2)
    expect(await tabStates(page)).toEqual(replayed)
    expect(await sourceText(page)).toBe(edited.markdown)
    await page.locator('.tabs-container li', { hasText: 'other.md' }).click()
    await expect(rich.locator('h1')).toContainText('Other')
    await editableSourceSplit(page)
    await expect(rich.locator('figure[data-role="FOOTNOTE"]')).toHaveCount(2)
    await expect.poll(() => sourceText(page)).toBe(sourceBefore)
    expect(await currentState(page)).toEqual(replayed.find((file: any) => file.id === otherId))
  })
})
