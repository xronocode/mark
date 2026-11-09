// FILE: tests/tools/build-notices-node.test.mjs
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Prove truthful installed-tool regeneration commands and third-party notice counts.
//   SCOPE: Synthetic checker JSON, real formatter subprocess and deterministic Markdown; no dependency discovery or network.
//   DEPENDS: Vitest; Node child_process/path/url; tools/build-notices-node.mjs.
//   LINKS: .grace/verification/features.xml V-M-046; .grace/changes/archive/C-ATTRIBUTION-NOTICE-REFRESH.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
// START_MODULE_MAP
//   formatter - Absolute formatter path independent of shell working directory.
//   render - Execute the formatter with synthetic checker JSON on stdin.
// END_MODULE_MAP
// START_CHANGE_SUMMARY
//   - 2026-11-09 C-ATTRIBUTION-NOTICE-REFRESH: regress root-excluded count and truthful local command.
// END_CHANGE_SUMMARY
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const formatter = resolve(dirname(fileURLToPath(import.meta.url)), '../../tools/build-notices-node.mjs')
const render = (data) => {
  const result = spawnSync(process.execPath, [formatter], { input: JSON.stringify(data), encoding: 'utf8', timeout: 5000 })
  expect(result.error).toBeUndefined()
  expect(result.status).toBe(0)
  return result.stdout
}

describe('installed production notice formatter', () => {
  it('counts rendered third-party rows after root exclusion and retains scoped multiple versions', () => {
    const text = render({
      'reborn-mark@99.0.0': { licenses: 'MIT' },
      '@scope/pkg@1.0.0': { licenses: 'MIT', repository: 'https://example.invalid/repo|suffix' },
      '@scope/pkg@2.0.0': { licenses: 'MIT' },
      'plain@3.0.0': { licenses: ['MIT', 'Apache-2.0'] }
    })
    expect(text).toContain('**3 packages**')
    expect(text).not.toContain('reborn-mark')
    expect(text).toContain('| @scope/pkg | 1.0.0 | https://example.invalid/repo\\|suffix |')
    expect(text).toContain('| @scope/pkg | 2.0.0 |')
    expect(text).toContain('| MIT | 2 |')
    expect(text).toContain('| MIT OR Apache-2.0 | 1 |')
  })

  it('documents the exact installed checker pipeline and truthful license semantics', () => {
    const text = render({ 'unknown@1.0.0': {}, 'detected@2.0.0': { licenses: 'Apache*' } })
    expect(text).toContain('./node_modules/.bin/license-checker --production --json |')
    expect(text).not.toContain('npx')
    expect(text).toContain('declared or detected license')
    expect(text).toContain('## UNKNOWN (1)')
    expect(text).toContain('## Apache* (1)')
  })

  it('is deterministic and counts an empty third-party set as zero', () => {
    const a = { 'z@1.0.0': { licenses: 'MIT' }, 'a@1.0.0': { licenses: 'MIT' } }
    expect(render(a)).toBe(render(Object.fromEntries(Object.entries(a).reverse())))
    expect(render({ 'reborn-mark@1.0.0': { licenses: 'MIT' } })).toContain('**0 packages**')
  })
})
