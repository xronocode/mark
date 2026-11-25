// @vitest-environment node
// FILE: tests/tools/docs-security-scan-base.test.mjs
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Execute the docs-security scan-base resolver shell against synthetic git repositories, proving the committed-range leak scan gets a non-empty base on every lane — pull requests scan origin/main, a push to main scans the real previous commit (the event's before SHA when it is a verified ancestor of HEAD, origin/main~1 otherwise) — instead of trusting workflow text pins alone (F-002: scan-diff origin/main on a push event resolved a merge base equal to HEAD and scanned an empty range).
//   SCOPE: The checked-in release-governance.yml parsed with the lockfile yaml package and its docs-security steps located by exact name; every fixture lives in a per-test temp tree; no network, no Gitleaks download, no repository mutation outside the temp tree.
//   DEPENDS: Vitest; yaml (lockfile devDependency); node:child_process/fs/os/path/url built-ins; bash and git, skipped with an explicit reason where absent.
//   LINKS: .github/workflows/release-governance.yml docs-security; tools/security_gate.py scan-diff.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
// START_MODULE_MAP
//   governanceWorkflow - checked-in release-governance.yml read as text and parsed with the yaml package.
//   workflowPath - the workflow file path inside the repository.
//   governanceWorkflowText - the workflow source text the parsed tree came from.
//   docsSecuritySteps - the docs-security job's step list from the parsed workflow.
//   findStepRun - extracts a step's run: shell text from the docs-security job by exact name.
//   scanStepRun - the committed-range exposure and secret scan step's run text (must consume the resolved base).
//   resolverScript - the resolve committed scan range base step's run text (executed verbatim).
//   runResolver - spawns bash -c over the resolver text under EVENT_NAME/BEFORE_SHA/GITHUB_OUTPUT in the fixture work repo, starting from a fresh output file.
//   readBase - reads the resolver's GITHUB_OUTPUT file and returns the base value.
//   makeGitFixture - builds one bare origin plus a clone with a base commit on origin/main and a newer HEAD commit; returns { workDir, baseSha, headSha }.
//   gitSync - spawnSync git helper that fails the test loudly on a nonzero status.
//   repoRoot - repository root resolved from this file's location.
//   hostHasBash - one-time probe gating the shell cases.
//   hostHasGit - one-time probe gating the git fixture cases.
//   bashSkipReason - explicit reason reported when the shell cases are skipped.
//   gitSkipReason - explicit reason reported when the git cases are skipped.
//   makeTempRoot - the per-test temp tree under the OS temp dir; the only directory any test writes to or removes.
// END_MODULE_MAP
// START_CHANGE_SUMMARY
//   - 2026-11-25 v1.0.0 CICD-GUARD-FIXES F-002: execution gate lands FIRST and red by design — on the pre-fix workflow text there is no resolver step to extract and the scan step's bare `scan-diff origin/main` vacuously scans an empty range on every push to main; the workflow fix adds the resolver and flips the gate green (pull request, fast-forward push with a real before SHA, zeroed/missing/non-ancestor before SHA fallbacks) while the scan step's consumption of the resolved base stays pinned.
// END_CHANGE_SUMMARY

import { spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const workflowPath = join(repoRoot, '.github/workflows/release-governance.yml')
const governanceWorkflowText = readFileSync(workflowPath, 'utf8')
const governanceWorkflow = parse(governanceWorkflowText)

const docsSecuritySteps = governanceWorkflow.jobs?.['docs-security']?.steps
if (!Array.isArray(docsSecuritySteps))
  throw new Error('release-governance.yml has no docs-security step list')

// Step lookup by EXACT name; the extracted run: text is executed verbatim —
// the gate never hardcodes a copy of the workflow's shell.
const findStepRun = (stepName) => {
  const step = docsSecuritySteps.find((candidate) => candidate && candidate.name === stepName)
  if (!step) throw new Error(`docs-security has no step named "${stepName}"`)
  if (typeof step.run !== 'string' || step.run.trim() === '')
    throw new Error(`docs-security step "${stepName}" carries no run: shell text`)
  return step.run
}

const resolverScript = () => findStepRun('resolve committed scan range base')
const scanStepRun = () => findStepRun('committed-range exposure and secret scan')

const hostHasBash = (() => {
  const probe = spawnSync('bash', ['-c', 'true'], { encoding: 'utf8', timeout: 5000 })
  return !probe.error && probe.status === 0
})()
const hostHasGit = (() => {
  const probe = spawnSync('git', ['--version'], { encoding: 'utf8', timeout: 5000 })
  return !probe.error && probe.status === 0
})()
const bashSkipReason =
  'skipped: this host has no working bash — the gate executes the extracted workflow shell with bash -c'
const gitSkipReason = 'skipped: this host has no git — the fixtures are real throwaway git repos'

const makeTempRoot = () => mkdtempSync(join(tmpdir(), 'docs-security-base-'))

const gitSync = (args, cwd) => {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' })
  if (result.status !== 0)
    throw new Error(`git ${args.join(' ')} failed (${result.status}):\n${result.stderr ?? ''}`)
  return result.stdout
}

// One bare origin plus a clone whose origin/main sits one commit behind the
// work repo's HEAD — the exact shape a push-to-main docs-security run sees.
const makeGitFixture = (tempRoot) => {
  const originDir = join(tempRoot, 'origin.git')
  const workDir = join(tempRoot, 'work')
  gitSync(['init', '--bare', '--initial-branch', 'main', originDir])
  gitSync(['clone', originDir, workDir])
  gitSync(['config', 'user.email', 'owner@example.com'], workDir)
  gitSync(['config', 'user.name', 'owner'], workDir)
  writeFileSync(join(workDir, 'base.md'), 'base content\n')
  gitSync(['add', 'base.md'], workDir)
  gitSync(['commit', '-m', 'base commit'], workDir)
  gitSync(['push', 'origin', 'main'], workDir)
  gitSync(['fetch', 'origin'], workDir)
  const baseSha = gitSync(['rev-parse', 'origin/main'], workDir).trim()
  writeFileSync(join(workDir, 'head.md'), 'head content\n')
  gitSync(['add', 'head.md'], workDir)
  gitSync(['commit', '-m', 'head commit'], workDir)
  const headSha = gitSync(['rev-parse', 'HEAD'], workDir).trim()
  return { workDir, baseSha, headSha }
}

const runResolver = ({ script, event, before, output, cwd }) => {
  // GitHub starts every step with a fresh output file; model that here so a
  // previous case's base= line can never satisfy a later read.
  if (existsSync(output)) unlinkSync(output)
  return spawnSync('bash', ['-c', script], {
    encoding: 'utf8',
    cwd,
    env: {
      ...process.env,
      EVENT_NAME: event,
      BEFORE_SHA: before,
      GITHUB_OUTPUT: output
    }
  })
}

const readBase = (output) => {
  expect(existsSync(output), 'the resolver never wrote its GITHUB_OUTPUT').toBe(true)
  const text = readFileSync(output, 'utf8')
  const match = text.match(/^base=(.*)$/m)
  expect(match, `no base= line in the resolver output:\n${text}`).not.toBeNull()
  return match[1].trim()
}

describe('docs-security scan base execution gate (F-002)', () => {
  it('extracts the resolver and scan steps and pins the resolved-base consumption', () => {
    const resolver = resolverScript()
    expect(resolver).toContain('merge-base --is-ancestor')
    // The push lane resolves the real previous commit and falls back to
    // origin/main~1 when the event's before SHA is missing, zeroed or not
    // an ancestor of HEAD (forced push).
    expect(resolver).toContain('origin/main~1')
    expect(resolver).not.toContain('scan-diff')
    // The scan step consumes the resolver's output — never a bare origin/main.
    const scan = scanStepRun()
    expect(scan).toContain('scan-diff')
    expect(scan).toContain('${{ steps.scan_base.outputs.base }}')
    expect(scan).not.toContain('scan-diff origin/main')
    // The step id the scan step references is the resolver step's id.
    const resolverStep = docsSecuritySteps.find(
      (candidate) => candidate && candidate.name === 'resolve committed scan range base'
    )
    expect(resolverStep.id).toBe('scan_base')
  })

  it.skipIf(!hostHasBash || !hostHasGit)(
    'resolves a real previous commit on push and origin/main on pull_request',
    { timeout: 60000 },
    () => {
      const tempRoot = makeTempRoot()
      try {
        const { workDir, baseSha, headSha } = makeGitFixture(tempRoot)
        const output = join(tempRoot, 'github-output.txt')

        // Pull request lane: the committed range is the PR diff against
        // origin/main — unchanged behavior.
        const prResult = runResolver({
          script: resolverScript(),
          event: 'pull_request',
          before: '',
          output,
          cwd: workDir
        })
        expect(prResult.status, `resolver failed:\n${prResult.stderr ?? ''}`).toBe(0)
        expect(readBase(output)).toBe('origin/main')

        // Ordinary fast-forward push: the before SHA is the verified
        // previous main commit — exactly the commit the scan must start at.
        const pushResult = runResolver({
          script: resolverScript(),
          event: 'push',
          before: baseSha,
          output,
          cwd: workDir
        })
        expect(pushResult.status, `resolver failed:\n${pushResult.stderr ?? ''}`).toBe(0)
        expect(readBase(output)).toBe(baseSha)
        expect(readBase(output)).not.toBe(headSha)
      } finally {
        rmSync(tempRoot, { recursive: true, force: true })
      }
    }
  )

  it.skipIf(!hostHasBash || !hostHasGit)(
    'falls back to origin/main~1 when the before SHA is missing, zeroed or not an ancestor',
    { timeout: 60000 },
    () => {
      const tempRoot = makeTempRoot()
      try {
        const { workDir } = makeGitFixture(tempRoot)
        const output = join(tempRoot, 'github-output.txt')

        for (const [label, before] of [
          ['missing', ''],
          ['zeroed', '0'.repeat(40)],
          ['non-ancestor', 'f'.repeat(40)]
        ]) {
          const result = runResolver({
            script: resolverScript(),
            event: 'push',
            before,
            output,
            cwd: workDir
          })
          expect(
            result.status,
            `resolver failed on the ${label} before SHA:\n${result.stderr ?? ''}`
          ).toBe(0)
          expect(readBase(output), `wrong base for the ${label} before SHA`).toBe('origin/main~1')
        }
      } finally {
        rmSync(tempRoot, { recursive: true, force: true })
      }
    }
  )
})
