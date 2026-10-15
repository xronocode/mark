/**
 * lock-document.spec.ts — C-40 T-004 per-tab read-only lock.
 *
 * Gates the lock round trip with the real renderer: View › Lock Document
 * (view.lock-document renderer command, the native menu's dispatch path)
 * flips the tab into the read-only previewMode surface — the tab shows
 * the lock badge and the muya surface goes contenteditable=false; a click
 * inside the document (the reading-view exit gesture) does NOT unlock;
 * unlocking restores editing. Also pins the copy-as-markdown document
 * flavor and the split-view reachability through the command registry.
 */

import { test, expect, type Page } from '@playwright/test'
import { installTauriShim } from './fixtures/tauri-shim'
import { bootEditor, openFileTab } from './fixtures/helpers'

const DOC = ['# Lockable Notes', '', 'alpha beta gamma'].join('\n')

const badge = (page: Page) => page.locator('.tab-lock-badge')
const surface = (page: Page) => page.locator('#ag-editor-id')

const executeLock = (page: Page) =>
  page.evaluate(() => {
    ;(window as any).__bus.emit('cmd::execute', 'view.lock-document')
  })

async function tabState(page: Page): Promise<{ locked: boolean; previewMode: boolean }> {
  return page.evaluate(() => {
    const el = document.querySelector('#app') as any
    const tab =
      el?.__vue_app__?.config?.globalProperties?.$pinia?.state?.value?.editor
        ?.currentFile || {}
    return { locked: !!tab.locked, previewMode: !!tab.previewMode }
  })
}

test.describe('lock document (C-40 T-004)', () => {
  test.beforeEach(async ({ page }) => {
    await installTauriShim(page)
  })

  test('locking blocks editing, shows the badge, survives clicks, unlocking restores editing', async ({ page }) => {
    await bootEditor(page)
    await openFileTab(page, '/tmp/lock-doc.md', DOC)
    await expect(page.locator('#ag-editor-id h1')).toContainText('Lockable Notes')

    // Editable before locking.
    await expect(surface(page)).toHaveAttribute('contenteditable', 'true')
    await expect(badge(page)).toHaveCount(0)
    expect(await tabState(page)).toEqual({ locked: false, previewMode: false })

    // The same route the native View › Lock Document item takes.
    await executeLock(page)

    expect(await tabState(page)).toEqual({ locked: true, previewMode: true })
    await expect(badge(page)).toBeVisible({ timeout: 5_000 })
    await expect(surface(page)).toHaveAttribute('contenteditable', 'false')

    // Typing is blocked while locked: focus the document and type — the
    // heading text must not change.
    const heading = page.locator('#ag-editor-id h1')
    const before = await heading.textContent()
    await page.locator('#ag-editor-id').click({ position: { x: 20, y: 20 } })
    await page.keyboard.type('XXX')
    await page.waitForTimeout(300)
    expect(await heading.textContent()).toBe(before)

    // A click inside the document is the reading-view exit gesture — a
    // LOCKED tab must stay read-only (only the toggle unlocks).
    await expect(badge(page)).toBeVisible()
    expect(await tabState(page)).toEqual({ locked: true, previewMode: true })
    await expect(surface(page)).toHaveAttribute('contenteditable', 'false')

    // Unlock restores editing.
    await executeLock(page)
    expect(await tabState(page)).toEqual({ locked: false, previewMode: false })
    await expect(badge(page)).toHaveCount(0)
    await expect(surface(page)).toHaveAttribute('contenteditable', 'true')

    // And typing works again.
    const para = page.locator('.editor-with-tabs [contenteditable="true"] p').first()
    await para.click()
    await page.keyboard.type(' delta')
    await expect
      .poll(
        async () =>
          page.evaluate(() => {
            const el = document.querySelector('#app') as any
            return (
              el?.__vue_app__?.config?.globalProperties?.$pinia?.state?.value
                ?.editor?.currentFile?.wordCount?.word ?? 0
            )
          }),
        { timeout: 10_000 }
      )
      .toBeGreaterThan(3)
  })

  test('the lock badge also marks a Finder-opened reading-view tab, and Lock makes it sticky', async ({ page }) => {
    await bootEditor(page)
    // previewMode: true is exactly what the mt::open-new-tab payload
    // carries for Finder/CLI-opened files (bootstrap-ipc APPLY_PREVIEW_MODE).
    await openFileTab(page, '/tmp/finder-doc.md', DOC)
    await page.evaluate(() => {
      const el = document.querySelector('#app') as any
      const pinia = el?.__vue_app__?.config?.globalProperties?.$pinia
      const editor = pinia?.state?.value?.editor
      if (editor?.currentFile) {
        editor.currentFile.previewMode = true
        editor.currentFile._previewSideBarSnapshot = false
      }
    })
    await expect(badge(page)).toBeVisible({ timeout: 5_000 })
    await expect(surface(page)).toHaveAttribute('contenteditable', 'false')

    // The reading-view click gesture still exits plain preview mode
    // (existing M-022 behaviour is unchanged for unlocked tabs).
    await page.locator('#ag-editor-id').click({ position: { x: 20, y: 20 } })
    await expect(surface(page)).toHaveAttribute('contenteditable', 'true')
    await expect(badge(page)).toHaveCount(0)

    // With the lock on, the same click does nothing.
    await executeLock(page)
    await expect(badge(page)).toBeVisible()
    await page.locator('#ag-editor-id').click({ position: { x: 20, y: 20 } })
    await expect(badge(page)).toBeVisible()
    await expect(surface(page)).toHaveAttribute('contenteditable', 'false')
  })

  test('copy as markdown puts the raw document on the clipboard (R-2 flavor)', async ({ page }) => {
    // Capture the native clipboard-manager write through the tauri shim
    // (navigator.clipboard.readText needs permissions webkit does not grant).
    await page.addInitScript(() => {
      ;(window as any).__mockInvoke = {
        'plugin:clipboard-manager|write_text': (args: any) => {
          ;(window as any).__clipWrites = ((window as any).__clipWrites || []).concat([args])
          return null
        }
      }
    })
    await bootEditor(page)
    await openFileTab(page, '/tmp/copy-md.md', DOC)

    await page.evaluate(() => {
      ;(window as any).__bus.emit('cmd::execute', 'edit.copy-as-markdown')
    })
    // focusEditorAndExecute waits 150 ms before dispatching.
    await page.waitForTimeout(400)

    const writes = await page.evaluate(() => (window as any).__clipWrites || [])
    expect(writes.length).toBeGreaterThan(0)
    const last = JSON.stringify(writes[writes.length - 1])
    expect(last).toContain('# Lockable Notes')
    expect(last).toContain('alpha beta gamma')
  })

  test('split view stays reachable through the command registry', async ({ page }) => {
    await bootEditor(page)
    await openFileTab(page, '/tmp/split-doc.md', DOC)

    await page.evaluate(() => {
      ;(window as any).__bus.emit('cmd::execute', 'view.split-view')
    })
    await expect(page.locator('.split-view.is-split')).toBeVisible({ timeout: 5_000 })
  })
})
