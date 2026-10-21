// FILE: tests/renderer/release-readiness.test.js
// VERSION: 1.3.1
// START_MODULE_CONTRACT
//   PURPOSE: Prove release-train lifecycle, membership, owner-acceptance, exclusion, commit-accounting, and identity failures remain independently detectable.
//   SCOPE: Deterministic unit fixtures for the repository-only release-readiness validator; no GitHub API or publication behavior.
//   DEPENDS: Vitest; tools/release-readiness.mjs; docs/release-trains/2.6.x-next.json.
//   LINKS: .grace/verification/features.xml V-M-046.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   SHA_A - Deterministic previous-release commit fixture.
//   SHA_B - Deterministic bootstrap/seal commit fixture.
//   SHA_C - Deterministic payload commit fixture.
//   fixture - Minimal valid train authority for mutation-focused cases.
//   STRICT_CHECKS - Immutable strict check policy fixture.
//   strictRepository - Build a previous-tag/bootstrap/payload/seal repository with an annotated tag.
//   rejectedWith - Assert one stable release-readiness failure code.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   - 2026-10-21 v1.3.1: derive the collecting-train item count from the checked-in manifest so routine admissions do not require a duplicate fixture edit.
//   - 2026-10-21 v1.3.0: validate the checked-in train in either collecting main or prepared release-PR lifecycle state.
//   - 2026-10-20 v1.2.0: cover trusted previous-release boundaries, many-to-many item accounting, and exact non-seal check policy.
//   - 2026-10-20 v1.1.0: add payload/seal/tag/check/fresh-screenshot strict identity regressions.
//   - 2026-10-20 v1.0.0: pin the C-RELEASE-PIPELINE-AUTOMATION train authority and independent negative conditions.
// END_CHANGE_SUMMARY

import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  readTrainManifest,
  validateStrictRepositoryState,
  validateTrainLedger,
  validateTrainManifest
} from '../../tools/release-readiness.mjs'

const SHA_A = 'a'.repeat(40)
const SHA_B = 'b'.repeat(40)
const SHA_C = 'c'.repeat(40)
const STRICT_CHECKS = [
  { name: 'status check', app: 'GitHub Actions' },
  { name: 'release/governance', app: 'GitHub Actions' },
  { name: 'release/readiness', app: 'GitHub Actions' }
]

const fixture = () => ({
  schemaVersion: '1.0.0',
  trainId: 'test-next',
  state: 'Frozen',
  previousRelease: {
    tag: 'v1.0.0',
    commit: SHA_A,
    bootstrapSha: SHA_A,
    tree: SHA_A
  },
  computedVersion: '1.1.0',
  payloadSha: SHA_C,
  sealSha: null,
  items: {
    userFacing: [
      {
        id: 'C-1',
        summary: 'Visible behavior',
        state: 'queued',
        commits: [SHA_C],
        acceptance: {
          owner: 'owner',
          date: '2026-10-20',
          testedArtifact: 'artifact sha256 deadbeef',
          scenarios: ['The accepted behavior works.']
        }
      }
    ],
    operational: [
      { id: 'OPS-1', summary: 'Operational metadata', commits: [SHA_B] }
    ],
    notPresent: [
      {
        id: 'FIX-9',
        summary: 'Deferred behavior',
        reason: 'Not implemented.',
        codePresent: false
      }
    ]
  },
  commitAccounting: {
    fromExclusive: SHA_A,
    throughInclusive: SHA_C,
    entries: [
      {
        sha: SHA_C,
        classification: 'user-facing',
        itemIds: ['C-1']
      },
      {
        sha: SHA_B,
        classification: 'operational',
        itemIds: ['OPS-1']
      }
    ]
  },
  requiredChecks: structuredClone(STRICT_CHECKS),
  materials: { status: 'ready' },
  transitions: [
    { state: 'Collecting', date: '2026-10-20' },
    { state: 'Preparing', date: '2026-10-20' },
    { state: 'Frozen', date: '2026-10-20' }
  ]
})

const rejectedWith = (manifest, code, options = {}) => {
  expect(() =>
    validateTrainManifest(manifest, { workspaceRoot: process.cwd(), ...options })
  ).toThrow(expect.objectContaining({ code }))
}

const strictRepository = ({ extraSealPath, tagPayload = false } = {}) => {
  const root = mkdtempSync(resolve(tmpdir(), 'mark-readiness-'))
  const git = (...args) =>
    execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim()
  const write = (path, value) => {
    mkdirSync(dirname(resolve(root, path)), { recursive: true })
    writeFileSync(resolve(root, path), value)
  }
  git('init', '-b', 'main')
  git('config', 'user.name', 'Release Readiness Test')
  git('config', 'user.email', 'release-readiness@example.invalid')
  write('baseline.txt', 'baseline\n')
  git('add', 'baseline.txt')
  git('commit', '-m', 'chore: baseline')
  const baseline = git('rev-parse', 'HEAD')
  const baselineTree = git('rev-parse', 'HEAD^{tree}')
  git('tag', '-a', 'v1.0.0', baseline, '-m', 'v1.0.0')
  git('commit', '--allow-empty', '-m', 'fix(release): bootstrap equivalent previous tree')
  const bootstrap = git('rev-parse', 'HEAD')
  write('product.txt', 'accepted product bytes\n')
  git('add', 'product.txt')
  git('commit', '-m', 'feat: accepted behavior')
  const product = git('rev-parse', 'HEAD')

  write(
    '.github/release-governance.json',
    `${JSON.stringify({ strictRequiredChecks: STRICT_CHECKS }, null, 2)}\n`
  )
  write(
    'release-please-config.json',
    `${JSON.stringify({ 'bootstrap-sha': bootstrap, 'last-release-sha': bootstrap }, null, 2)}\n`
  )
  write('operations.txt', 'release controls\n')
  git('add', '.github/release-governance.json', 'release-please-config.json', 'operations.txt')
  git('commit', '-m', 'chore(release): add deterministic controls')
  const payload = git('rev-parse', 'HEAD')

  const manifest = fixture()
  manifest.state = 'Ready'
  manifest.previousRelease = {
    tag: 'v1.0.0',
    commit: baseline,
    bootstrapSha: bootstrap,
    tree: baselineTree
  }
  manifest.payloadSha = payload
  manifest.items.userFacing[0].commits = [product]
  manifest.items.operational[0].commits = [payload]
  manifest.sealSha = null
  manifest.commitAccounting = {
    fromExclusive: bootstrap,
    throughInclusive: payload,
    entries: [
      { sha: product, classification: 'user-facing', itemIds: ['C-1'] },
      { sha: payload, classification: 'operational', itemIds: ['OPS-1'] }
    ]
  }
  manifest.materials = {
    status: 'ready',
    screenshotManifest: 'docs/assets/readme/1.1.0.manifest.json'
  }
  manifest.requiredChecks = structuredClone(STRICT_CHECKS)
  manifest.transitions.push({ state: 'Ready', date: '2026-10-20' })
  write(
    'docs/release-trains/2.6.x-next.json',
    `${JSON.stringify(manifest, null, 2)}\n`
  )
  write('docs/release-trains/2.6.x-next.md', '| State | Ready |\n')
  write(
    'docs/assets/readme/1.1.0.manifest.json',
    `${JSON.stringify({
      releaseVersion: '1.1.0',
      payloadSha: payload,
      captureState: 'fresh-reviewed'
    })}\n`
  )
  if (extraSealPath) write(extraSealPath, 'unexpected product delta\n')
  git('add', '.')
  git('commit', '-m', 'chore(release): seal v1.1.0')
  const seal = git('rev-parse', 'HEAD')
  git('tag', '-a', 'v1.1.0', tagPayload ? payload : seal, '-m', 'v1.1.0')
  const checks = manifest.requiredChecks.map(({ name, app }) => ({
    name,
    app,
    sha: payload,
    conclusion: 'success'
  }))
  return { root, manifest, baseline, bootstrap, product, payload, seal, checks }
}

// START_BLOCK_RELEASE_READINESS_TESTS
describe('release train authority', () => {
  it('parses the checked-in train and records its expected post-2.6.0 lifecycle identity', () => {
    const manifest = readTrainManifest(process.cwd())
    const result = validateTrainManifest(manifest, {
      workspaceRoot: process.cwd(),
      tag: 'v2.6.1'
    })
    expect(result).toMatchObject({
      trainId: '2.6.x-next',
      state: manifest.state,
      version: 'v2.6.1'.slice(1)
    })
    // Admission items arrive with owner acceptance, not with the train:
    // the count must mirror the checked-in manifest exactly (empty right
    // after a roll; four after the PR 16 acceptance).
    expect(result.itemCounts.userFacing).toBe(manifest.items.userFacing.length)
    expect(
      validateTrainLedger(
        readFileSync(resolve('docs/release-trains/2.6.x-next.md'), 'utf8'),
        manifest
      )
    ).toBe(true)
  })

  it('accepts a complete frozen authority with exact requested identity', () => {
    expect(
      validateTrainManifest(fixture(), {
        workspaceRoot: process.cwd(),
        tag: 'v1.1.0',
        payload: SHA_C
      })
    ).toMatchObject({ state: 'Frozen', payloadSha: SHA_C })
  })

  it('rejects an unsupported schema', () => {
    const manifest = fixture()
    manifest.schemaVersion = '2.0.0'
    rejectedWith(manifest, 'MT_RELEASE_TRAIN_INVALID')
  })

  it('rejects an impossible lifecycle transition', () => {
    const manifest = fixture()
    manifest.transitions = [
      { state: 'Collecting', date: '2026-10-20' },
      { state: 'Ready', date: '2026-10-20' },
      { state: 'Frozen', date: '2026-10-20' }
    ]
    rejectedWith(manifest, 'MT_RELEASE_LIFECYCLE_INVALID')
  })

  it('rejects Markdown ledger drift without choosing prose over JSON', () => {
    expect(() => validateTrainLedger('| State | Frozen |', fixture())).toThrow(
      expect.objectContaining({ code: 'MT_RELEASE_LEDGER_DRIFT' })
    )
  })

  it('rejects ambiguous membership across categories', () => {
    const manifest = fixture()
    manifest.items.operational[0].id = 'C-1'
    rejectedWith(manifest, 'MT_RELEASE_MEMBERSHIP_AMBIGUOUS')
  })

  it('rejects included user-facing behavior without owner acceptance', () => {
    const manifest = fixture()
    manifest.items.userFacing[0].acceptance = null
    rejectedWith(manifest, 'MT_RELEASE_ACCEPTANCE_MISSING')
  })

  it('rejects an exclusion whose code is declared present', () => {
    const manifest = fixture()
    manifest.items.notPresent[0].codePresent = true
    rejectedWith(manifest, 'MT_RELEASE_EXCLUSION_PRESENT')
  })

  it('rejects unclassified commit accounting', () => {
    const manifest = fixture()
    manifest.commitAccounting.entries[0].classification = 'mystery'
    rejectedWith(manifest, 'MT_RELEASE_COMMIT_ACCOUNTING_INVALID')
  })

  it('rejects commit accounting assigned to an unknown item', () => {
    const manifest = fixture()
    manifest.commitAccounting.entries[0].itemIds = ['UNKNOWN']
    rejectedWith(manifest, 'MT_RELEASE_COMMIT_ACCOUNTING_INVALID')
  })

  it('rejects a manually moved accounting boundary', () => {
    const manifest = fixture()
    manifest.commitAccounting.fromExclusive = SHA_B
    rejectedWith(manifest, 'MT_RELEASE_COMMIT_ACCOUNTING_INVALID')
  })

  it('rejects an item linked through the wrong classification', () => {
    const manifest = fixture()
    manifest.commitAccounting.entries[0].classification = 'operational'
    rejectedWith(manifest, 'MT_RELEASE_COMMIT_ACCOUNTING_INVALID')
  })

  it('accepts one commit linked to multiple items in the same group', () => {
    const manifest = fixture()
    manifest.items.userFacing.push({
      ...structuredClone(manifest.items.userFacing[0]),
      id: 'C-2'
    })
    manifest.commitAccounting.entries[0].itemIds.push('C-2')
    expect(validateTrainManifest(manifest)).toMatchObject({ state: 'Frozen' })
  })

  it('rejects an item commit omitted from reverse accounting', () => {
    const manifest = fixture()
    manifest.items.userFacing[0].commits.push(SHA_B)
    rejectedWith(manifest, 'MT_RELEASE_COMMIT_ACCOUNTING_INVALID')
  })

  it.each([
    ['missing', (checks) => checks.pop()],
    ['substituted', (checks) => { checks[0].name = 'not-the-status-check' }],
    ['duplicated', (checks) => checks.push(structuredClone(checks[0]))]
  ])('rejects a %s strict required-check set', (_label, mutate) => {
    const manifest = fixture()
    mutate(manifest.requiredChecks)
    rejectedWith(manifest, 'MT_RELEASE_CHECK_POLICY_INVALID')
  })

  it('rejects a frozen train whose accounting boundary differs from payloadSha', () => {
    const manifest = fixture()
    manifest.commitAccounting.throughInclusive = SHA_B
    rejectedWith(manifest, 'MT_RELEASE_COMMIT_ACCOUNTING_INVALID')
  })

  it('rejects a stale requested tag independently', () => {
    rejectedWith(fixture(), 'MT_RELEASE_IDENTITY_MISMATCH', {
      tag: 'v1.0.1'
    })
  })

  it('rejects a stale requested payload independently', () => {
    rejectedWith(fixture(), 'MT_RELEASE_IDENTITY_MISMATCH', {
      payload: SHA_A
    })
  })

  it('rejects a frozen train with incomplete materials', () => {
    const manifest = fixture()
    manifest.materials.status = 'draft'
    rejectedWith(manifest, 'MT_RELEASE_MATERIALS_INCOMPLETE')
  })

  it('rejects a self-referential recorded seal SHA', () => {
    const manifest = fixture()
    manifest.sealSha = SHA_B
    rejectedWith(manifest, 'MT_RELEASE_SEAL_INVALID')
  })

  it('keeps the manifest valid JSON with no machine-specific path', () => {
    const source = readFileSync(
      resolve('docs/release-trains/2.6.x-next.json'),
      'utf8'
    )
    expect(() => JSON.parse(source)).not.toThrow()
    expect(source).not.toContain('/Users/')
    expect(source).not.toContain('C:\\')
  })
})
// END_BLOCK_RELEASE_READINESS_TESTS

// START_BLOCK_STRICT_RELEASE_IDENTITY_TESTS
describe('strict release identity', () => {
  it('accepts one classified payload, one metadata-only seal, exact tag/HEAD, fresh screenshots, and matching checks', () => {
    const state = strictRepository()
    expect(
      validateStrictRepositoryState(state.root, state.manifest, {
        tag: 'v1.1.0',
        payload: state.payload,
        seal: state.seal,
        head: state.seal,
        checks: state.checks
      })
    ).toMatchObject({
      payloadSha: state.payload,
      sealSha: state.seal,
      accountedCommits: 2
    })
  })

  it('accepts the same strict identity while the candidate is Frozen', () => {
    const state = strictRepository()
    state.manifest.state = 'Frozen'
    state.manifest.transitions.pop()
    expect(
      validateStrictRepositoryState(state.root, state.manifest, {
        tag: 'v1.1.0',
        payload: state.payload,
        seal: state.seal,
        head: state.seal,
        checks: state.checks
      })
    ).toMatchObject({ payloadSha: state.payload, sealSha: state.seal })
  })

  it('rejects a product-code change in the sealing delta independently', () => {
    const state = strictRepository({ extraSealPath: 'src/product.js' })
    expect(() =>
      validateStrictRepositoryState(state.root, state.manifest, {
        tag: 'v1.1.0',
        payload: state.payload,
        seal: state.seal,
        head: state.seal,
        checks: state.checks
      })
    ).toThrow(expect.objectContaining({ code: 'MT_RELEASE_SEAL_PRODUCT_DELTA' }))
  })

  it('rejects a tag that peels to the payload instead of the seal', () => {
    const state = strictRepository({ tagPayload: true })
    expect(() =>
      validateStrictRepositoryState(state.root, state.manifest, {
        tag: 'v1.1.0',
        payload: state.payload,
        seal: state.seal,
        head: state.seal,
        checks: state.checks
      })
    ).toThrow(expect.objectContaining({ code: 'MT_RELEASE_TAG_TARGET_MISMATCH' }))
  })

  it('rejects a stale check-run SHA independently', () => {
    const state = strictRepository()
    state.checks[0].sha = state.baseline
    expect(() =>
      validateStrictRepositoryState(state.root, state.manifest, {
        tag: 'v1.1.0',
        payload: state.payload,
        seal: state.seal,
        head: state.seal,
        checks: state.checks
      })
    ).toThrow(expect.objectContaining({ code: 'MT_RELEASE_CHECK_EVIDENCE_INVALID' }))
  })

  it('rejects a previous tag commit that differs from the recorded boundary', () => {
    const state = strictRepository()
    state.manifest.previousRelease.commit = state.bootstrap
    expect(() =>
      validateStrictRepositoryState(state.root, state.manifest, {
        tag: 'v1.1.0',
        payload: state.payload,
        seal: state.seal,
        head: state.seal,
        checks: state.checks
      })
    ).toThrow(expect.objectContaining({ code: 'MT_RELEASE_PREVIOUS_BOUNDARY_INVALID' }))
  })

  it('rejects Release Please bootstrap drift independently', () => {
    const state = strictRepository()
    writeFileSync(
      resolve(state.root, 'release-please-config.json'),
      `${JSON.stringify({ 'bootstrap-sha': state.baseline }, null, 2)}\n`
    )
    expect(() =>
      validateStrictRepositoryState(state.root, state.manifest, {
        tag: 'v1.1.0',
        payload: state.payload,
        seal: state.seal,
        head: state.seal,
        checks: state.checks
      })
    ).toThrow(expect.objectContaining({ code: 'MT_RELEASE_PREVIOUS_BOUNDARY_INVALID' }))
  })

  it('rejects a mismatched checkout independently', () => {
    const state = strictRepository()
    expect(() =>
      validateStrictRepositoryState(state.root, state.manifest, {
        tag: 'v1.1.0',
        payload: state.payload,
        seal: state.seal,
        head: state.payload,
        checks: state.checks
      })
    ).toThrow(expect.objectContaining({ code: 'MT_RELEASE_CHECKOUT_MISMATCH' }))
  })

  it('rejects non-fresh screenshot evidence independently', () => {
    const state = strictRepository()
    writeFileSync(
      resolve(state.root, 'docs/assets/readme/1.1.0.manifest.json'),
      JSON.stringify({
        releaseVersion: '1.1.0',
        payloadSha: state.payload,
        captureState: 'retained-reviewed-images'
      })
    )
    expect(() =>
      validateStrictRepositoryState(state.root, state.manifest, {
        tag: 'v1.1.0',
        payload: state.payload,
        seal: state.seal,
        head: state.seal,
        checks: state.checks
      })
    ).toThrow(expect.objectContaining({ code: 'MT_RELEASE_SCREENSHOT_NOT_FRESH' }))
  })
})
// END_BLOCK_STRICT_RELEASE_IDENTITY_TESTS
