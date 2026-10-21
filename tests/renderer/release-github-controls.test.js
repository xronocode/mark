// FILE: tests/renderer/release-github-controls.test.js
// VERSION: 1.7.0
// START_MODULE_CONTRACT
//   PURPOSE: Prove release promotion, tag admission, signing, draft publication, and GitHub-control workflows preserve their event, identity, permission, and approval boundaries.
//   SCOPE: YAML-AST and command-order assertions plus deterministic fake-client planning/apply/rollback; no live GitHub mutation or secret access.
//   DEPENDS: Vitest; yaml; tools/release-github-controls.mjs; .github/workflows/promote-release.yml; .github/workflows/release.yml; .github/release-governance.json.
//   LINKS: .grace/verification/features.xml V-M-046.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   read - Read one repository fixture as UTF-8 text.
//   parseWorkflow - Parse one workflow without treating its event mapping as prose.
//   releaseSource - Raw release-workflow source for command-boundary assertions.
//   promoteSource - Raw promotion-workflow source for command-boundary assertions.
//   release - Parsed release-workflow fixture.
//   promote - Parsed promotion-workflow fixture.
//   governance - Source-controlled GitHub control contract fixture.
//   identities - Deterministic owner, Actions, and release-bot API identities.
//   desiredControls - Normalized desired control plane used by fake-client tests.
//   actionRefs - Enumerate action references recursively for immutable-pin assertions.
//   commands - Flatten one job's command-bearing steps for negative assertions.
//   FakeControlsClient - In-memory control-plane adapter used to prove staged convergence and rollback.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   - 2026-10-21 v1.7.0: pin bounded draft-ID discovery and ID-based read-back across GitHub tag-index eventual consistency.
//   - 2026-10-21 v1.6.0: require tag admission to restore the remote annotated object after checkout peels the local tag ref.
//   - 2026-10-21 v1.5.0: require complete promotion history for payload-to-seal ancestry proofs before and after approval.
//   - 2026-10-20 v1.4.0: use a minimal non-credential constructor sentinel in API-failure coverage.
//   - 2026-10-20 v1.3.0: verify read-only publication preparation, narrow publication permissions, deterministic updater dates, exact public-release recovery, and rerunnable cask handoff.
//   - 2026-10-20 v1.2.0: pin disabled staging, explicit activation, exact immutable parsing, non-retried mutations, and tamper-evident rollback journals.
//   - 2026-10-20 v1.1.0: add staged control-plane dry-run, idempotence, unknown-resource, rollback, and CI-apply coverage.
//   - 2026-10-20 v1.0.0: add event/mode, bot tag, Environment, permission, action-pin, and draft-first publication regressions.
// END_CHANGE_SUMMARY

import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { parse } from 'yaml'
import { describe, expect, it } from 'vitest'
import {
  buildDesiredControls,
  buildRollbackPlan,
  createControlJournalHeader,
  createControlJournalRecord,
  GitHubControlsClient,
  immutableReleasesEnabled,
  parseControlJournal,
  planGithubControls,
  reconcileGithubControls
} from '../../tools/release-github-controls.mjs'

const read = (pathname) => readFileSync(resolve(pathname), 'utf8')
const parseWorkflow = (pathname) => parse(read(pathname))
const releaseSource = read('.github/workflows/release.yml')
const promoteSource = read('.github/workflows/promote-release.yml')
const release = parseWorkflow('.github/workflows/release.yml')
const promote = parseWorkflow('.github/workflows/promote-release.yml')
const governance = JSON.parse(read('.github/release-governance.json'))
const identities = {
  users: { xronocode: 101 },
  apps: { 'github-actions': 202, 'xronocode-release-bot': 303 }
}
const desiredControls = buildDesiredControls(governance, identities)

const actionRefs = (value, refs = []) => {
  if (Array.isArray(value)) {
    for (const item of value) actionRefs(item, refs)
  } else if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      if (key === 'uses') refs.push(item)
      else actionRefs(item, refs)
    }
  }
  return refs
}

const commands = (job) =>
  (job.steps ?? []).map(({ run = '', name = '' }) => `${name}\n${run}`).join('\n')

class FakeControlsClient {
  constructor() {
    this.actual = {
      actions: null,
      immutableReleases: false,
      environments: Object.fromEntries(Object.keys(desiredControls.environments).map((name) => [name, null])),
      rulesets: Object.fromEntries(Object.keys(desiredControls.rulesets).map((name) => [name, null]))
    }
    this.applied = []
  }

  async read() {
    return structuredClone(this.actual)
  }

  async apply(operation) {
    this.applied.push(operation.type)
    if (operation.type === 'set-actions') this.actual.actions = structuredClone(operation.after)
    if (operation.type === 'enable-immutable-releases') this.actual.immutableReleases = true
    if (operation.type === 'upsert-environment') {
      this.actual.environments[operation.name] = structuredClone(operation.after)
    }
    if (operation.type === 'create-ruleset') {
      operation.resourceId = 900 + this.applied.length
      this.actual.rulesets[operation.key] = {
        id: operation.resourceId,
        payload: structuredClone(operation.after)
      }
    }
    if (operation.type === 'update-ruleset') {
      this.actual.rulesets[operation.key].payload = structuredClone(operation.after)
    }
  }
}

// START_BLOCK_RELEASE_GITHUB_CONTROLS_TESTS
describe('release GitHub trust boundaries', () => {
  it('keeps promotion input-free and puts privileged tag creation behind owner approval', () => {
    expect(promote.on.workflow_dispatch).toBeUndefined()
    expect(promote.on.push.branches).toEqual(['main'])
    expect(promote.permissions).toEqual({})
    expect(promote.jobs.preflight.environment).toBeUndefined()
    expect(promote.jobs.preflight.permissions).toEqual({ contents: 'read', checks: 'read' })
    expect(promote.jobs['authorize-tag'].environment).toBe('release-authorize')
    expect(promote.jobs['authorize-tag'].needs).toBe('preflight')
    // v1.2.0: a non-Ready train admits the push as bookkeeping and exits
    // before deriving a seal — promotion still requires the Ready state,
    // now via the negative guard plus the seal-gated authorize-tag job.
    expect(commands(promote.jobs.preflight)).toContain('[ "$STATE" != "Ready" ]')
    expect(commands(promote.jobs.preflight)).toContain('nothing to promote')
    expect(promote.jobs['authorize-tag'].if).toContain("needs.preflight.outputs.seal != ''")
    expect(JSON.stringify(promote.jobs['authorize-tag'])).toContain('permission-contents')
    expect(commands(promote.jobs['authorize-tag'])).not.toContain('secrets.GITHUB_TOKEN')
    expect(promoteSource).toContain('actions/create-github-app-token@')
    expect(promoteSource).toContain('git/tags')
    expect(promoteSource).toContain('git/refs')
  })

  it('keeps complete main ancestry for strict payload-to-seal admission', () => {
    const preflight = commands(promote.jobs.preflight)
    const authorized = commands(promote.jobs['authorize-tag'])
    expect(preflight).toContain('git fetch origin main')
    expect(authorized).toContain('git fetch origin main')
    expect(preflight).not.toMatch(/git fetch origin main[^\n]*--depth/)
    expect(authorized).not.toMatch(/git fetch origin main[^\n]*--depth/)
  })

  it('keeps manual dispatch unsigned and unable to reach signing or publication', () => {
    expect(release.on.workflow_dispatch).toBeNull()
    expect(release.permissions).toEqual({})
    expect(release.jobs['manual-build'].environment).toBeUndefined()
    const manual = JSON.stringify(release.jobs['manual-build'])
    expect(manual).not.toMatch(/APPLE_|TAURI_SIGNING|release-signing|publish/)
    expect(release.jobs.build.if).toContain("github.event_name == 'push'")
    expect(release.jobs.build.needs).toBe('authorize-tag')
    expect(release.jobs.build.environment).toBe('release-signing')
  })

  it('rejects out-of-band or lightweight tags before any signing job', () => {
    const admission = commands(release.jobs['authorize-tag'])
    expect(JSON.stringify(release.jobs['authorize-tag'])).toContain('xronocode-release-bot[bot]')
    expect(admission).toContain(
      'git fetch --force --no-tags origin "refs/tags/$REF_NAME:refs/tags/$REF_NAME"'
    )
    expect(admission).toContain('TAG_REF="refs/tags/$REF_NAME"')
    expect(admission).toContain('git cat-file -t "$TAG_REF"')
    expect(admission).toContain('git rev-parse "$TAG_REF^{commit}"')
    expect(admission.indexOf('git fetch --force --no-tags origin')).toBeLessThan(
      admission.indexOf('git cat-file -t "$TAG_REF"')
    )
    expect(admission).toContain('[ "$HEAD_SHA" = "$SEAL" ]')
    expect(admission).toContain('npm run release:readiness --')
    expect(admission).toContain('--checks-file /tmp/release-checks.json')
  })

  it('repeats strict readiness before every platform packaging lane', () => {
    const build = commands(release.jobs.build)
    expect(build.indexOf('npm run release:readiness --')).toBeGreaterThan(-1)
    expect(releaseSource.indexOf('repeat strict release admission before packaging')).toBeLessThan(
      releaseSource.indexOf('uses: tauri-apps/tauri-action@')
    )
    expect(release.jobs.build.permissions).toEqual({
      contents: 'read',
      checks: 'read',
      'id-token': 'write',
      attestations: 'write'
    })
  })

  it('publishes only a verified draft and never clobbers public assets', () => {
    expect(release.jobs['prepare-publication'].permissions).toEqual({ contents: 'read' })
    expect(release.jobs['prepare-publication'].environment).toBeUndefined()
    expect(commands(release.jobs['prepare-publication'])).toContain(
      'PUB_DATE=$(git show -s --format=%cI "$TAG^{commit}")'
    )
    expect(release.jobs.publish.environment).toBe('release')
    expect(release.jobs.publish.permissions).toEqual({ contents: 'write' })
    expect(release.jobs.publish.steps.some(({ uses }) => uses?.startsWith('actions/checkout@'))).toBe(false)
    expect(commands(release.jobs.publish)).not.toMatch(/npm\s|node tools\/|release:readiness/)
    expect(release.jobs['close-release-please'].permissions).toEqual({
      contents: 'read',
      issues: 'write',
      'pull-requests': 'write'
    })
    expect(release.jobs['close-release-please'].needs).toEqual(['build', 'publish'])
    expect(release.jobs['publish-cask'].environment).toBe('release-cask')
    expect(release.jobs['publish-cask'].needs).toEqual(['build', 'publish'])
    expect(releaseSource).toContain('--verify-tag')
    expect(releaseSource).toContain('--draft')
    expect(releaseSource).toContain('release-assets.sha256')
    expect(releaseSource).toContain('existing draft asset differs')
    expect(releaseSource).toContain('ALREADY_PUBLISHED=true')
    expect(releaseSource).toContain('--json databaseId,isDraft')
    expect(releaseSource).toContain('release draft was not readable after creation')
    expect(releaseSource).toContain('"repos/$GITHUB_REPOSITORY/releases/$RELEASE_ID" > /tmp/release-readback.json')
    expect(releaseSource).not.toContain('releases/tags/$TAG')
    expect(releaseSource).toContain("jq -je '.body'")
    expect(releaseSource).not.toContain('--clobber')
    expect(releaseSource.indexOf('cmp "$ASSETS/latest.json"')).toBeLessThan(
      releaseSource.indexOf('publish verified draft as final mutation')
    )
    expect(releaseSource.indexOf('publish verified draft as final mutation')).toBeLessThan(
      releaseSource.indexOf('--draft=false')
    )
    expect(releaseSource).not.toMatch(/date\s+(?:-u\s+)?\+[^\n]*pub_date/i)
    expect(commands(release.jobs['publish-cask'])).toContain('cask PR already exists for $TAG')
    expect(releaseSource).toContain('gh run rerun --failed')
  })

  it('pins every third-party action to an immutable commit SHA', () => {
    const refs = [...actionRefs(release), ...actionRefs(promote)]
    expect(refs.length).toBeGreaterThan(10)
    for (const ref of refs) {
      expect(ref).toMatch(/@[0-9a-f]{40}$/)
    }
  })

  it('keeps source-controlled Environments and rulesets staged for explicit apply', () => {
    expect(governance.actions.defaultWorkflowPermissions).toBe('read')
    expect(governance.environments['release-authorize'].requiredReviewers).toEqual(['xronocode'])
    expect(governance.environments['release-signing'].requiredReviewers).toEqual([])
    expect(governance.environments.release).toMatchObject({
      requiredReviewers: ['xronocode'],
      preventSelfReview: false
    })
    expect(governance.environments['release-cask']).toMatchObject({
      requiredReviewers: [],
      preventSelfReview: false
    })
    expect(governance.rulesets.main.enforcement).toBe('disabled')
    expect(governance.rulesets.releaseTags.enforcement).toBe('disabled')
    const active = buildDesiredControls(governance, identities, { activate: true })
    expect(active.rulesets.main.payload.enforcement).toBe('active')
    expect(active.rulesets.releaseTags.payload.enforcement).toBe('active')
  })
})

describe('release GitHub control-plane reconciliation', () => {
  it('produces an offline non-mutating dry-run for every missing managed resource', async () => {
    const result = await reconcileGithubControls({
      client: null,
      desired: desiredControls,
      mode: 'dry-run'
    })
    expect(result.converged).toBe(false)
    expect(result.operations.map(({ type }) => type)).toEqual([
      'set-actions',
      'enable-immutable-releases',
      'upsert-environment',
      'upsert-environment',
      'upsert-environment',
      'upsert-environment',
      'create-ruleset',
      'create-ruleset'
    ])
  })

  it('applies one managed mutation at a time, journals it, and converges idempotently', async () => {
    const client = new FakeControlsClient()
    const journal = []
    const result = await reconcileGithubControls({
      client,
      desired: desiredControls,
      mode: 'apply',
      identities,
      onJournal: (entry) => journal.push(entry)
    })
    expect(result.converged).toBe(true)
    expect(journal).toHaveLength(8)
    expect(journal.every(({ beforeDigest, afterDigest }) => beforeDigest && afterDigest)).toBe(true)
    await expect(reconcileGithubControls({
      client,
      desired: desiredControls,
      mode: 'check'
    })).resolves.toEqual({ mode: 'check', operations: [], converged: true })
  })

  it('refuses to delete an unknown custom Environment policy', () => {
    const actual = {
      actions: desiredControls.actions,
      immutableReleases: true,
      environments: structuredClone(desiredControls.environments),
      rulesets: Object.fromEntries(
        Object.entries(desiredControls.rulesets).map(([key, value], index) => [
          key,
          { id: index + 1, payload: value.payload }
        ])
      )
    }
    actual.environments.release.policies.push({ name: 'private-recovery/*', type: 'branch' })
    expect(() => planGithubControls(desiredControls, actual)).toThrow(
      expect.objectContaining({ code: 'MT_RELEASE_CONTROLS_UNKNOWN_POLICY' })
    )
  })

  it('builds reverse-order rollback without deleting newly created managed resources', () => {
    const plan = buildRollbackPlan([
      { type: 'set-actions', before: { defaultWorkflowPermissions: 'write' }, after: desiredControls.actions },
      { type: 'create-ruleset', key: 'main', resourceId: 41, before: null, after: desiredControls.rulesets.main.payload },
      { type: 'enable-immutable-releases', before: false, after: true }
    ])
    expect(plan.map(({ type }) => type)).toEqual([
      'disable-immutable-releases',
      'delete-ruleset',
      'restore-set-actions'
    ])
    expect(plan[1]).toMatchObject({ id: 41, expectedBefore: null })
  })

  it('parses immutable-release responses exactly instead of trusting object truthiness', () => {
    expect(immutableReleasesEnabled({ enabled: true })).toBe(true)
    expect(immutableReleasesEnabled({ enabled: false })).toBe(false)
    expect(immutableReleasesEnabled({})).toBe(false)
    expect(immutableReleasesEnabled(null)).toBe(false)
  })

  it('never retries an uncertain mutating API request', async () => {
    let calls = 0
    const client = new GitHubControlsClient({
      token: 'x',
      repository: 'xronocode/mark',
      fetchImpl: async () => {
        calls += 1
        return { ok: false, status: 502 }
      }
    })
    await expect(client.request('/repos/xronocode/mark/rulesets', {
      method: 'POST',
      body: { name: 'fixture' }
    })).rejects.toMatchObject({ code: 'MT_RELEASE_CONTROLS_MUTATION_UNCERTAIN' })
    expect(calls).toBe(1)
  })

  it('binds the operation journal to config and snapshot with a tamper-evident chain', () => {
    const snapshot = { actions: null, immutableReleases: false, environments: {}, rulesets: {} }
    const header = createControlJournalHeader({
      repository: 'xronocode/mark',
      config: governance,
      snapshot,
      createdAt: '2026-10-20T00:00:00.000Z'
    })
    const record = createControlJournalRecord({
      entry: {
        type: 'set-actions',
        before: null,
        after: desiredControls.actions,
        beforeDigest: 'a'.repeat(64),
        afterDigest: 'b'.repeat(64)
      },
      sequence: 1,
      previousHash: header.recordHash,
      appliedAt: '2026-10-20T00:00:01.000Z'
    })
    const source = `${JSON.stringify(header)}\n${JSON.stringify(record)}\n`
    expect(parseControlJournal(source, {
      repository: 'xronocode/mark',
      config: governance,
      snapshot
    }).entries).toHaveLength(1)
    const tampered = source.replace('"sequence":1', '"sequence":2')
    expect(() => parseControlJournal(tampered, {
      repository: 'xronocode/mark',
      config: governance,
      snapshot
    })).toThrow(expect.objectContaining({ code: 'MT_RELEASE_CONTROLS_JOURNAL_INVALID' }))
  })

  it('refuses CI or missing owner confirmation before resolving an admin token', () => {
    const result = spawnSync(
      process.execPath,
      [
        'tools/release-github-controls.mjs',
        '--apply',
        '--confirm-owner',
        'xronocode',
        '--journal',
        '/tmp/mark-release-controls-test.ndjson'
      ],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
        env: { ...process.env, CI: 'true', GH_TOKEN: '' }
      }
    )
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('MT_RELEASE_CONTROLS_CI_APPLY_FORBIDDEN')
    expect(result.stderr).not.toContain('MT_RELEASE_CONTROLS_TOKEN_MISSING')
  })
})
// END_BLOCK_RELEASE_GITHUB_CONTROLS_TESTS
