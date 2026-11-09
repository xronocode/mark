// FILE: tests/e2e/checkbox-dirty.spec.ts
// START_MODULE_CONTRACT
//   PURPOSE: Verify checkbox-only task edits reach saved-tab dirty/revision state, close protection and undo/redo, with one cascade commit and no readonly mutation.
//   SCOPE: Real built renderer, synthetic saved Markdown documents, Auto Save disabled, canonical command bus, nested autoCheck and explicitly locked rich/split surfaces.
//   DEPENDS: Playwright, Tauri shim and editor boot helpers.
//   LINKS: M-011, M-012
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
// START_MODULE_MAP
//   SIMPLE - saved single-task fixture.
//   NESTED - saved parent/child task fixture.
//   state - inspect the active tab's actual persisted renderer state.
//   execute - invoke the canonical renderer command registry.
//   openTasks - boot a synthetic saved file with Auto Save off and count actual renderer content-change deliveries.
// END_MODULE_MAP
import { test, expect, type Page } from '@playwright/test'
import { installTauriShim } from './fixtures/tauri-shim'
import { bootEditor, openFileTab } from './fixtures/helpers'

const SIMPLE = '# Tasks\n\n- [ ] checkbox-only edit\n'
const NESTED = '# Nested tasks\n\n- [ ] Parent\n    - [ ] Child one\n    - [ ] Child two\n'
const state = (page: Page) => page.evaluate(() => {
  const pinia = (document.querySelector('#app') as any).__vue_app__.config.globalProperties.$pinia
  const store = pinia._s.get('editor')
  const tab = store.currentFile
  return { id: tab?.id, markdown: tab?.markdown, saved: tab?.isSaved,
    revision: tab?.contentRevision || 0, tabs: store.tabs.length,
    autoSave: pinia._s.get('preferences').autoSave,
    contentChanges: (window as any).__checkboxContentChanges || 0 }
})
const execute = (page: Page, id: string) => page.evaluate(command => {
  ;(window as any).__bus.emit('cmd::execute', command)
}, id)
async function openTasks(page: Page, markdown = SIMPLE, autoCheck = false) {
  await installTauriShim(page)
  await bootEditor(page)
  await page.evaluate(cascade => {
    const pinia = (document.querySelector('#app') as any).__vue_app__.config.globalProperties.$pinia
    pinia._s.get('preferences').autoSave = false
    pinia._s.get('preferences').autoCheck = cascade
  }, autoCheck)
  await openFileTab(page, '/tmp/mark-e2e/checkbox-dirty.md', markdown)
  await expect(page.locator('#ag-editor-id input[type="checkbox"]').first()).toBeVisible()
  await page.evaluate(() => {
    const pinia = (document.querySelector('#app') as any).__vue_app__.config.globalProperties.$pinia
    ;(window as any).__checkboxContentChanges = 0
    pinia._s.get('editor').$onAction(({ name }) => {
      if (name === 'LISTEN_FOR_CONTENT_CHANGE') (window as any).__checkboxContentChanges++
    })
  })
  expect((await state(page)).saved).toBe(true)
  expect((await state(page)).autoSave).toBe(false)
}

test('checkbox-only saved edit is one dirty revision, survives close cancellation and supports undo/redo', async ({ page }) => {
  await openTasks(page)
  const before = await state(page)
  await page.locator('#ag-editor-id input[type="checkbox"]').click()
  await page.waitForTimeout(250)
  const after = await state(page)
  await test.info().attach('checkbox-state', { body: JSON.stringify({ before, after }, null, 2), contentType: 'application/json' })
  expect(after.markdown).toContain('- [x] checkbox-only edit')
  expect(after.saved).toBe(false)
  expect(after.revision - before.revision, JSON.stringify({ before, after })).toBe(1)
  expect(after.contentChanges).toBe(1)
  await execute(page, 'file.close-tab')
  await expect(page.locator('.ag-unsaved-close-dialog')).toBeVisible()
  await page.locator('.ag-unsaved-close-cancel').click()
  expect((await state(page)).id).toBe(before.id)
  expect((await state(page)).markdown).toBe(after.markdown)
  await execute(page, 'edit.undo')
  await expect.poll(async () => (await state(page)).markdown).toContain('- [ ] checkbox-only edit')
  expect((await state(page)).saved).toBe(true)
  await execute(page, 'edit.redo')
  await expect.poll(async () => (await state(page)).markdown).toContain('- [x] checkbox-only edit')
  expect((await state(page)).saved).toBe(false)
})

test('nested autoCheck cascade is one semantic edit and one undo/redo', async ({ page }) => {
  await openTasks(page, NESTED, true)
  const boxes = page.locator('#ag-editor-id input[type="checkbox"]')
  await expect(boxes).toHaveCount(3)
  const before = await state(page)
  await boxes.first().click()
  await page.waitForTimeout(250)
  const after = await state(page)
  await test.info().attach('checkbox-state', { body: JSON.stringify({ before, after }, null, 2), contentType: 'application/json' })
  expect(after.markdown.match(/\[x\]/g)).toHaveLength(3)
  expect(after.saved).toBe(false)
  expect(after.revision - before.revision, JSON.stringify({ before, after })).toBe(1)
  expect(after.contentChanges).toBe(1)
  await execute(page, 'edit.undo')
  await expect.poll(async () => (await state(page)).markdown.match(/\[ \]/g)?.length).toBe(3)
  expect((await state(page)).saved).toBe(true)
  await execute(page, 'edit.redo')
  await expect.poll(async () => (await state(page)).markdown.match(/\[x\]/g)?.length).toBe(3)
  expect((await state(page)).saved).toBe(false)
})

test('locked rich and locked split checkbox clicks cannot mutate the document', async ({ page }) => {
  await openTasks(page)
  await execute(page, 'view.lock-document')
  await expect(page.locator('.editor-component').first()).toHaveAttribute('contenteditable', 'false')
  const locked = await state(page)
  await page.locator('#ag-editor-id input[type="checkbox"]').click()
  await page.waitForTimeout(250)
  const afterLock = await state(page)
  expect(afterLock.markdown).toBe(locked.markdown)
  expect(afterLock.saved).toBe(locked.saved)
  expect(afterLock.revision).toBe(locked.revision)
  await expect(page.locator('#ag-editor-id input[type="checkbox"]')).not.toBeChecked()
  await execute(page, 'view.lock-document')
  await execute(page, 'view.split-view')
  await execute(page, 'view.source-code-mode')
  await execute(page, 'view.lock-document')
  await expect(page.locator('.editor-component').first()).toHaveAttribute('contenteditable', 'false')
  await expect.poll(() => page.evaluate(() => {
    const wrapper = document.querySelector('.source-code .CodeMirror') as any
    return wrapper?.CodeMirror?.getOption('readOnly')
  })).toBe(true)
  const mirror = page.locator('#ag-editor-id input[type="checkbox"]')
  await expect(mirror).toBeVisible()
  await page.waitForTimeout(300)
  const mirrored = await state(page)
  await mirror.click()
  await page.waitForTimeout(250)
  const afterMirror = await state(page)
  expect(afterMirror.markdown).toBe(mirrored.markdown)
  expect(afterMirror.saved).toBe(mirrored.saved)
  expect(afterMirror.revision).toBe(mirrored.revision)
  await expect(mirror).not.toBeChecked()
})
