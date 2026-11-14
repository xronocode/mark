// @vitest-environment node
// FILE: tests/tools/build-test-artifact.test.mjs
// START_MODULE_CONTRACT
//   PURPOSE: Prove prepared local CLI admission and direct unsigned build invocation with inert fixtures, preserving registry and dry-run behavior.
//   SCOPE: Portable metadata/path/environment rejection, exact child argv/configuration, cleanup and artifact recording; never a native build or package acquisition.
//   DEPENDS: Vitest; Node filesystem/path/process built-ins; tools/build-test-artifact.mjs.
//   LINKS: M-046; V-M-046; C-QA-LOCAL-TAURI-TOOL.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
// START_MODULE_MAP
//   roots - Temporary fixture directories cleaned after each case.
//   version - Canonical prepared CLI version fixture.
//   integrity - Synthetic valid SHA-512 metadata; not an installed-file hash assertion.
//   sha - Synthetic source identity returned by inert git execution.
//   cliRelative - Installed CLI fixture directory relative to its repository.
//   json - Write synthetic JSON metadata under a fixture directory.
//   edit - Modify one synthetic JSON object.
//   fixture - Prepare a coherent inert local CLI and registry.
//   registryBytes - Read exact registry bytes for non-mutation assertions.
//   buildCalls - Select build calls from the injected process recorder.
//   execution - Provide inert git responses and an injected child boundary.
//   run - Execute the builder with fixture root and inert process boundary.
// END_MODULE_MAP
// START_CHANGE_SUMMARY
//   LAST_CHANGE: 2026-11-12 C-QA-LOCAL-TAURI-TOOL: portable guard, environment, direct-Node and registry regressions.
// END_CHANGE_SUMMARY
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname, resolve } from 'node:path'
import { createHash } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import { execFileSync } from 'node:child_process'
import { buildEnvironment, BUILD_ENVIRONMENT_NAMES, resolvePreparedTauri, runBuilder } from '../../tools/build-test-artifact.mjs'

const roots = []
const version = '2.12.4'
const integrity = `sha512-${Buffer.alloc(64, 7).toString('base64')}`
const sha = 'a'.repeat(40)
const cliRelative = 'node_modules/@tauri-apps/cli'
const json = (path, data) => { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, JSON.stringify(data)) }
const edit = (path, change) => { const data = JSON.parse(readFileSync(path, 'utf8')); change(data); json(path, data) }

function fixture() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'qa-tool-fixture-')))
  roots.push(root)
  json(join(root, 'package.json'), { version: '2.8.2', devDependencies: { '@tauri-apps/cli': '^2.12.4' } })
  json(join(root, 'package-lock.json'), { lockfileVersion: 3, packages: {
    '': { devDependencies: { '@tauri-apps/cli': '^2.12.4' } },
    [cliRelative]: { version, integrity, bin: { tauri: 'tauri.js' } }
  } })
  json(join(root, cliRelative, 'package.json'), { name: '@tauri-apps/cli', version, bin: { tauri: './tauri.js' } })
  writeFileSync(join(root, cliRelative, 'tauri.js'), '// inert fixture\n')
  json(join(root, 'docs/acceptance/registry.json'), { artifacts: [], lastSynced: '2000-01-01' })
  return root
}

const registryBytes = root => readFileSync(join(root, 'docs/acceptance/registry.json'), 'utf8')
const buildCalls = execute => execute.mock.calls.filter(([command]) => command !== 'git')
function execution(build = () => {}) {
  return vi.fn((command, args, options) => {
    if (command === 'git') return args.includes('--abbrev-ref') ? 'fixture-branch\n' : `${sha}\n`
    return build(command, args, options)
  })
}
function run(root, execute, extra = {}) {
  return runBuilder({ root, args: ['--item', 'QA-LOCAL-TOOL'], execute, log: vi.fn(), ...extra })
}

afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })

describe('reject invalid prepared metadata before building or recording', () => {
  const cases = [
    ['missing manifest', root => rmSync(join(root, 'package.json'))],
    ['malformed manifest', root => writeFileSync(join(root, 'package.json'), '{')],
    ['non-object manifest', root => json(join(root, 'package.json'), [])],
    ['missing declaration', root => edit(join(root, 'package.json'), d => { delete d.devDependencies })],
    ['missing lock', root => rmSync(join(root, 'package-lock.json'))],
    ['malformed lock', root => writeFileSync(join(root, 'package-lock.json'), '{')],
    ['unsupported lock version', root => edit(join(root, 'package-lock.json'), d => { d.lockfileVersion = 2 })],
    ['missing root lock', root => edit(join(root, 'package-lock.json'), d => { delete d.packages[''] })],
    ['root declaration mismatch', root => edit(join(root, 'package-lock.json'), d => { d.packages[''].devDependencies['@tauri-apps/cli'] = '^2.12.3' })],
    ['missing locked package', root => edit(join(root, 'package-lock.json'), d => { delete d.packages[cliRelative] })],
    ['range mismatch', root => edit(join(root, 'package-lock.json'), d => { d.packages[cliRelative].version = '3.0.0' })],
    ['conflicting declarations', root => edit(join(root, 'package.json'), d => { d.dependencies = { '@tauri-apps/cli': '1.0.0' } })],
    ['missing integrity', root => edit(join(root, 'package-lock.json'), d => { delete d.packages[cliRelative].integrity })],
    ['invalid integrity', root => edit(join(root, 'package-lock.json'), d => { d.packages[cliRelative].integrity = 'sha512-invalid' })],
    ['noncanonical integrity', root => edit(join(root, 'package-lock.json'), d => { d.packages[cliRelative].integrity = `sha512-${'A'.repeat(85)}B==` })],
    ['absent CLI', root => rmSync(join(root, cliRelative), { recursive: true })],
    ['malformed installed metadata', root => writeFileSync(join(root, cliRelative, 'package.json'), '{')],
    ['null installed metadata', root => json(join(root, cliRelative, 'package.json'), null)],
    ['installed name mismatch', root => edit(join(root, cliRelative, 'package.json'), d => { d.name = 'different-tool' })],
    ['installed version mismatch', root => edit(join(root, cliRelative, 'package.json'), d => { d.version = '2.12.3' })],
    ['missing entry metadata', root => edit(join(root, cliRelative, 'package.json'), d => { delete d.bin })],
    ['missing locked entry', root => edit(join(root, 'package-lock.json'), d => { delete d.packages[cliRelative].bin })],
    ['different entry', root => edit(join(root, cliRelative, 'package.json'), d => { d.bin.tauri = 'different.js' })],
    ['absent entry', root => rmSync(join(root, cliRelative, 'tauri.js'))],
    ['entry is directory', root => { rmSync(join(root, cliRelative, 'tauri.js')); mkdirSync(join(root, cliRelative, 'tauri.js')) }]
  ]
  it.each(cases)('%s', (_label, change) => {
    const root = fixture(); change(root)
    const before = registryBytes(root)
    const execute = execution(() => { throw new Error('Unexpected build invocation') })
    expect(() => run(root, execute)).toThrow(/^MT_QA_LOCAL_TOOL_INVALID:/)
    expect(buildCalls(execute)).toEqual([])
    expect(registryBytes(root)).toBe(before)
    expect(existsSync(join(root, 'target'))).toBe(false)
  })
  it.each(['../outside.js', '/absolute.js', 'C:\\outside.js', '\\server\\share.js', './dir/../../outside.js', 'file:tool.js', 'tauri.sh', 'tauri\0.js'])('rejects unsafe entry %s', entry => {
    const root = fixture()
    edit(join(root, cliRelative, 'package.json'), d => { d.bin.tauri = entry })
    expect(() => resolvePreparedTauri(root)).toThrow('MT_QA_LOCAL_TOOL_INVALID:entry-path')
  })
  it.each(['entry', 'package'])('rejects %s realpath escape on every unit host', kind => {
    const root = fixture()
    const packagePath = join(root, cliRelative)
    const entryPath = join(packagePath, 'tauri.js')
    const outside = join(root, 'outside')
    mkdirSync(outside)
    writeFileSync(join(outside, 'tauri.js'), '// inert')
    const realpath = path => String(path) === (kind === 'entry' ? entryPath : packagePath)
      ? realpathSync(kind === 'entry' ? join(outside, 'tauri.js') : outside) : realpathSync(path)
    expect(() => resolvePreparedTauri(root, { realpath })).toThrow(`MT_QA_LOCAL_TOOL_INVALID:${kind === 'entry' ? 'entry-containment' : 'package-containment'}`)
  })
  it('does not expose rejected metadata content', () => {
    const root = fixture()
    writeFileSync(join(root, cliRelative, 'package.json'), '{DUMMY_PRIVATE_VALUE')
    try { resolvePreparedTauri(root); expect.fail('must reject') } catch (error) {
      expect(error.message).toBe('MT_QA_LOCAL_TOOL_INVALID:installed')
      expect(error.message).not.toContain('DUMMY_PRIVATE_VALUE')
      expect(error.message).not.toContain(root)
    }
  })
})

it.each([
  ['2.12.4', '2.12.4', true], ['2.12.4', '2.12.5', false],
  ['^2.12.4', '2.13.0', true], ['^2.12.4', '2.12.3', false], ['^2.12.4', '3.0.0', false],
  ['~2.12.4', '2.12.5', true], ['~2.12.4', '2.13.0', false],
  ['^0.2.4', '0.2.9', true], ['^0.2.4', '0.3.0', false],
  ['^0.0.4', '0.0.5', false], ['~0.0.4', '0.0.5', true],
  ['*', '2.12.4', false], ['workspace:*', '2.12.4', false], ['^02.12.4', '2.12.4', false],
  ['^2.12.4', '2.12.4-beta.1', false], [123, '2.12.4', false]
])('validates declaration %s against lock %s', (declaration, lockedVersion, accepted) => {
  const root = fixture()
  edit(join(root, 'package.json'), d => { d.devDependencies['@tauri-apps/cli'] = declaration })
  edit(join(root, 'package-lock.json'), d => { d.packages[''].devDependencies['@tauri-apps/cli'] = declaration; d.packages[cliRelative].version = lockedVersion })
  edit(join(root, cliRelative, 'package.json'), d => { d.version = lockedVersion })
  if (accepted) expect(resolvePreparedTauri(root).version).toBe(lockedVersion)
  else expect(() => resolvePreparedTauri(root)).toThrow('MT_QA_LOCAL_TOOL_INVALID:lock-coherence')
})

it('copies only exact allowed names and handles Windows aliases once', () => {
  const environment = Object.fromEntries(BUILD_ENVIRONMENT_NAMES.map(name => [name, `fixture-${name}`]))
  const syntheticValue = 'synthetic-not-a-credential'
  const excludedNames = ['GITHUB_TOKEN', 'AWS_SECRET_ACCESS_KEY', 'APPLE_ID',
    'TAURI_SIGNING_PRIVATE_KEY', 'NODE_OPTIONS', 'CARGO_REGISTRY_TOKEN',
    'RUSTC_WRAPPER', 'CARGO_TARGET_DIR', 'PATH_EXTRA']
  Object.assign(environment, Object.fromEntries(excludedNames.map(name => [name, syntheticValue])))
  const result = buildEnvironment(environment, 'linux')
  expect(Object.keys(result)).toEqual([...BUILD_ENVIRONMENT_NAMES])
  for (const name of BUILD_ENVIRONMENT_NAMES) expect(result[name]).toBe(environment[name])
  expect(environment.GITHUB_TOKEN).toBe(syntheticValue)
  expect(buildEnvironment({ Path: 'fixture-path', PATH: 'canonical-path', systemroot: 'fixture-system', github_token: 'dummy' }, 'win32'))
    .toEqual({ PATH: 'canonical-path', SystemRoot: 'fixture-system' })
  expect(buildEnvironment({ Path: 'fixture-path', Systemroot: 'fixture-system' }, 'win32'))
    .toEqual({ PATH: 'fixture-path', SystemRoot: 'fixture-system' })
  expect(buildEnvironment({ Path: 'fixture-path', PATH: undefined, HOME: null }, 'linux')).toEqual({})
})

it.each(['macos', 'windows'])('preserves direct %s argv, configuration and failure cleanup', platform => {
  const root = fixture(); const before = registryBytes(root)
  let configPath
  const failure = new Error('inert child failure')
  const execute = execution((command, args, options) => {
    expect(command).toBe(process.execPath)
    expect(args.slice(0, 4)).toEqual([resolvePreparedTauri(root).entry, 'build', '--debug', '--config'])
    configPath = args[4]
    expect(JSON.parse(readFileSync(configPath, 'utf8'))).toEqual({ productName: 'Mark Test QA-LOCAL-TOOL',
      identifier: `com.xronocode.mark.test.qalocaltool.${sha.slice(0, 7)}`,
      bundle: { createUpdaterArtifacts: false, targets: platform === 'macos' ? ['app'] : ['nsis'] } })
    expect(options).toEqual({ cwd: root, stdio: 'inherit', env: { PATH: 'fixture-path', SDKROOT: 'fixture-sdk' } })
    throw failure
  })
  expect(() => run(root, execute, { args: ['--item', 'QA-LOCAL-TOOL', '--platform', platform],
    environment: { PATH: 'fixture-path', SDKROOT: 'fixture-sdk', GITHUB_TOKEN: 'dummy', NODE_OPTIONS: 'dummy' } })).toThrow(failure)
  expect(buildCalls(execute)).toHaveLength(1)
  expect(existsSync(dirname(configPath))).toBe(false)
  expect(registryBytes(root)).toBe(before)
})

it('preserves macOS digest and registry append after one successful inert build', () => {
  const root = fixture()
  const bytes = Buffer.from('inert artifact bytes')
  const execute = execution(() => {
    const binary = join(root, 'target/debug/bundle/macos/Mark Test QA-LOCAL-TOOL.app/Contents/MacOS/mark')
    mkdirSync(dirname(binary), { recursive: true }); writeFileSync(binary, bytes)
  })
  run(root, execute)
  expect(buildCalls(execute)).toHaveLength(1)
  const registry = JSON.parse(registryBytes(root))
  expect(registry.artifacts).toHaveLength(1)
  expect(registry.artifacts[0]).toMatchObject({ id: 'mark-test-qalocaltool-aaaaaaa', source: { sha, branch: 'fixture-branch' },
    bundleIdentity: 'com.xronocode.mark.test.qalocaltool.aaaaaaa', platform: 'macos-arm64-debug',
    binarySha256: createHash('sha256').update(bytes).digest('hex'), covers: ['QA-LOCAL-TOOL'], productVersion: '2.8.2' })
  expect(registry.artifacts[0]).not.toHaveProperty('accepted')
  expect(registry.artifacts[0]).not.toHaveProperty('smoke')
})

it('runs the matching inert CLI through an actual Node child with minimized environment', () => {
  const root = fixture()
  const capture = join(root, 'captured.json')
  writeFileSync(join(root, cliRelative, 'tauri.js'), `const fs = require('node:fs'); fs.writeFileSync(${JSON.stringify(capture)}, JSON.stringify({ args:process.argv.slice(2), cwd:process.cwd(), secret:process.env.GITHUB_TOKEN, path:process.env.PATH }));`)
  const before = registryBytes(root)
  const execute = execution((command, args, options) => execFileSync(command, args, { ...options, stdio: 'pipe', timeout: 5000 }))
  run(root, execute, { args: ['--item', 'QA-LOCAL-TOOL', '--platform', 'windows'], environment: { PATH: process.env.PATH, GITHUB_TOKEN: 'dummy' } })
  const observed = JSON.parse(readFileSync(capture, 'utf8'))
  expect(observed).toEqual({ args: expect.arrayContaining(['build', '--debug', '--config']), cwd: root, path: process.env.PATH })
  expect(buildCalls(execute)).toHaveLength(1)
  expect(registryBytes(root)).toBe(before)
})

it.each([
  { args: [] }, { args: ['--help'] },
  { args: ['--item', 'QA-LOCAL-TOOL', '--platform', 'macos', '--dry-run'] },
  { args: ['--item', 'QA-LOCAL-TOOL', '--platform', 'windows', '--dry-run'] }
])('keeps help/dry-run dependency-free: $args', ({ args }) => {
  const root = fixture(); rmSync(join(root, 'node_modules'), { recursive: true })
  const before = registryBytes(root); const execute = execution(() => { throw new Error('Unexpected build') }); const log = vi.fn()
  run(root, execute, { args, log })
  expect(buildCalls(execute)).toEqual([])
  expect(registryBytes(root)).toBe(before)
  if (args.includes('--dry-run')) expect(log.mock.calls).toContainEqual(['[build-test-artifact] dry run — nothing built, nothing recorded'])
})

it('real repository dry-runs and help do not alter registry or generated survey', () => {
  const root = resolve(process.cwd())
  const paths = ['docs/acceptance/registry.json', 'docs/acceptance/README.md']
  const before = paths.map(path => readFileSync(join(root, path), 'utf8'))
  const script = join(root, 'tools/build-test-artifact.mjs')
  for (const args of [[], ['--item', 'QA-LOCAL-TOOL', '--platform', 'macos', '--dry-run'], ['--item', 'QA-LOCAL-TOOL', '--platform', 'windows', '--dry-run']]) {
    execFileSync(process.execPath, [script, ...args], { cwd: root, encoding: 'utf8', timeout: 5000 })
  }
  expect(paths.map(path => readFileSync(join(root, path), 'utf8'))).toEqual(before)
})

it('can import the guard from Node stdin without starting the builder', () => {
  const script = pathToFileURL(resolve('tools/build-test-artifact.mjs')).href
  const output = execFileSync(process.execPath, ['--input-type=module', '-'], {
    input: `import { resolvePreparedTauri } from ${JSON.stringify(script)}; console.log(resolvePreparedTauri().version);`,
    encoding: 'utf8', timeout: 5000
  })
  expect(output.trim()).toBe('2.12.4')
})
