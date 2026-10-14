// FILE: tests/e2e/editor-surface.spec.ts
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Corner cases of the flex-column editor surface (selection-paint fix ead32f24): caret placement from the margins and below the last block, select-all + typing never leaves stray content outside #ag-editor-id, and the RTL column stays inside a narrow window.
//   SCOPE: Renderer-only (vite preview + tauri shim); runs in the chromium project and, locally, under WebKit with the same spec.
//   DEPENDS: tests/e2e/fixtures/tauri-shim.ts, tests/e2e/fixtures/helpers.ts
//   LINKS: .grace/verification/runtime.xml V-M-011 scenario-23
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   DOC - three-block document used by every case.
//   md - current tab markdown from the store.
//   strayOutsideColumn - nodes under .editor-component other than #ag-editor-id.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - review follow-up for the flex-column surface.
// END_CHANGE_SUMMARY

import { test, expect, type Page } from '@playwright/test'
import { installTauriShim } from './fixtures/tauri-shim'
import { bootEditor, openFileTab } from './fixtures/helpers'

const DOC = '# Surface\n\nFirst paragraph.\n\nLast paragraph.\n'

const md = (page: Page) => page.evaluate(() =>
  (document.querySelector('#app') as any).__vue_app__.config.globalProperties.$pinia.state.value.editor.currentFile.markdown)

const strayOutsideColumn = (page: Page) => page.evaluate(() => {
  const surface = document.querySelector('#ag-editor-id')!.parentElement!
  return [...surface.childNodes]
    .filter((n) => n !== document.querySelector('#ag-editor-id'))
    .filter((n) => !(n.nodeType === 3 && !n.textContent!.trim()))
    .map((n) => (n as Element).className || n.nodeName)
})

test.describe('editor surface corner cases', () => {
  test.beforeEach(async ({ page }) => {
    await installTauriShim(page)
    await bootEditor(page)
    await openFileTab(page, '/tmp/mark-e2e/surface.md', DOC)
    await expect(page.locator('#ag-editor-id h1')).toBeVisible({ timeout: 5_000 })
  })

  test('a click in the side margin puts the caret inside the column', async ({ page }) => {
    const p = await page.locator('#ag-editor-id p').first().boundingBox()
    await page.mouse.click(8, p!.y + p!.height / 2)
    await page.keyboard.type('X')
    expect(await strayOutsideColumn(page)).toEqual([])
    const inColumn = await page.evaluate(() => {
      const a = getSelection()!.anchorNode
      return !!a && !!document.querySelector('#ag-editor-id')!.contains(a)
    })
    expect(inColumn).toBe(true)
  })

  test('a click below the last block keeps typing inside the column', async ({ page }) => {
    const box = await page.locator('#ag-editor-id').boundingBox()
    await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height - 20)
    await page.keyboard.type('Y')
    expect(await strayOutsideColumn(page)).toEqual([])
  })

  test('select-all then typing replaces the document without stray nodes', async ({ page }) => {
    await page.locator('#ag-editor-id p').first().click()
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A')
    await page.keyboard.type('Z')
    await page.waitForTimeout(300)
    expect(await strayOutsideColumn(page)).toEqual([])
    expect((await md(page)).trim().endsWith('Z')).toBe(true)
  })

  test('the RTL column stays inside a narrow window', async ({ page }) => {
    await page.setViewportSize({ width: 600, height: 700 })
    await page.evaluate(() => {
      const pinia = (document.querySelector('#app') as any).__vue_app__.config.globalProperties.$pinia
      pinia.state.value.preferences.textDirection = 'rtl'
    })
    await page.waitForTimeout(300)
    const geo = await page.evaluate(() => {
      const r = document.querySelector('#ag-editor-id')!.getBoundingClientRect()
      const s = document.querySelector('#ag-editor-id')!.parentElement!.getBoundingClientRect()
      return { left: r.left - s.left, right: s.right - r.right, dir: getComputedStyle(document.querySelector('#ag-editor-id')!).direction }
    })
    expect(geo.dir).toBe('rtl')
    expect(geo.left).toBeGreaterThanOrEqual(-1)
    expect(geo.right).toBeGreaterThanOrEqual(-1)
  })
})
