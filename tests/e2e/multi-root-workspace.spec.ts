// FILE: tests/e2e/multi-root-workspace.spec.ts
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Pin the C-MULTI-SOURCE-WORKSPACE two-root runtime behavior in the built renderer — two restored roots render as independent sidebar sections; the shared Add-or-Replace chooser appears for an ambiguous open with roots present and its Add default appends; Replace with a dirty tab under a removed root prompts and Cancel leaves state untouched; an unavailable root at restore degrades visibly without blocking the rest.
//   SCOPE: Multi-root workspace routing over the Tauri shim — store state, sidebar tree sections, the workspaceModeDialog DOM and the notification surface; no native dialogs or real user files (mt_pick_folder is mocked; iCloud roots are represented by synthetic paths with a `Mobile Documents` segment).
//   DEPENDS: @playwright/test, ./fixtures/tauri-shim, ./fixtures/helpers, the built renderer served by `npm run preview`.
//   LINKS: .grace/changes/active/C-MULTI-SOURCE-WORKSPACE; unit twins tests/renderer/store/project-workspace.test.ts and tests/renderer/components/sideBar/workspaceModeDialog.test.js; session-restore.spec.ts (restore harness pattern).
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   ALPHA - first synthetic workspace root.
//   BETA - second synthetic workspace root (also the replace target).
//   MISSING - synthetic iCloud root (Mobile Documents segment, fails stat).
//   installMswShim - per-test fake prefs/filesystem/picker/open-file round trip.
//   boot - cold launch (addBlankTab) so the session restore runs.
//   rootNames - the sidebar folder-switcher names in DOM order.
//   projectState - { roots, tabCount, dirty } snapshot from the real project/editor stores.
//   dirtyTheTab - clicks into the editor, types, waits for isSaved=false.
// END_MODULE_MAP
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - 2026-10-22 C-MULTI-SOURCE-WORKSPACE: new spec —
//   the two-root regression the reference review's gate 6 requires
//   (restore order, chooser routing, replace dirty-guard cancel,
//   visible degradation of a missing root).
// END_CHANGE_SUMMARY

import { test, expect, Page } from '@playwright/test'
import { installTauriShim } from './fixtures/tauri-shim'

const ALPHA = '/tmp/mark-e2e-msw/alpha'
const BETA = '/tmp/mark-e2e-msw/beta'
// Synthetic iCloud-style missing root: keeps the Mobile Documents
// segment the degradation path keys on, without any /Users/<name>
// prefix (publication-policy fixture rule).
const MISSING = '/Volumes/e2e-fixture/Mobile Documents/com~apple~CloudDocs/Notes'

async function installMswShim(
  page: Page,
  seed: Record<string, unknown>,
  documents: Record<string, string> = {}
) {
  await page.addInitScript(({ alpha, beta, missing, seedPrefs, documents }) => {
    const KEY = '__e2eMswPrefs'
    if (!sessionStorage.getItem(KEY)) sessionStorage.setItem(KEY, JSON.stringify(seedPrefs))
    const read = () => JSON.parse(sessionStorage.getItem(KEY) || '{}')
    ;(window as any).__mockInvoke = {
      ...(window as any).__mockInvoke,
      mt_prefs_get: ({ key }: { key: string }) => {
        const v = read()[key]
        return v === undefined ? null : v
      },
      mt_prefs_set: ({ key, value }: { key: string; value: unknown }) => {
        const all = read(); all[key] = value
        sessionStorage.setItem(KEY, JSON.stringify(all))
        return null
      },
      mt_fs_stat: ({ path }: { path: string }) => {
        if (path === missing) throw new Error('ENOENT')
        return {
          isFile: path.endsWith('.md'),
          isDirectory: path === alpha || path === beta,
          size: 10,
          mode: 0,
          mtimeMs: Date.now(),
          isSymbolicLink: false
        }
      },
      mt_walk_project: () => null,
      mt_pick_folder: () => (window as any).__mswPickFolderResult ?? null,
      mt_close_project_root: () => null,
      mt_open_file: (args: any) => {
        const p = Array.isArray(args?.args) ? args.args[0] : args?.pathname
        ;(window as any).__emitFakeEvent('mt::open-new-tab', {
          pathname: p,
          filename: p.split('/').pop(),
          markdown: documents[p] ?? `# ${p.split('/').pop()}\n`,
          isUtf8BomEncoded: false,
          lineEnding: 'lf',
          adjustLineEndingOnSave: false
        })
        return null
      }
    }
  }, { alpha: ALPHA, beta: BETA, missing: MISSING, seedPrefs: seed, documents })
}

async function boot(page: Page, { sideBar = true } = {}) {
  await page.goto(`/?type=editor&wid=0&udp=/tmp/mark-e2e&debug=0${sideBar ? '&sideBarVisibility=1' : ''}`)
  await page.waitForFunction(() => {
    const ls = (window as any).__shimListeners
    if (!ls) return false
    for (const m of ls.values()) if (m.event === 'mt::bootstrap-editor') return true
    return false
  }, undefined, { timeout: 15_000 })
  await page.evaluate(() => {
    ;(window as any).__emitFakeEvent('mt::bootstrap-editor', {
      addBlankTab: true,
      markdownList: [],
      isUtf8BomEncoded: false,
      lineEnding: 'lf'
    })
  })
}

async function rootNames(page: Page): Promise<string[]> {
  return page.locator('.project-tree > .title.folder-switcher > span.default-cursor').allTextContents()
}

async function projectState(page: Page) {
  return page.evaluate(() => {
    const pinia = (document.querySelector('#app') as any).__vue_app__
      .config.globalProperties.$pinia
    const project = pinia._s.get('project')
    const editor = pinia._s.get('editor')
    return {
      roots: (project.projectTrees || []).map((r: any) => r.pathname),
      tabCount: editor.tabs.length,
      dirty: editor.tabs.map((t: any) => !t.isSaved)
    }
  })
}

async function dirtyTheTab(page: Page) {
  const paragraph = page.locator('#ag-editor-id span.ag-paragraph').last()
  await paragraph.click()
  await page.keyboard.type('unsaved edit')
  await page.waitForFunction(() => {
    const store = (document.querySelector('#app') as any).__vue_app__
      .config.globalProperties.$pinia._s.get('editor')
    return store.tabs.length > 0 && !store.tabs[0].isSaved
  }, undefined, { timeout: 5_000 })
}

test.describe('multi-root workspace (C-MULTI-SOURCE-WORKSPACE)', () => {
  test.beforeEach(async ({ page }) => {
    await installTauriShim(page)
  })

  test('two restored roots render as independent sections; a missing iCloud root degrades visibly', async ({ page }) => {
    await installMswShim(page, {
      lastSessionFolders: [ALPHA, MISSING, BETA],
      lastSessionTabs: [`${ALPHA}/a.md`],
      lastSessionActive: `${ALPHA}/a.md`
    })
    await boot(page)

    // Both available roots restored IN ORDER as independent sections;
    // the missing iCloud root did not block them.
    await expect
      .poll(() => rootNames(page), { timeout: 10_000 })
      .toEqual(['alpha', 'beta'])
    const state = await projectState(page)
    expect(state.roots).toEqual([ALPHA, BETA])
    expect(state.tabCount).toBe(1)

    // The missing root degraded visibly.
    await expect(page.locator('.mt-notification')).toBeVisible({ timeout: 5_000 })
  })

  test('the shared chooser appears for an ambiguous open and Add appends a second root', async ({ page }) => {
    await installMswShim(page, {
      lastSessionFolders: [ALPHA],
      lastSessionTabs: [`${ALPHA}/a.md`],
      lastSessionActive: `${ALPHA}/a.md`
    })
    await boot(page)
    await expect.poll(() => rootNames(page), { timeout: 10_000 }).toEqual(['alpha'])

    // The folder-switcher pick is an ambiguous input with a root open:
    // the chooser appears with Add as the safe default.
    await page.evaluate((beta) => {
      ;(window as any).__mswPickFolderResult = beta
    }, BETA)
    await page.locator('.project-tree .switcher-chevron').first().click()
    await expect(page.locator('.workspace-mode-overlay')).toBeVisible({ timeout: 5_000 })
    const buttons = page.locator('.workspace-mode-btn')
    await expect(buttons).toHaveCount(3)

    await page.locator('.workspace-mode-default').click()

    await expect.poll(() => rootNames(page), { timeout: 10_000 }).toEqual(['alpha', 'beta'])
    const state = await projectState(page)
    expect(state.roots).toEqual([ALPHA, BETA])
  })

  test('replace with a dirty tab under a removed root prompts, and Cancel leaves state untouched', async ({ page }) => {
    await installMswShim(page, {
      lastSessionFolders: [ALPHA, BETA],
      lastSessionTabs: [`${ALPHA}/a.md`],
      lastSessionActive: `${ALPHA}/a.md`
    })
    await boot(page)
    await expect.poll(() => rootNames(page), { timeout: 10_000 }).toEqual(['alpha', 'beta'])

    // A dirty tab under ALPHA.
    await dirtyTheTab(page)
    let state = await projectState(page)
    expect(state.dirty).toEqual([true])

    // Ambiguous pick → chooser → Replace: the dirty tab under the removed
    // root must prompt before anything closes.
    await page.evaluate((beta) => {
      ;(window as any).__mswPickFolderResult = beta
    }, BETA)
    await page.locator('.project-tree .switcher-chevron').first().click()
    await expect(page.locator('.workspace-mode-overlay')).toBeVisible({ timeout: 5_000 })
    await page.locator('.workspace-mode-destructive').click()

    // The replace-confirm mode of the same dialog (default: Save & Close).
    await expect(page.locator('.workspace-mode-overlay')).toBeVisible({ timeout: 5_000 })
    await page.locator('.workspace-mode-cancel').click()

    // Cancel = zero mutations: both roots, the tab and its dirty flag.
    state = await projectState(page)
    expect(state.roots).toEqual([ALPHA, BETA])
    expect(state.tabCount).toBe(1)
    expect(state.dirty).toEqual([true])
    await expect(page.locator('.workspace-mode-overlay')).toBeHidden()
  })
})
