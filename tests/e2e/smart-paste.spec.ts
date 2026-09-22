/**
 * smart-paste.spec.ts — C-16 paste hygiene visual gate (Chromium part).
 *
 * Drives the REAL muya paste pipeline with a synthetic rich-HTML
 * ClipboardEvent and pins the existing html2State conversion (R-2).
 *
 * What this spec deliberately does NOT cover, and why:
 *  - URL-over-selection (R-1): muya keeps its own cursor model which
 *    synthetic Chromium events cannot commit; the branch is pinned
 *    table-driven in tests/renderer/muya/paste-smart.test.js (5 cases)
 *    and by the WKWebView live-app smoke (real Cmd+V over a selection).
 *  - Clipboard image File (R-3): the items branch is pinned in the same
 *    unit file; real WKWebView bitmap delivery is the smoke's question
 *    (a synthetic Chromium File proves nothing about NSPasteboard).
 */

import { test, expect } from '@playwright/test'
import { installTauriShim } from './fixtures/tauri-shim'
import { bootEditor, openFileTab } from './fixtures/helpers'

const DOC = [
  '# Paste Playground',
  '',
  'Read the strategy notes today.',
  ''
].join('\n')

test.describe('smart paste (C-16)', () => {
  test.beforeEach(async ({ page }) => {
    await installTauriShim(page)
  })

  test('pasting rich HTML renders the markdown equivalent', async ({ page }) => {
    await bootEditor(page)
    await openFileTab(page, '/tmp/smart-paste.md', DOC)

    await expect(page.locator('.editor-with-tabs p').first())
      .toContainText('strategy notes', { timeout: 5_000 })

    await page.evaluate(() => {
      const container = document.querySelector('.editor-component') as HTMLElement
      const dt = new DataTransfer()
      dt.setData('text/plain', 'Bold move')
      dt.setData('text/html', '<p><strong>Bold</strong> move</p>')
      container.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }))
    })
    await page.waitForTimeout(400)

    const strong = page.locator('.editor-with-tabs strong').first()
    await expect(strong).toBeVisible({ timeout: 5_000 })
    await expect(strong).toHaveText('Bold')
  })

  test('pasting hostile HTML never yields live script or handler markup', async ({ page }) => {
    await bootEditor(page)
    await openFileTab(page, '/tmp/smart-paste.md', DOC)

    await expect(page.locator('.editor-with-tabs p').first())
      .toContainText('strategy notes', { timeout: 5_000 })

    await page.evaluate(() => {
      const container = document.querySelector('.editor-component') as HTMLElement
      const dt = new DataTransfer()
      dt.setData('text/plain', 'safe')
      dt.setData(
        'text/html',
        '<p onclick="alert(1)">safe</p><script>evil()</script><img src=x onerror="evil()">' +
          '<svg onload="evil()"></svg><a href="javascript:evil()">x</a>'
      )
      container.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }))
    })
    await page.waitForTimeout(400)

    // The sanitized benign content rendered...
    const editorText = await page.evaluate(() =>
      (document.querySelector('.editor-component') as HTMLElement).innerText
    )
    expect(editorText).toContain('safe')
    // ...and nothing executable survived.
    const editorHtml = await page.evaluate(() =>
      (document.querySelector('.editor-component') as HTMLElement).innerHTML
    )
    expect(editorHtml).not.toMatch(/<script/i)
    expect(editorHtml).not.toContain('onerror')
    expect(editorHtml).not.toContain('onclick')
    expect(editorHtml).not.toContain('onload')
    expect(editorHtml).not.toContain('javascript:')
  })
})
