// FILE: tests/e2e/diagram-appearance.spec.ts
// VERSION: 1.2.0
// START_MODULE_CONTRACT
//   PURPOSE: Verify the reviewed four-mode diagram appearance flow in Chromium and WebKit.
//   SCOPE: Computed colors, source persistence/undo, global theme/cache independence, read-only and mirror behavior, keyboard/menu bounds and fullscreen zoom/focus.
//   DEPENDS: Playwright, tauri-shim, bootEditor/openFileTab.
//   LINKS: .grace/changes/archive/C-62 T-003; .grace/verification/runtime.xml V-M-012.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
// START_MODULE_MAP
//   DOC - authored flowchart palette and an independent Auto pie.
//   FIGURE - selector for live Mermaid figures only.
//   BUTTON - shared inline/viewer appearance control selector.
//   state - current buffer and edit metadata from the real editor store.
//   choose - open a real appearance button and choose a menu mode.
//   fill - computed fill of the unstyled flowchart node B.
//   theme - real preference broadcast to change the document theme.
// END_MODULE_MAP
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.2.0 - 2026-10-18 flake fix: the viewer pan/zoom check
//   waits for the zoom animation to settle before capturing the transform.
//   v1.1.0 - 2026-10-18 C-56 T-007: the control is the corner pill's leading item; the clearance check became hover-reveal + right-edge anchor.
//   v1.0.0 - 2026-10-18 C-62: cross-engine appearance, persistence and viewer regression gate.
// END_CHANGE_SUMMARY
import { test, expect, type Page, type Locator } from '@playwright/test'
import { installTauriShim } from './fixtures/tauri-shim'
import { bootEditor, openFileTab } from './fixtures/helpers'

const DOC = '# Appearance\n\nBefore unchanged.\n\n```mermaid\n---\nconfig:\n  theme: base\n  themeVariables:\n    background: "#fff7e8"\n    primaryColor: "#ffe0b2"\n    primaryTextColor: "#3c352d"\n---\nflowchart LR\nA["From a community Markdown editor"] --> B["Across a completely new architecture"] --> C["Toward an independent Mark"]\nclassDef own fill:#dbeafe,color:#172554\nclass A own\n```\n\nAfter unchanged.\n\n```mermaid\npie\n"One": 1\n"Two": 2\n```\n'
const FIGURE = '.editor-with-tabs figure[data-role="MERMAID"]'
const BUTTON = 'button.ag-diagram-appearance'
async function state(page: Page) {
  return page.evaluate(() => {
    const file = (document.querySelector('#app') as any).__vue_app__.config.globalProperties.$pinia.state.value.editor.currentFile
    return { markdown: file.markdown, isSaved: file.isSaved, revision: file.contentRevision, index: file.history?.index, length: file.history?.stack.length }
  })
}
async function choose(page: Page, mode: string, button?: Locator) {
  await (button || page.locator(FIGURE).first().locator(BUTTON)).click()
  await page.locator(`.ag-diagram-appearance-option[data-mode="${mode}"]`).click()
}
async function fill(page: Page, selector = FIGURE) {
  return page.locator(selector).first().locator('[data-id="B"] rect').evaluate(element => getComputedStyle(element).fill)
}
async function theme(page: Page, name: string) {
  await page.evaluate(theme => (window as any).__emitFakeEvent('mt::user-preference', { theme }), name)
}

test.describe('per-diagram appearance (C-62)', () => {
  test.beforeEach(async ({ page }) => {
    await installTauriShim(page)
    await page.addInitScript(() => {
      ;(window as any).__mockInvoke.mt_prefs_get_all = () => ({ theme: 'paper', language: 'en', autoSave: false, spellcheckerEnabled: false, followSystemTheme: false, lightModeTheme: 'paper', darkModeTheme: 'ink' })
    })
    await bootEditor(page)
    await openFileTab(page, '/tmp/c62/appearance.md', DOC)
    await expect(page.locator(`${FIGURE} .ag-pele-preview > svg`)).toHaveCount(2)
  })

  test('four modes are isolated, persisted, undoable and survive a fresh parse', async ({ page }) => {
    const preview = page.locator(FIGURE).first().locator('.ag-pele-preview')
    // C-56 T-007: the control is the corner pill's leading item — hidden
    // at rest, revealed on figure hover, pinned to the figure's right edge.
    const pill = page.locator(FIGURE).first().locator('div.ag-block-toolbar')
    await expect(pill.locator(`> ${BUTTON}`)).toHaveCount(1)
    await page.locator('h1').first().hover()
    await expect(pill).toHaveCSS('opacity', '0')
    await preview.hover()
    await expect(pill).toHaveCSS('opacity', '1')
    const figureBox = await page.locator(FIGURE).first().boundingBox()
    const pillBox = await pill.boundingBox()
    expect(Math.abs(figureBox!.x + figureBox!.width - (pillBox!.x + pillBox!.width))).toBeLessThanOrEqual(12)
    expect(pillBox!.y - figureBox!.y).toBeLessThanOrEqual(12)
    await choose(page, 'custom')
    await expect.poll(() => fill(page)).toBe('rgb(255, 224, 178)')
    await expect.poll(() => preview.locator('svg').evaluate(element => getComputedStyle(element).backgroundColor)).toBe('rgb(255, 247, 232)')
    await expect.poll(async () => (await state(page)).markdown).toContain('%% mark:appearance custom %%')
    expect((await state(page)).isSaved).toBe(false)
    await choose(page, 'light')
    await expect.poll(() => fill(page)).toBe('rgb(232, 237, 246)')
    await expect.poll(() => page.locator(FIGURE).first().locator('[data-id="A"] rect').evaluate(element => getComputedStyle(element).fill)).toBe('rgb(232, 237, 246)')
    await choose(page, 'dark')
    await expect.poll(() => fill(page)).toBe('rgb(48, 61, 85)')
    await expect.poll(() => preview.locator('svg').evaluate(element => getComputedStyle(element).backgroundColor)).toBe('rgb(27, 34, 48)')
    await expect(page.locator(FIGURE).nth(1).locator('.ag-pele-preview')).toHaveAttribute('data-diagram-appearance', 'auto')
    await page.evaluate(() => (window as any).__emitFakeEvent('mt::menu-invoked', 'edit.undo'))
    await expect.poll(() => fill(page)).toBe('rgb(232, 237, 246)')
    const saved = (await state(page)).markdown
    expect(saved).toContain('primaryColor: "#ffe0b2"')
    expect(saved).toContain('Before unchanged.')
    expect(saved).toContain('After unchanged.')
    await openFileTab(page, '/tmp/c62/reopened.md', saved)
    await expect.poll(() => fill(page)).toBe('rgb(232, 237, 246)')
    await choose(page, 'auto')
    await expect.poll(async () => (await state(page)).markdown).not.toContain('mark:appearance')
  })

  test('Auto follows the document while custom/fixed choices keep colors without new Pele renders', async ({ page }) => {
    const renders: string[] = []
    page.on('console', message => { if (message.text().includes('[BLOCK_PELE_RENDER]')) renders.push(message.text()) })
    const slice = page.locator(FIGURE).nth(1).locator('.pele-slice').first()
    const originalSlice = await slice.evaluate(element => getComputedStyle(element).fill)
    await choose(page, 'custom')
    const own = await fill(page)
    await theme(page, 'ink')
    await expect.poll(() => slice.evaluate(element => getComputedStyle(element).fill)).not.toBe(originalSlice)
    expect(await fill(page)).toBe(own)
    await choose(page, 'light')
    await theme(page, 'paper')
    await expect.poll(() => fill(page)).toBe('rgb(232, 237, 246)')
    expect(renders).toHaveLength(0)
  })

  test('locked document choices remain view-only and leave saved/edit metadata untouched', async ({ page }) => {
    await page.evaluate(() => (window as any).__bus.emit('cmd::execute', 'view.lock-document'))
    await expect(page.locator('.editor-component').first()).toHaveAttribute('aria-readonly', 'true')
    const before = await state(page)
    await page.locator(FIGURE).first().locator(BUTTON).click()
    await expect(page.locator('.ag-diagram-appearance-readonly')).toContainText('For this view only')
    await page.locator('[data-mode="dark"].ag-diagram-appearance-option').click()
    await expect.poll(() => fill(page)).toBe('rgb(48, 61, 85)')
    expect(await state(page)).toEqual(before)
    await page.evaluate(() => (window as any).__bus.emit('cmd::execute', 'view.lock-document'))
    await expect(page.locator(FIGURE).first().locator('.ag-pele-preview')).toHaveAttribute('data-diagram-appearance', 'auto')
    expect(await state(page)).toEqual(before)
    await page.keyboard.type('Unlocked')
    await expect.poll(async () => (await state(page)).markdown).toContain('Unlocked')
  })

  test('source-side Split View mirror choices never write back into the source', async ({ page }) => {
    await page.evaluate(() => (window as any).__emitFakeEvent('mt::menu-invoked', 'view.split-view'))
    await page.evaluate(() => (window as any).__emitFakeEvent('mt::menu-invoked', 'view.source-code-mode'))
    const mirror = page.locator('.editor-wrapper.is-mirror')
    await expect(mirror).toBeVisible()
    const before = await state(page)
    await choose(page, 'dark', mirror.locator(BUTTON).first())
    expect(await state(page)).toEqual(before)
    await expect(mirror.locator('.ag-pele-preview').first()).toHaveAttribute('data-diagram-appearance', 'dark')
  })

  test('keyboard skips unavailable Custom and the menu stays within a narrow viewport', async ({ page }) => {
    await page.setViewportSize({ width: 400, height: 720 })
    const button = page.locator(FIGURE).nth(1).locator(BUTTON)
    await button.scrollIntoViewIfNeeded()
    await button.focus()
    await page.keyboard.press('Enter')
    const menu = page.locator('.ag-diagram-appearance-menu')
    await expect(menu).toBeVisible()
    await expect(menu.locator('[data-mode="custom"]')).toBeDisabled()
    await page.keyboard.press('ArrowDown')
    await expect(menu.locator('[data-mode="light"]')).toBeFocused()
    const box = await menu.boundingBox()
    expect(box!.x).toBeGreaterThanOrEqual(8)
    expect(box!.x + box!.width).toBeLessThanOrEqual(392)
    expect(box!.y).toBeGreaterThanOrEqual(8)
    expect(box!.y + box!.height).toBeLessThanOrEqual(712)
    await page.screenshot({ path: `test-results/c62-menu-${test.info().project.name}.png` })
    await page.keyboard.press('Escape')
    await expect(menu).toHaveCount(0)
    await expect(button).toBeFocused()
  })

  test('viewer shares the mode, keeps pan/zoom, and Escape dismisses the menu first', async ({ page }) => {
    const figure = page.locator(FIGURE).first()
    const originalFill = await fill(page)
    await figure.locator('button.ag-block-toolbar-expand').click()
    const viewer = page.locator('.ag-block-viewer-open')
    await expect(viewer).toBeVisible()
    // The viewer performs its final fit after layout; wait for those two
    // frames before measuring a user zoom, rather than capturing the old fit.
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
    const canvas = viewer.locator('.ag-block-viewer-canvas')
    const beforeZoom = await canvas.evaluate(element => (element as HTMLElement).style.transform)
    await viewer.locator('.ag-block-viewer-zoom-in').click()
    await expect.poll(() => canvas.evaluate(element => (element as HTMLElement).style.transform)).not.toBe(beforeZoom)
    // The zoom animates: wait until the transform holds still across a few
    // frames, otherwise a slow runner captures a mid-animation value.
    const settledTransform = () => canvas.evaluate(element => new Promise<string>(resolve => {
      let last = (element as HTMLElement).style.transform
      let same = 0
      const tick = () => {
        const now = (element as HTMLElement).style.transform
        same = now === last ? same + 1 : 0
        last = now
        if (same >= 5) resolve(now)
        else requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    }))
    const transform = await settledTransform()
    const button = viewer.locator(BUTTON)
    await choose(page, 'custom', button)
    await expect.poll(() => fill(page, '.ag-block-viewer-open')).toBe('rgb(255, 224, 178)')
    expect(await canvas.evaluate(element => (element as HTMLElement).style.transform)).toBe(transform)
    await page.evaluate(() => (window as any).__emitFakeEvent('mt::menu-invoked', 'edit.undo'))
    await expect.poll(() => fill(page, '.ag-block-viewer-open')).toBe(originalFill)
    await expect(button).toHaveAttribute('data-appearance-mode', 'auto')
    await button.click()
    await page.keyboard.press('Escape')
    await expect(page.locator('.ag-diagram-appearance-menu')).toHaveCount(0)
    await expect(viewer).toBeVisible()
    await expect(button).toBeFocused()
    await page.screenshot({ path: `test-results/c62-viewer-${test.info().project.name}.png` })
    await page.keyboard.press('Escape')
    await expect(viewer).toHaveCount(0)
  })
})
