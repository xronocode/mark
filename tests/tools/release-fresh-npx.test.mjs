// FILE: tests/tools/release-fresh-npx.test.mjs
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Refuse fresh package execution in privileged release attribution and SBOM sources.
//   SCOPE: Source guards, synthetic executor fixtures and committed dependency metadata; no package execution or network.
//   DEPENDS: Vitest, Node filesystem/path/URL helpers, yaml; package.json, package-lock.json and the two release sources.
//   LINKS: .grace/verification/features.xml V-M-046, V-M-054; .grace/changes/archive/C-SEC-AUDIT-FIXES.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
// START_MODULE_MAP
//   ROOT - Repository path for fixture reads independent of the shell working directory.
//   releaseSources - The two privileged sources covered by the executor ban.
//   readSource - Read a repository source fixture.
//   freshExecutors - Report every prohibited executor with its source file and line.
// END_MODULE_MAP
// START_CHANGE_SUMMARY
//   - 2026-11-09 v1.0.0 C-SEC-AUDIT-FIXES T-001: pin release tools and forbid fresh package executors.
// END_CHANGE_SUMMARY

import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse } from 'yaml'
import { describe, expect, it } from 'vitest'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const releaseSources = ['.github/workflows/release.yml', 'tools/verify-attributions.sh']
const readSource = (file) => readFileSync(resolve(ROOT, file), 'utf8')
const freshExecutors = (file, source) => source.split(/\r?\n/).flatMap((line, index) =>
  /(?:^|[^\w-])(?:npx(?:\.cmd)?|npm(?:\.cmd)?\s+(?:exec|x))(?=$|[^\w-])/.test(line)
    ? [`${file}:${index + 1}: ${line.trim()}`]
    : []
)

describe('lockfile-installed release tools', () => {
  it.each([
    'npx --yes --package license-checker -- license-checker',
    'npx -y license-checker',
    'npx license-checker',
    'npx license-checker --no-install',
    'npx --no-install license-checker',
    'npm exec -- license-checker',
    'npm x license-checker',
    'npx.cmd license-checker',
    'npm.cmd exec -- license-checker'
  ])('rejects executor fixture: %s', (command) => {
    expect(freshExecutors('fixture.sh', `echo ready\n${command}\n`)).toEqual([
      `fixture.sh:2: ${command}`
    ])
  })

  it.each([
    './node_modules/.bin/license-checker --production --json',
    './node_modules/.bin/cyclonedx-npm --output-format JSON',
    'npm ci',
    'npm run build'
  ])('accepts installed-tool fixture: %s', (command) => {
    expect(freshExecutors('fixture.sh', command)).toEqual([])
  })

  it.each(releaseSources)('contains no package executor in %s', (file) => {
    expect(freshExecutors(file, readSource(file))).toEqual([])
  })

  it('pins both direct release tools and their lockfile roots exactly', () => {
    const manifest = JSON.parse(readSource('package.json'))
    const lock = JSON.parse(readSource('package-lock.json'))
    for (const [name, version] of [
      ['license-checker', '25.0.1'],
      ['@cyclonedx/cyclonedx-npm', '6.0.1']
    ]) {
      expect(manifest.devDependencies[name]).toBe(version)
      expect(lock.packages[''].devDependencies[name]).toBe(version)
      expect(lock.packages[`node_modules/${name}`].version).toBe(version)
      expect(lock.packages[`node_modules/${name}`].integrity).toMatch(/^sha512-/)
    }
  })

  it('installs dependencies before invoking the direct attribution and SBOM binaries', () => {
    const steps = parse(readSource('.github/workflows/release.yml')).jobs.build.steps
    const install = steps.findIndex((step) => /\bnpm ci\b/.test(step.run ?? ''))
    const attribution = steps.findIndex((step) => step.name === 'verify attributions')
    const sbom = steps.findIndex((step) => step.name === 'generate SBOM')
    expect(install).toBeGreaterThanOrEqual(0)
    expect(attribution).toBeGreaterThan(install)
    expect(sbom).toBeGreaterThan(install)
    expect(readSource('tools/verify-attributions.sh')).toContain('./node_modules/.bin/license-checker --production --json')
    expect(steps[sbom].run).toContain('./node_modules/.bin/cyclonedx-npm')
  })
})
