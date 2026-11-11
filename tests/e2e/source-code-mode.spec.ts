import { test, expect } from '@playwright/test'
import { installTauriShim } from './fixtures/tauri-shim'
import { bootEditor, openFileTab } from './fixtures/helpers'

test.describe('source code mode', () => {
  test.beforeEach(async ({ page }) => {
    await installTauriShim(page)
  })

  test('booting with sourceCodeModeEnabled shows CodeMirror', async ({ page }) => {
    await bootEditor(page, { sourceCodeModeEnabled: true })

    await expect(page.locator('.source-code')).toBeVisible({ timeout: 5_000 })
  })

  test('toggling sourceCode via bus event shows/hides CodeMirror', async ({ page }) => {
    await bootEditor(page)

    await openFileTab(page, '/tmp/src-toggle.md', '# Toggle test\n\nSome content.\n')

    await expect(page.locator('.source-code')).not.toBeVisible()

    await page.evaluate(() => {
      ;(window as any).__bus.emit('view:toggle-view-entry', 'sourceCode')
    })

    await expect(page.locator('.source-code')).toBeVisible({ timeout: 5_000 })
  })

  test('source-mode round trip preserves document content in both directions', async ({ page }) => {
    await bootEditor(page)

    await openFileTab(page, '/tmp/src-roundtrip.md', '# Round Trip\n\nBody kept across the toggle.\n')

    await expect(page.locator('.editor-with-tabs h1').first())
      .toContainText('Round Trip', { timeout: 5_000 })

    // Into source mode: CodeMirror carries the same markdown text.
    await page.evaluate(() => {
      ;(window as any).__bus.emit('view:toggle-view-entry', 'sourceCode')
    })
    await expect(page.locator('.source-code')).toBeVisible({ timeout: 5_000 })
    await expect(page.locator('.source-code .CodeMirror-line').first())
      .toContainText('# Round Trip', { timeout: 5_000 })

    // And back: the WYSIWYG surface renders the same heading again.
    await page.evaluate(() => {
      ;(window as any).__bus.emit('view:toggle-view-entry', 'sourceCode')
    })
    await expect(page.locator('.source-code')).not.toBeVisible({ timeout: 5_000 })
    await expect(page.locator('.editor-with-tabs h1').first())
      .toContainText('Round Trip', { timeout: 5_000 })
    await expect(page.locator('.editor-with-tabs p').first())
      .toContainText('Body kept across the toggle.')
  })
})

// C-SOURCE-HISTORY-OWNERSHIP: real CodeMirror keyboard history, not tab.history.
test('ordinary Source owns fresh-file undo, per-file redo/selection, remount and reopened lifetimes', async ({ page }) => {
  const lifecycleErrors: string[] = []
  page.on('pageerror', error => lifecycleErrors.push(error.message))
  page.on('console', message => { if (/This document is already in use|IndexSizeError/.test(message.text())) lifecycleErrors.push(message.text()) })
  await installTauriShim(page)
  await page.addInitScript(() => {
    const w = window as any
    w.__sourceOwnedWrites = []
    w.__mockInvoke.mt_document_write_snapshot = ({ request }: any) => {
      w.__sourceOwnedWrites.push(request)
      return { ...request, pathname: request.targetPath, filename: request.targetPath.split('/').pop() }
    }
  })
  await bootEditor(page, { sourceCodeModeEnabled: true })
  const initialA = '# A owned\n\nONLY A\n'
  const initialB = '# B owned\n\nONLY B\n'
  const state = () => page.evaluate(() => {
    const cm = (document.querySelector('.CodeMirror') as any).CodeMirror
    const tab = (document.querySelector('#app') as any).__vue_app__.config.globalProperties.$pinia._s.get('editor').currentFile
    return { value: cm.getValue(), markdown: tab.markdown, pathname: tab.pathname, saved: tab.isSaved,
      token: tab.documentToken, selection: { anchor: cm.getCursor('anchor'), head: cm.getCursor('head') } }
  })
  const typeEdit = async (text: string, line: string) => {
    await page.locator('.CodeMirror-line', { hasText: line }).click()
    await page.keyboard.press('End')
    await page.evaluate(() => (document.querySelector('.CodeMirror') as any).CodeMirror.changeGeneration(true))
    await page.keyboard.type(text)
  }
  await openFileTab(page, '/docs/a-owned.md', initialA)
  await typeEdit(' ONE', 'ONLY A'); await typeEdit(' TWO', 'ONLY A')
  await page.keyboard.press('Meta+z')
  const aOne = initialA.replace('ONLY A', 'ONLY A ONE')
  await expect.poll(async () => (await state()).value).toBe(aOne)
  await page.evaluate(() => (document.querySelector('.CodeMirror') as any).CodeMirror.setSelection({ line: 2, ch: 8 }, { line: 2, ch: 2 }))
  await openFileTab(page, '/docs/b-owned.md', initialB)
  await page.locator('.CodeMirror').click()
  await page.keyboard.press('Meta+z'); await page.keyboard.press('Meta+Shift+z')
  expect(await state()).toMatchObject({ value: initialB, markdown: initialB, pathname: '/docs/b-owned.md', saved: true })
  await typeEdit(' B EDIT', 'ONLY B')
  const bEdit = initialB.replace('ONLY B', 'ONLY B B EDIT')
  await page.evaluate(() => (window as any).__emitFakeEvent('mt::menu-invoked', 'file.save'))
  await expect.poll(async () => (await state()).saved).toBe(true)
  const bToken = (await state()).token
  expect(await page.evaluate(() => (window as any).__sourceOwnedWrites.at(-1))).toMatchObject({ documentToken: bToken, targetPath: '/docs/b-owned.md', markdown: bEdit })
  await page.locator('.editor-tabs li').filter({ hasText: 'a-owned.md' }).click()
  expect(await state()).toMatchObject({ value: aOne, markdown: aOne, pathname: '/docs/a-owned.md', saved: false,
    selection: { anchor: { line: 2, ch: 8 }, head: { line: 2, ch: 2 } } })
  // Remount Source without editing in the intervening rich view.
  await page.evaluate(() => (window as any).__emitFakeEvent('mt::menu-invoked', 'view.source-code-mode'))
  await expect(page.locator('.CodeMirror')).not.toBeVisible()
  await page.evaluate(() => (window as any).__emitFakeEvent('mt::menu-invoked', 'view.source-code-mode'))
  await expect(page.locator('.CodeMirror')).toBeVisible()
  expect(await state()).toMatchObject({ value: aOne, selection: { anchor: { line: 2, ch: 8 }, head: { line: 2, ch: 2 } } })
  await page.locator('.CodeMirror textarea').focus()
  await page.keyboard.press('Meta+Shift+z')
  await expect.poll(async () => (await state()).value).toBe(initialA.replace('ONLY A', 'ONLY A ONE TWO'))
  await page.keyboard.press('Meta+z')
  await expect.poll(async () => (await state()).value).toBe(aOne)
  await page.locator('.editor-tabs li').filter({ hasText: 'b-owned.md' }).click()
  await page.evaluate(() => {
    const store = (document.querySelector('#app') as any).__vue_app__.config.globalProperties.$pinia._s.get('editor')
    store.FORCE_CLOSE_TAB(store.currentFile)
  })
  await openFileTab(page, '/docs/b-owned.md', bEdit)
  expect((await state()).token).not.toBe(bToken)
  await page.locator('.CodeMirror textarea').focus()
  await page.keyboard.press('Meta+z')
  expect(await state()).toMatchObject({ value: bEdit, markdown: bEdit, saved: true })
  // Adopt the fresh document into Muya-owned unified Split history.
  await page.evaluate(() => (window as any).__emitFakeEvent('mt::menu-invoked', 'view.split-view'))
  await expect(page.locator('.split-view.is-split')).toBeVisible()
  expect(await state()).toMatchObject({ value: bEdit, markdown: bEdit, saved: true })
  expect(await page.evaluate(() => (document.querySelector('.CodeMirror') as any).CodeMirror.historySize())).toEqual({ undo: 0, redo: 0 })
  expect(lifecycleErrors).toEqual([])
})
