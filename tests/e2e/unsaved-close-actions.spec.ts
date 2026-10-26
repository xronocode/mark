// FILE: tests/e2e/unsaved-close-actions.spec.ts
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Drive the FIX-011 owner-approved untitled-tab action model through the real store funnel: Save & Close (successful, cancelled and failed Save As), Discard, Cancel, Escape and the close glyph — plus the named-file regression boundary.
//   SCOPE: Untitled and named dirty tabs closed via CLOSE_TAB → CLOSE_UNSAVED_TAB → askUnsavedClose in the renderer harness, with the mt_response_file_save_as / mt_save_and_close_tabs transports mocked per case.
//   DEPENDS: Playwright, renderer-only Tauri shim, editor boot helpers, the real Pinia editor store.
//   LINKS: .grace/changes/active/C-FIX-011-UNTITLED-CLOSE-ACTIONS; .grace/verification/runtime.xml V-M-011; docs/release-trains/2.5.x-next.md#fix-011; components/editorWithTabs/unsavedCloseDialog.js; unsaved-dialog-theme.spec.ts (FIX-007 dark-theme + styling).
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
// START_MODULE_MAP
//   dirtyTheTab - clicks into the editor, types, waits for isSaved=false on the active tab.
//   closeThroughStore - invokes CLOSE_TAB() on the real Pinia editor store.
//   storeState - reads { tabCount, savedIds, activeMarkdownIsDirty } snapshot from the store.
//   setSaveAsMock - installs a runtime mt_response_file_save_as override capturing calls.
// END_MODULE_MAP
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - 2026-10-20 FIX-011: new spec — the untitled
//   dialog closes the tab ONLY on a successful Save As; cancelled/failed
//   saves, Cancel, Escape and the close glyph leave the tab and its
//   content open; Discard closes without any save transport; the named
//   path still dispatches mt_save_and_close_tabs with the tab payload.
// END_CHANGE_SUMMARY

import { test, expect } from '@playwright/test'
import { installTauriShim } from './fixtures/tauri-shim'
import { bootEditor, openFileTab } from './fixtures/helpers'

async function storeState(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const store = (document.querySelector('#app') as any).__vue_app__
      .config.globalProperties.$pinia._s.get('editor')
    return {
      tabCount: store.tabs.length,
      ids: store.tabs.map((t: any) => t.id),
      dirty: store.tabs.map((t: any) => !t.isSaved),
      pathname: store.currentFile?.pathname ?? null
    }
  })
}

async function dirtyTheTab(page: import('@playwright/test').Page) {
  const paragraph = page.locator('#ag-editor-id span.ag-paragraph').last()
  await paragraph.click()
  await page.keyboard.type('unsaved edit')
  await page.waitForFunction(() => {
    const store = (document.querySelector('#app') as any).__vue_app__
      .config.globalProperties.$pinia._s.get('editor')
    return store.tabs.length > 0 && !store.tabs[0].isSaved
  }, undefined, { timeout: 5_000 })
}

async function closeThroughStore(page: import('@playwright/test').Page) {
  await page.evaluate(() => {
    const app = document.querySelector('#app') as any
    app.__vue_app__.config.globalProperties.$pinia._s.get('editor').CLOSE_TAB()
  })
}

// Installs a runtime save-as mock capturing every call. behaviour is a
// function evaluated in the page: () => outcome | null, or a thrower.
async function setSaveAsMock(page: import('@playwright/test').Page, behaviour: string) {
  await page.evaluate((body) => {
    const w = window as any
    w.__saveAsCalls = []
    w.__mockInvoke.mt_response_file_save_as = (args: any) => {
      w.__saveAsCalls.push(args)
      const outcome = eval(body)
      return outcome
    }
  }, behaviour)
}

test.describe('unsaved untitled-tab close actions (FIX-011)', () => {
  test.beforeEach(async ({ page }) => {
    await installTauriShim(page)
    await bootEditor(page) // one untitled tab, markdown ''
    await expect(page.locator('#ag-editor-id')).toBeVisible({ timeout: 10_000 })
  })

  test('Save & Close closes the tab only after Save As succeeds', async ({ page }) => {
    await dirtyTheTab(page)
    const ids = (await storeState(page)).ids
    await setSaveAsMock(page, `({ id: ${JSON.stringify(ids[0])}, pathname: '/tmp/mark-e2e/saved-untitled.md', filename: 'saved-untitled.md', isSaved: true })`)
    await closeThroughStore(page)
    const dialog = page.locator('.ag-unsaved-close-dialog')
    await expect(dialog).toBeVisible({ timeout: 5_000 })

    await page.locator('.ag-unsaved-close-save').click()
    await expect(dialog).toBeHidden({ timeout: 5_000 })
    await expect.poll(() => storeState(page).then(s => s.tabCount), { timeout: 5_000 }).toBe(0)
    const calls = await page.evaluate(() => (window as any).__saveAsCalls)
    expect(calls.length).toBe(1)
    expect(calls[0].filename).toBe('Untitled-1')
  })

  test('a cancelled Save As keeps the tab and its content open', async ({ page }) => {
    await dirtyTheTab(page)
    await setSaveAsMock(page, 'null')
    await closeThroughStore(page)
    await expect(page.locator('.ag-unsaved-close-dialog')).toBeVisible({ timeout: 5_000 })
    await page.locator('.ag-unsaved-close-save').click()
    await expect(page.locator('.ag-unsaved-close-dialog')).toBeHidden({ timeout: 5_000 })
    const state = await storeState(page)
    expect(state.tabCount).toBe(1)
    expect(state.dirty[0]).toBe(true)
    // The edit itself survived the cancelled save.
    const text = await page.evaluate(() => {
      const store = (document.querySelector('#app') as any).__vue_app__
        .config.globalProperties.$pinia._s.get('editor')
      return store.currentFile.markdown
    })
    expect(text).toContain('unsaved edit')
  })

  test('a failed Save As keeps the tab open and reports the failure', async ({ page }) => {
    await dirtyTheTab(page)
    await setSaveAsMock(page, `(() => { throw new Error('disk full (fixture)') })()`)
    await closeThroughStore(page)
    await expect(page.locator('.ag-unsaved-close-dialog')).toBeVisible({ timeout: 5_000 })
    await page.locator('.ag-unsaved-close-save').click()
    await expect(page.locator('.ag-unsaved-close-dialog')).toBeHidden({ timeout: 5_000 })
    await expect(page.locator('.notification-card').first()).toBeVisible({ timeout: 5_000 })
    const state = await storeState(page)
    expect(state.tabCount).toBe(1)
    expect(state.dirty[0]).toBe(true)
  })

  test('Discard closes without any save transport', async ({ page }) => {
    await dirtyTheTab(page)
    await setSaveAsMock(page, `({ id: 'never', pathname: '/tmp/never.md', filename: 'never.md', isSaved: true })`)
    await closeThroughStore(page)
    await expect(page.locator('.ag-unsaved-close-dialog')).toBeVisible({ timeout: 5_000 })
    await page.locator('.ag-unsaved-close-discard').click()
    await expect(page.locator('.ag-unsaved-close-dialog')).toBeHidden({ timeout: 5_000 })
    await expect.poll(() => storeState(page).then(s => s.tabCount), { timeout: 5_000 }).toBe(0)
    const calls = await page.evaluate(() => (window as any).__saveAsCalls)
    expect(calls.length).toBe(0)
  })

  test('Cancel keeps the tab open', async ({ page }) => {
    await dirtyTheTab(page)
    await closeThroughStore(page)
    await expect(page.locator('.ag-unsaved-close-dialog')).toBeVisible({ timeout: 5_000 })
    await page.locator('.ag-unsaved-close-cancel').click()
    await expect(page.locator('.ag-unsaved-close-dialog')).toBeHidden({ timeout: 5_000 })
    const state = await storeState(page)
    expect(state.tabCount).toBe(1)
    expect(state.dirty[0]).toBe(true)
  })

  test('Escape keeps the tab open', async ({ page }) => {
    await dirtyTheTab(page)
    await closeThroughStore(page)
    await expect(page.locator('.ag-unsaved-close-dialog')).toBeVisible({ timeout: 5_000 })
    await page.keyboard.press('Escape')
    await expect(page.locator('.ag-unsaved-close-dialog')).toBeHidden({ timeout: 5_000 })
    const state = await storeState(page)
    expect(state.tabCount).toBe(1)
    expect(state.dirty[0]).toBe(true)
  })

  test('the close glyph keeps the tab open', async ({ page }) => {
    await dirtyTheTab(page)
    await closeThroughStore(page)
    await expect(page.locator('.ag-unsaved-close-dialog')).toBeVisible({ timeout: 5_000 })
    await page.locator('.ag-unsaved-close-x').click()
    await expect(page.locator('.ag-unsaved-close-dialog')).toBeHidden({ timeout: 5_000 })
    const state = await storeState(page)
    expect(state.tabCount).toBe(1)
    expect(state.dirty[0]).toBe(true)
  })
})

test.describe('unsaved named-tab close regression (FIX-011 boundary)', () => {
  test.beforeEach(async ({ page }) => {
    await installTauriShim(page)
    await bootEditor(page)
    await openFileTab(page, '/tmp/mark-e2e/named.md', '# Named\n\ncontent\n')
    await expect(page.locator('.editor-with-tabs h1').first()).toBeVisible({ timeout: 5_000 })
    await page.evaluate(() => {
      const w = window as any
      w.__saveCloseCalls = []
      w.__mockInvoke.mt_save_and_close_tabs = (args: any) => {
        w.__saveCloseCalls.push(args)
        return null
      }
    })
  })

  test('Save & Close dispatches the save-and-close transport with the tab payload', async ({ page }) => {
    await dirtyTheTab(page)
    await closeThroughStore(page)
    await expect(page.locator('.ag-unsaved-close-dialog')).toBeVisible({ timeout: 5_000 })
    await page.locator('.ag-unsaved-close-save').click()
    await expect(page.locator('.ag-unsaved-close-dialog')).toBeHidden({ timeout: 5_000 })
    await expect.poll(() => page.evaluate(() => (window as any).__saveCloseCalls.length), { timeout: 5_000 }).toBe(1)
    const payload = await page.evaluate(() => (window as any).__saveCloseCalls[0])
    const tabs = payload?.args ?? payload
    expect(Array.isArray(tabs) ? tabs[0].pathname : tabs.pathname).toBe('/tmp/mark-e2e/named.md')
  })

  test('Discard closes the named tab directly; Cancel keeps it', async ({ page }) => {
    await dirtyTheTab(page)
    await closeThroughStore(page)
    await expect(page.locator('.ag-unsaved-close-dialog')).toBeVisible({ timeout: 5_000 })
    await page.locator('.ag-unsaved-close-cancel').click()
    let state = await storeState(page)
    // Opening the file replaced the empty untitled boot tab — the named
    // tab is the only one, and Cancel keeps it.
    expect(state.tabCount).toBe(1)
    expect(state.pathname).toBe('/tmp/mark-e2e/named.md')

    await closeThroughStore(page)
    await expect(page.locator('.ag-unsaved-close-dialog')).toBeVisible({ timeout: 5_000 })
    await page.locator('.ag-unsaved-close-discard').click()
    await expect(page.locator('.ag-unsaved-close-dialog')).toBeHidden({ timeout: 5_000 })
    await expect.poll(() => storeState(page).then(s => s.tabCount), { timeout: 5_000 }).toBe(0)
  })
})
