/**
 * CI wiring for the acceptance registry (C-ACCEPTANCE-REGISTRY).
 * Runs the same validator as `node tools/acceptance-registry.mjs --check`
 * inside the standard vitest matrix: schema, git sha resolvability and
 * two-way consistency with the current train.
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
  it('validates against its schema, git and the current train', () => {
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
    const resolves = (sha) => {
      try {
        execFileSync('git', ['cat-file', '-e', `${sha}^{commit}`], { stdio: 'ignore' })
        return true
      } catch {
        return false
      }
    }
    for (const artifact of registry.artifacts) {
      expect(artifact.source.sha).toMatch(/^[0-9a-f]{40}$/)
      // A squash-merged PR head is not on main; its recorded merge commit is.
      const viaMerge = Number.isInteger(artifact.source.pullRequest) && resolves(artifact.source.mergedAs ?? '')
      expect(resolves(artifact.source.sha) || viaMerge, artifact.id).toBe(true)
    }
  })

  it('lists patch and minor train ledgers alike', async () => {
    const { listTrainFiles } = await import('../../tools/acceptance-registry.mjs')
    const files = listTrainFiles(process.cwd())
    expect(files).toContain('docs/release-trains/2.8.2-next.json')
    expect(files).toContain('docs/release-trains/2.9.x-next.json')
    expect(files).not.toContain('docs/release-trains/current.json')
  })

  it('a squash-merged artifact resolves through its recorded merge commit only', async () => {
    const { validateRegistry } = await import('../../tools/acceptance-registry.mjs')
    const head = 'a'.repeat(40)
    const merge = 'b'.repeat(40)
    const registry = (source) => ({
      schemaVersion: '1.0.0',
      artifacts: [{ id: 'x', source, covers: ['FIX-1'] }],
      items: [{ id: 'FIX-1', events: [{ state: 'reported', date: '2026-10-25' }] }]
    })
    const shaExists = (sha) => sha === merge
    expect(() => validateRegistry(registry({ sha: head, pullRequest: 1, mergedAs: merge }), { shaExists })).not.toThrow()
    expect(() => validateRegistry(registry({ sha: head }), { shaExists })).toThrow()
    expect(() => validateRegistry(registry({ sha: head, mergedAs: merge }), { shaExists })).toThrow()
  })
})
