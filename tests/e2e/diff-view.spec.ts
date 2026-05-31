import { test, expect } from '@playwright/test'
import { installTauriShim } from './fixtures/tauri-shim'

const setDiffMode = (page: any, value: boolean) =>
  page.evaluate((v: boolean) => {
    const el = document.querySelector('#app') as any
    const app = el?.__vue_app__
    const pinia = app?.config?.globalProperties?.$pinia
    if (pinia) {
      const editorState = pinia.state.value.editor
      const tab = editorState?.currentFile
      if (tab) tab.diffMode = v
    }
  }, value)

test.describe('M-031 diff-view', () => {
  test.beforeEach(async ({ page }) => {
    await installTauriShim(page)

    await page.addInitScript(() => {
      ;(window as any).__mockInvoke.mt_diff_baseline = () =>
        '# Original\n\nThis is the baseline content.\n'
    })
  })

  const bootEditor = async (page: any) => {
    await page.goto('/?type=editor&wid=0&udp=/tmp/mark-e2e&debug=0')

    await page.waitForFunction(() => {
      const ls = (window as any).__shimListeners
      if (!ls) return false
      for (const m of ls.values()) if (m.event === 'mt::bootstrap-editor') return true
      return false
    }, undefined, { timeout: 15_000 })

    await page.evaluate(() => {
      ;(window as any).__emitFakeEvent('mt::bootstrap-editor', {
        addBlankTab: false,
        markdownList: [''],
        lineEnding: 'lf',
        sideBarVisibility: false,
        tabBarVisibility: true,
        sourceCodeModeEnabled: false
      })
    })

    await page.locator('.editor-with-tabs').waitFor({ state: 'visible', timeout: 15_000 })
  }

  const openFileTab = async (page: any) => {
    await page.evaluate(() => {
      ;(window as any).__emitFakeEvent('mt::open-new-tab', {
        pathname: '/tmp/mark-e2e/test.md',
        markdown: '# Modified\n\nThis is the modified content.\n',
        isUtf8BomEncoded: false,
        lineEnding: 'lf',
        adjustLineEndingOnSave: false
      })
    })
    // Wait for the new tab content to render
    await page.waitForTimeout(500)
  }

  test('toggling diffMode shows diff-view container', async ({ page }) => {
    await bootEditor(page)

    await expect(page.locator('.diff-view')).not.toBeVisible()

    await setDiffMode(page, true)

    await expect(page.locator('.diff-view')).toBeVisible({ timeout: 5_000 })
  })

  test('diff-view shows error when no pathname (untitled tab)', async ({ page }) => {
    await bootEditor(page)

    await setDiffMode(page, true)

    const errorEl = page.locator('.diff-view .diff-error')
    await expect(errorEl).toBeVisible({ timeout: 5_000 })
    await expect(errorEl).toContainText('save the file first')
  })

  test('diff-view invokes mt_diff_baseline with pathname', async ({ page }) => {
    await page.addInitScript(() => {
      ;(window as any).__diffBaselineCalls = []
      ;(window as any).__mockInvoke.mt_diff_baseline = (args: any) => {
        ;(window as any).__diffBaselineCalls.push(args)
        return '# Original\n\nBaseline.\n'
      }
    })

    await bootEditor(page)
    await openFileTab(page)

    await setDiffMode(page, true)

    await page.locator('.diff-view').waitFor({ state: 'visible', timeout: 5_000 })

    await expect.poll(
      async () => {
        const calls = await page.evaluate(() => (window as any).__diffBaselineCalls)
        return calls?.length ?? 0
      },
      { timeout: 5_000 }
    ).toBeGreaterThanOrEqual(1)

    const calls = await page.evaluate(() => (window as any).__diffBaselineCalls)
    expect(calls[0]).toEqual({ path: '/tmp/mark-e2e/test.md' })
  })

  test('diff-view shows error when mt_diff_baseline fails', async ({ page }) => {
    await page.addInitScript(() => {
      ;(window as any).__mockInvoke.mt_diff_baseline = () => {
        throw 'not_a_git_repo: /tmp/mark-e2e/test.md is not inside a git repository'
      }
    })

    await bootEditor(page)
    await openFileTab(page)

    await setDiffMode(page, true)

    const errorEl = page.locator('.diff-view .diff-error')
    await expect(errorEl).toBeVisible({ timeout: 5_000 })
    await expect(errorEl).toContainText('not_a_git_repo')
  })

  test('toggling diffMode off hides diff-view', async ({ page }) => {
    await bootEditor(page)

    await setDiffMode(page, true)
    await expect(page.locator('.diff-view')).toBeVisible({ timeout: 5_000 })

    await setDiffMode(page, false)
    await expect(page.locator('.diff-view')).not.toBeVisible()
  })
})
