// FILE: tests/e2e/clipboard-open.spec.ts
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: C-52 e2e — File › Open from Clipboard (mt::menu-invoked
//            dispatch, the same id the native menu emits) and the
//            welcome-screen plain ⌘V open a folder workspace from a text
//            path and from pasteboard file paths, REPLACE an already
//            open workspace, open a .md in a tab, notify on garbage; a
//            dropped FOLDER opens as the workspace while a dropped .md
//            keeps today's tab behaviour.
//   SCOPE: renderer-only e2e against vite preview + tauri-shim (no real
//            Tauri IPC); the App Store panel routing and the native
//            menu chrome are pinned in unit tests (Rust m009/m059,
//            renderer clipboard-open routing).
//   DEPENDS: @playwright/test, tests/e2e/fixtures/tauri-shim,
//            tests/e2e/fixtures/helpers (bootEditor).
//   LINKS: .grace/changes/active/C-52 spec R-1..R-5;
//          .grace/verification/runtime.xml V-M-011 scenario-62.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   ClipState - page-side clipboard/stat/read/pick state the mocks read.
//   Record_ - Node-side invocation record (walk/close/pick arrays).
//   DIR - fs stat double for a directory (extensible via extra).
//   FILE - fs stat double for a Markdown file (extensible via extra).
//   installClipMocks - install the tauri shim + clipboard/stat/read/pick mocks on the page.
//   bootClip - install the shim + clipboard mocks and boot the editor (sidebar on).
//   bootWelcomeClip - boot with no document so the C-46 welcome screen mounts.
//   menuOpen - dispatch mt::menu-invoked 'file.open-from-clipboard' like the native File menu.
//   projectRoots - read the live pinia project store roots.
//   dropPaths - deliver a native drag-drop through the bridge event.
//   setClipboard - update the page-side clipboard state (paths/text/stat).
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   - 2026-10-16 C-52 T-001: initial spec (chromium + webkit-clipboard).
// END_CHANGE_SUMMARY

import { test, expect, type Page } from '@playwright/test'
import { installTauriShim } from './fixtures/tauri-shim'
import { bootEditor } from './fixtures/helpers'

interface ClipState {
  paths: string[]
  text: string
  statByPath: Record<string, { isFile: boolean; isDirectory: boolean }>
  readByPath: Record<string, string>
  pickResult: string | null
}

interface Record_ {
  walk: string[]
  close: string[]
  pick: Array<Record<string, unknown> | null>
}

const DIR = (extra: Record<string, unknown> = {}) => ({
  isFile: false,
  isDirectory: true,
  size: 0,
  mode: 0,
  mtimeMs: 1,
  isSymbolicLink: false,
  ...extra
})
const FILE = (extra: Record<string, unknown> = {}) => ({
  isFile: true,
  isDirectory: false,
  size: 12,
  mode: 0,
  mtimeMs: 1,
  isSymbolicLink: false,
  ...extra
})

// Install the page-side mocks: the tauri shim's __mockInvoke table is
// extended with the clipboard command, per-path fs answers and the
// mt::open-new-tab loop-back (emit → __emitFakeEvent) so the .md branch
// really opens a tab.
async function installClipMocks(page: Page, rec: Record_) {
  await installTauriShim(page)
  await page.exposeFunction('__walkCalled', (path: string) => {
    rec.walk.push(path)
    return null
  })
  await page.exposeFunction('__closeCalled', (pathname: string) => {
    rec.close.push(pathname)
    return null
  })
  await page.exposeFunction('__pickCalled', (args: unknown) => {
    rec.pick.push(args as Record<string, unknown> | null)
    return null
  })
  await page.addInitScript(() => {
    const w = window as any
    const clip: {
      paths: string[]
      text: string
      statByPath: Record<string, any>
      readByPath: Record<string, string>
      pickResult: string | null
    } = {
      paths: [],
      text: '',
      statByPath: {},
      readByPath: {},
      pickResult: null
    }
    w.__clip = clip
    w.__mockInvoke = {
      ...w.__mockInvoke,
      mt_read_clipboard_paths: () => ({ paths: clip.paths, text: clip.text }),
      mt_fs_stat: (args: any) => clip.statByPath[args?.path] ?? null,
      mt_fs_read: (args: any) => clip.readByPath[args?.path] ?? '# Read me\n',
      mt_walk_project: (args: any) => (window as any).__walkCalled(args?.path),
      mt_close_project_root: (args: any) => (window as any).__closeCalled(args?.pathname),
      mt_watch_subscribe: () => 'clip-sub-id',
      mt_watch_unsubscribe: () => null,
      mt_pick_folder: (args: any) => {
        ;(window as any).__pickCalled(args ?? null)
        return clip.pickResult
      },
      mt_recent_list: () => [],
      mt_prefs_get: (args: any) => (args?.key === 'recentFolders' ? [] : null),
      mt_prefs_set: () => null
    }
    // Loop the renderer's own mt::open-new-tab emit back to its listener —
    // the shim never delivers emits otherwise, so the .md branch would be
    // silent. Nothing else loops back.
    const prevEmit = w.__mockInvoke['plugin:event|emit']
    w.__mockInvoke['plugin:event|emit'] = (args: any) => {
      if (args?.event === 'mt::open-new-tab' && typeof w.__emitFakeEvent === 'function') {
        w.__emitFakeEvent(args.event, args.payload)
      }
      return prevEmit ? prevEmit(args) : null
    }
  })
}

async function bootClip(page: Page, rec: Record_) {
  await installClipMocks(page, rec)
  await bootEditor(page, { sideBarVisibility: true })
}

// No document + no blank tab → the C-46 welcome screen mounts (the ⌘V
// surface). Mirrors tests/e2e/welcome.spec.ts bootWelcome, trimmed to
// the mocks this spec needs.
async function bootWelcomeClip(page: Page, rec: Record_) {
  await installClipMocks(page, rec)
  await page.goto('/?type=editor&wid=0&udp=/tmp/mark-e2e&debug=0')
  await page.waitForFunction(() => {
    const ls = (window as any).__shimListeners
    if (!ls) return false
    for (const m of ls.values()) if (m.event === 'mt::bootstrap-editor') return true
    return false
  }, undefined, { timeout: 15_000 })
  await page.evaluate(() => {
    ;(window as any).__emitFakeEvent('mt::bootstrap-editor', {
      addBlankTab: false,
      markdownList: [],
      lineEnding: 'lf',
      sideBarVisibility: true,
      tabBarVisibility: true,
      sourceCodeModeEnabled: false
    })
  })
  await page.locator('.welcome-screen').waitFor({ state: 'visible', timeout: 15_000 })
}

const menuOpen = (page: Page) =>
  page.evaluate(
    () => (window as any).__emitFakeEvent('mt::menu-invoked', 'file.open-from-clipboard')
  )

const projectRoots = (page: Page) =>
  page.evaluate(() => {
    const el = document.querySelector('#app') as any
    const pinia = el?.__vue_app__?.config?.globalProperties?.$pinia
    return (pinia?.state?.value?.project?.projectTrees ?? []).map((r: any) => r.pathname)
  })

const dropPaths = (page: Page, paths: string[]) =>
  page.evaluate(
    (p) =>
      (window as any).__emitFakeEvent('tauri://drag-drop', {
        paths: p,
        position: { x: 10, y: 10 }
      }),
    paths
  )

const setClipboard = (page: Page, state: Partial<ClipState>) =>
  page.evaluate((s) => Object.assign((window as any).__clip, s), state)

test.describe('open from clipboard (C-52)', () => {
  test('menu: a clipboard TEXT path opens the folder as the workspace', async ({ page }) => {
    const rec: Record_ = { walk: [], close: [], pick: [] }
    await bootClip(page, rec)
    await setClipboard(page, {
      text: '  /tmp/mark-e2e/notes-root\n',
      statByPath: { '/tmp/mark-e2e/notes-root': DIR() }
    })

    expect(await menuOpen(page)).toBeGreaterThan(0)
    await expect
      .poll(() => projectRoots(page), { timeout: 10_000 })
      .toEqual(['/tmp/mark-e2e/notes-root'])
    await expect.poll(() => rec.walk).toEqual(['/tmp/mark-e2e/notes-root'])
    // The sidebar shows the new root in the folder switcher.
    await expect(
      page.locator('.project-tree .folder-switcher', { hasText: 'notes-root' })
    ).toBeVisible()
  })

  test('menu: pasteboard file paths win and REPLACE an already open workspace', async ({ page }) => {
    const rec: Record_ = { walk: [], close: [], pick: [] }
    await bootClip(page, rec)
    await setClipboard(page, {
      text: '/tmp/mark-e2e/first-root',
      statByPath: {
        '/tmp/mark-e2e/first-root': DIR(),
        '/tmp/mark-e2e/second-root': DIR()
      }
    })

    expect(await menuOpen(page)).toBeGreaterThan(0)
    await expect
      .poll(() => projectRoots(page), { timeout: 10_000 })
      .toEqual(['/tmp/mark-e2e/first-root'])

    // A Finder-style copy (file-URL list on the pasteboard) asks Add or
    // Replace (C-MULTI-SOURCE-WORKSPACE chooser); choosing Replace swaps
    // the workspace to the OTHER folder.
    await setClipboard(page, { paths: ['/tmp/mark-e2e/second-root'], text: 'ignored' })
    expect(await menuOpen(page)).toBeGreaterThan(0)
    const replaceBtn = page.locator('.workspace-mode-dialog .workspace-mode-destructive')
    await replaceBtn.waitFor({ state: 'visible', timeout: 10_000 })
    await replaceBtn.click()
    await expect
      .poll(() => projectRoots(page), { timeout: 10_000 })
      .toEqual(['/tmp/mark-e2e/second-root'])
    expect(rec.close).toEqual(['/tmp/mark-e2e/first-root'])
    expect(rec.walk).toEqual(['/tmp/mark-e2e/first-root', '/tmp/mark-e2e/second-root'])
  })

  test('menu: a Markdown file opens in a TAB like a drop', async ({ page }) => {
    const rec: Record_ = { walk: [], close: [], pick: [] }
    await bootClip(page, rec)
    const readCalls: string[] = []
    await page.exposeFunction('__clipRead', (path: string) => {
      readCalls.push(path)
      return '# From the clipboard\n'
    })
    await page.evaluate(() => {
      const w = window as any
      w.__mockInvoke.mt_fs_read = (args: any) => w.__clipRead(args?.path)
    })
    await setClipboard(page, {
      text: 'file:///tmp/mark-e2e/docs/notes.md',
      statByPath: { '/tmp/mark-e2e/docs/notes.md': FILE() },
      readByPath: { '/tmp/mark-e2e/docs/notes.md': '# From the clipboard\n' }
    })

    expect(await menuOpen(page)).toBeGreaterThan(0)

    // A tab appears with the file's name and content renders.
    await expect
      .poll(() => readCalls, { timeout: 10_000 })
      .toEqual(['/tmp/mark-e2e/docs/notes.md'])
    const tab = page.locator('.editor-tabs .tabs-container li', { hasText: 'notes.md' })
    await expect(tab).toBeVisible({ timeout: 10_000 })
    // The caret sits in the heading, so muya shows its «# » marker.
    await expect(page.locator('.editor-with-tabs h1').first()).toHaveText(/(^|# )From the clipboard$/)
    // No workspace was opened.
    expect(await projectRoots(page)).toEqual([])
    expect(rec.walk).toEqual([])
  })

  test('menu: garbage on the clipboard notifies and opens nothing', async ({ page }) => {
    const rec: Record_ = { walk: [], close: [], pick: [] }
    await bootClip(page, rec)
    await setClipboard(page, { text: 'definitely not a path' })

    expect(await menuOpen(page)).toBeGreaterThan(0)

    await expect(page.locator('.mt-notification')).toBeVisible({ timeout: 10_000 })
    await expect(page.locator('.mt-notification .title')).toContainText(
      'No folder or Markdown file on the clipboard'
    )
    expect(await projectRoots(page)).toEqual([])
    expect(rec.walk).toEqual([])
    expect(rec.pick).toEqual([])
  })

  test('welcome screen: plain ⌘V opens the clipboard folder', async ({ page }) => {
    const rec: Record_ = { walk: [], close: [], pick: [] }
    await bootWelcomeClip(page, rec)
    await setClipboard(page, {
      text: '/tmp/mark-e2e/welcome-root',
      statByPath: { '/tmp/mark-e2e/welcome-root': DIR() }
    })

    await page.keyboard.press('ControlOrMeta+v')

    await expect
      .poll(() => projectRoots(page), { timeout: 10_000 })
      .toEqual(['/tmp/mark-e2e/welcome-root'])
    await expect.poll(() => rec.walk).toEqual(['/tmp/mark-e2e/welcome-root'])
  })

  test('welcome screen: ⌥⌘V does NOT trigger the paste-open (menu accelerator territory)', async ({
    page
  }) => {
    const rec: Record_ = { walk: [], close: [], pick: [] }
    await bootWelcomeClip(page, rec)
    await setClipboard(page, {
      text: '/tmp/mark-e2e/never-opened',
      statByPath: { '/tmp/mark-e2e/never-opened': DIR() }
    })

    await page.keyboard.press('Alt+ControlOrMeta+v')
    await page.waitForTimeout(500)

    expect(await projectRoots(page)).toEqual([])
    expect(rec.walk).toEqual([])
  })

  test('drop: a dropped FOLDER opens as the workspace (replace), a dropped .md still opens a tab', async ({
    page
  }) => {
    const rec: Record_ = { walk: [], close: [], pick: [] }
    await bootClip(page, rec)
    await setClipboard(page, {
      statByPath: {
        '/tmp/mark-e2e/dropped-folder': DIR(),
        '/tmp/mark-e2e/dropped.md': FILE()
      },
      readByPath: { '/tmp/mark-e2e/dropped.md': '# Dropped doc\n' }
    })

    // Folder drop → workspace (R-4).
    await dropPaths(page, ['/tmp/mark-e2e/dropped-folder'])
    await expect
      .poll(() => projectRoots(page), { timeout: 10_000 })
      .toEqual(['/tmp/mark-e2e/dropped-folder'])
    await expect.poll(() => rec.walk).toEqual(['/tmp/mark-e2e/dropped-folder'])

    // Markdown drop keeps today's behaviour: a tab, no second root.
    await dropPaths(page, ['/tmp/mark-e2e/dropped.md'])
    const tab = page.locator('.editor-tabs .tabs-container li', { hasText: 'dropped.md' })
    await expect(tab).toBeVisible({ timeout: 10_000 })
    await expect
      .poll(() => projectRoots(page), { timeout: 10_000 })
      .toEqual(['/tmp/mark-e2e/dropped-folder'])
  })
})
