/**
 * view-menu-checks.spec.ts — C-40 T-005: native View-menu checkmarks
 * follow the real state.
 *
 * The renderer-only harness has no native menu; what this spec gates is
 * the renderer's half of the re-sync contract — the backend half
 * (recursive allow-listed mt_menu_set_checked walker) is pinned by
 * cargo tests on m009_menu. After boot with stored preferences the
 * mt_menu_set_checked pushes carry the HYDRATED state (stored
 * statusBarVisibility:true → view.status-bar checked:true — the release
 * review bug was the opposite), and toggling through the same command
 * surface the native menu uses (cmd::execute view.*) pushes exactly
 * one new call with the flipped value. Expectations are
 * platform-independent: every checked value is seeded explicitly
 * (stored pref or bootEditor option), so the spec asserts the same
 * outcome on any host OS.
 */

import { test, expect, type Page } from '@playwright/test'
import { installTauriShim } from './fixtures/tauri-shim'
import { bootEditor } from './fixtures/helpers'

// Record every mt_menu_set_checked invocation. Runs after the shim's
// init script (registration order), so __mockInvoke already exists and
// the override simply replaces the default false handler.
async function recordMenuChecks(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as any
    w.__menuCheckCalls = []
    w.__mockInvoke = {
      ...(w.__mockInvoke || {}),
      mt_menu_set_checked: (args: any) => {
        w.__menuCheckCalls.push(args)
        return true
      }
    }
  })
}

// Stored-prefs override: the shim's default mt_prefs_get_all payload
// (copied verbatim so boot behaviour matches every other spec) plus the
// seeded statusBarVisibility the release-review bug was reported with.
async function seedStatusBarPref(page: Page, statusBarVisibility: boolean): Promise<void> {
  await page.addInitScript((statusBarVisibility: boolean) => {
    const w = window as any
    const previous = w.__mockInvoke || {}
    w.__mockInvoke = {
      ...previous,
      mt_prefs_get_all: () => ({
        theme: 'paper',
        autoSave: false,
        autoSaveDelay: 5000,
        titleBarStyle: 'custom',
        openFilesInNewWindow: false,
        openFolderInNewWindow: false,
        hideScrollbar: false,
        sideBarVisibility: true,
        tabBarVisibility: true,
        sourceCodeModeEnabled: false,
        searchExclusions: [],
        searchMaxFileSize: '',
        searchIncludeHidden: false,
        searchNoIgnore: false,
        searchFollowSymlinks: false,
        watcherUsePolling: false,
        spellcheckerEnabled: false,
        spellcheckerNoUnderline: false,
        spellcheckerLanguage: 'en-US',
        language: 'en',
        endOfLine: 'default',
        textDirection: 'ltr',
        codeFontSize: '14px',
        codeFontFamily: 'DejaVu Sans Mono',
        editorFontFamily: 'Open Sans',
        fontSize: 16,
        editorLineWidth: '',
        listIndentation: 1,
        frontmatterType: '-',
        followSystemTheme: false,
        lightModeTheme: 'paper',
        darkModeTheme: 'ink',
        customCss: '',
        bulletListMarker: '-',
        orderListDelimiter: '.',
        preferLooseListItem: true,
        tabSize: 4,
        lineHeight: 1.6,
        fontWeight: 'normal',
        trimUnnecessaryCodeBlockEmptyLines: false,
        sequenceTheme: 'hand',
        statusBarVisibility
      })
    }
  }, statusBarVisibility)
}

const callsFor = (page: Page, id: string): Promise<Array<{ id: string; checked: boolean }>> =>
  page.evaluate(
    (id: string) =>
      ((window as any).__menuCheckCalls || []).filter(
        (call: { id: string }) => call.id === id
      ),
    id
  )

const countFor = async (page: Page, id: string): Promise<number> =>
  (await callsFor(page, id)).length

// After boot the value for each id is settled, and every push (hydration
// watcher change + the boot full sync) carries that same final value —
// so ">= 1 call, all equal to the expected value" is deterministic on
// any platform and any watcher/sync interleaving.
async function expectSettled(
  page: Page,
  id: string,
  checked: boolean
): Promise<void> {
  await expect
    .poll(async () => {
      const calls = await callsFor(page, id)
      return calls.length > 0 && calls.every((call) => call.checked === checked)
    }, { timeout: 10_000 })
    .toBe(true)
}

test.describe('View-menu checkmark sync (C-40 T-005)', () => {
  test.beforeEach(async ({ page }) => {
    await installTauriShim(page)
    await recordMenuChecks(page)
  })

  test('boot pushes all four view items with the hydrated state (stored statusBarVisibility:true)', async ({ page }) => {
    await seedStatusBarPref(page, true)
    await bootEditor(page, { sideBarVisibility: true, tabBarVisibility: false })

    // The release-review bug: status bar on after restart, View › Status
    // Bar unchecked. The stored pref must win over every default.
    await expectSettled(page, 'view.status-bar', true)
    await expectSettled(page, 'view.toggle-sidebar', true)
    await expectSettled(page, 'view.toggle-tabbar', false)
    // outlineRailVisible default (on) — untouched by the seeded prefs.
    await expectSettled(page, 'view.outline', true)
  })

  test('toggling via the native-menu command surface pushes exactly one flipped call', async ({ page }) => {
    await seedStatusBarPref(page, true)
    await bootEditor(page, { sideBarVisibility: true, tabBarVisibility: false })

    await expectSettled(page, 'view.status-bar', true)
    const statusBarBefore = await countFor(page, 'view.status-bar')
    const outlineBefore = await countFor(page, 'view.outline')
    const sidebarBefore = await countFor(page, 'view.toggle-sidebar')

    // view.status-bar: true → false (the same route a native menu click
    // takes — the menu-bridge dispatches the item id).
    await page.evaluate(() => {
      ;(window as any).__bus.emit('cmd::execute', 'view.status-bar')
    })
    await expect
      .poll(() => countFor(page, 'view.status-bar'), { timeout: 10_000 })
      .toBe(statusBarBefore + 1)
    const statusBarCalls = await callsFor(page, 'view.status-bar')
    expect(statusBarCalls[statusBarCalls.length - 1]).toEqual({
      id: 'view.status-bar',
      checked: false
    })

    // view.outline: default true → false.
    await page.evaluate(() => {
      ;(window as any).__bus.emit('cmd::execute', 'view.outline')
    })
    await expect
      .poll(() => countFor(page, 'view.outline'), { timeout: 10_000 })
      .toBe(outlineBefore + 1)
    const outlineCalls = await callsFor(page, 'view.outline')
    expect(outlineCalls[outlineCalls.length - 1]).toEqual({
      id: 'view.outline',
      checked: false
    })

    // view.toggle-sidebar: boot seeded true → false (layout-store path).
    await page.evaluate(() => {
      ;(window as any).__bus.emit('cmd::execute', 'view.toggle-sidebar')
    })
    await expect
      .poll(() => countFor(page, 'view.toggle-sidebar'), { timeout: 10_000 })
      .toBe(sidebarBefore + 1)
    const sidebarCalls = await callsFor(page, 'view.toggle-sidebar')
    expect(sidebarCalls[sidebarCalls.length - 1]).toEqual({
      id: 'view.toggle-sidebar',
      checked: false
    })
  })
})
