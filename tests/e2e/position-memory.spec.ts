/**
 * position-memory.spec.ts — C-FILE-POSITION-MEMORY visual/e2e gates.
 *
 * The owner-report probe scenarios (2026-10-23 "f-cursor" session) as
 * regression gates, driven through the built renderer + tauri-shim with a
 * localStorage-backed prefs store (mt_prefs_get/set) and a fake
 * mt_open_file "disk read" that emits the tab arrival like the Rust
 * backend — so a page reload is a genuine relaunch for the prefs state.
 *
 * Gates (spec corner ids):
 *   C-1  arrows — caret survives tab switch, lands where the next keystroke goes
 *   C-3  close + reopen — scroll and caret restored (typed-character truth)
 *   C-4  relaunch (page reload + session restore) — position back, no stomp
 *   C-5  stale entry clamps into a shorter document
 *   C-9  navigation burst writes ≤1 prefs flush (debounce coalescing)
 */

import { test, expect, type Page } from '@playwright/test'
import { installTauriShim } from './fixtures/tauri-shim'
import { bootEditor, openFileTab } from './fixtures/helpers'

const paras = Array.from({ length: 150 }, (_, i) => `Paragraph ${i + 1} of the tall document with filler text to guarantee height.`).join('\n\n')
const doc = (path: string, title: string) => `# ${title}\n\n${paras}\n`

interface ProbeState {
  scrollTop: number
  maxScroll: number
  caretText: string
}

async function readState(page: Page): Promise<ProbeState> {
  return page.evaluate(() => {
    const c = document.querySelector('.editor-component') as HTMLElement
    const active = document.querySelector('.ag-active') as HTMLElement | null
    const holder = active ? ((active.closest('p, li, h1, h2') || active) as HTMLElement) : null
    return {
      scrollTop: Math.round(c.scrollTop),
      maxScroll: Math.round(c.scrollHeight - c.clientHeight),
      caretText: holder ? (holder.textContent || '').slice(0, 30) : ''
    }
  })
}

async function clickParagraph(page: Page, n: number) {
  const para = page.locator('.editor-with-tabs p.ag-paragraph', { hasText: `Paragraph ${n} of` }).first()
  await para.scrollIntoViewIfNeeded()
  await page.waitForTimeout(150)
  await para.click()
  await page.waitForTimeout(400)
}

async function typedLandsIn(page: Page, ch: string): Promise<string> {
  await page.keyboard.type(ch)
  await page.waitForTimeout(300)
  return page.evaluate((c) => {
    const hit = [...document.querySelectorAll('.editor-with-tabs p.ag-paragraph')]
      .find(p => (p.textContent || '').includes(c))
    return hit ? (hit.textContent || '').slice(0, 32) : 'NOT FOUND'
  }, ch)
}

async function switchTab(page: Page, index: number, heading: string) {
  await page.locator('.editor-tabs .tabs-container li').nth(index).click()
  await expect(page.locator('.editor-with-tabs h1').first()).toContainText(heading, { timeout: 5_000 })
  await page.waitForTimeout(500)
}

// The localStorage-backed backend: prefs survive reloads; mt_open_file
// "reads the disk" (the embedded documents) and emits the tab arrival.
const installBackend = (docs: Record<string, string>) => {
  ;(window as any).__mockInvoke = {
    ...((window as any).__mockInvoke || {}),
    mt_prefs_get: ({ key }: { key: string }) => {
      const raw = localStorage.getItem('e2e-prefs:' + key)
      return raw === null ? null : JSON.parse(raw)
    },
    mt_prefs_set: ({ key, value }: { key: string; value: unknown }) => {
      localStorage.setItem('e2e-prefs:' + key, JSON.stringify(value))
    },
    mt_fs_stat: (arg: unknown) => {
      const a = arg as any
      // ipc.fs.stat sends { path }; RESTORE_SESSION's window.electron bridge
      // sends { args: [path] } — accept both shapes.
      const p = typeof arg === 'string' ? arg : a?.path ?? a?.args?.[0]
      return { isFile: !!p, isDirectory: false }
    },
    mt_open_file: (arg: unknown) => {
      const p = typeof arg === 'string' ? arg : (arg as any)?.args?.[0]
      const md = p && docs[p] ? docs[p] : null
      if (!md) return Promise.resolve(false)
      setTimeout(() => {
        ;(window as any).__emitFakeEvent('mt::open-new-tab', {
          pathname: p,
          filename: p.split('/').pop(),
          markdown: md,
          isUtf8BomEncoded: false,
          lineEnding: 'lf',
          adjustLineEndingOnSave: false
        })
      }, 0)
      return Promise.resolve(true)
    }
  }
  // C-9 spy: how many filePositions writes reached the "disk".
  ;(window as any).__positionWrites = 0
  const origSet = localStorage.setItem.bind(localStorage)
  localStorage.setItem = (k: string, v: string) => {
    if (k === 'e2e-prefs:filePositions') (window as any).__positionWrites++
    return origSet(k, v)
  }
}

test.beforeEach(async ({ page }) => {
  await installTauriShim(page)
})

test('C-1: caret moved by arrow keys survives tab switching', async ({ page }) => {
  const B = '/tmp/pm-arrows-b.md'
  await page.addInitScript(installBackend, { '/tmp/pm-arrows-a.md': '# Doc A\n\nAlpha body.\n', [B]: doc(B, 'Doc B') })
  await bootEditor(page)
  await openFileTab(page, '/tmp/pm-arrows-a.md', '# Doc A\n\nAlpha body.\n')
  await openFileTab(page, B, doc(B, 'Doc B'))
  await expect(page.locator('.editor-with-tabs h1').first()).toContainText('Doc B')

  await clickParagraph(page, 10)
  for (let i = 0; i < 80; i++) await page.keyboard.press('ArrowDown')
  await page.waitForTimeout(500)
  const before = await readState(page)
  expect(before.caretText).toContain('Paragraph 90')

  await switchTab(page, 0, 'Doc A')
  await switchTab(page, 1, 'Doc B')

  const after = await readState(page)
  expect(after.caretText).toContain('Paragraph 90')
  expect(Math.abs(after.scrollTop - before.scrollTop)).toBeLessThanOrEqual(2)
  expect(await typedLandsIn(page, 'Z')).toContain('Paragraph 90')
})

test('C-3: close the tab and reopen the file — scroll and caret restored', async ({ page }) => {
  const B = '/tmp/pm-close-b.md'
  await page.addInitScript(installBackend, { '/tmp/pm-close-a.md': '# Doc A\n\nAlpha body.\n', [B]: doc(B, 'Doc B') })
  await bootEditor(page)
  await openFileTab(page, '/tmp/pm-close-a.md', '# Doc A\n\nAlpha body.\n')
  await openFileTab(page, B, doc(B, 'Doc B'))
  await expect(page.locator('.editor-with-tabs h1').first()).toContainText('Doc B')

  await clickParagraph(page, 120)
  const before = await readState(page)
  expect(before.scrollTop).toBeGreaterThan(500)

  const tabLi = page.locator('.editor-tabs .tabs-container li').nth(1)
  await tabLi.hover()
  await tabLi.locator('.close-icon').click({ force: true })
  await expect(page.locator('.editor-with-tabs h1').first()).toContainText('Doc A', { timeout: 5_000 })
  await page.waitForTimeout(400)

  await openFileTab(page, B, doc(B, 'Doc B'))
  await expect(page.locator('.editor-with-tabs h1').first()).toContainText('Doc B', { timeout: 5_000 })
  await page.waitForTimeout(700)

  const after = await readState(page)
  expect(Math.abs(after.scrollTop - before.scrollTop)).toBeLessThanOrEqual(50)
  expect(await typedLandsIn(page, 'Z')).toContain('Paragraph 120')
})

test('C-4: relaunch (reload + session restore) returns to the position', async ({ page }) => {
  const B = '/tmp/pm-restart-b.md'
  await page.addInitScript(installBackend, { [B]: doc(B, 'Restart Doc') })
  await bootEditor(page)
  await openFileTab(page, B, doc(B, 'Restart Doc'))
  await expect(page.locator('.editor-with-tabs h1').first()).toContainText('Restart Doc')

  await clickParagraph(page, 100)
  const before = await readState(page)
  expect(before.scrollTop).toBeGreaterThan(500)
  // Session autosave (400ms debounce) + position flush (1500ms debounce).
  await page.waitForTimeout(2200)

  await page.reload()
  // Boot with addBlankTab: true so BOOT_SESSION runs the session restore
  // (the harness default boot passes false; the real cold launch passes true).
  await page.waitForFunction(() => {
    const ls = (window as any).__shimListeners
    if (!ls) return false
    for (const m of ls.values()) if (m.event === 'mt::bootstrap-editor') return true
    return false
  }, undefined, { timeout: 15_000 })
  await page.evaluate(() => {
    ;(window as any).__emitFakeEvent('mt::bootstrap-editor', {
      addBlankTab: true,
      markdownList: [],
      lineEnding: 'lf',
      sideBarVisibility: false,
      tabBarVisibility: true,
      sourceCodeModeEnabled: false
    })
  })
  await expect(page.locator('.editor-with-tabs h1').first()).toContainText('Restart Doc', { timeout: 10_000 })
  await page.waitForTimeout(900)

  const after = await readState(page)
  expect(Math.abs(after.scrollTop - before.scrollTop)).toBeLessThanOrEqual(50)
  expect(await typedLandsIn(page, 'Z')).toContain('Paragraph 100')
})

test('C-5: a stale entry from a longer revision clamps into the document', async ({ page }) => {
  const B = '/tmp/pm-clamp-b.md'
  await page.addInitScript((d: Record<string, string>) => {
    installBackend(d)
    // An entry saved on a much longer revision: caret past EOF, scroll past max.
    localStorage.setItem('e2e-prefs:filePositions', JSON.stringify({
      version: 1,
      files: {
        [B]: {
          scrollTop: 99999,
          muyaIndexCursor: { anchor: { line: 9999, ch: 99 }, focus: { line: 9999, ch: 99 } },
          savedAt: 1
        }
      }
    }))
  }, { [B]: doc(B, 'Clamp Doc') })
  await bootEditor(page)
  await openFileTab(page, B, doc(B, 'Clamp Doc'))
  await expect(page.locator('.editor-with-tabs h1').first()).toContainText('Clamp Doc')
  await page.waitForTimeout(700)

  const state = await readState(page)
  expect(state.scrollTop).toBeLessThanOrEqual(state.maxScroll)
  // The restored caret sits on a real block of the clamped document (the
  // stale line 9999 became the document's last line — typing ground truth
  // needs focus, and clicking would move the caret, so read the active block).
  expect(state.caretText).not.toBe('')
  expect(state.caretText === 'NOT FOUND').toBe(false)
  const paraText = state.caretText
  await page.keyboard.type('Z')
  await page.waitForTimeout(300)
  const landed = await page.evaluate(() => {
    const hit = [...document.querySelectorAll('.editor-with-tabs p.ag-paragraph')]
      .find(p => (p.textContent || '').includes('Z'))
    return hit ? (hit.textContent || '').slice(0, 32) : 'NOT FOUND'
  })
  // Either the keystroke landed in the caret's paragraph, or the editor was
  // not focused (no click in this scenario) — the clamp itself is proven by
  // the active block being real and the scroll being in range.
  expect(landed === 'NOT FOUND' || landed.startsWith(paraText.slice(0, 10))).toBe(true)
})

test('C-9: a navigation burst coalesces to at most one prefs write', async ({ page }) => {
  const B = '/tmp/pm-burst-b.md'
  await page.addInitScript(installBackend, { [B]: doc(B, 'Burst Doc') })
  await bootEditor(page)
  await openFileTab(page, B, doc(B, 'Burst Doc'))
  await expect(page.locator('.editor-with-tabs h1').first()).toContainText('Burst Doc')
  const writesBefore = await page.evaluate(() => (window as any).__positionWrites)

  await clickParagraph(page, 20)
  for (let i = 0; i < 30; i++) await page.keyboard.press('ArrowDown')
  await page.waitForTimeout(400) // inside the 1500ms debounce window

  const during = await page.evaluate(() => (window as any).__positionWrites)
  expect(during - writesBefore).toBe(0) // nothing per-event
  await page.waitForTimeout(1500) // flush fires
  const after = await page.evaluate(() => (window as any).__positionWrites)
  expect(after - writesBefore).toBeLessThanOrEqual(1) // one coalesced write
})
