import type { Page } from '@playwright/test'

export interface BootOptions {
  sideBarVisibility?: boolean
  tabBarVisibility?: boolean
  sourceCodeModeEnabled?: boolean
}

export async function bootEditor(page: Page, opts: BootOptions = {}): Promise<void> {
  const {
    sideBarVisibility = false,
    tabBarVisibility = true,
    sourceCodeModeEnabled = false
  } = opts

  await page.goto('/?type=editor&wid=0&udp=/tmp/mark-e2e&debug=0')

  await page.waitForFunction(() => {
    const ls = (window as any).__shimListeners
    if (!ls) return false
    for (const m of ls.values()) if (m.event === 'mt::bootstrap-editor') return true
    return false
  }, undefined, { timeout: 15_000 })

  await page.evaluate(({ sbv, tbv, scm }: { sbv: boolean; tbv: boolean; scm: boolean }) => {
    ;(window as any).__emitFakeEvent('mt::bootstrap-editor', {
      addBlankTab: false,
      markdownList: [''],
      lineEnding: 'lf',
      sideBarVisibility: sbv,
      tabBarVisibility: tbv,
      sourceCodeModeEnabled: scm
    })
  }, { sbv: sideBarVisibility, tbv: tabBarVisibility, scm: sourceCodeModeEnabled })

  await page.locator('.editor-with-tabs').waitFor({ state: 'visible', timeout: 15_000 })
}

export async function openFileTab(page: Page, pathname: string, markdown: string): Promise<void> {
  const filename = pathname.split('/').pop() || pathname
  await page.evaluate(({ p, md, fn }: { p: string; md: string; fn: string }) => {
    ;(window as any).__emitFakeEvent('mt::open-new-tab', {
      pathname: p,
      filename: fn,
      markdown: md,
      isUtf8BomEncoded: false,
      lineEnding: 'lf',
      adjustLineEndingOnSave: false
    })
  }, { p: pathname, md: markdown, fn: filename })
  await page.waitForTimeout(500)
}
