// FILE: tests/renderer/release-project-sync.test.js
// VERSION: 1.4.0
// START_MODULE_CONTRACT
//   PURPOSE: Prove the GitHub Project mirror is public-data-only, one-way, duplicate-safe, paginated/retry-capable, non-destructive, and idempotent.
//   SCOPE: Pure projection/planning plus an in-memory apply adapter and bounded request retry; no live GitHub mutation.
//   DEPENDS: Vitest; tools/release-project-sync.mjs; checked-in train/governance JSON.
//   LINKS: .grace/verification/features.xml V-M-046.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   checkedIn - Current checked-in train before the synthetic-item fallback used by reconciliation cases.
//   manifest - Checked-in machine-readable train fixture.
//   governance - Checked-in Project schema and identity fixture.
//   desired - Checked-in train projected into managed Project rows.
//   privateHomePath - Builds a synthetic macOS home path without committing a personal absolute-path literal.
//   FakeProjectClient - In-memory read/apply adapter used to prove convergence and idempotence.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   - 2026-10-21 v1.4.0: pin the current draft-item payload field and prove empty optional values are skipped on create and cleared with GitHub's dedicated field-value mutation.
//   - 2026-10-21 v1.3.1: keep the test module map aligned with the checked-in collecting-train fixture.
//   - 2026-10-20 v1.3.0: use minimal non-credential constructor sentinels in GraphQL transport coverage.
//   - 2026-10-20 v1.2.0: construct private-path fixtures portably so the repository safety gate can review them without admitting a personal absolute-path literal.
//   - 2026-10-20 v1.1.0: prove multi-page reads, managed option migration, and resume after a partial apply failure.
//   - 2026-10-20 v1.0.0: add one-way Project mirror projection, drift, duplicate, retry, and idempotence coverage.
// END_CHANGE_SUMMARY

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  buildProjectProjection,
  GraphqlProjectClient,
  planProjectReconciliation,
  recordProjectIdentity,
  reconcileProject,
  validateProjectMutationBoundary
} from '../../tools/release-project-sync.mjs'

const checkedIn = JSON.parse(
  readFileSync(resolve('docs/release-trains/2.6.x-next.json'), 'utf8')
)
// A freshly rolled collecting train is legitimately empty, while the
// reconciliation cases need at least one item row beyond the train
// summary — fall back to one synthetic accepted item in that case.
const manifest =
  checkedIn.items.userFacing.length + checkedIn.items.operational.length > 0
    ? checkedIn
    : {
        ...checkedIn,
        items: {
          ...checkedIn.items,
          userFacing: [
            {
              id: 'FIX-SAMPLE',
              summary: 'Synthetic accepted repair for the mirror cases.',
              state: 'queued',
              commits: ['995b01ce65906108dcd8fefa95ccae7dd799cba5'],
              acceptance: {
                owner: 'xronocode',
                date: '2026-10-19',
                testedArtifact: 'Mark Test bcaebe05',
                scenarios: ['The accepted scenario works.']
              }
            }
          ]
        }
      }
const governance = JSON.parse(
  readFileSync(resolve('.github/release-governance.json'), 'utf8')
)
const desired = buildProjectProjection(manifest, governance.project)
const privateHomePath = (...segments) => ['', 'Users', ...segments].join('/')

class FakeProjectClient {
  constructor() {
    this.actual = { project: null, fields: [], items: [] }
    this.applied = []
  }

  async read() {
    return structuredClone(this.actual)
  }

  async apply(operation) {
    this.applied.push(operation.type)
    if (operation.type === 'create-project') {
      this.actual.project = {
        id: 'PVT_test',
        title: operation.title,
        public: operation.public
      }
    } else if (operation.type === 'update-project') {
      Object.assign(this.actual.project, operation)
    } else if (operation.type === 'create-field') {
      this.actual.fields.push({
        id: `FIELD_${this.actual.fields.length}`,
        ...structuredClone(operation.field)
      })
    } else if (operation.type === 'update-field-options') {
      const field = this.actual.fields.find(({ name }) => name === operation.field.name)
      field.options = structuredClone(operation.field.options)
    } else if (operation.type === 'create-item') {
      this.actual.items.push({
        id: `ITEM_${this.actual.items.length}`,
        title: operation.row.title,
        body: operation.row.body,
        fields: {
          ...structuredClone(operation.row.fields),
          'Unowned notes': 'preserve me'
        }
      })
    } else if (operation.type === 'update-item-title') {
      this.actual.items.find(({ id }) => id === operation.itemId).title = operation.title
    } else if (operation.type === 'set-field') {
      this.actual.items.find(({ id }) => id === operation.itemId).fields[operation.field] = operation.value
    }
  }
}

// START_BLOCK_RELEASE_PROJECT_SYNC_TESTS
describe('release Project mirror', () => {
  it('projects one summary plus every included, operational, and not-present item with only public fields', () => {
    expect(desired.ownerType).toBe('user')
    expect(desired.owner).toBe('xronocode')
    expect(desired.rows).toHaveLength(
      1 +
        manifest.items.userFacing.length +
        manifest.items.operational.length +
        manifest.items.notPresent.length
    )
    expect(desired.rows[0].stableId).toBe('train:2.6.x-next')
    expect(JSON.stringify(desired)).not.toContain(privateHomePath(''))
    expect(JSON.stringify(desired)).not.toContain('file://')
  })

  it('dry-run reports bootstrap operations without a token or mutation', async () => {
    const result = await reconcileProject({ client: null, desired, mode: 'dry-run' })
    expect(result.operations[0]).toBe('create-project')
    expect(result.operations.filter((type) => type === 'create-field')).toHaveLength(7)
    expect(result.operations.filter((type) => type === 'create-item')).toHaveLength(desired.rows.length)
  })

  it('apply converges and a second read-back produces zero operations', async () => {
    const client = new FakeProjectClient()
    const result = await reconcileProject({ client, desired, mode: 'apply' })
    expect(result.converged).toBe(true)
    expect(client.applied.length).toBeGreaterThan(desired.rows.length)
    await expect(reconcileProject({ client, desired, mode: 'check' })).resolves.toEqual({
      mode: 'check',
      operations: [],
      converged: true
    })
    expect(client.actual.items.every((item) => item.fields['Unowned notes'] === 'preserve me')).toBe(true)
  })

  it('rejects duplicate stable Item ID rows instead of choosing one', () => {
    const row = desired.rows[1]
    const actual = {
      project: { title: desired.title, public: desired.public },
      fields: desired.fields,
      items: [
        { id: 'A', title: row.title, fields: { 'Item ID': row.stableId } },
        { id: 'B', title: row.title, fields: { 'Item ID': row.stableId } }
      ]
    }
    expect(() => planProjectReconciliation(desired, actual)).toThrow(
      expect.objectContaining({ code: 'MT_RELEASE_PROJECT_DUPLICATE_ITEM' })
    )
  })

  it('recovers one response-lost draft item by deterministic title and body', () => {
    const row = desired.rows[1]
    const actual = {
      project: { title: desired.title, public: desired.public },
      fields: desired.fields,
      items: [{ id: 'ORPHAN', title: row.title, body: row.body, fields: {} }]
    }
    const operations = planProjectReconciliation(desired, actual)
      .filter(({ stableId }) => stableId === row.stableId)
    expect(operations[0]).toMatchObject({
      type: 'set-field',
      itemId: 'ORPHAN',
      field: 'Item ID'
    })
    expect(operations.some(({ type }) => type === 'create-item')).toBe(false)
  })

  it('rejects private machine paths before they can enter a public Project', () => {
    const unsafe = structuredClone(manifest)
    unsafe.items.userFacing[0].summary = `Owner note at ${privateHomePath('fixture-owner', 'recovery.md')}`
    expect(() => buildProjectProjection(unsafe, governance.project)).toThrow(
      expect.objectContaining({ code: 'MT_RELEASE_PROJECT_PRIVATE_DATA' })
    )
  })

  it('retries transient GraphQL failures with a bounded attempt count', async () => {
    let attempts = 0
    const client = new GraphqlProjectClient({
      token: 'synthetic-noncredential',
      owner: 'xronocode',
      fetchImpl: async () => {
        attempts += 1
        if (attempts < 3) throw new Error('temporary outage')
        return {
          ok: true,
          json: async () => ({ data: { viewer: { login: 'xronocode' } } })
        }
      }
    })
    await expect(client.request('query { viewer { login } }')).resolves.toEqual({
      viewer: { login: 'xronocode' }
    })
    expect(attempts).toBe(3)
  })

  it('never blindly retries a mutation after an ambiguous network failure', async () => {
    let attempts = 0
    const client = new GraphqlProjectClient({
      token: 'x',
      owner: 'xronocode',
      fetchImpl: async () => {
        attempts += 1
        throw new Error('response lost')
      }
    })
    await expect(client.request('mutation { updateProjectV2(input:{}) { projectV2 { id } } }'))
      .rejects.toMatchObject({ code: 'MT_RELEASE_PROJECT_MUTATION_UNCERTAIN' })
    expect(attempts).toBe(1)
  })

  it('skips empty fields on item creation and clears existing values explicitly', async () => {
    const requests = []
    const client = new GraphqlProjectClient({
      token: 'x',
      owner: 'xronocode',
      fetchImpl: async (_url, options) => {
        const request = JSON.parse(options.body)
        requests.push(request)
        const data = request.query.includes('addProjectV2DraftIssue')
          ? { addProjectV2DraftIssue: { projectItem: { id: 'ITEM' } } }
          : request.query.includes('clearProjectV2ItemFieldValue')
            ? { clearProjectV2ItemFieldValue: { projectV2Item: { id: 'ITEM' } } }
            : { updateProjectV2ItemFieldValue: { projectV2Item: { id: 'ITEM' } } }
        return { ok: true, json: async () => ({ data }) }
      }
    })
    const snapshot = {
      project: { id: 'PROJECT' },
      fields: desired.fields.map((field, index) => ({
        id: `FIELD_${index}`,
        ...structuredClone(field),
        options: (field.options ?? []).map((name, optionIndex) => ({ id: `${index}_${optionIndex}`, name }))
      })),
      items: []
    }
    client.read = async () => structuredClone(snapshot)
    const row = structuredClone(desired.rows[0])
    row.fields['Payload SHA'] = ''

    await client.apply({ type: 'create-item', row }, desired)
    expect(requests[0].query).toContain('projectItem{id}')
    expect(requests[0].query).not.toContain('projectV2Item{id}')
    expect(requests.some(({ variables }) => variables.fieldId === snapshot.fields[3].id)).toBe(false)

    requests.length = 0
    await client.apply({
      type: 'set-field',
      itemId: 'ITEM',
      field: 'Payload SHA',
      value: ''
    }, desired)
    expect(requests).toHaveLength(1)
    expect(requests[0].query).toContain('clearProjectV2ItemFieldValue')
  })

  it('follows Project, field, and item cursors before planning', async () => {
    const responses = [
      { user: { id: 'USER', projectsV2: { nodes: [{ id: 'OTHER', number: 9, title: 'Other', public: true, closed: false }], pageInfo: { hasNextPage: true, endCursor: 'projects-2' } } } },
      { user: { id: 'USER', projectsV2: { nodes: [{ id: desired.nodeId ?? 'PROJECT', number: 1, title: desired.title, public: true, closed: false }], pageInfo: { hasNextPage: false, endCursor: null } } } },
      { node: { fields: { nodes: [{ id: 'F1', name: 'Train', dataType: 'SINGLE_SELECT', options: [] }], pageInfo: { hasNextPage: true, endCursor: 'fields-2' } } } },
      { node: { fields: { nodes: [{ id: 'F2', name: 'Item ID', dataType: 'TEXT' }], pageInfo: { hasNextPage: false, endCursor: null } } } },
      { node: { items: { nodes: [{ id: 'I1', content: { id: 'D1', title: 'one' }, fieldValues: { nodes: [] } }], pageInfo: { hasNextPage: true, endCursor: 'items-2' } } } },
      { node: { items: { nodes: [{ id: 'I2', content: { id: 'D2', title: 'two' }, fieldValues: { nodes: [] } }], pageInfo: { hasNextPage: false, endCursor: null } } } }
    ]
    let calls = 0
    const client = new GraphqlProjectClient({
      token: 'x',
      owner: 'xronocode',
      fetchImpl: async () => ({
        ok: true,
        json: async () => ({ data: responses[calls++] })
      })
    })
    const actual = await client.read(desired)
    expect(calls).toBe(6)
    expect(actual.fields.map(({ name }) => name)).toEqual(['Train', 'Item ID'])
    expect(actual.items.map(({ id }) => id)).toEqual(['I1', 'I2'])
  })

  it('migrates only managed field options and never plans deletion', () => {
    const actual = {
      project: { title: desired.title, public: desired.public },
      fields: desired.fields.map((field) =>
        field.name === 'Admission'
          ? { ...field, options: ['included'] }
          : structuredClone(field)
      ),
      items: []
    }
    const operations = planProjectReconciliation(desired, actual)
    expect(operations).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'update-field-options', field: expect.objectContaining({ name: 'Admission' }) })
    ]))
    expect(operations.some(({ type }) => type.startsWith('delete'))).toBe(false)
  })

  it('stops on a partial failure and safely resumes from read-back state', async () => {
    const client = new FakeProjectClient()
    const apply = client.apply.bind(client)
    let failed = false
    client.apply = async (operation) => {
      if (!failed && operation.type === 'create-field') {
        failed = true
        throw new Error('injected partial failure')
      }
      return apply(operation)
    }
    await expect(reconcileProject({ client, desired, mode: 'apply' })).rejects.toThrow('injected partial failure')
    expect(client.actual.project).not.toBeNull()
    await expect(reconcileProject({ client, desired, mode: 'apply' })).resolves.toMatchObject({ converged: true })
  })

  it('records the stable Project number/node ID only from converged read-back', () => {
    const originalProject = structuredClone(governance.project)
    const updated = recordProjectIdentity(governance, {
      project: { id: 'PVT_fixture', number: 17 }
    })
    expect(updated.project).toMatchObject({ nodeId: 'PVT_fixture', number: 17 })
    expect(governance.project).toEqual(originalProject)
    expect(() => recordProjectIdentity(governance, { project: null })).toThrow(
      expect.objectContaining({ code: 'MT_RELEASE_PROJECT_IDENTITY_MISMATCH' })
    )
  })

  it('keeps unbound Project creation owner-local and explicitly confirmed', () => {
    expect(() => validateProjectMutationBoundary({
      mode: 'apply',
      args: [],
      ci: false,
      nodeId: null
    })).toThrow(expect.objectContaining({ code: 'MT_RELEASE_PROJECT_OWNER_CONFIRMATION_REQUIRED' }))
    expect(validateProjectMutationBoundary({
      mode: 'apply',
      args: ['--record-identity', '--confirm-owner=xronocode'],
      ci: false,
      nodeId: null
    })).toBe(true)
    expect(validateProjectMutationBoundary({
      mode: 'apply',
      args: [],
      ci: true,
      nodeId: 'PVT_bound'
    })).toBe(true)
  })
})
// END_BLOCK_RELEASE_PROJECT_SYNC_TESTS
