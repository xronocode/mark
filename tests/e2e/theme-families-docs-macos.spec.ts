import { test, expect, type Page } from '@playwright/test'
import { installTauriShim } from './fixtures/tauri-shim'
import { bootEditor, openFileTab } from './fixtures/helpers'

// C-51 T-007: the Docs and macOS theme families (R-5) — every member
// applies its canvas colours to the editor surface, mirrors its
// --chartPalette (mermaidTheme.readActiveThemeTokens reads that mirror),
// a Mermaid pie's first slice takes the palette's first colour (#007AFF
// in macOS light), the document rides the system UI font while code keeps
// the code font, the title-bar cycle switches within the family, and the
// Settings family picker lists and applies the new families. Runs in
// chromium and the webkit-theme-families project.

const THEMES = ['docs', 'docs-dark', 'macos', 'macos-dark'] as const
type ThemeId = (typeof THEMES)[number]

// Canvas-pinned values (canvas Main/DocsDark/MacOS) — rgb() as the
// browsers serialize the computed colours.
const EXPECTED: Record<ThemeId, { bg: string; text: string; dark: boolean; firstSlice: string }> = {
  docs: { bg: 'rgb(252, 252, 251)', text: 'rgb(31, 31, 31)', dark: false, firstSlice: 'rgb(79, 107, 237)' },
  'docs-dark': { bg: 'rgb(22, 22, 21)', text: 'rgb(236, 236, 234)', dark: true, firstSlice: 'rgb(124, 147, 245)' },
  macos: { bg: 'rgb(255, 255, 255)', text: 'rgb(29, 29, 31)', dark: false, firstSlice: 'rgb(0, 122, 255)' },
  'macos-dark': { bg: 'rgb(30, 30, 30)', text: 'rgb(245, 245, 247)', dark: true, firstSlice: 'rgb(10, 132, 255)' }
}

const PIE_DOC = `# Theme families

A paragraph in the document font, plus a pie that must use the theme palette.

\`\`\`mermaid
pie title Where the time went
"Writing" : 46
"Editing" : 28
"Reviewing" : 16
"Formatting" : 10
\`\`\`

\`\`\`js
// code keeps the code font
const answer = 42
\`\`\`
`

const PREVIEW_SVG = 'figure.ag-container-block div.ag-container-preview svg'

/**
 * Resolve a CSS variable the way the browser resolves it for a real
 * element (same probe as mermaid-theme.spec.ts).
 */
async function resolveVar(page: Page, cssVar: string, kind: 'bg' | 'color'): Promise<string> {
  return page.evaluate(({ v, k }: { v: string; k: 'bg' | 'color' }) => {
    const el = document.createElement('div')
    el.style.cssText = `${k === 'bg' ? 'background' : 'color'}: var(${v}); position: absolute; visibility: hidden;`
    document.body.appendChild(el)
    const cs = window.getComputedStyle(el)
    const value = k === 'bg' ? cs.backgroundColor : cs.color
    el.remove()
    return value
  }, { v: cssVar, k: kind })
}

/** Neutral colours of the current theme (what a pie slice must NOT be). */
async function themeNeutrals(page: Page): Promise<string[]> {
  return [
    'rgb(0, 0, 0)', 'rgb(255, 255, 255)', 'rgb(17, 17, 17)', 'rgba(0, 0, 0, 0)',
    await resolveVar(page, '--editorBgColor', 'bg'),
    await resolveVar(page, '--floatBgColor', 'bg'),
    await resolveVar(page, '--editorColor', 'color'),
    await resolveVar(page, '--tableBorderColor', 'bg'),
    await resolveVar(page, '--codeBlockBgColor', 'bg')
  ]
}

/** Distinct non-neutral fills of the pie SVG, in document order. */
async function pieFills(page: Page): Promise<string[]> {
  const neutrals = await themeNeutrals(page)
  return page.evaluate((neutralList: string[]) => {
    const neutral = new Set(neutralList)
    const svg = document.querySelector('figure.ag-container-block div.ag-container-preview svg')
    if (!svg) return []
    const seen: string[] = []
    for (const el of svg.querySelectorAll('*')) {
      const fill = window.getComputedStyle(el).fill
      if (fill && fill !== 'none' && !neutral.has(fill) && !seen.includes(fill)) {
        seen.push(fill)
      }
    }
    return seen
  }, neutrals)
}

async function bootWithTheme(page: Page, theme: ThemeId, markdown: string, extraPrefs: Record<string, unknown> = {}) {
  await page.addInitScript(({ t, extra }: { t: string; extra: Record<string, unknown> }) => {
    ;(window as any).__mockInvoke = {
      ...(window as any).__mockInvoke,
      mt_prefs_get_all: () => ({
        theme: t,
        autoSave: false,
        autoSaveDelay: 5000,
        titleBarStyle: 'custom',
        openFilesInNewWindow: false,
        openFolderInNewWindow: false,
        hideScrollbar: false,
        sideBarVisibility: false,
        tabBarVisibility: false,
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
        ...extra
      })
    }
  }, { t: theme, extra: extraPrefs })
  await bootEditor(page)
  await openFileTab(page, '/tmp/mark-e2e/theme-families.md', markdown)
}

test.beforeEach(async ({ page }) => {
  await installTauriShim(page)
  // Record preference writes (mt_prefs_set is not in the shim defaults).
  await page.addInitScript(() => {
    ;(window as any).__mockInvoke.mt_prefs_set = (args: any) => {
      ;(window as any).__prefWrites = ((window as any).__prefWrites || []).concat([args])
      return null
    }
  })
})

test.describe('Docs and macOS theme families (C-51 T-007)', () => {
  for (const theme of THEMES) {
    test.describe(`theme ${theme}`, () => {
      test('applies its colours, palette and fonts to the editor', async ({ page }) => {
        await bootWithTheme(page, theme, PIE_DOC)

        // Dark classification drives body.dark.
        if (EXPECTED[theme].dark) {
          await expect(page.locator('body')).toHaveClass(/(^|\s)dark(\s|$)/)
        } else {
          await expect(page.locator('body')).not.toHaveClass(/(^|\s)dark(\s|$)/)
        }

        // The editor surface carries the theme ground and text colour.
        const surface = await page.evaluate(() => {
          const el = document.querySelector('.editor-component')
          const cs = window.getComputedStyle(el)
          return { bg: cs.backgroundColor, color: cs.color }
        })
        expect(surface.bg).toBe(EXPECTED[theme].bg)
        expect(surface.color).toBe(EXPECTED[theme].text)

        // The theme's --chartPalette is mirrored on the root (the source
        // mermaidTheme.readActiveThemeTokens reads first).
        const chartPalette = await page.evaluate(() =>
          document.documentElement.style.getPropertyValue('--chartPalette')
        )
        expect(chartPalette.split(',').map((c) => c.trim())).toHaveLength(8)

        // The pie renders with the palette: first slice = first colour,
        // ≥ 4 distinct slice colours (4 data rows), no error.
        await expect(page.locator(PREVIEW_SVG)).toHaveCount(1, { timeout: 30_000 })
        await expect(page.locator('figure.ag-container-block .ag-mermaid-error')).toHaveCount(0)

        const fills = await pieFills(page)
        expect(fills[0], `${theme}: the first pie slice is the palette's first colour`).toBe(
          EXPECTED[theme].firstSlice
        )
        expect(fills.length, `${theme}: all four pie slices carry palette colours`).toBeGreaterThanOrEqual(4)

        // The document uses the system UI font; code keeps the code font.
        const fonts = await page.evaluate(() => ({
          document: window.getComputedStyle(document.querySelector('.editor-wrapper')).fontFamily,
          code: window.getComputedStyle(document.querySelector('.editor-component pre.ag-paragraph')).fontFamily
        }))
        expect(fonts.document).toContain('-apple-system')
        expect(fonts.code).not.toContain('-apple-system')
        expect(fonts.code).toMatch(/mono/i)

        // Evidence screenshot per theme.
        await page.screenshot({ path: test.info().outputPath(`theme-families-${theme}.png`) })
      })
    })
  }

  test('the title-bar cycle switches docs light → docs-dark within the family', async ({ page }) => {
    await bootWithTheme(page, 'docs', PIE_DOC, {
      lightModeTheme: 'docs',
      darkModeTheme: 'docs-dark'
    })
    await expect(page.locator(PREVIEW_SVG)).toHaveCount(1, { timeout: 30_000 })
    expect((await pieFills(page))[0]).toBe('rgb(79, 107, 237)')

    // Manual light → the cycle's next state is Dark: the dark member of
    // the SAME family applies and the pie re-renders with its palette.
    await page.locator('.titlebar-nav-btn[title*="Theme"]').first().click()
    await expect(page.locator('body')).toHaveClass(/(^|\s)dark(\s|$)/, { timeout: 5_000 })
    await expect
      .poll(async () => (await pieFills(page))[0], { timeout: 30_000 })
      .toBe('rgb(124, 147, 245)')
    const darkBg = await page.evaluate(() =>
      window.getComputedStyle(document.querySelector('.editor-component')).backgroundColor
    )
    expect(darkBg).toBe('rgb(22, 22, 21)')

    const writes = await page.evaluate(() => (window as any).__prefWrites || [])
    expect(writes).toEqual(expect.arrayContaining([
      { key: 'theme', value: 'docs-dark' }
    ]))
  })
})

test.describe('the Settings family picker carries the new families (C-51 T-007)', () => {
  const openAppearance = async (page: Page) => {
    await page.goto(
      '/?type=settings&wid=0&udp=/tmp/mark-e2e&debug=0&theme=paper#/preference/theme'
    )
    await page.locator('.pref-tab-page--appearance').waitFor({ state: 'visible', timeout: 15_000 })
  }

  test('manual Light: picking Docs applies docs light and persists both members', async ({ page }) => {
    await openAppearance(page)
    await expect(page.locator('.theme-family-tile')).toHaveCount(16)

    const docsTile = page.locator('.theme-family-tile[data-family="docs"]')
    await docsTile.click()
    await expect(docsTile).toHaveClass(/(^|\s)is-selected(\s|$)/, { timeout: 5_000 })
    await expect(page.locator('body')).not.toHaveClass(/(^|\s)dark(\s|$)/)
    // The theme's own document mirror carries the Docs ground colour.
    await expect
      .poll(
        async () => page.evaluate(() =>
          document.documentElement.style.getPropertyValue('--editorBgColor')
        ),
        { timeout: 5_000 }
      )
      .toBe('#FCFCFB')

    const writes = await page.evaluate(() => (window as any).__prefWrites || [])
    const themeWrites = writes.filter(
      (w: any) => w.key === 'theme' || w.key === 'lightModeTheme' || w.key === 'darkModeTheme'
    )
    expect(themeWrites).toEqual(expect.arrayContaining([
      { key: 'lightModeTheme', value: 'docs' },
      { key: 'darkModeTheme', value: 'docs-dark' },
      { key: 'theme', value: 'docs' }
    ]))
  })

  test('Auto on a dark system: picking macOS applies the dark member', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' })
    await page.addInitScript(() => {
      ;(window as any).__mockInvoke = {
        ...(window as any).__mockInvoke,
        mt_prefs_get_all: () => ({
          theme: 'ink',
          followSystemTheme: true,
          lightModeTheme: 'paper',
          darkModeTheme: 'ink',
          language: 'en'
        })
      }
    })
    await openAppearance(page)

    const macosTile = page.locator('.theme-family-tile[data-family="macos"]')
    await macosTile.click()
    await expect(page.locator('body')).toHaveClass(/(^|\s)dark(\s|$)/, { timeout: 5_000 })
    await expect(macosTile).toHaveClass(/(^|\s)is-selected(\s|$)/)
    await expect
      .poll(
        async () => page.evaluate(() =>
          document.documentElement.style.getPropertyValue('--editorBgColor')
        ),
        { timeout: 5_000 }
      )
      .toBe('#1E1E1E')

    const writes = await page.evaluate(() => (window as any).__prefWrites || [])
    const themeWrites = writes.filter((w: any) => w.key === 'theme')
    expect(themeWrites[themeWrites.length - 1]).toEqual({ key: 'theme', value: 'macos-dark' })
  })
})
