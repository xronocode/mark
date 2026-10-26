// Bench driver. Loads /bench/ in both Chromium (= Electron 41 rendering
// engine) and WebKit (= WKWebView rendering engine), captures [BENCH]
// console markers, prints a side-by-side comparison.
//
// This is the Chromium-tier vehicle for C-LARGE-DOC-STAGE-0 (the Playwright
// chromium PROJECT ignores **/perf/**, so numeric PHASE_ results for the
// Chromium tier come from this driver, never from a Playwright project —
// approved plan T-003/T-005).
//
// Usage:
//   1) `npm run build` (produces src/renderer/dist/bench/)
//   2) `npm run preview` in another terminal
//   3) node src/renderer/bench/run-bench.mjs [--fixture <path>]
//        [--phases open,typing,scroll] [--runs N] [--engines chromium,webkit]
//        [--typing-samples N] [--scroll-ms N]
//
// Phases: `open`, `typing` and `scroll` are REQUIRED and must emit numeric
// results; `overhead` is an optional diagnostic (observer overhead against a
// same-run uninstrumented control) and is reported separately from every
// baseline number.
//
// Semantics (spec R-5, constraint 3): a REQUIRED phase that fails to emit a
// numeric result (SKIPPED, FAILED, or missing) in any engine run fails the
// whole run — exit 1. The legacy Phase-B1 gate (WebKit/Chromium ≤ 1.5×,
// p95 ≤ 1500ms) applies ONLY to the built-in ~6 KB fixture with the default
// open-only phases; corpus fixtures are report-only for those thresholds.

import { chromium, webkit } from 'playwright'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import path from 'node:path'

const URL = process.env.BENCH_URL ?? 'http://localhost:4173/bench/'
const TIMEOUT_MS = 120_000

// ── args ───────────────────────────────────────────────────────
function parseArgs() {
  const args = process.argv.slice(2)
  const out = {}
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--fixture') out.fixture = args[++i]
    else if (args[i] === '--phases') out.phases = args[++i].split(',').map((s) => s.trim()).filter(Boolean)
    else if (args[i] === '--runs') out.runs = Number(args[++i])
    else if (args[i] === '--engines') out.engines = args[++i].split(',').map((s) => s.trim()).filter(Boolean)
    else if (args[i] === '--typing-samples') out.typingSamples = Number(args[++i])
    else if (args[i] === '--scroll-ms') out.scrollMs = Number(args[++i])
    else throw new Error(`unknown flag: ${args[i]}`)
  }
  return out
}

const ARGS = parseArgs()
const DEFAULT_FIXTURE = !ARGS.fixture
const PHASES = ARGS.phases ?? (DEFAULT_FIXTURE ? ['open'] : ['open', 'typing', 'scroll'])
const RUNS = ARGS.runs ?? (DEFAULT_FIXTURE ? 5 : 3)
const ENGINES = ARGS.engines ?? ['chromium', 'webkit']
const LEGACY_GATE = DEFAULT_FIXTURE && PHASES.join(',') === 'open'

let fixtureText = null
let fixtureIdentity = 'built-in bench fixture.js (~6 KB)'
if (!DEFAULT_FIXTURE) {
  fixtureText = await readFile(path.resolve(ARGS.fixture), 'utf8')
  const bytes = Buffer.byteLength(fixtureText)
  const sha = createHash('sha256').update(fixtureText).digest('hex')
  fixtureIdentity = `${path.basename(ARGS.fixture)} bytes=${bytes} sha256=${sha}`
}

// ── run ────────────────────────────────────────────────────────
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

  if (fixtureText !== null || ARGS.typingSamples || ARGS.scrollMs || ARGS.phases) {
    await page.addInitScript((options) => {
      window.__BENCH_OPTIONS__ = options
    }, {
      fixtureText: fixtureText ?? undefined,
      phases: PHASES,
      typingSamples: ARGS.typingSamples,
      scrollMs: ARGS.scrollMs
    })
  }

  await page.goto(URL, { waitUntil: 'load', timeout: TIMEOUT_MS })
  await page.waitForFunction(
    () => {
      const el = document.getElementById('report')
      return el && el.textContent.includes('REPORT_DONE')
    },
    { timeout: TIMEOUT_MS }
  )
  await browser.close()

  const line = (phase) => benchLines.map((l) => l.includes(`[PHASE_${phase} `) || l.includes(`[PHASE_${phase}]`) ? l : null).filter(Boolean)
  return {
    engine: engineLabel,
    initRenderMs: (benchLines.map((l) => l.match(/PHASE_INIT_RENDER ms=([\d.]+)/)).find(Boolean) || [])[1]
      ? parseFloat(benchLines.map((l) => l.match(/PHASE_INIT_RENDER ms=([\d.]+)/)).find(Boolean)[1])
      : null,
    typingLines: line('TYPING'),
    scrollLines: line('SCROLL'),
    rawLines: benchLines,
    failed: benchLines.some((l) => l.includes('status=fail') || l.includes('FAILED') || l.includes('SKIPPED'))
  }
}

// numeric presence per required phase (SKIPPED/FAILED/missing = fail)
function numeric(lineList, key) {
  for (const l of lineList) {
    const m = l.match(new RegExp(`${key}=(-?[\\d.]+)`))
    if (m && (l.includes('truth=ok') || key !== 'p50_ms')) return parseFloat(m[1])
  }
  return null
}

function stats(samples) {
  const valid = samples.filter((x) => Number.isFinite(x))
  if (!valid.length) return { n: 0, p50: NaN, p95: NaN, mean: NaN, min: NaN, max: NaN }
  const s = [...valid].sort((a, b) => a - b)
  const sum = s.reduce((a, b) => a + b, 0)
  const p = (q) => s[Math.min(s.length - 1, Math.ceil((q / 100) * s.length) - 1)]
  return { n: s.length, p50: p(50), p95: p(95), mean: sum / s.length, min: s[0], max: s[s.length - 1] }
}

// PHASE_OVERHEAD carries a same-run control only when truth=ok — an
// overhead line without that proof is not evidence.
function overheadValue(lineList, key) {
  for (const l of lineList) {
    if (!l.includes('truth=ok')) continue
    const m = l.match(new RegExp(`${key}=(-?[\\d.]+)`))
    if (m) return parseFloat(m[1])
  }
  return null
}

async function multiRun(browserType, label) {
  const runs = []
  for (let i = 0; i < RUNS; i++) {
    process.stderr.write(`  ${label} run ${i + 1}/${RUNS}…`)
    const r = await singleRun(browserType, label)
    runs.push(r)
    process.stderr.write(` init=${r.initRenderMs?.toFixed?.(1) ?? '?'}ms\n`)
  }
  return runs
}

const ENGINE_MAP = { chromium, webkit }
;(async () => {
  console.log(`# muya bench driver — C-LARGE-DOC-STAGE-0 T-003 (Phases-B1 step-2.5b successor)`)
  console.log(`URL: ${URL}`)
  console.log(`Fixture: ${fixtureIdentity}`)
  console.log(`Phases: ${PHASES.join(', ')} (required: open/typing/scroll · overhead is a diagnostic) · runs/engine: ${RUNS} · engines: ${ENGINES.join(', ')}`)
  console.log(`Node: ${process.version} on ${process.platform}-${process.arch}`)
  console.log(``)

  const perEngine = {}
  for (const name of ENGINES) {
    perEngine[name] = await multiRun(ENGINE_MAP[name], name)
  }

  const failures = []

  function phaseTable(title, extract) {
    console.log(``)
    console.log(`## ${title}`)
    console.log(``)
    console.log(`| engine   | n | p50  | p95  | mean | min  | max  |`)
    console.log(`|----------|---|------|------|------|------|------|`)
    for (const name of ENGINES) {
      const samples = perEngine[name].map(extract)
      if (samples.every((v) => v === null)) {
        failures.push(`${name}: required phase produced no numeric result`)
        console.log(`| ${name} | 0 | — | — | — | — | — | MISSING`)
        continue
      }
      const st = stats(samples.filter((v) => v !== null).map(Number))
      if (st.n < RUNS) failures.push(`${name}: only ${st.n}/${RUNS} runs produced numeric results`)
      console.log(`| ${name} | ${st.n} | ${st.p50.toFixed(1)} | ${st.p95.toFixed(1)} | ${st.mean.toFixed(1)} | ${st.min.toFixed(1)} | ${st.max.toFixed(1)} |`)
    }
  }

  if (PHASES.includes('open')) phaseTable('Initial render (ms)', (r) => r.initRenderMs)
  if (PHASES.includes('typing')) phaseTable('Typing input→next-paint (ms)', (r) => numeric(r.typingLines, 'p50_ms'))
  if (PHASES.includes('scroll')) phaseTable('Scroll frame interval (ms, p50 of frame deltas)', (r) => numeric(r.scrollLines, 'frame_p50_ms'))

  // Observer overhead is a DIAGNOSTIC, never a required phase: it is
  // reported in its own table and never folded into the tables above.
  if (PHASES.includes('overhead')) {
    console.log(``)
    console.log(`## Instrumentation overhead (diagnostic — same-run uninstrumented control)`)
    console.log(``)
    console.log(`| engine   | instrumented p50 | control p50 | ratio p50 | instrumented p95 | control p95 | ratio p95 |`)
    console.log(`|----------|------------------|-------------|-----------|------------------|-------------|-----------|`)
    for (const name of ENGINES) {
      const lines = perEngine[name].flatMap((r) => r.rawLines.filter((l) => l.includes('[PHASE_OVERHEAD ')))
      if (!lines.length) {
        console.log(`| ${name} | — | — | — | — | — | — | MISSING`)
        continue
      }
      const f = (key) => {
        const v = overheadValue(lines, key)
        return v === null ? '—' : v.toFixed(1)
      }
      const r50 = overheadValue(lines, 'ratio_p50')
      const r95 = overheadValue(lines, 'ratio_p95')
      console.log(
        `| ${name} | ${f('instrumented_p50_ms')} | ${f('control_p50_ms')} | ${r50 === null ? '—' : r50.toFixed(2)}× | ${f('instrumented_p95_ms')} | ${f('control_p95_ms')} | ${r95 === null ? '—' : r95.toFixed(2)}× |`
      )
    }
  }

  // Raw per-run lines for evidence trails.
  console.log(``)
  console.log(`## Raw phase lines (first run per engine)`)
  for (const name of ENGINES) {
    console.log(``)
    console.log(`### ${name}`)
    for (const l of perEngine[name][0].rawLines.filter((l) => l.includes('PHASE_') || l.includes('HARNESS_OPTS'))) {
      console.log(l.replace('[BENCH] ', ''))
    }
    if (perEngine[name].some((r) => r.failed)) failures.push(`${name}: run reported SKIPPED/FAILED lines`)
  }

  if (LEGACY_GATE && perEngine.chromium && perEngine.webkit) {
    const c = stats(perEngine.chromium.map((r) => r.initRenderMs).filter((v) => v !== null))
    const w = stats(perEngine.webkit.map((r) => r.initRenderMs).filter((v) => v !== null))
    const ratio = w.mean / c.mean
    console.log(``)
    console.log(`## Legacy Phase-B1 gate (built-in fixture, open-only)`)
    console.log(`- WebKit/Chromium ratio (mean): ${ratio.toFixed(2)}× — gate ≤ 1.5× → ${ratio <= 1.5 ? 'PASS' : 'FAIL'}`)
    console.log(`- WebKit cold-start ceiling: p95=${w.p95.toFixed(1)}ms — gate ≤ 1500ms → ${w.p95 <= 1500 ? 'PASS' : 'FAIL'}`)
    console.log(`- Chromium cold-start ceiling: p95=${c.p95.toFixed(1)}ms — gate ≤ 1500ms → ${c.p95 <= 1500 ? 'PASS' : 'FAIL'}`)
    if (ratio > 1.5 || w.p95 > 1500 || c.p95 > 1500) failures.push('legacy Phase-B1 gate exceeded (built-in fixture only)')
  }

  console.log(``)
  console.log(`## Verdict: ${failures.length ? 'FAIL' : 'PASS'}`)
  for (const f of failures) console.log(`- ${f}`)
  process.exit(failures.length ? 1 : 0)
})().catch((err) => {
  console.error('driver fatal:', err)
  process.exit(2)
})
