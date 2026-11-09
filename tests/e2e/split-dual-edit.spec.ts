/**
 * split-dual-edit.spec.ts — C-SPLIT-DUAL-EDIT: both Split View panes are
 * editable against the single store document, and ONE document history
 * (muya's) owns undo regardless of which pane made the edit.
 *
 * Corners covered: 1 (interleaved unified undo chain), 2 (undo from the
 * pane that did not edit), 7 (`* item` normalization guard + one dirty
 * move per edit), 8 (locked tab read-only on both panes).
 */

import { test, expect, type Page } from '@playwright/test'
import { installTauriShim } from './fixtures/tauri-shim'
import { bootEditor, openFileTab } from './fixtures/helpers'

const DOC = '# Dual\n\nFirst paragraph.\n\n* star bullet\n* second\n'

async function invokeMenu (page: Page, id: string): Promise<void> {
  await page.evaluate((cmd) => (window as any).__emitFakeEvent('mt::menu-invoked', cmd), id)
}

async function editorState (page: Page): Promise<any> {
  return page.evaluate(() => {
    const el = document.querySelector('#app') as any
    const state = el?.__vue_app__?.config?.globalProperties?.$pinia?.state?.value
    const tab = state?.editor?.currentFile
    return { markdown: tab?.markdown ?? '', revision: tab?.contentRevision, isSaved: tab?.isSaved, session: tab?.splitSession, history: tab?.history }
  })
}

test.describe('Split View dual editing (C-SPLIT-DUAL-EDIT)', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await installTauriShim(page)
  })

  test('corner-1/2: interleaved edits undo in document order from either pane', async ({ page }) => {
    await bootEditor(page)
    await openFileTab(page, '/tmp/csplit/de-a.md', DOC)
    await invokeMenu(page, 'view.split-view')
    await expect(page.locator('.split-view.is-split')).toBeVisible()

    // Edit A: rich pane — alpha.
    await page.locator('.split-pane-rich p', { hasText: 'First paragraph.' }).click()
    await page.keyboard.press('End')
    await page.keyboard.type(' alpha')
    await expect(page.locator('.split-pane-source .CodeMirror')).toContainText('alpha', { timeout: 1_000 })

    // Edit B: source pane — beta.
    await page.locator('.split-pane-source .CodeMirror-line', { hasText: 'Dual' }).click()
    await page.keyboard.press('End')
    await page.keyboard.type(' beta')
    await expect(page.locator('.split-pane-rich h1', { hasText: 'beta' })).toBeVisible({ timeout: 1_000 })

    // Edit C: rich pane — gamma.
    await page.locator('.split-pane-rich p', { hasText: 'alpha' }).click()
    await page.keyboard.press('End')
    await page.keyboard.type(' gamma')

    let md = await editorState(page)
    expect(md.markdown).toContain('alpha')
    expect(md.markdown).toContain('beta')
    expect(md.markdown).toContain('gamma')

    // Exactly ONE undo per user edit. Caret movement is not a history step.
    for (const [i, gone] of ['gamma', 'beta', 'alpha'].entries()) {
      await page.locator('.split-pane-source .CodeMirror-line').first().click()
      await page.keyboard.press('Meta+z')
      await expect.poll(async () => (await editorState(page)).markdown).not.toContain(gone)
      const remaining = ['gamma', 'beta', 'alpha'].slice(i + 1)
      const current = (await editorState(page)).markdown
      for (const later of remaining) expect(current).toContain(later)
    }
    md = await editorState(page)
    expect(md.markdown).toContain('First paragraph.')
    expect(md.markdown).toContain('* star bullet')
  })

  test('corner-7/8: normalization never rewrites source edits; a locked tab is read-only on both panes', async ({ page }) => {
    await bootEditor(page)
    await openFileTab(page, '/tmp/csplit/de-b.md', DOC)
    await invokeMenu(page, 'view.split-view')
    await expect(page.locator('.split-view.is-split')).toBeVisible()

    await page.locator('.split-pane-source .CodeMirror-line', { hasText: 'First paragraph.' }).click()
    await page.keyboard.press('End')
    await page.keyboard.type(' from-src')
    await expect(page.locator('.split-pane-rich p', { hasText: 'from-src' })).toBeVisible({ timeout: 2_000 })
    await page.waitForTimeout(400)
    const md = await editorState(page)
    expect(md.markdown).toContain('* star bullet')
    expect(md.markdown).toContain('from-src')

    // Lock the tab (View › Lock Document state): both panes read-only.
    await page.evaluate(() => {
      const el = document.querySelector('#app') as any
      const pinia = el?.__vue_app__?.config?.globalProperties?.$pinia
      const tab = pinia?.state?.value?.editor?.currentFile
      if (tab) tab.locked = true
    })
    await page.waitForTimeout(300)
    const cmRo = await page.evaluate(() => {
      const cm = document.querySelector('.split-pane-source .CodeMirror') as any
      return cm?.CodeMirror?.getOption('readOnly')
    })
    expect(cmRo).toBe(true)
    const richEditable = await page.evaluate(() => {
      const surface = document.querySelector('.split-pane-rich .editor-component')
      return surface?.getAttribute('contenteditable')
    })
    // The lock covers the muya pane as well (document state, not surface).
    expect(richEditable === 'false' || richEditable === null).toBe(true)
    await page.screenshot({ path: 'test-results/csplit-dual-edit.png' })
  })
})

// Actual CodeMirror operations run inside the browser, against the mounted
// component and normal change listeners. They never mutate the store/history.
async function sourceSelection(page: Page, anchor: { line: number; ch: number }, head = anchor) {
  await page.evaluate(({ anchor, head }) => {
    const cm = (document.querySelector('.CodeMirror') as any).CodeMirror
    cm.focus(); cm.setSelection(anchor, head)
  }, { anchor, head })
}
async function sourceValue(page: Page): Promise<string> {
  return page.evaluate(() => (document.querySelector('.CodeMirror') as any).CodeMirror.getValue())
}

test.describe('Split recovery acceptance', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await installTauriShim(page)
    await bootEditor(page)
    await openFileTab(page, '/tmp/csplit/recovery-a.md', DOC)
    await invokeMenu(page, 'view.split-view')
    await expect(page.locator('.split-view.is-split')).toBeVisible()
  })

  test('one source edit moves dirty revision once; caret navigation and render echoes do not; redo is shared', async ({ page }) => {
    const navigationBaseline = (await editorState(page)).revision
    await page.locator('.split-pane-rich p', { hasText: 'First paragraph.' }).click()
    await page.keyboard.press('ArrowLeft')
    await page.waitForTimeout(200)
    expect((await editorState(page)).revision).toBe(navigationBaseline)
    await sourceSelection(page, { line: 2, ch: 16 })
    const before = await editorState(page)
    await page.keyboard.type('X')
    await expect(page.locator('.split-pane-rich p', { hasText: 'paragraph.X' })).toBeVisible()
    await page.waitForTimeout(300)
    const edited = await editorState(page)
    expect(edited.revision).toBe(before.revision + 1)
    expect(edited.isSaved).toBe(false)
    expect(edited.markdown).toContain('* star bullet')
    await page.keyboard.press('ArrowLeft')
    await page.waitForTimeout(200)
    expect((await editorState(page)).revision).toBe(edited.revision)
    await page.keyboard.press('Meta+z')
    await expect.poll(() => sourceValue(page)).not.toContain('paragraph.X')
    await page.keyboard.press('Meta+Shift+z')
    await expect.poll(() => sourceValue(page)).toContain('paragraph.X')
    const representation = await page.evaluate(() => {
      const cm = (document.querySelector('.CodeMirror') as any).CodeMirror
      return { size: cm.historySize(), depth: cm.getOption('undoDepth') }
    })
    expect(representation).toEqual({ size: { undo: 0, redo: 0 }, depth: 0 })
    for (const entry of (await editorState(page)).history.stack.filter((entry: any) => typeof entry.markdown === 'string')) {
      expect(entry.blocks).toBeUndefined()
      expect(JSON.stringify(entry.meta).length).toBeLessThan(500)
    }
  })

  test('focused source menu commands format, copy, search/replace, insert table and format document', async ({ page }) => {
    await page.evaluate(() => {
      const handlers = ((window as any).__mockInvoke ||= {})
      handlers['plugin:clipboard-manager|write_text'] = (args: any) => { (window as any).__copied = args.text; return null }
    })
    await sourceSelection(page, { line: 2, ch: 0 }, { line: 2, ch: 5 })
    await invokeMenu(page, 'format.strong')
    await expect.poll(() => sourceValue(page)).toContain('**First** paragraph.')
    await invokeMenu(page, 'edit.copy-as-markdown')
    await expect.poll(() => page.evaluate(() => (window as any).__copied)).toBe('First')
    await invokeMenu(page, 'paragraph.heading-2')
    await expect.poll(() => sourceValue(page)).toContain('## **First** paragraph.')
    await invokeMenu(page, 'edit.find')
    const search = page.locator('.ag-search-input input, .search-input input, .search input').first()
    // The shipped search UI remains the entry point; source focus is
    // remembered while its search field owns keyboard focus.
    await expect(search).toBeVisible()
    await search.fill('paragraph')
    await expect.poll(async () => page.evaluate(() => {
      const pinia = (document.querySelector('#app') as any).__vue_app__.config.globalProperties.$pinia
      return pinia.state.value.editor.searchMatches?.matches?.length ?? pinia.state.value.editor.currentFile.searchMatches?.matches?.length
    })).toBe(1)
    await invokeMenu(page, 'edit.replace')
    await page.locator('.replace-input input').fill('sentence')
    await page.locator('.replace .button.right').click()
    await expect.poll(() => sourceValue(page)).toContain('sentence.')
    await page.keyboard.press('Escape')
    await sourceSelection(page, { line: 4, ch: 0 })
    await invokeMenu(page, 'paragraph.table')
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.getByRole('dialog').getByRole('button', { name: 'OK', exact: true }).click()
    await expect.poll(() => sourceValue(page)).toContain('| --- | --- | --- |')
    await invokeMenu(page, 'edit.format-document')
    await expect(page.locator('.split-pane-rich table')).toBeVisible()
  })

  test('caret translates, both IME fences defer only their own surface and listeners clean up across mode changes', async ({ page }) => {
    await sourceSelection(page, { line: 4, ch: 5 }, { line: 4, ch: 2 })
    await page.locator('.split-pane-rich h1').click()
    await page.keyboard.press('Home')
    await page.keyboard.press('Enter')
    await expect.poll(async () => (await editorState(page)).session.source.anchor.line).toBeGreaterThan(4)
    const translated = (await editorState(page)).session.source
    expect(translated.anchor.ch).toBe(5)
    expect(translated.head.ch).toBe(2)
    // Fence source: the other pane still updates the store immediately.
    await page.evaluate(() => (document.querySelector('.CodeMirror') as any).CodeMirror.getInputField().dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, data: '文' })))
    const frozen = await sourceValue(page)
    await page.locator('.split-pane-rich p', { hasText: 'First paragraph.' }).click()
    await page.keyboard.press('End'); await page.keyboard.type(' rich-ime')
    await expect.poll(async () => (await editorState(page)).markdown).toContain('rich-ime')
    await page.waitForTimeout(250)
    expect(await sourceValue(page)).toBe(frozen)
    await page.evaluate(() => (document.querySelector('.CodeMirror') as any).CodeMirror.getInputField().dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '文' })))
    await expect.poll(() => sourceValue(page)).toContain('rich-ime')
    // Fence rich while source changes: source continues to commit.
    await page.locator('.split-pane-rich .editor-component').dispatchEvent('compositionstart', { data: '文' })
    await sourceSelection(page, { line: 0, ch: 0 })
    await page.keyboard.type('source-ime')
    await page.waitForTimeout(250)
    await expect(page.locator('.split-pane-rich')).not.toContainText('source-ime')
    await page.locator('.split-pane-rich .editor-component').dispatchEvent('compositionend', { data: '文' })
    await expect(page.locator('.split-pane-rich')).toContainText('source-ime')
    await invokeMenu(page, 'view.source-code-mode')
    await expect(page.locator('.split-pane-rich .editor-component')).toBeVisible()
    await expect(page.locator('.split-pane-rich .editor-component')).toHaveAttribute('contenteditable', 'true')
    await page.locator('.split-pane-rich p', { hasText: 'First paragraph.' }).click()
    await invokeMenu(page, 'edit.select-all')
    await expect.poll(() => page.evaluate(() => String(window.getSelection()))).toContain('star bullet')
  })

  test('per-tab history/carets survive tab, split and mode changes; external reload clears the old timeline', async ({ page }) => {
    await sourceSelection(page, { line: 2, ch: 16 })
    await page.keyboard.type(' tab-a')
    await sourceSelection(page, { line: 4, ch: 5 }, { line: 4, ch: 2 })
    const saved = (await editorState(page)).session.source
    await openFileTab(page, '/tmp/csplit/recovery-b.md', '# Tab B\n\nOther text.\n')
    await invokeMenu(page, 'view.split-view')
    await expect(page.locator('.CodeMirror')).toBeVisible()
    await sourceSelection(page, { line: 2, ch: 11 })
    await page.keyboard.type(' tab-b')
    await page.locator('.tabs-container li > span', { hasText: 'recovery-a.md' }).click()
    await expect.poll(async () => ({ source: await sourceValue(page), state: (await editorState(page)).markdown })).toEqual(expect.objectContaining({ source: expect.stringContaining('tab-a'), state: expect.stringContaining('tab-a') }))
    expect((await editorState(page)).session.source).toEqual(saved)
    await sourceSelection(page, saved.anchor, saved.head)
    await page.keyboard.press('Meta+z')
    await expect.poll(() => sourceValue(page)).not.toContain('tab-a')
    await page.keyboard.press('Meta+Shift+z')
    await expect.poll(() => sourceValue(page)).toContain('tab-a')
    await invokeMenu(page, 'view.split-view')
    await invokeMenu(page, 'view.source-code-mode')
    await expect(page.locator('.CodeMirror')).toBeVisible()
    await page.keyboard.press('Meta+z')
    await expect.poll(() => sourceValue(page)).not.toContain('tab-a')
    await page.evaluate(() => {
      const pinia = (document.querySelector('#app') as any).__vue_app__.config.globalProperties.$pinia
      const store = pinia._s.get('editor')
      store.loadChange({ pathname: '/tmp/csplit/recovery-a.md', data: { markdown: '# Reloaded\n', filename: 'recovery-a.md', encoding: 'utf8', lineEnding: 'lf', trimTrailingNewline: false } })
    })
    await expect.poll(() => sourceValue(page)).toContain('# Reloaded')
    await page.keyboard.press('Meta+z')
    await expect.poll(() => sourceValue(page)).toContain('# Reloaded')
    expect((await editorState(page)).markdown).not.toContain('tab-a')
  })

  test('native rich undo, source context undo, keyboard format toggle and clipboard image insertion use the focused owner', async ({ page }) => {
    await sourceSelection(page, { line: 2, ch: 0 }, { line: 2, ch: 5 })
    await page.keyboard.press('Meta+b')
    await expect.poll(() => sourceValue(page)).toContain('**First**')
    await page.keyboard.press('Meta+b')
    await expect.poll(() => sourceValue(page)).not.toContain('**First**')
    await page.locator('.split-pane-rich p', { hasText: 'First paragraph.' }).click()
    await page.keyboard.press('End'); await page.keyboard.type(' native-undo')
    await page.keyboard.press('Meta+z')
    await expect.poll(() => sourceValue(page)).not.toContain('native-undo')
    await expect(page.locator('.split-pane-rich .editor-component')).toBeFocused()
    await page.keyboard.press('Meta+Shift+z')
    await expect.poll(() => sourceValue(page)).toContain('native-undo')
    await sourceSelection(page, { line: 0, ch: 0 })
    await page.evaluate(() => {
      const w = window as any
      w.__mockInvoke ||= {}
      w.__mockInvoke.mt_window_popup_context_menu = () => 'undo'
    })
    await page.locator('.split-pane-source .CodeMirror-line').first().click({ button: 'right' })
    await expect.poll(() => sourceValue(page)).not.toContain('native-undo')
    await sourceSelection(page, { line: 2, ch: 16 })
    await page.evaluate(() => {
      const w = window as any
      w.__mockInvoke = new Proxy({}, { get: (_target, command: string) => {
        if (typeof command !== 'string' || !command.startsWith('mt_fs')) return undefined
        return () => command === 'mt_fs_stat' ? { isFile: false, isDirectory: true } : command === 'mt_fs_exists' ? false : null
      } })
      const b64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='
      const file = new File([Uint8Array.from(atob(b64), char => char.charCodeAt(0))], 'source-image.png', { type: 'image/png' })
      const transfer = new DataTransfer(); transfer.items.add(file)
      const cm = (document.querySelector('.CodeMirror') as any).CodeMirror
      cm.getInputField().dispatchEvent(new ClipboardEvent('paste', { clipboardData: transfer, bubbles: true, cancelable: true }))
    })
    await expect.poll(() => sourceValue(page)).toMatch(/!\[source-image\]\(assets\/[^)]+\.png\)/)
    expect((await sourceValue(page)).match(/!\[[^\]]*\]\(assets\//g)).toHaveLength(1)
    await expect(page.locator('.split-pane-rich')).toContainText('First paragraph.')
  })

  test('large document adaptive follow remains bounded and keeps the tail and exact source markers', async ({ page }) => {
    const large = '# Large\n\n' + Array.from({ length: 450 }, (_, i) => `Paragraph ${i} with editable text.\n\n`).join('') + '* untouched tail\n'
    await openFileTab(page, '/tmp/csplit/large.md', large)
    await invokeMenu(page, 'view.split-view')
    await expect(page.locator('.CodeMirror')).toBeVisible()
    await sourceSelection(page, { line: 2, ch: 0 })
    const start = Date.now()
    await page.keyboard.type('SOURCE ')
    await expect(page.locator('.split-pane-rich p', { hasText: 'SOURCE Paragraph 0' })).toBeVisible({ timeout: 6000 })
    expect(Date.now() - start).toBeLessThan(6000)
    expect((await editorState(page)).markdown).toContain('* untouched tail')
    await page.keyboard.press('Meta+z')
    await expect.poll(() => sourceValue(page)).not.toContain('SOURCE Paragraph')
    expect((await editorState(page)).markdown).toBe(large)
  })
})
