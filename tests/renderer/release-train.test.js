// FILE: tests/renderer/release-train.test.js
// VERSION: 1.1.0
// START_MODULE_CONTRACT
//   PURPOSE: Prove the current-train pointer is the only place a train ID is named, and that it fails closed on malformed or traversing IDs.
//   SCOPE: Pointer resolution, path derivation, CLI path/field output, and a repository sweep for hardcoded train IDs in workflows and tools.
//   DEPENDS: Vitest; Node.js child_process/fs/os/path; tools/release-train.mjs.
//   LINKS: .grace/verification/features.xml V-M-046.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   pointerRoot - Build a temporary workspace holding one pointer document.
//   POINTER_CONSUMERS - Workflows and tools that must resolve the train through the pointer.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   - 2026-10-30 v1.1.0: lane trains — listLaneTrains returns td-N documents only, numerically ordered.
//   - 2026-10-24 v1.0.0: C-RELEASE-CONVEYOR — new.
// END_CHANGE_SUMMARY

import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { listLaneTrains, resolveCurrentTrain, trainPaths } from '../../tools/release-train.mjs'

const pointerRoot = (pointer) => {
  const root = mkdtempSync(resolve(tmpdir(), 'mark-release-train-'))
  mkdirSync(resolve(root, 'docs/release-trains'), { recursive: true })
  if (pointer !== undefined) {
    writeFileSync(resolve(root, 'docs/release-trains/current.json'), JSON.stringify(pointer))
  }
  return root
}

const POINTER_CONSUMERS = [
  '.github/workflows/release.yml',
  '.github/workflows/promote-release.yml',
  '.github/workflows/release-governance.yml',
  'tools/release-readiness.mjs',
  'tools/release-normalize.mjs',
  'tools/release-governance.mjs',
  'tools/release-materials.mjs',
  'tools/release-project-sync.mjs',
  'tools/acceptance-registry.mjs'
]

// START_BLOCK_RELEASE_TRAIN_POINTER_TESTS
describe('current release train pointer', () => {
  it('resolves the checked-in pointer to an existing train and ledger', () => {
    const current = resolveCurrentTrain(process.cwd())
    const train = JSON.parse(readFileSync(resolve(current.json), 'utf8'))
    expect(train.trainId).toBe(current.trainId)
    expect(readFileSync(resolve(current.markdown), 'utf8')).toContain(`[${current.trainId}.json]`)
  })

  it('derives both paths from one validated ID', () => {
    expect(trainPaths('2.9.x-next')).toEqual({
      trainId: '2.9.x-next',
      json: 'docs/release-trains/2.9.x-next.json',
      markdown: 'docs/release-trains/2.9.x-next.md'
    })
  })

  it.each(['../../etc/passwd', '2.9.x-next/../../x', '2.9', '', null])(
    'rejects the malformed or traversing ID %s',
    (trainId) => {
      expect(() => resolveCurrentTrain(pointerRoot({ schemaVersion: '1.0.0', trainId }))).toThrow(
        expect.objectContaining({ code: 'MT_RELEASE_TRAIN_POINTER_INVALID' })
      )
    }
  )

  it('rejects a missing pointer and an unknown schema', () => {
    expect(() => resolveCurrentTrain(pointerRoot())).toThrow(
      expect.objectContaining({ code: 'MT_RELEASE_TRAIN_POINTER_INVALID' })
    )
    expect(() =>
      resolveCurrentTrain(pointerRoot({ schemaVersion: '9.0.0', trainId: '2.9.x-next' }))
    ).toThrow(expect.objectContaining({ code: 'MT_RELEASE_TRAIN_POINTER_INVALID' }))
  })

  it('prints the train path and one field for shell callers', () => {
    const current = resolveCurrentTrain(process.cwd())
    const run = (...args) =>
      execFileSync('node', ['tools/release-train.mjs', ...args], { encoding: 'utf8' }).trim()
    expect(run()).toBe(current.json)
    expect(run('--markdown')).toBe(current.markdown)
    const train = JSON.parse(readFileSync(resolve(current.json), 'utf8'))
    expect(run('--field', 'state')).toBe(train.state)
  })

  it('leaves no hardcoded train ID in release workflows and tools', () => {
    for (const path of POINTER_CONSUMERS) {
      expect(readFileSync(resolve(path), 'utf8'), path).not.toMatch(
        /docs\/release-trains\/\d+\.\d+\.(x|\d+)-next\.(json|md)/
      )
    }
  })
})
// END_BLOCK_RELEASE_TRAIN_POINTER_TESTS

// START_BLOCK_LANE_TRAIN_LIST_TESTS
describe('lane train listing', () => {
  it('lists only td-N documents, in numeric order, never the product trains', () => {
    const root = pointerRoot({ schemaVersion: '1.0.0', trainId: '2.9.x-next' })
    for (const name of ['td-10.json', 'td-2.json', 'td-0.json', 'td-x.json', '2.9.x-next.json', 'td-2.md']) {
      writeFileSync(resolve(root, 'docs/release-trains', name), '{}')
    }
    expect(listLaneTrains(root).map(({ trainId }) => trainId)).toEqual(['td-2', 'td-10'])
    expect(listLaneTrains(root)[0]).toEqual({
      trainId: 'td-2',
      json: 'docs/release-trains/td-2.json',
      markdown: 'docs/release-trains/td-2.md'
    })
  })

  it('returns no lanes when the train directory is absent', () => {
    expect(listLaneTrains(mkdtempSync(resolve(tmpdir(), 'mark-release-lanes-')))).toEqual([])
  })
})
// END_BLOCK_LANE_TRAIN_LIST_TESTS
