import { test, expect, type Locator, type Page, type TestInfo } from '@playwright/test'
import { installTauriShim } from './fixtures/tauri-shim'
import { bootEditor, openFileTab } from './fixtures/helpers'
import JSZip from 'jszip'
import { writeFile } from 'node:fs/promises'

// START_MODULE_CONTRACT
//   PURPOSE: Verify real Settings consumers, export preferences and shared keyboard-focus presentation.
//   SCOPE: Built renderer in the existing Chromium/WebKit projects with controlled preference transport.
//   DEPENDS: Playwright, canonical Tauri shim, editor boot helpers, JSZip and task-output filesystem writes.
//   LINKS: M-011; V-M-011; C-SETTINGS-KEYBOARD-FOCUS.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
// START_MODULE_MAP
//   installFocusPreferences - Seed controlled theme/value states and observe preference writes.
//   focusThroughKeyboard - Reach a real target by Tab, recording any WebKit Option-Tab fallback.
//   focusState - Read value, selection, geometry and resolved focus colors without changing focus.
//   checkKeyboardFocus - Prove visible focus and unchanged control semantics from actual keyboard input.
// END_MODULE_MAP
// START_CHANGE_SUMMARY
//   LAST_CHANGE: Add source-bound keyboard presentation regressions for actual Settings/Quick Settings consumers.
// END_CHANGE_SUMMARY

async function installFocusPreferences(page: Page, theme: string) {
  await installTauriShim(page)
  await page.addInitScript(({ theme }) => {
    const w = window as any
    const defaults = w.__TAURI_INTERNALS__.invoke('mt_prefs_get_all')
    w.__mockInvoke.mt_prefs_get_all = async () => ({
      ...await defaults,
      theme, followSystemTheme: false, language: 'en', autoSave: false,
      previewModeOnFinderOpen: false, restoreSessionOnLaunch: true,
      rememberTableColumnSizes: true, tableFullWidthDefault: 'auto',
      fontSize: 16, lineHeight: 1.6, editorLineWidth: '769px'
    })
    w.__focusPreferenceWrites = []
    for (const command of ['mt_prefs_set', 'mt_set_user_preference', 'mt::prefs::set']) {
      w.__mockInvoke[command] = (args: unknown) => {
        w.__focusPreferenceWrites.push({ command, args })
        return null
      }
    }
  }, { theme })
}

async function focusThroughKeyboard(page: Page, target: Locator, info: TestInfo, label: string) {
  let reached = false
  for (const key of info.project.name.includes('webkit') ? ['Tab', 'Alt+Tab'] : ['Tab']) {
    const visited = await page.evaluateHandle(() => new Set<Element>())
    let presses = 0
    try {
      for (; presses < 140; presses++) {
        await page.keyboard.press(key)
        if (await target.evaluate(el => document.activeElement === el)) { reached = true; break }
        if (await page.evaluate(seen => {
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

async function focusState(target: Locator) {
  return target.evaluate(el => {
    const row = el.closest('.pref-row')!
    const style = getComputedStyle(el)
    const probe = document.createElement('span')
    probe.style.cssText = 'position:absolute;color:var(--prefAccent)'
    row.append(probe)
    const accent = getComputedStyle(probe).color
    probe.remove()
    const bounds = (node: Element) => {
      const r = node.getBoundingClientRect()
      const anchor = row.getBoundingClientRect()
      return { x: r.x - anchor.x, y: r.y - anchor.y, width: r.width, height: r.height }
    }
    return {
      focused: document.activeElement === el, focusVisible: el.matches(':focus-visible'), accent,
      outline: { style: style.outlineStyle, width: style.outlineWidth, offset: style.outlineOffset, color: style.outlineColor },
      border: style.borderColor,
      invariant: {
        value: 'value' in el ? String((el as HTMLInputElement).value) : el.getAttribute('aria-checked'),
        checked: el.getAttribute('aria-checked'),
        classes: el.className, bounds: bounds(el), rowBounds: bounds(row),
        segments: [...row.querySelectorAll('.pref-segment')].map(node => ({ classes: node.className, checked: node.getAttribute('aria-checked') })),
        writes: (window as any).__focusPreferenceWrites.length
      }
    }
  })
}

async function checkKeyboardFocus(page: Page, target: Locator, info: TestInfo, label: string, textbox = false) {
  await target.scrollIntoViewIfNeeded()
  await page.mouse.move(1, 1)
  const before = await focusState(target)
  expect(before.focused, `${label}: setup must start outside the target`).toBe(false)
  const row = target.locator('xpath=ancestor::section[contains(@class,"pref-row")]')
  const beforePath = info.outputPath(`${label}-before.png`)
  const beforeImage = await row.screenshot({ path: beforePath, animations: 'disabled', caret: 'hide' })
  await focusThroughKeyboard(page, target, info, label)
  const after = await focusState(target)
  const statePath = info.outputPath(`${label}-state.json`)
  await writeFile(statePath, JSON.stringify({ before, after, keyboardRoutes: info.annotations.filter(item => item.type === 'keyboard-route'), writes: await page.evaluate(() => (window as any).__focusPreferenceWrites) }, null, 2))
  await info.attach(`${label}-state`, { path: statePath, contentType: 'application/json' })
  expect(after.focusVisible, label).toBe(true)
  expect(after.invariant, `${label}: focus must not change value, geometry, selection or writes`).toEqual(before.invariant)
  const focusedPath = info.outputPath(`${label}-focused.png`)
  const focusedImage = await row.screenshot({ path: focusedPath, animations: 'disabled', caret: 'hide' })
  await info.attach(`${label}-before`, { path: beforePath, contentType: 'image/png' })
  await info.attach(`${label}-focused`, { path: focusedPath, contentType: 'image/png' })
  if (textbox) expect.soft(after.border, label).not.toBe(before.border)
  else expect.soft(after.outline, label).toEqual({ style: 'solid', width: '2px', offset: '1px', color: after.accent })
  expect.soft(focusedImage.equals(beforeImage), `${label}: the painted row must visibly distinguish focus`).toBe(false)
  await page.keyboard.press('Tab')
  const away = await focusState(target)
  expect(away.focused).toBe(false)
  if (!textbox) expect.soft(away.outline.style, label).not.toBe('solid')
}

/**
 * C-38 T-003 — the redesigned Settings shell.
 *
 * Runs in chromium AND webkit (the WKWebView engine the macOS build
 * ships): the window is 640×620; every catalog tab must open
 * without horizontal overflow.
 */

test.use({ viewport: { width: 640, height: 620 } })

for (const theme of ['paper', 'ink']) {
  test(`shows keyboard focus on shared Settings controls in ${theme}`, async ({ page, browser }, info) => {
    await installFocusPreferences(page, theme)
    await page.goto('/?type=settings&wid=0&udp=/tmp/mark-focus-settings&debug=0')
    if (theme === 'ink') await expect(page.locator('body')).toHaveClass(/dark/)
    else await expect(page.locator('body')).not.toHaveClass(/dark/)
    const general = page.locator('.pref-toolbar [data-tab="general"]')
    const generalTargets = [
      ['switch-off', '.pref-switch[aria-checked="false"]'],
      ['switch-on', '.pref-switch[aria-checked="true"]'],
      ['select', '.pref-popup:not([disabled])']
    ]
    for (const [label, selector] of generalTargets) {
      await general.click()
      await checkKeyboardFocus(page, page.locator(`.pref-tab-page--general ${selector}`).first(), info, `${theme}-${label}`)
    }
    const appearance = page.locator('.pref-toolbar [data-tab="appearance"]')
    for (const [label, selector] of [
      ['segment-selected', '.pref-segment.is-active'],
      ['segment-unselected', '.pref-segment:not(.is-active)'],
      ['textbox-control', '.pref-text-box-item input.pref-field:not([disabled])']
    ]) {
      await appearance.click()
      await checkKeyboardFocus(page, page.locator(`.pref-tab-page--appearance ${selector}`).first(), info, `${theme}-${label}`, label === 'textbox-control')
    }
    // Independent pointer-first context: keyboard modality from the main
    // regression must not make this positive activation control pass.
    const pointerContext = await browser.newContext({ viewport: { width: 640, height: 620 } })
    try {
      const pointerPage = await pointerContext.newPage()
      await installFocusPreferences(pointerPage, theme)
      await pointerPage.goto('/?type=settings&wid=0&udp=/tmp/mark-focus-pointer&debug=0')
      if (theme === 'ink') await expect(pointerPage.locator('body')).toHaveClass(/dark/)
      else await expect(pointerPage.locator('body')).not.toHaveClass(/dark/)
      const toggle = pointerPage.locator('.pref-tab-page--general .pref-switch').first()
      await expect(toggle).toHaveAttribute('aria-checked', 'false')
      await toggle.click()
      await expect(toggle).toHaveAttribute('aria-checked', 'true')
      await expect.poll(() => pointerPage.evaluate(() => (window as any).__focusPreferenceWrites.length)).toBeGreaterThan(0)
      const state = await focusState(toggle)
      if (state.focusVisible) expect(state.outline).toEqual({ style: 'solid', width: '2px', offset: '1px', color: state.accent })
      else expect(state.outline.style).not.toBe('solid')
    } finally { await pointerContext.close() }
  })

  test(`shows keyboard focus on shared Quick Settings controls in ${theme}`, async ({ page }, info) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await installFocusPreferences(page, theme)
    await bootEditor(page)
    if (theme === 'ink') await expect(page.locator('body')).toHaveClass(/dark/)
    else await expect(page.locator('body')).not.toHaveClass(/dark/)
    await page.evaluate(() => (window as any).__emitFakeEvent('mt::open-new-tab', {
      pathname: '/tmp/mark-e2e/focus-controls.md', filename: 'focus-controls.md',
      markdown: '# Focus controls\n\nControlled keyboard focus document.\n',
      lineEnding: 'lf', isUtf8BomEncoded: false, adjustLineEndingOnSave: false
    }))
    await expect(page.locator('.editor-with-tabs')).toContainText('Controlled keyboard focus document.')
    await page.locator('.quick-settings-btn').click()
    const panel = page.locator('.quick-settings-popover')
    await expect(panel).toBeVisible()
    await panel.getByRole('tab', { name: 'Page', exact: true }).click()
    // Opening the fixture schedules session/position persistence independently
    // of keyboard focus. Observe those real bootstrap writes before counting
    // control-only effects; never erase or filter the write record.
    await expect.poll(() => page.evaluate(() => {
      const writes = (window as any).__focusPreferenceWrites
      return writes.some((entry: any) => entry.args?.key === 'lastSessionFormats' && entry.args.value.some((item: any) => item.pathname === '/tmp/mark-e2e/focus-controls.md')) &&
        writes.some((entry: any) => entry.args?.key === 'filePositions' && entry.args.value.files?.['/tmp/mark-e2e/focus-controls.md'])
    })).toBeTruthy()
    const nearest = panel.locator('.quick-page-tab .pref-segment.is-near')
    await expect(nearest).toHaveCount(1)
    await checkKeyboardFocus(page, nearest, info, `${theme}-quick-nearest-preset`)
    for (const [label, selector] of [
      ['switch-on', '.pref-switch'],
      ['segment-selected', '.pref-segment.is-active'],
      ['segment-unselected', '.pref-segment:not(.is-active)']
    ]) {
      await panel.getByRole('tab', { name: 'Tables', exact: true }).click()
      await checkKeyboardFocus(page, panel.locator(`.quick-tables-tab ${selector}`).first(), info, `${theme}-quick-${label}`)
    }
  })
}

test.describe('settings shell', () => {
  test.beforeEach(async ({ page }) => {
    await installTauriShim(page)
  })

  test('opens on the remembered tab and switches every tab without horizontal overflow', async ({
    page
  }) => {
    await page.goto('/?type=settings&wid=0&udp=/tmp/mark-e2e&debug=0')

    await page
      .locator('.pref-container')
      .waitFor({ state: 'visible', timeout: 15_000 })

    // Fresh profile → remembered tab defaults to General.
    await expect(page.locator('.pref-toolbar [data-tab="general"]')).toHaveAttribute(
      'aria-selected',
      'true'
    )

    const tabs = ['general', 'appearance', 'editor', 'markdown', 'export', 'advanced', 'experimental'] as const
    expect(await page.locator('.pref-toolbar [data-tab]').evaluateAll(elements => elements.map(el => el.getAttribute('data-tab')))).toEqual(tabs)
    for (const id of tabs) {
      await page.locator(`.pref-toolbar [data-tab="${id}"]`).click()
      await expect(page.locator(`.pref-toolbar [data-tab="${id}"]`)).toHaveAttribute(
        'aria-selected',
        'true'
      )

      // No horizontal overflow at 640 px: neither the document nor any
      // element inside the scrollable body may reach past the viewport.
      const overflow = await page.evaluate(() => {
        const vw = window.innerWidth
        let worst: null | { tag: string; cls: string; left: number; right: number } = null
        for (const el of Array.from(document.querySelectorAll('.pref-body *'))) {
          const rect = (el as HTMLElement).getBoundingClientRect()
          if (rect.width === 0 && rect.height === 0) continue
          if (rect.right > vw + 0.5 || rect.left < -0.5) {
            worst = {
              tag: el.tagName,
              cls: (el as HTMLElement).className?.toString?.().slice(0, 80) ?? '',
              left: rect.left,
              right: rect.right
            }
            break
          }
        }
        return {
          vw,
          worst,
          scrollWidth: (document.scrollingElement as HTMLElement).scrollWidth
        }
      })
      expect(overflow.worst, `${id}: overflowing element ${JSON.stringify(overflow.worst)}`).toBeNull()
      expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.vw)
    }
  })

  test('persisting the last tab: reopening lands on the previously selected tab', async ({
    page
  }) => {
    await page.goto('/?type=settings&wid=0&udp=/tmp/mark-e2e&debug=0')
    await page
      .locator('.pref-container')
      .waitFor({ state: 'visible', timeout: 15_000 })

    await page.locator('.pref-toolbar [data-tab="markdown"]').click()
    await expect(page.locator('.pref-toolbar [data-tab="markdown"]')).toHaveAttribute(
      'aria-selected',
      'true'
    )

    // A "reopen" is a fresh hash navigation to the settings root.
    await page.evaluate(() => {
      window.location.hash = '#/preference'
    })
    await expect(page.locator('.pref-toolbar [data-tab="markdown"]')).toHaveAttribute(
      'aria-selected',
      'true'
    )
  })

  test('a separate Settings page changes the next PDF, Word and HTML export, including orientation correction', async ({ page, context }) => {
    await page.addInitScript(() => {
      const w = window as any
      w.__pdfs = []
      w.__words = []
      w.__html = []
      w.__mockInvoke['plugin:dialog|save'] = (args: any) => `/tmp/export.${args.options.filters[0].extensions[0]}`
      w.__mockInvoke.mt_export_pdf = (args: any) => w.__pdfs.push(args)
      w.__mockInvoke.mt_fs_write_binary = (args: any) => w.__words.push(args)
      w.__mockInvoke.mt_fs_write = (args: any) => w.__html.push(args)
    })
    await bootEditor(page)
    await openFileTab(page, '/tmp/settings-export.md', '# Settings export\n\nShared defaults.\n')
    const settings = await context.newPage()
    await installTauriShim(settings)
    await settings.goto('/?type=settings&wid=1&udp=/tmp/mark-e2e&debug=0')
    await settings.locator('.pref-toolbar [data-tab="export"]').click()
    await settings.locator('.pref-export').waitFor()
    await settings.getByRole('switch', { name: 'Landscape orientation:' }).click()
    await settings.getByRole('combobox', { name: 'Page size:' }).selectOption('Letter')
    await settings.getByRole('textbox', { name: 'The page title:' }).fill('Explicit HTML title')
    await expect.poll(() => settings.evaluate(() => JSON.parse(localStorage.getItem('mark-export-page-options') || '{}'))).toMatchObject({
      pageSize: 'Letter', isLandscape: true, htmlTitle: 'Explicit HTML title'
    })
    await page.evaluate(() => (window as any).__emitFakeEvent('mt::menu-invoked', 'file.export-file-pdf'))
    await expect.poll(() => page.evaluate(() => (window as any).__pdfs.length)).toBe(1)
    expect(await page.evaluate(() => (window as any).__pdfs[0].pageOptions)).toMatchObject({ pageSize: 'Letter', isLandscape: true })
    await page.evaluate(() => (window as any).__emitFakeEvent('mt::menu-invoked', 'file.export-file-docx'))
    await expect.poll(() => page.evaluate(() => (window as any).__words.length)).toBe(1)
    const word = await page.evaluate(() => (window as any).__words[0])
    const zip = await JSZip.loadAsync(new Uint8Array(word.data))
    const documentXml = await zip.file('word/document.xml')!.async('string')
    expect(documentXml).toContain('w:orient="landscape"')
    expect(documentXml).toContain('Settings export')
    await page.evaluate(() => (window as any).__emitFakeEvent('mt::menu-invoked', 'file.export-file-html'))
    await expect.poll(() => page.evaluate(() => (window as any).__html.length)).toBe(1)
    expect(await page.evaluate(() => JSON.stringify((window as any).__html[0]))).toContain('<title>Explicit HTML title</title>')

    await settings.getByRole('switch', { name: 'Landscape orientation:' }).click()
    await expect.poll(() => settings.evaluate(() => JSON.parse(localStorage.getItem('mark-export-page-options') || '{}').isLandscape)).toBe(false)
    await page.evaluate(() => (window as any).__emitFakeEvent('mt::menu-invoked', 'file.export-file-pdf'))
    await expect.poll(() => page.evaluate(() => (window as any).__pdfs.length)).toBe(2)
    expect(await page.evaluate(() => (window as any).__pdfs[1].pageOptions.isLandscape)).toBe(false)
    await expect(page.locator('.el-dialog')).toHaveCount(0)
    await expect(settings.locator('.el-dialog')).toHaveCount(0)
    await settings.close()
  })

  for (const format of ['pdf', 'html', 'docx']) {
    for (const alreadyOpen of [false, true]) {
      test(`${format} success opens Export in ${alreadyOpen ? 'existing' : 'fresh'} Settings without another export`, async ({ page, context }) => {
        await page.addInitScript(() => {
          const w = window as any
          w.__invokeLog = []
          w.__mockInvoke['plugin:dialog|save'] = (args: any) => `/tmp/notice.${args.options.filters[0].extensions[0]}`
          w.__mockInvoke.mt_open_setting_window = () => null
        })
        await bootEditor(page)
        await openFileTab(page, '/tmp/notice.md', '# Notice\n\nCorrection loop.\n')
        const settings = await context.newPage()
        await installTauriShim(settings)
        if (alreadyOpen) {
          await settings.goto('/?type=settings&wid=1&udp=/tmp/mark-e2e&debug=0')
          await settings.locator('.pref-toolbar [data-tab="general"]').click()
        }
        await page.evaluate(kind => (window as any).__emitFakeEvent('mt::menu-invoked', `file.export-file-${kind}`), format)
        const action = page.locator('.notification-card .action-quiet', { hasText: 'Export settings' })
        await expect(action).toBeVisible()
        const saves = await page.evaluate(() => (window as any).__invokeLog.filter((name: string) => name === 'plugin:dialog|save').length)
        await action.click()
        await expect.poll(() => page.evaluate(() => (window as any).__invokeLog.includes('mt_open_setting_window'))).toBe(true)
        if (!alreadyOpen) await settings.goto('/?type=settings&wid=1&udp=/tmp/mark-e2e&debug=0')
        await expect(settings.locator('.pref-toolbar [data-tab="export"]')).toHaveAttribute('aria-selected', 'true')
        await expect(settings.locator('.pref-export')).toBeVisible()
        expect(await page.evaluate(() => (window as any).__invokeLog.filter((name: string) => name === 'plugin:dialog|save').length)).toBe(saves)
        await settings.close()
      })
    }
  }

  for (const dark of [false, true]) {
    test(`Export controls, Reset, keyboard focus and scroll fit the ${dark ? 'dark' : 'light'} native-sized shell`, async ({ page }, testInfo) => {
      await page.goto('/?type=settings&wid=0&udp=/tmp/mark-e2e&debug=0')
      await page.locator('.pref-toolbar [data-tab="export"]').click()
      await page.locator('.pref-export').waitFor()
      await page.evaluate(dark => {
        const app = (document.querySelector('#app') as any).__vue_app__
        const preferences = app.config.globalProperties.$pinia.state.value.preferences
        preferences.followSystemTheme = false
        preferences.theme = dark ? 'ink' : 'paper'
      }, dark)
      if (dark) await expect(page.locator('body')).toHaveClass(/dark/)
      else await expect(page.locator('body')).not.toHaveClass(/dark/)
      await page.getByRole('combobox', { name: 'Page size:' }).selectOption('custom')
      await page.getByRole('combobox', { name: 'Margins:' }).selectOption('custom')
      await page.getByRole('spinbutton', { name: 'Width (mm)', exact: true }).fill('333')
      await page.getByRole('spinbutton', { name: 'Width (mm)', exact: true }).press('Tab')
      await page.getByRole('spinbutton', { name: 'Left (mm)', exact: true }).fill('23')
      await page.getByRole('spinbutton', { name: 'Left (mm)', exact: true }).press('Tab')
      await page.getByRole('textbox', { name: 'Header — Center', exact: true }).fill('  Running head  ')
      await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('mark-export-page-options') || '{}').pageSizeWidth)).toBe(333)
      await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('mark-last-print-options') || '{}'))).toMatchObject({ pageMarginLeft: 23, header: { type: 1, center: '  Running head  ' } })
      await page.getByRole('switch', { name: 'Overwrite theme font settings' }).click()
      await page.getByRole('switch', { name: 'Customize style' }).click()
      await page.locator('.pref-body').evaluate(el => { el.scrollTop = 0 })
      await page.screenshot({ path: testInfo.outputPath(`export-${dark ? 'dark' : 'light'}-top.png`) })
      const reset = page.getByRole('button', { name: 'Reset', exact: true })
      await reset.scrollIntoViewIfNeeded()
      await reset.focus()
      await expect(reset).toBeFocused()
      const geometry = await page.locator('.pref-body').evaluate(el => ({ scrollHeight: el.scrollHeight, height: el.clientHeight, width: el.clientWidth, scrollWidth: el.scrollWidth }))
      expect(geometry.scrollHeight).toBeGreaterThan(geometry.height)
      expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.width)
      await page.screenshot({ path: testInfo.outputPath(`export-${dark ? 'dark' : 'light'}-bottom.png`) })
      await reset.press('Enter')
      await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('mark-export-page-options') || '{}'))).toEqual({ pageSize: 'A4', pageSizeWidth: 210, pageSizeHeight: 297, isLandscape: false, htmlTitle: '' })
      await expect(page.locator('.pref-export').getByRole('button', { name: /^Export/ })).toHaveCount(0)
    })
  }
})
