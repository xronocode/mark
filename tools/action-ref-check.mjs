#!/usr/bin/env node
// FILE: tools/action-ref-check.mjs
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Verify exact external action commits and compatible metadata before privileged workflows merge.
//   SCOPE: Three literal workflows, bounded YAML/API bodies, one total deadline, read-only GitHub requests and invocation-local coalescing; no downloaded code execution.
//   DEPENDS: Node filesystem/path/URL built-ins, locked yaml 2.9.1, GitHub read-only API.
//   LINKS: .grace/graph/features.xml M-046; .grace/verification/features.xml V-M-046; C-RELEASE-ACTION-REFERENCES.
//   ROLE: SCRIPT
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
// START_MODULE_MAP
//   MAX_BYTES - Hard source/body ceiling.
//   WORKFLOWS - Literal privileged workflow names.
//   own - Test an own metadata property.
//   mapping - Reject null and sequence values where mappings are required.
//   nonempty - Require a nonblank scalar string.
//   safeSegment - Reject traversal and unsafe path segments.
//   ActionRefError - Stable path-free diagnostic code.
//   fail - Raise a stable diagnostic without source or credential text.
//   asFailure - Normalize untrusted exception payloads.
//   yamlObject - Parse bounded unique-key YAML with alias limits.
//   actionIdentity - Validate and normalize safe local or exact external uses.
//   collectActionRefs - Parse bounded workflow sources and reject unsupported uses before transport.
//   batchContext - Own the shared deadline, abort signal and bounded transport options.
//   cancelBody - Release streams without waiting for hostile cancellation.
//   responseJSON - Decode a bounded streamed JSON response.
//   requestJSON - Restrict read-only requests and redirects to the GitHub API.
//   actionMetadata - Decode and validate action runtime/input metadata without execution.
//   validateInputs - Check each use against declared and required inputs.
//   validateActionRefs - Verify exact commit/action identity, runtime and every used/required input with one bounded batch.
//   readWorkflow - Read one bounded regular workflow file.
//   runActionRefCheck - Read only the three privileged workflows and validate their collected references.
// END_MODULE_MAP
// START_CHANGE_SUMMARY
//   LAST_CHANGE: 2026-11-12 C-RELEASE-ACTION-REFERENCES: bounded read-only exact-reference check.
// END_CHANGE_SUMMARY

import { open } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseDocument } from 'yaml'

const MAX_BYTES = 1048576
const WORKFLOWS = ['release.yml', 'promote-release.yml', 'release-governance.yml']
const own = (value, key) => Object.hasOwn(value, key)
const mapping = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const nonempty = value => typeof value === 'string' && value.trim().length > 0
const safeSegment = value => /^[A-Za-z0-9_.-]+$/.test(value) && value !== '.' && value !== '..'

class ActionRefError extends Error {
  constructor(code) {
    super(`ACTION_REF_${code}`)
    this.name = 'ActionRefError'
  }
}
const fail = code => { throw new ActionRefError(code) }
const asFailure = (error, code) => error instanceof ActionRefError ? error : new ActionRefError(code)

// START_BLOCK_PARSE_REFERENCES
function yamlObject(source, code) {
  if (typeof source !== 'string' || Buffer.byteLength(source, 'utf8') > MAX_BYTES) fail(code)
  try {
    const document = parseDocument(source, { uniqueKeys: true, prettyErrors: false, strict: true })
    if (document.errors.length || document.warnings.length) fail(code)
    const value = document.toJS({ maxAliasCount: 100 })
    if (!mapping(value)) fail(code)
    return value
  } catch (error) {
    throw asFailure(error, code)
  }
}

function actionIdentity(uses) {
  if (!nonempty(uses)) fail('USES_INVALID')
  if (uses.startsWith('./')) {
    const parts = uses.slice(2).split('/')
    if (!parts.length || parts.some(part => !safeSegment(part))) fail('LOCAL_PATH_INVALID')
    return { kind: 'local' }
  }
  const match = /^([A-Za-z0-9][A-Za-z0-9-]*)\/([A-Za-z0-9_.-]+)((?:\/[A-Za-z0-9_.-]+)*)@([a-fA-F0-9]{40})$/.exec(uses)
  if (!match || !safeSegment(match[2])) fail('USES_INVALID')
  const subpath = match[3].split('/').filter(Boolean)
  if (subpath.some(part => !safeSegment(part))) fail('USES_INVALID')
  return { kind: 'external', owner: match[1].toLowerCase(), repo: match[2].toLowerCase(), subpath, sha: match[4].toLowerCase() }
}

export function collectActionRefs(workflows) {
  if (!mapping(workflows)) fail('WORKFLOW_INVALID')
  const refs = []
  for (const [workflow, source] of Object.entries(workflows)) {
    const parsed = yamlObject(source, 'WORKFLOW_YAML_INVALID')
    if (!mapping(parsed.jobs)) fail('WORKFLOW_INVALID')
    for (const [job, definition] of Object.entries(parsed.jobs)) {
      if (!mapping(definition)) fail('WORKFLOW_INVALID')
      if (own(definition, 'uses')) fail('REUSABLE_WORKFLOW_UNSUPPORTED')
      if (!Array.isArray(definition.steps)) fail('WORKFLOW_INVALID')
      for (const [index, step] of definition.steps.entries()) {
        if (!mapping(step)) fail('WORKFLOW_INVALID')
        if (!own(step, 'uses')) continue
        actionIdentity(step.uses)
        if (own(step, 'with') && !mapping(step.with)) fail('WORKFLOW_INVALID')
        if (own(step, 'id') && typeof step.id !== 'string') fail('WORKFLOW_INVALID')
        if (own(step, 'name') && typeof step.name !== 'string') fail('WORKFLOW_INVALID')
        refs.push({ workflow, job, step: step.id ?? step.name ?? String(index + 1), uses: step.uses, inputs: Object.keys(step.with ?? {}) })
      }
    }
  }
  return refs
}
// END_BLOCK_PARSE_REFERENCES

// START_BLOCK_BOUNDED_TRANSPORT
function batchContext(options) {
  const timeoutMs = options.timeoutMs ?? 60000
  const concurrency = options.concurrency ?? 3
  const maxResponseBytes = options.maxResponseBytes ?? MAX_BYTES
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60000 ||
      !Number.isInteger(concurrency) || concurrency < 1 || concurrency > 3 ||
      !Number.isInteger(maxResponseBytes) || maxResponseBytes < 1 || maxResponseBytes > MAX_BYTES) fail('OPTIONS_INVALID')
  const fetchImpl = options.fetchImpl ?? globalThis.fetch
  if (typeof fetchImpl !== 'function' || (options.token !== undefined && typeof options.token !== 'string')) fail('OPTIONS_INVALID')
  const controller = new AbortController()
  let error, rejectStopped
  const stopped = new Promise((_, reject) => { rejectStopped = reject })
  const stop = reason => {
    if (!error) {
      error = asFailure(reason, 'REQUEST_FAILED')
      controller.abort()
      rejectStopped(error)
    }
    return error
  }
  const timer = setTimeout(() => stop(new ActionRefError('DEADLINE')), timeoutMs)
  return {
    concurrency, maxResponseBytes, fetchImpl, token: options.token, controller, stop,
    check() { if (error) throw error },
    async race(operation) {
      if (error) throw error
      return Promise.race([operation, stopped])
    },
    close() { clearTimeout(timer); controller.abort() }
  }
}

function cancelBody(body) {
  try { Promise.resolve(body?.cancel()).catch(() => {}) } catch { /* Never await a hostile cancellation. */ }
}

async function responseJSON(response, context) {
  if (!response.body || typeof response.body.getReader !== 'function') fail('RESPONSE_INVALID')
  const declared = response.headers?.get('content-length')
  if (declared !== null && declared !== undefined && (!/^\d+$/.test(declared) || Number(declared) > context.maxResponseBytes)) {
    cancelBody(response.body)
    fail('BODY_LIMIT')
  }
  const reader = response.body.getReader()
  const chunks = []
  let size = 0, finished = false
  try {
    for (;;) {
      const { value, done } = await context.race(reader.read())
      if (done) { finished = true; break }
      if (!ArrayBuffer.isView(value)) fail('RESPONSE_INVALID')
      size += value.byteLength
      if (size > context.maxResponseBytes) fail('BODY_LIMIT')
      chunks.push(new Uint8Array(value.buffer, value.byteOffset, value.byteLength))
    }
    const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks, size)))
    if (!mapping(value)) fail('JSON_INVALID')
    return value
  } catch (error) {
    throw asFailure(error, 'JSON_INVALID')
  } finally {
    if (!finished) cancelBody(reader)
    try { reader.releaseLock() } catch { /* Pending hostile reads cannot delay the batch. */ }
  }
}

async function requestJSON(path, context, allowMissing = false) {
  context.check()
  const url = new URL(path, 'https://api.github.com')
  if (url.origin !== 'https://api.github.com' || url.username || url.password) fail('URL_INVALID')
  const headers = { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' }
  if (context.token) headers.Authorization = `Bearer ${context.token}`
  let response
  try {
    response = await context.race(context.fetchImpl(url.href, { method: 'GET', redirect: 'error', headers, signal: context.controller.signal }))
  } catch (error) {
    throw asFailure(error, 'REQUEST_FAILED')
  }
  if (!response || !Number.isInteger(response.status)) fail('RESPONSE_INVALID')
  try {
    if (response.redirected || (response.url && new URL(response.url).origin !== 'https://api.github.com') || (response.status >= 300 && response.status < 400)) fail('REDIRECT_DENIED')
    if (allowMissing && response.status === 404) { cancelBody(response.body); return null }
    if (response.status < 200 || response.status >= 300) fail('HTTP_FAILED')
    return await responseJSON(response, context)
  } catch (error) {
    cancelBody(response.body)
    throw asFailure(error, 'RESPONSE_INVALID')
  }
}
// END_BLOCK_BOUNDED_TRANSPORT

// START_BLOCK_ACTION_METADATA
function actionMetadata(payload) {
  if (payload.encoding !== 'base64' || typeof payload.content !== 'string') fail('METADATA_ENCODING')
  const encoded = payload.content.replace(/[\t\r\n ]/g, '')
  if (!encoded || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) fail('METADATA_ENCODING')
  const bytes = Buffer.from(encoded, 'base64')
  if (bytes.length > MAX_BYTES || bytes.toString('base64') !== encoded) fail('METADATA_ENCODING')
  let decoded
  try { decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes) } catch { fail('METADATA_ENCODING') }
  const metadata = yamlObject(decoded, 'METADATA_YAML_INVALID')
  const runs = metadata.runs
  if (!mapping(runs)) fail('RUNTIME_INVALID')
  if (runs.using === 'node20' || runs.using === 'node24') {
    if (!nonempty(runs.main) || (own(runs, 'pre') && !nonempty(runs.pre)) || (own(runs, 'post') && !nonempty(runs.post))) fail('RUNTIME_INVALID')
  } else if (runs.using === 'docker') {
    if (!nonempty(runs.image)) fail('RUNTIME_INVALID')
  } else if (runs.using === 'composite') {
    if (!Array.isArray(runs.steps) || !runs.steps.length) fail('RUNTIME_INVALID')
    for (const step of runs.steps) {
      if (!mapping(step) || own(step, 'uses') === own(step, 'run')) fail('RUNTIME_INVALID')
      if (own(step, 'uses') ? !nonempty(step.uses) : !(nonempty(step.run) && nonempty(step.shell))) fail('RUNTIME_INVALID')
    }
  } else fail('RUNTIME_INVALID')
  if (own(metadata, 'inputs') && !mapping(metadata.inputs)) fail('INPUTS_INVALID')
  for (const input of Object.values(metadata.inputs ?? {})) {
    if (!mapping(input) || (own(input, 'required') && typeof input.required !== 'boolean')) fail('INPUTS_INVALID')
    if (own(input, 'default') && input.default !== null && !['string', 'boolean', 'number'].includes(typeof input.default)) fail('INPUTS_INVALID')
  }
  return metadata
}

function validateInputs(ref, metadata) {
  const declared = metadata.inputs ?? {}
  for (const name of ref.inputs) if (!own(declared, name)) fail('INPUT_UNKNOWN')
  for (const [name, input] of Object.entries(declared)) {
    if (input.required === true && !ref.inputs.includes(name) && (!own(input, 'default') || input.default === null)) fail('INPUT_REQUIRED')
  }
}
// END_BLOCK_ACTION_METADATA

export async function validateActionRefs(refs, options = {}) {
  // START_BLOCK_VALIDATE_BATCH
  if (!Array.isArray(refs) || !mapping(options)) fail('OPTIONS_INVALID')
  const parsed = refs.map(ref => {
    if (!mapping(ref) || (ref.inputs !== undefined && (!Array.isArray(ref.inputs) || ref.inputs.some(name => typeof name !== 'string')))) fail('USES_INVALID')
    return { ...actionIdentity(ref.uses), inputs: [...(ref.inputs ?? [])] }
  })
  const context = batchContext(options)
  const commits = new Map(), actions = new Map()
  let index = 0
  const commit = ref => {
    const key = `${ref.owner}/${ref.repo}@${ref.sha}`
    if (!commits.has(key)) commits.set(key, (async () => {
      const payload = await requestJSON(`/repos/${ref.owner}/${ref.repo}/git/commits/${ref.sha}`, context)
      if (typeof payload.sha !== 'string' || payload.sha.toLowerCase() !== ref.sha) fail('COMMIT_IDENTITY')
    })())
    return commits.get(key)
  }
  const action = ref => {
    const key = `${ref.owner}/${ref.repo}/${ref.subpath.join('/')}@${ref.sha}`
    if (!actions.has(key)) actions.set(key, (async () => {
      await commit(ref)
      const prefix = `/repos/${ref.owner}/${ref.repo}/contents/${ref.subpath.length ? `${ref.subpath.join('/')}/` : ''}`
      let payload = await requestJSON(`${prefix}action.yml?ref=${ref.sha}`, context, true)
      if (payload === null) payload = await requestJSON(`${prefix}action.yaml?ref=${ref.sha}`, context, true)
      if (payload === null) fail('METADATA_MISSING')
      return actionMetadata(payload)
    })())
    return actions.get(key)
  }
  const worker = async () => {
    try {
      while (index < parsed.length) {
        context.check()
        const ref = parsed[index++]
        if (ref.kind === 'external') validateInputs(ref, await action(ref))
      }
    } catch (error) { throw context.stop(error) }
  }
  try {
    await Promise.all(Array.from({ length: Math.min(context.concurrency, parsed.length) }, worker))
    return { references: refs.length, uniqueCommits: commits.size, uniqueActions: actions.size }
  } finally { context.close() }
  // END_BLOCK_VALIDATE_BATCH
}

async function readWorkflow(path) {
  let file
  try {
    file = await open(path, 'r')
    const stat = await file.stat()
    if (!stat.isFile() || stat.size > MAX_BYTES) fail('WORKFLOW_LIMIT')
    const buffer = Buffer.alloc(MAX_BYTES + 1)
    let size = 0
    while (size < buffer.length) {
      const { bytesRead } = await file.read(buffer, size, buffer.length - size, null)
      if (!bytesRead) break
      size += bytesRead
    }
    if (size > MAX_BYTES) fail('WORKFLOW_LIMIT')
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(0, size))
  } catch (error) { throw asFailure(error, 'WORKFLOW_READ_FAILED') }
  finally { if (file) await file.close() }
}

export async function runActionRefCheck(workspaceRoot, options = {}) {
  const workflows = {}
  for (const name of WORKFLOWS) {
    const relative = `.github/workflows/${name}`
    workflows[relative] = await readWorkflow(resolve(workspaceRoot, relative))
  }
  return validateActionRefs(collectActionRefs(workflows), options)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = await runActionRefCheck(process.cwd(), { token: process.env.GITHUB_TOKEN })
    console.log(`[ActionReferences][validate][BLOCK_ACTION_REFERENCES_CONFIRMED] references=${result.references} uniqueCommits=${result.uniqueCommits} uniqueActions=${result.uniqueActions}`)
  } catch (error) {
    console.error(`[ActionReferences][validate][BLOCK_ACTION_REFERENCES_FAILED] code=${asFailure(error, 'INTERNAL').message}`)
    process.exitCode = 1
  }
}
