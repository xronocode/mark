import { test, expect } from '@playwright/test'
import { installTauriShim } from './fixtures/tauri-shim'

test.describe('app boot', () => {
  test.beforeEach(async ({ page }) => {
    await installTauriShim(page)
  })

  test('Vue app mounts without fatal console errors', async ({ page }) => {
    const consoleErrors: string[] = []
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        const text = msg.text()
        // Allow IPC-shim "not found / not allowed by ACL" warnings — by
        // design the shim downgrades unhandled mt_* commands to undefined.
        // Allow muya/codemirror missing-binary warnings (no native fonts
        // service in vite preview).
        if (
          text.includes('not found') ||
          text.includes('not allowed by ACL') ||
          text.includes('Failed to load resource') ||
          text.includes('locales/')
        ) {
          return
        }
        consoleErrors.push(text)
      }
    })

    await page.goto('/?type=editor&wid=0&udp=/tmp/mark-e2e&debug=0')

    // #app gets children once createApp(...).mount('#app') runs.
    await page.waitForFunction(
      () => {
        const el = document.getElementById('app')
        return !!el && el.children.length > 0
      },
      undefined,
      { timeout: 15_000 }
    )

    await expect(page).toHaveTitle('MarkText')

    // Give muya / codemirror a moment to settle, then assert no fatal
    // errors landed in the console.
    await page.waitForTimeout(500)
    expect(
      consoleErrors,
      `unexpected console errors:\n${consoleErrors.join('\n---\n')}`
    ).toEqual([])
  })
})
