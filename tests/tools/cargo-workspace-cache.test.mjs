// FILE: tests/tools/cargo-workspace-cache.test.mjs
// START_MODULE_CONTRACT
//   PURPOSE: Keep explicit Cargo caches aligned with the workspace target and isolated key identity.
//   SCOPE: Parsed repository workflows and controlled cache-key fixtures; no Cargo build, action execution or remote cache access.
//   DEPENDS: Vitest, yaml and node:fs; three existing GitHub workflow declarations.
//   LINKS: M-046, V-M-046, C-CARGO-WORKSPACE-CACHE.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
// START_MODULE_MAP
//   hash - Existing Rust toolchain and Cargo.lock cache identity expression.
//   contracts - The three explicit Cargo cache declarations and existing matrix dimensions.
//   expectedInputs - Independent cache path/key/restore policy for one declaration.
//   cargoCache - Locate exactly the existing cache step in its owning job.
//   assertCacheInputs - Check workspace paths and exact platform/toolchain/lock identity.
//   materialize - Expand only the controlled matrix/hash expressions for cache matching fixtures.
//   fixture - Independent valid cache inputs used by rejection controls.
//   packaged - The packaged dry-run row: qa-v2 key isolation plus legacy-v1/cross-platform rejection controls.
// END_MODULE_MAP
// START_CHANGE_SUMMARY
//   - 2026-11-19 C-QA-ARCHIVE-LIFECYCLE: isolate the packaged dry-run cache in the qa-v2 namespace with explicit legacy-v1 rejection.
//   - 2026-11-15 C-CARGO-WORKSPACE-CACHE: root-target and legacy-namespace regressions for actual workflow caches.
// END_CHANGE_SUMMARY

import { readFileSync } from 'node:fs'
import { parse } from 'yaml'
import { describe, expect, it } from 'vitest'

// START_BLOCK_CARGO_CACHE_FIXTURES
const hash = "${{ hashFiles('rust-toolchain.toml', '**/Cargo.lock') }}"
const contracts = [
  { file: 'test.yml', job: 'backend-unit', dimension: '${{ matrix.os }}', prefix: 'cargo-workspace-v1-test-', legacy: 'cargo-test-' },
  { file: 'release.yml', job: 'build', dimension: '${{ matrix.platform.target }}', prefix: 'cargo-workspace-v1-', legacy: 'cargo-' },
  { file: 'release-tauri.yml', job: 'build', dimension: '${{ matrix.platform.target }}', prefix: 'cargo-workspace-qa-v2-', legacy: 'cargo-workspace-v1-' }
]

const expectedInputs = contract => ({
  path: '~/.cargo/registry\n~/.cargo/git\ntarget\n',
  key: `${contract.prefix}${contract.dimension}-${hash}`,
  'restore-keys': `${contract.prefix}${contract.dimension}-\n`
})

const cargoCache = (workflow, contract) => {
  const steps = workflow.jobs[contract.job].steps.filter(step => step.name === 'cache cargo')
  expect(steps).toHaveLength(1)
  expect(steps[0].uses).toMatch(/^actions\/cache@[0-9a-f]{40}$/)
  return steps[0].with
}

const assertCacheInputs = (inputs, contract) => {
  const expected = expectedInputs(contract)
  expect(inputs.path.trim().split(/\r?\n/).map(path => path.trim())).toEqual(['~/.cargo/registry', '~/.cargo/git', 'target'])
  expect(inputs.key).toBe(expected.key)
  expect(inputs['restore-keys'].trim().split(/\r?\n/)).toEqual([expected['restore-keys'].trim()])
}

const materialize = (value, contract, dimension, lockHash) => value
  .replace(contract.dimension, dimension)
  .replace(hash, lockHash)
// END_BLOCK_CARGO_CACHE_FIXTURES

// START_BLOCK_ACTUAL_CARGO_CACHE_CONTRACTS
for (const contract of contracts) {
  describe(contract.file, () => {
    const workflow = parse(readFileSync(`.github/workflows/${contract.file}`, 'utf8'))
    const inputs = cargoCache(workflow, contract)

    it('caches the root target with registry/git and unchanged key inputs', () => {
      assertCacheInputs(inputs, contract)
    })

    it('rejects the legacy member-target restore namespace for every configured platform', () => {
      const matrix = workflow.jobs[contract.job].strategy.matrix
      const dimensions = contract.job === 'backend-unit' ? matrix.os : matrix.platform.map(platform => platform.target)
      expect(dimensions.length).toBeGreaterThan(0)
      for (const dimension of dimensions) {
        const key = materialize(inputs.key, contract, dimension, 'current-lock')
        const prefixes = inputs['restore-keys'].trim().split(/\r?\n/).map(prefix => materialize(prefix, contract, dimension, 'current-lock'))
        const legacy = `${contract.legacy}${dimension}-old-lock`
        expect(key).not.toBe(legacy)
        expect(prefixes.some(prefix => legacy.startsWith(prefix))).toBe(false)
        expect(prefixes.some(prefix => key.startsWith(prefix))).toBe(true)
        expect(prefixes.some(prefix => `${contract.prefix}${dimension}-previous-lock`.startsWith(prefix))).toBe(true)
        expect(prefixes.some(prefix => `${contract.prefix}different-platform-current-lock`.startsWith(prefix))).toBe(false)
      }
    })
  })
}
// END_BLOCK_ACTUAL_CARGO_CACHE_CONTRACTS

// START_BLOCK_CARGO_CACHE_MUTATION_CONTROLS
const fixture = contracts[0]
describe('controlled cache fixtures', () => {
  it('accepts the workspace layout with same-platform lock fallback', () => {
    assertCacheInputs(expectedInputs(fixture), fixture)
  })

  for (const [name, mutate] of [
    ['old member target', value => { value.path = value.path.replace('\ntarget\n', '\nsrc-tauri/target\n') }],
    ['missing Git dependencies', value => { value.path = value.path.replace('~/.cargo/git\n', '') }],
    ['legacy fallback', value => { value['restore-keys'] = `cargo-test-${fixture.dimension}-\n` }],
    ['cross-platform fallback', value => { value['restore-keys'] = 'cargo-workspace-v1-\n' }],
    ['dropped platform identity', value => { value.key = value.key.replace(fixture.dimension, 'shared') }],
    ['dropped toolchain identity', value => { value.key = value.key.replace("'rust-toolchain.toml', ", '') }],
    ['source-by-source invalidation', value => { value.key = value.key.replace("'**/Cargo.lock'", "'**/*.rs'") }]
  ]) {
    it(`rejects ${name}`, () => {
      const value = expectedInputs(fixture)
      mutate(value)
      expect(() => assertCacheInputs(value, fixture)).toThrow()
    })
  }
})
// END_BLOCK_CARGO_CACHE_MUTATION_CONTROLS

// START_BLOCK_PACKAGED_QA_CACHE_ISOLATION
const packaged = contracts[2]
describe('packaged QA cache isolation', () => {
  it('binds the packaged row to the isolated qa-v2 namespace against the legacy v1 contract', () => {
    expect(packaged).toMatchObject({ file: 'release-tauri.yml', job: 'build', prefix: 'cargo-workspace-qa-v2-', legacy: 'cargo-workspace-v1-' })
    expect(contracts[1]).toMatchObject({ file: 'release.yml', prefix: 'cargo-workspace-v1-' })
  })

  for (const [name, mutate] of [
    ['restored legacy v1 key', value => { value.key = `${packaged.legacy}${packaged.dimension}-${hash}` }],
    ['restored legacy v1 fallback', value => { value['restore-keys'] = `${packaged.legacy}${packaged.dimension}-\n` }],
    ['old generic fallback', value => { value['restore-keys'] = 'cargo-\n' }],
    ['cross-platform qa fallback', value => { value['restore-keys'] = 'cargo-workspace-qa-v2-\n' }],
    ['missing lock hash', value => { value.key = value.key.replace(`-${hash}`, '') }]
  ]) {
    it(`rejects ${name}`, () => {
      const value = expectedInputs(packaged)
      mutate(value)
      expect(() => assertCacheInputs(value, packaged)).toThrow()
    })
  }
})
// END_BLOCK_PACKAGED_QA_CACHE_ISOLATION
