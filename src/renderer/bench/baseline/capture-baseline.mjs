#!/usr/bin/env node
// FILE: src/renderer/bench/baseline/capture-baseline.mjs
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Capture the Stage 0 baseline (C-LARGE-DOC-STAGE-0 R-8/T-009): run the bench driver over the committed corpus and write a machine-readable baseline JSON plus the human-readable table, each entry carrying commit, fixture hash/bytes, engine/runtime and run conditions.
//   SCOPE: Spawns src/renderer/bench/run-bench.mjs per fixture with --json, aggregates per-run parsed markers (open, typing, scroll, observer overhead, heap observations) and writes baseline/large-doc/baseline.json + baseline.md. Numbers are machine-specific observations, never product budgets; a failed engine run is recorded as such instead of being dropped.
//   DEPENDS: src/renderer/bench/run-bench-preview.mjs (builds once if needed, reuses or starts and stops its own preview server), committed corpus fixtures, node:child_process/fs/os/path.
//   LINKS: .grace/changes/active/C-LARGE-DOC-STAGE-0 plan T-009; .grace/verification/performance.xml V-M-060; src/renderer/bench/README.md.
//   ROLE: SCRIPT
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   HERE - directory of this script.
//   REPO_ROOT - repository root resolved from this script.
//   FIXTURES - corpus fixtures and runs/engine used for the Stage 0 baseline. --render-only re-renders baseline.md from the existing baseline.json without re-measuring.
//   DRIVER - absolute path to the self-contained run-bench-preview.mjs wrapper.
//   OUT_DIR - baseline/large-doc/ inside the bench tree.
//   stats - nearest-rank p50/p95/mean/min/max over per-run samples.
//   runFixture - spawns the driver once for one fixture and returns its JSON report.
//   summarizeEngine - turns per-run parsed markers into one compact engine entry.
//   aggregate - turns the driver report into the baseline fixture entry.
//   cell - formats one markdown table cell, keeping nulls visibly absent.
//   renderMarkdown - human table per fixture/engine.
//   main - runs every fixture, writes baseline.json + baseline.md, exits non-zero if any required phase failed.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - C-LARGE-DOC-STAGE-0 T-009: first baseline capture (mixed-100k, size-1mb, size-1_7mb-9000sections; overhead + heap observations recorded separately).
// END_CHANGE_SUMMARY

import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(HERE, '../../../..')
const DRIVER = path.resolve(REPO_ROOT, 'src/renderer/bench/run-bench-preview.mjs')
const OUT_DIR = path.resolve(HERE, 'large-doc')

const FIXTURES = [
  { path: 'tests/e2e/fixtures/large-doc/mixed-100k.md', runs: 3 },
  { path: 'tests/e2e/fixtures/large-doc/size-1mb.md', runs: 3 },
  { path: 'tests/e2e/fixtures/large-doc/size-1_7mb-9000sections.md', runs: 1 }
]

function stats (samples) {
  const valid = samples.filter((x) => Number.isFinite(x))
  if (!valid.length) return { n: 0, p50: null, p95: null, mean: null, min: null, max: null }
  const s = [...valid].sort((a, b) => a - b)
  const p = (q) => s[Math.min(s.length - 1, Math.ceil((q / 100) * s.length) - 1)]
  const r1 = (v) => Number(v.toFixed(1))
  return {
    n: s.length,
    p50: r1(p(50)),
    p95: r1(p(95)),
    mean: r1(s.reduce((a, b) => a + b, 0) / s.length),
    min: r1(s[0]),
    max: r1(s[s.length - 1])
  }
}

function runFixture (fixture, tmpRoot) {
  const jsonPath = path.join(tmpRoot, path.basename(fixture.path) + '.json')
  const res = spawnSync(
    process.execPath,
    [
      DRIVER,
      '--fixture', fixture.path,
      '--phases', 'open,typing,overhead,scroll',
      '--runs', String(fixture.runs),
      '--json', jsonPath
    ],
    { cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }
  )
  if (!existsSync(jsonPath)) {
    throw new Error(
      `driver produced no JSON report for ${fixture.path} (exit ${res.status})\n` +
      `--- driver stderr ---\n${(res.stderr || '').slice(-4000)}\n--- driver stdout ---\n${(res.stdout || '').slice(-2000)}`
    )
  }
  const report = JSON.parse(readFileSync(jsonPath, 'utf8'))
  if (res.status !== 0 && report.verdict.status === 'PASS') {
    throw new Error(`driver exited ${res.status} for ${fixture.path} but reported PASS:\n${res.stderr || res.stdout}`)
  }
  return report
}

function summarizeEngine (runs) {
  const pick = (getter) => runs.map((r) => getter(r)).filter((v) => v !== null && v !== undefined && Number.isFinite(v))
  const first = (getter) => {
    for (const r of runs) {
      const v = getter(r)
      if (v !== undefined && v !== null) return v
    }
    return null
  }
  const typingP50 = stats(pick((r) => r.typing && r.typing.p50_ms))
  const typingP95 = stats(pick((r) => r.typing && r.typing.p95_ms))
  const scrollFps = stats(pick((r) => r.scroll && r.scroll.fps))
  const scrollP95 = stats(pick((r) => r.scroll && r.scroll.frame_p95_ms))
  const overheadP50 = stats(pick((r) => r.overhead && r.overhead.instrumented_p50_ms))
  const controlP50 = stats(pick((r) => r.overhead && r.overhead.control_p50_ms))
  const ratios = runs
    .map((r) => r.overhead && r.overhead.ratio_p50)
    .filter((v) => v !== undefined && v !== null && Number.isFinite(Number(v)))
    .map(Number)

  return {
    runs: runs.length,
    failed: runs.filter((r) => r.failed).length,
    open_ms: stats(pick((r) => r.init_render && r.init_render.ms)),
    open_breakdown_ms: {
      parse_proxy: first((r) => r.init_render && r.init_render.parse_proxy_ms),
      mount: first((r) => r.init_render && r.init_render.mount_ms),
      first_paint: first((r) => r.init_render && r.init_render.first_paint_ms)
    },
    typing_ms: { p50: typingP50, p95: typingP95 },
    responsiveness: (() => {
      const marker = first((r) => r.typing && r.typing.meter) ?? null
      return {
        meter: marker,
        longtask_max_ms: first((r) => r.typing && r.typing.longtask_max_ms) ?? null,
        longtasks_gt_50ms: first((r) => r.typing && r.typing.longtasks_gt_50ms) ?? null,
        loop_lag_p95_ms: first((r) => r.typing && r.typing.loop_lag_p95_ms) ?? null
      }
    })(),
    scroll: {
      fps: scrollFps,
      frame_p95_ms: scrollP95,
      frames_gt_50ms: first((r) => r.scroll && r.scroll.frames_gt_50ms) ?? null,
      frames: first((r) => r.scroll && r.scroll.frames) ?? null
    },
    overhead: {
      note: 'same-run uninstrumented control; reported separately from every baseline number',
      instrumented_p50_ms: overheadP50,
      control_p50_ms: controlP50,
      ratio_p50: ratios.length ? Number((ratios.reduce((a, b) => a + b, 0) / ratios.length).toFixed(2)) : null
    },
    memory: {
      after_open: first((r) => r.init_render && (r.init_render.after_open_heap_used_mb ?? r.init_render.after_open_heap)) ?? null,
      after_edit: first((r) => {
        const m = (r.memory || [])[0]
        return m ? (m.after_edit_heap_used_mb ?? m.after_edit_heap) : null
      }) ?? null,
      c68_opened_baseline: first((r) => (r.memory || [])[0]?.c68_opened_baseline) ?? null,
      doc_change_journal: first((r) => (r.memory || [])[0]?.doc_change_journal) ?? null
    }
  }
}

function aggregate (report, fixture) {
  return {
    fixture: {
      name: report.fixture.name,
      path: fixture.path,
      bytes: report.fixture.bytes ?? null,
      sha256: report.fixture.sha256 ?? null
    },
    engines: Object.fromEntries(Object.entries(report.engines).map(([engine, runs]) => [engine, summarizeEngine(runs)])),
    verdict: report.verdict
  }
}

function cell (v, unit = '') {
  return v === null || v === undefined ? '—' : `${v}${unit}`
}

function renderMarkdown (baseline) {
  const lines = [
    '# Stage 0 baseline — large documents',
    '',
    `Generated: ${baseline.generatedAt}  `,
    `Commit: ${baseline.commit ?? '(unknown)'}  `,
    `Driver: muya bench driver on ${baseline.runConditions.url}  `,
    `Runtime: Node ${baseline.runConditions.node}, Playwright ${baseline.runConditions.playwright}, ${baseline.runConditions.platform}, viewport ${baseline.runConditions.viewport}`,
    '',
    'Numbers are machine-specific observations captured on this host, not product',
    'budgets. Hard budgets are owner-approved only after Stage 0 (spec R-9).',
    'Observer overhead is a separate same-run control and is never folded into the',
    'tables below. `—` means the runtime does not expose that metric (for example',
    '`performance.memory` does not exist in WebKit) — never zero.',
    ''
  ]
  for (const entry of baseline.entries) {
    const f = entry.fixture
    lines.push(`## ${f.name}`, '')
    lines.push(`${f.bytes} bytes · sha256 \`${f.sha256}\` · runs/engine: ${entry.engines.chromium?.runs ?? '—'}`, '')
    lines.push('| engine | open p50 (ms) | open p95 (ms) | parse/mount/first-paint (ms) | typing p50 (ms) | typing p95 (ms) | scroll fps | scroll frame p95 (ms) | jank frames > 50 ms | heap after open (MB) |')
    lines.push('|---|---|---|---|---|---|---|---|---|---|')
    for (const [engine, e] of Object.entries(entry.engines)) {
      lines.push(
        `| ${engine} | ${cell(e.open_ms.p50)} | ${cell(e.open_ms.p95)} | ` +
        `${cell(e.open_breakdown_ms.parse_proxy)} / ${cell(e.open_breakdown_ms.mount)} / ${cell(e.open_breakdown_ms.first_paint)} | ` +
        `${cell(e.typing_ms.p50.p50)} | ${cell(e.typing_ms.p95.p50)} | ${cell(e.scroll.fps.mean)} | ` +
        `${cell(e.scroll.frame_p95_ms.mean)} | ${cell(e.scroll.frames_gt_50ms)} | ${cell(e.memory.after_open)} |`
      )
    }
    lines.push('')
    lines.push('| engine | responsiveness meter | instrumented p50 (ms) | control p50 (ms) | overhead ratio |')
    lines.push('|---|---|---|---|---|')
    for (const [engine, e] of Object.entries(entry.engines)) {
      lines.push(
        `| ${engine} | ${e.responsiveness.meter ?? '—'} | ${cell(e.overhead.instrumented_p50_ms.mean)} | ` +
        `${cell(e.overhead.control_p50_ms.mean)} | ${e.overhead.ratio_p50 === null ? '—' : `${e.overhead.ratio_p50}×`} |`
      )
    }
    lines.push('')
    if (entry.verdict.status !== 'PASS') {
      lines.push(`**Driver verdict: ${entry.verdict.status}** — ${entry.verdict.failures.join('; ')}`, '')
    }
  }
  lines.push('## How to regenerate', '')
  lines.push('```sh')
  lines.push('node src/renderer/bench/baseline/capture-baseline.mjs')
  lines.push('```')
  lines.push('')
  lines.push('The capture is self-contained: it builds the renderer once if the bench bundle is missing and starts/stops its own preview server (an already-running server on :4173 is reused).')
  lines.push('')
  return lines.join('\n')
}

function main () {
  const renderOnly = process.argv.includes('--render-only')
  if (renderOnly) {
    const existing = JSON.parse(readFileSync(path.join(OUT_DIR, 'baseline.json'), 'utf8'))
    writeFileSync(path.join(OUT_DIR, 'baseline.md'), renderMarkdown(existing) + '\n')
    console.log(`re-rendered ${path.join(OUT_DIR, 'baseline.md')} from the existing baseline.json`)
    return 0
  }

  const tmpRoot = mkdtempSync(path.join(tmpdir(), 'stage0-baseline-'))
  const entries = []
  let anyFail = false
  try {
    for (const fixture of FIXTURES) {
      process.stderr.write(`capturing ${fixture.path} (${fixture.runs} run(s)/engine)…\n`)
      const report = runFixture(fixture, tmpRoot)
      const entry = aggregate(report, fixture)
      entries.push(entry)
      if (entry.verdict.status !== 'PASS') anyFail = true
    }
  } finally {
    rmSync(tmpRoot, { recursive: true, force: true })
  }

  const baseline = {
    kind: 'stage0-baseline',
    generatedAt: new Date().toISOString(),
    commit: null,
    recordedBaseCommit: '466d4c57f5308c7893510537700da5c817e6a63b',
    runConditions: {
      url: 'http://localhost:4173/bench/',
      node: process.version,
      platform: `${process.platform}-${process.arch}`,
      playwright: null,
      viewport: '1024x768',
      note: 'single owner machine; numbers are observations for the R-9 decision, not budgets'
    },
    entries
  }

  // Commit + Playwright version come from one driver report; re-read the
  // first fixture report header via a cheap git call for the commit.
  try {
    baseline.commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: REPO_ROOT, encoding: 'utf8' }).trim()
  } catch (err) {
    baseline.commit = null
  }
  try {
    baseline.runConditions.playwright = JSON.parse(
      readFileSync(path.join(REPO_ROOT, 'node_modules/playwright/package.json'), 'utf8')
    ).version
  } catch (err) {
    baseline.runConditions.playwright = null
  }

  writeFileSync(path.join(OUT_DIR, 'baseline.json'), JSON.stringify(baseline, null, 2) + '\n')
  writeFileSync(path.join(OUT_DIR, 'baseline.md'), renderMarkdown(baseline) + '\n')
  console.log(`wrote ${path.join(OUT_DIR, 'baseline.json')} (${entries.length} fixtures)`)
  console.log(`wrote ${path.join(OUT_DIR, 'baseline.md')}`)
  return anyFail ? 1 : 0
}

process.exitCode = main()
