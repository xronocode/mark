import { test, expect } from '@playwright/test'
import { installTauriShim } from './fixtures/tauri-shim'
import { bootEditor, openFileTab } from './fixtures/helpers'
import JSZip from 'jszip'

/**
 * C-38 T-003 — the redesigned Settings shell.
 *
 * Runs in chromium AND webkit (the WKWebView engine the macOS build
 * ships): the window is 640×620; every catalog tab must open
 * without horizontal overflow.
 */

test.use({ viewport: { width: 640, height: 620 } })

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
