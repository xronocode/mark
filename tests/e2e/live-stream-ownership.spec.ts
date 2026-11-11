// FILE: tests/e2e/live-stream-ownership.spec.ts
// START_MODULE_CONTRACT
//   PURPOSE: Verify stream/tab isolation in the rendered editor and correlated save payloads.
//   SCOPE: Rich/source/split mode switching, background and closed stream tabs, stale epochs and local edits.
//   DEPENDS: Playwright, built Vue/Pinia/Muya renderer, Tauri fixture event and save transport.
//   LINKS: M-011; M-012; M-045; C-SEC-STREAM-TABS.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
// START_MODULE_MAP
//   snapshot - Read document ownership, text, history and fixture save state.
//   emit - Deliver an explicit fixture stream event through the production listener.
// END_MODULE_MAP
import { test, expect, type Page } from '@playwright/test'
import { installTauriShim } from './fixtures/tauri-shim'
import { bootEditor, openFileTab } from './fixtures/helpers'

async function snapshot(page: Page) {
  return page.evaluate(() => {
    const store = (document.querySelector('#app') as any).__vue_app__.config.globalProperties.$pinia._s.get('editor')
    const tab = store.currentFile
    return { id: tab.id, markdown: tab.markdown, history: JSON.stringify(tab.history),
      saved: tab.isSaved, pathname: tab.pathname, revision: tab.contentRevision,
      tabs: store.tabs.map((t: any) => ({ id: t.id, markdown: t.markdown, pathname: t.pathname })),
      writes: (window as any).__streamWrites }
  })
}
async function emit(page: Page, type: string, payload: Record<string, unknown>) {
  await page.evaluate(({ type, payload }) => {
    ;(window as any).__emitFakeEvent('mt::live::update', { update_type: type, payload })
  }, { type, payload })
}

for (const autoSave of [false, true]) for (const mode of ['rich', 'source', 'split']) {
  test(`${mode}, autosave=${autoSave}: background and closed streams preserve the selected document and its next save`, async ({ page }) => {
    await installTauriShim(page)
    await page.addInitScript(() => {
      const w = window as any
      w.__streamWrites = []
      w.__mockInvoke.mt_document_write_snapshot = ({ request }: any) => {
        w.__streamWrites.push(request)
        return { ...request, pathname: request.targetPath, filename: request.targetPath.split('/').pop() }
      }
    })
    await bootEditor(page)
    await openFileTab(page, '/docs/local.md', '# Local\n\nLocal text.\n')
    await page.evaluate(enabled => {
      const prefs = (document.querySelector('#app') as any).__vue_app__.config.globalProperties.$pinia._s.get('preferences')
      prefs.autoSave = enabled; prefs.autoSaveDelay = 100
    }, autoSave)
    if (mode !== 'rich') {
      await page.evaluate(mode => (window as any).__emitFakeEvent('mt::menu-invoked', mode === 'split' ? 'view.split-view' : 'view.source-code-mode'), mode)
    }
    if (mode === 'split') await expect(page.locator('.split-view.is-split')).toBeVisible()
    if (mode === 'source') await expect(page.locator('.CodeMirror')).toBeVisible()
    await emit(page, 'doc_open', { session_id: 'stream-a', session_epoch: 1, title: 'Dummy', content: '# Stream\n' })
    await expect.poll(async () => (await snapshot(page)).markdown).toContain('# Stream')
    const stream = await snapshot(page)
    if (mode === 'split') await page.evaluate(() => (window as any).__emitFakeEvent('mt::menu-invoked', 'view.split-view'))
    await page.locator('.editor-tabs li').filter({ hasText: 'local.md' }).click()
    const localView = mode === 'rich' ? page.locator('#ag-editor-id') : page.locator('.CodeMirror').last()
    await expect(localView).toContainText('Local text.')
    const before = await snapshot(page)
    await emit(page, 'doc_patch', { session_id: 'stream-a', session_epoch: 1, revision: 2, full_content: '# Latest stream\n' })
    await expect.poll(async () => (await snapshot(page)).tabs.find((t: any) => t.id === stream.id)?.markdown).toBe('# Latest stream\n')
    const after = await snapshot(page)
    expect({ ...after, tabs: [] }).toEqual({ ...before, tabs: [] })
    await expect(localView).toContainText('Local text.')
    await expect(localView).not.toContainText('stream')

    // Activating the stream must render the updated stored text, in the selected mode.
    await page.evaluate(id => {
      const store = (document.querySelector('#app') as any).__vue_app__.config.globalProperties.$pinia._s.get('editor')
      store.UPDATE_CURRENT_FILE(store.tabs.find((t: any) => t.id === id))
    }, stream.id)
    const streamView = mode === 'rich' ? page.locator('#ag-editor-id') : page.locator('.CodeMirror').last()
    await expect(streamView).toContainText('Latest stream')
    await emit(page, 'doc_open', { session_id: 'stream-a', session_epoch: 2, title: 'Dummy', content: '# Resynced\n' })
    await expect(streamView).toContainText('Resynced')
    expect((await snapshot(page)).id).toBe(stream.id)
    await emit(page, 'doc_patch', { session_id: 'stream-a', session_epoch: 1, revision: 99, full_content: '# STALE\n' })
    await expect(streamView).not.toContainText('STALE')
    await page.evaluate(() => {
      const store = (document.querySelector('#app') as any).__vue_app__.config.globalProperties.$pinia._s.get('editor')
      store.FORCE_CLOSE_TAB(store.currentFile)
    })
    await expect(localView).toContainText('Local text.')
    await emit(page, 'doc_patch', { session_id: 'stream-a', session_epoch: 2, revision: 2, full_content: '# CLOSED STREAM\n' })
    await expect(localView).not.toContainText('CLOSED STREAM')
    expect((await snapshot(page)).tabs).toHaveLength(1)

    const paragraph = mode === 'rich' ? page.locator('#ag-editor-id span.ag-paragraph').last() : page.locator('.CodeMirror-line').last()
    await paragraph.click()
    await page.keyboard.press('End')
    await page.keyboard.type(' APPENDED')
    await expect.poll(async () => (await snapshot(page)).markdown).toContain('APPENDED')
    await page.evaluate(() => (window as any).__emitFakeEvent('mt::menu-invoked', 'file.save'))
    await expect.poll(async () => (await snapshot(page)).writes.length).toBe(1)
    const final = await snapshot(page)
    expect(final.writes[0].targetPath).toBe('/docs/local.md')
    expect(final.writes[0].markdown).toContain('APPENDED')
    expect(final.writes[0].markdown).not.toMatch(/stream|STALE|CLOSED|Resynced/)
  })
}

test('a background patch cannot change a local save already in flight', async ({ page }) => {
  await installTauriShim(page)
  await bootEditor(page)
  await openFileTab(page, '/docs/local.md', '# Local\n\nLocal text.\n')
  await emit(page, 'doc_open', { session_id: 'stream-a', session_epoch: 1, title: 'Dummy', content: '# Stream\n' })
  await expect.poll(async () => (await snapshot(page)).markdown).toContain('# Stream')
  await page.locator('.editor-tabs li').filter({ hasText: 'local.md' }).click()
  await expect(page.locator('#ag-editor-id')).toContainText('Local text.')
  await page.locator('#ag-editor-id span.ag-paragraph').last().click()
  await page.keyboard.press('End')
  await page.keyboard.type(' LOCAL EDIT')
  await expect.poll(async () => (await snapshot(page)).markdown).toContain('LOCAL EDIT')
  await page.evaluate(() => {
    const w = window as any
    w.__streamWrites = []
    w.__mockInvoke.mt_document_write_snapshot = ({ request }: any) => {
      w.__streamWrites.push(request)
      return new Promise(resolve => { w.__releaseStreamSave = () => resolve({ ...request, pathname: request.targetPath, filename: 'local.md' }) })
    }
    w.__emitFakeEvent('mt::menu-invoked', 'file.save')
  })
  await expect.poll(async () => (await snapshot(page)).writes.length).toBe(1)
  const before = await snapshot(page)
  await emit(page, 'doc_patch', { session_id: 'stream-a', session_epoch: 1, revision: 2, full_content: '# FOREIGN STREAM\n' })
  const after = await snapshot(page)
  expect(after.markdown).toBe(before.markdown)
  expect(after.writes).toEqual(before.writes)
  await page.evaluate(() => (window as any).__releaseStreamSave())
  await expect.poll(async () => (await snapshot(page)).saved).toBe(true)
  expect((await snapshot(page)).markdown).not.toContain('FOREIGN STREAM')
})
