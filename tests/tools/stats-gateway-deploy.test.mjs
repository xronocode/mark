// FILE: tests/tools/stats-gateway-deploy.test.mjs
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Prove Worker deployment admission rejects dirty, stale, and unchecked candidates.
//   SCOPE: Pure admission tests; never invokes Wrangler or production credentials.
//   DEPENDS: Vitest and tools/stats-gateway/deploy-checked.mjs.
//   LINKS: .grace/verification/features.xml V-M-071.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
// START_MODULE_MAP
//   checks - Successful required-check fixtures for one exact candidate.
// END_MODULE_MAP
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - 2026-11-09 C-CI-CD-AUDIT-FIXES: guard manual Worker deploy admission.
// END_CHANGE_SUMMARY

import { describe, expect, it } from 'vitest'
import { assessCandidate } from '../../tools/stats-gateway/deploy-checked.mjs'

const checks = ['status check', 'release/governance', 'release/readiness'].map((name) => ({
  name, conclusion: 'success', app: { slug: 'github-actions' }
}))

describe('gateway deploy candidate admission', () => {
  it('accepts a clean exact main commit with all required successful checks', () => {
    expect(() => assessCandidate({ head: 'abc', main: 'abc', dirty: false, checks })).not.toThrow()
  })

  it('rejects local modifications and untracked files', () => {
    expect(() => assessCandidate({ head: 'abc', main: 'abc', dirty: true, checks })).toThrow('not clean')
  })

  it('rejects a commit other than current remote main', () => {
    expect(() => assessCandidate({ head: 'abc', main: 'def', dirty: false, checks })).toThrow('not the current')
  })

  it.each(['status check', 'release/governance', 'release/readiness'])('rejects failed or missing %s', (name) => {
    const failed = checks.map((check) => check.name === name ? { ...check, conclusion: 'failure' } : check)
    expect(() => assessCandidate({ head: 'abc', main: 'abc', dirty: false, checks: failed })).toThrow(name)
    expect(() => assessCandidate({ head: 'abc', main: 'abc', dirty: false, checks: checks.filter((check) => check.name !== name) })).toThrow(name)
  })

  it('rejects a check from an unexpected app', () => {
    const wrongApp = checks.map((check) => check.name === 'status check' ? { ...check, app: { slug: 'untrusted-app' } } : check)
    expect(() => assessCandidate({ head: 'abc', main: 'abc', dirty: false, checks: wrongApp })).toThrow('status check')
  })
})
