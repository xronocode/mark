// FILE: tools/release-train.mjs
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Resolve the current release train from one checked-in pointer so workflows, tools, and tests never hardcode a train ID.
//   SCOPE: Read and validate docs/release-trains/current.json, derive the train JSON/Markdown paths, and print a path or one train field for shell callers; read-only.
//   DEPENDS: Node.js fs, path, and url standard-library modules; docs/release-trains/current.json.
//   LINKS: .grace/graph/features.xml M-046; .grace/verification/features.xml V-M-046; docs/release-trains/README.md.
//   ROLE: SCRIPT
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   CURRENT_TRAIN_POINTER - Repository-relative path of the pointer document.
//   TRAIN_ID_PATTERN - Exact train ID grammar; also rejects path traversal.
//   ReleaseTrainError - Stable coded pointer error.
//   resolveCurrentTrain - Read the pointer and return the train ID plus its JSON/Markdown paths.
//   trainPaths - Derive the JSON/Markdown paths of one validated train ID.
//   main - Print the current train path, or one top-level field with --field.
//   invokedPath - Detect direct command-line execution.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   - 2026-10-24 v1.0.0: C-RELEASE-CONVEYOR — replace the train ID hardcoded in 11 workflow/tool/test files with one pointer.
// END_CHANGE_SUMMARY

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

export const CURRENT_TRAIN_POINTER = 'docs/release-trains/current.json'
export const TRAIN_ID_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(x|0|[1-9]\d*)-next$/

export class ReleaseTrainError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'ReleaseTrainError'
    this.code = code
  }
}

export const trainPaths = (trainId) => {
  if (!TRAIN_ID_PATTERN.test(trainId ?? '')) {
    throw new ReleaseTrainError('MT_RELEASE_TRAIN_POINTER_INVALID', `trainId=${trainId ?? 'missing'}`)
  }
  return {
    trainId,
    json: `docs/release-trains/${trainId}.json`,
    markdown: `docs/release-trains/${trainId}.md`
  }
}

// START_CONTRACT: resolveCurrentTrain
//   PURPOSE: Read the single current-train pointer and derive the train's repository-relative paths.
//   INPUTS: { workspaceRoot: string - repository root }
//   OUTPUTS: { object - trainId, json, markdown }
//   SIDE_EFFECTS: Reads one public repository file.
//   LINKS: .grace/verification/features.xml V-M-046
// END_CONTRACT: resolveCurrentTrain
// START_BLOCK_RESOLVE_CURRENT_TRAIN
export const resolveCurrentTrain = (workspaceRoot = process.cwd()) => {
  let pointer
  try {
    pointer = JSON.parse(readFileSync(resolve(workspaceRoot, CURRENT_TRAIN_POINTER), 'utf8'))
  } catch (error) {
    throw new ReleaseTrainError('MT_RELEASE_TRAIN_POINTER_INVALID', `pointer=unreadable;reason=${error.name}`)
  }
  if (pointer?.schemaVersion !== '1.0.0') {
    throw new ReleaseTrainError('MT_RELEASE_TRAIN_POINTER_INVALID', `schema=${pointer?.schemaVersion ?? 'missing'}`)
  }
  return trainPaths(pointer.trainId)
}
// END_BLOCK_RESOLVE_CURRENT_TRAIN

const main = () => {
  try {
    const args = process.argv.slice(2)
    const current = resolveCurrentTrain(process.cwd())
    const fieldIndex = args.indexOf('--field')
    if (fieldIndex === -1) {
      console.log(args.includes('--markdown') ? current.markdown : current.json)
      return
    }
    const field = args[fieldIndex + 1]
    if (!/^[A-Za-z]+$/.test(field ?? '')) {
      throw new ReleaseTrainError('MT_RELEASE_TRAIN_ARGUMENT_INVALID', 'field=invalid')
    }
    const train = JSON.parse(readFileSync(resolve(process.cwd(), current.json), 'utf8'))
    console.log(train[field] ?? 'null')
  } catch (error) {
    console.error(`[ReleaseTrain][resolve][BLOCK_RELEASE_TRAIN_POINTER_REJECTED] code=${error?.code ?? 'MT_RELEASE_TRAIN_POINTER_INVALID'} ${error.message}`)
    process.exitCode = 1
  }
}

const invokedPath = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : ''
if (import.meta.url === invokedPath) main()
