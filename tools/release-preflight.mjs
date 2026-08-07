#!/usr/bin/env node
// FILE: tools/release-preflight.mjs
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Stop release packaging when Node, Cargo, Tauri, lockfile, or requested-tag versions disagree.
//   SCOPE: Read public version metadata, normalize exact values, validate equality, and emit stable release-gate diagnostics; never reads signing credentials.
//   DEPENDS: Node.js fs, path, and url standard-library modules; package.json; package-lock.json; Cargo.toml; Cargo.lock; src-tauri/tauri.conf.json.
//   LINKS: docs/knowledge-graph.xml M-046; docs/verification-plan.xml V-M-046; docs/requirements.xml UC-032.
//   ROLE: SCRIPT
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   ReleasePreflightError - Stable coded error for release metadata and tag mismatches.
//   readVersionEvidence - Reads all authoritative release-version sources.
//   validateVersionEvidence - Enforces one exact version and optional v<version> tag.
//   runReleasePreflight - Runs the gate and emits the stable success marker.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   - 2026-08-07 v1.0.0: add deterministic v2.1.1-beta metadata/tag validation before release packaging.
// END_CHANGE_SUMMARY

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const VERSION_SOURCE_COUNT = 6

export class ReleasePreflightError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'ReleasePreflightError'
    this.code = code
  }
}

const readJson = (pathname) => JSON.parse(readFileSync(pathname, 'utf8'))

const matchVersion = (contents, pattern, sourceName) => {
  const match = contents.match(pattern)
  if (!match) {
    throw new ReleasePreflightError(
      'MT_RELEASE_VERSION_MISMATCH',
      `${sourceName}=missing`
    )
  }
  return match[1]
}

// START_CONTRACT: readVersionEvidence
//   PURPOSE: Read the embedded release version from every Node, Cargo, lockfile, and Tauri authority.
//   INPUTS: { workspaceRoot: string - absolute or relative repository root }
//   OUTPUTS: { Record<string, string> - source label to exact version value }
//   SIDE_EFFECTS: Reads six public metadata values from five repository files.
//   LINKS: docs/verification-plan.xml V-M-046 S1-S2
// END_CONTRACT: readVersionEvidence
// START_BLOCK_READ_RELEASE_VERSION_EVIDENCE
export const readVersionEvidence = (workspaceRoot) => {
  const root = resolve(workspaceRoot)
  const packageJson = readJson(resolve(root, 'package.json'))
  const packageLock = readJson(resolve(root, 'package-lock.json'))
  const cargoToml = readFileSync(resolve(root, 'Cargo.toml'), 'utf8')
  const cargoLock = readFileSync(resolve(root, 'Cargo.lock'), 'utf8')
  const tauriConfig = readJson(resolve(root, 'src-tauri/tauri.conf.json'))

  return {
    packageJson: packageJson.version,
    packageLock: packageLock.version,
    packageLockRoot: packageLock.packages?.['']?.version,
    cargoWorkspace: matchVersion(
      cargoToml,
      /\[workspace\.package\][\s\S]*?^version\s*=\s*"([^"]+)"/m,
      'cargoWorkspace'
    ),
    cargoLockMark: matchVersion(
      cargoLock,
      /\[\[package\]\]\s*\nname\s*=\s*"mark"\s*\nversion\s*=\s*"([^"]+)"/m,
      'cargoLockMark'
    ),
    tauriConfig: tauriConfig.version
  }
}
// END_BLOCK_READ_RELEASE_VERSION_EVIDENCE

// START_CONTRACT: validateVersionEvidence
//   PURPOSE: Enforce identical non-empty metadata versions and an optional exact v<version> release tag.
//   INPUTS: { evidence: Record<string, string> - normalized source versions, expectedTag: string|undefined - requested release tag }
//   OUTPUTS: { { version: string, tag: string|null, sourceCount: number } - validated release identity }
//   SIDE_EFFECTS: none; throws ReleasePreflightError on mismatch.
//   LINKS: docs/verification-plan.xml V-M-046 S1-S3
// END_CONTRACT: validateVersionEvidence
// START_BLOCK_VALIDATE_RELEASE_VERSION_EVIDENCE
export const validateVersionEvidence = (evidence, expectedTag) => {
  const entries = Object.entries(evidence)
  const [firstSource, version] = entries[0] ?? []
  const mismatches = entries.filter(([, value]) => !value || value !== version)

  if (!version || entries.length !== VERSION_SOURCE_COUNT || mismatches.length) {
    const summary = entries
      .map(([source, value]) => `${source}=${value ?? 'missing'}`)
      .join(',')
    throw new ReleasePreflightError(
      'MT_RELEASE_VERSION_MISMATCH',
      `baseline=${firstSource ?? 'missing'};${summary}`
    )
  }

  const canonicalTag = `v${version}`
  if (expectedTag && expectedTag !== canonicalTag) {
    throw new ReleasePreflightError(
      'MT_RELEASE_TAG_MISMATCH',
      `expected=${canonicalTag};actual=${expectedTag}`
    )
  }

  return {
    version,
    tag: expectedTag ?? null,
    sourceCount: entries.length
  }
}
// END_BLOCK_VALIDATE_RELEASE_VERSION_EVIDENCE

// START_CONTRACT: runReleasePreflight
//   PURPOSE: Execute the release version gate for a workspace and emit stable success evidence.
//   INPUTS: { workspaceRoot: string - repository root, expectedTag: string|undefined - optional release tag }
//   OUTPUTS: { validated release identity from validateVersionEvidence }
//   SIDE_EFFECTS: Reads metadata files and writes one path-free success marker to stdout.
//   LINKS: docs/verification-plan.xml V-M-046 required-log-markers
// END_CONTRACT: runReleasePreflight
// START_BLOCK_RUN_RELEASE_PREFLIGHT
export const runReleasePreflight = (workspaceRoot, expectedTag) => {
  const result = validateVersionEvidence(
    readVersionEvidence(workspaceRoot),
    expectedTag
  )
  console.info(
    `[ReleasePreflight][validateVersions][BLOCK_RELEASE_VERSION_CONSISTENT] version=${result.version} tag=${result.tag ?? 'not-requested'} sources=${result.sourceCount}`
  )
  return result
}
// END_BLOCK_RUN_RELEASE_PREFLIGHT

const parseExpectedTag = (args) => {
  const tagIndex = args.indexOf('--tag')
  if (tagIndex === -1) return undefined
  const tag = args[tagIndex + 1]
  if (!tag || tag.startsWith('--')) {
    throw new ReleasePreflightError(
      'MT_RELEASE_TAG_MISMATCH',
      'expected=v<version>;actual=missing'
    )
  }
  return tag
}

const main = () => {
  try {
    runReleasePreflight(process.cwd(), parseExpectedTag(process.argv.slice(2)))
  } catch (error) {
    const code = error?.code ?? 'MT_RELEASE_VERSION_MISMATCH'
    const block =
      code === 'MT_RELEASE_TAG_MISMATCH'
        ? 'BLOCK_RELEASE_TAG_MISMATCH'
        : 'BLOCK_RELEASE_VERSION_MISMATCH'
    console.error(
      `[ReleasePreflight][validateVersions][${block}] code=${code} ${error.message}`
    )
    process.exitCode = 1
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : ''
if (import.meta.url === invokedPath) main()
