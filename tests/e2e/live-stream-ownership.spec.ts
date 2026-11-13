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

// This suite has no retry: keep the first failure's input and DOM timeline.
test.use({ trace: 'retain-on-failure', screenshot: 'only-on-failure' })

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
    if (autoSave) {
      await expect.poll(async () => (await snapshot(page)).writes.at(-1)?.markdown).toContain('APPENDED')
      await expect.poll(async () => (await snapshot(page)).saved).toBe(true)
    }
    const beforeManualSave = await snapshot(page)
    if (!autoSave) expect(beforeManualSave.writes).toHaveLength(0)
    await page.evaluate(() => (window as any).__emitFakeEvent('mt::menu-invoked', 'file.save'))
    await expect.poll(async () => (await snapshot(page)).writes.length).toBe(beforeManualSave.writes.length + 1)
    const final = await snapshot(page)
    expect(final.writes.at(-1).markdown).toBe(beforeManualSave.markdown)
    for (const write of final.writes) {
      expect(write).toMatchObject({ id: final.id, sourcePath: '/docs/local.md', targetPath: '/docs/local.md' })
      expect(write.markdown).not.toMatch(/stream|STALE|CLOSED|Resynced/)
    }
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

// C-SPLIT-SAVE-AUTHORITY: retained Source preference and new rich content.
for (const autoSave of [false, true]) test(`Source-to-Split rich save and local history survive background/closed streams, autosave=${autoSave}`, async ({ page }) => {
  await installTauriShim(page)
  await page.addInitScript(() => {
    const w = window as any
    w.__streamWrites = []
    w.__mockInvoke.mt_document_write_snapshot = ({ request }: any) => {
      w.__streamWrites.push(request)
      return { ...request, pathname: request.targetPath, filename: 'split-local.md' }
    }
  })
  await bootEditor(page)
  const initial = '# Split local\n\nLOCAL ONLY\n'
  await openFileTab(page, '/docs/split-local.md', initial)
  await page.evaluate(() => (window as any).__emitFakeEvent('mt::menu-invoked', 'view.source-code-mode'))
  await page.evaluate(() => (window as any).__emitFakeEvent('mt::menu-invoked', 'view.split-view'))
  await expect(page.locator('.split-view.is-split')).toBeVisible()
  await emit(page, 'doc_open', { session_id: 'split-stream', session_epoch: 1, title: 'Dummy', content: '# FOREIGN STREAM\n' })
  await expect.poll(async () => (await snapshot(page)).markdown).toBe('# FOREIGN STREAM\n')
  const streamId = (await snapshot(page)).id
  await page.locator('.editor-tabs li').filter({ hasText: 'split-local.md' }).click()
  if (!await page.locator('.split-view.is-split').isVisible()) {
    await page.evaluate(() => (window as any).__emitFakeEvent('mt::menu-invoked', 'view.split-view'))
  }
  await expect(page.locator('.split-view.is-split')).toBeVisible()
  await page.evaluate(enabled => (document.querySelector('#app') as any).__vue_app__.config.globalProperties.$pinia._s.get('preferences').autoSave = enabled, autoSave)
  let expected = initial
  for (const [index, phase] of ['BACKGROUND', 'CLOSED'].entries()) {
    if (phase === 'BACKGROUND') {
      await emit(page, 'doc_patch', { session_id: 'split-stream', session_epoch: 1, revision: 2, full_content: '# FOREIGN BACKGROUND\n' })
      await expect.poll(async () => (await snapshot(page)).tabs.find((tab: any) => tab.id === streamId)?.markdown).toBe('# FOREIGN BACKGROUND\n')
    } else {
      await page.evaluate(id => {
        const store = (document.querySelector('#app') as any).__vue_app__.config.globalProperties.$pinia._s.get('editor')
        store.FORCE_CLOSE_TAB(store.tabs.find((tab: any) => tab.id === id))
      }, streamId)
      await emit(page, 'doc_patch', { session_id: 'split-stream', session_epoch: 1, revision: 3, full_content: '# FOREIGN CLOSED\n' })
    }
    const paragraph = page.locator('.split-pane-rich span.ag-paragraph', { hasText: 'LOCAL ONLY' })
    await expect(paragraph).toBeVisible()
    // The block center is trailing whitespace; place the caret on its text.
    await paragraph.click({ position: { x: 5, y: 5 } })
    // Select the real editable surface after activation/follow reconciliation.
    await page.locator('.split-pane-rich .editor-component').focus()
    await expect(page.locator('.split-pane-rich .editor-component')).toBeFocused()
    await page.keyboard.press('Meta+ArrowRight'); await page.keyboard.type(' ' + phase)
    const prior = expected
    expected = expected.replace(/\n$/, ' ' + phase + '\n')
    await expect.poll(async () => (await snapshot(page)).markdown).toBe(expected)
    await page.keyboard.press('Meta+z')
    await expect.poll(async () => (await snapshot(page)).markdown).toBe(prior)
    await page.keyboard.press('Meta+Shift+z')
    await expect.poll(async () => (await snapshot(page)).markdown).toBe(expected)
    if (!autoSave) {
      expect((await snapshot(page)).writes).toHaveLength(index)
      await page.evaluate(() => (window as any).__emitFakeEvent('mt::menu-invoked', 'file.save'))
    }
    await expect.poll(async () => (await snapshot(page)).writes.length, { timeout: 10_000 }).toBe(index + 1)
    const state = await snapshot(page)
    expect(state.writes.at(-1)).toMatchObject({ id: state.id, sourcePath: '/docs/split-local.md', targetPath: '/docs/split-local.md', markdown: expected })
    expect(state.pathname).toBe('/docs/split-local.md')
    expect(state.markdown).not.toContain('FOREIGN')
    await expect.poll(async () => (await snapshot(page)).saved).toBe(true)
    expect(await page.evaluate(() => (document.querySelector('#app') as any).__vue_app__.config.globalProperties.$pinia._s.get('preferences').sourceCode)).toBe(true)
  }
})

// C-SOURCE-HISTORY-OWNERSHIP: a never-unified Source editor executes actual undo.
for (const autoSave of [false, true]) test(`ordinary Source undo excludes background and closed-stream payloads, autosave=${autoSave}`, async ({ page }) => {
  await installTauriShim(page)
  await page.addInitScript(() => {
    const w = window as any
    w.__streamWrites = []
    w.__mockInvoke.mt_document_write_snapshot = ({ request }: any) => {
      w.__streamWrites.push(request)
      return { ...request, pathname: request.targetPath, filename: 'ordinary-source.md' }
    }
  })
  await bootEditor(page, { sourceCodeModeEnabled: true })
  const initial = '# Ordinary local\n\nOWN LOCAL\n'
  await openFileTab(page, '/docs/ordinary-source.md', initial)
  await page.evaluate(enabled => (document.querySelector('#app') as any).__vue_app__.config.globalProperties.$pinia._s.get('preferences').autoSave = enabled, autoSave)
  await emit(page, 'doc_open', { session_id: 'ordinary-stream', session_epoch: 1, title: 'Dummy', content: '# FOREIGN ORIGINAL\n' })
  await expect.poll(async () => (await snapshot(page)).markdown).toBe('# FOREIGN ORIGINAL\n')
  const streamId = (await snapshot(page)).id
  await page.locator('.editor-tabs li').filter({ hasText: 'ordinary-source.md' }).click()
  const value = () => page.evaluate(() => (document.querySelector('.CodeMirror') as any).CodeMirror.getValue())
  await page.locator('.CodeMirror textarea').focus()
  await page.keyboard.press('Meta+z'); await page.keyboard.press('Meta+Shift+z')
  expect(await value()).toBe(initial)
  let expected = initial
  for (const [index, phase] of ['AFTERBG', 'AFTERCLOSE'].entries()) {
    if (!index) {
      await emit(page, 'doc_patch', { session_id: 'ordinary-stream', session_epoch: 1, revision: 2, full_content: '# FOREIGN BACKGROUND\n' })
      await expect.poll(async () => (await snapshot(page)).tabs.find((tab: any) => tab.id === streamId)?.markdown).toBe('# FOREIGN BACKGROUND\n')
    } else {
      await page.locator('.editor-tabs li').filter({ hasText: 'Untitled' }).click()
      await expect.poll(value).toBe('# FOREIGN BACKGROUND\n')
      await page.evaluate(() => {
        const store = (document.querySelector('#app') as any).__vue_app__.config.globalProperties.$pinia._s.get('editor')
        store.FORCE_CLOSE_TAB(store.currentFile)
      })
      await emit(page, 'doc_patch', { session_id: 'ordinary-stream', session_epoch: 1, revision: 3, full_content: '# FOREIGN CLOSED\n' })
      await expect.poll(value).toBe(expected)
      await page.locator('.CodeMirror textarea').focus()
      await page.keyboard.press('Meta+z')
      await expect.poll(value).toBe(initial)
      await page.keyboard.press('Meta+Shift+z')
      await expect.poll(value).toBe(expected)
    }
    await page.locator('.CodeMirror-line', { hasText: 'OWN LOCAL' }).click()
    await page.keyboard.press('End')
    await page.evaluate(() => (document.querySelector('.CodeMirror') as any).CodeMirror.changeGeneration(true))
    await page.keyboard.type(' ' + phase)
    const prior = expected
    expected = expected.replace(/\n$/, ' ' + phase + '\n')
    await expect.poll(value).toBe(expected)
    await page.keyboard.press('Meta+z'); await expect.poll(value).toBe(prior)
    await page.keyboard.press('Meta+Shift+z'); await expect.poll(value).toBe(expected)
    if (!autoSave) {
      expect((await snapshot(page)).writes).toHaveLength(index)
      await page.evaluate(() => (window as any).__emitFakeEvent('mt::menu-invoked', 'file.save'))
    }
    await expect.poll(async () => (await snapshot(page)).writes.length, { timeout: 10_000 }).toBe(index + 1)
    const local = await snapshot(page)
    expect(local.pathname).toBe('/docs/ordinary-source.md')
    expect(local.markdown).toBe(expected)
    expect(local.writes.at(-1)).toMatchObject({ id: local.id, sourcePath: local.pathname, targetPath: local.pathname, markdown: expected })
    expect(local.markdown).not.toContain('FOREIGN')
    await expect.poll(async () => (await snapshot(page)).saved).toBe(true)
  }
})
