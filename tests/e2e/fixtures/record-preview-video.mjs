// TEMP (not committed as runtime): App Preview video capture.
// Reuses the REAL tauri-shim body (TS casts stripped at build time below).
import { chromium } from '@playwright/test'
import { readFileSync, writeFileSync } from 'fs'

const BASE = 'http://localhost:4173'

// Build the init-script from the canonical TS shim: extract the
// addInitScript callback body and strip `as any`-style casts.
function buildShimScript() {
  return readFileSync('/tmp/shim-compiled.js', 'utf8')
}

const run = async () => {
  const browser = await chromium.launch()
  const ctx = await browser.newContext({
    viewport: { width: 2560, height: 1600 },
    recordVideo: { size: { width: 2560, height: 1600 } }
  })
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)))
  await page.addInitScript(buildShimScript())
  await page.goto(`${BASE}/?type=editor&wid=0&udp=/tmp/mark-e2e&debug=0`)
  await page.waitForTimeout(4000)
  const probe = await page.evaluate(() => ({
    shim: !!window.__shimListeners,
    internals: !!window.__TAURI_INTERNALS__,
    title: document.title,
    bodyLen: document.body.innerHTML.length
  }))
  console.log('PROBE:', JSON.stringify(probe), 'PAGE-ERRORS:', JSON.stringify(errors.slice(0, 3)))

  // boot editor
  await page.evaluate(() => window.__emitFakeEvent('mt::bootstrap-editor', {
    addBlankTab: false, markdownList: [''], lineEnding: 'lf',
    sideBarVisibility: false, tabBarVisibility: true, sourceCodeModeEnabled: true
  }))
  await page.waitForTimeout(1200)
  await page.evaluate(() => window.__emitFakeEvent('mt::open-new-tab', {
    pathname: '/tmp/probe/preview.md', filename: 'preview.md', markdown: '# Mark\n\n',
    isUtf8BomEncoded: false, lineEnding: 'lf', adjustLineEndingOnSave: false
  }))
  await page.waitForTimeout(1500)
  const story = [
    'Your agents write Markdown.\n\n',
    '## This second\n',
    '- **live** tables\n',
    '- mermaid diagrams\n',
    '- KaTeX math\n\n',
    '| app | size |\n|---|---|\n| Mark | 11 MB |\n\n'
  ].join('')
  for (const chunk of story) await page.keyboard.type(chunk, { delay: 22 })
  await page.waitForTimeout(600)
  await page.keyboard.press('Control+Alt+s')
  await page.waitForTimeout(3000)
  await ctx.close()
  const path = await page.video().path()
  writeFileSync('/tmp/video-path.txt', path)
  console.log('VIDEO:', path)
}
run().catch(e => { console.error('FATAL', e); process.exit(1) })
