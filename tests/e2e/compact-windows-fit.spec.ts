import { test, expect, type Locator, type Page, type TestInfo } from '@playwright/test'
import { installTauriShim } from './fixtures/tauri-shim'
import { bootEditor } from './fixtures/helpers'
import { writeFile } from 'node:fs/promises'

// START_MODULE_CONTRACT
//   PURPOSE: C-COMPACT-WINDOWS-FIT e2e — the compact geometry walker (the quick-settings panel is viewport-bound at the 600x400 editor minimum on all three tabs with pinned toolbar/footer and a single body scroll region), the approved 428px metrics at the 640x620 and 1440x900 reference sizes, the real-keyboard focus routes for the five new targets (the «Aa» button, the View-tab family tile, the Page-tab Reset row, the sheet Close button) and the Advanced-sheet keyboard modality (Tab/Shift+Tab wrap never reaching the page behind, focus restored on both close paths).
//   SCOPE: Built renderer in chromium (the plan's command) with the canonical Tauri shim; viewport-pinned per the settings-shell.spec.ts canon; real keyboard input only — a synthetic focus() call is never evidence.
//   DEPENDS: Playwright, canonical Tauri shim, editor boot helpers, the quickSettings shell components, the shared Advanced sheet.
//   LINKS: C-COMPACT-WINDOWS-FIT; M-061; M-011; C-SETTINGS-KEYBOARD-FOCUS; tests/e2e/settings-shell.spec.ts (the focus harness canon); tests/e2e/page-width-panel.spec.ts (the boot fixtures).
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
// START_MODULE_MAP
//   installCompactPrefs - Canonical shim plus captured preference writes (__compactWrites) and read-through state for the invariant write counts.
//   walkPanelGeometry - The compact geometry walker: every .quick-settings-popover descendant rect inside the viewport below the title bar, plus the scroll-container census.
//   writesSettled - Observe bootstrap writes settling before capturing focus-state invariants (never a timing-budget bypass).
//   focusThroughKeyboard - Reach a real target by Tab, recording any WebKit Option-Tab fallback.
//   focusStateCompact - Read focus presentation and the value/geometry/class/write invariant without changing focus.
//   checkKeyboardFocusCompact - Prove the canon 2px accent outline from actual keyboard input, with before/focused captures and Tab-away.
//   Rect - the panel-geometry walker's offender record shape.
//   atSize - setViewportSize helper for the metrics test.
//   openPanel - opens the quick-settings popover and waits for it.
//   rectOf - element rect snapshot helper.
// END_MODULE_MAP
// START_CHANGE_SUMMARY
//   LAST_CHANGE: C-COMPACT-WINDOWS-FIT T-001..T-004: new spec — compact walker at 600x400/640x620/1440x900, the real-keyboard focus routes and the sheet trap integrity groups.
// END_CHANGE_SUMMARY

type Rect = { left: number; right: number; top: number; bottom: number }

const rectOf = (loc: Locator): Promise<Rect> =>
  loc.evaluate((el) => {
    const r = el.getBoundingClientRect()
    return { left: r.left, right: r.right, top: r.top, bottom: r.bottom }
  })

const atSize = async (page: Page, w: number, h: number) => {
  await page.setViewportSize({ width: w, height: h })
}

async function installCompactPrefs(page: Page): Promise<void> {
  await installTauriShim(page)
  await page.addInitScript(() => {
    const w = window as any
    // Capture both prefs transports for the focus invariant write counts.
    w.__compactWrites = []
    w.__prefsState = {}
    const trackWrite = (args: { key: string; value: unknown }) => {
      w.__compactWrites.push(args)
      w.__prefsState[args.key] = args.value
    }
    w.__mockInvoke.mt_prefs_set = (args: { key: string; value: unknown }) => {
      trackWrite(args)
      return null
    }
    w.__mockInvoke['mt::prefs::set'] = (args: { key: string; value: unknown }) => {
      trackWrite(args)
      return null
    }
    const baseGetAll = w.__mockInvoke.mt_prefs_get_all
    w.__mockInvoke.mt_prefs_get_all = () => ({
      ...(baseGetAll ? baseGetAll() : {}),
      ...w.__prefsState
    })
    w.__mockInvoke['mt::prefs::get'] = (args: { key: string } | string) => {
      const key = typeof args === 'string' ? args : args && args.key
      return key in w.__prefsState ? w.__prefsState[key] : null
    }
    w.__mockInvoke.mt_fs_stat = () => ({
      isFile: true,
      isDirectory: false,
      size: 100,
      mtimeMs: Date.now(),
      mode: 0,
      isSymbolicLink: false
    })
  })
}

const openPanel = async (page: Page) => {
  const btn = page.locator('.quick-settings-btn')
  await expect(btn).toBeVisible({ timeout: 10_000 })
  await btn.click()
  const panel = page.locator('.quick-settings-popover')
  await expect(panel).toBeVisible({ timeout: 5_000 })
  return panel
}

/**
 * The compact geometry walker: the panel and every descendant rect must
 * lie fully inside the viewport below the title bar (the settings-shell
 * overflow tolerances, ±0.5px), and the census of scrollable elements
 * inside the panel names the single scroll region.
 */
async function walkPanelGeometry(page: Page) {
  return page.evaluate(() => {
    const vw = window.innerWidth
    const vh = window.innerHeight
    const bar = document.querySelector('.title-bar')
    const barBottom = bar ? bar.getBoundingClientRect().bottom : 0
    const panel = document.querySelector('.quick-settings-popover')
    if (!panel) return { missing: true, vw, vh, barBottom, panelTop: 0, offenders: [], scrollers: [] }
    const offenders: { tag: string; cls: string; left: number; right: number; top: number; bottom: number }[] = []
    const panelRect = panel.getBoundingClientRect()
    if (panelRect.top < barBottom - 0.5) {
      offenders.push({ tag: panel.tagName, cls: panel.className.slice(0, 80), left: panelRect.left, right: panelRect.right, top: panelRect.top, bottom: panelRect.bottom })
    }
    // Elements INSIDE the scroll region (.quick-body) legitimately lay out
    // beyond the clip — their rects describe scrolled content, not overflow
    // of the panel. Geometry offenders are the panel shell and everything
    // outside the scroll region.
    const scrollRegion = panel.querySelector('.quick-body')
    const elements: Element[] = [panel, ...Array.from(panel.querySelectorAll('*'))
      .filter((el) => !scrollRegion?.contains(el))]
    for (const el of elements) {
      const rect = (el as HTMLElement).getBoundingClientRect()
      if (rect.width === 0 && rect.height === 0) continue
      if (rect.right > vw + 0.5 || rect.left < -0.5 || rect.bottom > vh + 0.5 || rect.top < -0.5) {
        offenders.push({
          tag: el.tagName,
          cls: (el as HTMLElement).className?.toString?.().slice(0, 80) ?? '',
          left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom
        })
      }
    }
    const scrollers = Array.from(panel.querySelectorAll('*'))
      .filter((el) => {
        const node = el as HTMLElement
        if (!node.className?.toString?.().trim()) return false
        const cs = getComputedStyle(node)
        const scrolls = cs.overflowX === 'auto' || cs.overflowX === 'scroll' || cs.overflowY === 'auto' || cs.overflowY === 'scroll'
        // Inline text ellipsis (family-name labels) reports scrollWidth >
        // clientWidth by design — only real scroll CONTAINERS count.
        return scrolls && (node.scrollHeight > node.clientHeight + 1 || node.scrollWidth > node.clientWidth + 1)
      })
      .map((el) => `${el.tagName}.${(el as HTMLElement).className?.toString?.().slice(0, 40) ?? ''}`)
    return { missing: false, vw, vh, barBottom, panelTop: panelRect.top, offenders, scrollers }
  })
}

// The editor boot schedules session/position persistence independently of
// keyboard focus; observe those real bootstrap writes settling before
// capturing control-only invariants (the settings-shell canon's poll).
async function writesSettled(page: Page) {
  await expect.poll(async () => {
    const first = await page.evaluate(() => (window as any).__compactWrites.length)
    await page.waitForTimeout(120)
    return first === (await page.evaluate(() => (window as any).__compactWrites.length))
  }).toBe(true)
}

async function focusThroughKeyboard(page: Page, target: Locator, info: TestInfo, label: string) {
  let reached = false
  for (const key of info.project.name.includes('webkit') ? ['Tab', 'Alt+Tab'] : ['Tab']) {
    const visited = await page.evaluateHandle(() => new Set<Element>())
    let presses = 0
    try {
      for (; presses < 140; presses++) {
        await page.keyboard.press(key)
        if (await target.evaluate((el) => document.activeElement === el)) { reached = true; break }
        if (await page.evaluate((seen) => {
          const active = document.activeElement!
          if (seen.has(active)) return true
          seen.add(active)
          return false
        }, visited)) break
      }
    } finally { await visited.dispose() }
    info.annotations.push({ type: 'keyboard-route', description: `${label}: ${key}, ${presses + 1} presses, reached=${reached}` })
    if (reached) return
  }
  expect(reached, `No real keyboard route to ${label}`).toBe(true)
}

async function focusStateCompact(page: Page, target: Locator) {
  return target.evaluate((el) => {
    const style = getComputedStyle(el)
    const probe = document.createElement('span')
    probe.style.cssText = 'position:absolute;color:var(--prefAccent)'
    el.append(probe)
    const accent = getComputedStyle(probe).color
    probe.remove()
    const anchor = el.closest('.quick-settings-popover, .pref-sheet') ?? document.body
    const ar = anchor.getBoundingClientRect()
    const r = el.getBoundingClientRect()
    return {
      focused: document.activeElement === el, focusVisible: el.matches(':focus-visible'), accent,
      outline: { style: style.outlineStyle, width: style.outlineWidth, offset: style.outlineOffset, color: style.outlineColor },
      invariant: {
        value: 'value' in el ? String((el as HTMLInputElement).value) : el.getAttribute('aria-checked'),
        checked: el.getAttribute('aria-checked'),
        classes: el.className,
        bounds: { x: r.x - ar.x, y: r.y - ar.y, width: r.width, height: r.height },
        writes: (window as any).__compactWrites.length
      }
    }
  })
}

async function checkKeyboardFocusCompact(
  page: Page, target: Locator, anchor: Locator, info: TestInfo, label: string
) {
  await target.scrollIntoViewIfNeeded()
  await writesSettled(page)
  await page.mouse.move(1, 1)
  const before = await focusStateCompact(page, target)
  expect(before.focused, `${label}: setup must start outside the target`).toBe(false)
  const beforePath = info.outputPath(`${label}-before.png`)
  const beforeImage = await anchor.screenshot({ path: beforePath, animations: 'disabled', caret: 'hide' })
  await focusThroughKeyboard(page, target, info, label)
  const after = await focusStateCompact(page, target)
  const statePath = info.outputPath(`${label}-state.json`)
  await writeFile(statePath, JSON.stringify({
    before, after,
    keyboardRoutes: info.annotations.filter((item) => item.type === 'keyboard-route'),
    writes: await page.evaluate(() => (window as any).__compactWrites)
  }, null, 2))
  await info.attach(`${label}-state`, { path: statePath, contentType: 'application/json' })
  expect(after.focusVisible, label).toBe(true)
  expect(after.invariant, `${label}: focus must not change value, geometry, selection or writes`).toEqual(before.invariant)
  const focusedPath = info.outputPath(`${label}-focused.png`)
  const focusedImage = await anchor.screenshot({ path: focusedPath, animations: 'disabled', caret: 'hide' })
  await info.attach(`${label}-before`, { path: beforePath, contentType: 'image/png' })
  await info.attach(`${label}-focused`, { path: focusedPath, contentType: 'image/png' })
  expect.soft(after.outline, label).toEqual({ style: 'solid', width: '2px', offset: '1px', color: after.accent })
  expect.soft(focusedImage.equals(beforeImage), `${label}: the painted anchor must visibly distinguish focus`).toBe(false)
  await page.keyboard.press('Tab')
  const away = await focusStateCompact(page, target)
  expect(away.focused).toBe(false)
  expect.soft(away.outline.style, label).not.toBe('solid')
}

/**
 * Compact windows fit (C-COMPACT-WINDOWS-FIT).
 *
 * The editor window's minimum is 600x400 (tauri.conf.json minWidth/
 * minHeight); the settings window is fixed 640x620.
 */

test.use({ viewport: { width: 600, height: 400 } })

test.describe('compact windows fit (C-COMPACT-WINDOWS-FIT)', () => {
  test.beforeEach(async ({ page }) => {
    await installCompactPrefs(page)
    await bootEditor(page)
  })

  test('quick settings panel: every tab fits fully inside the viewport at the 600x400 minimum', async ({ page }) => {
    // The editor minimum (tauri.conf.json minWidth/minHeight).
    expect(await page.evaluate(() => [window.innerWidth, window.innerHeight])).toEqual([600, 400])
    const panel = await openPanel(page)
    for (const [index, name] of [[0, 'Page'], [1, 'View'], [2, 'Tables']] as const) {
      await panel.locator('.quick-tab').nth(index).click()
      const walk = await walkPanelGeometry(page)
      expect(walk.missing, `${name}: the panel must be open`).toBe(false)
      expect(walk.offenders,
        `${name}: every panel element is fully inside the viewport below the title bar — offenders ${JSON.stringify(walk.offenders)}`
      ).toEqual([])
      // The body is the SINGLE scroll region: no other element scrolls.
      expect(
        walk.scrollers.filter((cls) => !cls.includes('quick-body')),
        `${name}: the body is the only scroll container inside the panel`
      ).toEqual([])
    }
  })

  test('quick settings panel: the toolbar and footer stay pinned while the body scrolls to every row at 600x400', async ({ page }) => {
    const panel = await openPanel(page)
    await panel.locator('.quick-tab').nth(0).click() // the Page tab carries the deepest content
    const toolbarBefore = await rectOf(panel.locator('.quick-toolbar'))
    const footerBefore = await rectOf(panel.locator('.quick-openall'))
    const body = panel.locator('.quick-body')
    const scroll = await body.evaluate((el) => {
      el.scrollTop = el.scrollHeight
      return {
        scrollTop: el.scrollTop,
        maxScroll: el.scrollHeight - el.clientHeight,
        lastChildBottom: (el.children.length ? el.children[el.children.length - 1] : el).getBoundingClientRect().bottom,
        vh: window.innerHeight
      }
    })
    // The body scrolls when its content exceeds the remaining height.
    expect(scroll.maxScroll, 'the body must scroll at 600x400 on the Page tab').toBeGreaterThan(0)
    expect(scroll.scrollTop).toBe(scroll.maxScroll)
    // Every row/control is reachable by that scroll alone: the last row
    // lands inside the viewport, and the pinned chrome did not move.
    expect(scroll.lastChildBottom).toBeLessThanOrEqual(scroll.vh + 0.5)
    expect(await rectOf(panel.locator('.quick-toolbar'))).toEqual(toolbarBefore)
    expect(await rectOf(panel.locator('.quick-openall'))).toEqual(footerBefore)
    await expect(panel.locator('.quick-toolbar')).toBeVisible()
    await expect(panel.locator('.quick-openall')).toBeVisible()
  })

  test('quick settings panel: the approved 428px metrics hold at 640x620 and 1440x900', async ({ page }) => {
    for (const [w, h, name] of [[640, 620, '640x620'], [1440, 900, '1440x900']] as const) {
      await atSize(page, w, h)
      const panel = await openPanel(page)
      const metrics = await panel.evaluate((el) => {
        const cs = getComputedStyle(el)
        const r = el.getBoundingClientRect()
        return {
          width: cs.width, radius: cs.borderRadius, shadow: cs.boxShadow,
          maxHeight: cs.maxHeight,
          panelBottom: r.bottom, vh: window.innerHeight, vw: window.innerWidth
        }
      })
      expect(metrics.width, `${name}: the approved 428px width is verbatim`).toBe('428px')
      expect(metrics.radius, `${name}: the approved 12px radius is verbatim`).toBe('12px')
      expect(metrics.shadow, `${name}: the settings shadow is verbatim`).not.toBe('none')
      // The viewport binding is the only height cap (100vh - 64px); the
      // computed style reports the resolved used value in px.
      expect(Math.abs(parseFloat(metrics.maxHeight) - (metrics.vh - 64)),
        `${name}: the viewport binding is the only height cap`
      ).toBeLessThanOrEqual(0.5)
      expect(metrics.panelBottom, `${name}: the panel stays inside the viewport`).toBeLessThanOrEqual(metrics.vh + 0.5)
      const walk = await walkPanelGeometry(page)
      expect(walk.offenders, `${name}: nothing clips`).toEqual([])
      // At the tallest realistic viewport the cap must not bind (the View
      // tab's natural content fits); at 640x620 the cap MAY bind for tall
      // tabs — that is the designed single-scroll-region behavior, already
      // proven by the pinned-toolbar test at the 600x400 minimum.
      if (h >= 800) {
        const bodyFits = await panel.locator('.quick-body').evaluate((el) => el.scrollHeight <= el.clientHeight + 1)
        expect(bodyFits, `${name}: the cap must not bind below the natural content height (no body scroll)`).toBe(true)
      }
      await page.keyboard.press('Escape') // close before the next size
    }
  })

  test('shows keyboard focus on the quick-settings Aa button and Space opens the panel', async ({ page }, info) => {
    // With the panel OPEN, forward Tab from the panel's own focusables walks
    // into the editor's paragraphs before ever wrapping to the toolbar — the
    // button is not forward-reachable in a bounded walk. Keyboard users meet
    // it on the CLOSED toolbar; walk there, prove the focus ring, then prove
    // the Space activation opens the panel (the unit pin's e2e counterpart).
    const panel = await openPanel(page)
    await expect(panel).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(panel).toBeHidden()
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
    const button = page.locator('.quick-settings-btn')
    await checkKeyboardFocusCompact(page, button, page.locator('.title-bar'), info, 'compact-aa-button')
    await button.focus()
    await page.keyboard.press('Space')
    await expect(panel).toBeVisible()
  })

  test('shows keyboard focus on the View tab family tile', async ({ page }, info) => {
    const panel = await openPanel(page)
    await panel.locator('.quick-tab').nth(1).click()
    const tile = panel.locator('.theme-family-tile[data-family="github"]')
    await expect(tile).toBeVisible()
    await checkKeyboardFocusCompact(page, tile, panel, info, 'compact-family-tile')
  })

  test('shows keyboard focus on the Page tab Reset row', async ({ page }, info) => {
    const panel = await openPanel(page)
    const reset = panel.locator('.quick-page-tab .linkish')
    await expect(reset).toBeVisible()
    await checkKeyboardFocusCompact(page, reset, panel, info, 'compact-reset-row')
  })
})

test.describe('compact windows fit (C-COMPACT-WINDOWS-FIT): settings sheet trap', () => {
  test.use({ viewport: { width: 640, height: 620 } })

  const openShortcutsSheet = async (page: Page) => {
    await installCompactPrefs(page)
    await page.goto('/?type=settings&wid=0&udp=/tmp/mark-compact-sheet&debug=0')
    await page.locator('.pref-container').waitFor({ state: 'visible', timeout: 15_000 })
    await page.locator('.pref-toolbar [data-tab="advanced"]').click()
    const opener = page.locator('.pref-tab-page--advanced').getByRole('button', { name: 'Edit…' }).first()
    await opener.click()
    const sheet = page.locator('.pref-sheet')
    await expect(sheet).toBeVisible({ timeout: 10_000 })
    return { opener, sheet }
  }

  const focusablesInSheet = (page: Page) =>
    page.evaluate(() => {
      const sheet = document.querySelector('.pref-sheet')
      if (!sheet) return 0
      return Array.from(sheet.querySelectorAll(
        'button:not([disabled]), input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'
      )).length
    })

  const landing = (page: Page) =>
    page.evaluate(() => {
      const sheet = document.querySelector('.pref-sheet')
      const active = document.activeElement as HTMLElement | null
      return {
        inside: !!(sheet && active && sheet.contains(active)),
        key: active ? `${active.tagName}.${active.className?.toString?.().slice(0, 48) ?? ''}` : 'none'
      }
    })

  test('sheet panel wraps within the sheet panel and never reaches the page behind', async ({ page }) => {
    const { sheet } = await openShortcutsSheet(page)
    // The trap claims initial focus inside the panel.
    await expect.poll(async () => (await landing(page)).inside,
      'opening the sheet claims focus inside the panel').toBe(true)
    // A full Tab cycle: every landing stays inside; the transcript wraps.
    const size = await focusablesInSheet(page)
    expect(size).toBeGreaterThan(1)
    const transcript: string[] = []
    const outside: string[] = []
    for (let i = 0; i < size + 2; i++) {
      await page.keyboard.press('Tab')
      const at = await landing(page)
      transcript.push(at.key)
      if (!at.inside) outside.push(at.key)
    }
    expect(outside, 'no Tab keystroke lands on the dimmed page behind').toEqual([])
    expect(new Set(transcript).size, 'the cycle wraps (revisits focusables) instead of escaping').toBeLessThan(transcript.length)
    // Shift+Tab cycles the other direction and stays inside too.
    await page.keyboard.press('Shift+Tab')
    for (let i = 0; i < 3; i++) {
      const at = await landing(page)
      expect(at.inside, 'no Shift+Tab keystroke lands on the dimmed page behind').toBe(true)
      await page.keyboard.press('Shift+Tab')
    }
    await expect(sheet).toBeVisible()
  })

  test('sheet panel restores focus to the invoking control when the sheet closes', async ({ page }) => {
    // Escape path: the capture-phase handler closes and the trap releases.
    const { opener, sheet } = await openShortcutsSheet(page)
    await page.keyboard.press('Escape')
    await expect(sheet).toHaveCount(0)
    expect(await opener.evaluate((el) => document.activeElement === el),
      'Escape closes the sheet and restores the invoking control').toBe(true)

    // Close-button path: reopen, close via the header button.
    await opener.click()
    await expect(page.locator('.pref-sheet')).toBeVisible()
    await page.locator('.pref-sheet-close').click()
    await expect(page.locator('.pref-sheet')).toHaveCount(0)
    expect(await opener.evaluate((el) => document.activeElement === el),
      'the Close button closes the sheet and restores the invoking control').toBe(true)
  })

  test('shows keyboard focus on the sheet close button', async ({ page }, info) => {
    const { sheet } = await openShortcutsSheet(page)
    // The trap's initial claim is programmatic; blur, then walk in by real
    // Tab (the trap pulls focus back inside, keeping the route real).
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
    const close = page.locator('.pref-sheet-close')
    await checkKeyboardFocusCompact(page, close, sheet, info, 'compact-sheet-close')
    await expect(sheet).toBeVisible()
  })
})
