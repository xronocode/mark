// FILE: tests/renderer/perf/characterization-gate.test.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Machine-enforce the characterization rules the plan otherwise only states in prose (C-LARGE-DOC-STAGE-0 R-6/R-7/T-012): every characterization artifact carries both dual-record fields, the known defect families are all covered, the seeded suite retains a seed and a reproducible trace, and the materialized byte-policy corpus exists with its pinned bytes.
//   SCOPE: Static assertions over the committed spec text plus a real materialization run (generators/ensure.mjs) and sha256 verification of every byte-policy fixture. It does not execute the suites themselves (the webkit-perf gate does) and it never rewrites a spec.
//   DEPENDS: tests/e2e/perf/characterization-*.spec.ts, tests/e2e/fixtures/large-doc/generators/ensure.mjs, shape-metadata.json, node:fs/crypto/child_process, Vitest.
//   LINKS: .grace/changes/active/C-LARGE-DOC-STAGE-0 plan T-006/T-007/T-008/T-012; .grace/verification/performance.xml V-M-060.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   SPEC_DIR - directory holding the characterization suites.
//   SPECS - the three required characterization suite files.
//   DEFECT_FAMILIES - the R-7 known-defect families that must appear somewhere in the suites.
//   ENSURE - the corpus materializer CLI.
//   readSpecs - reads every required suite, failing when one is missing.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - C-LARGE-DOC-STAGE-0 T-012: gate that makes dual recording, defect-family coverage, seed/trace retention and the materialized byte-policy corpus machine-checked instead of aspirational.
// END_CHANGE_SUMMARY

import { beforeAll, describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const SPEC_DIR = resolve('tests/e2e/perf')
const SPECS = [
  'characterization-save-close.spec.ts',
  'characterization-metadata-external.spec.ts',
  'characterization-ime-seeded.spec.ts'
]
const DEFECT_FAMILIES = [
  { name: 'Save All transport no-op', pattern: /Save All emits mt_save_tabs|Save All .*no save outcome/i },
  { name: 'liveReload dirty overwrite', pattern: /external rewrite while the tab is dirty|liveReload|silently overwrit|overwrites the unsaved buffer/i },
  { name: 'metadata false-clean', pattern: /metadata change marks a dirty named tab clean|metadata .*false-clean|metadata changes never reach/i },
  { name: 'rename / Move To', pattern: /rename|Move To/i },
  { name: 'overlapping-write reordering', pattern: /pending save acknowledgement|while save-and-close is pending|reorder|reverts the tab to the old pathname/i },
  { name: 'stale save acknowledgement', pattern: /stale save ack|BLOCK_STALE_SAVE_OUTCOME_IGNORED/i },
  { name: 'string-only external equality', pattern: /BOM-only external rewrite compares equal|string-only|hash-match/i },
  { name: 'UTF-8 writeback byte loss', pattern: /save transport carries a JS string|drops the fixture BOM|writeback/i },
  { name: 'close / quit identity', pattern: /Save & Close|quit confirmation|CLOSE_TAB/i },
  { name: 'in-place save truncation', pattern: /rejected save|in-place|truncat/i }
]
const ENSURE = resolve('tests/e2e/fixtures/large-doc/generators/ensure.mjs')

function readSpecs () {
  const out = {}
  for (const name of SPECS) {
    const path = resolve(SPEC_DIR, name)
    expect(existsSync(path), `${name} must exist`).toBe(true)
    out[name] = readFileSync(path, 'utf8')
  }
  return out
}

describe('characterization gate (C-LARGE-DOC-STAGE-0 R-6/R-7)', () => {
  let specs

  beforeAll(() => {
    specs = readSpecs()
  })

  it('every suite carries both dual-record fields', () => {
    for (const [name, text] of Object.entries(specs)) {
      expect(text, `${name} must mention observedLegacyBehavior`).toContain('observedLegacyBehavior')
      expect(text, `${name} must mention desiredInvariant`).toContain('desiredInvariant')
      // At least three concrete dual records per artifact, not a lone helper.
      expect((text.match(/observedLegacyBehavior/g) || []).length, `${name} dual records`).toBeGreaterThanOrEqual(3)
      expect((text.match(/desiredInvariant/g) || []).length, `${name} desired invariants`).toBeGreaterThanOrEqual(3)
    }
  })

  it('all known defect families are covered across the suites', () => {
    const union = Object.values(specs).join('\n')
    for (const family of DEFECT_FAMILIES) {
      expect(family.pattern.test(union), `defect family not covered: ${family.name}`).toBe(true)
    }
  })

  it('the seeded suite retains a seed and a reproducible trace', () => {
    const seeded = specs['characterization-ime-seeded.spec.ts']
    expect(seeded).toMatch(/seed/i)
    expect(seeded).toMatch(/minimi[sz]ed trace|trace/i)
    // The seed must be a literal constant, not a clock/random value.
    expect(seeded).toMatch(/SEED\s*=\s*\d+|FAILING_SEED\s*=\s*\d+/)
  })

  it('the materialized byte-policy corpus exists with its pinned bytes', () => {
    execFileSync(process.execPath, [ENSURE], { cwd: resolve('.'), encoding: 'utf8' })
    const metadata = JSON.parse(
      readFileSync(resolve('tests/e2e/fixtures/large-doc/shape-metadata.json'), 'utf8')
    )
    const bytePolicy = metadata.fixtures.filter((f) => f.class === 'byte-policy')
    expect(bytePolicy.length).toBeGreaterThanOrEqual(12)
    for (const fixture of bytePolicy) {
      const path = resolve('tests/e2e/fixtures/large-doc', fixture.name)
      expect(existsSync(path), `${fixture.name} must be materialized`).toBe(true)
      const bytes = readFileSync(path)
      expect(bytes.length, `${fixture.name} bytes`).toBe(fixture.bytes)
      expect(createHash('sha256').update(bytes).digest('hex'), `${fixture.name} sha256`).toBe(fixture.sha256)
    }
  })
})
