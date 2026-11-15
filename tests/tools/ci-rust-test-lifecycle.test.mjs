// FILE: tests/tools/ci-rust-test-lifecycle.test.mjs
// START_MODULE_CONTRACT
//   PURPOSE: Preserve the complete existing CI Rust calls while requiring their artifact lifecycle.
//   SCOPE: Parsed workflow calls, Node identity and unchanged workflow controls; no native build.
//   DEPENDS: Vitest, yaml, node:fs, node:crypto.
//   LINKS: M-046; V-M-046; C-CI-RUST-TEST-ARTIFACT-LIFECYCLE-EXECVE.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
// START_MODULE_MAP
//   nodeStep - Exact already-approved Node22 action identity.
//   baselineDigests - Full AST fingerprints of the reviewed cache delivery baseline.
//   digest - Stable complete AST fingerprint without a private-commit history dependency.
//   lifecycleProjection - Remove only the intended wrapper/setup changes for exact AST comparison.
// END_MODULE_MAP
// START_CHANGE_SUMMARY
//   - 2026-11-15 C-CI-RUST-TEST-ARTIFACT-LIFECYCLE-EXECVE: complete workflow preservation controls.
// END_CHANGE_SUMMARY
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { parse } from 'yaml'
import { describe, expect, it } from 'vitest'

const nodeStep = {
  name: 'setup node for Rust test lifecycle',
  uses: 'actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020',
  with: { 'node-version': '22' }
}
const baselineDigests = {
  'test.yml': 'baa56ae42c11c292b44f61f5b321e2329df3e741274a3a9986f1d2edc9ff6100',
  'ci.yml': '81fafd6cc3286490cd38b3a25dc829a9cfda05d6e424df1bc2eacd230d52b228'
}
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const lifecycleProjection = (workflow, job, replacements) => {
  const result = structuredClone(workflow)
  const steps = result.jobs[job].steps
  const added = steps.filter(step => step.name === nodeStep.name)
  expect(added).toEqual([nodeStep])
  result.jobs[job].steps = steps.filter(step => step.name !== nodeStep.name).map(step => {
    const old = replacements[step.run]
    return old ? { ...step, run: old } : step
  })
  return result
}

describe('CI Cargo lifecycle preserves original gate selection', () => {
  it('wraps the full selected Mark harness from its original member cwd', () => {
    const actual = parse(readFileSync('.github/workflows/test.yml', 'utf8'))
    expect(actual.jobs['backend-unit'].steps.find(step => step.name === 'cargo test')).toEqual({
      name: 'cargo test', 'working-directory': 'src-tauri', run: 'node ../tools/run-rust-tests.mjs --bin mark'
    })
    expect(digest(lifecycleProjection(actual, 'backend-unit', {
      'node ../tools/run-rust-tests.mjs --bin mark': 'cargo test --bin mark'
    }))).toBe(baselineDigests['test.yml'])
  })

  it('keeps unfiltered root workspace selection and the exact separate fixture filter', () => {
    const actual = parse(readFileSync('.github/workflows/ci.yml', 'utf8'))
    expect(actual.jobs.test.steps.find(step => step.name === 'Cargo test').run).toBe('node tools/run-rust-tests.mjs')
    expect(actual.jobs.test.steps.find(step => step.name === 'Fixture validation').run).toBe('node tools/run-rust-tests.mjs embedded_fixture_parses_and_matches_registered')
    expect(digest(lifecycleProjection(actual, 'test', {
      'node tools/run-rust-tests.mjs': 'cargo test',
      'node tools/run-rust-tests.mjs embedded_fixture_parses_and_matches_registered': 'cargo test embedded_fixture_parses_and_matches_registered'
    }))).toBe(baselineDigests['ci.yml'])
  })

  it('rejects a reduced root bin-only gate and changed timeout/cache/pin controls', () => {
    const baseline = parse(readFileSync('.github/workflows/ci.yml', 'utf8'))
    const reduced = structuredClone(baseline)
    reduced.jobs.test.steps.find(step => step.name === 'Cargo test').run = 'cargo test --bin mark'
    expect(digest(reduced)).not.toBe(digest(baseline))
    const modified = parse(readFileSync('.github/workflows/test.yml', 'utf8'))
    modified.jobs['backend-unit']['timeout-minutes'] = 60
    expect(digest(modified)).not.toBe(digest(parse(readFileSync('.github/workflows/test.yml', 'utf8'))))
  })
})
