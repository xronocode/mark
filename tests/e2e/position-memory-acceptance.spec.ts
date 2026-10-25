/**
 * position-memory-acceptance.spec.ts — C-FILE-POSITION-MEMORY visual
 * acceptance capture (owner e2e acceptance).
 *
 * Captures the before/after evidence pairs for the two headline scenarios
 * and saves cropped viewport shots to the change bundle:
 *   1) close + reopen — the deep viewport and the caret paragraph come back
 *   2) arrow keys + tab switch — the caret row survives the round-trip
 * The transcript assertions are literal: the remembered paragraph text must
 * be on screen after the restore, not "somewhere in the document".
 */

import { test, expect, type Page } from '@playwright/test'
import { installTauriShim } from './fixtures/tauri-shim'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { bootEditor, openFileTab } from './fixtures/helpers'

const paras = Array.from({ length: 150 }, (_, i) => `Paragraph ${i + 1} of the tall document with filler text to guarantee height.`).join('\n\n')
const doc = (title: string) => `# ${title}\n\n${paras}\n`
const OUT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../.grace/changes/active/C-FILE-POSITION-MEMORY'
)

interface Shot {
  scrollTop: number
  caretText: string
  onScreen: string[]
  caretOnScreen: boolean
}

// What the viewport literally shows (paragraph starts visible in the clip).
async function shoot(page: Page, path: string): Promise<Shot> {
  return page.evaluate((p) => {
    const c = document.querySelector('.editor-component') as HTMLElement
    const clip = { x: c.getBoundingClientRect().left + 40, y: c.getBoundingClientRect().top + 10, width: 620, height: 520 }
    const active = document.querySelector('.ag-active') as HTMLElement | null
    const holder = active ? ((active.closest('p, li, h1, h2') || active) as HTMLElement) : null
    const onScreen = [...document.querySelectorAll('.editor-with-tabs p.ag-paragraph')]
      .filter(pp => { const r = pp.getBoundingClientRect(); return r.top >= clip.y && r.bottom < clip.y + clip.height })
      .slice(0, 3)
      .map(pp => (pp.textContent || '').slice(0, 26))
    const caretRect = active ? active.getBoundingClientRect() : null
    const caretOnScreen = !!caretRect && caretRect.top >= c.getBoundingClientRect().top &&
      caretRect.bottom <= c.getBoundingClientRect().bottom
    void p
    return {
      scrollTop: Math.round(c.scrollTop),
      caretText: holder ? (holder.textContent || '').slice(0, 26) : '',
      onScreen,
      caretOnScreen
    }
  }, path)
}

const installBackend = (docs: Record<string, string>) => {
  ;(window as any).__mockInvoke = {
    ...((window as any).__mockInvoke || {}),
    mt_prefs_get: ({ key }: { key: string }) => {
      const raw = localStorage.getItem('e2e-prefs:' + key)
      return raw === null ? null : JSON.parse(raw)
    },
    mt_prefs_set: ({ key, value }: { key: string; value: unknown }) => {
      localStorage.setItem('e2e-prefs:' + key, JSON.stringify(value))
    },
    mt_fs_stat: (arg: unknown) => {
      const a = arg as any
      // Membership in the docs registry decides isFile: the auto-diff
      // sidecar probe stats {path}.before neighbours and must see them
      // missing, like the real fs for fixture-only paths.
      const p = typeof arg === 'string' ? arg : a?.path ?? a?.args?.[0]
      const known = !!p && typeof p === 'string' && Object.prototype.hasOwnProperty.call(docs, p)
      return { isFile: known, isDirectory: false }
    },
    mt_open_file: (arg: unknown) => {
      const a = arg as any
      const p = typeof arg === 'string' ? arg : a?.args?.[0]
      const md = p && docs[p] ? docs[p] : null
      if (!md) return Promise.resolve(false)
      setTimeout(() => {
        ;(window as any).__emitFakeEvent('mt::open-new-tab', {
          pathname: p, filename: p.split('/').pop(), markdown: md,
          isUtf8BomEncoded: false, lineEnding: 'lf', adjustLineEndingOnSave: false
        })
      }, 0)
      return Promise.resolve(true)
    }
  }
}

async function clickParagraph(page: Page, n: number) {
  const para = page.locator('.editor-with-tabs p.ag-paragraph', { hasText: `Paragraph ${n} of` }).first()
  await para.scrollIntoViewIfNeeded()
  await page.waitForTimeout(150)
  await para.click()
  await page.waitForTimeout(400)
}

test.beforeEach(async ({ page }) => {
  await installTauriShim(page)
})

test('acceptance: close + reopen returns the exact viewport and caret', async ({ page }) => {
  const B = '/tmp/pma-close.md'
  await page.addInitScript(installBackend, { '/tmp/pma-a.md': '# Doc A\n\nAlpha.\n', [B]: doc('Accept Close') })
  await bootEditor(page)
  await openFileTab(page, '/tmp/pma-a.md', '# Doc A\n\nAlpha.\n')
  await openFileTab(page, B, doc('Accept Close'))
  await expect(page.locator('.editor-with-tabs h1').first()).toContainText('Accept Close')

  await clickParagraph(page, 120)
  const before = await shoot(page, 'before')
  console.log('[accept-close] before:', JSON.stringify(before))
  expect(before.caretText).toContain('Paragraph 120')
  await page.screenshot({ path: `${OUT}/evidence-close-before.png` })

  const tabLi = page.locator('.editor-tabs .tabs-container li').nth(1)
  await tabLi.hover()
  await tabLi.locator('.close-icon').click({ force: true })
  await expect(page.locator('.editor-with-tabs h1').first()).toContainText('Doc A')
  await page.waitForTimeout(400)
  await openFileTab(page, B, doc('Accept Close'))
  await expect(page.locator('.editor-with-tabs h1').first()).toContainText('Accept Close')
  await page.waitForTimeout(800)

  const after = await shoot(page, 'after')
  console.log('[accept-close] after:', JSON.stringify(after))
  await page.screenshot({ path: `${OUT}/evidence-close-after.png` })
  // Literal transcript: the viewport rows and the caret are back; the
  // remembered caret paragraph must be visible in the editor.
  expect(after.caretText).toContain('Paragraph 120')
  expect(after.caretOnScreen).toBe(true)
  expect(Math.abs(after.scrollTop - before.scrollTop)).toBeLessThanOrEqual(50)
})

test('acceptance: arrow-moved caret survives the tab round-trip', async ({ page }) => {
  const B = '/tmp/pma-arrows.md'
  await page.addInitScript(installBackend, { '/tmp/pma-a.md': '# Doc A\n\nAlpha.\n', [B]: doc('Accept Arrows') })
  await bootEditor(page)
  await openFileTab(page, '/tmp/pma-a.md', '# Doc A\n\nAlpha.\n')
  await openFileTab(page, B, doc('Accept Arrows'))
  await expect(page.locator('.editor-with-tabs h1').first()).toContainText('Accept Arrows')

  await clickParagraph(page, 10)
  for (let i = 0; i < 80; i++) await page.keyboard.press('ArrowDown')
  await page.waitForTimeout(500)
  const before = await shoot(page, 'before')
  console.log('[accept-arrows] before:', JSON.stringify(before))
  expect(before.caretText).toContain('Paragraph 90')

  await page.locator('.editor-tabs .tabs-container li').nth(0).click()
  await expect(page.locator('.editor-with-tabs h1').first()).toContainText('Doc A')
  await page.waitForTimeout(500)
  await page.locator('.editor-tabs .tabs-container li').nth(1).click()
  await expect(page.locator('.editor-with-tabs h1').first()).toContainText('Accept Arrows')
  await page.waitForTimeout(600)

  const after = await shoot(page, 'after')
  console.log('[accept-arrows] after:', JSON.stringify(after))
  await page.screenshot({ path: `${OUT}/evidence-arrows-after.png` })
  expect(after.caretText).toContain('Paragraph 90')
  expect(Math.abs(after.scrollTop - before.scrollTop)).toBeLessThanOrEqual(2)
})
