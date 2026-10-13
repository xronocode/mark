// FILE: tests/e2e/perf/large-doc-webkit.spec.ts
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Regression gate for C-30 — opening a large document in the WebKit engine (the engine WKWebView ships) must not spend more than the main-thread busy budget.
//   SCOPE: Renderer-only (vite preview + tauri shim); generated 500-section document; in-page event-loop lag meter; heading-count sanity check. Needs a fresh src/renderer/dist (vite preview serves it; `npm run test:e2e:perf` builds first) and Playwright WebKit (`npx playwright install webkit`); CI installs chromium only, so this gate is opt-in.
//   DEPENDS: tests/e2e/fixtures/tauri-shim.ts, tests/e2e/fixtures/helpers.ts, Playwright webkit-perf project.
//   LINKS: .grace/changes/archive/C-30; .grace/verification/runtime.xml V-M-011; src/muya/lib/parser/marked/blockRules.js START_BLOCK_STICKY_ANCHORED_RULES.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   BUDGET_MS - main-thread busy budget for the open (measured 2026-10-13 on this harness: pre-fix 8.5 s, post-fix 0.57-0.66 s).
//   generateSections - deterministic document matching the C-30 diagnosis bench shape.
//   SECTIONS - heading count of the generated document; also the render-complete condition.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - C-30: initial gate (one retry for noisy runners; fresh-build + webkit-install prerequisites documented); budget 3 s after baselining (fails pre-fix at 8.5 s, passes post-fix at ~0.6 s).
// END_CHANGE_SUMMARY

import { test, expect } from '@playwright/test'
import { installTauriShim } from '../fixtures/tauri-shim'
import { bootEditor } from '../fixtures/helpers'

const BUDGET_MS = 3_000
const SECTIONS = 500

function generateSections (n: number): string {
  const words = 'lorem ipsum dolor sit amet markdown editor native swift rust tauri webkit'.split(' ')
  let seed = 7
  const next = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed }
  const out: string[] = []
  for (let s = 0; s < n; s++) {
    out.push(`## Section ${s}\n`)
    for (let p = 0; p < 3; p++) {
      const line: string[] = []
      for (let w = 0; w < 60; w++) line.push(words[next() % words.length])
      out.push(line.join(' ') + '\n')
    }
    if (s % 25 === 0) out.push('```js\nconst x = ' + s + ';\nconsole.log(x)\n```\n')
  }
  return out.join('\n')
}

test.describe('large document open (WebKit)', () => {
  test.describe.configure({ retries: 1 })
  test.setTimeout(120_000)

  test('main-thread busy stays under budget and every heading renders', async ({ page }) => {
    await installTauriShim(page)
    await bootEditor(page)
    const markdown = generateSections(SECTIONS)

    const busyMs = await page.evaluate(async ({ md, sections }) => {
      // in-page lag meter: setTimeout(50) chain accumulates event-loop lag as busy time
      const w = window as any
      let busy = 0
      let last = performance.now()
      let running = true
      const tick = () => {
        const now = performance.now()
        const lag = now - last - 50
        if (lag > 0) busy += lag
        last = now
        if (running) setTimeout(tick, 50)
      }
      setTimeout(tick, 50)
      w.__emitFakeEvent('mt::open-new-tab', {
        pathname: '/tmp/large-doc-perf.md',
        filename: 'large-doc-perf.md',
        markdown: md,
        isUtf8BomEncoded: false,
        lineEnding: 'lf',
        adjustLineEndingOnSave: false
      })
      const started = performance.now()
      while (document.querySelectorAll('.editor-with-tabs h2').length < sections) {
        if (performance.now() - started > 90_000) break
        await new Promise(resolve => setTimeout(resolve, 100))
      }
      // let trailing post-render work land in the meter
      await new Promise(resolve => setTimeout(resolve, 1_000))
      running = false
      return busy
    }, { md: markdown, sections: SECTIONS })

    await expect(page.locator('.editor-with-tabs h2')).toHaveCount(SECTIONS)
    console.log(`[large-doc-webkit] main-thread busy ${Math.round(busyMs)} ms (budget ${BUDGET_MS} ms)`)
    expect(busyMs, 'main-thread busy while opening the large document').toBeLessThan(BUDGET_MS)
  })
})
