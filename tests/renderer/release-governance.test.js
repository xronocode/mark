// FILE: tests/renderer/release-governance.test.js
// VERSION: 2.2.0
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
//   governanceWorkflow - the release-governance workflow source read as text.
//   docsSecurityJob - the slice before the governance job (env block + docs-security job).
//   installStep - the install pinned Gitleaks step slice.
//   assertGitleaksChecksumContract - comment-blind red-control validator for the checksum contract.
//   releaseWorkflow - Checked-in tag-only release workflow source.
//   governanceWorkflow - Stable governance workflow whose history-sensitive regression requires a complete checkout.
//   testWorkflow - Cross-platform unit workflow whose renderer matrix runs the same history-sensitive regression.
//   governanceConfig - Checked-in GitHub control contract.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   - 2026-11-21 C-SEC-GITLEAKS-CHECKSUM: pin the docs-security Gitleaks install as download, strict sha256 digest verification, then extraction, with red controls rejecting a missing digest constant, a non-strict check and extraction before verification.
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
// docs-security job slice in the file's existing split style; the slice
// includes the workflow-level env block that carries the digest constant.
const docsSecurityJob = governanceWorkflow.split(/^  governance:/m)[0]
const installStep = docsSecurityJob
  .split(/- name: install pinned Gitleaks/)[1]
  .split(/- name:/)[0]

// Red-control validator for the Gitleaks checksum contract. Shape pins alone
// cannot distinguish a well-formed but different 64-hex digest from the true
// one — digest truth is anchored by the reviewed diff of the change plus the
// recorded out-of-band derivation, never by a test-time fetch. These controls
// mutate only the in-memory source string: no network, no tracked-file edits.
function assertGitleaksChecksumContract(source) {
  if (!/^  GITLEAKS_SHA256: '?[0-9a-f]{64}'?\r?$/m.test(source))
    throw new Error('docs-security: committed GITLEAKS_SHA256 digest constant missing')
  const runtimeLines = source.split('\n').filter((line) => !/^\s*#/.test(line))
  if (!runtimeLines.some((line) => line.includes('sha256sum --check --strict')))
    throw new Error('docs-security: digest check is not strict')
  const checkLine = runtimeLines.find((line) => line.includes('sha256sum --check --strict'))
  const extractLine = runtimeLines.find((line) => line.includes('tar -xzf'))
  const check = checkLine ? source.indexOf(checkLine) : -1
  const extract = extractLine ? source.indexOf(extractLine) : -1
  if (check === -1 || extract === -1 || extract < check)
    throw new Error('docs-security: extraction precedes digest verification')
}

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

  it('installs Gitleaks only after a strict digest verification of the pinned archive', () => {
    // The committed digest constant and the v8.30.1 URL pin are one reviewed
    // unit: both must be present in the docs-security job source. The digest
    // pin is shape-only (lowercase 64-hex, quotes optional) — a well-formed
    // but different 64-hex value passes by design; digest truth is the
    // reviewed diff plus the recorded out-of-band derivation, never a
    // hardcoded expected hex or a runtime fetch of trust material.
    expect(docsSecurityJob).toMatch(/^  GITLEAKS_SHA256: '?[0-9a-f]{64}'?$/m)
    expect(docsSecurityJob).toContain(
      'The URL pin and this digest are one reviewed unit: bump together with the'
    )
    expect(docsSecurityJob).toContain(
      'https://github.com/gitleaks/gitleaks/releases/download/v8.30.1/gitleaks_8.30.1_linux_x64.tar.gz'
    )
    expect(installStep).toContain('-o "$archive"')
    expect(installStep).toContain('sha256sum --check --strict -')
    // Ordering by index: download, strict check, extraction, smoke probe.
    expect(installStep.indexOf('-o "$archive"')).toBeLessThan(
      installStep.indexOf('sha256sum --check --strict')
    )
    expect(installStep.indexOf('sha256sum --check --strict')).toBeLessThan(
      installStep.indexOf('tar -xzf')
    )
    expect(installStep.indexOf('tar -xzf')).toBeLessThan(
      installStep.indexOf('gitleaks version')
    )
    // The curl-piped-into-tar form must be gone from the whole job: a pipe
    // into tar would swallow the check's exit status and bypass verification.
    expect(docsSecurityJob).not.toMatch(/\|\s*tar/)
  })

  it('fails closed when the Gitleaks checksum contract is mutated in memory', () => {
    // Missing digest constant: deleting the env line must be rejected.
    // CRLF-safe: the env line's terminator is \r?\n on Windows checkouts.
    const withoutDigest = docsSecurityJob.replace(/^  GITLEAKS_SHA256:.*\r?\n/m, '')
    expect(() => assertGitleaksChecksumContract(withoutDigest)).toThrow(
      /digest constant missing/
    )
    // Non-strict check: dropping --strict (any lenient or status-swallowing
    // form) must be rejected.
    // Replace the RUNTIME check line only — the header CHANGE_SUMMARY
    // comment also mentions --strict and must not satisfy the mutation.
    const withoutStrict = docsSecurityJob
      .split('\n')
      .map((line) => /^\s*#/.test(line) ? line : line.replace('sha256sum --check --strict', 'sha256sum --check'))
      .join('\n')
    expect(() => assertGitleaksChecksumContract(withoutStrict)).toThrow(
      /not strict/
    )
    // Extraction before verification: moving the tar -xzf line above the
    // sha256sum line must be rejected.
    // Target the RUNTIME lines only — the header CHANGE_SUMMARY comment
    // also names the strict check and would poison the index search.
    const lines = docsSecurityJob.split('\n')
    const extractIndex = lines.findIndex(
      (line) => line.includes('tar -xzf') && !line.trimStart().startsWith('#')
    )
    const checkIndex = lines.findIndex(
      (line) => line.includes('sha256sum --check --strict') && !line.trimStart().startsWith('#')
    )
    expect(extractIndex).toBeGreaterThan(-1)
    expect(checkIndex).toBeGreaterThan(-1)
    // The pristine workflow must have check BEFORE extract; the reorder
    // below moves extract above check and must then be rejected.
    expect(checkIndex).toBeLessThan(extractIndex)
    lines.splice(extractIndex, 1)
    const movedCheck = lines.findIndex(
      (line) => line.includes('sha256sum --check --strict') && !line.trimStart().startsWith('#')
    )
    lines.splice(movedCheck, 0, '          tar -xzf "$archive" -C /usr/local/bin gitleaks')
    expect(() => assertGitleaksChecksumContract(lines.join('\n'))).toThrow(
      /extraction precedes digest verification/
    )
  })
})
// END_BLOCK_RELEASE_GOVERNANCE_TESTS
