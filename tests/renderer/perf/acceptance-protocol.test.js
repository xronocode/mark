// FILE: tests/renderer/perf/acceptance-protocol.test.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Prove the tier-3 real-app acceptance tooling is honest (C-LARGE-DOC-STAGE-0 T-005): fixture-identity pins exact bytes/sha256 and refuses non-repository paths; verify-capture rejects label lies, byte/hash mismatches, phantom commits, missing phases, extra (content-bearing) marker keys, private absolute paths and unfilled templates.
//   SCOPE: Spawns both CLIs with node against a synthetic capture in the OS temp directory; mutates it per case. Does not run the real app (that is owner-side, never CI) and does not measure anything it then reports as native evidence.
//   DEPENDS: src/renderer/bench/acceptance/fixture-identity.mjs, verify-capture.mjs, tests/e2e/fixtures/large-doc/semantic-edge.md + shape-metadata.json, node:child_process, Vitest.
//   LINKS: .grace/changes/active/C-LARGE-DOC-STAGE-0 plan T-005 (R-5 tier 3); src/renderer/bench/acceptance/README.md.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   FIXTURE - repository-relative semantic-edge.md and its committed pin.
//   identityCli/verifyCli - spawn the two scripts with node, returning {status, stdout, stderr}.
//   capture - a structurally valid tier-3 capture built from the real fixture + HEAD.
//   withCapture - writes a mutated capture to a temp file and runs the verifier.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - C-LARGE-DOC-STAGE-0 T-005: first test of the real-app acceptance verifier (label honesty + fixture identity + content-free markers).
// END_CHANGE_SUMMARY

import { afterAll, describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const FIXTURE = 'tests/e2e/fixtures/large-doc/semantic-edge.md'
const FIXTURE_BYTES = readFileSync(resolve(FIXTURE))
const METADATA = JSON.parse(readFileSync(resolve('tests/e2e/fixtures/large-doc/shape-metadata.json'), 'utf8'))
const PIN = METADATA.fixtures.find((f) => f.name === 'semantic-edge.md')

const IDENTITY_CLI = resolve('src/renderer/bench/acceptance/fixture-identity.mjs')
const VERIFY_CLI = resolve('src/renderer/bench/acceptance/verify-capture.mjs')

const TMP = mkdtempSync(join(tmpdir(), 'stage0-acceptance-'))

afterAll(() => {
  rmSync(TMP, { recursive: true, force: true })
})

function runCli (script, args) {
  try {
    const stdout = execFileSync(process.execPath, [script, ...args], { encoding: 'utf8', stdio: 'pipe' })
    return { status: 0, stdout, stderr: '' }
  } catch (err) {
    return { status: err.status ?? 1, stdout: err.stdout || '', stderr: err.stderr || '' }
  }
}

const identityCli = (...args) => runCli(IDENTITY_CLI, args)
const verifyCli = (...args) => runCli(VERIFY_CLI, args)

const HEAD = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
const SHA256 = createHash('sha256').update(FIXTURE_BYTES).digest('hex')

function capture () {
  return {
    tier: 'real-app',
    engineLabel: 'native-wkwebview',
    artifactCommit: HEAD,
    artifactLabel: 'stage0-owner-build',
    runConditions: 'macOS, owner machine, warm start, fixture opened from the corpus',
    fixture: { id: 'F-SEMANTIC-EDGE', path: FIXTURE, bytes: FIXTURE_BYTES.length, sha256: SHA256 },
    markers: [
      { name: 'BLOCK_FIXTURE', values: { id: 'F-SEMANTIC-EDGE', bytes: FIXTURE_BYTES.length, sha256: SHA256 } },
      { name: 'BLOCK_OPEN', values: { first_content_ms: 120, time_to_input_ms: 240 } },
      { name: 'BLOCK_TYPING', values: { n: 40, p50_ms: 33, p95_ms: 71, truth: 'ok' } },
      { name: 'BLOCK_SCROLL', values: { frames: 240, frame_p95_ms: 21, jank_frames: 1 } },
      { name: 'BLOCK_CLOSE', values: { ms: 40 } },
      { name: 'BLOCK_DONE', values: { status: 'ok' } }
    ]
  }
}

let caseId = 0
function withCapture (mutate, args = []) {
  const body = capture()
  if (mutate) mutate(body)
  const file = join(TMP, `capture-${++caseId}.json`)
  writeFileSync(file, JSON.stringify(body, null, 2))
  return verifyCli('--capture', file, ...args)
}

describe('fixture-identity CLI (tier 3)', () => {
  it('prints the exact bytes and sha256 of a corpus fixture and matches its committed pin', () => {
    const res = identityCli('--fixture', FIXTURE, '--fixture-id', 'F-EDGE', '--json')
    expect(res.status).toBe(0)
    const out = JSON.parse(res.stdout)
    expect(out.fixture.bytes).toBe(PIN.bytes)
    expect(out.fixture.sha256).toBe(PIN.sha256)
    expect(out.fixture.id).toBe('F-EDGE')
    expect(out.pin).toBe('matches-committed-pin')
    expect(out.marker).toContain(`sha256=${PIN.sha256}`)
  })

  it('refuses an absolute fixture path (private paths never enter evidence)', () => {
    const res = identityCli('--fixture', resolve(FIXTURE))
    expect(res.status).toBe(2)
    expect(res.stderr).toContain('repository-relative')
  })

  it('refuses a path that escapes the repository', () => {
    const res = identityCli('--fixture', '../../../etc/hosts')
    expect(res.status).toBe(2)
    expect(res.stderr).toContain('outside this repository')
  })
})

describe('verify-capture CLI (tier 3)', () => {
  it('accepts a structurally valid capture whose fixture and commit are real', () => {
    const res = withCapture()
    expect(res.stdout).toContain('VERDICT: PASS')
    expect(res.status).toBe(0)
  })

  it('rejects a Playwright/browser label masquerading as native evidence', () => {
    for (const label of ['playwright-webkit', 'renderer-webserver', 'browser-webkit']) {
      const res = withCapture((c) => { c.engineLabel = label })
      expect(res.status, label).toBe(1)
      expect(res.stdout).toContain('engine label is native')
    }
  })

  it('rejects a fixture byte-length or sha256 mismatch', () => {
    const bytes = withCapture((c) => { c.fixture.bytes = c.fixture.bytes + 1 })
    expect(bytes.status).toBe(1)
    expect(bytes.stdout).toContain('byte length matches the file')

    const hash = withCapture((c) => { c.fixture.sha256 = 'deadbeef'.repeat(8) })
    expect(hash.status).toBe(1)
    expect(hash.stdout).toContain('sha256 matches the file')
  })

  it('rejects a phantom artifact commit', () => {
    const res = withCapture((c) => { c.artifactCommit = 'ffffffffffffffffffffffffffffffffffffffff' })
    expect(res.status).toBe(1)
    expect(res.stdout).toContain('exists in this repository')
  })

  it('rejects a missing required phase', () => {
    const res = withCapture((c) => { c.markers = c.markers.filter((m) => m.name !== 'BLOCK_TYPING') })
    expect(res.status).toBe(1)
    expect(res.stdout).toContain('required marker BLOCK_TYPING is present')
  })

  it('rejects extra marker keys — markers stay content-free', () => {
    const res = withCapture((c) => {
      c.markers.find((m) => m.name === 'BLOCK_TYPING').values.documentText = 'private draft text'
    })
    expect(res.status).toBe(1)
    expect(res.stdout).toContain('content-free keys')
  })

  it('rejects a non-numeric metric', () => {
    const res = withCapture((c) => {
      c.markers.find((m) => m.name === 'BLOCK_OPEN').values.first_content_ms = 'about a second'
    })
    expect(res.status).toBe(1)
    expect(res.stdout).toContain('is a finite number')
  })

  it('rejects a typing marker without the truthfulness proof', () => {
    const res = withCapture((c) => {
      c.markers.find((m) => m.name === 'BLOCK_TYPING').values.truth = 'unverified'
    })
    expect(res.status).toBe(1)
    expect(res.stdout).toContain('BLOCK_TYPING.truth is ok')
  })

  it('rejects an absolute fixture path inside the capture', () => {
    const res = withCapture((c) => { c.fixture.path = '/private/example.md' })
    expect(res.status).toBe(1)
    expect(res.stdout).toContain('repository-relative')
  })

  it('rejects an unfilled template', () => {
    const res = verifyCli('--capture', resolve('src/renderer/bench/acceptance/capture-template.json'))
    expect(res.status).toBe(1)
    expect(res.stdout).toContain('unfilled template placeholders')
    expect(res.stdout).toContain('VERDICT: FAIL')
  })
})
