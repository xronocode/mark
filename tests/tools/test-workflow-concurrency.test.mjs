// @vitest-environment node
// FILE: tests/tools/test-workflow-concurrency.test.mjs
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Pin the test workflow's concurrency policy: superseded runs
//   on branch and pull-request refs stay cancellable, but a main-branch
//   run is never cancelled in progress — cancelling checks on main must
//   not discard already-completed job work (cicd f-006: the blanket
//   cancel-in-progress: true cancelled main merge-commit runs too, so a
//   rerun threw away every lane the superseded run had already finished).
//   SCOPE: The checked-in test.yml parsed with the lockfile yaml package.
//   No execution, no network, no repository mutation.
//   DEPENDS: Vitest; yaml (lockfile devDependency); node:fs/path/url built-ins.
//   LINKS: .github/workflows/test.yml concurrency; docs/engineering-protocol.md.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
// START_MODULE_MAP
//   testWorkflow - checked-in test.yml parsed with the yaml package.
//   concurrency - the workflow-level concurrency policy.
//   repoRoot - repository root resolved from this file's location.
// END_MODULE_MAP
// START_CHANGE_SUMMARY
//   - 2026-11-26 cicd f-006: structural gate lands FIRST and red by design —
//   on the pre-fix workflow text cancel-in-progress is the literal true for
//   every ref including main; the workflow fix turns it into the ref
//   expression that keeps only main runs uninterrupted and flips the gate
//   green.
// END_CHANGE_SUMMARY

import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const testWorkflow = parse(readFileSync(join(repoRoot, '.github/workflows/test.yml'), 'utf8'))
const concurrency = testWorkflow.concurrency

describe('test workflow concurrency keeps main runs uninterrupted (cicd f-006)', () => {
  it('groups per ref and cancels superseded runs everywhere except main', () => {
    expect(typeof concurrency).toBe('object')
    // One group per ref keeps branch/PR supersession working.
    expect(concurrency.group).toBe('test-${{ github.ref }}')
    // The blanket literal cancelled main merge-commit runs and discarded
    // their completed job work. The expression preserves them: only
    // non-main refs cancel in progress.
    expect(concurrency['cancel-in-progress']).toBe(
      "${{ github.ref != 'refs/heads/main' }}"
    )
  })
})
