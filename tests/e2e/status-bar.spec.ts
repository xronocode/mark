/**
 * status-bar.spec.ts — C-40 T-004 optional status bar.
 *
 * Gates the full round trip with the real renderer: the per-OS default
 * (off on macOS, on elsewhere — resolved from the page's own platform),
 * the View › Status Bar renderer command toggling + persisting the
 * statusBarVisibility preference, the whole-document counts
 * (lines · words · characters · reading time — the shared util/docStats
 * computation over the tab's wordCount/markdown) with «Markdown» on the
 * right, the selection-aware replacement counts while text is selected
 * inside the editor area, and live updates while typing.
 */

import { test, expect, type Page } from '@playwright/test'
import { installTauriShim } from './fixtures/tauri-shim'
import { bootEditor, openFileTab } from './fixtures/helpers'

const DOC = [
  '# Status Bar Notes',
  '',
  'alpha beta gamma delta epsilon',
  '',
  'second paragraph here'
].join('\n')

const bar = (page: Page) => page.locator('.status-bar')

// Expected document-count text derived from the live tab state (the bar
// must always agree with tab.wordCount + tab.markdown through docStats).
async function expectedDocCounts(page: Page): Promise<string> {
  const { words, characters, lines } = await page.evaluate(() => {
    const el = document.querySelector('#app') as any
    const pinia = el?.__vue_app__?.config?.globalProperties?.$pinia
    const tab = pinia?.state?.value?.editor?.currentFile || {}
    return {
      words: tab.wordCount?.word ?? 0,
      characters: tab.wordCount?.character ?? 0,
      lines: typeof tab.markdown === 'string' ? tab.markdown.split('\n').length : 0
    }
  })
  const minutes = Math.max(1, Math.ceil(words / 230))
  const plural = (n: number, one: string, other: string) => (n === 1 ? one : other)
  return [
    plural(lines, `${lines} line`, `${lines} lines`),
    plural(words, `${words} word`, `${words} words`),
    plural(characters, `${characters} character`, `${characters} characters`),
    `${minutes} min read`
  ].join(' · ')
}

async function counts(page: Page): Promise<string> {
  return (await page.locator('.status-bar-count').allTextContents()).join(' · ')
}

async function ensureVisible(page: Page): Promise<void> {
  await page.evaluate(() => {
    const el = document.querySelector('#app') as any
    const pinia = el?.__vue_app__?.config?.globalProperties?.$pinia
    if (pinia && !pinia.state.value.preferences.statusBarVisibility) {
      pinia.state.value.preferences.statusBarVisibility = true
    }
  })
  await expect(bar(page)).toBeVisible({ timeout: 5_000 })
}

test.describe('status bar (C-40 T-004)', () => {
  test.beforeEach(async ({ page }) => {
    await installTauriShim(page)
  })

  test('per-OS default; View › Status Bar toggles and persists the preference', async ({ page }) => {
    await page.addInitScript(() => {
      ;(window as any).__mockInvoke = {
        mt_prefs_set: (args: any) => {
          ;(window as any).__prefSets = ((window as any).__prefSets || []).concat([args])
          return null
        }
      }
    })
    await bootEditor(page)
    await openFileTab(page, '/tmp/status-bar.md', DOC)
    await expect(page.locator('#ag-editor-id h1')).toContainText('Status Bar Notes')

    // The bar mounts per the per-OS default (off on macOS, on elsewhere).
    const platform = await page.evaluate(
      () => (window as any).electron?.process?.platform || ''
    )
    const defaultVisible = platform !== 'darwin'
    await expect
      .poll(async () => bar(page).isVisible(), { timeout: 5_000 })
      .toBe(defaultVisible)

    // The same route the native View › Status Bar item takes (menu-bridge).
    await page.evaluate(() => {
      ;(window as any).__bus.emit('cmd::execute', 'view.status-bar')
    })
    await expect
      .poll(async () => bar(page).isVisible(), { timeout: 5_000 })
      .toBe(!defaultVisible)

    await page.evaluate(() => {
      ;(window as any).__bus.emit('cmd::execute', 'view.status-bar')
    })
    await expect
      .poll(async () => bar(page).isVisible(), { timeout: 5_000 })
      .toBe(defaultVisible)

    const prefSets = await page.evaluate(() => (window as any).__prefSets || [])
    const barSets = prefSets.filter((s: any) => s.key === 'statusBarVisibility')
    expect(barSets).toEqual([
      { key: 'statusBarVisibility', value: !defaultVisible },
      { key: 'statusBarVisibility', value: defaultVisible }
    ])
  })

  test('shows lines · words · characters · reading time left and Markdown right', async ({ page }) => {
    await bootEditor(page)
    await openFileTab(page, '/tmp/status-bar.md', DOC)
    await ensureVisible(page)

    // The muya change event delivers wordCount asynchronously — wait for
    // the store to settle, then require the bar to show exactly those
    // numbers (canvas example shape: N lines · N words · N characters ·
    // N min read, «Markdown» right).
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
      .toBeGreaterThan(0)

    const expected = await expectedDocCounts(page)
    await expect.poll(async () => counts(page), { timeout: 10_000 }).toBe(expected)
    expect(expected).toMatch(/lines? · \d+ words? · \d+ characters? · 1 min read/)
    await expect(page.locator('.status-bar-type')).toHaveText('Markdown')
    await expect(bar(page)).toHaveAttribute('aria-label', 'Document statistics')
  })

  test('selection-aware: selected words/characters replace the document counts', async ({ page }) => {
    await bootEditor(page)
    await openFileTab(page, '/tmp/status-bar.md', DOC)
    await ensureVisible(page)

    // Select the last paragraph's text ("second paragraph here") inside
    // the editor area.
    await page.evaluate(() => {
      const paragraphs = document.querySelectorAll('#ag-editor-id p')
      const target = paragraphs[paragraphs.length - 1]
      const range = document.createRange()
      range.selectNodeContents(target)
      const sel = window.getSelection()
      sel?.removeAllRanges()
      sel?.addRange(range)
      document.dispatchEvent(new Event('selectionchange'))
    })

    await expect
      .poll(async () => counts(page), { timeout: 5_000 })
      .toBe('3 words selected · 19 characters selected')
    await expect(page.locator('.status-bar-type')).toHaveText('Markdown')

    // Collapsing the selection returns the document counts.
    await page.evaluate(() => {
      window.getSelection()?.removeAllRanges()
      document.dispatchEvent(new Event('selectionchange'))
    })
    await expect
      .poll(async () => counts(page), { timeout: 5_000 })
      .toBe(await expectedDocCounts(page))
  })

  test('updates as the document is edited', async ({ page }) => {
    await bootEditor(page)
    await openFileTab(page, '/tmp/status-bar.md', DOC)
    await ensureVisible(page)

    const wordsNow = () =>
      page.evaluate(() => {
        const el = document.querySelector('#app') as any
        return (
          el?.__vue_app__?.config?.globalProperties?.$pinia?.state?.value?.editor
            ?.currentFile?.wordCount?.word ?? 0
        )
      })
    const initialWords = await wordsNow()

    const para = page.locator('.editor-with-tabs [contenteditable="true"] p').first()
    await para.click()
    await page.keyboard.type(' zeta')

    // The store settles first (word count grows), the bar follows with
    // exactly the same numbers.
    await expect.poll(wordsNow, { timeout: 10_000 }).toBeGreaterThan(initialWords)
    await expect
      .poll(async () => counts(page), { timeout: 10_000 })
      .toBe(await expectedDocCounts(page))
  })
})
