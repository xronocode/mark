/**
 * CI wiring for the acceptance registry (C-ACCEPTANCE-REGISTRY).
 * Runs the same validator as `node tools/acceptance-registry.mjs --check`
 * inside the standard vitest matrix: schema, git sha resolvability and
 * two-way consistency with the collecting 2.6.x-next train.
 */
import { describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const runCheck = () =>
  execFileSync('node', [resolve(process.cwd(), 'tools/acceptance-registry.mjs'), '--check'], {
    encoding: 'utf8'
  })

describe('acceptance registry (C-ACCEPTANCE-REGISTRY)', () => {
  it('validates against its schema, git and the 2.6.x-next train', () => {
    expect(runCheck()).toContain('BLOCK_ACCEPT_REGISTRY_VALID')
  })

  it('the survey table covers every tracked item', () => {
    const registry = JSON.parse(
      readFileSync(resolve(process.cwd(), 'docs/acceptance/registry.json'), 'utf8')
    )
    const survey = execFileSync(
      'node',
      [resolve(process.cwd(), 'tools/acceptance-registry.mjs'), '--survey'],
      { encoding: 'utf8' }
    )
    for (const item of registry.items) {
      expect(survey).toContain(`| ${item.id} `)
    }
  })

  it('every offered artifact has a resolvable source sha', () => {
    const registry = JSON.parse(
      readFileSync(resolve(process.cwd(), 'docs/acceptance/registry.json'), 'utf8')
    )
    for (const artifact of registry.artifacts) {
      expect(artifact.source.sha).toMatch(/^[0-9a-f]{40}$/)
      expect(() =>
        execFileSync('git', ['cat-file', '-e', `${artifact.source.sha}^{commit}`], {
          stdio: 'ignore'
        })
      ).not.toThrow()
    }
  })
})
