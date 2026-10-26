// FILE: tools/release-governance.mjs
// VERSION: 2.1.0
// START_MODULE_CONTRACT
//   PURPOSE: Enforce stable ordinary-PR release governance without requiring a frozen train or any privileged GitHub API mutation.
//   SCOPE: Conventional PR title classification, immutable action pins, source-controlled control and public Project schema, and current-train validation.
//   DEPENDS: Node.js fs/path/url; release-readiness; GitHub workflow/config files.
//   LINKS: .grace/graph/features.xml M-046; .grace/verification/features.xml V-M-046.
//   ROLE: SCRIPT
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   ReleaseGovernanceError - Stable coded ordinary-governance error.
//   validateConventionalTitle - Classify a PR title/body and enforce explicit admission for every release-bearing change.
//   validatePreparationOverlap - Reject a release-bearing merge while a train is Preparing or Frozen.
//   validatePinnedActions - Require immutable full-SHA action references in privileged workflows.
//   validateGovernanceConfig - Validate the source-controlled Environment/ruleset/default-permission contract.
//   runReleaseGovernance - Run the stable ordinary gate and emit its success marker.
//   CONVENTIONAL - Accepted squash-title grammar for release classification.
//   RELEASE_VISIBLE_LABELS - Labels that explicitly admit user-facing or operational change.
//   RELEASE_BEARING_TYPES - Conventional types that create a SemVer release.
//   PAYLOAD_OPEN_STATES - Train states whose payload is still being pinned.
//   fail - Raise one stable governance error.
//   readJson - Read one JSON authority.
//   main - Run the command-line interface.
//   invokedPath - Detect direct command-line execution.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   - 2026-10-26 v2.1.0: C-RELEASE-MANUAL-PUBLISH — expect the synchronous release approval Environment back (owner reviewer) instead of the C-RELEASE-TIMING release-notify boundary; the release Environment carries no secrets.
//   - 2026-10-24 v2.0.0: C-RELEASE-CONVEYOR — remove the Release Please preparation boundary (preparation is a normal reviewed PR); admit release-bearing merges while the train is Ready, because the tag binds to the merged seal, not to main's tip.
//   - 2026-10-24 v1.3.0: C-RELEASE-TIMING — expect the release-notify Environment (timer-window Telegram ping boundary) instead of the retired synchronous release approval Environment, and require its secret boundary.
//   - 2026-10-20 v1.2.0: classify perf/revert as patch releases and reject unmarked BREAKING CHANGE trailers or unadmitted release-bearing work.
//   - 2026-10-20 v1.1.0: validate the public one-way GitHub Project mirror contract as part of ordinary governance.
//   - 2026-10-20 v1.0.0: add Conventional Commit, PR-only preparation, immutable-action, and source-control governance checks.
// END_CHANGE_SUMMARY

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { readTrainManifest, validateTrainManifest } from './release-readiness.mjs'

const CONVENTIONAL = /^(feat|fix|perf|revert|docs|test|ci|chore|build|style|refactor)(?:\(([^)]+)\))?(!)?: (.+)$/
const RELEASE_VISIBLE_LABELS = new Set(['release:user-facing', 'release:operational'])
const RELEASE_BEARING_TYPES = new Set(['feat', 'fix', 'perf', 'revert'])

export class ReleaseGovernanceError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'ReleaseGovernanceError'
    this.code = code
  }
}

const fail = (code, message) => {
  throw new ReleaseGovernanceError(code, message)
}

const readJson = (pathname) => JSON.parse(readFileSync(pathname, 'utf8'))

// START_CONTRACT: validateConventionalTitle
//   PURPOSE: Classify one squash-merge title into standard SemVer intent and keep feat/fix/breaking changes explicitly admitted.
//   INPUTS: { title: string - pull-request title, labels: string[] - public label names, body: string - pull-request body }
//   OUTPUTS: { object - type, scope, breaking, and bump classification }
//   SIDE_EFFECTS: none.
//   LINKS: docs/release-trains/README.md
// END_CONTRACT: validateConventionalTitle
// START_BLOCK_VALIDATE_CONVENTIONAL_TITLE
export const validateConventionalTitle = (title, labels = [], body = '') => {
  const match = CONVENTIONAL.exec(title ?? '')
  if (!match) fail('MT_RELEASE_CONVENTIONAL_TITLE_INVALID', 'title=unclassified')
  const [, type, scope = null, bang, subject] = match
  if (!subject.trim()) fail('MT_RELEASE_CONVENTIONAL_TITLE_INVALID', 'subject=missing')
  const bodyBreaking = /^BREAKING(?:-| )CHANGE:\s*\S/im.test(body)
  if (bodyBreaking && !bang) {
    fail('MT_RELEASE_BREAKING_MARKER_INVALID', 'bodyTrailer=requires-title-bang')
  }
  const breaking = Boolean(bang)
  if ((RELEASE_BEARING_TYPES.has(type) || breaking) && !labels.some((label) => RELEASE_VISIBLE_LABELS.has(label))) {
    fail('MT_RELEASE_CONVENTIONAL_ADMISSION_MISSING', `type=${type};breaking=${breaking}`)
  }
  const bump = breaking
    ? 'major'
    : type === 'feat'
      ? 'minor'
      : RELEASE_BEARING_TYPES.has(type)
        ? 'patch'
        : 'none'
  return { type, scope, breaking, bump, subject }
}
// END_BLOCK_VALIDATE_CONVENTIONAL_TITLE

// A Ready seal is already on main and the tag binds to it, so later
// merges cannot enter the candidate; only the Preparing/Frozen windows,
// whose payload is still being pinned, must stay closed.
const PAYLOAD_OPEN_STATES = new Set(['Preparing', 'Frozen'])

export const validatePreparationOverlap = (title, state) => {
  if (
    title &&
    (RELEASE_BEARING_TYPES.has(title.type) || title.breaking) &&
    PAYLOAD_OPEN_STATES.has(state)
  ) {
    fail('MT_RELEASE_PREPARATION_OVERLAP', `state=${state};type=${title.type}`)
  }
  return true
}

// START_CONTRACT: validatePinnedActions
//   PURPOSE: Reject tag-like or branch-like action references from workflows that touch release preparation or control boundaries.
//   INPUTS: { workflows: Record<string,string> - filename to YAML source }
//   OUTPUTS: { number - verified action reference count }
//   SIDE_EFFECTS: none.
//   LINKS: .github/workflows/promote-release.yml; .github/workflows/release.yml; .github/workflows/release-governance.yml
// END_CONTRACT: validatePinnedActions
// START_BLOCK_VALIDATE_PINNED_ACTIONS
export const validatePinnedActions = (workflows) => {
  let count = 0
  for (const [name, source] of Object.entries(workflows)) {
    for (const match of source.matchAll(/^\s*uses:\s*([^\s#]+)(?:\s*#.*)?$/gm)) {
      count += 1
      const ref = match[1].split('@')[1]
      if (!/^[0-9a-f]{40}$/.test(ref ?? '')) {
        fail('MT_RELEASE_ACTION_UNPINNED', `workflow=${name};action=${match[1].split('@')[0]}`)
      }
    }
  }
  if (count === 0) fail('MT_RELEASE_ACTION_UNPINNED', 'actions=missing')
  return count
}
// END_BLOCK_VALIDATE_PINNED_ACTIONS

// START_CONTRACT: validateGovernanceConfig
//   PURPOSE: Validate stable managed names and safe evaluate-mode defaults before any GitHub control apply.
//   INPUTS: { config: object - checked-in governance configuration }
//   OUTPUTS: { object - managed environment/ruleset counts }
//   SIDE_EFFECTS: none.
//   LINKS: .github/release-governance.json
// END_CONTRACT: validateGovernanceConfig
// START_BLOCK_VALIDATE_GOVERNANCE_CONFIG
export const validateGovernanceConfig = (config) => {
  if (config.schemaVersion !== '1.0.0' || config.repository !== 'xronocode/mark') {
    fail('MT_RELEASE_GOVERNANCE_CONFIG_INVALID', 'identity=mismatch')
  }
  if (config.actions?.defaultWorkflowPermissions !== 'read') {
    fail('MT_RELEASE_GOVERNANCE_CONFIG_INVALID', 'actions.defaultWorkflowPermissions!=read')
  }
  for (const name of ['release-authorize', 'release-signing', 'release', 'release-cask']) {
    if (!config.environments?.[name]) {
      fail('MT_RELEASE_GOVERNANCE_CONFIG_INVALID', `environment=${name};missing`)
    }
  }
  if (config.environments.release.preventSelfReview !== false) {
    fail('MT_RELEASE_GOVERNANCE_CONFIG_INVALID', 'release.preventSelfReview!=false')
  }
  for (const name of ['main', 'releaseTags']) {
    const ruleset = config.rulesets?.[name]
    if (!ruleset || ruleset.enforcement !== config.rulesetActivation?.stagedEnforcement) {
      fail('MT_RELEASE_GOVERNANCE_CONFIG_INVALID', `ruleset=${name};enforcement=unsafe`)
    }
    if (!(ruleset.blockDelete || ruleset.restrictDelete) || !ruleset.bypassActors?.length) {
      fail('MT_RELEASE_GOVERNANCE_CONFIG_INVALID', `ruleset=${name};recovery=missing`)
    }
  }
  if (
    config.rulesetActivation?.stagedEnforcement !== 'disabled' ||
    config.rulesetActivation?.activeEnforcement !== 'active' ||
    config.rulesetActivation?.requiresOwnerConfirmation !== true ||
    config.rulesetActivation?.requiresLiveCheckCanary !== true
  ) {
    fail('MT_RELEASE_GOVERNANCE_CONFIG_INVALID', 'rulesetActivation=invalid')
  }
  const mainChecks = config.rulesets.main.requiredChecks?.map(({ context }) => context) ?? []
  if (!mainChecks.includes('status check') || !mainChecks.includes('release/governance')) {
    fail('MT_RELEASE_GOVERNANCE_CONFIG_INVALID', 'ruleset.main.checks=invalid')
  }
  const secretBoundaries = config.secretBoundaries
  for (const name of ['release-authorize', 'release-signing', 'release-cask', 'forbiddenAtRepository']) {
    if (!Array.isArray(secretBoundaries?.[name]) || secretBoundaries[name].length === 0) {
      fail('MT_RELEASE_GOVERNANCE_CONFIG_INVALID', `secretBoundary=${name};missing`)
    }
  }
  const project = config.project
  const expectedFields = [
    'Train',
    'Admission',
    'Owner acceptance',
    'Payload SHA',
    'Release state',
    'Item ID',
    'Evidence URL'
  ]
  const projectUnbound = project?.number === null && project?.nodeId === null
  const projectBound = Number.isInteger(project?.number) && /^PVT_/.test(project?.nodeId ?? '')
  if (
    project?.ownerType !== 'user' ||
    project.owner !== 'xronocode' ||
    project.public !== true ||
    (!projectUnbound && !projectBound)
  ) {
    fail('MT_RELEASE_GOVERNANCE_CONFIG_INVALID', 'project=unsafe-or-prebound')
  }
  if (JSON.stringify(project.fields?.map(({ name }) => name)) !== JSON.stringify(expectedFields)) {
    fail('MT_RELEASE_GOVERNANCE_CONFIG_INVALID', 'project.fields=mismatch')
  }
  return {
    environments: Object.keys(config.environments).length,
    rulesets: Object.keys(config.rulesets).length,
    projectFields: project.fields.length
  }
}
// END_BLOCK_VALIDATE_GOVERNANCE_CONFIG

// START_CONTRACT: runReleaseGovernance
//   PURPOSE: Execute stable ordinary release governance for pull requests and main without requiring a frozen train.
//   INPUTS: { workspaceRoot: string - repository root, options: object - optional PR title and labels }
//   OUTPUTS: { object - validated title and control counts }
//   SIDE_EFFECTS: Reads public repository files and writes one path-free success marker to stdout.
//   LINKS: .grace/verification/features.xml V-M-046 required-log-markers
// END_CONTRACT: runReleaseGovernance
// START_BLOCK_RUN_RELEASE_GOVERNANCE
export const runReleaseGovernance = (workspaceRoot, options = {}) => {
  const root = resolve(workspaceRoot)
  const releaseWorkflow = readFileSync(resolve(root, '.github/workflows/release.yml'), 'utf8')
  const promoteWorkflow = readFileSync(resolve(root, '.github/workflows/promote-release.yml'), 'utf8')
  const governanceWorkflow = readFileSync(resolve(root, '.github/workflows/release-governance.yml'), 'utf8')
  const governance = validateGovernanceConfig(
    readJson(resolve(root, '.github/release-governance.json'))
  )
  const actions = validatePinnedActions({
    'release.yml': releaseWorkflow,
    'promote-release.yml': promoteWorkflow,
    'release-governance.yml': governanceWorkflow
  })
  validateTrainManifest(readTrainManifest(root), { workspaceRoot: root })
  const title = options.title
    ? validateConventionalTitle(options.title, options.labels ?? [], options.body ?? '')
    : null
  const train = readTrainManifest(root)
  validatePreparationOverlap(title, train.state)
  console.info(
    `[ReleaseGovernance][validate][BLOCK_RELEASE_GOVERNANCE_CONFIRMED] title=${title?.type ?? 'not-requested'} actions=${actions} environments=${governance.environments} rulesets=${governance.rulesets} projectFields=${governance.projectFields}`
  )
  return { title, actions, ...governance }
}
// END_BLOCK_RUN_RELEASE_GOVERNANCE

const main = () => {
  try {
    const labels = process.env.PR_LABELS_JSON
      ? JSON.parse(process.env.PR_LABELS_JSON)
      : []
    runReleaseGovernance(process.cwd(), {
      title: process.env.PR_TITLE || undefined,
      labels,
      body: process.env.PR_BODY || ''
    })
  } catch (error) {
    const code = error?.code ?? 'MT_RELEASE_GOVERNANCE_INVALID'
    console.error(`[ReleaseGovernance][validate][BLOCK_RELEASE_GOVERNANCE_REJECTED] code=${code} ${error.message}`)
    process.exitCode = 1
  }
}

const invokedPath = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : ''
if (import.meta.url === invokedPath) main()
