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
//   nodeStep - Exact already-approved Node22 action identity (ci/lane lanes).
//   nodeStepNvmrc - cicd f-005: test.yml's lifecycle setup resolving its runtime from .nvmrc.
//   expectedNodeStep - the per-job node-step shape (backend-unit reads .nvmrc; ci/lane keep '22').
//   receiptStep - Exact JSON-only collector validated before inverse removal.
//   baselineDigests - Full AST fingerprints of the reviewed cache delivery baseline.
//   digest - Stable complete AST fingerprint without a private-commit history dependency.
//   lifecycleProjection - Remove only the intended wrapper/setup changes for exact AST comparison.
//   qaEvidenceRoot - Exact per-runner metadata root already owned by renderer fixture retention.
//   qaReceiptStep - Exact approved JSON-only renderer collector validated before inverse removal.
//   restoreQaEvidence - Preserve the original complete workflow oracle after validating only the QA additions.
// END_MODULE_MAP
// START_CHANGE_SUMMARY
//   - 2026-11-26 cicd f-005: test.yml's lifecycle setup resolves its Node
//     runtime from the repo-level .nvmrc (one exact runtime shared with
//     release.yml), so the backend-unit nodeStep pin and the test.yml
//     baseline digest move to the new honest state; ci.yml/lane.yml keep
//     their own '22' steps and digests unchanged.
//   - C-CI-NATIVE-EVIDENCE-COMPATIBILITY: compose exact renderer metadata additions with the unchanged original Rust workflow digest.
//   - 2026-11-16 C-CI-RUST-RECEIPT-RETENTION: retain exact prior AST gates with validated receipt collection and original lane baseline.
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
// cicd f-005: test.yml's lifecycle setup resolves its runtime from the
// repo-level .nvmrc (one exact runtime shared with release.yml); the
// ci.yml/lane.yml lanes keep their own '22' restatement.
const nodeStepNvmrc = {
  name: 'setup node for Rust test lifecycle',
  uses: 'actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020',
  with: { 'node-version-file': '.nvmrc' }
}
const expectedNodeStep = job => (job === 'backend-unit' ? nodeStepNvmrc : nodeStep)
const receiptStep = {
  name: 'upload Rust lifecycle receipts',
  if: 'always()',
  uses: 'actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02',
  with: {
    name: 'rust-test-lifecycle-${{ github.job }}-${{ runner.os }}-${{ github.run_id }}-${{ github.run_attempt }}',
    path: '${{ runner.temp }}/mark-rust-tests-*/state.json\n${{ runner.temp }}/mark-rust-tests-*/result.json\n${{ runner.temp }}/mark-rust-tests-*/runner-*.json\n',
    'if-no-files-found': 'error',
    'retention-days': 1
  }
}
const baselineDigests = {
  'test.yml': '2b5f6fc76e5b8638aebff75a5d16c5bbfc071afc8a0078382697e4389b773a61',
  'ci.yml': '81fafd6cc3286490cd38b3a25dc829a9cfda05d6e424df1bc2eacd230d52b228',
  'lane.yml': '7d42522c2477650b2cc0ea51594f579c4786ade2213083f798bf53c352394496'
}
const qaEvidenceRoot = '${{ runner.temp }}/mark-qa-core-evidence-${{ runner.os }}-${{ github.run_id }}-${{ github.run_attempt }}'
const qaReceiptStep = {
  name: 'upload QA core fixture receipts', if: 'always()', env: { MARK_QA_CORE_EVIDENCE_ROOT: qaEvidenceRoot },
  uses: 'actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02',
  with: {
    name: 'qa-core-fixture-receipts-${{ github.job }}-${{ runner.os }}-${{ github.run_id }}-${{ github.run_attempt }}',
    path: '${{ env.MARK_QA_CORE_EVIDENCE_ROOT }}/*.json\n${{ env.MARK_QA_CORE_EVIDENCE_ROOT }}/*.jsonl\n',
    'if-no-files-found': 'error', 'retention-days': 1
  }
}
function restoreQaEvidence(workflow) {
  const job = workflow.jobs['renderer-unit'], coverage = job.steps.find(step => step.name === 'vitest run with coverage')
  expect(coverage.env).toEqual({ MARK_QA_CORE_EVIDENCE_ROOT: qaEvidenceRoot })
  expect(job.steps.filter(step => step.name === qaReceiptStep.name)).toEqual([qaReceiptStep])
  expect(job.steps.at(-1)).toEqual(qaReceiptStep)
  delete coverage.env; job.steps.pop()
}
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const lifecycleProjection = (workflow, job, replacements) => {
  const result = structuredClone(workflow)
  if (job === 'backend-unit') restoreQaEvidence(result)
  const steps = result.jobs[job].steps
  const added = steps.filter(step => step.name === expectedNodeStep(job).name)
  expect(added).toEqual([expectedNodeStep(job)])
  expect(steps.filter(step => step.name === receiptStep.name)).toEqual([receiptStep])
  result.jobs[job].steps = steps.filter(step => step.name !== nodeStep.name && step.name !== receiptStep.name).map(step => {
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

  it('preserves the original unfiltered lane call and all its cache/event controls', () => {
    const actual = parse(readFileSync('.github/workflows/lane.yml', 'utf8'))
    expect(actual.jobs.test.steps.find(step => step.name === 'Cargo test')).toEqual({ name: 'Cargo test', run: 'node tools/run-rust-tests.mjs' })
    expect(digest(lifecycleProjection(actual, 'test', {
      'node tools/run-rust-tests.mjs': 'cargo test'
    }))).toBe(baselineDigests['lane.yml'])
  })

  it('never removes a modified or duplicate collector as an intended addition', () => {
    const actual = parse(readFileSync('.github/workflows/ci.yml', 'utf8'))
    const modified = structuredClone(actual)
    modified.jobs.test.steps.find(step => step.name === receiptStep.name).with.path = '${{ runner.temp }}/**\n'
    expect(() => lifecycleProjection(modified, 'test', {})).toThrow()
    const duplicate = structuredClone(actual)
    duplicate.jobs.test.steps.push(structuredClone(receiptStep))
    expect(() => lifecycleProjection(duplicate, 'test', {})).toThrow()
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

describe('strict renderer metadata composition in the original lifecycle oracle', () => {
  it.each([
    ['missing env', job => { delete job.steps.find(step => step.name === 'vitest run with coverage').env }],
    ['changed env', job => { job.steps.find(step => step.name === 'vitest run with coverage').env.MARK_QA_CORE_EVIDENCE_ROOT = 'shared' }],
    ['missing collector', job => { job.steps.pop() }],
    ['duplicate collector', job => { job.steps.push(structuredClone(qaReceiptStep)) }],
    ['nonfinal collector', job => { job.steps.unshift(job.steps.pop()) }],
    ['success-only', job => { job.steps.at(-1).if = 'success()' }],
    ['changed collector env', job => { job.steps.at(-1).env.MARK_QA_CORE_EVIDENCE_ROOT = 'other' }],
    ['wrong pin', job => { job.steps.at(-1).uses = 'actions/upload-artifact@v4' }],
    ['long retention', job => { job.steps.at(-1).with['retention-days'] = 14 }],
    ['ignored absence', job => { job.steps.at(-1).with['if-no-files-found'] = 'ignore' }],
    ['broad path', job => { job.steps.at(-1).with.path = '${{ runner.temp }}/**\n' }],
    ['missing JSONL', job => { job.steps.at(-1).with.path = '${{ env.MARK_QA_CORE_EVIDENCE_ROOT }}/*.json\n' }],
    ['changed old coverage', job => { job.steps.find(step => step.name === 'vitest run with coverage').run = 'npm test' }],
    ['changed old timeout', job => { job['timeout-minutes'] = 999 }]
  ])('rejects %s without replacing the historical full-workflow digest', (_name, mutate) => {
    const actual = parse(readFileSync('.github/workflows/test.yml', 'utf8')); mutate(actual.jobs['renderer-unit'])
    expect(() => expect(digest(lifecycleProjection(actual, 'backend-unit', { 'node ../tools/run-rust-tests.mjs --bin mark': 'cargo test --bin mark' }))).toBe(baselineDigests['test.yml'])).toThrow()
  })
})
