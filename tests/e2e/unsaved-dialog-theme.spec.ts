// FILE: tests/e2e/unsaved-dialog-theme.spec.ts
// VERSION: 2.1.0
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
//   LAST_CHANGE: v2.1.0 - 2026-11-25 C-EDITOR-A11Y-CSS: computed
//   chrome-font pins for the two imperative dialogs — the unsaved
//   confirmation through the CLOSE_UNSAVED_TAB funnel (light and dark
//   boot) and the workspace mode dialog through the real chooser flow.
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

async function resolveVar(page: Page, cssVar: string, kind: 'bg' | 'color' | 'font'): Promise<string> {
  return page.evaluate(({ v, k }: { v: string; k: 'bg' | 'color' | 'font' }) => {
    const el = document.createElement('div')
    el.style.cssText = `${k === 'bg' ? 'background' : k === 'font' ? 'font-family' : 'color'}: var(${v}); position: absolute; visibility: hidden;`
    document.body.appendChild(el)
    const cs = window.getComputedStyle(el)
    const value = k === 'bg' ? cs.backgroundColor : k === 'font' ? cs.fontFamily : cs.color
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

// C-EDITOR-A11Y-CSS: the two body-teleported imperative dialogs render
// in the chrome system font — computed-style proof, the resolveVar
// pattern (the pre-change computed value is the WKWebView default
// family, never the -apple-system stack).
test.describe('imperative dialog chrome font (C-EDITOR-A11Y-CSS)', () => {
  for (const theme of ['paper', 'ink']) {
    test(`the confirmation renders in the chrome system font in ${theme}`, async ({ page }) => {
      await installTauriShim(page)
      await page.addInitScript(({ theme }) => {
        ;(window as any).__mockInvoke = {
          ...(window as any).__mockInvoke,
          mt_prefs_get_all: () => ({
            theme,
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
      }, { theme })

      await bootEditor(page)
      await openFileTab(page, '/tmp/unsaved-font.md', '# Title\n\ncontent\n')
      await expect(page.locator('.editor-with-tabs h1').first()).toBeVisible({ timeout: 5_000 })
      if (theme === 'ink') await expect(page.locator('body')).toHaveClass(/dark/)
      else await expect(page.locator('body')).not.toHaveClass(/dark/)

      // The same real CLOSE_UNSAVED_TAB funnel as the dark-surface pin.
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
      const [dialogFamily, chromeFamily] = await Promise.all([
        page.evaluate(() => getComputedStyle(document.querySelector('.ag-unsaved-close-dialog') as HTMLElement).fontFamily),
        resolveVar(page, '--chromeFontFamily', 'font')
      ])
      expect(dialogFamily).toBe(chromeFamily)
      expect(dialogFamily).toContain('-apple-system')
    })
  }

  test('the workspace mode dialog renders in the chrome system font', async ({ page }) => {
    // The real chooser flow (the multi-root-workspace canon): one root
    // restored, then an ambiguous folder pick parks pendingFolderChoice
    // and the app-level WorkspaceModeDialog teleports to body.
    const ALPHA = '/tmp/mark-e2e-msw/alpha'
    const BETA = '/tmp/mark-e2e-msw/beta'
    await installTauriShim(page)
    await page.addInitScript(({ alpha, beta }) => {
      const KEY = '__e2eMswPrefs'
      sessionStorage.setItem(KEY, JSON.stringify({
        lastSessionFolders: [alpha],
        lastSessionTabs: [`${alpha}/a.md`],
        lastSessionActive: `${alpha}/a.md`
      }))
      const read = () => JSON.parse(sessionStorage.getItem(KEY) || '{}')
      ;(window as any).__mockInvoke = {
        ...(window as any).__mockInvoke,
        mt_prefs_get: ({ key }: { key: string }) => {
          const v = read()[key]
          return v === undefined ? null : v
        },
        mt_prefs_set: () => null,
        mt_fs_stat: ({ path }: { path: string }) => ({
          isFile: path.endsWith('.md'),
          isDirectory: path === alpha || path === beta,
          size: 10,
          mode: 0,
          mtimeMs: Date.now(),
          isSymbolicLink: false
        }),
        mt_walk_project: () => null,
        mt_pick_folder: () => (window as any).__mswPickFolderResult ?? null,
        mt_close_project_root: () => null
      }
    }, { alpha: ALPHA, beta: BETA })

    await page.goto('/?type=editor&wid=0&udp=/tmp/mark-e2e&debug=0&sideBarVisibility=1')
    await page.waitForFunction(() => {
      const ls = (window as any).__shimListeners
      if (!ls) return false
      for (const m of ls.values()) if (m.event === 'mt::bootstrap-editor') return true
      return false
    }, undefined, { timeout: 15_000 })
    await page.evaluate(() => {
      ;(window as any).__emitFakeEvent('mt::bootstrap-editor', {
        addBlankTab: true, markdownList: [], isUtf8BomEncoded: false, lineEnding: 'lf'
      })
    })
    await expect.poll(async () => page.evaluate(() => {
      const pinia = (document.querySelector('#app') as any).__vue_app__
        .config.globalProperties.$pinia
      return ((pinia._s.get('project').projectTrees || []) as Array<{ pathname: string }>).map((r) => r.pathname)
    }), { timeout: 10_000 }).toEqual([ALPHA])

    // The folder-switcher pick is an ambiguous input with a root open:
    // the chooser appears with Add as the safe default.
    await page.evaluate((beta) => {
      ;(window as any).__mswPickFolderResult = beta
    }, BETA)
    await page.locator('.project-tree .switcher-chevron').first().click()
    await expect(page.locator('.workspace-mode-overlay')).toBeVisible({ timeout: 5_000 })

    const [dialogFamily, chromeFamily] = await Promise.all([
      page.evaluate(() => getComputedStyle(document.querySelector('.workspace-mode-dialog') as HTMLElement).fontFamily),
      resolveVar(page, '--chromeFontFamily', 'font')
    ])
    expect(dialogFamily).toBe(chromeFamily)
    expect(dialogFamily).toContain('-apple-system')
  })
})
