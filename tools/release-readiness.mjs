// FILE: tools/release-readiness.mjs
// VERSION: 2.1.1
// START_MODULE_CONTRACT
//   PURPOSE: Validate the checked-in release-train authority and fail closed when lifecycle, membership, acceptance, human-ledger membership, current-train pointer projection, Project field coverage, or requested release identity is inconsistent.
//   SCOPE: Read one public train JSON document, its human Markdown ledger, the current-train pointer/README projection and the source-controlled Project field, validate deterministic repository-only invariants, whole-id ledger membership and coverage, and emit stable path-free diagnostics; online check-run proof and publication remain workflow concerns.
//   DEPENDS: Node.js fs, path, and url standard-library modules; tools/release-train.mjs; docs/release-trains/*.json.
//   LINKS: .grace/graph/features.xml M-046; .grace/verification/features.xml V-M-046.
//   ROLE: SCRIPT
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   ReleaseReadinessError - Stable coded release-train validation error.
//   readTrainManifest - Reads the checked-in JSON authority.
//   validateTrainManifest - Validates schema, lifecycle, membership, acceptance, and requested identity.
//   validateTrainLedger - Rejects drift between the JSON authority and its human Markdown ledger header and item membership.
//   validateCurrentTrainPointer - Proves current.json names an existing train and the README "Current train" line names the same train.
//   validateProjectFieldCoverage - Proves the checked-in Project Train field offers an option for every train document.
//   validateStrictRepositoryState - Proves payload/seal/tag/check-run identity from repository and supplied API evidence.
//   runReleaseReadiness - Runs the offline gate and emits its stable success marker.
//   TRAIN_SCHEMA_VERSION - Exact supported train-document schema.
//   RELEASE_STATES - Complete release lifecycle state set.
//   TRANSITIONS - Allowed forward and recovery lifecycle transitions.
//   STRICT_STATES - Lifecycle states that require repository identity proof.
//   SHA_PATTERN - Exact full Git commit SHA grammar.
//   SEMVER_PATTERN - Exact supported release-version grammar.
//   SEAL_PATH_PATTERNS - Release-bookkeeping paths a payload-to-seal commit may touch.
//   isSealPath - Test one path against the bookkeeping allowlist.
//   GOVERNANCE_CONFIG_PATH - Non-seal strict check policy authority.
//   TRAIN_FILE_PATTERN - Grammar of one train document file name.
//   LEDGER_HISTORY_LINE - Grammar of one dated history bullet in a train ledger.
//   escapeRegex - Escape one literal token for a RegExp.
//   fail - Raise one stable readiness error.
//   readJson - Read one JSON train authority.
//   requireString - Require one non-empty string field.
//   requireSha - Require one full Git commit identity.
//   normalizeItems - Flatten admitted user-facing and operational train members.
//   validateTransitions - Validate current lifecycle state and permitted history.
//   validateMembership - Validate admitted, excluded, and acceptance evidence.
//   validateCommitAccounting - Account for every payload-range commit exactly once.
//   checkIdentity - Serialize one required-check identity without ambiguity.
//   validateRequiredCheckPolicy - Pin the train check set to non-seal governance configuration.
//   git - Run one read-only Git query in the target repository.
//   validateRequiredChecks - Match exact successful required checks to the payload SHA.
//   validateSealSpan - Prove every commit between payload and seal touches only bookkeeping paths.
//   optionValue - Read one named command-line option.
//   main - Run the command-line interface.
//   invokedPath - Detect direct command-line execution.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   - 2026-10-27 v2.1.1: list the current-train pointer/README projection and Project Train-field coverage in the module contract and map; behavior unchanged.
//   - 2026-10-27 v2.1.0: C-RELEASE-LEDGER-GUARD — the Markdown ledger must name every admitted and excluded item id as a whole id (C-1 does not satisfy C-10), so an admission that edits only the JSON authority fails closed with MT_RELEASE_LEDGER_DRIFT.
//   - 2026-10-24 v2.0.0: C-RELEASE-CONVEYOR — resolve the train through the current-train pointer; accept any metadata-only payload-to-seal span (every commit proven bookkeeping-only) instead of exactly one commit, which merge-commit PRs could never satisfy; replace the hand-grown seal file list with bookkeeping path patterns; drop the Release Please boundary check.
//   - 2026-10-20 v1.2.0: bind the previous-release boundary, many-to-many item accounting, and strict check set to repository evidence outside the mutable seal.
//   - 2026-10-20 v1.1.0: add strict payload-to-seal, tag/HEAD, exact commit-accounting, fresh screenshot, and check-run identity gates.
//   - 2026-10-20 v1.0.0: add the C-RELEASE-PIPELINE-AUTOMATION machine-readable train authority and fail-closed offline gate.
// END_CHANGE_SUMMARY

import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { resolveCurrentTrain } from './release-train.mjs'

const TRAIN_SCHEMA_VERSION = '1.0.0'
const RELEASE_STATES = new Set([
  'Collecting',
  'Preparing',
  'Frozen',
  'Ready',
  'Released',
  'Aborted'
])
const TRANSITIONS = new Map([
  ['Collecting', new Set(['Preparing', 'Aborted'])],
  ['Preparing', new Set(['Collecting', 'Frozen', 'Aborted'])],
  ['Frozen', new Set(['Collecting', 'Ready', 'Aborted'])],
  ['Ready', new Set(['Collecting', 'Released', 'Aborted'])],
  ['Released', new Set()],
  ['Aborted', new Set()]
])
const STRICT_STATES = new Set(['Frozen', 'Ready', 'Released'])
const SHA_PATTERN = /^[0-9a-f]{40}$/
const SEMVER_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?$/
// Train ledgers (any generation, so Released-state corrections stay
// sealable) and README screenshot manifests. Nothing here is built into
// the app or read by the packaging lanes as product input.
const SEAL_PATH_PATTERNS = [
  /^docs\/release-trains\/[0-9A-Za-z.-]+\.(json|md)$/,
  /^docs\/assets\/readme\/[0-9A-Za-z.-]+\.manifest\.json$/
]
const isSealPath = (pathname) => SEAL_PATH_PATTERNS.some((pattern) => pattern.test(pathname))
const GOVERNANCE_CONFIG_PATH = '.github/release-governance.json'
const TRAIN_FILE_PATTERN = /^(\d+\.\d+\.(?:x|\d+))-next\.json$/
const LEDGER_HISTORY_LINE = /^- \d{4}-\d{2}-\d{2}\b/
const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export class ReleaseReadinessError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'ReleaseReadinessError'
    this.code = code
  }
}

const fail = (code, message) => {
  throw new ReleaseReadinessError(code, message)
}

const readJson = (pathname) => JSON.parse(readFileSync(pathname, 'utf8'))

const requireString = (value, code, field) => {
  if (typeof value !== 'string' || !value.trim()) fail(code, `${field}=missing`)
  return value
}

const requireSha = (value, code, field) => {
  if (!SHA_PATTERN.test(value ?? '')) fail(code, `${field}=invalid`)
  return value
}

const normalizeItems = (manifest) => {
  const groups = manifest.items ?? {}
  return {
    userFacing: Array.isArray(groups.userFacing) ? groups.userFacing : [],
    operational: Array.isArray(groups.operational) ? groups.operational : [],
    notPresent: Array.isArray(groups.notPresent) ? groups.notPresent : []
  }
}

// START_CONTRACT: readTrainManifest
//   PURPOSE: Read and parse one checked-in release-train JSON authority.
//   INPUTS: { workspaceRoot: string - repository root, trainPath: string - repository-relative manifest path }
//   OUTPUTS: { object - parsed train manifest }
//   SIDE_EFFECTS: Reads one public repository file.
//   LINKS: .grace/verification/features.xml V-M-046 release-train scenarios
// END_CONTRACT: readTrainManifest
// START_BLOCK_READ_TRAIN_MANIFEST
export const readTrainManifest = (workspaceRoot, trainPath) => {
  const pathname = resolve(workspaceRoot, trainPath ?? resolveCurrentTrain(workspaceRoot).json)
  try {
    return JSON.parse(readFileSync(pathname, 'utf8'))
  } catch (error) {
    fail('MT_RELEASE_TRAIN_INVALID', `manifest=unreadable;reason=${error.name}`)
  }
}
// END_BLOCK_READ_TRAIN_MANIFEST

const validateTransitions = (manifest) => {
  const history = manifest.transitions
  if (!Array.isArray(history) || history.length === 0) {
    fail('MT_RELEASE_LIFECYCLE_INVALID', 'transitions=missing')
  }
  let previous = null
  for (const [index, event] of history.entries()) {
    requireString(event?.state, 'MT_RELEASE_LIFECYCLE_INVALID', `transition[${index}].state`)
    requireString(event?.date, 'MT_RELEASE_LIFECYCLE_INVALID', `transition[${index}].date`)
    if (!RELEASE_STATES.has(event.state)) {
      fail('MT_RELEASE_LIFECYCLE_INVALID', `transition[${index}].state=${event.state}`)
    }
    if (previous && previous !== event.state && !TRANSITIONS.get(previous)?.has(event.state)) {
      fail('MT_RELEASE_LIFECYCLE_INVALID', `transition=${previous}->${event.state}`)
    }
    previous = event.state
  }
  if (previous !== manifest.state) {
    fail('MT_RELEASE_LIFECYCLE_INVALID', `history=${previous};state=${manifest.state}`)
  }
}

const validateMembership = (manifest, workspaceRoot) => {
  const groups = normalizeItems(manifest)
  const seen = new Set()
  for (const [groupName, entries] of Object.entries(groups)) {
    for (const [index, item] of entries.entries()) {
      const id = requireString(
        item?.id,
        'MT_RELEASE_MEMBERSHIP_INVALID',
        `${groupName}[${index}].id`
      )
      if (seen.has(id)) fail('MT_RELEASE_MEMBERSHIP_AMBIGUOUS', `item=${id}`)
      seen.add(id)
      requireString(item.summary, 'MT_RELEASE_MEMBERSHIP_INVALID', `${id}.summary`)
      if (groupName === 'userFacing') {
        requireString(item.state, 'MT_RELEASE_MEMBERSHIP_INVALID', `${id}.state`)
        if (!Array.isArray(item.commits) || item.commits.length === 0) {
          fail('MT_RELEASE_MEMBERSHIP_INVALID', `${id}.commits=missing`)
        }
        for (const commit of item.commits) requireSha(commit, 'MT_RELEASE_MEMBERSHIP_INVALID', `${id}.commit`)
        const acceptance = item.acceptance
        requireString(acceptance?.owner, 'MT_RELEASE_ACCEPTANCE_MISSING', `${id}.owner`)
        requireString(acceptance?.date, 'MT_RELEASE_ACCEPTANCE_MISSING', `${id}.date`)
        requireString(acceptance?.testedArtifact, 'MT_RELEASE_ACCEPTANCE_MISSING', `${id}.testedArtifact`)
        if (!Array.isArray(acceptance?.scenarios) || acceptance.scenarios.length === 0) {
          fail('MT_RELEASE_ACCEPTANCE_MISSING', `${id}.scenarios=missing`)
        }
      }
      if (groupName === 'operational') {
        if (!Array.isArray(item.commits) || item.commits.length === 0) {
          fail('MT_RELEASE_MEMBERSHIP_INVALID', `${id}.commits=missing`)
        }
        for (const commit of item.commits) requireSha(commit, 'MT_RELEASE_MEMBERSHIP_INVALID', `${id}.commit`)
      }
      if (groupName === 'notPresent') {
        requireString(item.reason, 'MT_RELEASE_EXCLUSION_INVALID', `${id}.reason`)
        if (item.codePresent !== false) {
          fail('MT_RELEASE_EXCLUSION_PRESENT', `item=${id};codePresent=${item.codePresent}`)
        }
        for (const pathname of item.presencePaths ?? []) {
          if (existsSync(resolve(workspaceRoot, pathname))) {
            fail('MT_RELEASE_EXCLUSION_PRESENT', `item=${id};path=${pathname}`)
          }
        }
      }
    }
  }
  return groups
}

const validateCommitAccounting = (manifest, groups) => {
  const accounting = manifest.commitAccounting
  requireSha(accounting?.fromExclusive, 'MT_RELEASE_COMMIT_ACCOUNTING_INVALID', 'fromExclusive')
  if (accounting.fromExclusive !== manifest.previousRelease.bootstrapSha) {
    fail(
      'MT_RELEASE_COMMIT_ACCOUNTING_INVALID',
      `from=${accounting.fromExclusive};bootstrap=${manifest.previousRelease.bootstrapSha}`
    )
  }
  if (!Array.isArray(accounting?.entries)) {
    fail('MT_RELEASE_COMMIT_ACCOUNTING_INVALID', 'entries=missing')
  }
  const itemGroups = new Map([
    ...groups.userFacing.map((item) => [item.id, { item, classification: 'user-facing' }]),
    ...groups.operational.map((item) => [item.id, { item, classification: 'operational' }]),
    ...groups.notPresent.map((item) => [item.id, { item, classification: 'not-present' }])
  ])
  const commits = new Set()
  for (const entry of accounting.entries) {
    requireSha(entry?.sha, 'MT_RELEASE_COMMIT_ACCOUNTING_INVALID', 'entry.sha')
    if (commits.has(entry.sha)) {
      fail('MT_RELEASE_COMMIT_ACCOUNTING_INVALID', `duplicate=${entry.sha}`)
    }
    commits.add(entry.sha)
    if (!['user-facing', 'operational'].includes(entry.classification)) {
      fail('MT_RELEASE_COMMIT_ACCOUNTING_INVALID', `sha=${entry.sha};classification=invalid`)
    }
    if (!Array.isArray(entry.itemIds) || entry.itemIds.length === 0) {
      fail('MT_RELEASE_COMMIT_ACCOUNTING_INVALID', `sha=${entry.sha};itemIds=missing`)
    }
    if (new Set(entry.itemIds).size !== entry.itemIds.length) {
      fail('MT_RELEASE_COMMIT_ACCOUNTING_INVALID', `sha=${entry.sha};itemIds=duplicate`)
    }
    for (const itemId of entry.itemIds) {
      const owned = itemGroups.get(itemId)
      if (!owned) {
        fail('MT_RELEASE_COMMIT_ACCOUNTING_INVALID', `sha=${entry.sha};item=${itemId}`)
      }
      if (owned.classification !== entry.classification) {
        fail(
          'MT_RELEASE_COMMIT_ACCOUNTING_INVALID',
          `sha=${entry.sha};item=${itemId};classification=${entry.classification}`
        )
      }
      if (!owned.item.commits?.includes(entry.sha)) {
        fail('MT_RELEASE_COMMIT_ACCOUNTING_INVALID', `sha=${entry.sha};item=${itemId};link=missing`)
      }
    }
  }
  if (STRICT_STATES.has(manifest.state)) {
    requireSha(accounting.throughInclusive, 'MT_RELEASE_COMMIT_ACCOUNTING_INVALID', 'throughInclusive')
    if (accounting.throughInclusive !== manifest.payloadSha) {
      fail(
        'MT_RELEASE_COMMIT_ACCOUNTING_INVALID',
        `through=${accounting.throughInclusive};payload=${manifest.payloadSha}`
      )
    }
    if (accounting.entries.length === 0) {
      fail('MT_RELEASE_COMMIT_ACCOUNTING_INVALID', 'entries=empty')
    }
    for (const [itemId, owned] of itemGroups) {
      if (owned.classification === 'not-present') continue
      for (const sha of owned.item.commits) {
        const entry = accounting.entries.find((candidate) => candidate.sha === sha)
        if (!entry?.itemIds.includes(itemId)) {
          fail('MT_RELEASE_COMMIT_ACCOUNTING_INVALID', `sha=${sha};item=${itemId};reverseLink=missing`)
        }
      }
    }
  }
}

const checkIdentity = ({ name, app } = {}) => `${name ?? ''}\u0000${app ?? ''}`

const validateRequiredCheckPolicy = (manifest, workspaceRoot) => {
  const configured = readJson(resolve(workspaceRoot, GOVERNANCE_CONFIG_PATH)).strictRequiredChecks
  const recorded = manifest.requiredChecks
  if (!Array.isArray(configured) || configured.length === 0 || !Array.isArray(recorded)) {
    fail('MT_RELEASE_CHECK_POLICY_INVALID', 'checks=missing')
  }
  const configuredKeys = configured.map(checkIdentity)
  const recordedKeys = recorded.map(checkIdentity)
  if (
    new Set(configuredKeys).size !== configuredKeys.length ||
    new Set(recordedKeys).size !== recordedKeys.length ||
    configuredKeys.length !== recordedKeys.length ||
    configuredKeys.some((key, index) => key !== recordedKeys[index])
  ) {
    fail('MT_RELEASE_CHECK_POLICY_INVALID', 'checks=drift')
  }
}

// START_CONTRACT: validateTrainManifest
//   PURPOSE: Enforce deterministic train schema, lifecycle, unique membership, owner acceptance, commit accounting, and optional requested release identity.
//   INPUTS: { manifest: object - parsed authority, options: object - workspaceRoot and optional tag/payload }
//   OUTPUTS: { object - normalized train identity and item counts }
//   SIDE_EFFECTS: May test repository-relative exclusion paths; otherwise none.
//   LINKS: .grace/verification/features.xml V-M-046 release-train scenarios
// END_CONTRACT: validateTrainManifest
// START_BLOCK_VALIDATE_TRAIN_MANIFEST
export const validateTrainManifest = (
  manifest,
  { workspaceRoot = process.cwd(), tag, payload } = {}
) => {
  if (manifest?.schemaVersion !== TRAIN_SCHEMA_VERSION) {
    fail('MT_RELEASE_TRAIN_INVALID', `schema=${manifest?.schemaVersion ?? 'missing'}`)
  }
  requireString(manifest.trainId, 'MT_RELEASE_TRAIN_INVALID', 'trainId')
  if (!RELEASE_STATES.has(manifest.state)) {
    fail('MT_RELEASE_LIFECYCLE_INVALID', `state=${manifest.state ?? 'missing'}`)
  }
  requireString(manifest.previousRelease?.tag, 'MT_RELEASE_TRAIN_INVALID', 'previousRelease.tag')
  requireSha(manifest.previousRelease?.commit, 'MT_RELEASE_TRAIN_INVALID', 'previousRelease.commit')
  requireSha(manifest.previousRelease?.bootstrapSha, 'MT_RELEASE_TRAIN_INVALID', 'previousRelease.bootstrapSha')
  requireSha(manifest.previousRelease?.tree, 'MT_RELEASE_TRAIN_INVALID', 'previousRelease.tree')
  if (!SEMVER_PATTERN.test(manifest.computedVersion ?? '')) {
    fail('MT_RELEASE_IDENTITY_MISMATCH', `version=${manifest.computedVersion ?? 'missing'}`)
  }

  validateTransitions(manifest)
  const groups = validateMembership(manifest, workspaceRoot)
  validateCommitAccounting(manifest, groups)
  validateRequiredCheckPolicy(manifest, workspaceRoot)

  if (STRICT_STATES.has(manifest.state)) {
    requireSha(manifest.payloadSha, 'MT_RELEASE_IDENTITY_MISMATCH', 'payloadSha')
    if (manifest.sealSha !== null) {
      fail('MT_RELEASE_SEAL_INVALID', 'sealSha=must-remain-null')
    }
    if (manifest.materials?.status !== 'ready') {
      fail('MT_RELEASE_MATERIALS_INCOMPLETE', `status=${manifest.materials?.status ?? 'missing'}`)
    }
  }
  const expectedTag = `v${manifest.computedVersion}`
  if (tag && tag !== expectedTag) {
    fail('MT_RELEASE_IDENTITY_MISMATCH', `expectedTag=${expectedTag};actualTag=${tag}`)
  }
  if (payload && payload !== 'PAYLOAD_SHA' && payload !== manifest.payloadSha) {
    fail(
      'MT_RELEASE_IDENTITY_MISMATCH',
      `expectedPayload=${manifest.payloadSha ?? 'unset'};actualPayload=${payload}`
    )
  }
  return {
    trainId: manifest.trainId,
    state: manifest.state,
    version: manifest.computedVersion,
    payloadSha: manifest.payloadSha,
    sealSha: manifest.sealSha ?? null,
    itemCounts: Object.fromEntries(
      Object.entries(groups).map(([name, entries]) => [name, entries.length])
    )
  }
}
// END_BLOCK_VALIDATE_TRAIN_MANIFEST

// START_CONTRACT: validateTrainLedger
//   PURPOSE: Keep the Markdown train header synchronized with the machine-readable authority, and prove the current train's ledger carries every admitted item without treating prose as an alternate authority.
//   INPUTS: { markdown: string - human ledger, manifest: object - validated JSON authority, options: object - complete flag for the current train }
//   OUTPUTS: { true - header identities agree and, when complete, every admitted item is present }
//   SIDE_EFFECTS: none; throws ReleaseReadinessError on drift.
//   LINKS: docs/release-trains/README.md; .grace/verification/features.xml V-M-046
// END_CONTRACT: validateTrainLedger
// START_BLOCK_VALIDATE_TRAIN_LEDGER
export const validateTrainLedger = (markdown, manifest, { complete = false } = {}) => {
  const expectations = [
    `| State | ${manifest.state} |`,
    `| Target version / date | ${manifest.computedVersion} / unscheduled |`,
    `| Machine-readable authority | [${manifest.trainId}.json](${manifest.trainId}.json)`
  ]
  const missing = expectations.filter((line) => !markdown.includes(line))
  if (missing.length) {
    fail('MT_RELEASE_LEDGER_DRIFT', `missing=${missing.length}`)
  }
  const hasItemId = (id) => {
    const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    return new RegExp(`(?:^|[^A-Za-z0-9-])${escaped}(?![A-Za-z0-9-])`).test(markdown)
  }
  const missingItems = Object.values(normalizeItems(manifest))
    .flat()
    .map((item) => item.id)
    .filter((id) => !hasItemId(id))
  if (missingItems.length) {
    fail('MT_RELEASE_LEDGER_DRIFT', `missingItems=${missingItems.length}`)
  }
  return true
}
// END_BLOCK_VALIDATE_TRAIN_LEDGER

// START_CONTRACT: validateCurrentTrainPointer
//   PURPOSE: Prove the single current-train pointer names an existing train and that the protocol README names the same train, so the pointer cannot drift from its human entry point.
//   INPUTS: { workspaceRoot: string - repository root }
//   OUTPUTS: { object - resolved current train (trainId, json, markdown) }
//   SIDE_EFFECTS: Reads the pointer, the README, and the train file existence.
//   LINKS: docs/release-trains/current.json; docs/release-trains/README.md; .grace/verification/features.xml V-M-046
// END_CONTRACT: validateCurrentTrainPointer
// START_BLOCK_VALIDATE_CURRENT_TRAIN_POINTER
export const validateCurrentTrainPointer = (workspaceRoot) => {
  const root = resolve(workspaceRoot)
  const current = resolveCurrentTrain(root)
  if (!existsSync(resolve(root, current.json)) || !existsSync(resolve(root, current.markdown))) {
    fail('MT_RELEASE_CURRENT_TRAIN_INVALID', `train=${current.trainId};files=missing`)
  }
  const readme = readFileSync(resolve(root, 'docs/release-trains/README.md'), 'utf8')
  const line = readme.split('\n').find((candidate) => candidate.startsWith('Current train:'))
  if (!line) fail('MT_RELEASE_CURRENT_TRAIN_DRIFT', 'readme=missing')
  if (!line.includes(`[${current.trainId}](${current.trainId}.md)`)) {
    fail('MT_RELEASE_CURRENT_TRAIN_DRIFT', `pointer=${current.trainId};readme=stale`)
  }
  return current
}
// END_BLOCK_VALIDATE_CURRENT_TRAIN_POINTER

// START_CONTRACT: validateProjectFieldCoverage
//   PURPOSE: Prove the source-controlled Project Train single-select offers an option for every checked-in train, so the one-way mirror cannot fail on a missing option.
//   INPUTS: { workspaceRoot: string - repository root }
//   OUTPUTS: { number - checked train document count }
//   SIDE_EFFECTS: Reads the governance config and lists the train directory.
//   LINKS: .github/release-governance.json; .grace/verification/features.xml V-M-046
// END_CONTRACT: validateProjectFieldCoverage
// START_BLOCK_VALIDATE_PROJECT_FIELD_COVERAGE
export const validateProjectFieldCoverage = (workspaceRoot) => {
  const root = resolve(workspaceRoot)
  const config = readJson(resolve(root, GOVERNANCE_CONFIG_PATH))
  const field = (config.project?.fields ?? []).find(({ name }) => name === 'Train')
  if (!field) fail('MT_RELEASE_PROJECT_OPTION_MISSING', 'field=Train;missing')
  const options = new Set((field.options ?? []).map(String))
  const trainIds = readdirSync(resolve(root, 'docs/release-trains'))
    .map((name) => name.match(TRAIN_FILE_PATTERN))
    .filter(Boolean)
    .map((match) => match[0].replace(/\.json$/, ''))
  const missing = trainIds.filter((trainId) => !options.has(trainId)).sort()
  if (missing.length > 0) {
    fail('MT_RELEASE_PROJECT_OPTION_MISSING', `train=${missing[0]}`)
  }
  return trainIds.length
}
// END_BLOCK_VALIDATE_PROJECT_FIELD_COVERAGE

const git = (workspaceRoot, ...args) => {
  try {
    return execFileSync('git', args, {
      cwd: workspaceRoot,
      encoding: 'utf8'
    }).trim()
  } catch (error) {
    fail(
      'MT_RELEASE_GIT_IDENTITY_INVALID',
      `command=${args[0]};status=${error.status ?? 'unknown'}`
    )
  }
}

const validateRequiredChecks = (manifest, checks, payloadSha) => {
  const expected = manifest.requiredChecks ?? []
  if (!Array.isArray(checks)) {
    fail('MT_RELEASE_CHECK_EVIDENCE_MISSING', 'checks=missing')
  }
  for (const requirement of expected) {
    const matches = checks.filter(
      (check) => check.name === requirement.name && check.app === requirement.app
    )
    if (matches.length !== 1) {
      fail('MT_RELEASE_CHECK_EVIDENCE_INVALID', `check=${requirement.name};matches=${matches.length}`)
    }
    const check = matches[0]
    if (check.sha !== payloadSha || check.conclusion !== 'success') {
      fail(
        'MT_RELEASE_CHECK_EVIDENCE_INVALID',
        `check=${requirement.name};sha=${check.sha ?? 'missing'};conclusion=${check.conclusion ?? 'missing'}`
      )
    }
  }
}

// START_CONTRACT: validateSealSpan
//   PURPOSE: Prove the payload-to-seal span is metadata-only, commit by commit, for any number of squash or merge commits.
//   INPUTS: { root: string - repository root, payload: string - payload SHA, seal: string - seal SHA }
//   OUTPUTS: { string[] - paths that differ between payload and seal }
//   SIDE_EFFECTS: Runs read-only git queries.
//   LINKS: .grace/verification/features.xml V-M-046 strict readiness scenarios
// END_CONTRACT: validateSealSpan
// START_BLOCK_VALIDATE_SEAL_SPAN
const validateSealSpan = (root, payload, seal) => {
  const span = git(root, 'rev-list', `${payload}..${seal}`).split('\n').filter(Boolean)
  if (span.length === 0) fail('MT_RELEASE_SEAL_INVALID', 'seal=equals-payload')
  for (const commit of span) {
    // A merge commit is judged by what it brings onto its first parent,
    // i.e. exactly what landed on main.
    const touched = git(root, 'diff', '--name-only', `${commit}^1`, commit).split('\n').filter(Boolean)
    const product = touched.find((pathname) => !isSealPath(pathname))
    if (product) fail('MT_RELEASE_SEAL_PRODUCT_DELTA', `commit=${commit};path=${product}`)
  }
  const sealPaths = git(root, 'diff', '--name-only', payload, seal).split('\n').filter(Boolean)
  const product = sealPaths.find((pathname) => !isSealPath(pathname))
  if (product) fail('MT_RELEASE_SEAL_PRODUCT_DELTA', `path=${product}`)
  return sealPaths
}
// END_BLOCK_VALIDATE_SEAL_SPAN

// START_CONTRACT: validateStrictRepositoryState
//   PURPOSE: Prove the exact classified payload, a metadata-only seal span, fresh screenshot review, required checks, and tag/checkout identity before packaging.
//   INPUTS: { workspaceRoot: string - repository root, manifest: object - validated train, options: object - tag, payload, seal, head, checks }
//   OUTPUTS: { object - strict release identity and accounted commit count }
//   SIDE_EFFECTS: Runs read-only git identity/diff queries and reads the screenshot manifest.
//   LINKS: .grace/verification/features.xml V-M-046 strict readiness scenarios
// END_CONTRACT: validateStrictRepositoryState
// START_BLOCK_VALIDATE_STRICT_REPOSITORY_STATE
export const validateStrictRepositoryState = (
  workspaceRoot,
  manifest,
  { tag, payload, seal, head, checks } = {}
) => {
  const root = resolve(workspaceRoot)
  if (!STRICT_STATES.has(manifest.state)) {
    fail('MT_RELEASE_STATE_NOT_READY', `state=${manifest.state}`)
  }
  if (payload === 'PAYLOAD_SHA') {
    fail('MT_RELEASE_IDENTITY_MISMATCH', 'payload=placeholder')
  }
  requireSha(payload, 'MT_RELEASE_IDENTITY_MISMATCH', 'payload')
  requireSha(seal, 'MT_RELEASE_IDENTITY_MISMATCH', 'seal')
  if (payload !== manifest.payloadSha) {
    fail(
      'MT_RELEASE_IDENTITY_MISMATCH',
      `payload=${payload};manifestPayload=${manifest.payloadSha}`
    )
  }
  const previousTagCommit = git(root, 'rev-parse', `${manifest.previousRelease.tag}^{commit}`)
  if (previousTagCommit !== manifest.previousRelease.commit) {
    fail(
      'MT_RELEASE_PREVIOUS_BOUNDARY_INVALID',
      `tagCommit=${previousTagCommit};recorded=${manifest.previousRelease.commit}`
    )
  }
  const previousTagTree = git(root, 'rev-parse', `${manifest.previousRelease.tag}^{tree}`)
  const bootstrapTree = git(root, 'rev-parse', `${manifest.previousRelease.bootstrapSha}^{tree}`)
  if (
    previousTagTree !== manifest.previousRelease.tree ||
    bootstrapTree !== manifest.previousRelease.tree
  ) {
    fail('MT_RELEASE_PREVIOUS_BOUNDARY_INVALID', 'tree=drift')
  }
  if (git(root, 'merge-base', '--is-ancestor', manifest.previousRelease.bootstrapSha, payload) !== '') {
    fail('MT_RELEASE_PREVIOUS_BOUNDARY_INVALID', 'bootstrap=not-ancestor')
  }
  if (git(root, 'merge-base', '--is-ancestor', payload, seal) !== '') {
    fail('MT_RELEASE_SEAL_INVALID', 'payload=not-ancestor')
  }
  const sealPaths = validateSealSpan(root, payload, seal)

  const expectedCommits = git(
    root,
    'rev-list',
    '--reverse',
    `${manifest.commitAccounting.fromExclusive}..${payload}`
  )
    .split('\n')
    .filter(Boolean)
  const accounted = manifest.commitAccounting.entries.map(({ sha }) => sha)
  if (
    expectedCommits.length !== accounted.length ||
    expectedCommits.some((sha, index) => sha !== accounted[index])
  ) {
    fail(
      'MT_RELEASE_COMMIT_ACCOUNTING_INVALID',
      `git=${expectedCommits.length};manifest=${accounted.length}`
    )
  }

  const expectedTag = `v${manifest.computedVersion}`
  if (tag !== expectedTag) {
    fail('MT_RELEASE_IDENTITY_MISMATCH', `expectedTag=${expectedTag};actualTag=${tag ?? 'missing'}`)
  }
  const tagCommit = git(root, 'rev-parse', `${tag}^{commit}`)
  if (tagCommit !== seal) {
    fail('MT_RELEASE_TAG_TARGET_MISMATCH', `tag=${tagCommit};seal=${seal}`)
  }
  if (head && head !== seal) {
    fail('MT_RELEASE_CHECKOUT_MISMATCH', `head=${head};seal=${seal}`)
  }
  const screenshot = readJson(
    resolve(root, manifest.materials.screenshotManifest)
  )
  if (
    screenshot.payloadSha !== payload ||
    screenshot.captureState !== 'fresh-reviewed'
  ) {
    fail(
      'MT_RELEASE_SCREENSHOT_NOT_FRESH',
      `payload=${screenshot.payloadSha ?? 'missing'};state=${screenshot.captureState ?? 'missing'}`
    )
  }
  validateRequiredChecks(manifest, checks, payload)
  return {
    tag,
    payloadSha: payload,
    sealSha: seal,
    accountedCommits: accounted.length,
    sealPaths
  }
}
// END_BLOCK_VALIDATE_STRICT_REPOSITORY_STATE

// START_CONTRACT: runReleaseReadiness
//   PURPOSE: Execute the repository-only release-train gate and emit stable success evidence.
//   INPUTS: { workspaceRoot: string - repository root, options: object - trainPath, tag, and payload }
//   OUTPUTS: { object - validated train identity }
//   SIDE_EFFECTS: Reads the train manifest, its ledger, the current-train pointer, the protocol README, and the governance config; writes one path-free success marker to stdout.
//   LINKS: .grace/verification/features.xml V-M-046 required-log-markers
// END_CONTRACT: runReleaseReadiness
// START_BLOCK_RUN_RELEASE_READINESS
export const runReleaseReadiness = (workspaceRoot, options = {}) => {
  const current = validateCurrentTrainPointer(workspaceRoot)
  const manifest = readTrainManifest(workspaceRoot, options.trainPath)
  const result = validateTrainManifest(
    manifest,
    { workspaceRoot, tag: options.tag, payload: options.payload }
  )
  const ledgerPath = (options.trainPath ?? resolveCurrentTrain(workspaceRoot).json).replace(
    /\.json$/,
    '.md'
  )
  validateTrainLedger(readFileSync(resolve(workspaceRoot, ledgerPath), 'utf8'), manifest, {
    complete: manifest.trainId === current.trainId
  })
  validateProjectFieldCoverage(workspaceRoot)
  const strict = options.mode === 'strict'
    ? validateStrictRepositoryState(workspaceRoot, manifest, options)
    : null
  console.info(
    `[ReleaseReadiness][validateTrain][${strict ? 'BLOCK_RELEASE_READINESS_CONFIRMED' : 'BLOCK_RELEASE_TRAIN_VALID'}] train=${result.trainId} state=${result.state} version=${result.version} userFacing=${result.itemCounts.userFacing}`
  )
  return { ...result, strict }
}
// END_BLOCK_RUN_RELEASE_READINESS

const optionValue = (args, name) => {
  const index = args.indexOf(name)
  if (index === -1) return undefined
  const value = args[index + 1]
  if (!value || value.startsWith('--')) fail('MT_RELEASE_ARGUMENT_INVALID', `${name}=missing`)
  return value
}

const main = () => {
  try {
    const args = process.argv.slice(2)
    runReleaseReadiness(process.cwd(), {
      trainPath: optionValue(args, '--train'),
      tag: optionValue(args, '--tag'),
      payload: optionValue(args, '--payload'),
      seal: optionValue(args, '--seal'),
      head: optionValue(args, '--head'),
      mode: optionValue(args, '--mode'),
      checks: (() => {
        const checksPath = optionValue(args, '--checks-file')
        return checksPath ? readJson(resolve(checksPath)) : undefined
      })()
    })
  } catch (error) {
    const code = error?.code ?? 'MT_RELEASE_TRAIN_INVALID'
    console.error(
      `[ReleaseReadiness][validateTrain][BLOCK_RELEASE_TRAIN_REJECTED] code=${code} ${error.message}`
    )
    process.exitCode = 1
  }
}

const invokedPath = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : ''
if (import.meta.url === invokedPath) main()
