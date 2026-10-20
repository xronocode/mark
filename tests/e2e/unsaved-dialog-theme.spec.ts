// FILE: tests/e2e/unsaved-dialog-theme.spec.ts
// VERSION: 2.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Verify the FIX-007 themed unsaved-changes confirmation — the teleported dialog follows the active dark theme instead of staying white; FIX-011 keeps the coverage on the new three-action unsavedCloseDialog surface with default/destructive styling asserted against the theme tokens.
//   SCOPE: Dark-theme boot, dirty-tab close flow through the real store funnel (CLOSE_UNSAVED_TAB → askUnsavedClose), computed surface/title/action colours against the app theme tokens.
//   DEPENDS: Playwright, renderer-only Tauri shim (theme: ink), editor boot helpers.
//   LINKS: .grace/graph/runtime.xml M-011; .grace/verification/runtime.xml V-M-011; docs/release-trains/2.5.x-next.md FIX-007, FIX-011; components/editorWithTabs/unsavedCloseDialog.js.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
// START_MODULE_MAP
//   resolveVar - Resolves a CSS variable through a hidden probe element the way the browser resolves it.
// END_MODULE_MAP
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v2.0.0 - 2026-10-20 FIX-011
//   (C-FIX-011-UNTITLED-CLOSE-ACTIONS): the dialog surface moved from
//   ElMessageBox to the three-action unsavedCloseDialog; the dark-theme
//   assertions now cover the dialog box, title and the default/destructive
//   action colours (Save & Close = theme accent, Discard = delete color).
//   PREV: v1.0.0 - 2026-10-20 FIX-007: the dark-theme unsaved dialog matches the float background token and the theme text colour.
// END_CHANGE_SUMMARY

import { test, expect, type Page } from '@playwright/test'
import { installTauriShim } from './fixtures/tauri-shim'
import { bootEditor, openFileTab } from './fixtures/helpers'

async function resolveVar(page: Page, cssVar: string, kind: 'bg' | 'color'): Promise<string> {
  return page.evaluate(({ v, k }: { v: string; k: 'bg' | 'color' }) => {
    const el = document.createElement('div')
    el.style.cssText = `${k === 'bg' ? 'background' : 'color'}: var(${v}); position: absolute; visibility: hidden;`
    document.body.appendChild(el)
    const cs = window.getComputedStyle(el)
    const value = k === 'bg' ? cs.backgroundColor : cs.color
    el.remove()
    return value
  }, { v: cssVar, k: kind })
}

test.describe('unsaved-changes dialog theme (FIX-007)', () => {
  test('the confirmation uses the dark theme surface in dark mode', async ({ page }) => {
    await installTauriShim(page)
    await page.addInitScript(() => {
      ;(window as any).__mockInvoke = {
        ...(window as any).__mockInvoke,
        mt_prefs_get_all: () => ({
          theme: 'ink',
          autoSave: false,
          autoSaveDelay: 5000,
          titleBarStyle: 'custom',
          sideBarVisibility: false,
          tabBarVisibility: false,
          sourceCodeModeEnabled: false,
          spellcheckerEnabled: false,
          spellcheckerLanguage: 'en-US',
          language: 'en',
          endOfLine: 'default',
          followSystemTheme: false,
          lightModeTheme: 'paper',
          darkModeTheme: 'ink'
        }),
        mt_prefs_set: () => null
      }
    })

    await bootEditor(page)
    await openFileTab(page, '/tmp/unsaved-dark.md', '# Title\n\ncontent\n')
    await expect(page.locator('.editor-with-tabs h1').first()).toBeVisible({ timeout: 5_000 })

    // Dirty the tab, then close through the real store funnel — the
    // CLOSE_UNSAVED_TAB branch renders the three-action dialog.
    const paragraph = page.locator('#ag-editor-id span.ag-paragraph').last()
    await paragraph.click()
    await page.keyboard.type('x')
    await page.waitForTimeout(400)
    await page.evaluate(() => {
      const app = document.querySelector('#app') as any
      app.__vue_app__.config.globalProperties.$pinia._s.get('editor').CLOSE_TAB()
    })

    const box = page.locator('.ag-unsaved-close-dialog')
    await expect(box).toBeVisible({ timeout: 5_000 })

    const [boxBg, floatBg, titleColor, editorColor, saveColor, themeColor, discardColor, deleteColor] = await Promise.all([
      page.evaluate(() => getComputedStyle(document.querySelector('.ag-unsaved-close-dialog') as HTMLElement).backgroundColor),
      resolveVar(page, '--floatBgColor', 'bg'),
      page.evaluate(() => getComputedStyle(document.querySelector('.ag-unsaved-close-title') as HTMLElement).color),
      resolveVar(page, '--editorColor', 'color'),
      page.evaluate(() => getComputedStyle(document.querySelector('.ag-unsaved-close-save') as HTMLElement).color),
      resolveVar(page, '--themeColor', 'color'),
      page.evaluate(() => getComputedStyle(document.querySelector('.ag-unsaved-close-discard') as HTMLElement).color),
      resolveVar(page, '--deleteColor', 'color')
    ])
    expect(boxBg).toBe(floatBg)
    expect(boxBg).not.toBe('rgb(255, 255, 255)')
    expect(titleColor).toBe(editorColor)
    // FIX-011: styling is asserted, not inferred from button order.
    expect(saveColor).toBe(themeColor)
    expect(discardColor).toBe(deleteColor)
    expect(discardColor).not.toBe(saveColor)
  })
})
