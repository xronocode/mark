// FILE: tests/renderer/release-governance.test.js
// VERSION: 2.3.0
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
//   authorizeTagJob - authorize-tag job slice of the checked-in release workflow.
//   prereleaseCollectionStep - prerelease check-runs collection step slice (seal-keyed).
//   prereleaseGateStep - prerelease required-checks gate step slice (pinned list, fail-closed).
//   assertPrereleaseChecksGate - comment-blind validator mirroring the gate's fail-closed evaluation.
//   resolveLatestAttempts - JS mirror of the stable sort-group-keep-last collection shape.
//   assertPrereleaseGateWiring - red-control validator for the gate's prerelease-only wiring.
//   prereleaseSeal - green fixture SHA (40 hex chars) for the seal-keyed matrix.
//   staleSha - stale-SHA fixture for the not-at-seal refusal.
//   prereleaseRequiredIdentities - the pinned two-entry required-checks identity list.
//   checkRunAttempt - raw check-run attempt fixture (name/conclusion/sha/started_at) for the collection mirror.
//   checksFileEntry - checks-file entry fixture (name/conclusion/sha) for the validator matrix.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   - 2026-11-21 v2.3.0 C-RELEASE-BETA-CHECKS-GATE: pin the prerelease checks boundary — seal-keyed collection reusing the stable jq shape, the pinned main required-checks list with its derivation comment, prerelease-only step conditions, no payload reference and no new job, plus the fail-closed fixture matrix (failure, cancelled, missing, stale SHA, ambiguous, green-at-seal, superseded rerun) and in-memory red controls rejecting a missing pinned list, a missing gate and a non-prerelease-only gate.
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

// authorize-tag job and prerelease step slices in the file's existing split
// style; the job slice ends at the next top-level job key.
const authorizeTagJob = releaseWorkflow.split(/^  manual-build:/m)[0]
const prereleaseCollectionStep = authorizeTagJob
  .split(/- name: collect prerelease check runs at the seal/)[1]
  .split(/- name:/)[0]
const prereleaseGateStep = authorizeTagJob
  .split(/- name: gate prerelease required checks/)[1]
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

// Pure mirror of the prerelease gate's fail-closed evaluation: exactly one
// live match per required name+app identity, recorded at the exact seal SHA
// and concluded success. A missing context, an ambiguous identity, a stale
// SHA or any non-success conclusion (failure, cancelled, timed out) is
// rejected with the offending identity and reason.
function assertPrereleaseChecksGate(checks, required, seal) {
  for (const identity of required) {
    const matches = checks.filter(
      (check) => check.name === identity.name && check.app === identity.app
    )
    if (matches.length === 0)
      throw new Error(`${identity.name} (${identity.app}): missing required check at the seal`)
    if (matches.length > 1)
      throw new Error(`${identity.name} (${identity.app}): ambiguous identity, ${matches.length} live matches`)
    if (matches[0].sha !== seal)
      throw new Error(`${identity.name} (${identity.app}): stale, recorded at ${matches[0].sha} instead of the seal`)
    if (matches[0].conclusion !== 'success')
      throw new Error(`${identity.name} (${identity.app}): conclusion ${matches[0].conclusion} is not success`)
  }
}

// JS mirror of the stable collection shape: sort by started time, group per
// name+app keeping the latest attempt, then project to the checks-file
// fields. Driven by slurp-ed API pages so the superseded-rerun fixture
// exercises the same resolution the workflow performs.
function resolveLatestAttempts(pages) {
  const attempts = pages
    .flatMap((page) => page.check_runs)
    .sort((a, b) => (a.started_at < b.started_at ? -1 : a.started_at > b.started_at ? 1 : 0))
  const latestByKey = new Map()
  for (const attempt of attempts) latestByKey.set(`${attempt.name}|${attempt.app.name}`, attempt)
  return [...latestByKey.values()].map((attempt) => ({
    name: attempt.name,
    app: attempt.app.name,
    sha: attempt.head_sha,
    conclusion: attempt.conclusion
  }))
}

// Red-control validator for the gate's wiring. As with the gitleaks
// digest-pin stance, shape pins cannot distinguish the pinned list from
// some other well-formed two-entry set — set truth is anchored by the
// reviewed diff plus the recorded rulesets.main.requiredChecks derivation,
// never by a runtime fetch. These controls mutate only the in-memory
// workflow source string: no network, no tracked-file edits.
function assertPrereleaseGateWiring(source) {
  const job = source.split(/^  manual-build:/m)[0]
  const gateSplit = job.split(/- name: gate prerelease required checks/)
  if (gateSplit.length < 2)
    throw new Error('prerelease checks gate step is missing from authorize-tag')
  const gateStep = gateSplit[1].split(/- name:/)[0]
  // The pinned list must be DECLARED as the gate step's env — a bare
  // process.env reference in the run code is not a declaration and must
  // not satisfy the wiring check.
  if (!/^\s*PRERELEASE_REQUIRED_CHECKS:\s*'/m.test(gateStep))
    throw new Error('prerelease checks gate: pinned required-checks list missing')
  if (!gateStep.includes("if: steps.identity.outputs.prerelease == 'true'"))
    throw new Error('prerelease checks gate is not gated to prereleases only')
}

// Deterministic check-run fixtures for the fail-closed matrix: raw API
// attempt shape feeding the collection mirror, and checks-file entries
// feeding the validator directly.
const prereleaseSeal = 'a'.repeat(40)
const staleSha = 'd'.repeat(40)
const prereleaseRequiredIdentities = [
  { name: 'status check', app: 'GitHub Actions' },
  { name: 'release/governance', app: 'GitHub Actions' }
]
const checkRunAttempt = (name, conclusion, sha, startedAt) => ({
  name,
  app: { name: 'GitHub Actions' },
  head_sha: sha,
  conclusion,
  started_at: startedAt
})
const checksFileEntry = (name, conclusion, sha) => ({ name, app: 'GitHub Actions', sha, conclusion })

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

  it('wires the prerelease checks collection and gate inside authorize-tag only', () => {
    // C-RELEASE-BETA-CHECKS-GATE positive pins: both new steps are
    // prerelease-only, the collection is seal-keyed with the stable jq
    // shape and no payload reference, the gate pins exactly the two main
    // required contexts with their derivation comment, and the stable lane
    // plus the job structure stay untouched.
    expect(prereleaseCollectionStep).toContain("if: steps.identity.outputs.prerelease == 'true'")
    expect(prereleaseGateStep).toContain("if: steps.identity.outputs.prerelease == 'true'")
    expect(prereleaseCollectionStep).toContain('gh api --paginate --slurp')
    expect(prereleaseCollectionStep).toContain('commits/$SEAL/check-runs')
    expect(prereleaseCollectionStep).toContain(
      'sort_by(.started_at) | group_by(.name + "|" + .app.name) | map(last | {name, app:.app.name, sha:.head_sha, conclusion})'
    )
    expect(prereleaseCollectionStep).toContain('> /tmp/release-checks.json')
    expect(prereleaseCollectionStep).not.toContain('$PAYLOAD')
    expect(prereleaseGateStep).not.toContain('$PAYLOAD')
    // Lightweight boundary: neither prerelease step uses an action, uploads
    // an artifact or invokes a release tool; the gate evaluates through the
    // job's existing Node setup only.
    expect(prereleaseCollectionStep).not.toContain('uses:')
    expect(prereleaseGateStep).not.toContain('uses:')
    expect(prereleaseGateStep).not.toContain('upload-artifact')
    expect(prereleaseGateStep).not.toContain('npm run release:')
    expect(prereleaseGateStep).toContain('/tmp/release-checks.json')
    expect(prereleaseGateStep).toContain('BLOCK_PRERELEASE_CHECKS_NOT_GREEN')
    // The pinned list carries exactly the two main required contexts (both
    // GitHub Actions) and no third entry.
    const pinnedListMatch = prereleaseGateStep.match(/PRERELEASE_REQUIRED_CHECKS: '(.*)'/)
    expect(pinnedListMatch).not.toBeNull()
    expect(JSON.parse(pinnedListMatch[1])).toEqual([
      { name: 'status check', app: 'GitHub Actions' },
      { name: 'release/governance', app: 'GitHub Actions' }
    ])
    // Derivation source and the release/readiness exclusion rationale are
    // recorded in the comment attached between the collection step and the
    // gate step; the excluded context is never quoted into the pinned set.
    expect(authorizeTagJob).toContain(
      '.github/release-governance.json rulesets.main.requiredChecks'
    )
    expect(authorizeTagJob).toContain('cannot pre-exist on the beta commit')
    expect(releaseWorkflow).not.toContain('"release/readiness"')
    const marker = (fragment) => authorizeTagJob.indexOf(fragment)
    expect(marker('install locked dependencies without lifecycle scripts')).toBeGreaterThan(-1)
    expect(marker('install locked dependencies without lifecycle scripts')).toBeLessThan(
      marker('collect prerelease check runs at the seal')
    )
    expect(marker('collect prerelease check runs at the seal')).toBeLessThan(
      marker('gate prerelease required checks')
    )
    expect(marker('cannot pre-exist on the beta commit')).toBeGreaterThan(
      marker('collect prerelease check runs at the seal')
    )
    expect(marker('cannot pre-exist on the beta commit')).toBeLessThan(
      marker('gate prerelease required checks')
    )
    expect(marker('gate prerelease required checks')).toBeLessThan(
      marker('read exact payload check runs')
    )
    // Stable lane byte-identical: the four stable skip conditions, the
    // strict-admission run line and the release-identity artifact remain.
    expect(authorizeTagJob.match(/steps\.identity\.outputs\.prerelease != 'true'/g)).toHaveLength(4)
    expect(authorizeTagJob).toContain(
      'run: npm run release:readiness -- --mode strict --tag "$TAG" --payload "$PAYLOAD" --seal "$SEAL" --head "$HEAD_SHA" --checks-file /tmp/release-checks.json'
    )
    expect(authorizeTagJob).toContain('name: release-identity')
    // No new job: exactly the six pre-existing top-level job keys (the
    // extraction starts at the jobs: block so on:-block triggers like
    // push: can never leak into the job list; \r is stripped before the
    // match so CRLF checkouts compare clean).
    expect(releaseWorkflow.split(/^jobs:/m)[1].replace(/\r/g, '').match(/^  [a-z][a-z0-9-]*:$/gm)).toEqual([
      '  authorize-tag:',
      '  manual-build:',
      '  build:',
      '  prepare-publication:',
      '  publish:',
      '  publish-cask:'
    ])
    expect(() => assertPrereleaseGateWiring(releaseWorkflow)).not.toThrow()
  })

  it('fails closed on red, cancelled, missing, stale and ambiguous prerelease checks at the seal', () => {
    // Deterministic fixtures only: no network and no tracked-file edits;
    // the validator mirrors the gate step's evaluation.
    const bothGreen = [
      checksFileEntry('status check', 'success', prereleaseSeal),
      checksFileEntry('release/governance', 'success', prereleaseSeal)
    ]
    expect(() =>
      assertPrereleaseChecksGate(bothGreen, prereleaseRequiredIdentities, prereleaseSeal)
    ).not.toThrow()
    const failedStatus = [
      checksFileEntry('status check', 'failure', prereleaseSeal),
      checksFileEntry('release/governance', 'success', prereleaseSeal)
    ]
    expect(() =>
      assertPrereleaseChecksGate(failedStatus, prereleaseRequiredIdentities, prereleaseSeal)
    ).toThrow(/status check .* conclusion failure is not success/)
    const cancelledStatus = [
      checksFileEntry('status check', 'cancelled', prereleaseSeal),
      checksFileEntry('release/governance', 'success', prereleaseSeal)
    ]
    expect(() =>
      assertPrereleaseChecksGate(cancelledStatus, prereleaseRequiredIdentities, prereleaseSeal)
    ).toThrow(/status check .* conclusion cancelled is not success/)
    const missingStatus = [checksFileEntry('release/governance', 'success', prereleaseSeal)]
    expect(() =>
      assertPrereleaseChecksGate(missingStatus, prereleaseRequiredIdentities, prereleaseSeal)
    ).toThrow(/status check .* missing required check/)
    const staleSeal = bothGreen.map((check) => ({ ...check, sha: staleSha }))
    expect(() =>
      assertPrereleaseChecksGate(staleSeal, prereleaseRequiredIdentities, prereleaseSeal)
    ).toThrow(/recorded at d{40} instead of the seal/)
    const ambiguousStatus = [
      checksFileEntry('status check', 'success', prereleaseSeal),
      checksFileEntry('status check', 'success', prereleaseSeal),
      checksFileEntry('release/governance', 'success', prereleaseSeal)
    ]
    expect(() =>
      assertPrereleaseChecksGate(ambiguousStatus, prereleaseRequiredIdentities, prereleaseSeal)
    ).toThrow(/status check .* ambiguous identity, 2 live matches/)
  })

  it('resolves a superseded rerun attempt to the latest through the stable collection shape', () => {
    // The sort-by-started-time, group-by-name-and-app, keep-last shape is
    // what makes a flaky red re-run harmless: an older red attempt is
    // superseded by a later success at the same seal, and the inverse (an
    // older green superseded by a later red) still fails closed.
    const supersededRerun = [
      {
        check_runs: [
          checkRunAttempt('status check', 'failure', prereleaseSeal, '2026-11-21T09:00:00Z'),
          checkRunAttempt('release/governance', 'success', prereleaseSeal, '2026-11-21T09:00:30Z')
        ]
      },
      {
        check_runs: [
          checkRunAttempt('status check', 'success', prereleaseSeal, '2026-11-21T09:05:00Z')
        ]
      }
    ]
    const resolved = resolveLatestAttempts(supersededRerun)
    expect(resolved.find((check) => check.name === 'status check')).toEqual({
      name: 'status check',
      app: 'GitHub Actions',
      sha: prereleaseSeal,
      conclusion: 'success'
    })
    expect(() =>
      assertPrereleaseChecksGate(resolved, prereleaseRequiredIdentities, prereleaseSeal)
    ).not.toThrow()
    const inverseRerun = [
      {
        check_runs: [
          checkRunAttempt('status check', 'success', prereleaseSeal, '2026-11-21T09:00:00Z'),
          checkRunAttempt('release/governance', 'success', prereleaseSeal, '2026-11-21T09:00:30Z')
        ]
      },
      {
        check_runs: [
          checkRunAttempt('status check', 'failure', prereleaseSeal, '2026-11-21T09:05:00Z')
        ]
      }
    ]
    expect(() =>
      assertPrereleaseChecksGate(
        resolveLatestAttempts(inverseRerun),
        prereleaseRequiredIdentities,
        prereleaseSeal
      )
    ).toThrow(/conclusion failure is not success/)
  })

  it('rejects in-memory workflow mutations that remove the pinned list, the gate or its prerelease-only condition', () => {
    // Red controls mutate only the checked-in workflow source string in
    // memory: no tracked-file edits, no network.
    expect(() => assertPrereleaseGateWiring(releaseWorkflow)).not.toThrow()

    // Removing the PRERELEASE_REQUIRED_CHECKS env from the gate step is
    // rejected as a missing pinned list.
    const withoutPinnedList = releaseWorkflow.replace(
      /^ {10}PRERELEASE_REQUIRED_CHECKS:.*\r?\n/m,
      ''
    )
    expect(() => assertPrereleaseGateWiring(withoutPinnedList)).toThrow(
      /pinned required-checks list missing/
    )

    // Removing the gate step is rejected as a missing gate.
    const withoutGate = releaseWorkflow.replace(
      /- name: gate prerelease required checks[\s\S]*?(?=- name: read exact payload check runs)/,
      ''
    )
    expect(() => assertPrereleaseGateWiring(withoutGate)).toThrow(/gate step is missing/)

    // Stripping the gate's condition, or flipping it to != 'true', is
    // rejected as a gate that is not prerelease-only.
    const [beforeGate, gateAndRest] = releaseWorkflow.split(/- name: gate prerelease required checks/)
    const strippedGate =
      beforeGate +
      '- name: gate prerelease required checks' +
      gateAndRest.replace(/^ {8}if: steps\.identity\.outputs\.prerelease == 'true'\r?\n/m, '')
    expect(() => assertPrereleaseGateWiring(strippedGate)).toThrow(
      /not gated to prereleases only/
    )
    const flippedGate =
      beforeGate +
      '- name: gate prerelease required checks' +
      gateAndRest.replace(
        "if: steps.identity.outputs.prerelease == 'true'",
        "if: steps.identity.outputs.prerelease != 'true'"
      )
    expect(() => assertPrereleaseGateWiring(flippedGate)).toThrow(
      /not gated to prereleases only/
    )
  })
})
// END_BLOCK_RELEASE_GOVERNANCE_TESTS
