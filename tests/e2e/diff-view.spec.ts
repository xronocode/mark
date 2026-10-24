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
    await openFileTab(page)

    await expect(page.locator('.diff-view')).not.toBeVisible()

    await setDiffMode(page, true)

    await expect(page.locator('.diff-view')).toBeVisible({ timeout: 5_000 })
    // toBeVisible ignores clipping: the diff must actually sit inside the
    // viewport and the editing surface must be hidden (it used to push the
    // diff below the fold of the overflow-hidden container).
    await expect(page.locator('.editor-wrapper').first()).toBeHidden()
    const box = await page.locator('.diff-view').boundingBox()
    const viewport = page.viewportSize()
    expect(box!.y).toBeLessThan(viewport!.height / 2)

    await setDiffMode(page, false)
    await expect(page.locator('.diff-view')).toHaveCount(0)
    await expect(page.locator('.editor-wrapper').first()).toBeVisible()
  })

  test('untitled tab: diff mode refuses to hide the editor and explains why', async ({ page }) => {
    await bootEditor(page)

    // Via the command (Cmd+D path): not entered at all — C-68 says it
    // calmly («Nothing to compare yet», an info notice).
    await page.evaluate(() => (window as any).__emitFakeEvent('mt::menu-invoked', 'view.diff-mode'))
    const notice = page.locator('.notification-card')
    await expect(notice).toBeVisible({ timeout: 5_000 })
    await expect(notice).toContainText('Nothing to compare yet')
    await expect(page.locator('.diff-view')).toHaveCount(0)
    await expect(page.locator('.editor-wrapper').first()).toBeVisible()

    // Forced state (e.g. a stale flag): the view exits on its own.
    await setDiffMode(page, true)
    await expect(page.locator('.diff-view')).toHaveCount(0, { timeout: 5_000 })
    await expect(page.locator('.editor-wrapper').first()).toBeVisible()
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

  test('mt_diff_baseline failure falls back to the opened content — no raw error (C-68)', async ({ page }) => {
    await page.addInitScript(() => {
      ;(window as any).__mockInvoke.mt_diff_baseline = () => {
        throw 'not_a_git_repo: /tmp/mark-e2e/test.md is not inside a git repository'
      }
    })

    await bootEditor(page)
    await openFileTab(page)

    // A quick edit so the opened baseline has something to compare against.
    await page.locator('.editor-with-tabs p').first().click()
    await page.keyboard.press('End')
    await page.keyboard.type(' Edited since open.')

    await setDiffMode(page, true)

    // The diff renders against the content at open, with its header label…
    const diff = page.locator('.diff-view')
    await diff.waitFor({ state: 'visible', timeout: 5_000 })
    await expect(diff.locator('.diff-side').nth(1)).toContainText('Since you opened the file')
    await expect(diff.locator('.diff-body')).toContainText('Edited since open.')
    await expect(diff.locator('.diff-body')).toContainText('This is the modified content.')

    // …and the raw backend error never becomes a notification.
    await expect(page.locator('.notification-card')).toHaveCount(0)
  })

  test('mt_diff_baseline failure without edits: the calm notice, not the error (C-68)', async ({ page }) => {
    await page.addInitScript(() => {
      ;(window as any).__mockInvoke.mt_diff_baseline = () => {
        throw 'not_a_git_repo: /tmp/mark-e2e/test.md is not inside a git repository'
      }
    })

    await bootEditor(page)
    await openFileTab(page)

    await setDiffMode(page, true)

    // No dead end and no raw error: a calm notice, and the editor returns.
    const notice = page.locator('.notification-card')
    await expect(notice).toBeVisible({ timeout: 5_000 })
    await expect(notice).toContainText('No changes since you opened the file')
    await expect(notice).not.toContainText('not_a_git_repo')
    await expect(page.locator('.diff-view')).toHaveCount(0)
    await expect(page.locator('.editor-wrapper').first()).toBeVisible()
  })

  test('toggling diffMode off hides diff-view', async ({ page }) => {
    await bootEditor(page)
    await openFileTab(page)

    await setDiffMode(page, true)
    await expect(page.locator('.diff-view')).toBeVisible({ timeout: 5_000 })

    await setDiffMode(page, false)
    await expect(page.locator('.diff-view')).not.toBeVisible()
  })

  test('the header exit button leaves diff mode', async ({ page }) => {
    await bootEditor(page)
    await openFileTab(page)
    await setDiffMode(page, true)
    await page.locator('.diff-view .diff-exit').click()
    await expect(page.locator('.diff-view')).toHaveCount(0)
    await expect(page.locator('.editor-wrapper').first()).toBeVisible()
  })

  test('editing commands do not change the hidden document while diffing', async ({ page }) => {
    await bootEditor(page)
    await openFileTab(page)
    await page.locator('.editor-with-tabs p').first().click()
    await page.keyboard.press('End')
    const before = await page.evaluate(() => (document.querySelector('#app') as any).__vue_app__.config.globalProperties.$pinia.state.value.editor.currentFile.markdown)
    await setDiffMode(page, true)
    await page.evaluate(() => (window as any).__emitFakeEvent('mt::menu-invoked', 'edit.duplicate'))
    await page.waitForTimeout(400)
    await setDiffMode(page, false)
    await page.waitForTimeout(400)
    const after = await page.evaluate(() => (document.querySelector('#app') as any).__vue_app__.config.globalProperties.$pinia.state.value.editor.currentFile.markdown)
    expect(after).toBe(before)
  })

  test('the reading position survives a diff round-trip', async ({ page }) => {
    await bootEditor(page)
    await page.evaluate(() => {
      const md = '# Long\n\n' + Array.from({ length: 200 }, (_, i) => `Paragraph ${i}.`).join('\n\n')
      ;(window as any).__emitFakeEvent('mt::open-new-tab', {
        pathname: '/tmp/mark-e2e/long.md', markdown: md, isUtf8BomEncoded: false, lineEnding: 'lf', adjustLineEndingOnSave: false
      })
    })
    await page.waitForTimeout(800)
    const scroller = () => page.evaluate(() => (document.querySelector('#ag-editor-id')!.parentElement as HTMLElement).scrollTop)
    await page.evaluate(() => { (document.querySelector('#ag-editor-id')!.parentElement as HTMLElement).scrollTop = 1500 })
    await page.waitForTimeout(200)
    const before = await scroller()
    expect(before).toBeGreaterThan(1000)
    await setDiffMode(page, true)
    await page.waitForTimeout(300)
    await setDiffMode(page, false)
    await page.waitForTimeout(300)
    expect(Math.abs((await scroller()) - before)).toBeLessThan(5)
  })
})
