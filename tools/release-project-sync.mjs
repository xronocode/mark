// FILE: tools/release-project-sync.mjs
// VERSION: 1.4.0
// START_MODULE_CONTRACT
//   PURPOSE: Mirror the checked-in release train into one user-owned GitHub Project without making Project availability part of release admission.
//   SCOPE: Public-field projection, paginated read, deterministic dry-run/check/apply planning, idempotent owned-field writes, and duplicate protection; never reverse-syncs or deletes.
//   DEPENDS: Node.js fs/path/url; GitHub GraphQL Projects v2 API; release-readiness train authority; .github/release-governance.json.
//   LINKS: .grace/graph/features.xml M-046; .grace/verification/features.xml V-M-046.
//   ROLE: SCRIPT
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   ReleaseProjectSyncError - Stable coded Project mirror error.
//   buildProjectProjection - Convert the train authority into allowlisted public Project rows.
//   planProjectReconciliation - Diff owned fields by stable Item ID without deleting or touching unowned fields.
//   GraphqlProjectClient - Paginated GitHub Projects v2 read/apply client with bounded retries.
//   reconcileProject - Run dry-run/check/apply and prove apply idempotence by read-back.
//   recordProjectIdentity - Bind a successful owner-local bootstrap to the Project number/node ID in source control.
//   validateProjectMutationBoundary - Keep unbound Project creation owner-local and confirmed.
//   OWNED_FIELDS - Exact public Project fields governed by the one-way mirror.
//   fail - Raise one stable Project synchronization error.
//   slug - Normalize a train item ID into an evidence anchor.
//   evidenceUrl - Build the public evidence URL for one train item.
//   assertPublicValue - Reject local paths, secrets, and non-allowlisted evidence URLs.
//   optionNames - Normalize one Project field's selectable option names.
//   sleep - Delay bounded GraphQL retries.
//   main - Run the command-line interface.
//   invokedPath - Detect direct command-line execution.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   - 2026-10-24 v1.4.0: C-RELEASE-CONVEYOR — derive evidence URLs from the manifest's own train ID instead of a hardcoded train.
//   - 2026-10-21 v1.3.0: use the current draft-item payload field, skip absent values on new items, and clear existing empty values through the dedicated GraphQL mutation.
//   - 2026-10-20 v1.2.0: name the dedicated external credential PROJECT_MIRROR_AUTH consistently across local and Actions callers.
//   - 2026-10-20 v1.1.0: reject ambiguous Project identity and support explicit owner-local number/node-ID recording after bootstrap.
//   - 2026-10-20 v1.0.0: add the one-way train-to-Project mirror with dry-run, idempotence, pagination, and public-data guards.
// END_CHANGE_SUMMARY

import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { readTrainManifest, validateTrainManifest } from './release-readiness.mjs'

const OWNED_FIELDS = [
  'Train',
  'Admission',
  'Owner acceptance',
  'Payload SHA',
  'Release state',
  'Item ID',
  'Evidence URL'
]

export class ReleaseProjectSyncError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'ReleaseProjectSyncError'
    this.code = code
  }
}

const fail = (code, message) => {
  throw new ReleaseProjectSyncError(code, message)
}

const slug = (id) => id.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
const evidenceUrl = (trainId, itemId) =>
  `https://github.com/xronocode/mark/blob/main/docs/release-trains/${trainId}.md#${slug(itemId)}`

const assertPublicValue = (field, value) => {
  const text = String(value ?? '')
  if (/\/Users\/|[A-Za-z]:\\|file:\/\/|private note|token=/i.test(text)) {
    fail('MT_RELEASE_PROJECT_PRIVATE_DATA', `field=${field}`)
  }
  if (field === 'Evidence URL' && text && !text.startsWith('https://github.com/xronocode/mark/')) {
    fail('MT_RELEASE_PROJECT_PRIVATE_DATA', `field=${field};url=not-allowlisted`)
  }
}

// START_CONTRACT: buildProjectProjection
//   PURPOSE: Convert one validated train authority into a train-summary row plus stable public item rows.
//   INPUTS: { manifest: object - validated train, projectConfig: object - managed Project contract }
//   OUTPUTS: { object - desired Project metadata, fields, and rows }
//   SIDE_EFFECTS: none.
//   LINKS: docs/release-trains/current.json
// END_CONTRACT: buildProjectProjection
// START_BLOCK_BUILD_PROJECT_PROJECTION
export const buildProjectProjection = (manifest, projectConfig) => {
  const baseFields = {
    Train: manifest.trainId,
    'Payload SHA': manifest.payloadSha ?? '',
    'Release state': manifest.state
  }
  const rows = [
    {
      stableId: `train:${manifest.trainId}`,
      title: `${manifest.trainId} release train`,
      body: `Public mirror of ${manifest.trainId}. Repository JSON remains authoritative.`,
      fields: {
        ...baseFields,
        Admission: 'operational',
        'Owner acceptance': 'not-required',
        'Item ID': `train:${manifest.trainId}`,
        'Evidence URL': `https://github.com/xronocode/mark/blob/main/docs/release-trains/${manifest.trainId}.json`
      }
    }
  ]
  const addRows = (entries, admission, acceptance) => {
    for (const item of entries) {
      rows.push({
        stableId: item.id,
        title: `${item.id} — ${item.summary}`,
        body: `Public release-train mirror for ${item.id}.\n\nManaged Item ID: ${item.id}`,
        fields: {
          ...baseFields,
          Admission: admission,
          'Owner acceptance': acceptance,
          'Item ID': item.id,
          'Evidence URL': evidenceUrl(manifest.trainId, item.id)
        }
      })
    }
  }
  addRows(manifest.items.userFacing, 'included', 'accepted')
  addRows(manifest.items.operational, 'operational', 'not-required')
  addRows(manifest.items.notPresent, 'not-present', 'not-required')
  for (const row of rows) {
    assertPublicValue('Title', row.title)
    assertPublicValue('Body', row.body)
    for (const [field, value] of Object.entries(row.fields)) assertPublicValue(field, value)
  }
  return {
    ownerType: projectConfig.ownerType,
    owner: projectConfig.owner,
    title: projectConfig.title,
    public: projectConfig.public,
    number: projectConfig.number,
    nodeId: projectConfig.nodeId,
    fields: projectConfig.fields,
    rows
  }
}
// END_BLOCK_BUILD_PROJECT_PROJECTION

const optionNames = (field) => (field.options ?? []).map((option) =>
  typeof option === 'string' ? option : option.name
)

// START_CONTRACT: planProjectReconciliation
//   PURPOSE: Produce deterministic non-destructive operations for managed Project metadata, fields, options, items, and owned values.
//   INPUTS: { desired: object - projection, actual: object - normalized API snapshot }
//   OUTPUTS: { object[] - ordered operations; empty means converged }
//   SIDE_EFFECTS: none.
//   LINKS: .github/release-governance.json project contract
// END_CONTRACT: planProjectReconciliation
// START_BLOCK_PLAN_PROJECT_RECONCILIATION
export const planProjectReconciliation = (desired, actual = {}) => {
  const operations = []
  const project = actual.project ?? null
  if (!project) {
    operations.push({ type: 'create-project', title: desired.title, public: desired.public })
  } else if (project.title !== desired.title || project.public !== desired.public) {
    operations.push({ type: 'update-project', title: desired.title, public: desired.public })
  }
  const actualFields = new Map((actual.fields ?? []).map((field) => [field.name, field]))
  for (const field of desired.fields) {
    const current = actualFields.get(field.name)
    if (!current) {
      operations.push({ type: 'create-field', field })
      continue
    }
    if (current.dataType !== field.dataType) {
      fail('MT_RELEASE_PROJECT_FIELD_TYPE_MISMATCH', `field=${field.name}`)
    }
    const expectedOptions = optionNames(field)
    const currentOptions = optionNames(current)
    if (JSON.stringify(expectedOptions) !== JSON.stringify(currentOptions)) {
      operations.push({ type: 'update-field-options', field })
    }
  }
  const byStableId = new Map()
  for (const item of actual.items ?? []) {
    const stableId = item.fields?.['Item ID']
    if (!stableId) continue
    if (byStableId.has(stableId)) {
      fail('MT_RELEASE_PROJECT_DUPLICATE_ITEM', `item=${stableId}`)
    }
    byStableId.set(stableId, item)
  }
  for (const row of desired.rows) {
    const current = byStableId.get(row.stableId)
    if (!current) {
      const recoverable = (actual.items ?? []).filter((item) =>
        !item.fields?.['Item ID'] && item.title === row.title && item.body === row.body
      )
      if (recoverable.length > 1) {
        fail('MT_RELEASE_PROJECT_DUPLICATE_ITEM', `item=${row.stableId};orphans=${recoverable.length}`)
      }
      if (recoverable.length === 1) {
        for (const fieldName of ['Item ID', ...OWNED_FIELDS.filter((name) => name !== 'Item ID')]) {
          operations.push({
            type: 'set-field',
            itemId: recoverable[0].id,
            stableId: row.stableId,
            field: fieldName,
            value: row.fields[fieldName] ?? ''
          })
        }
        continue
      }
      operations.push({ type: 'create-item', row })
      continue
    }
    if (current.title !== row.title) {
      operations.push({ type: 'update-item-title', itemId: current.id, title: row.title })
    }
    for (const fieldName of OWNED_FIELDS) {
      if ((current.fields?.[fieldName] ?? '') !== (row.fields[fieldName] ?? '')) {
        operations.push({
          type: 'set-field',
          itemId: current.id,
          stableId: row.stableId,
          field: fieldName,
          value: row.fields[fieldName] ?? ''
        })
      }
    }
  }
  return operations
}
// END_BLOCK_PLAN_PROJECT_RECONCILIATION

const sleep = (milliseconds) => new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds))

export class GraphqlProjectClient {
  constructor({ token, owner, endpoint = 'https://api.github.com/graphql', fetchImpl = fetch }) {
    if (!token) fail('MT_RELEASE_PROJECT_TOKEN_MISSING', 'PROJECT_MIRROR_AUTH=missing')
    this.token = token
    this.owner = owner
    this.endpoint = endpoint
    this.fetchImpl = fetchImpl
  }

  async request(query, variables = {}) {
    const isMutation = /^\s*mutation\b/.test(query)
    let lastError
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        const response = await this.fetchImpl(this.endpoint, {
          method: 'POST',
          headers: {
            authorization: `bearer ${this.token}`,
            'content-type': 'application/json'
          },
          body: JSON.stringify({ query, variables })
        })
        const payload = await response.json()
        if (!response.ok || payload.errors?.length) {
          throw new Error(`graphql-status-${response.status}`)
        }
        return payload.data
      } catch (error) {
        lastError = error
        if (isMutation) {
          fail('MT_RELEASE_PROJECT_MUTATION_UNCERTAIN', `reason=${error.message}`)
        }
        if (attempt < 3) await sleep(100 * 2 ** (attempt - 1))
      }
    }
    fail('MT_RELEASE_PROJECT_API_FAILED', `reason=${lastError?.message ?? 'unknown'}`)
  }

  async read(desired) {
    let owner = null
    let projectCursor = null
    const candidates = []
    do {
      const data = await this.request(
        `query($login:String!,$cursor:String){user(login:$login){id projectsV2(first:100,after:$cursor){nodes{id number title public closed} pageInfo{hasNextPage endCursor}}}}`,
        { login: desired.owner, cursor: projectCursor }
      )
      owner = data.user
      candidates.push(...(owner?.projectsV2.nodes.filter(({ title }) => title === desired.title) ?? []))
      projectCursor = owner?.projectsV2.pageInfo?.hasNextPage
        ? owner.projectsV2.pageInfo.endCursor
        : null
    } while (projectCursor)
    if (!desired.nodeId && candidates.length > 1) {
      fail('MT_RELEASE_PROJECT_DUPLICATE_PROJECT', `title=${desired.title};matches=${candidates.length}`)
    }
    const project = desired.nodeId
      ? candidates.find(({ id }) => id === desired.nodeId) ?? null
      : candidates[0] ?? null
    if (desired.nodeId && !project) {
      fail('MT_RELEASE_PROJECT_IDENTITY_MISMATCH', `nodeId=${desired.nodeId}`)
    }
    if (!project) return { ownerId: owner?.id, project: null, fields: [], items: [] }
    const fields = []
    let fieldCursor = null
    do {
      const page = await this.request(
        `query($id:ID!,$cursor:String){node(id:$id){... on ProjectV2{fields(first:100,after:$cursor){nodes{... on ProjectV2FieldCommon{id name dataType} ... on ProjectV2SingleSelectField{id name dataType options{id name}}} pageInfo{hasNextPage endCursor}}}}}`,
        { id: project.id, cursor: fieldCursor }
      )
      const connection = page.node.fields
      fields.push(...connection.nodes.filter(Boolean))
      fieldCursor = connection.pageInfo.hasNextPage ? connection.pageInfo.endCursor : null
    } while (fieldCursor)
    const items = []
    let itemCursor = null
    do {
      const page = await this.request(
        `query($id:ID!,$cursor:String){node(id:$id){... on ProjectV2{items(first:100,after:$cursor){nodes{id content{... on DraftIssue{id title body}} fieldValues(first:100){nodes{... on ProjectV2ItemFieldTextValue{text field{... on ProjectV2FieldCommon{name}}} ... on ProjectV2ItemFieldSingleSelectValue{name field{... on ProjectV2FieldCommon{name}}}}}} pageInfo{hasNextPage endCursor}}}}}`,
        { id: project.id, cursor: itemCursor }
      )
      const connection = page.node.items
      for (const node of connection.nodes) {
        const item = {
          id: node.id,
          contentId: node.content?.id,
          title: node.content?.title ?? '',
          body: node.content?.body ?? '',
          fields: {}
        }
        for (const value of node.fieldValues.nodes) {
          const name = value.field?.name
          if (name) item.fields[name] = value.text ?? value.name ?? ''
        }
        items.push(item)
      }
      itemCursor = connection.pageInfo.hasNextPage ? connection.pageInfo.endCursor : null
    } while (itemCursor)
    return { ownerId: owner.id, project, fields, items }
  }

  async apply(operation, desired) {
    const snapshot = await this.read(desired)
    const projectId = snapshot.project?.id
    if (operation.type === 'create-project') {
      const data = await this.request(
        `mutation($ownerId:ID!,$title:String!){createProjectV2(input:{ownerId:$ownerId,title:$title}){projectV2{id}}}`,
        { ownerId: snapshot.ownerId, title: operation.title }
      )
      if (operation.public) {
        await this.request(
          `mutation($projectId:ID!){updateProjectV2(input:{projectId:$projectId,public:true}){projectV2{id}}}`,
          { projectId: data.createProjectV2.projectV2.id }
        )
      }
      return
    }
    if (!projectId) fail('MT_RELEASE_PROJECT_APPLY_FAILED', 'project=missing')
    if (operation.type === 'update-project') {
      await this.request(
        `mutation($projectId:ID!,$title:String!,$public:Boolean!){updateProjectV2(input:{projectId:$projectId,title:$title,public:$public}){projectV2{id}}}`,
        { projectId, title: operation.title, public: operation.public }
      )
      return
    }
    if (operation.type === 'create-field') {
      await this.request(
        `mutation($projectId:ID!,$name:String!,$dataType:ProjectV2CustomFieldType!,$options:[ProjectV2SingleSelectFieldOptionInput!]){createProjectV2Field(input:{projectId:$projectId,name:$name,dataType:$dataType,singleSelectOptions:$options}){projectV2Field{... on ProjectV2FieldCommon{id}}}}`,
        {
          projectId,
          name: operation.field.name,
          dataType: operation.field.dataType,
          options: (operation.field.options ?? []).map((name, index) => ({
            name,
            color: ['BLUE', 'GREEN', 'YELLOW', 'ORANGE', 'PURPLE', 'GRAY'][index % 6],
            description: name
          }))
        }
      )
      return
    }
    if (operation.type === 'update-field-options') {
      const field = snapshot.fields.find(({ name }) => name === operation.field.name)
      if (!field?.id) fail('MT_RELEASE_PROJECT_APPLY_FAILED', `field=${operation.field.name};missing`)
      await this.request(
        `mutation($fieldId:ID!,$options:[ProjectV2SingleSelectFieldOptionInput!]!){updateProjectV2Field(input:{fieldId:$fieldId,singleSelectOptions:$options}){projectV2Field{... on ProjectV2FieldCommon{id}}}}`,
        {
          fieldId: field.id,
          options: (operation.field.options ?? []).map((name, index) => ({
            name,
            color: ['BLUE', 'GREEN', 'YELLOW', 'ORANGE', 'PURPLE', 'GRAY'][index % 6],
            description: name
          }))
        }
      )
      return
    }
    const setField = async (itemId, fieldName, value) => {
      const field = snapshot.fields.find(({ name }) => name === fieldName)
      if (!field?.id) fail('MT_RELEASE_PROJECT_APPLY_FAILED', `field=${fieldName};missing`)
      const normalizedValue = String(value ?? '')
      if (!normalizedValue) {
        await this.request(
          `mutation($projectId:ID!,$itemId:ID!,$fieldId:ID!){clearProjectV2ItemFieldValue(input:{projectId:$projectId,itemId:$itemId,fieldId:$fieldId}){projectV2Item{id}}}`,
          { projectId, itemId, fieldId: field.id }
        )
        return
      }
      const fieldValue = field.dataType === 'SINGLE_SELECT'
        ? {
            singleSelectOptionId: field.options?.find(({ name }) => name === value)?.id
          }
        : { text: normalizedValue }
      if (field.dataType === 'SINGLE_SELECT' && !fieldValue.singleSelectOptionId) {
        fail('MT_RELEASE_PROJECT_APPLY_FAILED', `field=${fieldName};option=${value};missing`)
      }
      await this.request(
        `mutation($projectId:ID!,$itemId:ID!,$fieldId:ID!,$value:ProjectV2FieldValue!){updateProjectV2ItemFieldValue(input:{projectId:$projectId,itemId:$itemId,fieldId:$fieldId,value:$value}){projectV2Item{id}}}`,
        { projectId, itemId, fieldId: field.id, value: fieldValue }
      )
    }
    if (operation.type === 'create-item') {
      const created = await this.request(
        `mutation($projectId:ID!,$title:String!,$body:String!){addProjectV2DraftIssue(input:{projectId:$projectId,title:$title,body:$body}){projectItem{id}}}`,
        { projectId, title: operation.row.title, body: operation.row.body }
      )
      const itemId = created.addProjectV2DraftIssue.projectItem.id
      for (const fieldName of ['Item ID', ...OWNED_FIELDS.filter((name) => name !== 'Item ID')]) {
        const value = operation.row.fields[fieldName] ?? ''
        if (String(value) === '') continue
        await setField(itemId, fieldName, value)
      }
      return
    }
    if (operation.type === 'update-item-title') {
      const item = snapshot.items.find(({ id }) => id === operation.itemId)
      if (!item?.contentId) fail('MT_RELEASE_PROJECT_APPLY_FAILED', `item=${operation.itemId};content=missing`)
      await this.request(
        `mutation($draftIssueId:ID!,$title:String!){updateProjectV2DraftIssue(input:{draftIssueId:$draftIssueId,title:$title}){draftIssue{id}}}`,
        { draftIssueId: item.contentId, title: operation.title }
      )
      return
    }
    if (operation.type === 'set-field') {
      await setField(operation.itemId, operation.field, operation.value)
      return
    }
    fail('MT_RELEASE_PROJECT_APPLY_FAILED', `operation=${operation.type};requires-read-back-replan`)
  }
}

// START_CONTRACT: reconcileProject
//   PURPOSE: Plan, optionally apply one operation at a time with read-back replanning, and prove convergence without deletion.
//   INPUTS: { client: object - read/apply adapter, desired: object - projection, mode: dry-run|check|apply }
//   OUTPUTS: { object - mode, operation count/list, and convergence }
//   SIDE_EFFECTS: In apply mode, invokes idempotent Project mutations; check/dry-run are read-only.
//   LINKS: .grace/verification/features.xml V-M-046 project mirror scenarios
// END_CONTRACT: reconcileProject
// START_BLOCK_RECONCILE_PROJECT
export const reconcileProject = async ({ client, desired, mode }) => {
  const actual = mode === 'dry-run' ? {} : await client.read(desired)
  let operations = planProjectReconciliation(desired, actual)
  const initial = operations.map((operation) => operation.type)
  if (mode === 'check' && operations.length) {
    fail('MT_RELEASE_PROJECT_DRIFT', `operations=${operations.length}`)
  }
  if (mode === 'apply') {
    let attempts = 0
    while (operations.length) {
      attempts += 1
      if (attempts > 500) fail('MT_RELEASE_PROJECT_APPLY_FAILED', 'operations=non-convergent')
      await client.apply(operations[0], desired)
      operations = planProjectReconciliation(desired, await client.read(desired))
    }
  }
  return { mode, operations: initial, converged: mode === 'apply' ? operations.length === 0 : initial.length === 0 }
}
// END_BLOCK_RECONCILE_PROJECT

// START_CONTRACT: recordProjectIdentity
//   PURPOSE: Bind a successful Project bootstrap to its stable number/node ID without changing any other governance field.
//   INPUTS: { governance: object - source-controlled config, snapshot: object - converged Project read-back }
//   OUTPUTS: { object - cloned governance config with Project identity }
//   SIDE_EFFECTS: none; CLI persistence is explicit and owner-local.
//   LINKS: .github/release-governance.json project contract
// END_CONTRACT: recordProjectIdentity
export const recordProjectIdentity = (governance, snapshot) => {
  const project = snapshot?.project
  if (!project?.id || !Number.isInteger(project.number)) {
    fail('MT_RELEASE_PROJECT_IDENTITY_MISMATCH', 'readBack=missing')
  }
  const updated = structuredClone(governance)
  updated.project.nodeId = project.id
  updated.project.number = project.number
  return updated
}

export const validateProjectMutationBoundary = ({ mode, args, ci, nodeId }) => {
  if (mode !== 'apply') return true
  const recordIdentity = args.includes('--record-identity')
  const ownerConfirmed = args.includes('--confirm-owner=xronocode')
  if (!nodeId && (ci || !recordIdentity || !ownerConfirmed)) {
    fail('MT_RELEASE_PROJECT_OWNER_CONFIRMATION_REQUIRED', 'bootstrap=owner-local-recorded-identity-required')
  }
  if (recordIdentity && (ci || !ownerConfirmed)) {
    fail('MT_RELEASE_PROJECT_OWNER_CONFIRMATION_REQUIRED', 'recordIdentity=owner-local-apply-only')
  }
  return true
}

const main = async () => {
  try {
    const args = process.argv.slice(2)
    const mode = args.includes('--apply')
      ? 'apply'
      : args.includes('--check')
        ? 'check'
        : 'dry-run'
    const root = process.cwd()
    const manifest = readTrainManifest(root)
    validateTrainManifest(manifest, { workspaceRoot: root })
    const governance = JSON.parse(
      readFileSync(resolve(root, '.github/release-governance.json'), 'utf8')
    )
    const desired = buildProjectProjection(manifest, governance.project)
    validateProjectMutationBoundary({
      mode,
      args,
      ci: Boolean(process.env.CI),
      nodeId: desired.nodeId
    })
    const client = mode === 'dry-run'
      ? null
      : new GraphqlProjectClient({
          token: process.env.PROJECT_MIRROR_AUTH,
          owner: desired.owner
        })
    const result = await reconcileProject({ client, desired, mode })
    if (args.includes('--record-identity')) {
      if (mode !== 'apply') {
        fail('MT_RELEASE_PROJECT_OWNER_CONFIRMATION_REQUIRED', 'recordIdentity=owner-local-apply-only')
      }
      const updated = recordProjectIdentity(governance, await client.read(desired))
      writeFileSync(
        resolve(root, '.github/release-governance.json'),
        `${JSON.stringify(updated, null, 2)}\n`
      )
    }
    console.info(
      `[ReleaseProject][sync][BLOCK_RELEASE_PROJECT_${mode === 'apply' ? 'APPLIED' : mode === 'check' ? 'IN_SYNC' : 'DRY_RUN'}] mode=${mode} operations=${result.operations.length} rows=${desired.rows.length}`
    )
  } catch (error) {
    const code = error?.code ?? 'MT_RELEASE_PROJECT_SYNC_INVALID'
    console.error(`[ReleaseProject][sync][BLOCK_RELEASE_PROJECT_DRIFT] code=${code} ${error.message}`)
    process.exitCode = 1
  }
}

const invokedPath = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : ''
if (import.meta.url === invokedPath) await main()
