// @vitest-environment node
// FILE: tests/tools/node-version-pin.test.mjs
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Pin a single source of truth for the Node version across the
//   release/build workflow (release.yml) and the check workflow that mirrors
//   it (test.yml): every setup-node step resolves its runtime from the
//   repo-level .nvmrc instead of each job independently restating a major
//   so checks and packaging can never drift onto different exact runtimes
//   (cicd f-005: the workflows independently resolved "Node 22", leaving
//   the minor/patch version to runner timing).
//   SCOPE: The checked-in release.yml and test.yml parsed with the lockfile
//   yaml package; the repo-root .nvmrc read as text. No execution, no
//   network, no repository mutation.
//   DEPENDS: Vitest; yaml (lockfile devDependency); node:fs/path/url built-ins.
//   LINKS: .github/workflows/release.yml; .github/workflows/test.yml; .nvmrc.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
// START_MODULE_MAP
//   releaseWorkflow - checked-in release.yml parsed with the yaml package.
//   testWorkflow - checked-in test.yml parsed with the yaml package.
//   setupNodeSteps - every step of a workflow whose uses names actions/setup-node.
//   nvmrc - the repo-root .nvmrc text (the single source of truth).
//   repoRoot - repository root resolved from this file's location.
// END_MODULE_MAP
// START_CHANGE_SUMMARY
//   - 2026-11-26 cicd f-005: structural gate lands FIRST and red by design —
//   on the pre-fix workflow text every setup-node step carries a literal
//   node-version: '22' and no node-version-file, so checks and packaging
//   independently resolve the exact runtime; the workflow fix points every
//   step at the repo-level .nvmrc (a concrete major.minor.patch the two
//   workflows share) and flips the gate green.
// END_CHANGE_SUMMARY

import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const releaseWorkflow = parse(readFileSync(join(repoRoot, '.github/workflows/release.yml'), 'utf8'))
const testWorkflow = parse(readFileSync(join(repoRoot, '.github/workflows/test.yml'), 'utf8'))
const nvmrc = readFileSync(join(repoRoot, '.nvmrc'), 'utf8')

// Every setup-node step of every job (matrix jobs included — the step list
// is per job, the runtime choice must be uniform across all of them).
const setupNodeSteps = (workflow, fileName) => {
  const found = []
  for (const [jobKey, job] of Object.entries(workflow.jobs ?? {})) {
    for (const step of job?.steps ?? []) {
      if (typeof step?.uses === 'string' && step.uses.startsWith('actions/setup-node')) {
        found.push({ fileName, job: jobKey, step })
      }
    }
  }
  return found
}

describe('node version single source of truth (cicd f-005)', () => {
  it('the repo-level .nvmrc pins one concrete exact runtime', () => {
    // A drift-proof source of truth names major.minor.patch — a bare
    // major leaves the exact version to setup-node's resolution timing.
    expect(nvmrc.trim()).toMatch(/^\d+\.\d+\.\d+$/)
  })

  it('every release.yml and test.yml setup-node step reads the .nvmrc', () => {
    const steps = [
      ...setupNodeSteps(releaseWorkflow, 'release.yml'),
      ...setupNodeSteps(testWorkflow, 'test.yml')
    ]
    // The gate must cover the whole runtime surface: release/admission,
    // manual QA, build, sign in release.yml and every check lane in
    // test.yml.
    expect(steps.length).toBeGreaterThanOrEqual(8)
    for (const { fileName, job, step } of steps) {
      expect(
        step.with?.['node-version-file'],
        `${fileName} job ${job}: setup-node must resolve from .nvmrc`
      ).toBe('.nvmrc')
      expect(
        step.with?.['node-version'],
        `${fileName} job ${job}: a literal node-version restates the runtime per job and reintroduces the drift`
      ).toBeUndefined()
    }
  })
})
