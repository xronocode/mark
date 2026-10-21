// FILE: tests/e2e/welcome.spec.ts
// VERSION: 1.2.0
// START_MODULE_CONTRACT
//   PURPOSE: C-46 welcome screen e2e — boot with no file open and verify the layout elements, remove/undo of a recent file, open-by-click, Copy prompt and the native-bridge drop highlight.
//   SCOPE: renderer-only e2e against vite preview + tauri-shim (no real Tauri IPC).
//   DEPENDS: @playwright/test, tests/e2e/fixtures/tauri-shim, static/locales/en.json (expected prompt text).
//   LINKS: .grace/verification/runtime.xml V-M-011 scenario-47; .grace/changes/archive/C-46.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   EN - the shipped English locale table (agent prompt expectations).
//   bootWelcome - install the shim with recent-files/session overrides and fire the no-document bootstrap.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.2.0 - 2026-10-18 fix: a short window keeps the brand row
//     reachable — at scrollTop 0 the brand sits inside the scroll box (the
//     old align-items:center clipped it above the scrollable area).
//   v1.1.0 - 2026-10-15 C-46 review: open a recent file by
//     click (mt_open_file), Copy prompt puts the OS prompt on the clipboard,
//     drop highlight follows the native drag bridge (tauri://drag-*).
//   v1.0.0 - 2026-10-15 C-46: initial pins.
// END_CHANGE_SUMMARY

import { test, expect, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { installTauriShim } from './fixtures/tauri-shim'

const EN = JSON.parse(
  readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../../static/locales/en.json'), 'utf8')
)

async function bootWelcome(page: Page): Promise<void> {
  await installTauriShim(page)
  await page.addInitScript(() => {
    // Record clipboard writes (headless browsers deny the real clipboard).
    ;(window as any).__clipboardWrites = []
    try {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: {
          writeText: async (text: string) => {
            ;(window as any).__clipboardWrites.push(text)
          },
          readText: async () => '',
          read: async () => []
        }
      })
    } catch {
      /* clipboard not redefinable — the copy test will report it */
    }
    ;(window as any).__mockInvoke = {
      mt_recent_list: () => [
        '/Users/<fixture>/docs/launch-plan.md',
        '/Users/<fixture>/docs/release-notes.md',
        '/Users/<fixture>/docs/architecture.md'
      ],
      mt_recent_remove: () => 1,
      mt_recent_insert: () => null,
      mt_fs_stat: () => ({
        isFile: true,
        isDirectory: false,
        size: 128,
        mode: 0,
        mtimeMs: Date.now() - 3 * 60 * 1000,
        isSymbolicLink: false
      }),
      mt_prefs_get: (args: any) => {
        if (args?.key === 'lastSessionTabs') return ['/tmp/one.md', '/tmp/two.md']
        if (args?.key === 'recentFolders') return ['/Users/<fixture>/prj/pebble']
        // C-FIX-009-SESSION-COLD-START: auto-restore off, so the boot
        // records the seeded snapshot as the welcome cold-start offer.
        if (args?.key === 'restoreSessionOnLaunch') return false
        return null
      },
      mt_prefs_set: () => null
    }
  })

  await page.goto('/?type=editor&wid=0&udp=/tmp/mark-e2e&debug=0')

  await page.waitForFunction(() => {
    const ls = (window as any).__shimListeners
    if (!ls) return false
    for (const m of ls.values()) if (m.event === 'mt::bootstrap-editor') return true
    return false
  }, undefined, { timeout: 15_000 })

  // Cold launch without files (C-FIX-009 contract): addBlankTab boots
  // the session path, the off-preference skips auto-restore, no tab is
  // created (the blank tab is skipped) → the welcome screen mounts with
  // the cold-start "Last session" offer. The preferences store defaults
  // restoreSessionOnLaunch to true, so the harness sets it off directly
  // (the prefs mock is the same user state, read by the BOOT_SESSION
  // fallback when the store value is undefined).
  await page.evaluate(() => {
    const app = document.querySelector('#app') as any
    const prefs = app?.__vue_app__?.config?.globalProperties?.$pinia?.state?.value?.preferences
    if (prefs) prefs.restoreSessionOnLaunch = false
    ;(window as any).__emitFakeEvent('mt::bootstrap-editor', {
      addBlankTab: true,
      markdownList: [],
      lineEnding: 'lf',
      sideBarVisibility: false,
      tabBarVisibility: true,
      sourceCodeModeEnabled: false
    })
  })

  await page.locator('.welcome-screen').waitFor({ state: 'visible', timeout: 15_000 })
}

test.describe('welcome screen (C-46)', () => {
  test('shows the brand header, tagline, action row, session row, recents and agent row', async ({
    page
  }) => {
    await bootWelcome(page)

    const welcome = page.locator('.welcome-screen')
    const filesSection = welcome.locator('.welcome-section').first()

    // Brand header: icon + name.
    await expect(welcome.locator('.brand-name')).toHaveText('Mark')
    expect(await welcome.locator('.brand-icon').getAttribute('src')).toBeTruthy()

    // Tagline with the highlighted word.
    const tagline = welcome.locator('.tagline')
    await expect(tagline).toContainText('Agents write. You')
    await expect(tagline.locator('.tagline-highlight')).toHaveText('shape')

    // One row of three buttons with shortcut hints (glyph depends on the
    // build-host platform — accept both spellings).
    const buttons = welcome.locator('.action-button')
    await expect(buttons).toHaveCount(3)
    await expect(buttons.nth(0)).toContainText('Open File')
    await expect(buttons.nth(0).locator('.action-kbd')).toHaveText(/⌘O|Ctrl\+O/)
    await expect(buttons.nth(1)).toContainText('Open Folder')
    await expect(buttons.nth(1).locator('.action-kbd')).toHaveText(/⇧⌘O|Ctrl\+Shift\+O/)
    await expect(buttons.nth(2)).toContainText('New')
    await expect(buttons.nth(2).locator('.action-kbd')).toHaveText(/⌘N|Ctrl\+N/)

    // Last session is the first recent row.
    const sessionRow = filesSection.locator('.row-session')
    // The row title carries the frozen tab count (acceptance follow-up 5).
    await expect(sessionRow.locator('.row-name')).toHaveText('Last session (2)')
    await expect(sessionRow.locator('.row-time')).toHaveText('2 files')
    await expect(sessionRow.locator('.row-path')).toContainText('one.md, two.md')

    // Session row + three recent files with the relative mtime.
    const names = filesSection.locator('.row-name')
    await expect(names).toHaveCount(4)
    await expect(names.nth(1)).toHaveText('launch-plan.md')
    const fileRow = filesSection.locator('.recent-item').nth(1)
    await expect(fileRow.locator('.row-path')).toContainText('/Users/<fixture>/docs')
    await expect(fileRow.locator('.row-time')).toHaveText('3 min ago')

    // Recent folders section with the folder row.
    await expect(welcome.locator('.section-title').nth(1)).toHaveText('Recent folders')
    const folderRow = welcome.locator('.welcome-section').nth(1).locator('.recent-item').first()
    await expect(folderRow.locator('.row-name')).toHaveText('pebble')

    // Connect-your-agent row + footer (What's-new hidden: no lastUpdateAt).
    await expect(welcome.locator('.agent-row .chip-button.accent')).toHaveText('Copy prompt')
    await expect(welcome.locator('.footer-link')).toHaveCount(1)
    await expect(welcome.locator('.footer-link').first()).toHaveText('Guide')
  })

  test('a short window keeps the brand row reachable at the top (safe centering)', async ({
    page
  }) => {
    await page.setViewportSize({ width: 900, height: 420 })
    await bootWelcome(page)
    const box = await page.evaluate(() => {
      const screen = document.querySelector('.welcome-screen') as HTMLElement
      screen.scrollTop = 0
      const s = screen.getBoundingClientRect()
      const b = (document.querySelector('.brand') as HTMLElement).getBoundingClientRect()
      return { screenTop: s.top, brandTop: b.top, overflow: screen.scrollHeight > screen.clientHeight }
    })
    expect(box.overflow, 'the fixture must overflow a 420px window').toBe(true)
    expect(box.brandTop).toBeGreaterThanOrEqual(box.screenTop)
  })

  test('removing a recent file shows the undo toast and undo restores the row', async ({
    page
  }) => {
    await bootWelcome(page)

    const removeCalls: string[] = []
    const inserts: Array<{ path: string; index: number }> = []
    await page.exposeFunction('__recentRemove', (path: string) => {
      removeCalls.push(path)
      return 1
    })
    await page.exposeFunction('__recentInsert', (path: string, index: number) => {
      inserts.push({ path, index })
      return null
    })
    await page.evaluate(() => {
      ;(window as any).__mockInvoke.mt_recent_remove = (args: any) =>
        (window as any).__recentRemove(args.path)
      ;(window as any).__mockInvoke.mt_recent_insert = (args: any) =>
        (window as any).__recentInsert(args.path, args.index)
    })

    const fileRows = page.locator('.welcome-screen .welcome-section').first().locator('.recent-item')
    await expect(fileRows).toHaveCount(4)

    // Hover the second recent file (release-notes.md) to reveal Remove.
    const row = fileRows.nth(2)
    await row.hover()
    await row.locator('.row-remove').click()

    await expect(page.locator('.undo-toast')).toBeVisible()
    await expect(page.locator('.undo-toast .toast-message')).toContainText('release-notes.md')
    await expect(fileRows).toHaveCount(3)

    await page.locator('.undo-toast .toast-undo').click()
    await expect(page.locator('.undo-toast')).toBeHidden()
    await expect(fileRows).toHaveCount(4)
    // Exact position restored: release-notes.md is the 3rd row again
    // (after the session row).
    await expect(
      page.locator('.welcome-screen .welcome-section').first().locator('.row-name').nth(2)
    ).toHaveText('release-notes.md')

    expect(removeCalls).toEqual(['/Users/<fixture>/docs/release-notes.md'])
    expect(inserts).toEqual([{ path: '/Users/<fixture>/docs/release-notes.md', index: 1 }])
  })

  test('the What’s-new footer link stays hidden without a lastUpdateAt preference', async ({
    page
  }) => {
    await bootWelcome(page)
    // mt_prefs_get in the shim returns null for lastUpdateAt.
    await expect(page.locator('.welcome-footer .footer-link')).toHaveCount(1)
  })

  test('clicking a recent file opens it through mt_open_file', async ({ page }) => {
    await bootWelcome(page)
    const opened: unknown[] = []
    await page.exposeFunction('__openFile', (args: unknown) => {
      opened.push(args)
      return null
    })
    await page.evaluate(() => {
      ;(window as any).__mockInvoke.mt_open_file = (args: any) => (window as any).__openFile(args)
    })

    const fileRow = page.locator('.welcome-screen .welcome-section').first().locator('.recent-item').nth(1)
    await expect(fileRow.locator('.row-name')).toHaveText('launch-plan.md')
    await fileRow.locator('.row-button').click()

    await expect.poll(() => opened.length).toBe(1)
    expect(opened[0]).toEqual({ args: ['/Users/<fixture>/docs/launch-plan.md', {}] })
  })

  test('Copy prompt puts the macOS prompt on the clipboard', async ({ page }) => {
    await bootWelcome(page)
    // The vite define bakes the BUILD host platform into the shim; the
    // macOS prompt (open -a Mark) ships on darwin builds, prose elsewhere.
    const platform = await page.evaluate(() => (window as any).electron.process.platform)
    const expected = platform === 'darwin' ? EN.guide.agentPrompt.mac : EN.guide.agentPrompt.generic

    await page.locator('.welcome-screen .agent-row .chip-button.accent').click()
    await expect
      .poll(() => page.evaluate(() => (window as any).__clipboardWrites))
      .toEqual([expected])
    if (platform === 'darwin') expect(expected).toContain('open -a Mark <file>.md')
  })

  test('the drop highlight follows the native drag bridge and clears on leave/drop', async ({
    page
  }) => {
    await bootWelcome(page)
    const read: string[] = []
    await page.exposeFunction('__fsRead', (path: string) => {
      read.push(path)
      return '# dropped'
    })
    await page.evaluate(() => {
      ;(window as any).__mockInvoke.mt_fs_read = (args: any) => (window as any).__fsRead(args?.path)
    })
    const overlay = page.locator('.welcome-screen .drop-overlay')
    const emit = (event: string, payload: unknown) =>
      page.evaluate(([e, p]) => (window as any).__emitFakeEvent(e, p), [event, payload] as const)

    await expect(overlay).toHaveCount(0)
    expect(await emit('tauri://drag-enter', { paths: ['/tmp/dropped.md'], position: { x: 10, y: 10 } })).toBeGreaterThan(0)
    await expect(overlay).toBeVisible()
    await emit('tauri://drag-leave', null)
    await expect(overlay).toHaveCount(0)

    await emit('tauri://drag-enter', { paths: ['/tmp/dropped.md'], position: { x: 10, y: 10 } })
    await expect(overlay).toBeVisible()
    await emit('tauri://drag-drop', { paths: ['/tmp/dropped.md'], position: { x: 10, y: 10 } })
    await expect(overlay).toHaveCount(0)
    // The bridge (not the welcome screen) opens the drop: it reads the file.
    await expect.poll(() => read).toEqual(['/tmp/dropped.md'])
  })
})

test.describe('welcome cold-start offer (FIX-009)', () => {
  const tabNames = (page: Page) => page.evaluate(() =>
    Array.from(document.querySelectorAll('.tabs-container li')).map((li) => li.textContent || '')
  )

  test('the frozen offer still restores after the live session changes (review wave 2)', async ({ page }) => {
    await installTauriShim(page)
    let liveTabs = ['/tmp/previous.md']
    await page.addInitScript(() => {
      ;(window as any).__mockInvoke = {
        ...(window as any).__mockInvoke,
        mt_prefs_get: (args: any) => {
          const w = window as any
          if (args?.key === 'lastSessionTabs') return w.__liveTabs
          if (args?.key === 'restoreSessionOnLaunch') return false
          if (args?.key === 'recentFolders') return []
          return null
        },
        mt_prefs_set: (args: any) => {
          const w = window as any
          if (args?.key === 'lastSessionTabs') w.__liveTabs = args.value
          return null
        },
        mt_fs_stat: ({ path }: { path: string }) => ({
          isFile: path.endsWith('.md'),
          isDirectory: false,
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
            markdown: `# ${p.split('/').pop()}\n`,
            isUtf8BomEncoded: false,
            lineEnding: 'lf',
            adjustLineEndingOnSave: false
          })
          return null
        }
      }
      ;(window as any).__liveTabs = ['/tmp/previous.md']
    })

    await page.goto('/?type=editor&wid=0&udp=/tmp/mark-e2e&debug=0')
    await page.waitForFunction(() => {
      const ls = (window as any).__shimListeners
      if (!ls) return false
      for (const m of ls.values()) if (m.event === 'mt::bootstrap-editor') return true
      return false
    }, undefined, { timeout: 15_000 })
    await page.evaluate(() => {
      const app = document.querySelector('#app') as any
      const prefs = app?.__vue_app__?.config?.globalProperties?.$pinia?.state?.value?.preferences
      if (prefs) prefs.restoreSessionOnLaunch = false
      ;(window as any).__emitFakeEvent('mt::bootstrap-editor', {
        addBlankTab: true,
        markdownList: [],
        lineEnding: 'lf',
        sideBarVisibility: false,
        tabBarVisibility: true,
        sourceCodeModeEnabled: false
      })
    })
    await page.locator('.welcome-screen').waitFor({ state: 'visible', timeout: 15_000 })

    // The frozen offer shows the boot-time snapshot.
    const row = page.locator('.row-session')
    await expect(row).toBeVisible()
    await expect(row.locator('.row-path')).toContainText('previous.md')

    // Mid-run, the session autosave rewrites the live preference to an
    // empty session (e.g. a tab was opened and closed again).
    await page.evaluate(() => { (window as any).__liveTabs = [] })

    // The click must still restore the FROZEN offer — not the empty
    // live preference.
    await row.click()
    await expect.poll(async () => (await tabNames(page)).length, { timeout: 10_000 }).toBeGreaterThan(0)
    expect((await tabNames(page)).join(' ')).toContain('previous.md')
  })
})
