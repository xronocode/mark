// FILE: tests/e2e/sidebar-tree-redesign.spec.ts
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: C-51 T-001/T-002 e2e — the redesigned sidebar tree (Markdown-only filter with the show-all toggle and folder reveal on create, guide lines, chevrons, folder switcher, current-file pill) and the Recent/Pinned sections (pin via the tree context menu, persistence across reload, missing-file Remove, drag reorder), plus light/dark screenshots.
//   SCOPE: renderer-only e2e against vite preview + tauri-shim (no real Tauri IPC); runs in chromium and webkit (playwright project webkit-tree).
//   DEPENDS: @playwright/test, tests/e2e/fixtures/tauri-shim, tests/e2e/fixtures/helpers (bootEditor, openFileTab).
//   LINKS: .grace/changes/active/C-51 T-001/T-002; .grace/verification/runtime.xml V-M-011.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   bootTree - install the shim with the tree/recent/prefs mocks, boot the editor with the sidebar open and inject the project root + walk events.
//   injectRoot - push the project root into the project store (pre-walk, as mt_walk_project's caller does).
//   emitAdd/emitAddDir/emitUnlink - mt::update-object-tree event helpers.
//   setTreeShowAllFiles - flip the preference through the live pinia state.
//   Change - test fixture / helper.
//   DOC - test fixture / helper.
//   ROOT - test fixture / helper.
//   TreeMocks - test fixture / helper.
//   baseState - test fixture / helper.
//   emit - test fixture / helper.
//   emitAdd - test fixture / helper.
//   emitAddDir - test fixture / helper.
//   emitUnlink - test fixture / helper.
//   injectWalk - test fixture / helper.
//   installTreeMocks - test fixture / helper.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - 2026-10-16 C-51 T-001/T-002: initial spec.
// END_CHANGE_SUMMARY

import { test, expect, type Page } from '@playwright/test'
import { installTauriShim } from './fixtures/tauri-shim'
import { bootEditor, openFileTab } from './fixtures/helpers'

const ROOT = '/tmp/mark-e2e'
const DOC = '# Notes\n\nhello tree\n'

interface TreeMocks {
  recentList: string[]
  pinnedList: string[]
  missing: string[]
  pickFolderResult: string | null
  popupContextResult: string | null
}

// Install the page-side mocks. The tree/recent state lives page-side
// (defaults baked by the init script); the PREFS backing store lives in
// the Node test process (exposeFunction survives reloads), so pinned
// persistence across a reload is observable.
async function installTreeMocks(page: Page, state: TreeMocks) {
  await installTauriShim(page)
  const prefs: Record<string, unknown> = {}
  await page.exposeFunction('__prefsSet', (key: string, value: unknown) => {
    prefs[key] = value
    return null
  })
  await page.exposeFunction('__prefsGet', (key: string) => (key in prefs ? prefs[key] : null))
  await page.exposeFunction('__prefsSnapshot', () => prefs)

  await page.addInitScript((s: TreeMocks) => {
    const w = window as any
    w.__treeState = s
    w.__mockInvoke = {
      ...w.__mockInvoke,
      mt_walk_project: () => {},
      mt_watch_subscribe: () => 'fake-sub-id',
      mt_watch_unsubscribe: () => {},
      mt_pick_folder: () => w.__treeState.pickFolderResult,
      mt_recent_list: () => [...w.__treeState.recentList],
      mt_recent_remove: (args: any) => {
        w.__treeState.recentList = w.__treeState.recentList.filter((p: string) => p !== args.path)
        return 0
      },
      // window.electron.ipcRenderer maps 'mt::window-popup-context-menu'
      // → 'mt_window_popup_context_menu' (:: and - become _)
      mt_window_popup_context_menu: () => w.__treeState.popupContextResult,
      mt_prefs_get: (args: any) => (window as any).__prefsGet(args?.key),
      mt_prefs_set: (args: any) => (window as any).__prefsSet(args?.key, args?.value),
      mt_fs_stat: (args: any) => {
        if (w.__treeState.missing.includes(args?.path)) {
          throw new Error('MT_FS_NOT_FOUND: No such file or directory')
        }
        return { isFile: true, isDirectory: false, size: 12, mode: 0, mtimeMs: 1, isSymbolicLink: false }
      }
    }
  }, state)
  return { prefs }
}

async function injectRoot(page: Page) {
  await page.evaluate((root: string) => {
    const el = document.querySelector('#app') as any
    const pinia = el?.__vue_app__?.config?.globalProperties?.$pinia
    pinia.state.value.project.projectTrees.push({
      pathname: root,
      name: root.split('/').pop(),
      isDirectory: true,
      isFile: false,
      isMarkdown: false,
      folders: [],
      files: []
    })
  }, ROOT)
}

type Change = Record<string, unknown>
async function emit(page: Page, type: string, change: Change) {
  await page.evaluate(([t, c]) => {
    ;(window as any).__emitFakeEvent('mt::update-object-tree', { type: t, change: c })
  }, [type, change] as const)
}

const emitAdd = (page: Page, pathname: string, isMarkdown: boolean) =>
  emit(page, 'add', {
    pathname,
    name: pathname.split('/').pop(),
    isFile: true,
    isDirectory: false,
    isMarkdown,
    birthTime: 1
  })
const emitAddDir = (page: Page, pathname: string) =>
  emit(page, 'addDir', { pathname, name: pathname.split('/').pop() })
const emitUnlink = (page: Page, pathname: string) => emit(page, 'unlink', { pathname })

// The initial walk payload: notes.md (Markdown), assets/logo.png (not),
// docs/guide.md (Markdown inside a folder) and an empty folder.
async function injectWalk(page: Page) {
  await emitAddDir(page, `${ROOT}/docs`)
  await emitAdd(page, `${ROOT}/docs/guide.md`, true)
  await emitAddDir(page, `${ROOT}/empty-dir`)
  await emitAdd(page, `${ROOT}/notes.md`, true)
  await emitAdd(page, `${ROOT}/assets/logo.png`, false)
}

async function setTreeShowAllFiles(page: Page, value: boolean) {
  await page.evaluate((v) => {
    const el = document.querySelector('#app') as any
    const pinia = el?.__vue_app__?.config?.globalProperties?.$pinia
    pinia.state.value.preferences.treeShowAllFiles = v
  }, value)
}

async function bootTree(page: Page, state: TreeMocks, opts: { theme?: string } = {}) {
  await installTreeMocks(page, state)
  if (opts.theme) {
    await page.addInitScript((theme) => {
      const w = window as any
      const base = w.__mockInvoke.mt_prefs_get_all
      w.__mockInvoke.mt_prefs_get_all = () => base().then((p: any) => ({ ...p, theme, followSystemTheme: false }))
    }, opts.theme)
  }
  await bootEditor(page, { sideBarVisibility: true })
  if (opts.theme === 'ink') {
    // The prefs override above does not reach the theme on boot in the shim;
    // switch through the title-bar theme button like the other theme specs.
    // Auto → Light → Dark: click until the body carries the dark class.
    for (let i = 0; i < 3; i++) {
      if (await page.evaluate(() => document.body.classList.contains('dark'))) break
      await page.locator('.titlebar-nav-btn[title*="Theme"]').first().click()
      await page.waitForTimeout(250)
    }
    await page.waitForFunction(() => document.body.classList.contains('dark'))
  }
  await injectRoot(page)
  await injectWalk(page)
  await page.waitForTimeout(300)
}

const baseState = (): TreeMocks => ({
  recentList: [`${ROOT}/notes.md`, '/tmp/other/plan.md'],
  pinnedList: [],
  missing: [],
  pickFolderResult: null,
  popupContextResult: null
})

test.describe('sidebar tree redesign (C-51 T-001) — Markdown-only + look', () => {
  test('opened folder shows only Markdown files and no empty folders by default', async ({ page }) => {
    await bootTree(page, baseState())

    const tree = page.locator('.tree-view')
    const fileNames = tree.locator('.side-bar-file .text-overflow, .side-bar-file span')
    await expect(fileNames.filter({ hasText: 'notes.md' })).toBeVisible()
    // the png is filtered out (it never renders)
    await expect(tree.locator('.side-bar-file', { hasText: 'logo.png' })).toHaveCount(0)
    // the empty folder is hidden; the folder with a Markdown file shows
    await expect(tree.locator('.side-bar-folder .folder-name', { hasText: 'empty-dir' })).toHaveCount(0)
    await expect(tree.locator('.side-bar-folder .folder-name', { hasText: 'docs' })).toHaveCount(1)
    await expect(tree.locator('.side-bar-folder .folder-name', { hasText: 'assets' })).toHaveCount(0)
  })

  test('«Show all files» restores non-Markdown files and empty folders live, without a re-walk', async ({ page }) => {
    await bootTree(page, baseState())

    // logo.png lives in the (collapsed) assets folder: with show-all on, the
    // non-Markdown-only folders appear; off, they are gone again.
    await setTreeShowAllFiles(page, true)
    await expect(page.locator('.side-bar-folder .folder-name', { hasText: 'assets' })).toHaveCount(1)
    await expect(page.locator('.side-bar-folder .folder-name', { hasText: 'empty-dir' })).toHaveCount(1)

    // and back — the toggle is instant in both directions
    await setTreeShowAllFiles(page, false)
    await expect(page.locator('.side-bar-folder .folder-name', { hasText: 'assets' })).toHaveCount(0)
    await expect(page.locator('.side-bar-folder .folder-name', { hasText: 'empty-dir' })).toHaveCount(0)
  })

  test('creating an .md inside the empty folder reveals it; removing the file hides it again', async ({ page }) => {
    await bootTree(page, baseState())
    const folderRow = page.locator('.side-bar-folder .folder-name', { hasText: 'empty-dir' })

    await emitAdd(page, `${ROOT}/empty-dir/fresh.md`, true)
    await expect(folderRow).toHaveCount(1)

    await emitUnlink(page, `${ROOT}/empty-dir/fresh.md`)
    await expect(folderRow).toHaveCount(0)
  })

  test('folder rows render the canvas look: right chevron, guide lines, 32px rows, switcher', async ({ page }) => {
    await bootTree(page, baseState())

    // folder row: icon + name + right disclosure chevron
    const folderName = page.locator('.side-bar-folder .folder-name', { hasText: 'docs' })
    await expect(folderName.locator('svg.chevron')).toHaveCount(1)
    const rowHeight = await folderName.evaluate((el) => getComputedStyle(el).height)
    expect(rowHeight).toBe('32px')

    // expanded contents draw the 1px guide line (left border)
    await folderName.click()
    await page.waitForTimeout(200)
    const contents = page.locator('.side-bar-folder .folder-contents').first()
    await expect(contents).toBeVisible()
    const guide = await contents.evaluate((el) => {
      const cs = getComputedStyle(el)
      return { width: cs.borderLeftWidth, style: cs.borderLeftStyle }
    })
    expect(guide.width).toBe('1px')
    expect(guide.style).not.toBe('none')

    // folder-switcher row at the top: name + chevron-down opening the picker
    const switcher = page.locator('.project-tree .folder-switcher')
    await expect(switcher.locator('span', { hasText: 'mark-e2e' })).toBeVisible()
    await expect(switcher.locator('.switcher-chevron')).toHaveCount(1)
    const pickerCalls: string[] = []
    await page.exposeFunction('__pickFolderCalled', () => {
      pickerCalls.push('called')
      return null
    })
    await page.evaluate(() => {
      ;(window as any).__mockInvoke.mt_pick_folder = () => (window as any).__pickFolderCalled()
    })
    await switcher.locator('span').click()
    await expect.poll(() => pickerCalls.length).toBe(1)
  })

  test('the current file renders on a rounded accent-soft pill', async ({ page }) => {
    await bootTree(page, baseState())
    await openFileTab(page, `${ROOT}/notes.md`, DOC)

    const current = page.locator('.side-bar-file.current')
    await expect(current).toBeVisible()
    await expect(current).toContainText('notes.md')
    const pill = await current.evaluate((el) => {
      const cs = getComputedStyle(el)
      return { radius: cs.borderRadius, bg: cs.backgroundColor }
    })
    expect(pill.radius).toBe('8px')

    // the pill background resolves --chromeAccentSoft (C-38 T-006 contract)
    const softBg = await page.evaluate(() => {
      const probe = document.createElement('div')
      probe.style.position = 'absolute'
      probe.style.visibility = 'hidden'
      probe.style.background = 'var(--chromeAccentSoft)'
      document.body.appendChild(probe)
      const v = getComputedStyle(probe).backgroundColor
      probe.remove()
      return v
    })
    expect(pill.bg).toBe(softBg)
  })
})

test.describe('sidebar sections (C-51 T-002) — Recent + Pinned', () => {
  test('Recent lists the recent files and opens one through mt_open_file', async ({ page }) => {
    const state = baseState()
    state.recentList = [`${ROOT}/notes.md`, '/tmp/other/plan.md', '/tmp/other/gone.md']
    state.missing = ['/tmp/other/gone.md']
    await bootTree(page, state)

    const recent = page.locator('[data-section="recent"]')
    await expect(recent.locator('.section-title span')).toHaveText('Recent')
    const names = recent.locator('.section-file-name')
    await expect(names).toHaveCount(3)
    await expect(names.nth(0)).toHaveText('notes.md')

    // missing entry greyed with a Remove tooltip
    const missingRow = recent.locator('.section-file.missing')
    await expect(missingRow).toHaveCount(1)
    await expect(missingRow.locator('.section-remove')).toHaveAttribute('title', 'Remove')

    // click opens through the existing mt::open-file path
    const opened: unknown[] = []
    await page.exposeFunction('__openFile', (args: unknown) => {
      opened.push(args)
      return null
    })
    await page.evaluate(() => {
      ;(window as any).__mockInvoke.mt_open_file = (args: any) => (window as any).__openFile(args)
    })
    await names.nth(1).click()
    await expect.poll(() => opened.length).toBe(1)
  })

  test('pinning from the tree context menu adds the file to Pinned and persists across reload; unpin removes it', async ({ page }) => {
    const state = baseState()
    state.popupContextResult = 'pinFileMenuItem'
    const { prefs } = await installTreeMocks(page, state)
    await bootEditor(page, { sideBarVisibility: true })
    await injectRoot(page)
    await injectWalk(page)
    await page.waitForTimeout(300)

    // Pinned is absent while empty
    await expect(page.locator('[data-section="pinned"]')).toHaveCount(0)

    // right-click notes.md → native menu returns the Pin item id
    await page.locator('.side-bar-file', { hasText: 'notes.md' }).click({ button: 'right' })
    const pinned = page.locator('[data-section="pinned"]')
    await expect(pinned.locator('.section-file-name')).toHaveText('notes.md')
    await expect.poll(async () => (await page.evaluate(() => (window as any).__prefsSnapshot()))['pinnedFiles']).toEqual([
      `${ROOT}/notes.md`
    ])
    expect(prefs['pinnedFiles']).toEqual([`${ROOT}/notes.md`])

    // survives a reload (mocked prefs persistence): re-boot the editor
    await page.reload()
    await page.waitForFunction(() => {
      const ls = (window as any).__shimListeners
      if (!ls) return false
      for (const m of ls.values()) if (m.event === 'mt::bootstrap-editor') return true
      return false
    }, undefined, { timeout: 15_000 })
    await page.evaluate(() => {
      ;(window as any).__emitFakeEvent('mt::bootstrap-editor', {
        addBlankTab: false,
        markdownList: [''],
        lineEnding: 'lf',
        sideBarVisibility: true,
        tabBarVisibility: true,
        sourceCodeModeEnabled: false
      })
    })
    await page.locator('.editor-with-tabs').waitFor({ state: 'visible', timeout: 15_000 })
    await page.waitForTimeout(500)
    await expect(page.locator('[data-section="pinned"] .section-file-name')).toHaveText('notes.md')

    // unpin through the hover X
    const row = page.locator('[data-section="pinned"] .section-file').first()
    await row.hover()
    await row.locator('.section-remove').click()
    await expect(page.locator('[data-section="pinned"]')).toHaveCount(0)
  })

  test('Pinned rows drag to reorder and the order persists', async ({ page }) => {
    const state = baseState()
    state.recentList = []
    state.popupContextResult = 'pinFileMenuItem'
    await bootTree(page, state)

    // pin three files in order
    for (const name of ['notes.md', 'guide.md']) {
      // guide.md lives inside docs/ — expand first
      if (name === 'guide.md') {
        await page.locator('.side-bar-folder .folder-name', { hasText: 'docs' }).click()
        await page.waitForTimeout(150)
      }
      await page.locator('.side-bar-file', { hasText: name }).first().click({ button: 'right' })
      await expect(page.locator('[data-section="pinned"] .section-file-name', { hasText: name })).toHaveCount(1)
    }
    const names = page.locator('[data-section="pinned"] .section-file-name')
    await expect(names).toHaveCount(2)
    await expect(names.nth(0)).toHaveText('notes.md')

    // HTML5 drag reorder: first row dropped onto the second. Synthetic
    // DragEvents (deterministic in both engines — locator.dragTo's mouse
    // path is not reliable for HTML5 DnD in WebKit).
    await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('[data-section="pinned"] .section-file'))
      const dt = typeof DataTransfer !== 'undefined' ? new DataTransfer() : undefined
      rows[0].dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt }))
      rows[1].dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }))
      rows[1].dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer: dt }))
    })
    await expect(names.nth(0)).toHaveText('guide.md')
    await expect(names.nth(1)).toHaveText('notes.md')
    await expect.poll(async () => (await page.evaluate(() => (window as any).__prefsSnapshot()))['pinnedFiles']).toEqual([
      `${ROOT}/docs/guide.md`,
      `${ROOT}/notes.md`
    ])
  })

  test('collapsing the Recent section hides its list', async ({ page }) => {
    await bootTree(page, baseState())
    const recent = page.locator('[data-section="recent"]')
    await expect(recent.locator('.section-list')).toBeVisible()
    await recent.locator('.section-title').click()
    await expect(recent.locator('.section-list')).toBeHidden()
  })
})

test.describe('sidebar tree screenshots (C-51)', () => {
  for (const theme of ['paper', 'ink']) {
    test(`tree + sections in ${theme}`, async ({ page }) => {
      const state = baseState()
      state.popupContextResult = 'pinFileMenuItem'
      await page.setViewportSize({ width: 1280, height: 800 })
      await bootTree(page, state, { theme })

      // pin notes.md so the Pinned section is populated for the shot
      await page.locator('.side-bar-file', { hasText: 'notes.md' }).click({ button: 'right' })
      await expect(page.locator('[data-section="pinned"] .section-file-name')).toHaveText('notes.md')

      // expand docs so the guide lines + nested file show
      await page.locator('.side-bar-folder .folder-name', { hasText: 'docs' }).click()
      await openFileTab(page, `${ROOT}/notes.md`, DOC)
      await page.waitForTimeout(600)

      // Evidence goes to the Playwright output dir — never into the repo.
      await page.screenshot({
        path: test.info().outputPath(`sidebar-tree-${theme}.png`),
        type: 'png',
        clip: { x: 0, y: 0, width: 1280, height: 800 }
      })
    })
  }
})
