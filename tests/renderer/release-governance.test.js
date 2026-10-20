// FILE: tests/renderer/release-governance.test.js
// VERSION: 1.3.0
// START_MODULE_CONTRACT
//   PURPOSE: Pin the ordinary release/governance check, Conventional SemVer admission, PR-only preparation boundary, immutable action references, and staged control configuration.
//   SCOPE: Pure negative fixtures plus checked-in repository integration; no GitHub API or setting mutation.
//   DEPENDS: Vitest; tools/release-governance.mjs; release-please and governance configuration/workflows.
//   LINKS: .grace/verification/features.xml V-M-046.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   config - Checked-in Release Please configuration.
//   prepWorkflow - Checked-in preparation workflow source.
//   governanceWorkflow - Stable governance workflow whose history-sensitive regression requires a complete checkout.
//   governanceConfig - Checked-in GitHub control contract.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
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
  validateGovernanceConfig,
  validatePreparationOverlap,
  validatePinnedActions,
  validateReleasePreparationBoundary
} from '../../tools/release-governance.mjs'

const config = JSON.parse(readFileSync(resolve('release-please-config.json'), 'utf8'))
const prepWorkflow = readFileSync(
  resolve('.github/workflows/release-please.yml'),
  'utf8'
)
const governanceWorkflow = readFileSync(
  resolve('.github/workflows/release-governance.yml'),
  'utf8'
)
const governanceConfig = JSON.parse(
  readFileSync(resolve('.github/release-governance.json'), 'utf8')
)

// START_BLOCK_RELEASE_GOVERNANCE_TESTS
describe('release governance', () => {
  it('runs on the collecting train without requiring freeze evidence', () => {
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

  it('blocks overlapping release-bearing merges after preparation starts', () => {
    const feature = validateConventionalTitle('feat: later feature', ['release:user-facing'])
    expect(() => validatePreparationOverlap(feature, 'Preparing')).toThrow(
      expect.objectContaining({ code: 'MT_RELEASE_PREPARATION_OVERLAP' })
    )
    expect(validatePreparationOverlap(feature, 'Collecting')).toBe(true)
    expect(validatePreparationOverlap(validateConventionalTitle('docs: clarify release'), 'Ready')).toBe(true)
  })

  it('proves Release Please can prepare but cannot tag or publish', () => {
    expect(validateReleasePreparationBoundary(config, prepWorkflow)).toBe(true)
    expect(prepWorkflow).toContain('release-please release-pr')
    expect(prepWorkflow).not.toContain('release-please github-release')
  })

  it('rejects an accidental publication command in preparation', () => {
    expect(() =>
      validateReleasePreparationBoundary(config, `${prepWorkflow}\ngh release create v9.9.9`)
    ).toThrow(
      expect.objectContaining({ code: 'MT_RELEASE_PREPARATION_BOUNDARY_INVALID' })
    )
  })

  it('requires every action reference in the privileged preparation workflow to be a full SHA', () => {
    expect(validatePinnedActions({ prepWorkflow })).toBeGreaterThan(5)
    expect(() =>
      validatePinnedActions({ unsafe: 'steps:\n  - uses: actions/checkout@v4\n' })
    ).toThrow(expect.objectContaining({ code: 'MT_RELEASE_ACTION_UNPINNED' }))
  })

  it('fetches full history before running the history-sensitive normalization regression', () => {
    const governanceJob = governanceWorkflow.split(/^  readiness:/m)[0]
    expect(governanceJob).toContain('fetch-depth: 0')
    expect(governanceJob).toContain('tests/renderer/release-normalize.test.js')
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
    partiallyBoundProject.project.number = 7
    expect(() => validateGovernanceConfig(partiallyBoundProject)).toThrow(
      expect.objectContaining({ code: 'MT_RELEASE_GOVERNANCE_CONFIG_INVALID' })
    )
  })
})
// END_BLOCK_RELEASE_GOVERNANCE_TESTS
