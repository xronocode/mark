// FILE: tests/renderer/release-governance.test.js
// VERSION: 2.1.0
// START_MODULE_CONTRACT
//   PURPOSE: Pin the ordinary release/governance check, Conventional SemVer admission, the payload-open merge window, immutable action references, and staged control configuration.
//   SCOPE: Pure negative fixtures plus checked-in repository integration; no GitHub API or setting mutation.
//   DEPENDS: Vitest; tools/release-governance.mjs; governance configuration and release workflows.
//   LINKS: .grace/verification/features.xml V-M-046.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   releaseWorkflow - Checked-in tag-only release workflow source.
//   governanceWorkflow - Stable governance workflow whose history-sensitive regression requires a complete checkout.
//   testWorkflow - Cross-platform unit workflow whose renderer matrix runs the same history-sensitive regression.
//   governanceConfig - Checked-in GitHub control contract.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   - 2026-10-27 v2.1.0: delivery IDs are permanent — a PR title naming an ID the base revision already records is rejected.
//   - 2026-10-24 v2.0.0: C-RELEASE-CONVEYOR — Release Please removed; release-bearing merges stay closed only while Preparing/Frozen and open again once the seal is Ready.
//   - 2026-10-21 v1.5.0: keep the partial-Project-identity negative fixture valid after the real Project identity is recorded.
//   - 2026-10-20 v1.4.0: require complete history in both governance and cross-platform renderer-unit jobs.
//   - 2026-10-20 v1.3.0: pin a full governance-job checkout before the normalization test inspects the bootstrap boundary.
//   - 2026-10-20 v1.2.0: cover perf/revert patch admission and fail closed on unmarked BREAKING CHANGE body trailers.
//   - 2026-10-20 v1.1.0: pin the public unbound Project mirror contract in ordinary governance.
//   - 2026-10-20 v1.0.0: add ordinary governance and Conventional SemVer boundary regressions.
// END_CHANGE_SUMMARY

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  runReleaseGovernance,
  validateConventionalTitle,
  validateDeliveryIdReuse,
  validateGovernanceConfig,
  validatePreparationOverlap,
  validatePinnedActions
} from '../../tools/release-governance.mjs'

const releaseWorkflow = readFileSync(resolve('.github/workflows/release.yml'), 'utf8')
const governanceWorkflow = readFileSync(
  resolve('.github/workflows/release-governance.yml'),
  'utf8'
)
const testWorkflow = readFileSync(resolve('.github/workflows/test.yml'), 'utf8')
const governanceConfig = JSON.parse(
  readFileSync(resolve('.github/release-governance.json'), 'utf8')
)

// START_BLOCK_RELEASE_GOVERNANCE_TESTS
describe('release governance', () => {
  it('runs on the current train without requiring freeze evidence', () => {
    expect(runReleaseGovernance(process.cwd())).toMatchObject({
      title: null,
      environments: 4,
      rulesets: 2,
      projectFields: 7
    })
  })

  it('maps standard Conventional Commit titles to SemVer intent', () => {
    expect(validateConventionalTitle('fix(editor): keep the tab active', ['release:user-facing'])).toMatchObject({
      type: 'fix',
      bump: 'patch',
      breaking: false
    })
    expect(validateConventionalTitle('feat(workspace): open multiple roots', ['release:user-facing'])).toMatchObject({
      type: 'feat',
      bump: 'minor'
    })
    expect(validateConventionalTitle('feat(api)!: replace the command contract', ['release:user-facing'])).toMatchObject({
      bump: 'major',
      breaking: true
    })
    expect(validateConventionalTitle('chore(release): v2.6.0')).toMatchObject({
      type: 'chore',
      bump: 'none'
    })
    expect(validateConventionalTitle('perf(editor): reduce open latency', ['release:user-facing'])).toMatchObject({
      type: 'perf',
      bump: 'patch'
    })
    expect(validateConventionalTitle('revert: restore prior renderer', ['release:operational'])).toMatchObject({
      type: 'revert',
      bump: 'patch'
    })
  })

  it('rejects unclassified and unadmitted release commits independently', () => {
    expect(() => validateConventionalTitle('update things')).toThrow(
      expect.objectContaining({ code: 'MT_RELEASE_CONVENTIONAL_TITLE_INVALID' })
    )
    expect(() => validateConventionalTitle('feat: hidden feature')).toThrow(
      expect.objectContaining({ code: 'MT_RELEASE_CONVENTIONAL_ADMISSION_MISSING' })
    )
    expect(() => validateConventionalTitle('fix: internal tool')).toThrow(
      expect.objectContaining({ code: 'MT_RELEASE_CONVENTIONAL_ADMISSION_MISSING' })
    )
    expect(() => validateConventionalTitle('perf: hidden speedup')).toThrow(
      expect.objectContaining({ code: 'MT_RELEASE_CONVENTIONAL_ADMISSION_MISSING' })
    )
    expect(() => validateConventionalTitle(
      'feat(api): replace contract',
      ['release:user-facing'],
      'BREAKING CHANGE: consumers must migrate'
    )).toThrow(expect.objectContaining({ code: 'MT_RELEASE_BREAKING_MARKER_INVALID' }))
  })

  it('blocks release-bearing merges only while the payload is being pinned', () => {
    const feature = validateConventionalTitle('feat: later feature', ['release:user-facing'])
    for (const state of ['Preparing', 'Frozen']) {
      expect(() => validatePreparationOverlap(feature, state)).toThrow(
        expect.objectContaining({ code: 'MT_RELEASE_PREPARATION_OVERLAP' })
      )
    }
    // A Ready seal is on main and the tag binds to it: later merges
    // cannot enter the candidate, so work keeps flowing while the owner
    // decides.
    for (const state of ['Collecting', 'Ready', 'Released']) {
      expect(validatePreparationOverlap(feature, state)).toBe(true)
    }
    expect(validatePreparationOverlap(validateConventionalTitle('docs: clarify release'), 'Frozen')).toBe(true)
  })

  it('requires every action reference in the privileged release workflow to be a full SHA', () => {
    expect(validatePinnedActions({ releaseWorkflow })).toBeGreaterThan(5)
    expect(() =>
      validatePinnedActions({ unsafe: 'steps:\n  - uses: actions/checkout@v4\n' })
    ).toThrow(expect.objectContaining({ code: 'MT_RELEASE_ACTION_UNPINNED' }))
  })

  it('rejects a pull request that reuses a delivery ID the base revision already records', () => {
    expect(() =>
      validateDeliveryIdReuse(process.cwd(), 'fix(editor): cut/copy after a stale selection (FIX-019)')
    ).toThrow(expect.objectContaining({ code: 'MT_RELEASE_DELIVERY_ID_REUSED' }))
  })

  it('accepts a new delivery ID and a title that names none', () => {
    expect(
      validateDeliveryIdReuse(process.cwd(), 'fix(editor): cut/copy after a stale selection (FIX-099)')
    ).toBe(true)
    expect(validateDeliveryIdReuse(process.cwd(), 'docs(repo): tighten the release protocol')).toBe(
      true
    )
  })

  it('fetches full history everywhere the history-sensitive normalization regression runs', () => {
    const governanceJob = governanceWorkflow.split(/^  readiness:/m)[0]
    const rendererUnitJob = testWorkflow
      .split(/^  renderer-unit:/m)[1]
      .split(/^  backend-unit:/m)[0]
    expect(governanceJob).toContain('fetch-depth: 0')
    expect(governanceJob).toContain('tests/renderer/release-normalize.test.js')
    expect(rendererUnitJob).toContain('fetch-depth: 0')
    expect(rendererUnitJob).toContain('npm run test:coverage')
  })

  it('keeps control resources disabled until an explicit owner activation', () => {
    expect(validateGovernanceConfig(governanceConfig)).toEqual({
      environments: 4,
      rulesets: 2,
      projectFields: 7
    })
    const unsafe = structuredClone(governanceConfig)
    unsafe.rulesets.main.enforcement = 'active'
    expect(() => validateGovernanceConfig(unsafe)).toThrow(
      expect.objectContaining({ code: 'MT_RELEASE_GOVERNANCE_CONFIG_INVALID' })
    )
    const privateProject = structuredClone(governanceConfig)
    privateProject.project.public = false
    expect(() => validateGovernanceConfig(privateProject)).toThrow(
      expect.objectContaining({ code: 'MT_RELEASE_GOVERNANCE_CONFIG_INVALID' })
    )
    const partiallyBoundProject = structuredClone(governanceConfig)
    partiallyBoundProject.project.nodeId = null
    expect(() => validateGovernanceConfig(partiallyBoundProject)).toThrow(
      expect.objectContaining({ code: 'MT_RELEASE_GOVERNANCE_CONFIG_INVALID' })
    )
  })
})
// END_BLOCK_RELEASE_GOVERNANCE_TESTS
