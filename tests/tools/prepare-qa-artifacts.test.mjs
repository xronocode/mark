// @vitest-environment node
// FILE: tests/tools/prepare-qa-artifacts.test.mjs
// START_MODULE_CONTRACT
//   PURPOSE: Prove exact QA identity, installer collection, archive/sidecar ownership and owned binary cleanup with synthetic filesystem fixtures.
//   SCOPE: Inert platform layouts, exact identity/digests, exact-identity archive/sidecar lifecycle, persisted smoke protection, owned Node cleanup CLI, malformed records and cache preservation.
//   DEPENDS: Vitest, Node built-ins and prepare-qa-artifacts; no installer execution, native build or network.
//   LINKS: M-046; V-M-046; C-QA-NATIVE-BRIDGE-MOUNT-CLEANUP; C-QA-INSTALLER-ARTIFACTS.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
// START_MODULE_MAP
//   roots - Owned fixture trees deleted after every case.
//   SHA - Synthetic source identity.
//   fixture - Prepare one platform's coherent synthetic QA state.
//   cleanupCliFixture - Execute only the owned Node cleanup CLI with external source/PID/reap evidence.
//   protectedFixture - Bind one inert mounted/process descriptor through the production protocol.
//   put - Write one owned synthetic output.
//   qaArchive - Exact current-identity macOS archive and adjacent signature sidecar paths for one fixture.
// END_MODULE_MAP
// START_CHANGE_SUMMARY
//   - 2026-11-19 C-QA-ARCHIVE-LIFECYCLE: exact-identity macOS archive/signature ownership, preexisting refusal and immutable recorded digests.
// END_CHANGE_SUMMARY
import { afterEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import { syncBuiltinESMExports } from 'node:module'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { createHash } from 'node:crypto'
import { dirname, join } from 'node:path'
import { PLATFORMS, cleanupGenerated, collectQaInstaller, hash, loadQaState, prepareQa, qaIdentity, recordBinary, recordGenerated, recordQaUpload, saveQaState, beginSmokeCleanup } from '../../tools/prepare-qa-artifacts.mjs'
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
const qaArchive = ({ workspace, state }) => {
  const archive = join(workspace, 'target', state.identity.target, 'release/bundle/macos', `${state.identity.productName}.app.tar.gz`)
  return { archive, signature: `${archive}.sig` }
}
afterEach(() => {
  const cleaned = [], errors = []
  for (const root of roots.splice(0)) {
    try { rmSync(root, { recursive: true, force: true }) } catch (error) { errors.push(`${root}:${error.message}`) }
    cleaned.push({ root, absent: !existsSync(root), inertTextOnly: true })
  }
  if (process.env.MARK_QA_CORE_EVIDENCE_ROOT) {
    mkdirSync(process.env.MARK_QA_CORE_EVIDENCE_ROOT, { recursive: true })
    const source = Object.fromEntries(['tools/qa-artifact-smoke.mjs', 'tools/prepare-qa-artifacts.mjs', 'tests/tools/qa-artifact-smoke.test.mjs', 'tests/tools/prepare-qa-artifacts.test.mjs'].map(path => [path, hash(readFileSync(path))]))
    fs.appendFileSync(join(process.env.MARK_QA_CORE_EVIDENCE_ROOT, 'prepare-fixture-cleanup.jsonl'), `${JSON.stringify({ source, cleaned, errors, nativeCommandsExecuted: false })}\n`)
  }
  expect(errors).toEqual([])
})
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

describe('QA exact archive and signature lifecycle', () => {
  it('owns and removes an exact-current-identity archive and sidecar that the old helper omitted', () => {
    const f = fixture('macos-arm64', 'dryrun')
    const { archive, signature } = qaArchive(f)
    put(archive, 'inert synthetic archive bytes'); put(signature, 'inert synthetic signature bytes')
    recordGenerated(f.state)
    const owned = Object.fromEntries(f.state.owned.map(entry => [entry.path, entry]))
    // Red control against the previous helper: exact archive/signature ownership was omitted entirely.
    expect(owned[archive]).toMatchObject({ kind: 'archive', size: 'inert synthetic archive bytes'.length, sha256: hash('inert synthetic archive bytes') })
    expect(owned[signature]).toMatchObject({ kind: 'signature', size: 'inert synthetic signature bytes'.length, sha256: hash('inert synthetic signature bytes') })
    expect(loadQaState(join(f.state.directory, 'state.json')).owned).toEqual(f.state.owned)
    recordGenerated(f.state)
    expect(f.state.owned.filter(entry => entry.path === archive || entry.path === signature)).toHaveLength(2)
    cleanupGenerated(f.state)
    expect(existsSync(archive)).toBe(false); expect(existsSync(signature)).toBe(false)
    expect(f.state.generatedCleanupComplete).toBe(true)
    expect(f.state.owned.filter(entry => entry.kind === 'archive' || entry.kind === 'signature').every(entry => entry.deleted)).toBe(true)
  })

  it('owns and removes an archive without any sidecar', () => {
    const f = fixture('macos-arm64', 'dryrun')
    const { archive, signature } = qaArchive(f)
    put(archive, 'archive only bytes')
    recordGenerated(f.state); cleanupGenerated(f.state)
    expect(existsSync(archive)).toBe(false); expect(existsSync(signature)).toBe(false)
    expect(f.state.owned.find(entry => entry.path === archive)).toMatchObject({ kind: 'archive', deleted: true })
    expect(f.state.generatedCleanupComplete).toBe(true)
  })

  it('records and removes a signature alone after partial packaging output', () => {
    const f = fixture('macos-arm64', 'dryrun')
    const { archive, signature } = qaArchive(f)
    put(signature, 'orphan sidecar bytes')
    expect(() => recordGenerated(f.state)).not.toThrow()
    expect(f.state.owned.find(item => item.path === signature)).toMatchObject({ kind: 'signature', size: 'orphan sidecar bytes'.length, sha256: hash('orphan sidecar bytes') })
    expect(f.state.owned.some(item => item.kind === 'archive')).toBe(false)
    cleanupGenerated(f.state)
    expect(existsSync(signature)).toBe(false); expect(existsSync(archive)).toBe(false)
    expect(f.state.generatedCleanupComplete).toBe(true)
  })

  it.each(['archive', 'signature', 'archive-directory', 'archive-link'])('refuses a preexisting same-identity %s without adopting or changing it', kind => {
    const f = fixture('macos-arm64', 'dryrun')
    const { archive, signature } = qaArchive(f)
    const outside = put(join(f.root, 'outside-sidecar'), 'outside bytes')
    if (kind === 'archive') put(archive, 'preexisting archive bytes')
    if (kind === 'signature') put(signature, 'preexisting signature bytes')
    if (kind === 'archive-directory') put(join(archive, 'inert-entry'), 'directory payload')
    if (kind === 'archive-link') { mkdirSync(dirname(archive), { recursive: true }); symlinkSync(outside, archive, 'file') }
    expect(() => prepareQa({ workspace: f.workspace, temporaryRoot: f.root, identity: f.state.identity, actualHead: SHA })).toThrow('existing-identity-output')
    if (kind === 'archive') expect(readFileSync(archive, 'utf8')).toBe('preexisting archive bytes')
    if (kind === 'signature') expect(readFileSync(signature, 'utf8')).toBe('preexisting signature bytes')
    if (kind === 'archive-directory') expect(readFileSync(join(archive, 'inert-entry'), 'utf8')).toBe('directory payload')
    if (kind === 'archive-link') expect(readFileSync(outside, 'utf8')).toBe('outside bytes')
    expect(f.state.owned.some(entry => entry.path === archive || entry.path === signature)).toBe(false)
  })

  it('keeps near-miss, other-identity and dependency cache archives byte-identical', () => {
    const f = fixture('macos-arm64', 'dryrun')
    const { archive, signature } = qaArchive(f)
    const macos = join(f.workspace, 'target', f.state.identity.target, 'release/bundle/macos')
    const other = qaIdentity({ sourceSha: SHA, runId: '9876543', attempt: '7', platform: 'macos-arm64', mode: 'dryrun' }).productName
    const suffix = put(join(macos, `${f.state.identity.productName}.app.tar.gz.extracted`), 'near-miss suffix bytes')
    const historical = put(join(macos, `${other}.app.tar.gz`), 'other-identity archive bytes')
    const dependency = put(join(f.workspace, 'target/release/deps/mark-abcdef.tar.gz'), 'dependency cache bytes')
    put(archive, 'owned archive bytes')
    recordGenerated(f.state); cleanupGenerated(f.state)
    expect(readFileSync(suffix, 'utf8')).toBe('near-miss suffix bytes')
    expect(readFileSync(historical, 'utf8')).toBe('other-identity archive bytes')
    expect(readFileSync(dependency, 'utf8')).toBe('dependency cache bytes')
    expect(existsSync(archive)).toBe(false); expect(existsSync(signature)).toBe(false)
  })

  it.each(['link', 'directory', 'empty'])('fails truthfully on a %s archive without claiming ownership or success', kind => {
    const f = fixture('macos-arm64', 'dryrun')
    const { archive } = qaArchive(f)
    const outside = put(join(f.root, 'outside-archive'), 'outside archive bytes')
    if (kind === 'link') { mkdirSync(dirname(archive), { recursive: true }); symlinkSync(outside, archive, 'file') }
    if (kind === 'directory') put(join(archive, 'inert-entry'), 'directory payload')
    if (kind === 'empty') put(archive, '')
    expect(() => recordGenerated(f.state)).toThrow()
    expect(f.state.owned.some(entry => entry.path === archive)).toBe(false)
    expect(() => cleanupGenerated(f.state)).toThrow()
    expect(f.state.generatedCleanupComplete).toBe(false)
    if (kind === 'link') expect(readFileSync(outside, 'utf8')).toBe('outside archive bytes')
    if (kind === 'directory') expect(existsSync(archive)).toBe(true)
    if (kind === 'empty') expect(readFileSync(archive, 'utf8')).toBe('')
  })

  // POSIX-only companion: chmod 0o000 cannot deny the owner a read on Windows
  // (Node's chmod there only toggles the readonly flag), so the EACCES shape is
  // not representable on win32 runners; link/directory/empty cover the same
  // truthful-failure production path on every platform.
  it.skipIf(process.platform === 'win32')('fails truthfully on a permission archive without claiming ownership or success', () => {
    const f = fixture('macos-arm64', 'dryrun')
    const { archive } = qaArchive(f)
    put(archive, 'permission archive bytes')
    chmodSync(archive, 0o000)
    try {
      expect(() => recordGenerated(f.state)).toThrow()
      expect(f.state.owned.some(entry => entry.path === archive)).toBe(false)
      expect(() => cleanupGenerated(f.state)).toThrow()
      expect(f.state.generatedCleanupComplete).toBe(false)
    } finally { chmodSync(archive, 0o644) }
    expect(existsSync(archive)).toBe(true)
  })

  it('retains a changed owned archive without rebinding its digest and still cleans an independent owned executable', () => {
    const f = fixture('macos-arm64', 'dryrun')
    const { archive } = qaArchive(f)
    put(archive, 'original archive bytes')
    const executable = put(join(f.workspace, 'target', f.state.identity.target, 'release', PLATFORMS['macos-arm64'].executable), 'independent owned executable bytes')
    recordGenerated(f.state)
    const recorded = { ...f.state.owned.find(entry => entry.path === archive) }
    recordBinary(f.state, executable)
    put(archive, 'replaced archive bytes')
    expect(() => recordGenerated(f.state)).toThrow('archive-digest-changed')
    expect(f.state.owned.find(entry => entry.path === archive)).toMatchObject({ kind: 'archive', sha256: recorded.sha256, size: recorded.size })
    expect(() => cleanupGenerated(f.state)).toThrow(/archive-digest-changed/)
    expect(f.state.generatedCleanupComplete).toBe(false)
    expect(readFileSync(archive, 'utf8')).toBe('replaced archive bytes')
    expect(f.state.owned.find(entry => entry.path === archive).deleted).not.toBe(true)
    expect(existsSync(executable)).toBe(false)
  })

  it('never discovers archives for a non-macOS identity', () => {
    const f = fixture('windows-x64', 'dryrun')
    const archive = join(f.workspace, 'target', f.state.identity.target, 'release/bundle/macos', `${f.state.identity.productName}.app.tar.gz`)
    put(archive, 'windows archive bytes')
    recordGenerated(f.state); cleanupGenerated(f.state)
    expect(readFileSync(archive, 'utf8')).toBe('windows archive bytes')
    expect(f.state.owned.some(entry => entry.kind === 'archive' || entry.kind === 'signature')).toBe(false)
    expect(f.state.generatedCleanupComplete).toBe(true)
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

async function cleanupCliFixture(state) {
  const { spawn } = await vi.importActual('node:child_process')
  const directory = process.env.MARK_QA_CORE_EVIDENCE_ROOT || join(tmpdir(), `mark-qa-core-receipts-${process.pid}`)
  mkdirSync(directory, { recursive: true })
  const receipt = join(directory, `cleanup-cli-${Date.now()}-${Math.random().toString(16).slice(2)}.json`)
  const script = realpathSync('tools/prepare-qa-artifacts.mjs')
  const sha = path => createHash('sha256').update(readFileSync(path)).digest('hex')
  const record = { command: [process.execPath, script, 'cleanup', '--state', join(state.directory, 'state.json')],
    nodeSha256: sha(process.execPath), scriptSha256: sha(script), source: Object.fromEntries(['tools/qa-artifact-smoke.mjs', 'tools/prepare-qa-artifacts.mjs', 'tests/tools/qa-artifact-smoke.test.mjs', 'tests/tools/prepare-qa-artifacts.test.mjs'].map(path => [path, sha(path)])), fixtureRoot: state.directory, phase: 'before-spawn' }
  writeFileSync(receipt, JSON.stringify(record, null, 2))
  let child, closed, timer, output = ''
  try {
    child = spawn(process.execPath, record.command.slice(1), { stdio: ['ignore', 'pipe', 'pipe'] })
    closed = new Promise((resolve, reject) => { child.once('error', reject); child.once('close', (code, signal) => resolve({ code, signal })) })
    record.pid = child.pid; record.phase = 'spawned-before-any-further-input'
    writeFileSync(receipt, JSON.stringify(record, null, 2))
    child.stdout.on('data', bytes => { output = (output + bytes).slice(-4096) }); child.stderr.on('data', bytes => { output = (output + bytes).slice(-4096) })
    timer = setTimeout(() => child.kill('SIGKILL'), 2500)
    record.result = await closed; record.output = output; record.phase = 'closed'
    return record
  } finally {
    clearTimeout(timer)
    if (child && child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
    if (closed) { try { await closed } catch (error) { record.closeError = error.message } }
    if (child?.pid) { try { process.kill(child.pid, 0); record.pidAbsent = false } catch (error) { if (error.code !== 'ESRCH') throw error; record.pidAbsent = true } }
    record.phase = 'reaped'; writeFileSync(receipt, JSON.stringify(record, null, 2))
    expect(record.pidAbsent).toBe(true)
  }
}


describe('persisted smoke cleanup protection', () => {
  it('holds a legacy unknown mount after fresh load/discovery and actual outer cleanup CLI', async () => {
    const f = fixture('macos-arm64', 'dryrun'); put(f.installer)
    const mount = mkdtempSync(join(f.state.directory, 'mount-'))
    f.state.smoke = { mount, launchRequested: false, installedPath: '/fixture/not-a-real-app' }
    recordGenerated(f.state); saveQaState(f.state)
    const result = await cleanupCliFixture(f.state)
    expect(result.result.code).not.toBe(0)
    expect(existsSync(f.installer)).toBe(true); expect(existsSync(mount)).toBe(true)
    expect(result.output).toContain(f.installer)
  })
  it('does not let an outer CLI bypass unresolved smoke identity with no recorded PID', async () => {
    const f = fixture('macos-arm64', 'dryrun'); put(f.installer)
    f.state.smoke = { launchRequested: true, ownedPids: [], processIdentityUncertain: true, processStopped: false }
    recordGenerated(f.state); saveQaState(f.state)
    const result = await cleanupCliFixture(f.state)
    expect(result.result.code).not.toBe(0); expect(existsSync(f.installer)).toBe(true)
  })
})

function protectedFixture() {
  const f = fixture('macos-arm64', 'dryrun'); put(f.installer)
  const session = beginSmokeCleanup(f.state), mount = mkdtempSync(join(f.state.directory, 'mount-'))
  f.state.smoke = { mount, launchRequested: false, ownedPids: [], processIdentityUncertain: false }
  session.armMount(f.installer, mount)
  return { ...f, session, mount }
}

describe('persisted smoke cleanup protection validation', () => {
  it.each(['active-mount', 'active-process', 'uncertain-process'])('holds %s through fresh discovery and cleanup CLI', async kind => {
    const f = protectedFixture()
    if (kind !== 'active-mount') { f.session.detached(); f.session.armProcess() }
    if (kind === 'uncertain-process') { f.state.smoke.processIdentityUncertain = true; f.session.sync(); saveQaState(f.state) }
    recordGenerated(loadQaState(join(f.state.directory, 'state.json')))
    const result = await cleanupCliFixture(f.state)
    expect(result.result.code).not.toBe(0); expect(existsSync(f.installer)).toBe(true)
    expect(result.output).toContain(f.installer)
  })
  it.each(['version', 'identity', 'workspace', 'directory', 'config', 'escaped', 'digest', 'mount-link', 'installer-link', 'missing', 'bad-status', 'bad-pid', 'missing-launch', 'wrong-uncertainty', 'mount-mismatch', 'stopped-without-proof', 'not-launched-owned-pid'])('rejects %s protection and preserves unrelated data', async kind => {
    const f = protectedFixture(); f.session.detached(); const p = f.state.smoke.cleanupProtection
    const sentinel = put(join(f.root, 'unrelated-sentinel'), 'keep unrelated bytes')
    if (kind === 'version') p.version = 2
    if (kind === 'identity') p.identity.sourceSha = 'b'.repeat(40)
    if (kind === 'workspace') p.workspace = f.root
    if (kind === 'directory') p.directory = f.root
    if (kind === 'config') p.configSha256 = 'b'.repeat(64)
    if (kind === 'escaped') p.installer.path = sentinel
    if (kind === 'digest') put(f.installer, 'changed bytes')
    if (kind === 'mount-link') { rmSync(f.mount, { recursive: true }); symlinkSync(f.root, f.mount, process.platform === 'win32' ? 'junction' : 'dir') }
    if (kind === 'installer-link') { rmSync(f.installer); symlinkSync(sentinel, f.installer, 'file') }
    if (kind === 'missing') delete f.state.smoke.cleanupProtection
    if (kind === 'bad-status') p.mount.status = 'absent-means-safe'
    if (kind === 'bad-pid') p.process.pids = [true]
    if (kind === 'missing-launch') delete f.state.smoke.launchRequested
    if (kind === 'wrong-uncertainty') f.state.smoke.processIdentityUncertain = null
    if (kind === 'mount-mismatch') f.state.smoke.mount = join(f.state.directory, 'mount-other')
    if (kind === 'stopped-without-proof') p.process.status = 'independently-stopped'
    if (kind === 'not-launched-owned-pid') { p.process.pids = [12345]; f.state.smoke.ownedPids = [12345] }
    saveQaState(f.state)
    const result = await cleanupCliFixture(f.state)
    expect(result.result.code).not.toBe(0)
    expect(readFileSync(sentinel, 'utf8')).toBe('keep unrelated bytes')
    expect(existsSync(f.installer)).toBe(true)
  })
  it.each(['missing-state', 'truncated-state', 'stale-lifecycle'])('never replaces authoritative protection using %s', async kind => {
    const f = protectedFixture(), statePath = join(f.state.directory, 'state.json')
    if (kind === 'missing-state') rmSync(statePath)
    if (kind === 'truncated-state') writeFileSync(statePath, '{')
    if (kind === 'stale-lifecycle') {
      const fake = structuredClone(f.state); fake.smoke.cleanupProtection.mount.status = 'verified-detached'; fake.smoke.cleanupProtection.process.status = 'independently-stopped'
      writeFileSync(join(f.state.directory, 'evidence/lifecycle.json'), JSON.stringify(fake))
    }
    const result = await cleanupCliFixture(f.state)
    expect(result.result.code).not.toBe(0); expect(existsSync(f.installer)).toBe(true)
  })
  it.each(['macos-arm64', 'windows-x64'].flatMap(platform => ['dryrun', 'manual-handoff'].map(mode => ({ platform, mode }))))('preserves no-smoke $platform $mode outer cleanup', async ({ platform, mode }) => {
    const f = fixture(platform, mode); put(f.installer); recordGenerated(f.state)
    const result = await cleanupCliFixture(f.state)
    expect(result.result.code).toBe(0); expect(existsSync(f.installer)).toBe(false)
  })
  it('accepts exact persisted detach and no-launch proof through the actual outer CLI', async () => {
    const f = protectedFixture(); f.session.detached(); f.session.finish({ mountStatus: 'verified-detached', processSafe: true })
    recordGenerated(f.state)
    const result = await cleanupCliFixture(f.state)
    expect(result.result.code).toBe(0); expect(existsSync(f.installer)).toBe(false)
  })
  it('permits local safe deletion after clear-save failure while stale outer protection remains armed', async () => {
    const f = protectedFixture(); recordGenerated(f.state)
    const original = fs.writeFileSync
    const write = vi.spyOn(fs, 'writeFileSync').mockImplementation((path, ...args) => {
      if (path === join(f.state.directory, 'state.json')) throw Object.assign(Error('EACCES clear state'), { code: 'EACCES' })
      return original(path, ...args)
    })
    syncBuiltinESMExports()
    try {
      expect(() => f.session.finish({ mountStatus: 'verified-detached', processSafe: true })).toThrow('EACCES')
      expect(() => f.session.cleanup()).toThrow('EACCES')
      expect(existsSync(f.installer)).toBe(false)
    } finally { write.mockRestore(); syncBuiltinESMExports() }
    expect(loadQaState(join(f.state.directory, 'state.json')).smoke.cleanupProtection.mount.status).toBe('active-or-unknown')
    put(f.installer); const result = await cleanupCliFixture(f.state)
    expect(result.result.code).not.toBe(0); expect(existsSync(f.installer)).toBe(true)
  })
  it('does not restart or reset an existing uncertain smoke state', () => {
    const f = protectedFixture()
    expect(() => beginSmokeCleanup(loadQaState(join(f.state.directory, 'state.json')))).toThrow('smoke-restart-uncertain')
    expect(existsSync(f.installer)).toBe(true)
  })
})


describe('local cleanup proof ownership', () => {
  it('cannot turn a serialized boolean-shaped local proof into cleanup authority', () => {
    const f = protectedFixture(); recordGenerated(f.state)
    expect(() => cleanupGenerated(f.state, { localProof: { processSafe: true, mountSafe: true, state: f.state, finished: true } })).toThrow(/unknown/)
    expect(existsSync(f.installer)).toBe(true)
  })
  it('rejects escaped guard paths before opening unrelated data', () => {
    const f = protectedFixture(), outside = put(join(f.root, 'private-unrelated'), 'keep')
    f.state.smoke.cleanupProtection.installer.path = outside
    const original = fs.openSync, opened = []
    const open = vi.spyOn(fs, 'openSync').mockImplementation((path, ...args) => { opened.push(String(path)); return original(path, ...args) })
    syncBuiltinESMExports()
    try { expect(() => cleanupGenerated(f.state)).toThrow(); expect(opened).not.toContain(outside) }
    finally { open.mockRestore(); syncBuiltinESMExports() }
    expect(readFileSync(outside, 'utf8')).toBe('keep'); expect(existsSync(f.installer)).toBe(true)
  })
})

describe('deterministic native-gate cleanup protection', () => {
  it.each(['directory', 'guard', 'truncated-guard', 'linked-directory'])('protects %s even with omitted smoke flags', kind => {
    const { state, installer, root } = fixture('macos-arm64', 'dryrun'); put(installer)
    const gate = join(state.directory, 'native-launch'), guard = join(state.directory, 'gate-protection.json')
    if (kind === 'directory') mkdirSync(gate)
    if (kind === 'guard') writeFileSync(guard, '{}')
    if (kind === 'truncated-guard') writeFileSync(guard, '{')
    if (kind === 'linked-directory') { const other = join(root, 'unowned-inert'); mkdirSync(other); symlinkSync(other, gate, process.platform === 'win32' ? 'junction' : 'dir') }
    expect(() => cleanupGenerated(state)).toThrow('gate-native-proof-required')
    expect(() => beginSmokeCleanup(state, { gateProof: { processSafe: true, sources: 'forged' } })).toThrow('gate-native-proof-required')
    expect(() => loadQaState(join(state.directory, 'state.json'))).toThrow('gate-protection-state-missing')
    expect(readFileSync(installer, 'utf8')).toBe('synthetic installer bytes')
  })
  it('treats gate-presence EACCES as uncertainty and still performs no native query', () => {
    const { state, installer } = fixture('macos-arm64', 'dryrun'); put(installer)
    const original = fs.lstatSync, denied = join(state.directory, 'native-launch')
    const observation = vi.spyOn(fs, 'lstatSync').mockImplementation((path, ...args) => { if (String(path) === denied) throw Object.assign(Error('controlled gate EACCES'), { code: 'EACCES' }); return original(path, ...args) })
    syncBuiltinESMExports()
    try { expect(() => cleanupGenerated(state)).toThrow('gate-protection:controlled gate EACCES'); expect(existsSync(installer)).toBe(true) }
    finally { observation.mockRestore(); syncBuiltinESMExports() }
  })
})
