// Phase-B1 step-2.5b driver. Loads /bench/ in both Chromium (= Electron 41
// rendering engine) and WebKit (= WKWebView rendering engine), captures
// [BENCH] console markers, prints a side-by-side comparison.
//
// Usage:
//   1) `npm run build` (produces src/renderer/dist/bench/)
//   2) `npm run preview` in another terminal
//   3) `node src/renderer/bench/run-bench.mjs`

import { chromium, webkit } from 'playwright'

const URL = process.env.BENCH_URL ?? 'http://localhost:4173/bench/'
const RUNS_PER_ENGINE = 5
const TIMEOUT_MS = 60_000

async function singleRun(browserType, engineLabel) {
  const browser = await browserType.launch()
  const ctx = await browser.newContext({
    viewport: { width: 1024, height: 768 }
  })
  const page = await ctx.newPage()

  const benchLines = []
  page.on('console', (msg) => {
    const text = msg.text()
    if (text.includes('[BENCH]')) benchLines.push(text)
  })

  await page.goto(URL, { waitUntil: 'load', timeout: TIMEOUT_MS })
  // Wait for REPORT_DONE marker
  await page.waitForFunction(
    () => {
      const el = document.getElementById('report')
      return el && el.textContent.includes('REPORT_DONE')
    },
    { timeout: TIMEOUT_MS }
  )

  await browser.close()

  // Extract metrics
  const initRender = benchLines
    .map((l) => l.match(/PHASE_INIT_RENDER ms=([\d.]+)/))
    .find(Boolean)
  return {
    engine: engineLabel,
    initRenderMs: initRender ? parseFloat(initRender[1]) : null,
    rawLines: benchLines
  }
}

async function multiRun(browserType, label, n) {
  const samples = []
  for (let i = 0; i < n; i++) {
    process.stderr.write(`  ${label} run ${i + 1}/${n}…`)
    const r = await singleRun(browserType, label)
    samples.push(r.initRenderMs)
    process.stderr.write(` ${r.initRenderMs?.toFixed(1)}ms\n`)
  }
  return samples
}

function stats(samples) {
  const valid = samples.filter((x) => Number.isFinite(x))
  if (!valid.length) return { n: 0, p50: NaN, p95: NaN, mean: NaN, min: NaN, max: NaN }
  const s = [...valid].sort((a, b) => a - b)
  const sum = s.reduce((a, b) => a + b, 0)
  const p = (q) => s[Math.min(s.length - 1, Math.ceil((q / 100) * s.length) - 1)]
  return {
    n: s.length,
    p50: p(50),
    p95: p(95),
    mean: sum / s.length,
    min: s[0],
    max: s[s.length - 1]
  }
}

;(async () => {
  console.log(`# muya WKWebView perf gate — Phase-B1 step-2.5b`)
  console.log(`URL: ${URL}`)
  console.log(`Runs per engine: ${RUNS_PER_ENGINE}`)
  console.log(`Date: ${new Date().toISOString()}`)
  console.log(`Node: ${process.version} on ${process.platform}-${process.arch}`)
  console.log(``)
  console.log(`Phase 1 (initial render) only — typing + scroll deferred to`)
  console.log(`step-2.5b follow-up after the harness boots cleanly here.`)
  console.log(``)

  const chromiumSamples = await multiRun(chromium, 'chromium', RUNS_PER_ENGINE)
  const webkitSamples = await multiRun(webkit, 'webkit', RUNS_PER_ENGINE)

  const c = stats(chromiumSamples)
  const w = stats(webkitSamples)

  console.log(``)
  console.log(`## Initial render (ms)`)
  console.log(``)
  console.log(`| engine   | n | p50  | p95  | mean | min  | max  |`)
  console.log(`|----------|---|------|------|------|------|------|`)
  console.log(`| chromium | ${c.n} | ${c.p50.toFixed(1)} | ${c.p95.toFixed(1)} | ${c.mean.toFixed(1)} | ${c.min.toFixed(1)} | ${c.max.toFixed(1)} |`)
  console.log(`| webkit   | ${w.n} | ${w.p50.toFixed(1)} | ${w.p95.toFixed(1)} | ${w.mean.toFixed(1)} | ${w.min.toFixed(1)} | ${w.max.toFixed(1)} |`)

  const ratio = w.mean / c.mean
  console.log(``)
  console.log(`## Gate decision`)
  console.log(``)
  const gateLines = []
  const PASS_RATIO = 1.5
  const PASS_RENDER_MAX = 1500
  gateLines.push(`- WebKit/Chromium ratio (mean): ${ratio.toFixed(2)}× — gate ≤ ${PASS_RATIO}× → ${ratio <= PASS_RATIO ? 'PASS' : 'FAIL'}`)
  gateLines.push(`- WebKit cold-start ceiling: p95=${w.p95.toFixed(1)}ms — gate ≤ ${PASS_RENDER_MAX}ms → ${w.p95 <= PASS_RENDER_MAX ? 'PASS' : 'FAIL'}`)
  gateLines.push(`- Chromium cold-start ceiling: p95=${c.p95.toFixed(1)}ms — gate ≤ ${PASS_RENDER_MAX}ms → ${c.p95 <= PASS_RENDER_MAX ? 'PASS' : 'FAIL'}`)
  for (const line of gateLines) console.log(line)

  const allPass = ratio <= PASS_RATIO && w.p95 <= PASS_RENDER_MAX && c.p95 <= PASS_RENDER_MAX
  console.log(``)
  console.log(`## Verdict: ${allPass ? 'PASS' : 'FAIL'}`)
  if (!allPass) {
    console.log(`FAIL → escalate to user; do NOT proceed to Phase-B2 per dev-plan step-2.5.`)
  }

  process.exit(allPass ? 0 : 1)
})().catch((err) => {
  console.error('driver fatal:', err)
  process.exit(2)
})
