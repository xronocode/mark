/**
 * chrome-native-theme.spec.ts — C-38 T-006 N4 a/b/d.
 *
 * Boots the real renderer with the sidebar open (file tree + an opened
 * tab), the find bar open and the status bar visible, then asserts
 * through getComputedStyle:
 *
 *   (a) the chrome (title bar, tab, sidebar tree item, status bar, find
 *       bar) renders with the --chromeFontFamily system stack while
 *       #ag-editor-id paragraphs keep the editor font;
 *   (b) the active-tab marker and the selected tree row resolve to the
 *       --chromeAccent / --chromeAccentSoft variables (compared against
 *       probe elements resolving the same variables), and document
 *       links keep the theme colour;
 *   (d) no iconfont sprite `use` refs remain anywhere in the DOM, and
 *       every svg in the chrome containers is a drawn ChromeIcon
 *       (chrome-icon class, 1.4 stroke).
 */

import { test, expect, type Page } from '@playwright/test'
import { installTauriShim } from './fixtures/tauri-shim'
import { bootEditor, openFileTab } from './fixtures/helpers'

const DOC = [
  '# Chrome theme notes',
  '',
  'A paragraph with a [theme link](https://example.com) inside.',
  '',
  'second paragraph'
].join('\n')

// Resolve a CSS custom property through a throwaway probe element so
// element styles and expectations go through the identical cascade
// (whatever serialized form AccentColor / color-mix takes per engine).
async function resolvedVar(page: Page, cssProperty: 'fontFamily' | 'backgroundColor' | 'color', value: string): Promise<string> {
  return page.evaluate(({ prop, val }) => {
    const probe = document.createElement('div')
    probe.style[prop] = val
    probe.style.position = 'absolute'
    probe.style.visibility = 'hidden'
    document.body.appendChild(probe)
    const computed = getComputedStyle(probe)[prop]
    probe.remove()
    return computed
  }, { prop: cssProperty, val: value })
}

async function injectTree(page: Page): Promise<void> {
  await page.evaluate(() => {
    const el = document.querySelector('#app') as any
    const pinia = el?.__vue_app__?.config?.globalProperties?.$pinia
    if (pinia) {
      pinia.state.value.project.projectTrees.push({
        pathname: '/tmp/mark-e2e',
        name: 'mark-e2e',
        isDirectory: true,
        isFile: false,
        isMarkdown: false,
        folders: [],
        files: []
      })
    }
  })
  await page.evaluate(() => {
    const w = window as any
    w.__emitFakeEvent('mt::update-object-tree', {
      type: 'add',
      change: {
        pathname: '/tmp/mark-e2e/notes.md',
        name: 'notes.md',
        isFile: true, isDirectory: false, isMarkdown: true,
        birthTime: Date.now()
      }
    })
  })
}

test.describe('chrome native theme (C-38 T-006)', () => {
  test.beforeEach(async ({ page }) => {
    await installTauriShim(page)

    await page.addInitScript(() => {
      ;(window as any).__mockInvoke.mt_walk_project = () => {}
      ;(window as any).__mockInvoke.mt_watch_subscribe = () => 'fake-sub-id'
      ;(window as any).__mockInvoke.mt_watch_unsubscribe = () => {}
    })
  })

  test('chrome uses the system font stack, the accent variables and drawn icons', async ({ page }) => {
    await bootEditor(page, { sideBarVisibility: true })
    // The opened tab uses the tree file's path so the sidebar row turns
    // into the current-file selection.
    await openFileTab(page, '/tmp/mark-e2e/notes.md', DOC)
    await injectTree(page)

    // Find bar + status bar on.
    await page.evaluate(() => {
      ;(window as any).__bus.emit('find', 'find')
      const el = document.querySelector('#app') as any
      const pinia = el?.__vue_app__?.config?.globalProperties?.$pinia
      if (pinia) pinia.state.value.preferences.statusBarVisibility = true
    })
    await expect(page.locator('.search-bar')).toBeVisible({ timeout: 5_000 })
    await expect(page.locator('.status-bar')).toBeVisible({ timeout: 5_000 })

    // The selected tree row (the open tab's file is the current file).
    const treeFile = page.locator('.side-bar-file.current').first()
    await expect(treeFile).toBeVisible({ timeout: 5_000 })

    // ── (a) system UI font across the chrome ─────────────────────────
    const chromeStack = await resolvedVar(page, 'fontFamily', 'var(--chromeFontFamily)')
    expect(chromeStack.length).toBeGreaterThan(0)
    expect(chromeStack.toLowerCase()).toContain('apple-system')

    for (const selector of ['.title-bar', '.editor-tabs li.active', '.side-bar-file.current', '.status-bar', '.search-bar input']) {
      const family = await page.evaluate((sel) => {
        const el = document.querySelector(sel)
        return el ? getComputedStyle(el).fontFamily : '<missing>'
      }, selector)
      expect(family, `${selector} must use the chrome font stack`).toBe(chromeStack)
    }

    // The document keeps the editor font (shim prefs: Open Sans).
    const editorFamily = await page.evaluate(() => {
      const p = document.querySelector('#ag-editor-id p')
      return p ? getComputedStyle(p).fontFamily : '<missing>'
    })
    expect(editorFamily).toContain('Open Sans')
    expect(editorFamily).not.toBe(chromeStack)

    // ── (b) accent for selected/active chrome; theme colour in the doc ──
    const accentBg = await resolvedVar(page, 'backgroundColor', 'var(--chromeAccent)')
    const softBg = await resolvedVar(page, 'backgroundColor', 'var(--chromeAccentSoft)')
    expect(accentBg.length).toBeGreaterThan(0)
    expect(softBg.length).toBeGreaterThan(0)
    expect(softBg).not.toBe('rgba(0, 0, 0, 0)')

    const markerBg = await page.evaluate(() => {
      const tab = document.querySelector('.editor-tabs li.active')
      return tab ? getComputedStyle(tab, '::after').backgroundColor : '<missing>'
    })
    expect(markerBg, 'the active tab marker resolves --chromeAccent').toBe(accentBg)

    const rowBg = await page.evaluate(() => {
      const row = document.querySelector('.side-bar-file.current')
      return row ? getComputedStyle(row).backgroundColor : '<missing>'
    })
    expect(rowBg, 'the selected tree row resolves --chromeAccentSoft').toBe(softBg)

    // Document links keep the theme colour, not the accent.
    const linkColor = await resolvedVar(page, 'color', 'var(--linkColor)')
    const docLink = await page.evaluate(() => {
      const a = document.querySelector('#ag-editor-id a')
      return a ? getComputedStyle(a).color : '<missing>'
    })
    expect(docLink).toBe(linkColor)

    const accentColor = await resolvedVar(page, 'color', 'var(--chromeAccent)')
    expect(docLink).not.toBe(accentColor)

    // ── (d) no sprite refs; every chrome svg is a drawn ChromeIcon ────
    const spriteRefs = await page.evaluate(() => {
      const uses = Array.from(document.querySelectorAll('use'))
      return uses.filter((u) => {
        const href = u.getAttribute('href') || u.getAttribute('xlink:href') || u.getAttributeNS('http://www.w3.org/1999/xlink', 'href') || ''
        return href.startsWith('#icon-')
      }).length
    })
    expect(spriteRefs).toBe(0)

    const iconAudit = await page.evaluate(() => {
      const scopes = ['.title-bar', '.editor-tabs', '.side-bar', '.search-bar']
      const offenders: string[] = []
      for (const scope of scopes) {
        for (const svg of Array.from(document.querySelectorAll(`${scope} svg`))) {
          const computed = getComputedStyle(svg)
          if (!svg.classList.contains('chrome-icon')) offenders.push(`${scope}: not a chrome-icon`)
          if (computed.strokeWidth !== '1.4px' && computed.strokeWidth !== '1.4') {
            offenders.push(`${scope}: stroke ${computed.strokeWidth}`)
          }
        }
      }
      return { offenders, total: document.querySelectorAll('.chrome-icon').length }
    })
    expect(iconAudit.offenders).toEqual([])
    expect(iconAudit.total).toBeGreaterThan(5)
  })

  test('find-bar toggle glyphs render drawn chrome icons with aria', async ({ page }) => {
    await bootEditor(page)
    await openFileTab(page, '/tmp/chrome-icons.md', '# Icons\n\ntext\n')
    await page.evaluate(() => {
      ;(window as any).__bus.emit('find', 'find')
    })
    await expect(page.locator('.search-bar')).toBeVisible({ timeout: 5_000 })

    const glyphs = await page.evaluate(() => {
      const pick = (sel: string) => {
        const svg = document.querySelector(`${sel} svg.chrome-icon`)
        if (!svg) return null
        return {
          viewBox: svg.getAttribute('viewBox'),
          ariaHidden: svg.getAttribute('aria-hidden'),
          stroke: getComputedStyle(svg).strokeWidth,
          strokeColor: getComputedStyle(svg).stroke
        }
      }
      return {
        caseSensitive: pick('.is-case-sensitive'),
        wholeWord: pick('.is-whole-word'),
        regex: pick('.is-regex'),
        close: pick('.search-close')
      }
    })

    for (const key of Object.keys(glyphs) as Array<keyof typeof glyphs>) {
      expect(glyphs[key], `${key} renders a chrome-icon svg`).not.toBeNull()
      expect(glyphs[key]!.viewBox).toBe('0 0 16 16')
      expect(glyphs[key]!.ariaHidden).toBe('true')
      expect(glyphs[key]!.stroke).toBe('1.4px')
      // currentColor serializes as the literal in WebKit and as the
      // resolved rgb() triple in Chromium — both mean "follows context".
      const strokeColor = glyphs[key]!.strokeColor
      expect(strokeColor === 'currentColor' || /^rgb/i.test(strokeColor)).toBe(true)
    }
  })
})
