/**
 * regression-2026-10-15.spec.ts — end-to-end scenarios over everything
 * touched on 2026-10-15: the Auto/Light/Dark cycle (C-41 T-001 + the Auto
 * fix), retired-theme migration at boot (C-41 T-002), the theme families
 * and new members (T-003), code-block line numbers and their one-time
 * migration (C-38 T-005), and the new Settings window (C-38 T-003/T-004):
 * tabs, legacy routes, remembered tab, ⌘F search, family tiles, segmented
 * mode, steppers, Custom CSS sheet, Restore defaults, retired image upload,
 * dropped preferences, RU labels and the window title.
 *
 * Preferences are a stateful mock: mt_prefs_set writes into an object kept
 * in sessionStorage (survives reloads inside one test) and every write is
 * recorded in window.__prefWrites for assertions.
 */

import { test, expect, type Page } from '@playwright/test'
import { installTauriShim } from './fixtures/tauri-shim'
import { bootEditor, openFileTab } from './fixtures/helpers'

type Prefs = Record<string, unknown>

const BASE_PREFS: Prefs = {
  theme: 'paper',
  followSystemTheme: false,
  lightModeTheme: 'paper',
  darkModeTheme: 'ink',
  language: 'en',
  autoSave: false,
  autoSaveDelay: 1500,
  fontSize: 16,
  lineHeight: 1.6,
  codeFontSize: 14,
  editorFontFamily: 'Open Sans',
  codeFontFamily: 'DejaVu Sans Mono',
  tabSize: 4,
  titleBarStyle: 'custom',
  sideBarVisibility: false,
  tabBarVisibility: true,
  sourceCodeModeEnabled: false,
  codeBlockLineNumbers: false,
  codeBlockLineNumbersMigrated: true,
  wrapCodeBlocks: true,
  imageInsertAction: 'folder',
  customCss: ''
}

async function installPrefs (page: Page, overrides: Prefs = {}): Promise<void> {
  await installTauriShim(page)
  await page.addInitScript((initial: Prefs) => {
    const w = window as any
    const KEY = '__e2ePrefs'
    let prefs: Prefs
    try {
      prefs = JSON.parse(sessionStorage.getItem(KEY) || 'null') || initial
    } catch {
      prefs = initial
    }
    w.__prefWrites = JSON.parse(sessionStorage.getItem(KEY + 'W') || '[]')
    w.__titles = []
    const persist = () => {
      sessionStorage.setItem(KEY, JSON.stringify(prefs))
      sessionStorage.setItem(KEY + 'W', JSON.stringify(w.__prefWrites))
    }
    w.__mockInvoke = {
      ...(w.__mockInvoke || {}),
      mt_build_mode: () => ({ setDefaultHandler: true }),
      mt_prefs_get_all: () => ({ ...prefs }),
      mt_prefs_get: ({ key }: { key: string }) => prefs[key],
      mt_prefs_set: ({ key, value }: { key: string; value: unknown }) => {
        prefs[key] = value
        w.__prefWrites.push({ key, value })
        persist()
        return null
      },
      'plugin:window|set_title': ({ value }: { value: string }) => {
        w.__titles.push(value)
        return null
      }
    }
  }, { ...BASE_PREFS, ...overrides })
}

const writes = (page: Page) => page.evaluate(() => (window as any).__prefWrites as Array<{ key: string; value: unknown }>)
const lastWrite = async (page: Page, key: string) => {
  const all = await writes(page)
  const hit = [...all].reverse().find((w) => w.key === key)
  return hit ? hit.value : undefined
}

async function openSettings (page: Page, route: string): Promise<void> {
  await page.setViewportSize({ width: 640, height: 620 })
  await page.goto(`/?type=settings&wid=0&udp=/tmp/mark-e2e&debug=0&theme=paper#/preference${route}`)
  await page.locator('.pref-toolbar').waitFor({ state: 'visible', timeout: 15_000 })
  await page.waitForTimeout(300)
}

const activeTab = (page: Page) => page.locator('.pref-toolbar .pref-tab--active').getAttribute('data-tab')
const row = (page: Page, label: string | RegExp) => page.locator('.pref-row', { has: page.locator('.pref-row-label', { hasText: label }) })
const isDark = (page: Page) => page.evaluate(() => document.body.classList.contains('dark'))
const themeButton = (page: Page) => page.locator('.titlebar-nav-btn[aria-label*="Theme"], .titlebar-nav-btn[title*="Theme"]').first()

// ── C-41: title-bar Auto / Light / Dark ──────────────────────────────────

test.describe('theme cycle in the editor title bar (C-41)', () => {
  test('Auto → Light → Dark → Auto on a LIGHT system lands on the light member (the 2026-10-15 Auto bug)', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' })
    await installPrefs(page, { followSystemTheme: true, theme: 'ink' })
    await bootEditor(page)
    expect(await isDark(page)).toBe(false)

    await themeButton(page).click() // Auto → Light
    await expect.poll(() => lastWrite(page, 'followSystemTheme')).toBe(false)
    await expect.poll(() => lastWrite(page, 'theme')).toBe('paper')
    expect(await isDark(page)).toBe(false)

    await themeButton(page).click() // Light → Dark
    await expect.poll(() => isDark(page)).toBe(true)
    expect(await lastWrite(page, 'theme')).toBe('ink')

    await themeButton(page).click() // Dark → Auto
    await expect.poll(() => lastWrite(page, 'followSystemTheme')).toBe(true)
    await expect.poll(() => isDark(page)).toBe(false)
  })

  test('Auto on a DARK system shows the dark member', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' })
    await installPrefs(page, { followSystemTheme: true, theme: 'paper' })
    await bootEditor(page)
    await expect.poll(() => isDark(page)).toBe(true)
  })
})

// ── C-41 T-002: retired themes migrate at boot ──────────────────────────

test.describe('retired theme migration at boot (C-41 T-002)', () => {
  test('a stored synthwave-84 opens as Dracula and every retired key is rewritten once', async ({ page }) => {
    await installPrefs(page, { theme: 'synthwave-84', lightModeTheme: 'light', darkModeTheme: 'monokai-pro' })
    await bootEditor(page)
    await expect.poll(() => isDark(page)).toBe(true)
    await expect.poll(() => lastWrite(page, 'theme')).toBe('dracula')
    expect(await lastWrite(page, 'lightModeTheme')).toBe('paper')
    expect(await lastWrite(page, 'darkModeTheme')).toBe('one-dark')
    const themeVar = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--editorBgColor').trim())
    expect(themeVar.length).toBeGreaterThan(0)

    // A second boot finds valid values and writes nothing theme-related.
    await page.evaluate(() => { (window as any).__prefWrites.length = 0; sessionStorage.setItem('__e2ePrefsW', '[]') })
    await bootEditor(page)
    await page.waitForTimeout(800)
    const again = (await writes(page)).filter((w) => ['theme', 'lightModeTheme', 'darkModeTheme'].includes(w.key))
    expect(again).toEqual([])
  })
})

// ── C-38 T-005: code-block line numbers ─────────────────────────────────

test.describe('code-block line numbers (C-38 T-005)', () => {
  test('a never-settable stored true is migrated off once; no gutter renders', async ({ page }) => {
    await installPrefs(page, { codeBlockLineNumbers: true, codeBlockLineNumbersMigrated: false })
    await bootEditor(page)
    await openFileTab(page, '/tmp/e2e/ln.md', '# t\n\n```js\nconst a = 1\nconst b = 2\n```\n')
    await expect.poll(() => lastWrite(page, 'codeBlockLineNumbersMigrated')).toBe(true)
    expect(await lastWrite(page, 'codeBlockLineNumbers')).toBe(false)
    await expect(page.locator('pre.ag-paragraph')).toHaveCount(1)
    await expect(page.locator('.line-numbers-rows')).toHaveCount(0)
  })

  test('turned on in Settings › Editor it persists true', async ({ page }) => {
    await installPrefs(page)
    await openSettings(page, '/editor')
    const sw = row(page, 'Show line numbers').locator('[role="switch"]')
    await expect(sw).toHaveAttribute('aria-checked', 'false')
    await sw.click()
    await expect.poll(() => lastWrite(page, 'codeBlockLineNumbers')).toBe(true)
  })
})

// ── C-38 T-003: Settings shell ──────────────────────────────────────────

test.describe('Settings window shell (C-38 T-003)', () => {
  test('legacy routes land on their new tabs', async ({ page }) => {
    await installPrefs(page)
    for (const [legacy, tab] of [['/theme', 'appearance'], ['/image', 'advanced'], ['/spelling', 'editor'], ['/keybindings', 'advanced'], ['/language', 'general']]) {
      await openSettings(page, legacy)
      await expect.poll(() => activeTab(page)).toBe(tab)
    }
  })

  test('the last tab is remembered and the window title follows the tab', async ({ page }) => {
    await installPrefs(page)
    await openSettings(page, '/markdown')
    await expect.poll(() => page.evaluate(() => (window as any).__titles.at(-1))).toMatch(/Markdown/)
    await page.locator('.pref-toolbar [data-tab="editor"]').click()
    await expect.poll(() => page.evaluate(() => (window as any).__titles.at(-1))).toMatch(/Editor/)
    await openSettings(page, '')
    await expect.poll(() => activeTab(page)).toBe('editor')
  })

  test('⌘F search finds "Math formulas" and lands on the Markdown tab', async ({ page }) => {
    await installPrefs(page)
    await openSettings(page, '/general')
    await page.keyboard.press('ControlOrMeta+f')
    const input = page.locator('.pref-search-input')
    await expect(input).toBeVisible()
    await input.fill('math')
    const results = page.locator('.pref-search-results li')
    await expect(results.first()).toBeVisible()
    await page.keyboard.press('Enter')
    await expect.poll(() => activeTab(page)).toBe('markdown')
    await expect(row(page, 'Math formulas')).toBeVisible()
  })
})

// ── C-38 T-004: Settings content ────────────────────────────────────────

test.describe('Settings content (C-38 T-004)', () => {
  test('Appearance: Dark segment and a family tile persist the right members', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' })
    await installPrefs(page)
    await openSettings(page, '/appearance')
    // Manual Light already (followSystemTheme false): Dark only re-pins theme.
    await page.locator('.pref-segment', { hasText: 'Dark' }).click()
    await expect.poll(() => lastWrite(page, 'theme')).toBe('ink')
    await expect.poll(() => isDark(page)).toBe(true)

    await page.locator('.theme-family-tile[data-family="dracula"]').click()
    await expect.poll(() => lastWrite(page, 'theme')).toBe('dracula')
    expect(await lastWrite(page, 'lightModeTheme')).toBe('alucard')
    expect(await lastWrite(page, 'darkModeTheme')).toBe('dracula')
    await expect(page.locator('.theme-family-tile.is-selected')).toHaveAttribute('data-family', 'dracula')

    await page.locator('.pref-segment', { hasText: 'Light' }).click()
    await expect.poll(() => lastWrite(page, 'theme')).toBe('alucard')
    await expect.poll(() => isDark(page)).toBe(false)
  })

  test('Leaving Auto persists the member even when it already looks applied', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' })
    // Stored theme is stale (ink) while Auto resolves paper in memory.
    await installPrefs(page, { followSystemTheme: true, theme: 'ink' })
    await openSettings(page, '/appearance')
    await page.locator('.pref-segment', { hasText: 'Light' }).click()
    await expect.poll(() => lastWrite(page, 'theme')).toBe('paper')
  })

  test('General: autosave delay shows seconds and steps by 0.1 s (stored in ms)', async ({ page }) => {
    await installPrefs(page, { autoSave: true, autoSaveDelay: 1500 })
    await openSettings(page, '/general')
    const delay = row(page, 'Save after a pause of')
    await expect(delay.locator('.pref-value')).toHaveText('1.5 s')
    await delay.locator('[aria-label="Increase"]').click()
    await expect.poll(() => lastWrite(page, 'autoSaveDelay')).toBe(1600)
    await expect(delay.locator('.pref-value')).toHaveText('1.6 s')
  })

  test('Editor: a legacy "14px" code size shows "14 px" and steps as a number', async ({ page }) => {
    await installPrefs(page, { codeFontSize: '14px' })
    await openSettings(page, '/editor')
    const size = row(page, 'Code text size')
    await expect(size.locator('.pref-value')).toHaveText('14 px')
    await size.locator('[aria-label="Increase"]').click()
    await expect.poll(() => lastWrite(page, 'codeFontSize')).toBe(15)
  })

  test('Advanced: image upload stays retired — a stored "upload" shows "Copy it into a folder"', async ({ page }) => {
    await installPrefs(page, { imageInsertAction: 'upload' })
    await openSettings(page, '/advanced')
    const select = row(page, 'When I add an image').locator('select')
    await expect(select).toHaveValue('folder')
    const values = await select.locator('option').evaluateAll((os) => os.map((o) => (o as HTMLOptionElement).value))
    expect(values).toEqual(['folder', 'path'])
    await expect(page.getByText(/upload/i)).toHaveCount(0)
  })

  test('Advanced: Custom CSS sheet saves the stylesheet', async ({ page }) => {
    await installPrefs(page)
    await openSettings(page, '/advanced')
    await row(page, 'Custom CSS').locator('.pref-button').click()
    const area = page.locator('textarea.pref-custom-css')
    await expect(area).toBeVisible()
    await area.fill('p { letter-spacing: 0.01em; }')
    await page.locator('.pref-custom-css-btn.is-primary').click()
    await expect.poll(() => lastWrite(page, 'customCss')).toBe('p { letter-spacing: 0.01em; }')
  })

  test('Advanced: Restore all defaults asks first; Cancel keeps, Restore resets', async ({ page }) => {
    await installPrefs(page, { autoSave: true, tabSize: 2 })
    await openSettings(page, '/advanced')
    const restore = row(page, 'Restore all defaults').locator('.pref-button')

    await restore.click()
    await expect(page.locator('.pref-reset-overlay')).toBeVisible()
    await page.locator('.pref-reset-btn', { hasText: 'Cancel' }).click()
    await expect(page.locator('.pref-reset-overlay')).toHaveCount(0)
    expect(await lastWrite(page, 'autoSave')).toBeUndefined()

    await restore.click()
    await page.locator('.pref-reset-btn.is-danger').click()
    await expect.poll(() => lastWrite(page, 'autoSave')).toBe(false)
    expect(await lastWrite(page, 'tabSize')).toBe(4)
  })

  test('dropped preferences are gone from every tab', async ({ page }) => {
    await installPrefs(page)
    for (const tab of ['general', 'appearance', 'editor', 'markdown', 'advanced']) {
      await openSettings(page, `/${tab}`)
      for (const gone of ['Open files in new window', 'Open folders in new window', 'Exclude patterns', 'Sort field', 'Startup action', 'Upload images to', 'Zoom']) {
        await expect(page.locator('.pref-row-label', { hasText: gone })).toHaveCount(0)
      }
    }
  })

  test('Russian UI: tab labels, segmented options and decimal comma are localized', async ({ page }) => {
    await installPrefs(page, { language: 'ru', autoSave: true })
    await openSettings(page, '/general')
    await expect(page.locator('.pref-toolbar [data-tab="general"]')).toContainText('Основные')
    await expect(page.locator('.pref-toolbar [data-tab="advanced"]')).toContainText('Дополнительно')
    await expect(row(page, 'Интервал автосохранения').locator('.pref-value')).toHaveText('1,5 с')
    await page.locator('.pref-toolbar [data-tab="appearance"]').click()
    await expect(page.locator('.pref-segment', { hasText: 'Авто' })).toBeVisible()
    await expect(page.locator('.pref-segment', { hasText: 'Auto' })).toHaveCount(0)
  })
})
