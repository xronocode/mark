/**
 * code-block-line-numbers.spec.ts — C-38 T-005 (#1648): with the
 * codeBlockLineNumbers preference on, every code block shows one number per
 * LOGICAL line, and each number's top equals its logical line's top — with
 * wrapping on (a wrapped line keeps one number on its first visual row) and
 * off — and stays aligned through edits (Enter, typing, undo). With the
 * preference off nothing renders. The gutter never leaks into the markdown.
 *
 * Line tops are measured independently of the implementation: a one-character
 * Range at each logical line start (collapsed caret rect for the empty line
 * after a trailing newline) — its first rect's top is that line's first
 * visual row.
 *
 * CHANGE: 2026-10-15 — alignment after an edit is polled (settledAlignment)
 * instead of sampled after a fixed 300 ms: CI (macos-14, 80a8d9c2) sampled a
 * 38 px delta mid re-measure; the same run passes 8/8 locally.
 */

import { test, expect, type Page } from '@playwright/test'
import { installTauriShim } from './fixtures/tauri-shim'
import { bootEditor, openFileTab } from './fixtures/helpers'

const LONG = 'x'.repeat(200) // >2 code rows at the default 1280px viewport
const MD = [
  '# Line numbers',
  '',
  '```js',
  'const a = 1',
  `const long = '${LONG}'`,
  'const b = 2',
  '```',
  ''
].join('\n')

// Boot with a full prefs override (mirrors block-viewer.spec.ts) so the
// codeBlockLineNumbers preference is on for this profile without touching
// the Settings UI (added by another task), and the migration flag is stored
// so the boot default flip stays out of the way.
async function bootWithLineNumbers (page: Page, wrapCodeBlocks: boolean): Promise<void> {
  await page.addInitScript((wrap: boolean) => {
    ;(window as any).__mockInvoke = {
      ...(window as any).__mockInvoke,
      mt_prefs_get_all: () => ({
        theme: 'light',
        autoSave: false,
        autoSaveDelay: 5000,
        titleBarStyle: 'custom',
        openFilesInNewWindow: false,
        openFolderInNewWindow: false,
        hideScrollbar: false,
        sideBarVisibility: false,
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
        lightModeTheme: 'light',
        darkModeTheme: 'dark',
        customCss: '',
        bulletListMarker: '-',
        orderListDelimiter: '.',
        preferLooseListItem: true,
        tabSize: 4,
        lineHeight: 1.6,
        trimUnnecessaryCodeBlockEmptyLines: false,
        sequenceTheme: 'hand',
        codeBlockLineNumbers: true,
        codeBlockLineNumbersMigrated: true,
        wrapCodeBlocks: wrap
      })
    }
  }, wrapCodeBlocks)

  await bootEditor(page)
  await openFileTab(page, '/tmp/c38/line-numbers.md', MD)
  await expect(page.locator('pre.ag-paragraph.line-numbers')).toHaveCount(1, { timeout: 10_000 })
  // Fonts swap after first paint and re-wrap code; give the app's
  // document.fonts.ready re-measure a moment, then settle.
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(300)
}

interface Alignment {
  error?: string
  whiteSpace?: string
  lineCount?: number
  rowCount?: number
  deltas?: number[]
  contenteditable?: string | null
  ariaHidden?: string | null
}

async function gutterAlignment (page: Page): Promise<Alignment> {
  return page.evaluate(() => {
    const pre = document.querySelector('pre.ag-paragraph.line-numbers') as HTMLElement | null
    if (!pre) return { error: 'no pre.line-numbers' }
    const content = pre.querySelector('.ag-code-content')
    const rowsWrap = pre.querySelector('.line-numbers-rows')
    if (!content || !rowsWrap) return { error: 'missing gutter or code content' }

    const rows = Array.from(rowsWrap.children) as HTMLElement[]
    const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT)
    const nodes: Text[] = []
    for (let n = walker.nextNode(); n; n = walker.nextNode()) nodes.push(n as Text)
    const text = content.textContent || ''
    const offsets = [0]
    const re = /\n/g
    for (let m = re.exec(text); m; m = re.exec(text)) offsets.push(m.index + 1)

    const locate = (offset: number) => {
      let remaining = offset
      for (const node of nodes) {
        // A line start belongs to the node that CONTAINS it (not the end
        // of the node holding the preceding "\n").
        if (remaining < (node.nodeValue || '').length) return { node, offset: remaining }
        remaining -= (node.nodeValue || '').length
      }
      const last = nodes[nodes.length - 1]
      return remaining === 0 && last ? { node: last, offset: (last.nodeValue || '').length } : null
    }

    const lineTops: number[] = []
    for (const offset of offsets) {
      const start = locate(offset)
      if (!start) return { error: `cannot locate offset ${offset}` }
      const range = document.createRange()
      if (offset < text.length) {
        range.setStart(start.node, start.offset)
        range.setEnd(start.node, start.offset + 1)
      } else {
        // Trailing empty line: only the collapsed caret has a position.
        range.setStart(start.node, start.offset)
        range.setEnd(start.node, start.offset)
      }
      const all = Array.from(range.getClientRects())
      if (!all.length) return { error: `no rects at offset ${offset}` }
      // WebKit may report an empty rect at the previous row's end first.
      const rects = [all.find((r) => r.width > 0) || all[0]]
      // Line-box top = glyph rect top minus half the leading (the gutter row
      // is a line box; a glyph rect starts half a leading lower).
      const lh = parseFloat(getComputedStyle(content).lineHeight)
      const halfLeading = Number.isFinite(lh) ? (lh - rects[0].height) / 2 : 0
      lineTops.push(rects[0].top - halfLeading)
    }

    return {
      whiteSpace: getComputedStyle(content).whiteSpace,
      lineCount: lineTops.length,
      rowCount: rows.length,
      deltas: rows.map((row, i) => Math.abs(row.getBoundingClientRect().top - lineTops[i])),
      contenteditable: rowsWrap.getAttribute('contenteditable'),
      ariaHidden: rowsWrap.getAttribute('aria-hidden')
    }
  })
}

async function currentMarkdown (page: Page): Promise<string> {
  return page.evaluate(() => {
    const el = document.querySelector('#app') as any
    return el?.__vue_app__?.config?.globalProperties?.$pinia?.state?.value?.editor?.currentFile?.markdown ?? ''
  })
}

function expectAligned (alignment: Alignment, expectedRows: number): void {
  expect(alignment.error, alignment.error).toBeUndefined()
  expect(alignment.rowCount).toBe(expectedRows)
  expect(alignment.lineCount).toBe(expectedRows)
  expect(alignment.deltas).toHaveLength(expectedRows)
  for (const delta of alignment.deltas || []) {
    expect(delta, `number top vs line top delta ${delta}px`).toBeLessThanOrEqual(1.5)
  }
}

// The gutter is re-measured after muya's render pass (and again on a
// container resize); under CI load that can land after a fixed pause. Poll
// until the alignment settles, then assert it — a real misalignment still
// fails, just after the deadline instead of on the first sample.
async function settledAlignment (page: Page, expectedRows: number): Promise<Alignment> {
  let last = await gutterAlignment(page)
  await expect.poll(async () => {
    last = await gutterAlignment(page)
    const worst = Math.max(...(last.deltas || [Infinity]))
    return last.rowCount === expectedRows && last.lineCount === expectedRows && worst <= 1.5
  }, { timeout: 5000 }).toBe(true).catch(() => {})
  return last
}

test.describe('code block line numbers (C-38 T-005, #1648)', () => {
  test.beforeEach(async ({ page }) => {
    await installTauriShim(page)
  })

  test('wrap on: one number per logical line, each aligned to its line; survives Enter, typing and undo', async ({ page }) => {
    await bootWithLineNumbers(page, true)

    let alignment = await gutterAlignment(page)
    expect(alignment.whiteSpace).toBe('pre-wrap')
    // The 200-char line wraps to several visual rows but keeps one number.
    expectAligned(alignment, 3)
    // The gutter is a presentation-only surface.
    expect(alignment.contenteditable).toBe('false')
    expect(alignment.ariaHidden).toBe('true')

    // The long logical line occupies more than one visual row (wrap is real).
    const visualRows = await page.evaluate(() => {
      const content = document.querySelector('pre.line-numbers .ag-code-content') as HTMLElement | null
      if (!content) return 0
      return Math.round(content.getBoundingClientRect().height / 22) // ~one 14px×1.6 line
    })
    expect(visualRows).toBeGreaterThan(3)

    // Edit: click into the code, split a line with Enter.
    await page.locator('pre.ag-fence-code .ag-code-content').click({ position: { x: 12, y: 10 } })
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('Enter')
    alignment = await settledAlignment(page, 4)
    expectAligned(alignment, 4)

    // Type a lot on the current line — it re-wraps, numbers must follow.
    await page.keyboard.type('y'.repeat(160), { delay: 0 })
    alignment = await settledAlignment(page, 4)
    expectAligned(alignment, 4)

    // Undo back to the original three lines (history groups may differ).
    for (let i = 0; i < 6; i++) {
      const current = await gutterAlignment(page)
      if (current.rowCount === 3) break
      await page.keyboard.press('ControlOrMeta+z')
      await page.waitForTimeout(250)
    }
    alignment = await settledAlignment(page, 3)
    expectAligned(alignment, 3)

    // The numbers never leak into the markdown.
    const md = await currentMarkdown(page)
    expect(md).toContain('const a = 1')
    expect(md).toContain('const b = 2')
    expect(md).not.toMatch(/^\s*1\s*$/m)
  })

  test('wrap off: numbers stay aligned with unwrapped lines', async ({ page }) => {
    await bootWithLineNumbers(page, false)

    const alignment = await gutterAlignment(page)
    expect(alignment.whiteSpace).toBe('pre')
    expectAligned(alignment, 3)
  })

  test('preference off (the new default): no gutter at all', async ({ page }) => {
    await bootEditor(page)
    await openFileTab(page, '/tmp/c38/line-numbers-off.md', MD)
    await expect(page.locator('pre.ag-paragraph.line-numbers')).toHaveCount(0, { timeout: 10_000 })
    await expect(page.locator('.line-numbers-rows')).toHaveCount(0)
    await expect(page.locator('pre.ag-fence-code .ag-code-content')).toBeVisible()
    const md = await currentMarkdown(page)
    expect(md).toContain('const a = 1')
  })
})
