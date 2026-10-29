// FILE: tests/e2e/perf/bench-phases-webkit.spec.ts
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Renderer-CI WebKit tier of the Stage 0 evidence (C-LARGE-DOC-STAGE-0 R-5/T-005) — drive the bench harness page in the WebKit engine and fail unless BOTH required phases report numeric results with their truthfulness proof.
//   SCOPE: Loads the built /bench/ page (vite preview), injects the committed semantic-edge fixture byte-for-byte via window.__BENCH_OPTIONS__, captures [BENCH] console markers, asserts PHASE_TYPING (numeric p50/p95, truth=ok) and PHASE_SCROLL (numeric frame distribution, frames>0) plus REPORT_DONE status=ok. Ceilings are deliberately loose (non-flaky CI gates, not product budgets — hard budgets are owner-approved only after Stage 0). This is renderer/browser evidence, never native WKWebView evidence.
//   DEPENDS: src/renderer/dist/bench (npm run build; playwright webServer runs npm run preview), tests/e2e/fixtures/large-doc/semantic-edge.md + shape-metadata.json, Playwright webkit-perf project.
//   LINKS: .grace/changes/active/C-LARGE-DOC-STAGE-0 plan T-005; .grace/verification/performance.xml V-M-060; src/renderer/bench/run-bench.mjs (the Chromium-tier vehicle; the Playwright chromium project testIgnores **/perf/**).
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   FIXTURE - committed semantic-edge.md entry name.
//   FIXTURE_PATH - repository path of that fixture.
//   METADATA - shape-metadata.json (pins the fixture exact sha256/bytes).
//   TYPING_SAMPLES - keystrokes requested from the harness; asserted on the marker.
//   SCROLL_MS - scroll phase duration requested from the harness.
//   CEILING_TYPING_P95_MS - loose CI ceiling for typing input-to-next-paint p95.
//   CEILING_SCROLL_P95_MS - loose CI ceiling for the scroll frame-interval p95.
//   MIN_FPS - loose floor so a stalled rAF loop cannot pass as no jank.
//   FixtureIdentity - fixture text plus its pinned bytes/sha256.
//   fixtureIdentity - reads the fixture and proves it matches its committed pin.
//   markerValue - extracts a numeric key from a marker line, optionally requiring truth=ok.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - C-LARGE-DOC-STAGE-0 T-005: first WebKit renderer-CI spec for the required typing and scroll phases; SKIPPED/FAILED labels in either required phase fail the test (spec constraint 3).
// END_CHANGE_SUMMARY

import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'

const FIXTURE = 'semantic-edge.md'
const FIXTURE_PATH = resolve('tests/e2e/fixtures/large-doc', FIXTURE)
const METADATA = JSON.parse(readFileSync(resolve('tests/e2e/fixtures/large-doc/shape-metadata.json'), 'utf8'))

const TYPING_SAMPLES = 24
const SCROLL_MS = 1200
const CEILING_TYPING_P95_MS = 5_000
const CEILING_SCROLL_P95_MS = 2_000
const MIN_FPS = 3

interface FixtureIdentity {
  text: string
  bytes: number
  sha256: string
}

function fixtureIdentity (): FixtureIdentity {
  const text = readFileSync(FIXTURE_PATH, 'utf8')
  const bytes = Buffer.byteLength(text)
  const sha256 = createHash('sha256').update(text).digest('hex')
  const pin = (METADATA.fixtures as Array<{ name: string, bytes: number, sha256: string }>).find(
    (f) => f.name === FIXTURE
  )
  expect(pin, `${FIXTURE} must be pinned in shape-metadata.json`).toBeTruthy()
  expect(bytes, `${FIXTURE} byte length must match its committed pin`).toBe(pin!.bytes)
  expect(sha256, `${FIXTURE} sha256 must match its committed pin`).toBe(pin!.sha256)
  return { text, bytes, sha256 }
}

function markerValue (lines: string[], name: string, key: string, requireTruth = false): number {
  for (const line of lines) {
    if (!line.includes(name)) continue
    // Only the typing marker carries the input-path truth proof; the scroll
    // marker proves itself by having recorded frames.
    if (requireTruth && !line.includes('truth=ok')) continue
    const m = line.match(new RegExp(`${key}=(-?[\\d.]+)`))
    if (m) return Number.parseFloat(m[1])
  }
  return Number.NaN
}

test.describe('bench required phases (WebKit renderer tier)', () => {
  test.describe.configure({ retries: 1 })
  test.setTimeout(180_000)

  test('typing and scroll emit numeric, truthful results — never SKIPPED', async ({ page }) => {
    const fixture = fixtureIdentity()
    const pageErrors: string[] = []
    page.on('pageerror', (err) => pageErrors.push(String(err)))

    await page.addInitScript(
      (options) => {
        ;(window as unknown as { __BENCH_OPTIONS__: unknown }).__BENCH_OPTIONS__ = options
      },
      {
        fixtureText: fixture.text,
        phases: ['typing', 'scroll'],
        typingSamples: TYPING_SAMPLES,
        scrollMs: SCROLL_MS
      }
    )

    const benchLines: string[] = []
    page.on('console', (msg) => {
      const text = msg.text()
      if (text.includes('[BENCH]')) benchLines.push(text)
    })

    await page.goto('/bench/', { waitUntil: 'load' })
    await page.waitForFunction(
      () => {
        const el = document.getElementById('report')
        return el && el.textContent.includes('REPORT_DONE')
      },
      { timeout: 150_000 }
    )

    expect(pageErrors, 'bench page must not throw').toEqual([])

    const typing = benchLines.filter((l) => l.includes('[PHASE_TYPING '))
    const scroll = benchLines.filter((l) => l.includes('[PHASE_SCROLL '))
    const done = benchLines.filter((l) => l.includes('REPORT_DONE'))

    // Required phases: a SKIPPED/FAILED/missing label fails the gate.
    expect(typing, 'PHASE_TYPING must be emitted exactly once').toHaveLength(1)
    expect(scroll, 'PHASE_SCROLL must be emitted exactly once').toHaveLength(1)
    expect(done.join('\n'), 'harness must finish ok').toContain('status=ok')
    expect(benchLines.join('\n')).not.toContain('SKIPPED')
    expect(benchLines.join('\n')).not.toContain('FAILED')

    // Typing: real-input path proof + numeric latency distribution.
    expect(typing[0]).toContain(`n=${TYPING_SAMPLES}`)
    expect(typing[0]).toContain('truth=ok')
    const typingP95 = markerValue(typing, '[PHASE_TYPING ', 'p95_ms', true)
    expect(Number.isFinite(typingP95), 'typing p95 must be numeric').toBe(true)
    expect(typingP95, 'typing p95 under the loose CI ceiling').toBeLessThan(CEILING_TYPING_P95_MS)

    // Scroll: frames actually ran, and the frame-interval distribution is numeric.
    const frames = markerValue(scroll, '[PHASE_SCROLL ', 'frames')
    const fps = markerValue(scroll, '[PHASE_SCROLL ', 'fps')
    const frameP95 = markerValue(scroll, '[PHASE_SCROLL ', 'frame_p95_ms')
    expect(frames, 'scroll must record frames').toBeGreaterThan(10)
    expect(fps, 'scroll fps floor').toBeGreaterThan(MIN_FPS)
    expect(Number.isFinite(frameP95), 'scroll frame p95 must be numeric').toBe(true)
    expect(frameP95, 'scroll frame p95 under the loose CI ceiling').toBeLessThan(CEILING_SCROLL_P95_MS)

    // Evidence line: renderer/browser tier label + exact fixture identity.
    // eslint-disable-next-line no-console
    console.log(
      `[bench-phases-webkit] tier=renderer-webkit fixture=${FIXTURE} bytes=${fixture.bytes} sha256=${fixture.sha256} typing_p95_ms=${typingP95} scroll_frame_p95_ms=${frameP95} fps=${fps} engine=webkit`
    )
  })
})
