// FILE: tools/release-github-controls.mjs
// VERSION: 1.2.0
// START_MODULE_CONTRACT
//   PURPOSE: Reconcile Mark's source-controlled release permissions, Environments, immutable-release setting, and managed rulesets from an explicit owner-admin session.
//   SCOPE: Offline dry-run, staged/active live checks, staged non-destructive apply, explicit activation with snapshot/journal/read-back, and reverse-order rollback of managed operations; never reads or copies secret values.
//   DEPENDS: Node.js child_process/crypto/fs/path/url; GitHub REST API; .github/release-governance.json.
//   LINKS: .grace/graph/features.xml M-046; .grace/verification/features.xml V-M-046.
//   ROLE: SCRIPT
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   ReleaseGithubControlsError - Stable coded control-plane error.
//   buildDesiredControls - Resolve the declarative configuration into staged or explicitly activated API payloads.
//   planGithubControls - Produce ordered managed-resource mutations without deleting unknown resources.
//   buildRollbackPlan - Reverse a journal into out-of-band recovery operations.
//   GitHubControlsClient - Read, mutate, and read back GitHub repository controls with bounded retries.
//   reconcileGithubControls - Run dry-run/check/apply/activation and prove convergence after each mutation.
//   createControlJournalHeader - Bind an exclusive journal to repository, config, and pre-mutation snapshot.
//   createControlJournalRecord - Extend the tamper-evident operation hash chain.
//   parseControlJournal - Validate a complete journal header, identity, and hash chain.
//   API_VERSION - GitHub REST API version used for all managed control-plane calls.
//   fail - Raise one stable release-control error.
//   stable - Recursively normalize object key order for deterministic comparison.
//   canonical - Serialize normalized data for comparison and hashing.
//   digest - Compute the SHA-256 identity of normalized evidence.
//   same - Compare two values by canonical representation.
//   sleep - Delay bounded retry attempts.
//   withRecordHash - Add the canonical digest of one journal record payload.
//   immutableReleasesEnabled - Parse the immutable-release response without object truthiness.
//   environmentFingerprint - Reduce an Environment to its managed public settings.
//   rulesetPayload - Resolve one declarative ruleset into a GitHub API payload.
//   normalizeRuleset - Reduce one live ruleset to its managed comparison shape.
//   managedOperationValue - Read one operation's normalized managed value from a live snapshot.
//   emptyActual - Build the absent-resource baseline for offline planning.
//   optionValue - Read one named command-line option.
//   ownerToken - Resolve the owner-local token without persisting it.
//   assertLocalMutation - Reject CI and unconfirmed control-plane mutation.
//   main - Run the command-line interface.
//   invokedPath - Detect direct command-line execution.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   - 2026-10-21 v1.2.0: execute activation mutations and add an explicit active-state read-back mode instead of reporting an unapplied plan as success.
//   - 2026-10-20 v1.1.1: synchronize MODULE_MAP with the journal record hash helper.
//   - 2026-10-20 v1.1.0: stop retrying uncertain mutations, parse immutable-release state exactly, and add snapshot-bound hash-chained journal primitives.
//   - 2026-10-20 v1.0.0: add owner-local dry-run/read-back/apply/rollback for release controls with immutable-release support and no secret-value migration.
// END_CHANGE_SUMMARY

import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { isAbsolute, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const API_VERSION = '2026-03-10'

export class ReleaseGithubControlsError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'ReleaseGithubControlsError'
    this.code = code
  }
}

const fail = (code, message) => {
  throw new ReleaseGithubControlsError(code, message)
}

const stable = (value) => {
  if (Array.isArray(value)) return value.map(stable)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, stable(value[key])])
    )
  }
  return value
}
const canonical = (value) => JSON.stringify(stable(value))
const digest = (value) => createHash('sha256').update(canonical(value)).digest('hex')
const same = (left, right) => canonical(left) === canonical(right)
const sleep = (milliseconds) => new Promise((done) => setTimeout(done, milliseconds))
export const immutableReleasesEnabled = (response) => response?.enabled === true

const withRecordHash = (record) => ({ ...record, recordHash: digest(record) })

export const createControlJournalHeader = ({ repository, config, snapshot, createdAt }) =>
  withRecordHash({
    kind: 'header',
    schemaVersion: '1.0.0',
    repository,
    configDigest: digest(config),
    snapshotDigest: digest(snapshot),
    createdAt,
    previousHash: null
  })

export const createControlJournalRecord = ({ entry, sequence, previousHash, appliedAt }) =>
  withRecordHash({
    kind: 'operation',
    sequence,
    previousHash,
    appliedAt,
    ...entry
  })

export const parseControlJournal = (source, { repository, config, snapshot }) => {
  const records = source.trim().split('\n').filter(Boolean).map((line) => {
    try {
      return JSON.parse(line)
    } catch {
      fail('MT_RELEASE_CONTROLS_JOURNAL_INVALID', 'json=invalid')
    }
  })
  const [header, ...entries] = records
  if (
    header?.kind !== 'header' ||
    header.schemaVersion !== '1.0.0' ||
    header.repository !== repository ||
    header.configDigest !== digest(config) ||
    header.snapshotDigest !== digest(snapshot) ||
    header.previousHash !== null
  ) {
    fail('MT_RELEASE_CONTROLS_JOURNAL_INVALID', 'header=mismatch')
  }
  const { recordHash: headerHash, ...headerPayload } = header
  if (headerHash !== digest(headerPayload)) {
    fail('MT_RELEASE_CONTROLS_JOURNAL_INVALID', 'headerHash=mismatch')
  }
  let previousHash = headerHash
  const allowed = new Set([
    'set-actions',
    'enable-immutable-releases',
    'upsert-environment',
    'create-ruleset',
    'update-ruleset'
  ])
  for (const [index, entry] of entries.entries()) {
    const { recordHash, ...payload } = entry
    if (
      entry.kind !== 'operation' ||
      entry.sequence !== index + 1 ||
      entry.previousHash !== previousHash ||
      !allowed.has(entry.type) ||
      recordHash !== digest(payload)
    ) {
      fail('MT_RELEASE_CONTROLS_JOURNAL_INVALID', `record=${index + 1}`)
    }
    previousHash = recordHash
  }
  return { header, entries }
}

const environmentFingerprint = (environment) => ({
  reviewers: [...environment.reviewers].sort(),
  preventSelfReview: environment.preventSelfReview,
  protectedBranches: environment.protectedBranches,
  policies: environment.policies
    .map(({ name, type }) => ({ name, type }))
    .sort((left, right) => `${left.type}:${left.name}`.localeCompare(`${right.type}:${right.name}`))
})

const rulesetPayload = (config, identities) => {
  const bypass_actors = config.bypassActors.map((actor) => {
    const actor_id = actor.actorType === 'User'
      ? identities.users[actor.login]
      : identities.apps[actor.appSlug]
    if (!Number.isInteger(actor_id)) {
      fail('MT_RELEASE_CONTROLS_IDENTITY_MISSING', `actor=${actor.label}`)
    }
    return {
      actor_id,
      actor_type: actor.actorType,
      bypass_mode: actor.bypassMode
    }
  })
  const rules = []
  if (config.blockDelete || config.restrictDelete) rules.push({ type: 'deletion' })
  if (config.blockForcePush) rules.push({ type: 'non_fast_forward' })
  if (config.restrictCreate) rules.push({ type: 'creation' })
  if (config.restrictUpdate) rules.push({ type: 'update' })
  if (config.requirePullRequest) {
    rules.push({
      type: 'pull_request',
      parameters: {
        required_approving_review_count: 0,
        dismiss_stale_reviews_on_push: false,
        require_code_owner_review: false,
        require_last_push_approval: false,
        required_review_thread_resolution: true
      }
    })
  }
  if (config.requiredChecks?.length) {
    rules.push({
      type: 'required_status_checks',
      parameters: {
        strict_required_status_checks_policy: true,
        do_not_enforce_on_create: false,
        required_status_checks: config.requiredChecks.map((check) => {
          const integration_id = identities.apps[check.integrationSlug]
          if (!Number.isInteger(integration_id)) {
            fail('MT_RELEASE_CONTROLS_IDENTITY_MISSING', `app=${check.integrationSlug}`)
          }
          return { context: check.context, integration_id }
        })
      }
    })
  }
  return {
    name: config.name,
    target: config.target,
    enforcement: config.enforcement,
    bypass_actors,
    conditions: { ref_name: { include: config.include, exclude: [] } },
    rules
  }
}

const normalizeRuleset = (ruleset) => ({
  name: ruleset.name,
  target: ruleset.target,
  enforcement: ruleset.enforcement,
  bypass_actors: (ruleset.bypass_actors ?? [])
    .map(({ actor_id, actor_type, bypass_mode }) => ({ actor_id, actor_type, bypass_mode }))
    .sort((left, right) => `${left.actor_type}:${left.actor_id}`.localeCompare(`${right.actor_type}:${right.actor_id}`)),
  conditions: { ref_name: ruleset.conditions?.ref_name ?? { include: [], exclude: [] } },
  rules: (ruleset.rules ?? []).map((rule) => {
    if (rule.type === 'required_status_checks') {
      return {
        type: rule.type,
        parameters: {
          strict_required_status_checks_policy: rule.parameters.strict_required_status_checks_policy,
          do_not_enforce_on_create: rule.parameters.do_not_enforce_on_create ?? false,
          required_status_checks: rule.parameters.required_status_checks
            .map(({ context, integration_id }) => ({ context, integration_id }))
            .sort((left, right) => left.context.localeCompare(right.context))
        }
      }
    }
    if (rule.type === 'pull_request') {
      return {
        type: rule.type,
        parameters: {
          required_approving_review_count: rule.parameters.required_approving_review_count,
          dismiss_stale_reviews_on_push: rule.parameters.dismiss_stale_reviews_on_push,
          require_code_owner_review: rule.parameters.require_code_owner_review,
          require_last_push_approval: rule.parameters.require_last_push_approval,
          required_review_thread_resolution: rule.parameters.required_review_thread_resolution
        }
      }
    }
    return { type: rule.type }
  }).sort((left, right) => left.type.localeCompare(right.type))
})

const managedOperationValue = (operation, snapshot) => {
  if (operation.type === 'set-actions') return snapshot.actions
  if (operation.type === 'enable-immutable-releases') return snapshot.immutableReleases
  if (operation.type === 'upsert-environment') {
    const environment = snapshot.environments[operation.name]
    return environment ? environmentFingerprint(environment) : null
  }
  if (operation.type === 'create-ruleset' || operation.type === 'update-ruleset') {
    const ruleset = snapshot.rulesets[operation.key]
    return ruleset?.payload ? normalizeRuleset(ruleset.payload) : null
  }
  fail('MT_RELEASE_CONTROLS_APPLY_FAILED', `operation=${operation.type}`)
}

// START_CONTRACT: buildDesiredControls
//   PURPOSE: Resolve source-controlled names into normalized environment and ruleset payloads with explicit actor/App identities.
//   INPUTS: { config: object - governance contract, identities: object - GitHub user/App numeric IDs }
//   OUTPUTS: { object - normalized desired control state }
//   SIDE_EFFECTS: none.
//   LINKS: .github/release-governance.json
// END_CONTRACT: buildDesiredControls
// START_BLOCK_BUILD_DESIRED_CONTROLS
export const buildDesiredControls = (config, identities, { activate = false } = {}) => {
  const environments = Object.fromEntries(
    Object.entries(config.environments).map(([name, environment]) => [
      name,
      {
        reviewers: environment.requiredReviewers,
        preventSelfReview: environment.preventSelfReview,
        protectedBranches: environment.deploymentBranches.protectedBranches,
        policies: environment.deploymentBranches.custom.map((policy) =>
          typeof policy === 'string' ? { name: policy, type: 'branch' } : policy
        )
      }
    ])
  )
  const rulesets = Object.fromEntries(
    Object.entries(config.rulesets).map(([key, ruleset]) => [
      key,
      {
        id: null,
        payload: rulesetPayload(
          activate
            ? { ...ruleset, enforcement: config.rulesetActivation.activeEnforcement }
            : ruleset,
          identities
        )
      }
    ])
  )
  return {
    repository: config.repository,
    actions: {
      defaultWorkflowPermissions: config.actions.defaultWorkflowPermissions,
      canApprovePullRequestReviews: config.actions.canApprovePullRequestReviews
    },
    immutableReleases: config.immutableReleases.enabled,
    environments,
    rulesets
  }
}
// END_BLOCK_BUILD_DESIRED_CONTROLS

const emptyActual = (desired) => ({
  actions: null,
  immutableReleases: false,
  environments: Object.fromEntries(Object.keys(desired.environments).map((name) => [name, null])),
  rulesets: Object.fromEntries(Object.keys(desired.rulesets).map((name) => [name, null]))
})

// START_CONTRACT: planGithubControls
//   PURPOSE: Diff only managed resources and reject unknown custom policy drift instead of deleting it.
//   INPUTS: { desired: object - normalized contract, actual: object - normalized live snapshot }
//   OUTPUTS: { object[] - ordered, non-destructive managed mutations }
//   SIDE_EFFECTS: none.
//   LINKS: .grace/verification/features.xml V-M-046 control-plane scenarios
// END_CONTRACT: planGithubControls
// START_BLOCK_PLAN_GITHUB_CONTROLS
export const planGithubControls = (desired, actual) => {
  const operations = []
  if (!same(desired.actions, actual.actions)) {
    operations.push({ type: 'set-actions', before: actual.actions, after: desired.actions })
  }
  if (desired.immutableReleases && actual.immutableReleases !== true) {
    operations.push({ type: 'enable-immutable-releases', before: false, after: true })
  }
  for (const [name, expected] of Object.entries(desired.environments)) {
    const current = actual.environments[name]
    if (current) {
      const expectedPolicies = new Set(expected.policies.map(({ name: policyName, type }) => `${type}:${policyName}`))
      const unknown = current.policies.filter(({ name: policyName, type }) => !expectedPolicies.has(`${type}:${policyName}`))
      if (unknown.length) {
        fail('MT_RELEASE_CONTROLS_UNKNOWN_POLICY', `environment=${name};policy=${unknown[0].type}:${unknown[0].name}`)
      }
    }
    if (!current || !same(environmentFingerprint(expected), environmentFingerprint(current))) {
      operations.push({ type: 'upsert-environment', name, before: current, after: expected })
    }
  }
  for (const [key, expected] of Object.entries(desired.rulesets)) {
    const current = actual.rulesets[key]
    const normalizedExpected = normalizeRuleset(expected.payload)
    if (!current) {
      operations.push({ type: 'create-ruleset', key, before: null, after: expected.payload })
    } else if (current.payload.target !== expected.payload.target) {
      fail('MT_RELEASE_CONTROLS_RULESET_TARGET_MISMATCH', `ruleset=${key}`)
    } else if (!same(normalizedExpected, normalizeRuleset(current.payload))) {
      operations.push({ type: 'update-ruleset', key, id: current.id, before: current.payload, after: expected.payload })
    }
  }
  return operations
}
// END_BLOCK_PLAN_GITHUB_CONTROLS

// START_CONTRACT: buildRollbackPlan
//   PURPOSE: Reverse a successful managed-operation journal without deleting unknown resources or retargeting release refs.
//   INPUTS: { journal: object[] - applied operations with before/after state }
//   OUTPUTS: { object[] - reverse ordered restore/disable operations }
//   SIDE_EFFECTS: none.
//   LINKS: docs/release-trains/README.md recovery protocol
// END_CONTRACT: buildRollbackPlan
export const buildRollbackPlan = (journal) => journal
  .slice()
  .reverse()
  .map((entry) => {
    const evidence = {
      originalType: entry.type,
      key: entry.key,
      name: entry.name,
      expectedBefore: entry.before,
      expectedAfter: entry.after,
      beforeDigest: entry.beforeDigest,
      afterDigest: entry.afterDigest
    }
    if (entry.type === 'create-ruleset') {
      return { ...evidence, type: 'delete-ruleset', id: entry.resourceId }
    }
    if (entry.type === 'enable-immutable-releases' && entry.before === false) {
      return { ...evidence, type: 'disable-immutable-releases' }
    }
    if (entry.type === 'upsert-environment' && entry.before == null) {
      return { ...evidence, type: 'delete-environment' }
    }
    return { ...evidence, id: entry.id, type: `restore-${entry.type}`, after: entry.before }
  })

export class GitHubControlsClient {
  constructor({ token, repository, fetchImpl = fetch }) {
    if (!token) fail('MT_RELEASE_CONTROLS_TOKEN_MISSING', 'token=missing')
    this.token = token
    this.repository = repository
    this.fetchImpl = fetchImpl
  }

  async request(pathname, { method = 'GET', body, allow404 = false } = {}) {
    let lastError
    const attempts = ['GET', 'HEAD'].includes(method) ? 3 : 1
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        const response = await this.fetchImpl(`https://api.github.com${pathname}`, {
          method,
          headers: {
            accept: 'application/vnd.github+json',
            authorization: `Bearer ${this.token}`,
            'content-type': 'application/json',
            'x-github-api-version': API_VERSION
          },
          body: body === undefined ? undefined : JSON.stringify(body)
        })
        if (allow404 && response.status === 404) return null
        if (!response.ok) throw new Error(`http-${response.status}`)
        return response.status === 204 ? null : await response.json()
      } catch (error) {
        lastError = error
        if (attempt < attempts) await sleep(100 * 2 ** (attempt - 1))
      }
    }
    if (attempts === 1) {
      fail(
        'MT_RELEASE_CONTROLS_MUTATION_UNCERTAIN',
        `method=${method};path=${pathname};reason=${lastError?.message ?? 'unknown'}`
      )
    }
    fail('MT_RELEASE_CONTROLS_API_FAILED', `path=${pathname};reason=${lastError?.message ?? 'unknown'}`)
  }

  async resolveIdentities(config) {
    const users = new Set()
    const apps = new Set()
    for (const environment of Object.values(config.environments)) {
      for (const login of environment.requiredReviewers) users.add(login)
    }
    for (const ruleset of Object.values(config.rulesets)) {
      for (const actor of ruleset.bypassActors) {
        if (actor.login) users.add(actor.login)
        if (actor.appSlug) apps.add(actor.appSlug)
      }
      for (const check of ruleset.requiredChecks ?? []) apps.add(check.integrationSlug)
    }
    const identities = { users: {}, apps: {} }
    for (const login of users) identities.users[login] = (await this.request(`/users/${login}`)).id
    for (const slug of apps) {
      const app = await this.request(`/apps/${slug}`, { allow404: true })
      if (!app) fail('MT_RELEASE_CONTROLS_APP_NOT_INSTALLED', `app=${slug}`)
      identities.apps[slug] = app.id
    }
    return identities
  }

  async validateActivationPrerequisites(config) {
    const base = `/repos/${this.repository}`
    const repository = await this.request(base)
    const repositorySecrets = await this.request(`${base}/actions/secrets?per_page=100`)
    const repositoryNames = new Set((repositorySecrets.secrets ?? []).map(({ name }) => name))
    for (const forbidden of config.secretBoundaries.forbiddenAtRepository) {
      if (repositoryNames.has(forbidden)) {
        fail('MT_RELEASE_CONTROLS_SECRET_BOUNDARY_INVALID', `repositorySecret=${forbidden}`)
      }
    }
    for (const environment of ['release-authorize', 'release-signing', 'release-cask']) {
      const response = await this.request(
        `/repositories/${repository.id}/environments/${encodeURIComponent(environment)}/secrets?per_page=100`
      )
      const names = new Set((response.secrets ?? []).map(({ name }) => name))
      for (const required of config.secretBoundaries[environment]) {
        if (!names.has(required)) {
          fail(
            'MT_RELEASE_CONTROLS_SECRET_BOUNDARY_INVALID',
            `environment=${environment};secret=${required};missing=true`
          )
        }
      }
    }
    const checkRuns = await this.request(`${base}/commits/main/check-runs?per_page=100`)
    for (const required of config.strictRequiredChecks) {
      const matches = (checkRuns.check_runs ?? []).filter(
        (check) => check.name === required.name && check.app?.name === required.app
      )
      if (matches.length !== 1 || matches[0].conclusion !== 'success') {
        fail('MT_RELEASE_CONTROLS_CHECK_CANARY_INVALID', `check=${required.name};matches=${matches.length}`)
      }
    }
    return true
  }

  async read(desired) {
    const base = `/repos/${this.repository}`
    const actionsRaw = await this.request(`${base}/actions/permissions/workflow`)
    const actions = {
      defaultWorkflowPermissions: actionsRaw.default_workflow_permissions,
      canApprovePullRequestReviews: actionsRaw.can_approve_pull_request_reviews
    }
    const immutableReleases = immutableReleasesEnabled(
      await this.request(`${base}/immutable-releases`, { allow404: true })
    )
    const environments = {}
    for (const name of Object.keys(desired.environments)) {
      const encoded = encodeURIComponent(name)
      const raw = await this.request(`${base}/environments/${encoded}`, { allow404: true })
      if (!raw) {
        environments[name] = null
        continue
      }
      const review = raw.protection_rules?.find(({ type }) => type === 'required_reviewers')
      let policies = []
      if (raw.deployment_branch_policy?.custom_branch_policies) {
        const response = await this.request(`${base}/environments/${encoded}/deployment-branch-policies?per_page=100`)
        policies = (response.branch_policies ?? response).map(({ name: policyName, type = 'branch' }) => ({
          name: policyName,
          type
        }))
      }
      environments[name] = {
        reviewers: (review?.reviewers ?? []).map(({ reviewer }) => reviewer.login).sort(),
        preventSelfReview: review?.prevent_self_review ?? false,
        protectedBranches: raw.deployment_branch_policy?.protected_branches ?? false,
        policies
      }
    }
    const listed = await this.request(`${base}/rulesets?includes_parents=false&per_page=100`)
    const rulesets = {}
    for (const [key, expected] of Object.entries(desired.rulesets)) {
      const summary = listed.find(({ name }) => name === expected.payload.name)
      if (!summary) {
        rulesets[key] = null
        continue
      }
      const detail = await this.request(`${base}/rulesets/${summary.id}`)
      rulesets[key] = { id: summary.id, payload: normalizeRuleset(detail) }
    }
    return { actions, immutableReleases, environments, rulesets }
  }

  async apply(operation, desired, identities) {
    const base = `/repos/${this.repository}`
    if (operation.type === 'set-actions') {
      return this.request(`${base}/actions/permissions/workflow`, {
        method: 'PUT',
        body: {
          default_workflow_permissions: operation.after.defaultWorkflowPermissions,
          can_approve_pull_request_reviews: operation.after.canApprovePullRequestReviews
        }
      })
    }
    if (operation.type === 'enable-immutable-releases') {
      return this.request(`${base}/immutable-releases`, { method: 'PUT' })
    }
    if (operation.type === 'upsert-environment') {
      const encoded = encodeURIComponent(operation.name)
      const expected = operation.after
      await this.request(`${base}/environments/${encoded}`, {
        method: 'PUT',
        body: {
          wait_timer: 0,
          prevent_self_review: expected.preventSelfReview,
          reviewers: expected.reviewers.map((login) => ({ type: 'User', id: identities.users[login] })),
          deployment_branch_policy: {
            protected_branches: expected.protectedBranches,
            custom_branch_policies: !expected.protectedBranches
          }
        }
      })
      if (!expected.protectedBranches) {
        const current = await this.request(`${base}/environments/${encoded}/deployment-branch-policies?per_page=100`)
        const present = new Set((current.branch_policies ?? current).map(({ name, type = 'branch' }) => `${type}:${name}`))
        for (const policy of expected.policies) {
          if (!present.has(`${policy.type}:${policy.name}`)) {
            await this.request(`${base}/environments/${encoded}/deployment-branch-policies`, {
              method: 'POST',
              body: policy
            })
          }
        }
      }
      return
    }
    if (operation.type === 'create-ruleset') {
      const created = await this.request(`${base}/rulesets`, { method: 'POST', body: operation.after })
      operation.resourceId = created.id
      return
    }
    if (operation.type === 'update-ruleset') {
      const { target: _target, ...update } = operation.after
      return this.request(`${base}/rulesets/${operation.id}`, { method: 'PUT', body: update })
    }
    fail('MT_RELEASE_CONTROLS_APPLY_FAILED', `operation=${operation.type}`)
  }

  async applyRollback(operation, identities) {
    const base = `/repos/${this.repository}`
    if (operation.type === 'disable-immutable-releases') {
      return this.request(`${base}/immutable-releases`, { method: 'DELETE' })
    }
    if (operation.type === 'delete-ruleset') {
      return this.request(`${base}/rulesets/${operation.id}`, { method: 'DELETE' })
    }
    if (operation.type === 'delete-environment') {
      return this.request(`${base}/environments/${encodeURIComponent(operation.name)}`, {
        method: 'DELETE'
      })
    }
    if (operation.type === 'restore-set-actions') {
      return this.apply({ type: 'set-actions', after: operation.after })
    }
    if (operation.type === 'restore-upsert-environment') {
      await this.apply({ type: 'upsert-environment', name: operation.name, after: operation.after }, null, identities)
      const encoded = encodeURIComponent(operation.name)
      const current = await this.request(`${base}/environments/${encoded}/deployment-branch-policies?per_page=100`)
      const allowed = new Set(operation.after.policies.map(({ name, type }) => `${type}:${name}`))
      const managedAfter = new Set((operation.expectedAfter?.policies ?? []).map(({ name, type }) => `${type}:${name}`))
      for (const policy of current.branch_policies ?? current) {
        const identity = `${policy.type ?? 'branch'}:${policy.name}`
        if (!allowed.has(identity)) {
          if (!managedAfter.has(identity)) {
            fail('MT_RELEASE_CONTROLS_ROLLBACK_FAILED', `environment=${operation.name};policy=${identity}`)
          }
          await this.request(
            `${base}/environments/${encoded}/deployment-branch-policies/${policy.id}`,
            { method: 'DELETE' }
          )
        }
      }
      return
    }
    if (operation.type === 'restore-update-ruleset') {
      const { target: _target, ...update } = operation.after
      return this.request(`${base}/rulesets/${operation.id}`, { method: 'PUT', body: update })
    }
    fail('MT_RELEASE_CONTROLS_ROLLBACK_FAILED', `operation=${operation.type}`)
  }
}

// START_CONTRACT: reconcileGithubControls
//   PURPOSE: Run dry-run/check/apply/activation with one-operation-at-a-time read-back and append-only journal evidence.
//   INPUTS: { client: object|null - live/fake adapter, desired: object, actual: object, mode: string, identities: object, onJournal: function }
//   OUTPUTS: { object - planned operation names and convergence }
//   SIDE_EFFECTS: Apply and activate modes invoke managed mutations and journal callback; other modes are read-only.
//   LINKS: .grace/verification/features.xml V-M-046 control-plane scenarios
// END_CONTRACT: reconcileGithubControls
// START_BLOCK_RECONCILE_GITHUB_CONTROLS
export const reconcileGithubControls = async ({
  client,
  desired,
  actual,
  mode,
  identities = { users: {}, apps: {} },
  onJournal = () => {}
}) => {
  let current = actual ?? (mode === 'dry-run' ? emptyActual(desired) : await client.read(desired))
  let operations = planGithubControls(desired, current)
  const initial = operations.map(({ type, name, key }) => ({ type, name, key }))
  if (mode === 'check' && operations.length) {
    fail('MT_RELEASE_CONTROLS_DRIFT', `operations=${operations.length}`)
  }
  const mutates = mode === 'apply' || mode === 'activate'
  if (mutates) {
    let count = 0
    while (operations.length) {
      count += 1
      if (count > 50) fail('MT_RELEASE_CONTROLS_APPLY_FAILED', 'operations=non-convergent')
      const operation = operations[0]
      const before = managedOperationValue(operation, current)
      await client.apply(operation, desired, identities)
      const after = await client.read(desired)
      const applied = managedOperationValue(operation, after)
      onJournal({
        ...operation,
        before,
        after: applied,
        beforeDigest: digest(before),
        afterDigest: digest(applied)
      })
      current = after
      operations = planGithubControls(desired, current)
    }
  }
  return { mode, operations: initial, converged: mutates ? operations.length === 0 : initial.length === 0 }
}
// END_BLOCK_RECONCILE_GITHUB_CONTROLS

const optionValue = (args, name) => {
  const index = args.indexOf(name)
  if (index === -1) return undefined
  const value = args[index + 1]
  if (!value || value.startsWith('--')) fail('MT_RELEASE_CONTROLS_ARGUMENT_INVALID', `${name}=missing`)
  return value
}

const ownerToken = () => {
  if (process.env.GH_TOKEN) return process.env.GH_TOKEN
  try {
    return execFileSync('gh', ['auth', 'token'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  } catch {
    fail('MT_RELEASE_CONTROLS_TOKEN_MISSING', 'run=gh auth login')
  }
}

const assertLocalMutation = (args, root, { rollback = false } = {}) => {
  if (process.env.CI) fail('MT_RELEASE_CONTROLS_CI_APPLY_FORBIDDEN', 'CI=true')
  if (optionValue(args, '--confirm-owner') !== 'xronocode') {
    fail('MT_RELEASE_CONTROLS_OWNER_CONFIRMATION_REQUIRED', 'confirmOwner=mismatch')
  }
  const journalPath = optionValue(args, '--journal')
  if (!journalPath || !isAbsolute(journalPath) || !relative(root, journalPath).startsWith('..')) {
    fail('MT_RELEASE_CONTROLS_JOURNAL_INVALID', 'journal=must-be-absolute-outside-repository')
  }
  const journalExists = existsSync(journalPath)
  const snapshotExists = existsSync(`${journalPath}.snapshot.json`)
  if ((rollback && !(journalExists && snapshotExists)) || (!rollback && (journalExists || snapshotExists))) {
    fail(
      'MT_RELEASE_CONTROLS_JOURNAL_INVALID',
      rollback ? 'journal=missing' : 'journal=already-exists'
    )
  }
  return journalPath
}

const main = async () => {
  try {
    const root = process.cwd()
    const args = process.argv.slice(2)
    const mode = args.includes('--activate')
      ? 'activate'
      : args.includes('--check-active')
        ? 'check-active'
        : args.includes('--apply')
          ? 'apply'
          : args.includes('--check')
            ? 'check'
            : args.includes('--rollback')
              ? 'rollback'
              : 'dry-run'
    const config = JSON.parse(readFileSync(resolve(root, '.github/release-governance.json'), 'utf8'))
    if (mode === 'dry-run') {
      const fixtureIdentities = {
        users: { xronocode: 1 },
        apps: { 'github-actions': 2, 'xronocode-release-bot': 3 }
      }
      const desired = buildDesiredControls(config, fixtureIdentities)
      const result = await reconcileGithubControls({ client: null, desired, mode })
      console.info(`[ReleaseControls][reconcile][BLOCK_RELEASE_CONTROLS_DRY_RUN] operations=${result.operations.length}`)
      return
    }
    const journalPath = ['apply', 'activate', 'rollback'].includes(mode)
      ? assertLocalMutation(args, root, { rollback: mode === 'rollback' })
      : null
    const client = new GitHubControlsClient({ token: ownerToken(), repository: config.repository })
    if (journalPath) {
      const actor = await client.request('/user')
      if (actor.login !== 'xronocode') {
        fail('MT_RELEASE_CONTROLS_OWNER_CONFIRMATION_REQUIRED', `authenticated=${actor.login}`)
      }
    }
    const identities = await client.resolveIdentities(config)
    const stagedDesired = buildDesiredControls(config, identities)
    const desired = mode === 'activate' || mode === 'check-active'
      ? buildDesiredControls(config, identities, { activate: true })
      : stagedDesired
    if (mode === 'rollback') {
      const snapshotPath = `${journalPath}.snapshot.json`
      if (!existsSync(snapshotPath)) {
        fail('MT_RELEASE_CONTROLS_JOURNAL_INVALID', 'snapshot=missing')
      }
      const snapshot = JSON.parse(readFileSync(snapshotPath, 'utf8'))
      const { entries } = parseControlJournal(readFileSync(journalPath, 'utf8'), {
        repository: config.repository,
        config,
        snapshot
      })
      for (const operation of buildRollbackPlan(entries)) {
        const current = await client.read(desired)
        const live = managedOperationValue(
          { type: operation.originalType, key: operation.key, name: operation.name },
          current
        )
        if (digest(live) === operation.beforeDigest) continue
        if (digest(live) !== operation.afterDigest) {
          fail(
            'MT_RELEASE_CONTROLS_ROLLBACK_DRIFT',
            `operation=${operation.originalType};resource=${operation.name ?? operation.key ?? 'repository'}`
          )
        }
        await client.applyRollback(operation, identities)
        const readBack = await client.read(desired)
        const restored = managedOperationValue(
          { type: operation.originalType, key: operation.key, name: operation.name },
          readBack
        )
        if (digest(restored) !== operation.beforeDigest) {
          fail('MT_RELEASE_CONTROLS_ROLLBACK_FAILED', `operation=${operation.originalType};readBack=mismatch`)
        }
      }
      console.info(`[ReleaseControls][rollback][BLOCK_RELEASE_CONTROLS_ROLLED_BACK] operations=${entries.length}`)
      return
    }
    if (mode === 'apply' || mode === 'activate') {
      const snapshot = await client.read(mode === 'activate' ? stagedDesired : desired)
      if (mode === 'activate') {
        const stagingDrift = planGithubControls(stagedDesired, snapshot)
        if (stagingDrift.length) {
          fail('MT_RELEASE_CONTROLS_ACTIVATION_PREREQUISITE_FAILED', `stagingOperations=${stagingDrift.length}`)
        }
        await client.validateActivationPrerequisites(config)
      }
      const snapshotPath = `${journalPath}.snapshot.json`
      writeFileSync(snapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`, {
        flag: 'wx',
        mode: 0o600
      })
      const header = createControlJournalHeader({
        repository: config.repository,
        config,
        snapshot,
        createdAt: new Date().toISOString()
      })
      writeFileSync(journalPath, `${JSON.stringify(header)}\n`, { flag: 'wx', mode: 0o600 })
      let sequence = 0
      let previousHash = header.recordHash
      const result = await reconcileGithubControls({
        client,
        desired,
        actual: snapshot,
        mode,
        identities,
        onJournal: (entry) => {
          sequence += 1
          const record = createControlJournalRecord({
            entry,
            sequence,
            previousHash,
            appliedAt: new Date().toISOString()
          })
          appendFileSync(journalPath, `${JSON.stringify(record)}\n`, { mode: 0o600 })
          previousHash = record.recordHash
        }
      })
      console.info(`[ReleaseControls][reconcile][BLOCK_RELEASE_CONTROLS_APPLIED] operations=${result.operations.length}`)
      return
    }
    await reconcileGithubControls({ client, desired, mode: 'check' })
    const marker = mode === 'check-active'
      ? 'BLOCK_RELEASE_CONTROLS_ACTIVE_CONFIRMED'
      : 'BLOCK_RELEASE_CONTROLS_CONFIRMED'
    console.info(`[ReleaseControls][reconcile][${marker}] operations=0`)
  } catch (error) {
    const code = error?.code ?? 'MT_RELEASE_CONTROLS_INVALID'
    console.error(`[ReleaseControls][reconcile][BLOCK_RELEASE_CONTROLS_REJECTED] code=${code} ${error.message}`)
    process.exitCode = 1
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : ''
if (import.meta.url === invokedPath) await main()
