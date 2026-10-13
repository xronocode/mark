/**
 * image-paste-assets.spec.ts — C-24 R-2/R-3/R-4: a bitmap pasted into a saved
 * document, or an image file dropped from Finder (mt::drop-image), is written
 * into `<doc dir>/assets/` and linked as standard `![…](assets/…)` markdown
 * (not an `<img width>` tag, not an absolute path).
 */

import { test, expect, type Page } from '@playwright/test'
import { installTauriShim } from './fixtures/tauri-shim'
import { bootEditor, openFileTab } from './fixtures/helpers'

const DOC = '/tmp/c24-paste/doc.md'
// 1x1 transparent PNG.
const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='

async function currentMarkdown (page: Page): Promise<string> {
  return page.evaluate(() => {
    const el = document.querySelector('#app') as any
    return el?.__vue_app__?.config?.globalProperties?.$pinia?.state?.value?.editor?.currentFile?.markdown ?? ''
  })
}

test.describe('image paste into a saved document (C-24)', () => {
  test.beforeEach(async ({ page }) => {
    await installTauriShim(page)
    await page.addInitScript(() => {
      const w = window as any
      w.__invokeLog = []
      w.__mockInvoke = new Proxy({}, {
        get: (_t, cmd: string) => {
          if (typeof cmd !== 'string' || !cmd.startsWith('mt_fs')) return undefined
          return (args: any) => {
            w.__invokeLog.push({ cmd, path: args?.path ?? args?.pathname ?? args?.dest ?? args?.to ?? null, keys: Object.keys(args || {}) })
            if (cmd === 'mt_fs_stat') return { isFile: false, isDirectory: true }
            if (cmd === 'mt_fs_exists') return false
            return null
          }
        }
      })
    })
  })

  test('pasted PNG lands in assets/ as ![](assets/…)', async ({ page }) => {
    await bootEditor(page)
    await openFileTab(page, DOC, 'Start\n')
    const para = page.locator('.editor-with-tabs [contenteditable="true"] p').first()
    await expect(para).toContainText('Start', { timeout: 5_000 })
    await para.click()
    await page.keyboard.press('End')
    await page.keyboard.press('Enter')

    await page.evaluate((b64) => {
      const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0))
      const file = new File([bytes], 'image.png', { type: 'image/png' })
      const dt = new DataTransfer()
      dt.items.add(file)
      const target = document.activeElement || document.querySelector('[contenteditable="true"]')
      target!.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }))
    }, PNG_B64)
    await page.waitForTimeout(1_000)

    const md = await currentMarkdown(page)
    const log = await page.evaluate(() => (window as any).__invokeLog)
    console.log('MD', JSON.stringify(md))
    console.log('FS', JSON.stringify(log))
    expect(md).toMatch(/!\[[^\]]*\]\(assets\/[^)]+\.png\)/)
    expect(md).not.toContain('<img')
  })

  test('image dropped from Finder lands in assets/ as ![name](assets/…)', async ({ page }) => {
    await bootEditor(page)
    await openFileTab(page, DOC, 'Start\n')
    const para = page.locator('.editor-with-tabs [contenteditable="true"] p').first()
    await expect(para).toContainText('Start', { timeout: 5_000 })
    await para.click()
    await page.keyboard.press('End')
    await page.keyboard.press('Enter')

    await page.evaluate(() => (window as any).__emitFakeEvent('mt::drop-image', { path: '/Users/me/Desktop/shot.png' }))
    await page.waitForTimeout(1_000)

    const md = await currentMarkdown(page)
    const log = await page.evaluate(() => (window as any).__invokeLog)
    console.log('DROP MD', JSON.stringify(md))
    console.log('DROP FS', JSON.stringify(log))
    expect(md).toMatch(/!\[shot\]\(assets\/[^)]+\.png\)/)
    expect(md).not.toContain('/Users/me/Desktop')
  })
})
