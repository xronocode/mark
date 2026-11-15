// @vitest-environment node
// FILE: tests/tools/prepare-qa-artifacts.test.mjs
// START_MODULE_CONTRACT
//   PURPOSE: Prove exact QA identity, installer collection and owned binary cleanup with synthetic filesystem fixtures.
//   SCOPE: Existing macOS/Windows layouts, manifest/digest readback, malformed/missing/linked/ambiguous inputs and cache preservation.
//   DEPENDS: Vitest, Node built-ins and prepare-qa-artifacts; no installer execution, native build or network.
//   LINKS: M-046; V-M-046; C-QA-INSTALLER-ARTIFACTS.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
// START_MODULE_MAP
//   roots - Owned fixture trees deleted after every case.
//   SHA - Synthetic source identity.
//   fixture - Prepare one platform's coherent synthetic QA state.
//   put - Write one owned synthetic output.
// END_MODULE_MAP
import { afterEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import { syncBuiltinESMExports } from 'node:module'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { PLATFORMS, cleanupGenerated, collectQaInstaller, hash, loadQaState, prepareQa, qaIdentity, recordBinary, recordGenerated, recordQaUpload } from '../../tools/prepare-qa-artifacts.mjs'
const roots = []
const SHA = 'a'.repeat(40)
const put = (path, bytes = 'synthetic installer bytes') => { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, bytes); return path }
const fixture = (platform = 'macos-arm64', mode = 'manual-handoff') => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'qa-collection-'))); roots.push(root)
  const workspace = join(root, 'workspace'); mkdirSync(workspace)
  const state = prepareQa({ workspace, temporaryRoot: root, actualHead: SHA,
    identity: { sourceSha: SHA, runId: '1234567', attempt: '2', platform, mode, testCase: mode === 'manual-handoff' ? 'CI-F002-INSTALL-DIGEST' : '' } })
  const layout = PLATFORMS[platform]
  const bundle = join(workspace, 'target', layout.target, 'release/bundle', layout.folder)
  const installer = join(bundle, `${state.identity.productName}_2.8.2${layout.extension}`)
  return { root, workspace, state, bundle, installer }
}
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })
describe('QA case and isolated identity', () => {
  it.each(['macos-arm64', 'windows-x64'])('binds %s source/run/case without granting owner acceptance', platform => {
    const { state } = fixture(platform)
    const config = JSON.parse(readFileSync(join(state.directory, 'qa-config.json')))
    expect(config.identifier).toBe(state.identity.identifier)
    expect(config.identifier).not.toBe('com.xronocode.mark')
    expect(config.productName).not.toBe('Mark')
    expect(config.bundle).toEqual({ createUpdaterArtifacts: false, targets: PLATFORMS[platform].bundles })
    expect(state.identity.artifactName).toContain(SHA)
    expect(state.identity.artifactName).toContain('1234567-2')
    expect(loadQaState(join(state.directory, 'state.json')).identity).toEqual(state.identity)
  })
  it.each(['', '../escape', 'two cases', 'CASE\nINJECTION', 'a'.repeat(100)])('rejects an unsafe or missing unfinished case %j', testCase => {
    expect(() => qaIdentity({ sourceSha: SHA, runId: '1', attempt: '1', platform: 'macos-arm64', mode: 'manual-handoff', testCase })).toThrow()
  })
  it('rejects configuration changes instead of keeping a stale configuration digest', () => {
    const { state } = fixture(); writeFileSync(join(state.directory, 'qa-config.json'), '{}')
    expect(() => loadQaState(join(state.directory, 'state.json'))).toThrow('config-digest-changed')
  })
  it('does not accept a dry-run retention exception or a checkout mismatch', () => {
    expect(() => qaIdentity({ sourceSha: SHA, runId: '1', attempt: '1', platform: 'macos-arm64', mode: 'dryrun', testCase: 'OWNER-CASE' })).toThrow()
    const { workspace, root, state } = fixture()
    expect(() => prepareQa({ workspace, temporaryRoot: root, actualHead: 'b'.repeat(40), identity: state.identity })).toThrow('checkout-source-mismatch')
  })
})
describe.each(['macos-arm64', 'windows-x64'])('%s installer collection', platform => {
  it('copies exact bytes plus a readback manifest and excludes unrelated files', () => {
    const { state, installer, bundle } = fixture(platform)
    const bytes = Buffer.from('owned synthetic bytes\0with exact payload')
    put(installer, bytes); put(join(bundle, `unrelated${PLATFORMS[platform].extension}`), 'not this run'); put(join(bundle, 'credentials.json'), 'excluded fixture')
    const result = collectQaInstaller(state)
    const names = readdirSync(join(state.directory, 'handoff')).sort()
    expect(names).toEqual([installer.split(/[\\/]/).at(-1), 'qa-manifest.json'].sort())
    expect(readFileSync(join(state.directory, 'handoff', result.installer.filename))).toEqual(bytes)
    expect(result.installer).toMatchObject({ size: bytes.length, sha256: hash(bytes) })
    expect(result.retention).toMatchObject({ testCase: 'CI-F002-INSTALL-DIGEST', maximumDays: 1, deleteOnCompletionOrCancellation: true, ownerAcceptanceInferred: false })
    recordQaUpload(state, { id: '654321', digest: 'b'.repeat(64) })
    expect(state.upload.zipSha256).toBe('b'.repeat(64))
    expect(state.upload.installerSha256).toBe(hash(bytes))
  })
  it.each(['missing', 'empty', 'ambiguous', 'wrong-identity'])('fails %s output without staging unrelated content', kind => {
    const { state, installer, bundle } = fixture(platform); mkdirSync(bundle, { recursive: true })
    if (kind === 'empty') put(installer, '')
    if (kind === 'ambiguous') { put(installer); put(installer.replace(PLATFORMS[platform].extension, `_other${PLATFORMS[platform].extension}`)) }
    if (kind === 'wrong-identity') put(join(bundle, `Mark_old${PLATFORMS[platform].extension}`))
    expect(() => collectQaInstaller(state)).toThrow()
    expect(readdirSync(join(state.directory, 'handoff'))).toEqual([])
  })
  it('rejects file links and parent junction/symlink escape', () => {
    const { root, state, installer, bundle } = fixture(platform)
    const outside = put(join(root, 'outside-file'), 'do not collect')
    mkdirSync(bundle, { recursive: true })
    symlinkSync(outside, installer, 'file')
    expect(() => collectQaInstaller(state)).toThrow()
    rmSync(installer); rmSync(bundle, { recursive: true })
    const outsideDir = join(root, 'outside-dir'); mkdirSync(outsideDir)
    put(join(outsideDir, installer.split(/[\\/]/).at(-1)), 'outside payload')
    symlinkSync(outsideDir, bundle, process.platform === 'win32' ? 'junction' : 'dir')
    expect(() => collectQaInstaller(state)).toThrow('linked-parent')
    expect(readFileSync(outside, 'utf8')).toBe('do not collect')
  })
})
describe('QA generated-output cleanup', () => {
  it('removes owned installer/app/executable copies and preserves unrelated cached files', () => {
    const { state, workspace, installer } = fixture()
    put(installer)
    const release = join(workspace, 'target', state.identity.target, 'release')
    const app = join(release, 'bundle/macos', `${state.identity.productName}.app`)
    const bytes = 'owned executable fixture'
    put(join(app, 'Contents/MacOS/mark'), bytes)
    put(join(release, 'mark'), bytes)
    const duplicate = put(join(release, 'deps/mark-abcdef'), bytes)
    const cache = put(join(release, 'deps/libserde.rlib'), 'shared cache')
    const unknown = put(join(release, 'deps/mark-fedcba'), 'unowned historical output')
    recordGenerated(state); collectQaInstaller(state); cleanupGenerated(state)
    for (const path of [installer, app, join(release, 'mark'), duplicate]) expect(existsSync(path)).toBe(false)
    expect(readFileSync(cache, 'utf8')).toBe('shared cache')
    expect(readFileSync(unknown, 'utf8')).toBe('unowned historical output')
    expect(readdirSync(join(state.directory, 'handoff'))).toEqual([])
    expect(existsSync(join(state.directory, 'evidence', 'lifecycle.json'))).toBe(true)
  })
  it('never stages installers for an ordinary dry-run', () => {
    const { state, installer } = fixture('macos-arm64', 'dryrun'); put(installer)
    expect(() => collectQaInstaller(state)).toThrow('unfinished-test-required')
    cleanupGenerated(state)
    expect(existsSync(installer)).toBe(false)
  })
  it('preserves unrelated empty or linked cached executable names during owned cleanup', () => {
    const { state, workspace, installer } = fixture(); put(installer)
    const directory = join(workspace, 'target', state.identity.target, 'release/deps')
    const empty = put(join(directory, 'mark-eeee'), '')
    expect(() => cleanupGenerated(state)).not.toThrow()
    expect(existsSync(installer)).toBe(false)
    expect(existsSync(empty)).toBe(true)
  })
  it('preserves preexisting digest-identical cache copies rather than claiming them by content alone', () => {
    const { state, workspace, root } = fixture()
    const previous = put(join(workspace, 'target/release/deps/mark-aaaa'), 'same bytes')
    const fresh = prepareQa({ workspace, temporaryRoot: root, identity: state.identity, actualHead: SHA })
    put(join(workspace, 'target', state.identity.target, 'release/mark'), 'same bytes')
    cleanupGenerated(fresh)
    expect(readFileSync(previous, 'utf8')).toBe('same bytes')
  })
  it('refuses a preexisting same-identity installer instead of handing off stale bytes', () => {
    const { state, workspace, root, installer } = fixture(); put(installer, 'preexisting bytes')
    expect(() => prepareQa({ workspace, temporaryRoot: root, identity: state.identity, actualHead: SHA })).toThrow('existing-identity-output')
    expect(readFileSync(installer, 'utf8')).toBe('preexisting bytes')
  })
  it('refuses a preexisting same-identity app instead of adopting or deleting it', () => {
    const { state, workspace, root } = fixture()
    const existing = put(join(workspace, 'target', state.identity.target, 'release/bundle/macos', `${state.identity.productName}.app/owner-data`), 'keep')
    expect(() => prepareQa({ workspace, temporaryRoot: root, identity: state.identity, actualHead: SHA })).toThrow('existing-identity-output')
    expect(readFileSync(existing, 'utf8')).toBe('keep')
  })
  it('rejects an unrelated regular file as an executable cleanup claim', async () => {
    const { state, workspace } = fixture()
    const path = put(join(workspace, 'target/release/deps/libserde.rlib'), 'cache')
    const { recordBinary } = await import('../../tools/prepare-qa-artifacts.mjs')
    expect(() => recordBinary(state, path)).toThrow()
    expect(readFileSync(path, 'utf8')).toBe('cache')
  })
})


describe('QA cleanup permission and evidence failure boundaries', () => {
  it.each(['known-owned', 'discovery'])('never reports %s permission denial as absence and still cleans independent outputs', kind => {
    const { state, workspace } = fixture()
    const blocked = put(join(workspace, 'target/debug/deps/mark-aaaa'), 'blocked-owned-output')
    const independent = put(join(workspace, 'target/release/mark'), 'independent-owned-output')
    if (kind === 'known-owned') { recordBinary(state, blocked); state.owned.find(entry => entry.path === blocked).deleted = true }
    recordBinary(state, independent)
    state.rustCompilationAttempted = true
    const denied = join(workspace, 'target/debug')
    const originalExists = fs.existsSync, originalStat = fs.lstatSync
    const exists = vi.spyOn(fs, 'existsSync').mockImplementation(path => String(path).startsWith(denied) ? false : originalExists(path))
    const stat = vi.spyOn(fs, 'lstatSync').mockImplementation((path, ...args) => {
      if (String(path).startsWith(denied)) throw Object.assign(new Error(`EACCES fixture denial: ${path}`), { code: 'EACCES' })
      return originalStat(path, ...args)
    })
    syncBuiltinESMExports()
    try {
      expect(() => cleanupGenerated(state)).toThrow(/EACCES/)
      expect(state.generatedCleanupComplete).toBe(false)
      if (kind === 'known-owned') expect(state.owned.find(entry => entry.path === blocked).deleted).not.toBe(true)
      expect(state.cleanupErrors.some(error => error.includes(denied))).toBe(true)
    } finally { exists.mockRestore(); stat.mockRestore(); syncBuiltinESMExports() }
    expect(readFileSync(blocked, 'utf8')).toBe('blocked-owned-output')
    expect(existsSync(independent)).toBe(false)
  })

  it('accepts only actual ENOENT as an already removed known-owned artifact', () => {
    const { state, workspace } = fixture()
    const path = put(join(workspace, 'target/debug/deps/mark-aaaa'), 'owned-before-removal')
    recordBinary(state, path); rmSync(path)
    cleanupGenerated(state)
    expect(state.generatedCleanupComplete).toBe(true)
    expect(state.owned.find(entry => entry.path === path).deleted).toBe(true)
  })

  it('attempts independent known-owned deletion even when state evidence cannot be written', () => {
    const { state, workspace } = fixture()
    const path = put(join(workspace, 'target/debug/deps/mark-aaaa'), 'owned-before-evidence-failure')
    recordBinary(state, path)
    const original = fs.writeFileSync
    const failure = vi.spyOn(fs, 'writeFileSync').mockImplementation((file, ...args) => {
      if (String(file).startsWith(state.directory)) throw Object.assign(new Error('EACCES state evidence'), { code: 'EACCES' })
      return original(file, ...args)
    })
    syncBuiltinESMExports()
    try { expect(() => cleanupGenerated(state)).toThrow(/EACCES/); expect(state.generatedCleanupComplete).toBe(false) }
    finally { failure.mockRestore(); syncBuiltinESMExports() }
    expect(existsSync(path)).toBe(false)
  })
})
