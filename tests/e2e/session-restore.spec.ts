// FILE: tests/e2e/session-restore.spec.ts
// VERSION: 1.2.0
// START_MODULE_CONTRACT
//   PURPOSE: Pin the C-69 cold-launch session restore in the built renderer — with a saved session (folder + tabs + active tab) a launch without files reopens the folder in the sidebar, the tabs in order through mt_open_file and selects the saved active tab; open/close changes are autosaved into the prefs and survive a reload; a launch with files does not restore.
//   SCOPE: Session restore/autosave and active-tab close DOM/store/edit isolation over the Tauri shim; no native dialogs or real user files.
//   DEPENDS: @playwright/test, ./fixtures/tauri-shim, the built renderer served by `npm run preview`.
//   LINKS: .grace/changes/active/C-69 R-1/R-2/R-5; unit twin tests/renderer/store/session-restore.test.js.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   ROOT - the fake project folder of the saved session.
//   installSessionShim - per-test fake prefs, filesystem and open-file round trip with optional synthetic document bodies.
//   boot - loads the editor and emits mt::bootstrap-editor (addBlankTab = cold launch without files).
//   tabNames - the tab bar file names in order plus the active one.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.2.0 - C-TAB-CLOSE-OWNERSHIP: structured-document close-to-previous/next and edit isolation in both engines.
//   PREV: v1.1.0 - 2026-10-19: triage stale content after active-tab close; pin remaining DOM/store content and edit ownership in both browser engines.
//   PREV: v1.0.0 - 2026-10-19 C-69: new — fails without the boot restore (welcome screen instead of the tabs), without the active-tab step, and when the autosave does not persist a closed tab.
// END_CHANGE_SUMMARY

import { test, expect, Page } from '@playwright/test'
import { installTauriShim } from './fixtures/tauri-shim'

const ROOT = '/tmp/mark-e2e-session'

async function installSessionShim(page: Page, seed: Record<string, unknown>, documents: Record<string, string> = {}) {
  await page.addInitScript(({ root, seedPrefs, documents }) => {
    const KEY = '__e2eSessionPrefs'
    if (!sessionStorage.getItem(KEY)) sessionStorage.setItem(KEY, JSON.stringify(seedPrefs))
    const read = () => JSON.parse(sessionStorage.getItem(KEY) || '{}')
    ;(window as any).__sessionPrefs = read
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
      mt_fs_stat: ({ path }: { path: string }) => ({
        isFile: path.endsWith('.md') && !path.includes('gone'),
        isDirectory: path === root,
        size: 10,
        mode: 0,
        mtimeMs: Date.now(),
        isSymbolicLink: false
      }),
      mt_walk_project: () => null,
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
  }, { root: ROOT, seedPrefs: seed, documents })
}

async function boot(page: Page, { addBlankTab = true } = {}) {
  await page.goto('/?type=editor&wid=0&udp=/tmp/mark-e2e&debug=0')
  await page.waitForFunction(() => {
    const ls = (window as any).__shimListeners
    if (!ls) return false
    for (const m of ls.values()) if (m.event === 'mt::bootstrap-editor') return true
    return false
  }, undefined, { timeout: 15_000 })
  await page.evaluate((blank) => {
    ;(window as any).__emitFakeEvent('mt::bootstrap-editor', {
      addBlankTab: blank,
      markdownList: blank ? [] : [''],
      lineEnding: 'lf',
      sideBarVisibility: true,
      tabBarVisibility: true,
      sourceCodeModeEnabled: false
    })
  }, addBlankTab)
}

const tabNames = (page: Page) => page.evaluate(() => {
  const items = Array.from(document.querySelectorAll('.tabs-container li'))
  return {
    names: items.map((li) => (li.querySelector('.name, .filename, span') as HTMLElement | null)?.textContent?.trim() || li.textContent!.trim()),
    active: (document.querySelector('.tabs-container li.active') as HTMLElement | null)?.textContent?.trim() || ''
  }
})

test.describe('session restore (C-69)', () => {
  test.beforeEach(async ({ page }) => {
    await installTauriShim(page)
  })

  test('a cold launch reopens the folder, the tabs in order and the active tab; missing files are skipped', async ({ page }) => {
    await installSessionShim(page, {
      lastSessionFolders: [ROOT],
      lastSessionTabs: [`${ROOT}/alpha.md`, `${ROOT}/gone.md`, `${ROOT}/beta.md`],
      lastSessionActive: `${ROOT}/alpha.md`
    })
    await boot(page)

    await expect.poll(async () => (await tabNames(page)).names.length, { timeout: 10_000 }).toBe(2)
    const tabs = await tabNames(page)
    expect(tabs.names[0]).toContain('alpha.md')
    expect(tabs.names[1]).toContain('beta.md')
    expect(tabs.active).toContain('alpha.md')
    // The folder is back in the sidebar project tree.
    const roots = await page.evaluate(() => {
      const el = document.querySelector('#app') as any
      const state = el?.__vue_app__?.config?.globalProperties?.$pinia?.state?.value
      return (state?.project?.projectTrees || []).map((r: any) => r.pathname)
    })
    expect(roots).toEqual([ROOT])
    // No welcome screen over the restored tabs.
    await expect(page.locator('.recent-files-projects, .welcome')).toHaveCount(0)
  })

  test('closing a tab is autosaved: a relaunch brings back only the remaining one', async ({ page }) => {
    await installSessionShim(page, {
      lastSessionTabs: [`${ROOT}/alpha.md`, `${ROOT}/beta.md`],
      lastSessionActive: `${ROOT}/beta.md`
    })
    await boot(page)
    await expect.poll(async () => (await tabNames(page)).names.length, { timeout: 10_000 }).toBe(2)
    expect((await tabNames(page)).active).toContain('beta.md')
    await expect(page.locator('#ag-editor-id')).toContainText('beta.md')

    await page.locator('.tabs-container li.active .close-icon').first().click()
    await expect(page.locator('.tabs-container li.active')).toContainText('alpha.md')
    await expect(page.locator('#ag-editor-id')).toContainText('alpha.md')
    await expect(page.locator('#ag-editor-id')).not.toContainText('beta.md')
    await expect.poll(async () =>
      (await page.evaluate(() => (window as any).__sessionPrefs().lastSessionTabs))
    , { timeout: 5_000 }).toEqual([`${ROOT}/alpha.md`])

    await boot(page)
    await expect.poll(async () => (await tabNames(page)).names.length, { timeout: 10_000 }).toBe(1)
    expect((await tabNames(page)).names[0]).toContain('alpha.md')
  })

  test('after closing the active tab, typing belongs only to the remaining document', async ({ page }) => {
    await installSessionShim(page, {
      lastSessionTabs: [`${ROOT}/alpha.md`, `${ROOT}/beta.md`],
      lastSessionActive: `${ROOT}/beta.md`
    })
    await boot(page)
    await expect(page.locator('#ag-editor-id')).toContainText('beta.md')
    await page.locator('.tabs-container li.active .close-icon').first().click()
    await expect(page.locator('#ag-editor-id')).toContainText('alpha.md')
    await expect(page.locator('#ag-editor-id')).not.toContainText('beta.md')
    await page.locator('#ag-editor-id h1').click()
    await page.keyboard.press('End')
    await page.keyboard.type(' retained edit')
    await expect.poll(() => page.evaluate(() => {
      const editor = (document.querySelector('#app') as any).__vue_app__.config.globalProperties.$pinia.state.value.editor
      return { pathname: editor.currentFile.pathname, markdown: editor.currentFile.markdown, paths: editor.tabs.map((tab: any) => tab.pathname) }
    })).toEqual({ pathname: `${ROOT}/alpha.md`, markdown: '# alpha.md retained edit\n', paths: [`${ROOT}/alpha.md`] })
  })

  // START_BLOCK_STRUCTURED_DOCUMENT_CLOSE
  test('closing a structured report restores the previous draft and keeps its edits isolated', async ({ page }) => {
    const alpha = `${ROOT}/alpha.md`
    const beta = `${ROOT}/beta.md`
    const gamma = `${ROOT}/gamma.md`
    await installSessionShim(page, {
      lastSessionTabs: [alpha, beta, gamma], lastSessionActive: gamma
    }, {
      [alpha]: '# Alpha reference\n\nUnchanged reference body.\n',
      [beta]: '---\ntitle: Synthetic draft\nstatus: draft\n---\n\n# Beta draft\n\nDraft body ready for editing.\n',
      [gamma]: '# Gamma report\n\n' + Array.from({ length: 12 }, (_, i) =>
        `## Section ${i + 1}\n\n| Item | State |\n| --- | --- |\n| Record ${i + 1} | Synthetic |\n\n- First finding\n- Second finding\n\n`
      ).join('')
    })
    await boot(page)
    await expect(page.locator('#ag-editor-id')).toContainText('Gamma report')
    await page.locator('.editor-component').evaluate((el) => { el.scrollTop = 600 })
    await page.locator('.tabs-container li.active .close-icon').click()
    await expect(page.locator('.tabs-container li.active')).toContainText('beta.md')
    await expect(page.locator('#ag-editor-id')).toContainText('Beta draft')
    await expect(page.locator('#ag-editor-id')).not.toContainText('Gamma report')
    await page.locator('#ag-editor-id h1').click()
    await page.keyboard.press('End')
    await page.keyboard.type(' retained edit')
    await expect.poll(() => page.evaluate(() => {
      const state = (document.querySelector('#app') as any).__vue_app__.config.globalProperties.$pinia.state.value.editor
      return { active: state.currentFile.filename, bodies: state.tabs.map((tab: any) => [tab.filename, tab.markdown]) }
    })).toEqual({ active: 'beta.md', bodies: [
      ['alpha.md', '# Alpha reference\n\nUnchanged reference body.\n'],
      ['beta.md', '---\ntitle: Synthetic draft\nstatus: draft\n---\n\n# Beta draft retained edit\n\nDraft body ready for editing.\n']
    ] })
  })

  test('closing the middle active tab renders its next neighbor through repeated switches', async ({ page }) => {
    await installSessionShim(page, {
      lastSessionTabs: [`${ROOT}/alpha.md`, `${ROOT}/beta.md`, `${ROOT}/gamma.md`],
      lastSessionActive: `${ROOT}/beta.md`
    })
    await boot(page)
    await expect(page.locator('.tabs-container li.active')).toContainText('beta.md')
    await page.locator('.tabs-container li.active .close-icon').click()
    await expect(page.locator('#ag-editor-id')).toContainText('gamma.md')
    for (const name of ['alpha.md', 'gamma.md', 'alpha.md', 'gamma.md']) {
      await page.locator('.tabs-container li').filter({ hasText: name }).click()
      await expect(page.locator('#ag-editor-id')).toContainText(name)
      await expect(page.locator('#ag-editor-id')).not.toContainText('beta.md')
    }
  })
  // END_BLOCK_STRUCTURED_DOCUMENT_CLOSE

  test('a launch with files does not restore the session', async ({ page }) => {
    await installSessionShim(page, { lastSessionTabs: [`${ROOT}/alpha.md`] })
    await boot(page, { addBlankTab: false })
    await page.waitForTimeout(800)
    const tabs = await tabNames(page)
    expect(tabs.names.some((n) => n.includes('alpha.md'))).toBe(false)
  })
})
