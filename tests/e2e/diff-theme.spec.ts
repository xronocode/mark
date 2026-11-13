// FILE: tests/e2e/diff-theme.spec.ts
// START_MODULE_CONTRACT
//   PURPOSE: Verify live themes and readable changed paragraphs in the actual comparison surface.
//   SCOPE: Both owned CodeMirror panes, comparison identity/content and cold dark-theme contrast through the renderer shim.
//   DEPENDS: Playwright, canonical Tauri shim, editor boot/open helpers and built CodeMirror MergeView.
//   LINKS: M-031; V-M-031.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
// START_MODULE_MAP
//   currentMarkdown - Controlled current comparison text.
//   baselineMarkdown - Controlled stored baseline text.
//   themeNames - Existing application-to-CodeMirror theme families exercised here.
//   bootDiff - Open a synthetic comparison with counted baseline and write transport.
//   readDiffState - Inspect actual owned editors and the selected tab.
//   contrastRatio - Compare the measured opaque foreground and changed-line background.
// END_MODULE_MAP
import { test, expect, type Page } from '@playwright/test'
import { installTauriShim } from './fixtures/tauri-shim'
import { bootEditor, openFileTab } from './fixtures/helpers'

const currentMarkdown = '# Current report\n\nThe current paragraph has revised wording.\n'
const baselineMarkdown = '# Original report\n\nThe original paragraph has earlier wording.\n'
const themeNames = { paper: 'default', ink: 'railscasts', 'one-dark': 'one-dark' }

async function bootDiff(page: Page, theme: string) {
  await installTauriShim(page)
  await page.addInitScript(({ theme, baseline }) => {
    const w = window as any
    w.__diffThemeCalls = 0
    w.__diffThemeWrites = []
    w.__mockInvoke.mt_prefs_get_all = () => ({ theme, followSystemTheme: false, language: 'en', autoSave: false })
    w.__mockInvoke.mt_diff_baseline = () => { w.__diffThemeCalls++; return baseline }
    w.__mockInvoke.mt_document_write_snapshot = (payload: unknown) => { w.__diffThemeWrites.push(payload); throw new Error('Unexpected comparison write') }
  }, { theme, baseline: baselineMarkdown })
  await bootEditor(page)
  await openFileTab(page, '/tmp/diff-theme-regression.md', currentMarkdown)
  await page.evaluate(() => (window as any).__emitFakeEvent('mt::menu-invoked', 'view.diff-mode'))
  await expect(page.locator('.diff-view')).toBeVisible()
  await page.waitForFunction(() => {
    const panes = [...document.querySelectorAll('.diff-view .CodeMirror')]
    return panes.length === 2 && panes.every(pane => pane.querySelector('.CodeMirror-merge-r-chunk'))
  })
  await page.evaluate(() => {
    ;(window as any).__diffThemeEditors = [...document.querySelectorAll('.diff-view .CodeMirror')].map(pane => (pane as any).CodeMirror)
  })
}

async function readDiffState(page: Page) {
  return page.evaluate(() => {
    const w = window as any
    const file = (document.querySelector('#app') as any).__vue_app__.config.globalProperties.$pinia._s.get('editor').currentFile
    return {
      tab: { id: file.id, markdown: file.markdown, isSaved: file.isSaved, pathname: file.pathname, diffMode: file.diffMode },
      baselineCalls: w.__diffThemeCalls,
      writes: w.__diffThemeWrites.length,
      panes: [...document.querySelectorAll('.diff-view .CodeMirror')].map((pane, index) => {
        const cm = (pane as any).CodeMirror
        const paragraph = [...pane.querySelectorAll('.CodeMirror-line')].find(line => line.textContent?.includes('paragraph'))!
        const walker = document.createTreeWalker(paragraph, NodeFilter.SHOW_TEXT)
        let node = walker.nextNode()
        while (node && !node.textContent?.includes('paragraph')) node = walker.nextNode()
        const chunk = pane.querySelector('.CodeMirror-merge-r-chunk')!
        return { theme: cm.getOption('theme'), classes: [...pane.classList].filter(name => name.startsWith('cm-s-')), value: cm.getValue(), readOnly: cm.getOption('readOnly'), sameInstance: cm === w.__diffThemeEditors[index], paragraphColor: getComputedStyle(node!.parentElement!).color, changedBackground: getComputedStyle(chunk).backgroundColor, changedMarkers: pane.querySelectorAll('.CodeMirror-merge-r-chunk').length }
      })
    }
  })
}

function contrastRatio(foreground: string, background: string) {
  const luminance = (value: string) => {
    const channels = value.match(/[\d.]+/g)!.map(Number)
    expect(channels.length === 3 || channels[3] === 1).toBe(true)
    const linear = channels.slice(0, 3).map(channel => {
      const s = channel / 255
      return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
    })
    return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722
  }
  const a = luminance(foreground), b = luminance(background)
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}

test('live theme changes update both owned panes without refetching or changing the comparison', async ({ page }) => {
  await bootDiff(page, 'paper')
  const initial = await readDiffState(page)
  for (const theme of ['ink', 'one-dark', 'paper'] as const) {
    await page.evaluate(theme => (window as any).__emitFakeEvent('mt::user-preference', { theme, followSystemTheme: false }), theme)
    await expect.poll(async () => (await readDiffState(page)).panes.map(pane => pane.theme)).toEqual([themeNames[theme], themeNames[theme]])
    const state = await readDiffState(page)
    expect(state.tab).toEqual(initial.tab)
    expect(state.panes.map(pane => pane.value)).toEqual(initial.panes.map(pane => pane.value))
    expect(state.panes.every(pane => pane.sameInstance && pane.readOnly === true)).toBe(true)
    expect(state.panes.map(pane => pane.classes)).toEqual([[`cm-s-${themeNames[theme]}`], [`cm-s-${themeNames[theme]}`]])
    expect(state.baselineCalls).toBe(1)
    expect(state.writes).toBe(0)
    expect(state.panes.map(pane => pane.changedMarkers)).toEqual(initial.panes.map(pane => pane.changedMarkers))
    if (theme === 'paper') expect(state.panes.map(pane => pane.changedBackground)).toEqual(initial.panes.map(pane => pane.changedBackground))
    else for (const pane of state.panes) expect(contrastRatio(pane.paragraphColor, pane.changedBackground)).toBeGreaterThanOrEqual(4.5)
  }
})

for (const theme of ['ink', 'one-dark']) test(`${theme} changed paragraphs remain readable in both panes`, async ({ page }) => {
  await bootDiff(page, theme)
  const state = await readDiffState(page)
  for (const pane of state.panes) expect(contrastRatio(pane.paragraphColor, pane.changedBackground)).toBeGreaterThanOrEqual(4.5)
  expect(state.panes.map(pane => pane.readOnly)).toEqual([true, true])
  expect(state.writes).toBe(0)
})
