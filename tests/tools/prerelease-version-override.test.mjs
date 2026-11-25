// @vitest-environment node
// FILE: tests/tools/prerelease-version-override.test.mjs
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Execute the release workflow's prerelease version-injection shell against a synthetic build-override config, proving a prerelease build consumes the exact tag version (tag↔version parity) instead of silently keeping the repo base version — instead of trusting workflow text pins alone (F-008: the beta DMG is named from the tag while the strict metadata preflight that pins tag=metadata on the stable lane is skipped, so the bundle kept the base version).
//   SCOPE: The checked-in release.yml parsed with the lockfile yaml package and its build job's steps located by exact name; every fixture lives in a per-test temp tree; no network, no tauri build, no repository mutation outside the temp tree.
//   DEPENDS: Vitest; yaml (lockfile devDependency); node:child_process/fs/os/path/url built-ins; bash, skipped with an explicit reason where absent.
//   LINKS: .github/workflows/release.yml build job; tools/prepare-qa-artifacts.mjs config-merge precedent.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
// START_MODULE_MAP
//   releaseWorkflow - checked-in release.yml read as text and parsed with the yaml package.
//   buildSteps - the build job's step list from the parsed workflow.
//   findStepRun - extracts a step's run: shell text from the build job by exact name.
//   overrideScript - the inject prerelease version override step's run text (executed verbatim).
//   stepIndexByName - the position of a named step in the build job, for the before-the-build ordering pin.
//   writeOverrideConfig - writes the unsigned-build.config.json fixture exactly as the workflow's write step does.
//   runOverride - spawns bash -c over the override text under RUNNER_TEMP/TAG.
//   readConfig - parses the resulting override config from the per-test RUNNER_TEMP.
//   repoRoot - repository root resolved from this file's location.
//   hostHasBash - one-time probe gating the shell cases.
//   bashSkipReason - explicit reason reported when the shell cases are skipped.
//   makeTempRoot - the per-test temp tree under the OS temp dir; the only directory any test writes to or removes.
// END_MODULE_MAP
// START_CHANGE_SUMMARY
//   - 2026-11-25 v1.0.0 CICD-GUARD-FIXES F-008: execution gate lands FIRST and red by design — on the pre-fix workflow text there is no version-override step to extract, so a prerelease bundle kept the repo base version while its DMG was named from the tag; the workflow fix adds the prerelease-only injection and flips the gate green (beta tag, stable-shaped tag, missing-config refusal) while the step's prerelease-only condition and its position before the tauri build steps stay pinned.
// END_CHANGE_SUMMARY

import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const releaseWorkflow = parse(readFileSync(join(repoRoot, '.github/workflows/release.yml'), 'utf8'))

const buildSteps = releaseWorkflow.jobs?.build?.steps
if (!Array.isArray(buildSteps)) throw new Error('release.yml has no build step list')

// Step lookup by EXACT name; the extracted run: text is executed verbatim —
// the gate never hardcodes a copy of the workflow's shell.
const findStepRun = (stepName) => {
  const step = buildSteps.find((candidate) => candidate && candidate.name === stepName)
  if (!step) throw new Error(`release.yml build has no step named "${stepName}"`)
  if (typeof step.run !== 'string' || step.run.trim() === '')
    throw new Error(`release.yml build step "${stepName}" carries no run: shell text`)
  return step.run
}

const overrideScript = () => findStepRun('inject prerelease version override')
const stepIndexByName = (stepName) =>
  buildSteps.findIndex((candidate) => candidate && candidate.name === stepName)

const hostHasBash = (() => {
  const probe = spawnSync('bash', ['-c', 'true'], { encoding: 'utf8', timeout: 5000 })
  return !probe.error && probe.status === 0
})()
const bashSkipReason =
  'skipped: this host has no working bash — the gate executes the extracted workflow shell with bash -c'

const makeTempRoot = () => mkdtempSync(join(tmpdir(), 'prerelease-version-'))

// Exactly the bytes the workflow's write unsigned bundle override step
// produces — the injection step must preserve the bundle key it finds.
const writeOverrideConfig = (runnerTemp) => {
  writeFileSync(
    join(runnerTemp, 'unsigned-build.config.json'),
    `${JSON.stringify({ bundle: { createUpdaterArtifacts: false } }, null, 2)}\n`
  )
}

const runOverride = ({ script, runnerTemp, tag }) =>
  spawnSync('bash', ['-c', script], {
    encoding: 'utf8',
    cwd: runnerTemp,
    env: { ...process.env, RUNNER_TEMP: runnerTemp, TAG: tag }
  })

const readConfig = (runnerTemp) =>
  JSON.parse(readFileSync(join(runnerTemp, 'unsigned-build.config.json'), 'utf8'))

describe('prerelease version override execution gate (F-008)', () => {
  it('wires the injection into the prerelease lane before the tauri build', () => {
    const stepIndex = stepIndexByName('inject prerelease version override')
    expect(stepIndex).toBeGreaterThan(-1)
    // Prerelease-only: the stable lane's text stays byte-identical and its
    // admitted metadata already equals the tag.
    expect(buildSteps[stepIndex].if).toBe("needs.authorize-tag.outputs.prerelease == 'true'")
    // The version source is the workflow's own resolved tag.
    expect(buildSteps[stepIndex].env?.TAG).toBe('${{ steps.resolve_tag.outputs.tag }}')
    // The injection must land before either tauri build consumes the config.
    const macBuildIndex = stepIndexByName('tauri build (macOS unsigned bundle)')
    const windowsBuildIndex = stepIndexByName('tauri build (Windows unsigned bundle)')
    expect(stepIndex).toBeLessThan(macBuildIndex)
    expect(stepIndex).toBeLessThan(windowsBuildIndex)
    // Both builds still consume the very config the injection rewrites.
    for (const step of [buildSteps[macBuildIndex], buildSteps[windowsBuildIndex]]) {
      expect(step.with?.args).toContain('unsigned-build.config.json')
    }
  })

  it.skipIf(!hostHasBash)(
    'injects the tag version into the build override for a beta tag',
    () => {
      const tempRoot = makeTempRoot()
      try {
        writeOverrideConfig(tempRoot)
        const result = runOverride({ script: overrideScript(), runnerTemp: tempRoot, tag: 'v1.2.3-beta.1' })
        expect(result.status, `override step failed:\n${result.stderr ?? ''}`).toBe(0)
        const config = readConfig(tempRoot)
        expect(config.version).toBe('1.2.3-beta.1')
        // The bundle override the write step produced survives the merge.
        expect(config.bundle).toEqual({ createUpdaterArtifacts: false })
      } finally {
        rmSync(tempRoot, { recursive: true, force: true })
      }
    }
  )

  it.skipIf(!hostHasBash)(
    'carries the exact tag body without the leading v',
    () => {
      const tempRoot = makeTempRoot()
      try {
        writeOverrideConfig(tempRoot)
        const result = runOverride({ script: overrideScript(), runnerTemp: tempRoot, tag: 'v2.9.0' })
        expect(result.status, `override step failed:\n${result.stderr ?? ''}`).toBe(0)
        expect(readConfig(tempRoot).version).toBe('2.9.0')
      } finally {
        rmSync(tempRoot, { recursive: true, force: true })
      }
    }
  )

  it.skipIf(!hostHasBash)('fails closed on a missing override config', () => {
    const tempRoot = makeTempRoot()
    try {
      const result = runOverride({ script: overrideScript(), runnerTemp: tempRoot, tag: 'v1.2.3-beta.1' })
      expect(result.status).not.toBe(0)
    } finally {
      rmSync(tempRoot, { recursive: true, force: true })
    }
  })
})
