/**
 * titlebar-mode-chips.spec.ts — C-TITLEBAR-MODE-CHIPS T-007.
 *
 * The chips cluster and its two-group switch menu, driven through the real
 * command path (mt::menu-invoked → the shipped view.* command ids) exactly
 * as the native View menu does. Covers the nine cases the plan pins:
 * standard state, split + writing chips, per-tab swap, one-click exit,
 * dual-flag truth, live menu updates, the narrow note, zero tabs, and the
 * screenshots for the owner's visual pass.
 */

import { test, expect, type Page } from '@playwright/test'
import { installTauriShim } from './fixtures/tauri-shim'
import { bootEditor, openFileTab } from './fixtures/helpers'

const DOC = '# Chips\n\nFirst paragraph.\n\nSecond paragraph.\n'
const narrowNote = /too narrow/

const invokeCommand = async (page: Page, id: string): Promise<void> => {
  await page.evaluate((cmd) => (window as any).__emitFakeEvent('mt::menu-invoked', cmd), id)
}

const chips = (page: Page) => page.locator('[data-testid="mode-chips"] button')
const menu = (page: Page) => page.locator('[data-testid="mode-menu"]')
const viewRows = (page: Page) => menu(page).locator('[role="menuitemradio"]')
const writingRows = (page: Page) => menu(page).locator('[role="menuitemcheckbox"]')

const openMenu = async (page: Page): Promise<void> => {
  await chips(page).first().click()
  await expect(menu(page)).toBeVisible()
}

const editorState = async (page: Page): Promise<any> =>
  page.evaluate(() => {
    const el = document.querySelector('#app') as any
    const state = el?.__vue_app__?.config?.globalProperties?.$pinia?.state?.value
    const tab = state?.editor?.currentFile ?? {}
    return {
      tabs: (state?.editor?.tabs ?? []).length,
      splitView: !!tab.splitView,
      diffMode: !!tab.diffMode,
      sourceCode: !!state?.preferences?.sourceCode,
      typewriter: !!state?.preferences?.typewriter,
      focus: !!state?.preferences?.focus
    }
  })

test.describe('titlebar mode chips (C-TITLEBAR-MODE-CHIPS)', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await installTauriShim(page)
  })

  test('1. standard state renders no chip wrapper at all', async ({ page }) => {
    await bootEditor(page)
    await openFileTab(page, '/tmp/ctb/standard.md', DOC)
    await expect(page.locator('.ag-paragraph').first()).toBeVisible()
    await expect(page.locator('[data-testid="mode-chips"]')).toHaveCount(0)
    await page.screenshot({ path: '.artifacts/ctb-smoke/01-standard.png' })
  })

  test('2. split shows the labelled view chip, typewriter adds a compact chip', async ({ page }) => {
    await bootEditor(page)
    await openFileTab(page, '/tmp/ctb/split.md', DOC)

    await invokeCommand(page, 'view.split-view')
    await expect(chips(page)).toHaveCount(1)
    await expect(chips(page).first()).toContainText('Split')
    await expect(chips(page).first()).toHaveAttribute('title', /source and rendered side by side/)

    await invokeCommand(page, 'view.typewriter-mode')
    await expect(chips(page)).toHaveCount(2)
    const writingChip = page.locator('[data-testid="mode-chips"] button[aria-label="Typewriter"]')
    await expect(writingChip).toHaveCount(1)
    await expect(writingChip).not.toContainText('Typewriter')
    await page.screenshot({ path: '.artifacts/ctb-smoke/02-split-typewriter.png' })
  })

  test('3. the view chip follows the tab; the writing chip does not', async ({ page }) => {
    await bootEditor(page)
    await openFileTab(page, '/tmp/ctb/one.md', '# One\n')
    await invokeCommand(page, 'view.split-view')
    await invokeCommand(page, 'view.typewriter-mode')
    await expect(chips(page)).toHaveCount(2)

    await openFileTab(page, '/tmp/ctb/two.md', '# Two\n')
    await expect(chips(page)).toHaveCount(1)
    await expect(chips(page).first()).toHaveAttribute('aria-label', 'Typewriter')

    await page.locator('.tabs-container li', { hasText: 'one.md' }).click()
    await expect(chips(page)).toHaveCount(2)
    await expect(chips(page).first()).toContainText('Split')
  })

  test('4. one click on Standard leaves split view', async ({ page }) => {
    await bootEditor(page)
    await openFileTab(page, '/tmp/ctb/exit.md', DOC)
    await invokeCommand(page, 'view.split-view')
    await expect(page.locator('.split-view.is-split')).toBeVisible()

    await openMenu(page)
    await viewRows(page).nth(0).click()

    await expect(page.locator('[data-testid="mode-chips"]')).toHaveCount(0)
    await expect(page.locator('.split-view.is-split')).toHaveCount(0)
    const state = await editorState(page)
    expect(state.splitView).toBe(false)
    expect(state.diffMode).toBe(false)
    expect(state.sourceCode).toBe(false)
  })

  test('5. diff truth beats a stale split flag; Standard clears both', async ({ page }) => {
    await bootEditor(page)
    await openFileTab(page, '/tmp/ctb/dual.md', DOC)
    await invokeCommand(page, 'view.split-view')
    await invokeCommand(page, 'view.diff-mode')
    await expect(chips(page)).toHaveCount(1)
    await expect(chips(page).first()).toContainText('Changes')

    await openMenu(page)
    await viewRows(page).nth(0).click()
    await expect(page.locator('[data-testid="mode-chips"]')).toHaveCount(0)
    const state = await editorState(page)
    expect(state.splitView).toBe(false)
    expect(state.diffMode).toBe(false)
  })

  test('5a. the native View › Standard View menu id performs the same full reset (FIX-021)', async ({ page }) => {
    await bootEditor(page)
    await openFileTab(page, '/tmp/ctb/menu-standard.md', DOC)
    // Every mode on: diff truth over a stale split flag, plus both
    // writing modes and source view.
    await invokeCommand(page, 'view.split-view')
    await invokeCommand(page, 'view.diff-mode')
    await invokeCommand(page, 'view.source-code-mode')
    await invokeCommand(page, 'view.typewriter-mode')
    await invokeCommand(page, 'view.focus-mode')
    await expect(chips(page).first()).toContainText('Changes')

    // The native menu row dispatches view.standard-mode through the same
    // mt::menu-invoked route the m009 item rides.
    await invokeCommand(page, 'view.standard-mode')

    await expect(page.locator('[data-testid="mode-chips"]')).toHaveCount(0)
    const state = await editorState(page)
    expect(state.splitView).toBe(false)
    expect(state.diffMode).toBe(false)
    expect(state.sourceCode).toBe(false)
    expect(state.typewriter).toBe(false)
    expect(state.focus).toBe(false)
  })

  test('6. the open menu updates while a mode toggles elsewhere', async ({ page }) => {
    await bootEditor(page)
    await openFileTab(page, '/tmp/ctb/live.md', DOC)
    await invokeCommand(page, 'view.split-view')
    await openMenu(page)
    await expect(viewRows(page).nth(1)).toHaveAttribute('aria-checked', 'true')

    await invokeCommand(page, 'view.split-view')

    await expect(menu(page)).toBeVisible()
    await expect(viewRows(page).nth(0)).toHaveAttribute('aria-checked', 'true')
    await expect(page.locator('[data-testid="mode-chips"]')).toHaveCount(0)
  })

  test('7. a collapsed split keeps the chip and explains the narrow window', async ({ page }) => {
    await page.setViewportSize({ width: 700, height: 800 })
    await bootEditor(page)
    await openFileTab(page, '/tmp/ctb/narrow.md', DOC)
    await invokeCommand(page, 'view.split-view')

    await expect(page.locator('.split-view.is-split')).toHaveCount(0)
    await expect(chips(page)).toHaveCount(1)
    await expect(chips(page).first()).toContainText('Split')
    await expect(chips(page).first()).toHaveAttribute('title', narrowNote)
  })

  test('8. with zero open tabs nothing renders', async ({ page }) => {
    await bootEditor(page)
    await openFileTab(page, '/tmp/ctb/close.md', DOC)
    await invokeCommand(page, 'view.split-view')
    await expect(chips(page)).toHaveCount(1)

    await invokeCommand(page, 'file.close-tab')
    await page.waitForTimeout(300)

    const state = await editorState(page)
    expect(state.tabs).toBe(0)
    await expect(page.locator('[data-testid="mode-chips"]')).toHaveCount(0)
  })

  test('9. screenshots of the bar states for the visual pass', async ({ page }) => {
    await bootEditor(page)
    await openFileTab(page, '/tmp/ctb/visual.md', DOC)
    await invokeCommand(page, 'view.split-view')
    await invokeCommand(page, 'view.focus-mode')
    await expect(chips(page)).toHaveCount(2)

    await openMenu(page)
    await page.screenshot({ path: '.artifacts/ctb-smoke/09-menu-open.png' })
    await expect(menu(page)).toBeVisible()

    // The chip icon must render at the neighbouring theme button's size
    // (the T-004 deferral): compare the drawn svg boxes.
    const chipIcon = await page
      .locator('[data-testid="mode-chips"] button svg')
      .first()
      .boundingBox()
    const themeIcon = await page
      .locator('.titlebar-right .titlebar-nav-btn svg')
      .first()
      .boundingBox()
    expect(chipIcon?.width).toBe(themeIcon?.width)
    expect(chipIcon?.height).toBe(themeIcon?.height)
  })
})
