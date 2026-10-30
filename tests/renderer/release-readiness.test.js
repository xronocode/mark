// FILE: tests/renderer/release-readiness.test.js
// VERSION: 2.2.0
// START_MODULE_CONTRACT
//   PURPOSE: Prove release-train lifecycle, membership, owner-acceptance, exclusion, commit-accounting, and identity failures remain independently detectable.
//   SCOPE: Deterministic unit fixtures for the repository-only release-readiness validator; no GitHub API or publication behavior.
//   DEPENDS: Vitest; tools/release-readiness.mjs; tools/release-train.mjs; docs/release-trains/current.json.
//   LINKS: .grace/verification/features.xml V-M-046.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   completeLedger - Ledger fixture that satisfies the current-train completeness rules.
//   pointerWorkspace - Minimal workspace with a current-train pointer, README line, train files, and Project schema.
//   SHA_A - Deterministic previous-release commit fixture.
//   SHA_B - Deterministic bootstrap/seal commit fixture.
//   SHA_C - Deterministic payload commit fixture.
//   fixture - Minimal valid train authority for mutation-focused cases.
//   STRICT_CHECKS - Immutable strict check policy fixture.
//   strictRepository - Build a previous-tag/bootstrap/payload/seal repository with an annotated tag; the seal span can be several bookkeeping commits, a merge commit, or carry a reverted product change.
//   strictOptions - Default strict identity options for one strict repository.
//   rejectedWith - Assert one stable release-readiness failure code.
//   SHA_D - Deterministic lane merge-commit fixture.
//   laneFixture - Minimal valid lane-train (td-N) authority in a chosen state.
//   laneLedger - Lane ledger fixture that satisfies the always-complete lane rules.
//   laneWorkspace - Workspace with a carrier product train and one lane document pair.
//   laneRejected - Assert one stable lane-validation failure code.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   - 2026-10-30 v2.2.0: lane trains — prove lane lifecycle, base/head accounting, premature departure, carrier admission of every lane commit, the always-complete lane ledger and the per-run validation of every td-N document.
//   - 2026-10-27 v2.1.0: current-train bookkeeping drift — prove a missing admitted-item heading, commit, or history bullet fails, terminal ledgers stay header-only, and the pointer/README/Project-schema trio must agree.
//   - 2026-10-24 v2.0.0: C-RELEASE-CONVEYOR — validate the live train through the current-train pointer (no hardcoded train or version); prove multi-commit and merge-commit metadata-only seal spans pass while a product commit anywhere in the span (even one reverted later) and a seal equal to the payload fail; drop the Release Please boundary case.
//   - 2026-10-21 v1.3.1: derive the collecting-train item count from the checked-in manifest so routine admissions do not require a duplicate fixture edit.
//   - 2026-10-21 v1.3.0: validate the checked-in train in either collecting main or prepared release-PR lifecycle state.
//   - 2026-10-20 v1.2.0: cover trusted previous-release boundaries, many-to-many item accounting, and exact non-seal check policy.
//   - 2026-10-20 v1.1.0: add payload/seal/tag/check/fresh-screenshot strict identity regressions.
//   - 2026-10-20 v1.0.0: pin the C-RELEASE-PIPELINE-AUTOMATION train authority and independent negative conditions.
// END_CHANGE_SUMMARY

import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { resolveCurrentTrain } from '../../tools/release-train.mjs'
import {
  readTrainManifest,
  validateCurrentTrainPointer,
  validateLaneTrainLedger,
  validateLaneTrainManifest,
  validateLaneTrains,
  validateProjectFieldCoverage,
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

const strictRepository = ({
  extraSealPath,
  tagPayload = false,
  bookkeepingCommits = 0,
  mergeSeal = false,
  revertedProduct = false
} = {}) => {
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
  write('operations.txt', 'release controls\n')
  git('add', '.github/release-governance.json', 'operations.txt')
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
  if (mergeSeal) git('checkout', '-q', '-b', 'seal-pr')
  if (revertedProduct) {
    write('src/sneaked.js', 'product bytes outside the payload\n')
    git('add', 'src/sneaked.js')
    git('commit', '-m', 'feat: sneak product code into the seal span')
    git('rm', '-q', 'src/sneaked.js')
    git('commit', '-m', 'revert: hide it again')
  }
  for (let index = 0; index < bookkeepingCommits; index += 1) {
    write('docs/release-trains/2.6.x-next.md', `| State | Ready |\n\n- bookkeeping ${index}\n`)
    git('add', 'docs/release-trains/2.6.x-next.md')
    git('commit', '-m', `chore(train): bookkeeping ${index}`)
  }
  if (extraSealPath) write(extraSealPath, 'unexpected product delta\n')
  git('add', '.')
  git('commit', '-m', 'chore(release): seal v1.1.0')
  if (mergeSeal) {
    git('checkout', '-q', 'main')
    git('merge', '-q', '--no-ff', 'seal-pr', '-m', 'Merge pull request: seal v1.1.0')
  }
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

const strictOptions = (state) => ({
  tag: 'v1.1.0',
  payload: state.payload,
  seal: state.seal,
  head: state.seal,
  checks: state.checks
})

// START_BLOCK_RELEASE_READINESS_TESTS
describe('release train authority', () => {
  it('parses the current train named by the pointer and validates its own identity', () => {
    const current = resolveCurrentTrain(process.cwd())
    const manifest = readTrainManifest(process.cwd())
    const result = validateTrainManifest(manifest, {
      workspaceRoot: process.cwd(),
      tag: `v${manifest.computedVersion}`
    })
    expect(result).toMatchObject({
      trainId: current.trainId,
      state: manifest.state,
      version: manifest.computedVersion
    })
    // Admission items arrive with owner acceptance, not with the train:
    // the count must mirror the checked-in manifest exactly (empty right
    // after a roll; four after the PR 16 acceptance).
    expect(result.itemCounts.userFacing).toBe(manifest.items.userFacing.length)
    expect(
      validateTrainLedger(
        readFileSync(resolve(current.markdown), 'utf8'),
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
  }, 30000)

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
  }, 30000)

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
  }, 30000)

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
  }, 30000)

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
  }, 30000)

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
  }, 30000)

  it('accepts a seal span of several bookkeeping-only commits', () => {
    const state = strictRepository({ bookkeepingCommits: 3 })
    expect(validateStrictRepositoryState(state.root, state.manifest, strictOptions(state))).toMatchObject({
      payloadSha: state.payload,
      sealSha: state.seal
    })
  }, 30000)

  it('accepts a seal that landed as a merge commit', () => {
    const state = strictRepository({ mergeSeal: true })
    expect(validateStrictRepositoryState(state.root, state.manifest, strictOptions(state))).toMatchObject({
      payloadSha: state.payload,
      sealSha: state.seal
    })
  }, 30000)

  it('rejects a product commit inside the span even when a later commit reverts it', () => {
    const state = strictRepository({ revertedProduct: true })
    expect(() =>
      validateStrictRepositoryState(state.root, state.manifest, strictOptions(state))
    ).toThrow(expect.objectContaining({ code: 'MT_RELEASE_SEAL_PRODUCT_DELTA' }))
  }, 30000)

  it('rejects a seal equal to the payload', () => {
    const state = strictRepository()
    expect(() =>
      validateStrictRepositoryState(state.root, state.manifest, {
        ...strictOptions(state),
        seal: state.payload,
        head: state.payload
      })
    ).toThrow(expect.objectContaining({ code: 'MT_RELEASE_SEAL_INVALID' }))
  }, 30000)

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
  }, 30000)

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
  }, 30000)
})
// END_BLOCK_STRICT_RELEASE_IDENTITY_TESTS

// START_BLOCK_RELEASE_TRAIN_DRIFT_TESTS
const completeLedger = (manifest) =>
  [
    '| State | Frozen |',
    '| Target version / date | 1.1.0 / unscheduled |',
    '| Machine-readable authority | [test-next.json](test-next.json) |',
    '',
    '### C-1',
    `- Source commit: \`${SHA_C.slice(0, 8)}\``,
    ...manifest.transitions.map(({ date }) => `- ${date}: lifecycle event`),
    ''
  ].join('\n')

const pointerWorkspace = ({ readmeLine, trainIds, options }) => {
  const root = mkdtempSync(resolve(tmpdir(), 'mark-train-pointer-'))
  mkdirSync(resolve(root, 'docs/release-trains'), { recursive: true })
  mkdirSync(resolve(root, '.github'), { recursive: true })
  writeFileSync(
    resolve(root, 'docs/release-trains/current.json'),
    JSON.stringify({ schemaVersion: '1.0.0', trainId: trainIds[0] })
  )
  writeFileSync(resolve(root, 'docs/release-trains/README.md'), `# Trains\n\n${readmeLine}\n`)
  for (const trainId of trainIds) {
    writeFileSync(resolve(root, `docs/release-trains/${trainId}.json`), JSON.stringify({ trainId }))
    writeFileSync(resolve(root, `docs/release-trains/${trainId}.md`), `# ${trainId}\n`)
  }
  writeFileSync(
    resolve(root, '.github/release-governance.json'),
    JSON.stringify({
      project: { fields: [{ name: 'Train', dataType: 'SINGLE_SELECT', options }] }
    })
  )
  return root
}

describe('release-train bookkeeping drift', () => {
  it('accepts a current ledger that carries every admitted item and history bullet', () => {
    expect(
      validateTrainLedger(completeLedger(fixture()), fixture(), { complete: true })
    ).toBe(true)
  })

  it('rejects a current ledger that omits an admitted item heading', () => {
    const markdown = completeLedger(fixture()).replace('### C-1', '### C-OTHER')
    expect(() => validateTrainLedger(markdown, fixture(), { complete: true })).toThrow(
      expect.objectContaining({ code: 'MT_RELEASE_LEDGER_DRIFT' })
    )
  })

  it('rejects a current ledger that omits the admitted commit', () => {
    const markdown = completeLedger(fixture()).replace(SHA_C.slice(0, 8), '')
    expect(() => validateTrainLedger(markdown, fixture(), { complete: true })).toThrow(
      expect.objectContaining({ code: 'MT_RELEASE_LEDGER_DRIFT' })
    )
  })

  it('rejects a current ledger whose history is shorter than the lifecycle', () => {
    const markdown = completeLedger(fixture()).replace(/^- \d{4}-\d{2}-\d{2}.*$/gm, '')
    expect(() => validateTrainLedger(markdown, fixture(), { complete: true })).toThrow(
      expect.objectContaining({ code: 'MT_RELEASE_LEDGER_DRIFT' })
    )
  })

  it('keeps a terminal ledger header-only without demanding item prose', () => {
    const header = completeLedger(fixture()).split('### C-1')[0]
    expect(validateTrainLedger(header, fixture())).toBe(true)
  })

  it('accepts a pointer whose README names the same train', () => {
    const root = pointerWorkspace({
      readmeLine: 'Current train: [9.9.9-next](9.9.9-next.md).',
      trainIds: ['9.9.9-next'],
      options: ['9.9.9-next']
    })
    expect(validateCurrentTrainPointer(root)).toMatchObject({ trainId: '9.9.9-next' })
  })

  it('rejects a README current-train line that disagrees with the pointer', () => {
    const root = pointerWorkspace({
      readmeLine: 'Current train: [9.9.8-next](9.9.8-next.md).',
      trainIds: ['9.9.9-next', '9.9.8-next'],
      options: ['9.9.9-next', '9.9.8-next']
    })
    expect(() => validateCurrentTrainPointer(root)).toThrow(
      expect.objectContaining({ code: 'MT_RELEASE_CURRENT_TRAIN_DRIFT' })
    )
  })

  it('rejects a pointer that names a train without documents', () => {
    const root = pointerWorkspace({
      readmeLine: 'Current train: [9.9.9-next](9.9.9-next.md).',
      trainIds: ['9.9.9-next'],
      options: ['9.9.9-next']
    })
    unlinkSync(resolve(root, 'docs/release-trains/9.9.9-next.md'))
    expect(() => validateCurrentTrainPointer(root)).toThrow(
      expect.objectContaining({ code: 'MT_RELEASE_CURRENT_TRAIN_INVALID' })
    )
  })

  it('rejects a Project Train field that omits a checked-in train option', () => {
    const root = pointerWorkspace({
      readmeLine: 'Current train: [9.9.9-next](9.9.9-next.md).',
      trainIds: ['9.9.9-next', '9.9.8-next'],
      options: ['9.9.9-next']
    })
    expect(() => validateProjectFieldCoverage(root)).toThrow(
      expect.objectContaining({ code: 'MT_RELEASE_PROJECT_OPTION_MISSING' })
    )
  })

  it('counts every checked-in train when the Project schema covers them', () => {
    const root = pointerWorkspace({
      readmeLine: 'Current train: [9.9.9-next](9.9.9-next.md).',
      trainIds: ['9.9.9-next', '9.9.8-next'],
      options: ['9.9.9-next', '9.9.8-next']
    })
    expect(validateProjectFieldCoverage(root)).toBe(2)
  })
})
// END_BLOCK_RELEASE_TRAIN_DRIFT_TESTS

// START_BLOCK_LANE_TRAIN_TESTS
const SHA_D = 'd'.repeat(40)

const laneFixture = (state = 'Collecting') => {
  const frozen = state === 'Frozen' || state === 'Merged'
  const transitions = [{ state: 'Collecting', date: '2026-10-30' }]
  if (frozen) transitions.push({ state: 'Frozen', date: '2026-10-31' })
  if (state === 'Merged') transitions.push({ state: 'Merged', date: '2026-11-01' })
  return {
    schemaVersion: '1.0.0',
    kind: 'lane',
    trainId: 'td-1',
    state,
    lane: {
      branch: 'integ/techdebt',
      baseSha: SHA_A,
      headSha: frozen ? SHA_C : null,
      mergeSha: state === 'Merged' ? SHA_D : null,
      carrierTrain: state === 'Merged' ? '9.9.x-next' : null
    },
    items: {
      userFacing: [],
      operational: [
        {
          id: 'TD-1',
          summary: 'Dependency advisories closed',
          commits: [SHA_C],
          acceptance: {
            owner: 'owner',
            date: '2026-10-30',
            testedArtifact: 'None — dependency bump only',
            scenarios: ['AUTOMATED: cargo audit reports no vulnerabilities.']
          }
        }
      ],
      notPresent: []
    },
    commitAccounting: {
      fromExclusive: SHA_A,
      throughInclusive: frozen ? SHA_C : null,
      entries: [{ sha: SHA_C, classification: 'operational', itemIds: ['TD-1'] }]
    },
    transitions
  }
}

const laneLedger = (manifest) =>
  [
    `| State | ${manifest.state} |`,
    '| Lane branch | `integ/techdebt` |',
    '| Machine-readable authority | [td-1.json](td-1.json) |',
    '',
    '### TD-1',
    `- Source commit: \`${SHA_C.slice(0, 8)}\``,
    ...manifest.transitions.map(({ date }) => `- ${date}: lifecycle event`),
    ''
  ].join('\n')

const laneWorkspace = ({ manifest = laneFixture('Merged'), carried = [SHA_D, SHA_C] } = {}) => {
  const root = mkdtempSync(resolve(tmpdir(), 'mark-lane-train-'))
  mkdirSync(resolve(root, 'docs/release-trains'), { recursive: true })
  writeFileSync(
    resolve(root, 'docs/release-trains/9.9.x-next.json'),
    JSON.stringify({
      trainId: '9.9.x-next',
      items: {
        userFacing: [],
        operational: carried ? [{ id: 'td-1', summary: 'Tech-debt lane', commits: carried }] : []
      }
    })
  )
  writeFileSync(resolve(root, 'docs/release-trains/td-1.json'), JSON.stringify(manifest))
  writeFileSync(resolve(root, 'docs/release-trains/td-1.md'), laneLedger(manifest))
  return root
}

const laneRejected = (manifest, code, workspaceRoot = process.cwd()) => {
  expect(() => validateLaneTrainManifest(manifest, { workspaceRoot })).toThrow(
    expect.objectContaining({ code })
  )
}

describe('lane trains', () => {
  it('accepts a collecting lane with partial accounting', () => {
    expect(validateLaneTrainManifest(laneFixture())).toMatchObject({
      trainId: 'td-1',
      state: 'Collecting',
      branch: 'integ/techdebt',
      itemCounts: { operational: 1 }
    })
  })

  it('accepts a frozen lane accounted through its head', () => {
    expect(validateLaneTrainManifest(laneFixture('Frozen')).state).toBe('Frozen')
  })

  it('rejects a frozen lane without a head or with accounting that stops short', () => {
    const headless = laneFixture('Frozen')
    headless.lane.headSha = null
    laneRejected(headless, 'MT_RELEASE_COMMIT_ACCOUNTING_INVALID')
    const short = laneFixture('Frozen')
    short.commitAccounting.entries = []
    laneRejected(short, 'MT_RELEASE_COMMIT_ACCOUNTING_INVALID')
  })

  it('rejects accounting that does not start at the lane base', () => {
    const manifest = laneFixture()
    manifest.commitAccounting.fromExclusive = SHA_B
    laneRejected(manifest, 'MT_RELEASE_COMMIT_ACCOUNTING_INVALID')
  })

  it.each([
    ['kind', (m) => delete m.kind, 'MT_RELEASE_LANE_INVALID'],
    ['product-style ID', (m) => (m.trainId = '2.9.x-next'), 'MT_RELEASE_LANE_INVALID'],
    ['main as the lane branch', (m) => (m.lane.branch = 'main'), 'MT_RELEASE_LANE_INVALID'],
    ['missing base', (m) => (m.lane.baseSha = null), 'MT_RELEASE_LANE_INVALID'],
    ['product state', (m) => (m.state = 'Released'), 'MT_RELEASE_LIFECYCLE_INVALID'],
    ['premature departure', (m) => (m.lane.mergeSha = SHA_D), 'MT_RELEASE_LANE_INVALID']
  ])('rejects a lane with %s', (_name, mutate, code) => {
    const manifest = laneFixture()
    mutate(manifest)
    laneRejected(manifest, code)
  })

  it('rejects a lane that skips Frozen on its way to Merged', () => {
    const manifest = laneFixture('Merged')
    manifest.transitions = manifest.transitions.filter(({ state }) => state !== 'Frozen')
    laneRejected(manifest, 'MT_RELEASE_LIFECYCLE_INVALID', laneWorkspace({ manifest }))
  })

  it('accepts a merged lane its carrier train holds in full', () => {
    const root = laneWorkspace()
    expect(validateLaneTrainManifest(laneFixture('Merged'), { workspaceRoot: root }).state).toBe(
      'Merged'
    )
  })

  it.each([
    ['no carrier item', null],
    ['the merge commit missing', [SHA_C]],
    ['a lane commit missing', [SHA_D]]
  ])('rejects a merged lane with %s', (_name, carried) => {
    const root = laneWorkspace({ carried })
    laneRejected(laneFixture('Merged'), 'MT_RELEASE_LANE_CARRIER_MISSING', root)
  })

  it('rejects a merged lane whose carrier train is not checked in', () => {
    const manifest = laneFixture('Merged')
    manifest.lane.carrierTrain = '9.8.x-next'
    laneRejected(manifest, 'MT_RELEASE_LANE_CARRIER_MISSING', laneWorkspace())
  })

  it('demands a heading for operational lane items and a current header', () => {
    const manifest = laneFixture()
    expect(validateLaneTrainLedger(laneLedger(manifest), manifest)).toBe(true)
    expect(() =>
      validateLaneTrainLedger(laneLedger(manifest).replace('### TD-1', '### TD-9'), manifest)
    ).toThrow(expect.objectContaining({ code: 'MT_RELEASE_LEDGER_DRIFT' }))
    expect(() =>
      validateLaneTrainLedger(laneLedger(manifest).replace('| State | Collecting |', '| State | Frozen |'), manifest)
    ).toThrow(expect.objectContaining({ code: 'MT_RELEASE_LEDGER_DRIFT' }))
  })

  it('validates every checked-in lane and rejects a lane file whose ID disagrees', () => {
    const root = laneWorkspace()
    expect(validateLaneTrains(root).map(({ trainId }) => trainId)).toEqual(['td-1'])
    const renamed = laneFixture('Merged')
    renamed.trainId = 'td-2'
    writeFileSync(resolve(root, 'docs/release-trains/td-1.json'), JSON.stringify(renamed))
    expect(() => validateLaneTrains(root)).toThrow(
      expect.objectContaining({ code: 'MT_RELEASE_LANE_INVALID' })
    )
  })

  it('finds no lanes on a main that has none', () => {
    expect(validateLaneTrains(process.cwd())).toEqual([])
  })
})
// END_BLOCK_LANE_TRAIN_TESTS
