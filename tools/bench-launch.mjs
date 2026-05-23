#!/usr/bin/env node
// M-030: BLOCK_* marker bench-launch harness.
//
// Launches the Mark binary (or `cargo run`), captures stderr BLOCK_*
// markers, computes elapsed times, and outputs a waterfall report.
//
// Usage:
//   node tools/bench-launch.mjs                           # default: target/debug/mark
//   node tools/bench-launch.mjs --binary target/release/mark
//   node tools/bench-launch.mjs --output bench.json       # save JSON
//   node tools/bench-launch.mjs --baseline bench.json     # compare & gate
//   node tools/bench-launch.mjs --help

import { spawn } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parseArgs } from 'node:util'

const TIMEOUT_MS = 30_000
const REGRESSION_THRESHOLD = 0.10 // 10%

// ── CLI ───────────────────────────────────────────────────────────────

const { values: opts } = parseArgs({
  options: {
    binary: { type: 'string', default: '' },
    output: { type: 'string', default: '' },
    baseline: { type: 'string', default: '' },
    'cargo-run': { type: 'boolean', default: false },
    timeout: { type: 'string', default: String(TIMEOUT_MS) },
    help: { type: 'boolean', default: false }
  },
  strict: true
})

if (opts.help) {
  process.stdout.write(`bench-launch — BLOCK_* marker waterfall tool

Usage:
  node tools/bench-launch.mjs [options]

Options:
  --binary <path>     Path to built binary (default: auto-detect)
  --cargo-run         Use \`cargo run\` instead of a binary
  --output <path>     Write JSON report to file
  --baseline <path>   Compare against baseline JSON, exit 1 on >10% regression
  --timeout <ms>      Process timeout (default: ${TIMEOUT_MS})
  --help              Show this help
`)
  process.exit(0)
}

// ── BLOCK_* Parser ────────────────────────────────────────────────────

const BLOCK_RE = /\[(\w+)\]\[(\w+)\]\[BLOCK_(\w+)(.*?)\]/

export function parseLine(line, processStartMs) {
  const m = line.match(BLOCK_RE)
  if (!m) return null

  const [, module, sub, name, rest] = m

  const params = {}
  const paramRe = /(\w+)=([\w./-]+)/g
  let pm
  while ((pm = paramRe.exec(rest)) !== null) {
    params[pm[1]] = pm[2]
  }

  const elapsedMs = params.elapsed_ms != null
    ? parseFloat(params.elapsed_ms)
    : (Date.now() - processStartMs)

  return {
    module,
    sub,
    name: `BLOCK_${name}`,
    fullId: `[${module}][${sub}][BLOCK_${name}]`,
    elapsedMs,
    params
  }
}

// ── Launch & Capture ──────────────────────────────────────────────────

function detectBinary() {
  if (opts.binary) return opts.binary
  const debug = resolve('target/debug/mark')
  const release = resolve('target/release/mark')
  try {
    readFileSync(release)
    return release
  } catch {
    return debug
  }
}

async function launch() {
  return new Promise((resolveP, rejectP) => {
    const markers = []
    const processStartMs = Date.now()
    let proc

    if (opts['cargo-run']) {
      proc = spawn('cargo', ['run', '--bin', 'mark'], {
        cwd: resolve('.'),
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, RUST_LOG: 'info' }
      })
    } else {
      const bin = detectBinary()
      proc = spawn(bin, [], {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, RUST_LOG: 'info' }
      })
    }

    const timeoutMs = parseInt(opts.timeout, 10) || TIMEOUT_MS
    const timer = setTimeout(() => {
      proc.kill('SIGTERM')
      setTimeout(() => proc.kill('SIGKILL'), 2000)
    }, timeoutMs)

    let stderrBuf = ''

    proc.stderr.on('data', (chunk) => {
      stderrBuf += chunk.toString()
      const lines = stderrBuf.split('\n')
      stderrBuf = lines.pop() // keep incomplete line

      for (const line of lines) {
        const parsed = parseLine(line, processStartMs)
        if (parsed) {
          markers.push(parsed)
          process.stderr.write(`  ${parsed.elapsedMs.toFixed(0).padStart(5)}ms  ${parsed.fullId}\n`)
        }
      }
    })

    proc.on('close', (code) => {
      clearTimeout(timer)
      // parse remaining buffer
      if (stderrBuf.trim()) {
        const parsed = parseLine(stderrBuf, processStartMs)
        if (parsed) markers.push(parsed)
      }
      resolveP({ markers, exitCode: code })
    })

    proc.on('error', (err) => {
      clearTimeout(timer)
      rejectP(err)
    })
  })
}

// ── Waterfall Report ──────────────────────────────────────────────────

function waterfallMarkdown(markers) {
  if (markers.length === 0) return '(no BLOCK_* markers captured)\n'

  const sorted = [...markers].sort((a, b) => a.elapsedMs - b.elapsedMs)
  const maxName = Math.max(...sorted.map((m) => m.fullId.length), 10)
  const maxMs = Math.max(...sorted.map((m) => m.elapsedMs), 1)
  const barWidth = 40

  const lines = [
    `## BLOCK_* Waterfall (${sorted.length} markers)\n`,
    `| ${'Marker'.padEnd(maxName)} | ms    | Timeline |`,
    `| ${'-'.repeat(maxName)} | ----- | ${'-'.repeat(barWidth)} |`
  ]

  for (const m of sorted) {
    const bar = '█'.repeat(Math.max(1, Math.round((m.elapsedMs / maxMs) * barWidth)))
    lines.push(
      `| ${m.fullId.padEnd(maxName)} | ${m.elapsedMs.toFixed(0).padStart(5)} | ${bar} |`
    )
  }

  const total = sorted[sorted.length - 1].elapsedMs - sorted[0].elapsedMs
  lines.push(`\nTotal span: ${total.toFixed(0)}ms (first → last marker)`)

  return lines.join('\n') + '\n'
}

function toJson(markers) {
  const sorted = [...markers].sort((a, b) => a.elapsedMs - b.elapsedMs)
  return {
    timestamp: new Date().toISOString(),
    markerCount: sorted.length,
    markers: sorted.map((m) => ({
      name: m.name,
      fullId: m.fullId,
      module: m.module,
      sub: m.sub,
      elapsedMs: m.elapsedMs,
      params: m.params
    }))
  }
}

// ── Baseline Comparison ───────────────────────────────────────────────

function compare(current, baseline) {
  const baseMap = new Map(baseline.markers.map((m) => [m.fullId, m.elapsedMs]))
  const regressions = []

  for (const m of current.markers) {
    const baseMs = baseMap.get(m.fullId)
    if (baseMs == null || baseMs === 0) continue

    const delta = (m.elapsedMs - baseMs) / baseMs
    if (delta > REGRESSION_THRESHOLD) {
      regressions.push({
        marker: m.fullId,
        baseMs,
        currentMs: m.elapsedMs,
        delta: `+${(delta * 100).toFixed(1)}%`
      })
    }
  }

  return regressions
}

// ── Main ──────────────────────────────────────────────────────────────

async function main() {
  process.stderr.write('bench-launch: starting binary…\n')

  const { markers, exitCode } = await launch()

  process.stderr.write(`\nbench-launch: process exited with code ${exitCode}, captured ${markers.length} markers\n\n`)

  // Waterfall to stdout
  process.stdout.write(waterfallMarkdown(markers))

  // JSON output
  const json = toJson(markers)
  if (opts.output) {
    writeFileSync(opts.output, JSON.stringify(json, null, 2) + '\n')
    process.stderr.write(`JSON report saved to ${opts.output}\n`)
  }

  // Baseline comparison
  if (opts.baseline) {
    const baseRaw = readFileSync(opts.baseline, 'utf8')
    const baseline = JSON.parse(baseRaw)
    const regressions = compare(json, baseline)

    if (regressions.length > 0) {
      process.stderr.write(`\n⚠ ${regressions.length} regression(s) detected (>${REGRESSION_THRESHOLD * 100}% threshold):\n`)
      for (const r of regressions) {
        process.stderr.write(`  ${r.marker}: ${r.baseMs.toFixed(0)}ms → ${r.currentMs.toFixed(0)}ms (${r.delta})\n`)
      }
      process.exit(1)
    } else {
      process.stderr.write(`✓ No regressions vs baseline (${baseline.markerCount} markers compared)\n`)
    }
  }
}

main().catch((err) => {
  process.stderr.write(`bench-launch error: ${err.message}\n`)
  process.exit(2)
})
