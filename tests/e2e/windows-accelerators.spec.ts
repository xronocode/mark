/**
 * windows-accelerators.spec.ts — C-WINDOWS-MENU-ACCELERATORS T-004.
 *
 * The window-level menu-accelerator dispatcher through REAL key presses:
 * on the win/linux path (force seam set) the audited chords dispatch the
 * shipped registry commands — Ctrl+Alt+S turns source mode on and renders
 * the mode chip, Ctrl+S fires the save command on a dirty doc, Ctrl+W
 * closes the focused tab — while the darwin gate keeps the dispatcher
 * silent when the seam is absent (mac builds bake platform darwin via
 * the vite define; the adaptive case covers non-darwin build hosts).
 */

// FILE: tests/e2e/windows-accelerators.spec.ts
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: C-WINDOWS-MENU-ACCELERATORS e2e — real-keyboard proof that
//            the rescue dispatcher maps chords to the shipped commands
//            and that the darwin gate stays off without the test seam.
//   SCOPE: Forced-on dispatcher (chord → command → store/DOM outcomes),
//          adaptive darwin-silence case, marker-based dispatch proof.
//   DEPENDS: Playwright, renderer-only Tauri shim, editor boot helpers.
//   LINKS: .grace/graph/runtime.xml M-070; .grace/verification/runtime.xml
//          V-M-070; docs/release-trains/2.9.x-next.md.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
// START_MODULE_MAP
//   DOC - fixture document shared by the cases.
//   FIRED - console matcher for the dispatcher's BLOCK_ACCELERATOR_FIRED marker.
//   firedMarkers - per-page collector of fired-chord markers.
//   editorState - pinia projection (tabs, sourceCode, splitView).
// END_MODULE_MAP
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - 2026-11-01 C-WINDOWS-MENU-ACCELERATORS: initial spec.
// END_CHANGE_SUMMARY

import { test, expect, type Page } from '@playwright/test'
import { installTauriShim } from './fixtures/tauri-shim'
import { bootEditor, openFileTab } from './fixtures/helpers'

const DOC = '# Accelerators\n\nFirst paragraph.\n\nSecond paragraph.\n'
const FIRED = /BLOCK_ACCELERATOR_FIRED chord=([^\s]+) cmd=([^\]\s]+)/

const firedMarkers = (page: Page): string[] => {
  const markers: string[] = []
  page.on('console', (msg) => {
    const m = msg.text().match(FIRED)
    if (m) markers.push(`${m[1]}→${m[2]}`)
  })
  return markers
}

const editorState = async (page: Page): Promise<any> =>
  page.evaluate(() => {
    const el = document.querySelector('#app') as any
    const state = el?.__vue_app__?.config?.globalProperties?.$pinia?.state?.value
    const tab = state?.editor?.currentFile ?? {}
    return {
      tabs: (state?.editor?.tabs ?? []).length,
      sourceCode: !!state?.preferences?.sourceCode,
      splitView: !!tab.splitView
    }
  })

test.describe('window menu accelerators (C-WINDOWS-MENU-ACCELERATORS)', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await installTauriShim(page)
    // The preview build bakes the build host's platform (darwin on the
    // reference host); the explicit seam forces the win/linux dispatcher.
    await page.addInitScript(() => {
      ;(window as any).__FORCE_WINDOW_ACCELERATORS = true
    })
  })

  test('1. Ctrl+Alt+S engages source mode and renders the mode chip', async ({ page }) => {
    await bootEditor(page)
    await openFileTab(page, '/tmp/wacc/source.md', DOC)
    await expect(page.locator('.ag-paragraph').first()).toBeVisible()

    const markers = firedMarkers(page)
    await page.keyboard.press('Control+Alt+s')
    await expect
      .poll(async () => (await editorState(page)).sourceCode, { timeout: 5000 })
      .toBe(true)
    await expect(page.locator('[data-testid="mode-chips"] button')).toHaveCount(1)
    expect(markers).toContain('Ctrl+Alt+S→view.source-code-mode')
  })

  test('2. Ctrl+S dispatches the save command on a dirty document', async ({ page }) => {
    await bootEditor(page)
    await openFileTab(page, '/tmp/wacc/save.md', DOC)
    await expect(page.locator('.ag-paragraph').first()).toBeVisible()

    const markers = firedMarkers(page)
    await page.locator('#ag-editor-id span.ag-paragraph').first().click()
    await page.keyboard.type('more text ')
    await page.keyboard.press('Control+s')
    await page.waitForTimeout(600)
    expect(markers).toContain('Ctrl+S→file.save')
  })

  test('3. Ctrl+W closes the focused tab', async ({ page }) => {
    await bootEditor(page)
    await openFileTab(page, '/tmp/wacc/close.md', DOC)
    await expect(page.locator('.ag-paragraph').first()).toBeVisible()
    expect((await editorState(page)).tabs).toBe(1)

    await page.keyboard.press('Control+w')
    await expect
      .poll(async () => (await editorState(page)).tabs, { timeout: 5000 })
      .toBe(0)
  })

  test('4. darwin gate: without the seam the dispatcher stays off on darwin builds', async ({ page }) => {
    await page.addInitScript(() => {
      delete (window as any).__FORCE_WINDOW_ACCELERATORS
    })
    await bootEditor(page)
    await openFileTab(page, '/tmp/wacc/silence.md', DOC)
    await expect(page.locator('.ag-paragraph').first()).toBeVisible()

    const platform = await page.evaluate(
      () => (window as any).electron?.process?.platform as string
    )
    test.skip(platform !== 'darwin', 'build host baked a non-darwin platform; silence case is darwin-only')

    const markers = firedMarkers(page)
    await page.keyboard.press('Control+Alt+s')
    await page.waitForTimeout(600)
    expect((await editorState(page)).sourceCode).toBe(false)
    expect(markers).toEqual([])
  })
})
