#!/usr/bin/env node
// FILE: tools/acceptance-registry.mjs
// VERSION: 1.2.0
// START_MODULE_CONTRACT
//   PURPOSE: Validate the acceptance registry (docs/acceptance/registry.json) against its schema and the collecting train, and print the per-item survey — the ordered "accepted or not, and why" record behind the release trains.
//   SCOPE: --check (schema, git sha resolvability, two-way train consistency, lifecycle sanity) and --survey (state table). Read-only; --check exits non-zero with stable MT_ACCEPT_* codes on any violation.
//   DEPENDS: node:fs, node:child_process (git cat-file), tools/release-train.mjs (current train).
//   LINKS: docs/acceptance/README.md; docs/release-trains/README.md acceptance stage; .grace/graph/features.xml M-046; .grace/verification/features.xml V-M-046; tests/renderer/acceptance-registry.test.js.
//   ROLE: SCRIPT
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   ROOT - repo root path.
//   REGISTRY_PATH - registry JSON relative path.
//   TRAIN_PATH - collecting train relative path.
//   listTrainFiles - list every train ledger JSON in docs/release-trains.
//   STATES - STATES - top-level STATES used by the script flow.
//   VERDICTS - VERDICTS - top-level VERDICTS used by the script flow.
//   AcceptanceRegistryError - coded MT_ACCEPT_* error class.
//   fail - raise a coded error.
//   readRegistry - load the registry JSON from a root.
//   shaExists - git cat-file commit resolvability check.
//   isSha - 40-hex test.
//   validateRegistry - schema + git + train cross-checks; throws coded errors.
//   surveyLines - registry -> markdown survey rows.
//   invokedDirectly - direct CLI execution detection.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.2.0 - 2026-10-25: an artifact built from a squash-merged PR head resolves through its recorded merge commit (source.pullRequest + source.mergedAs), since the head is not on main.
//   PREV: v1.1.0 - 2026-10-24 C-RELEASE-CONVEYOR: resolve the collecting train through the current-train pointer.
//   PREV: v1.0.0 - 2026-10-21 C-ACCEPTANCE-REGISTRY: new.
// END_CHANGE_SUMMARY

import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveCurrentTrain } from './release-train.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const REGISTRY_PATH = 'docs/acceptance/registry.json'
const TRAIN_PATH = resolveCurrentTrain(ROOT).json
const listTrainFiles = (root) => {
  try {
    return readdirSync(resolve(root, 'docs/release-trains'))
      .filter((f) => f.endsWith('.json') && /^[0-9][0-9.]*x-next\.json$/.test(f))
      .map((f) => `docs/release-trains/${f}`)
  } catch {
    return []
  }
}

const STATES = new Set(['reported', 'repaired', 'reviewed', 'artifact-offered', 'owner-verdict', 'queued'])
const VERDICTS = new Set(['accepted', 'rejected', 'approve', 'changes-requested', 'two-actionable'])

export class AcceptanceRegistryError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'AcceptanceRegistryError'
    this.code = code
  }
}

const fail = (code, message) => {
  throw new AcceptanceRegistryError(code, message)
}

export const readRegistry = (root = ROOT) =>
  JSON.parse(readFileSync(resolve(root, REGISTRY_PATH), 'utf8'))

const shaExists = (root, sha) => {
  try {
    execFileSync('git', ['cat-file', '-e', `${sha}^{commit}`], { cwd: root, stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

const isSha = (value) => typeof value === 'string' && /^[0-9a-f]{40}$/.test(value)

// START_BLOCK_VALIDATE_REGISTRY
export const validateRegistry = (registry, { train, shaExists: shaOk = () => true } = {}) => {
  if (registry?.schemaVersion !== '1.0.0') fail('MT_ACCEPT_SCHEMA_INVALID', 'schema=missing')
  if (!Array.isArray(registry?.artifacts)) fail('MT_ACCEPT_SCHEMA_INVALID', 'artifacts=missing')
  if (!Array.isArray(registry?.items)) fail('MT_ACCEPT_SCHEMA_INVALID', 'items=missing')

  const artifactIds = new Set()
  for (const a of registry.artifacts) {
    if (!a?.id || artifactIds.has(a.id)) fail('MT_ACCEPT_SCHEMA_AMBIGUOUS', `artifact=${a?.id}`)
    artifactIds.add(a.id)
    if (!isSha(a?.source?.sha)) fail('MT_ACCEPT_SHA_INVALID', `artifact=${a.id}`)
    // Squash merges leave a PR head off main: such an artifact records its
    // PR and the merge commit, and that merge commit must resolve instead.
    const viaMerge = Number.isInteger(a.source.pullRequest) && isSha(a.source.mergedAs) && shaOk(a.source.mergedAs)
    if (!shaOk(a.source.sha) && !viaMerge) fail('MT_ACCEPT_SHA_INVALID', `artifact=${a.id};sha=${a.source.sha}`)
    if (!Array.isArray(a.covers) || a.covers.length === 0) fail('MT_ACCEPT_SCHEMA_INVALID', `artifact=${a.id};covers=missing`)
  }

  const latest = new Map()
  for (const item of registry.items) {
    if (!item?.id || !Array.isArray(item.events) || item.events.length === 0) {
      fail('MT_ACCEPT_SCHEMA_INVALID', `item=${item?.id};events=missing`)
    }
    let seenOfferOrNa = false
    for (const e of item.events) {
      if (!STATES.has(e?.state)) fail('MT_ACCEPT_LIFECYCLE_INVALID', `item=${item.id};state=${e?.state}`)
      if (e.state === 'reviewed' && e.verdict && !VERDICTS.has(e.verdict)) {
        fail('MT_ACCEPT_LIFECYCLE_INVALID', `item=${item.id};verdict=${e.verdict}`)
      }
      if (e.state === 'artifact-offered') {
        if (e.artifact && !artifactIds.has(e.artifact)) {
          fail('MT_ACCEPT_ARTIFACT_UNKNOWN', `item=${item.id};artifact=${e.artifact}`)
        }
        if (!e.artifact && !e.notApplicable && !e.blocked) {
          fail('MT_ACCEPT_OFFER_AMBIGUOUS', `item=${item.id};reason=missing`)
        }
        if (e.artifact || e.notApplicable || e.blocked) seenOfferOrNa = true
      }
      if (e.state === 'owner-verdict' && e.verdict === 'accepted' && !Array.isArray(e.scenarios)) {
        fail('MT_ACCEPT_SCHEMA_INVALID', `item=${item.id};scenarios=missing`)
      }
      if (e.state === 'owner-verdict' && e.verdict === 'rejected' && !e.detail) {
        fail('MT_ACCEPT_SCHEMA_INVALID', `item=${item.id};rejection=reason-missing`)
      }
    }
    latest.set(item.id, item)
    // An accepted item must have passed through an offer (or n/a) first.
    const accepted = item.events.some((e) => e.state === 'owner-verdict' && e.verdict === 'accepted')
    if (accepted && !seenOfferOrNa && !item.events.some((e) => e.state === 'owner-verdict' && e.detail?.includes('review'))) {
      fail('MT_ACCEPT_LIFECYCLE_INVALID', `item=${item.id};accepted-without-offer`)
    }
  }

  if (train) {
    const admitted = new Set([
      ...(train.items?.userFacing || []).map((i) => i.id),
      ...(train.items?.operational || []).map((i) => i.id)
    ])
    // Shipped items stay admitted through their own train: every
    // Frozen/Ready/Released ledger in docs/release-trains keeps its
    // items valid for the queued-in-train contract, so opening the next
    // train does not strand the previous release's accepted items.
    for (const ledger of listTrainFiles(ROOT).filter((f) => f !== TRAIN_PATH)) {
      try {
        const other = JSON.parse(readFileSync(resolve(ROOT, ledger), 'utf8'))
        if (['Frozen', 'Ready', 'Released'].includes(other?.state)) {
          for (const id of [
            ...((other.items?.userFacing || []).map((i) => i.id)),
            ...((other.items?.operational || []).map((i) => i.id))
          ]) {
            admitted.add(id)
          }
        }
      } catch {
        // unreadable sibling ledger — the primary train already gated
      }
    }
    // Registry-accepted => train-admitted.
    for (const item of registry.items) {
      const acceptedEvent = [...item.events].reverse().find((e) => e.state === 'owner-verdict' && e.verdict === 'accepted')
      if (acceptedEvent) {
        const queued = item.events.some((e) => e.state === 'queued')
        if (queued && !admitted.has(item.id)) {
          fail('MT_ACCEPT_REGISTRY_MISMATCH', `item=${item.id};queued-but-not-in-train`)
        }
      }
    }
    // Train pending repaired items => registry offer or documented blocker.
    const pending = (train.items?.notPresent || []).map((i) => i.id)
    const collectingMd = true
    for (const id of pending) {
      const item = latest.get(id)
      if (item) {
        const offered = item.events.some((e) => e.state === 'artifact-offered')
        if (!offered) fail('MT_ACCEPT_REGISTRY_MISMATCH', `item=${id};train-pending-without-offer`)
      }
    }
    if (collectingMd) {
      // Items repaired but not yet in the train must exist in the registry with a pending-ish state.
      for (const item of registry.items) {
        const last = item.events[item.events.length - 1]
        if (last?.state === 'queued' && !admitted.has(item.id)) {
          fail('MT_ACCEPT_REGISTRY_MISMATCH', `item=${item.id};queued-but-not-in-train`)
        }
      }
    }
  }
  return { items: registry.items.length, artifacts: registry.artifacts.length }
}
// END_BLOCK_VALIDATE_REGISTRY

// START_BLOCK_SURVEY
export const surveyLines = (registry) => {
  const rows = ['| Item | State | Artifact | Verdict / Why pending |', '|---|---|---|---|']
  for (const item of registry.items) {
    const last = item.events[item.events.length - 1]
    const offer = [...item.events].reverse().find((e) => e.state === 'artifact-offered')
    const verdict = [...item.events].reverse().find((e) => e.state === 'owner-verdict')
    const artifact = offer?.artifact || offer?.notApplicable || offer?.blocked || '—'
    let why = 'pending'
    if (verdict?.verdict === 'accepted') why = `accepted ${verdict.date}`
    else if (verdict?.verdict === 'rejected') why = `rejected ${verdict.date}: ${verdict.detail}`
    else if (offer?.blocked) why = offer.blocked
    else if (offer?.checklist) why = `${offer.checklist}`
    rows.push(`| ${item.id} | ${last?.state} | ${artifact} | ${why} |`)
  }
  return rows
}
// END_BLOCK_SURVEY

const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (invokedDirectly) {
  const mode = process.argv[2] ?? '--check'
  const registry = readRegistry()
  if (mode === '--survey') {
    console.log(surveyLines(registry).join('\n'))
    process.exit(0)
  }
  const train = existsSync(resolve(ROOT, TRAIN_PATH))
    ? JSON.parse(readFileSync(resolve(ROOT, TRAIN_PATH), 'utf8'))
    : null
  const result = validateRegistry(registry, { train, shaExists: (sha) => shaExists(ROOT, sha) })
  console.info(`[AcceptanceRegistry][validate][BLOCK_ACCEPT_REGISTRY_VALID] items=${result.items} artifacts=${result.artifacts}`)
}
