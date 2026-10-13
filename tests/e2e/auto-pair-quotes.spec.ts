/**
 * auto-pair-quotes.spec.ts — quote auto-pairing must not double a closing quote.
 *
 * Typing `"` or `'` directly after a word character is a closing quote (or an
 * apostrophe) and must insert one character. Typing a quote after whitespace or
 * at line start still auto-pairs, and typing over an auto-inserted closing
 * quote still steps over it.
 */

import { test, expect, type Page } from '@playwright/test'
import { installTauriShim } from './fixtures/tauri-shim'
import { bootEditor, openFileTab } from './fixtures/helpers'

async function currentMarkdown (page: Page): Promise<string> {
  return page.evaluate(() => {
    const el = document.querySelector('#app') as any
    return el?.__vue_app__?.config?.globalProperties?.$pinia?.state?.value?.editor?.currentFile?.markdown ?? ''
  })
}

async function typeOnNewLine (page: Page, keys: string): Promise<string> {
  await bootEditor(page)
  await openFileTab(page, '/tmp/auto-pair.md', 'Start\n')
  const para = page.locator('.editor-with-tabs [contenteditable="true"] p').first()
  await expect(para).toContainText('Start', { timeout: 5_000 })
  await para.click()
  await page.keyboard.press('End')
  await page.keyboard.press('Enter')
  await page.keyboard.type(keys, { delay: 30 })
  await page.waitForTimeout(500)
  const md = await currentMarkdown(page)
  return md.split('\n').map(l => l.trimEnd()).filter(l => l && l !== 'Start').join('\n')
}

test.describe('quote auto-pairing', () => {
  test.beforeEach(async ({ page }) => {
    await installTauriShim(page)
  })

  const cases: Array<[string, string, string]> = [
    ['closing " after a word is not doubled', 'word"', 'word"'],
    ['closing " after Cyrillic is not doubled', 'слово"', 'слово"'],
    ['apostrophe after Cyrillic is not doubled', "слово'", "слово'"],
    ['apostrophe after Latin stays single', "it's", "it's"],
    ['opening " after a space pairs and the close steps over', 'say "hi"', 'say "hi"'],
    ['opening " at line start pairs', '"', '""'],
    ['closing " after punctuation inside a quote is not doubled', 'he said "ok."', 'he said "ok."']
  ]

  for (const [name, keys, expected] of cases) {
    test(name, async ({ page }) => {
      expect(await typeOnNewLine(page, keys)).toBe(expected)
    })
  }
})
