// Path-3 driver. Runs both /bench/ (full muya) and /bench/baseline/
// (no muya) across chromium + webkit. Prints comparison + diagnoses
// whether the WebKit slowdown is muya-specific or general.
//
// Usage: `node src/renderer/bench/run-bench-compare.mjs`

import { chromium, webkit } from 'playwright'

const RUNS = 5
const TIMEOUT_MS = 60_000

async function singleRun(browserType, url) {
  const browser = await browserType.launch()
  const ctx = await browser.newContext({ viewport: { width: 1024, height: 768 } })
  const page = await ctx.newPage()
  const lines = []
  page.on('console', (msg) => {
    if (msg.text().includes('[BENCH]')) lines.push(msg.text())
  })
  await page.goto(url, { waitUntil: 'load', timeout: TIMEOUT_MS })
  await page.waitForFunction(
    () => document.getElementById('report')?.textContent.includes('REPORT_DONE'),
    { timeout: TIMEOUT_MS }
  )
  await browser.close()
  const m = lines.map((l) => l.match(/PHASE_INIT_RENDER ms=([\d.]+)/)).find(Boolean)
  return m ? parseFloat(m[1]) : null
}

async function multiRun(browserType, label, url) {
  const samples = []
  for (let i = 0; i < RUNS; i++) {
    process.stderr.write(`  ${label} run ${i + 1}/${RUNS}…`)
    const ms = await singleRun(browserType, url)
    samples.push(ms)
    process.stderr.write(` ${ms?.toFixed(1)}ms\n`)
  }
  return samples
}

function stats(s) {
  const v = s.filter(Number.isFinite).sort((a, b) => a - b)
  if (!v.length) return { p50: NaN, p95: NaN, mean: NaN }
  const sum = v.reduce((a, b) => a + b, 0)
  return {
    p50: v[Math.floor(v.length / 2)],
    p95: v[Math.min(v.length - 1, Math.ceil(0.95 * v.length) - 1)],
    mean: sum / v.length
  }
}

;(async () => {
  console.log(`# Path-3 muya vs baseline diagnostic — ${new Date().toISOString()}`)
  console.log(`Runs per (engine, url): ${RUNS}`)
  console.log(``)

  const muyaUrl = 'http://localhost:4173/bench/'
  const baselineUrl = 'http://localhost:4173/bench/baseline/'

  process.stderr.write('--- chromium / muya ---\n')
  const cMuya = await multiRun(chromium, 'chromium', muyaUrl)
  process.stderr.write('--- chromium / baseline ---\n')
  const cBase = await multiRun(chromium, 'chromium', baselineUrl)
  process.stderr.write('--- webkit / muya ---\n')
  const wMuya = await multiRun(webkit, 'webkit', muyaUrl)
  process.stderr.write('--- webkit / baseline ---\n')
  const wBase = await multiRun(webkit, 'webkit', baselineUrl)

  const cm = stats(cMuya), cb = stats(cBase), wm = stats(wMuya), wb = stats(wBase)
  console.log(`## Initial render (ms)`)
  console.log(``)
  console.log(`| engine   | scenario | n | p50  | p95  | mean |`)
  console.log(`|----------|----------|---|------|------|------|`)
  console.log(`| chromium | muya     | ${cMuya.length} | ${cm.p50.toFixed(1)} | ${cm.p95.toFixed(1)} | ${cm.mean.toFixed(1)} |`)
  console.log(`| chromium | baseline | ${cBase.length} | ${cb.p50.toFixed(1)} | ${cb.p95.toFixed(1)} | ${cb.mean.toFixed(1)} |`)
  console.log(`| webkit   | muya     | ${wMuya.length} | ${wm.p50.toFixed(1)} | ${wm.p95.toFixed(1)} | ${wm.mean.toFixed(1)} |`)
  console.log(`| webkit   | baseline | ${wBase.length} | ${wb.p50.toFixed(1)} | ${wb.p95.toFixed(1)} | ${wb.mean.toFixed(1)} |`)

  const ratioMuya = wm.mean / cm.mean
  const ratioBase = wb.mean / cb.mean
  const muyaCostC = cm.mean - cb.mean
  const muyaCostW = wm.mean - wb.mean
  const muyaSlowdown = muyaCostW / muyaCostC

  console.log(``)
  console.log(`## Diagnostic`)
  console.log(``)
  console.log(`- WebKit/Chromium ratio  (muya):     ${ratioMuya.toFixed(2)}×`)
  console.log(`- WebKit/Chromium ratio  (baseline): ${ratioBase.toFixed(2)}×`)
  console.log(`- Muya-only cost on Chromium:        +${muyaCostC.toFixed(1)} ms vs baseline`)
  console.log(`- Muya-only cost on WebKit:          +${muyaCostW.toFixed(1)} ms vs baseline`)
  console.log(`- Muya slowdown ratio (W/C):         ${muyaSlowdown.toFixed(2)}×`)
  console.log(``)
  if (ratioBase > 2.5) {
    console.log(`Interpretation: WebKit is generally ~${ratioBase.toFixed(1)}× slower than Chromium`)
    console.log(`even on the muya-free baseline. The muya-specific slowdown is`)
    console.log(`${muyaSlowdown.toFixed(2)}×, broadly aligned with the platform delta.`)
    console.log(`Path 2 (re-frame the gate) is the right move.`)
  } else {
    console.log(`Interpretation: WebKit handles the baseline at ${ratioBase.toFixed(2)}× Chromium.`)
    console.log(`Muya adds another ${muyaSlowdown.toFixed(2)}× on top — muya engine is the`)
    console.log(`primary cost driver. Worth investigating muya hot paths before`)
    console.log(`accepting the perf delta.`)
  }
})().catch((err) => { console.error('driver fatal:', err); process.exit(2) })
