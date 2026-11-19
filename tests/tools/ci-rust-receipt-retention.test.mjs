// @vitest-environment node
// FILE: tests/tools/ci-rust-receipt-retention.test.mjs
// START_MODULE_CONTRACT
//   PURPOSE: Retain actual Rust ownership/result JSON without exporting binaries or changing Cargo gates.
//   SCOPE: Parsed hosted/lane workflows, full AST inverse, negative mutations and inert filesystem selection.
//   DEPENDS: Vitest, yaml, Node filesystem/path/crypto built-ins.
//   LINKS: M-046; V-M-046; C-CI-RUST-RECEIPT-RETENTION.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
// START_MODULE_MAP
//   patterns - Exact positive JSON receipt patterns below the runner temporary root.
//   receiptStep - Exact existing-pin evidence-only collector.
//   nodeStep - Existing pinned Node22 setup for the lane's original Cargo call.
//   workflows - Original cohort AST identities and exact unchanged Cargo selections.
//   readWorkflow - Parse the actual checked-in workflow.
//   validateWorkflow - Validate additions before removing only them for a complete AST inverse.
//   fixtureWorkflow - Construct a positive mutation control from actual baseline controls.
//   qaEvidenceRoot - Per-runner temporary metadata-only root for renderer receipts.
//   qaReceiptStep - Exact pinned one-day JSON/JSONL renderer receipt collector.
//   restoreQaRendererEvidence - Validate only the QA additions before recovering the original full workflow AST.
//   roots - Owned inert fixture roots removed after every case.
// END_MODULE_MAP
// START_CHANGE_SUMMARY
//   - C-QA-CORE-EVIDENCE-PORTABILITY: retain renderer fixture metadata and preserve the original complete workflow digest through a strict inverse.
//   - 2026-11-16 C-CI-RUST-RECEIPT-RETENTION: actual workflow and JSON-only receipt selection controls; hosted acceptance remains separate.
// END_CHANGE_SUMMARY
import { afterEach, describe, expect, it } from 'vitest'
import { globSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { createHash } from 'node:crypto'
import { parse } from 'yaml'

const patterns = [
  '${{ runner.temp }}/mark-rust-tests-*/state.json',
  '${{ runner.temp }}/mark-rust-tests-*/result.json',
  '${{ runner.temp }}/mark-rust-tests-*/runner-*.json'
]
const receiptStep = {
  name: 'upload Rust lifecycle receipts',
  if: 'always()',
  uses: 'actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02',
  with: {
    name: 'rust-test-lifecycle-${{ github.job }}-${{ runner.os }}-${{ github.run_id }}-${{ github.run_attempt }}',
    path: patterns.join('\n') + '\n',
    'if-no-files-found': 'error',
    'retention-days': 1
  }
}
const nodeStep = {
  name: 'setup node for Rust test lifecycle',
  uses: 'actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020',
  with: { 'node-version': '22' }
}
const qaEvidenceRoot = '${{ runner.temp }}/mark-qa-core-evidence-${{ runner.os }}-${{ github.run_id }}-${{ github.run_attempt }}'
const qaReceiptStep = {
  name: 'upload QA core fixture receipts',
  if: 'always()',
  env: { MARK_QA_CORE_EVIDENCE_ROOT: qaEvidenceRoot },
  uses: 'actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02',
  with: {
    name: 'qa-core-fixture-receipts-${{ github.job }}-${{ runner.os }}-${{ github.run_id }}-${{ github.run_attempt }}',
    path: '${{ env.MARK_QA_CORE_EVIDENCE_ROOT }}/*.json\n${{ env.MARK_QA_CORE_EVIDENCE_ROOT }}/*.jsonl\n',
    'if-no-files-found': 'error',
    'retention-days': 1
  }
}
function restoreQaRendererEvidence(projected) {
  const job = projected.jobs['renderer-unit']
  const coverage = job.steps.find(step => step.name === 'vitest run with coverage')
  expect(coverage.env).toEqual({ MARK_QA_CORE_EVIDENCE_ROOT: qaEvidenceRoot })
  expect(job.steps.filter(step => step.name === qaReceiptStep.name)).toEqual([qaReceiptStep])
  expect(job.steps.at(-1)).toEqual(qaReceiptStep)
  delete coverage.env
  job.steps = job.steps.filter(step => step.name !== qaReceiptStep.name)
}
const workflows = [
  { file: 'ci.yml', job: 'test', digest: 'e62b37f440a719603591115773049437e68990da95b0993c3a12813640543654',
    calls: [{ name: 'Cargo test', run: 'node tools/run-rust-tests.mjs' }, { name: 'Fixture validation', run: 'node tools/run-rust-tests.mjs embedded_fixture_parses_and_matches_registered' }] },
  { file: 'test.yml', job: 'backend-unit', digest: '0e0700b6be9e36d963a4ff5d23f4555adea106002f1a4f28d79b1033771849e4',
    calls: [{ name: 'cargo test', 'working-directory': 'src-tauri', run: 'node ../tools/run-rust-tests.mjs --bin mark' }] },
  { file: 'lane.yml', job: 'test', digest: '7d42522c2477650b2cc0ea51594f579c4786ade2213083f798bf53c352394496',
    calls: [{ name: 'Cargo test', run: 'node tools/run-rust-tests.mjs' }] }
]
const readWorkflow = file => parse(readFileSync(`.github/workflows/${file}`, 'utf8'))
function validateWorkflow(actual, config) {
  const projected = structuredClone(actual), steps = projected.jobs[config.job].steps
  expect(steps.filter(step => step.name === receiptStep.name)).toEqual([receiptStep])
  expect(steps.at(-1)).toEqual(receiptStep)
  for (const call of config.calls) expect(steps.find(step => step.name === call.name)).toEqual(call)
  expect(steps.filter(step => step.name === nodeStep.name)).toEqual([nodeStep])
  let restored = steps.filter(step => step.name !== receiptStep.name)
  if (config.file === 'lane.yml') {
    restored = restored.filter(step => step.name !== nodeStep.name).map(step => step.name === 'Cargo test' ? { ...step, run: 'cargo test' } : step)
  }
  projected.jobs[config.job].steps = restored
  if (config.file === 'test.yml') restoreQaRendererEvidence(projected)
  expect(createHash('sha256').update(JSON.stringify(projected)).digest('hex')).toBe(config.digest)
}
function fixtureWorkflow(config) {
  const actual = readWorkflow(config.file), steps = actual.jobs[config.job].steps
  actual.jobs[config.job].steps = steps.filter(step => step.name !== receiptStep.name)
  if (config.file === 'lane.yml' && !steps.some(step => step.name === nodeStep.name)) {
    const index = actual.jobs[config.job].steps.findIndex(step => step.name === 'Cargo test')
    actual.jobs[config.job].steps.splice(index, 0, structuredClone(nodeStep))
    actual.jobs[config.job].steps.find(step => step.name === 'Cargo test').run = config.calls[0].run
  }
  actual.jobs[config.job].steps.push(structuredClone(receiptStep))
  return actual
}
const roots = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })

describe('actual Rust receipt retention', () => {
  it('accepts only the proposed additions on all three original workflow controls', () => {
    for (const config of workflows) validateWorkflow(fixtureWorkflow(config), config)
  })

  it.each(workflows)('retains exact evidence for $file without changing its complete controls', config => {
    validateWorkflow(readWorkflow(config.file), config)
  })

  it('wraps the original root lane Cargo call without a filter or changed cwd', () => {
    expect(readWorkflow('lane.yml').jobs.test.steps.find(step => step.name === 'Cargo test')).toEqual(workflows[2].calls[0])
  })

  it.each([
    ['missing always', step => { delete step.if }],
    ['success-only', step => { step.if = 'success()' }],
    ['ignored missing receipts', step => { step.with['if-no-files-found'] = 'ignore' }],
    ['long retention', step => { step.with['retention-days'] = 14 }],
    ['overwrite', step => { step.with.overwrite = true }],
    ['hidden files', step => { step.with['include-hidden-files'] = true }],
    ['wrong pin', step => { step.uses = 'actions/upload-artifact@v4' }],
    ['broad directory', step => { step.with.path = '${{ runner.temp }}/mark-rust-tests-*\n' }],
    ['recursive JSON', step => { step.with.path = '${{ runner.temp }}/mark-rust-tests-*/**/*.json\n' }],
    ['stdout', step => { step.with.path += '${{ runner.temp }}/mark-rust-tests-*/cargo.stdout\n' }],
    ['stderr', step => { step.with.path += '${{ runner.temp }}/mark-rust-tests-*/runner-*.json.stderr\n' }],
    ['target', step => { step.with.path += 'target/**\n' }],
    ['missing runner records', step => { step.with.path = patterns.slice(0, 2).join('\n') + '\n' }],
    ...['github.job', 'runner.os', 'github.run_id', 'github.run_attempt'].map(key => [`missing name ${key}`, step => { step.with.name = step.with.name.replace('${{ ' + key + ' }}', '') }])
  ])('rejects %s collection', (_name, mutate) => {
    const config = workflows[0], actual = fixtureWorkflow(config)
    mutate(actual.jobs.test.steps.at(-1))
    expect(() => validateWorkflow(actual, config)).toThrow()
  })

  it('rejects duplicate collection and collection before a later Cargo call', () => {
    const config = workflows[0], duplicate = fixtureWorkflow(config)
    duplicate.jobs.test.steps.push(structuredClone(receiptStep))
    expect(() => validateWorkflow(duplicate, config)).toThrow()
    const early = fixtureWorkflow(config), steps = early.jobs.test.steps
    steps.splice(steps.findIndex(step => step.name === 'Fixture validation'), 0, steps.pop())
    expect(() => validateWorkflow(early, config)).toThrow()
  })

  it.each([
    ['Cargo selection', workflow => { workflow.jobs.test.steps.find(step => step.name === 'Cargo test').run += ' --bin mark' }],
    ['cache', workflow => { workflow.jobs.test.steps.find(step => step.name === 'Rust cache').with.workspaces = '.' }],
    ['trigger', workflow => { workflow.on.push.branches = ['other'] }],
    ['permissions', workflow => { workflow.permissions.contents = 'write' }],
    ['deadline', workflow => { workflow.jobs.test['timeout-minutes'] = 999 }]
  ])('rejects changed original %s controls', (_name, mutate) => {
    const config = workflows[0], actual = fixtureWorkflow(config); mutate(actual)
    expect(() => validateWorkflow(actual, config)).toThrow()
  })

  it('selects both call directories and only receipt JSON from paths containing spaces', () => {
    const root = mkdtempSync(join(tmpdir(), 'rust receipts space-')); roots.push(root)
    const expected = ['mark-rust-tests-call one/state.json', 'mark-rust-tests-call one/result.json', 'mark-rust-tests-call one/runner-101-one.json',
      'mark-rust-tests-call two/state.json', 'mark-rust-tests-call two/result.json', 'mark-rust-tests-call two/runner-202-two.json']
    const excluded = ['mark-rust-tests-call one/cargo.stdout', 'mark-rust-tests-call one/cargo.stderr', 'mark-rust-tests-call one/runner-101-one.json.stdout',
      'mark-rust-tests-call one/runner-101-one.json.stderr', 'mark-rust-tests-call one/mark-0123456789abcdef', 'mark-rust-tests-call one/nested/result.json',
      'mark-rust-tests-call one/profile.json', 'mark-rust-tests-call one/state.json.env', 'mark-rust-test-near/state.json', 'other/mark-rust-tests-nested/state.json',
      'target/debug/deps/mark-0123456789abcdef', 'target/runner-cache.json']
    for (const name of [...expected, ...excluded]) { const path = join(root, name); mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, '{"inert":true}\n') }
    const actualPaths = receiptStep.with.path.trim().split('\n').map(pattern => pattern.replace('${{ runner.temp }}', root.replaceAll('\\', '/')))
    const selected = globSync(actualPaths).filter(path => lstatSync(path).isFile()).map(path => resolve(path)).sort()
    expect(selected).toEqual(expected.map(path => resolve(root, path)).sort())
    expect(selected).toHaveLength(6)
  })
})

describe('actual renderer QA receipt retention', () => {
  it('retains only the exact renderer metadata additions with a complete original workflow inverse', () => {
    validateWorkflow(readWorkflow('test.yml'), workflows.find(config => config.file === 'test.yml'))
  })
  it.each([
    ['missing environment', job => { delete job.steps.find(step => step.name === 'vitest run with coverage').env }],
    ['shared root', job => { job.steps.find(step => step.name === 'vitest run with coverage').env.MARK_QA_CORE_EVIDENCE_ROOT = '${{ runner.temp }}/shared' }],
    ['extra environment', job => { job.steps.find(step => step.name === 'vitest run with coverage').env.EXTRA = 'not-authorized' }],
    ['missing always', job => { delete job.steps.at(-1).if }],
    ['success-only', job => { job.steps.at(-1).if = 'success()' }],
    ['wrong pin', job => { job.steps.at(-1).uses = 'actions/upload-artifact@v4' }],
    ['long retention', job => { job.steps.at(-1).with['retention-days'] = 14 }],
    ['ignored absent receipts', job => { job.steps.at(-1).with['if-no-files-found'] = 'ignore' }],
    ['overwrite', job => { job.steps.at(-1).with.overwrite = true }],
    ['hidden files', job => { job.steps.at(-1).with['include-hidden-files'] = true }],
    ['broad root', job => { job.steps.at(-1).with.path = '${{ env.MARK_QA_CORE_EVIDENCE_ROOT }}/\n' }],
    ['recursive metadata', job => { job.steps.at(-1).with.path = '${{ env.MARK_QA_CORE_EVIDENCE_ROOT }}/**/*.json\n' }],
    ['logs', job => { job.steps.at(-1).with.path += '${{ env.MARK_QA_CORE_EVIDENCE_ROOT }}/*.log\n' }],
    ['binaries', job => { job.steps.at(-1).with.path += 'target/**\n' }],
    ['missing JSONL', job => { job.steps.at(-1).with.path = '${{ env.MARK_QA_CORE_EVIDENCE_ROOT }}/*.json\n' }],
    ...['github.job', 'runner.os', 'github.run_id', 'github.run_attempt'].map(key => [`missing name ${key}`, job => { job.steps.at(-1).with.name = job.steps.at(-1).with.name.replace('${{ ' + key + ' }}', '') }])
  ])('rejects %s QA collection without changing the old baseline digest', (_name, mutate) => {
    const actual = readWorkflow('test.yml'); mutate(actual.jobs['renderer-unit'])
    expect(() => validateWorkflow(actual, workflows.find(config => config.file === 'test.yml'))).toThrow()
  })
  it('rejects duplicate or non-final collectors and changes to old renderer controls', () => {
    for (const mutate of [job => job.steps.push(structuredClone(qaReceiptStep)), job => job.steps.unshift(job.steps.pop()), job => { job.steps.find(step => step.name === 'vitest run with coverage').run = 'npm test' }, job => { job['timeout-minutes'] = 999 }]) {
      const actual = readWorkflow('test.yml'); mutate(actual.jobs['renderer-unit'])
      expect(() => validateWorkflow(actual, workflows.find(config => config.file === 'test.yml'))).toThrow()
    }
  })
  it('selects only top-level JSON and JSONL metadata in an owned root with spaces', () => {
    const root = mkdtempSync(join(tmpdir(), 'qa receipt space-')); roots.push(root)
    const expected = ['gate-fixtures.jsonl', 'fixture-cleanup.jsonl', 'prepare-fixture-cleanup.jsonl', 'cleanup-cli-control.json']
    const excluded = ['tool.stdout', 'tool.stderr', 'tool.log', 'mark-0123456789abcdef', 'fixture.json.stdout', 'profile/preferences.json', 'nested/child.json', 'payload.app/Contents/MacOS/mark', 'cache/state.json', 'environment.env']
    for (const name of [...expected, ...excluded]) { const path = join(root, name); mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, '{}') }
    const selected = globSync([join(root, '*.json'), join(root, '*.jsonl')]).filter(path => lstatSync(path).isFile()).map(path => resolve(path)).sort()
    expect(selected).toEqual(expected.map(path => resolve(root, path)).sort())
  })
})
