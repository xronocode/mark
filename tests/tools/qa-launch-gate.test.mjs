// @vitest-environment node
// FILE: tests/tools/qa-launch-gate.test.mjs
// START_MODULE_CONTRACT
//   PURPOSE: Exercise actual QA gate records, export seams and owned inert CLI lifetimes.
//   SCOPE: Inert files, injected image/native boundaries and actual Python fake backend; no native calls.
//   DEPENDS: Vitest; Node built-ins; qa-launch-gate; prepare-qa-artifacts; existing Python.
//   LINKS: M-046; V-M-046; C-QA-MACOS-LAUNCH-GATE.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
// START_MODULE_MAP
//   fixture - Fresh isolated identity, files and injected native boundary.
//   external - Fsync retained source/tool/PID/barrier/cleanup records outside teardown.
//   evidenceStorage - Memoize only this worker's automatically owned external metadata root.
//   cleanupFixtures - Attempt independent safe fixture deletion before reporting evidence or ownership faults.
//   execute - Run the actual gate against injected observations/exec, never Mark.
//   ownedTool - Actual controlled existing runtime child with a before-payload barrier.
//   directorySyncCalls - Retain directory-sync call observations for inert fixtures.
//   fixtureDirectorySync - Exercise actual POSIX sync or explicitly simulated Windows durability.
//   atomicGateJson - Use the actual writer with the explicit fixture sync boundary.
//   roots - Track only owned inert fixture directories.
//   children - Track exact owned existing-runtime child identities.
//   hash - Hash controlled child source bytes.
//   source - Bind every exercised helper and test source.
// END_MODULE_MAP
// START_CHANGE_SUMMARY
//   - C-QA-CORE-EVIDENCE-PORTABILITY: keep mandatory external receipts without a caller environment prerequisite and clean stopped fixtures despite recording faults.
//   - C-QA-MACOS-LAUNCH-GATE: real protocol and failure controls with final owned cleanup.
// END_CHANGE_SUMMARY
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as fs from 'node:fs'
import { delimiter, dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'
import { EventEmitter } from 'node:events'
import { cleanupSmokeQa, smokeWithSignals } from '../../tools/qa-artifact-smoke.mjs'
import { createHash } from 'node:crypto'
import { prepareQa, qaIdentity, beginSmokeCleanup, saveQaState, cleanupGenerated } from '../../tools/prepare-qa-artifacts.mjs'
import { atomicGateJson as actualAtomicGateJson, bundleManifest, gateHashFile, gatePresent, gateProtected, validBirth, validateGateRecord, currentGateRuntime, rejectExecutionHooks, prepareLaunchGate, launchGate, gateMain, capabilityMain, finishGate, resumeGateCleanup, isGateStopProof, runGateTool } from '../../tools/qa-launch-gate.mjs'
// Windows protocol fixtures simulate directory durability; production has no override.
const directorySyncCalls = []
function fixtureDirectorySync(parent) {
  directorySyncCalls.push({ parent, entries: fs.readdirSync(parent), simulatedDirectoryDurability: process.platform === 'win32' })
  if (process.platform !== 'win32') { const fd = fs.openSync(parent, 'r'); try { fs.fsyncSync(fd) } finally { fs.closeSync(fd) } }
}
const atomicGateJson = (path, value) => actualAtomicGateJson(path, value, { syncDirectory: fixtureDirectorySync })
const roots = [], children = []
const evidenceStorage = {}
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const source = () => Object.fromEntries(['tools/qa-launch-gate.mjs', 'tools/qa-pid-image.py', 'tools/qa-artifact-smoke.mjs', 'tools/prepare-qa-artifacts.mjs', 'tests/tools/qa-launch-gate.test.mjs'].map(path => [path, gateHashFile(path)]))
function external(record, { environment = process.env, storage = evidenceStorage, io = fs } = {}) {
  let root = environment.MARK_QA_CORE_EVIDENCE_ROOT
  if (!root) {
    storage.root ||= io.mkdtempSync(join(tmpdir(), 'mark-qa-core-evidence-'))
    root = storage.root
  }
  io.mkdirSync(root, { recursive: true, mode: 0o700 })
  const fd = io.openSync(join(root, 'gate-fixtures.jsonl'), 'a', 0o600)
  try { io.writeFileSync(fd, JSON.stringify({ source: source(), ...record }) + '\n'); io.fsyncSync(fd) } finally { io.closeSync(fd) }
}
function cleanupFixtures({ ownedChildren = children.splice(0), ownedRoots = roots.splice(0), syncCalls = directorySyncCalls.splice(0), write = external, observe = pid => process.kill(pid, 0), io = fs } = {}) {
  const errors = [], protectedRoots = new Set()
  const record = value => { try { write(value) } catch (error) { errors.push(error) } }
  for (const child of ownedChildren) {
    let absent = false
    try { observe(child.pid) } catch (error) { if (error.code === 'ESRCH') absent = true; else errors.push(error) }
    if (!absent) {
      if (ownedRoots.includes(child.root)) protectedRoots.add(child.root)
      else for (const root of ownedRoots) protectedRoots.add(root)
      errors.push(Error(`owned fixture tool is live or unknown: pid=${child.pid} root=${child.root || 'unbound'}`))
    }
    record({ phase: 'child-after-test', ...child, absent })
  }
  record({ phase: 'directory-sync-fixture', calls: syncCalls, simulatedDirectoryDurability: process.platform === 'win32' })
  for (const root of ownedRoots) {
    if (protectedRoots.has(root)) { record({ phase: 'fixture-retained', root, reason: 'live-or-unknown-tool' }); continue }
    let absent = false
    try {
      io.rmSync(root, { recursive: true, force: true })
      try { io.lstatSync(root) } catch (error) { if (error.code === 'ENOENT') absent = true; else throw error }
      if (!absent) throw Error(`owned fixture remains after cleanup: ${root}`)
    } catch (error) { errors.push(error) }
    record({ phase: 'fixture-removed', root, absent })
  }
  if (errors.length) throw new AggregateError(errors, `fixture cleanup or evidence failed; protected roots: ${[...protectedRoots].join(', ') || 'none'}`)
}
afterEach(() => { vi.restoreAllMocks(); cleanupFixtures() })
function fixture() {
  const root = fs.realpathSync(fs.mkdtempSync(join(tmpdir(), 'qa-gate-'))); roots.push(root)
  const workspace = join(root, 'workspace'), applications = join(root, 'Applications'); fs.mkdirSync(workspace); fs.mkdirSync(applications)
  const identity = qaIdentity({ sourceSha: 'b'.repeat(40), runId: '456', attempt: '1', platform: 'macos-arm64', mode: 'dryrun' })
  const state = prepareQa({ workspace, temporaryRoot: root, identity, actualHead: identity.sourceSha })
  const installed = join(applications, `${identity.productName}.app`), binary = join(installed, 'Contents/MacOS/mark')
  fs.mkdirSync(dirname(binary), { recursive: true }); fs.writeFileSync(binary, 'inert original native payload, never executed')
  fs.mkdirSync(join(installed, 'Contents/_CodeSignature')); fs.writeFileSync(join(installed, 'Contents/_CodeSignature/CodeResources'), 'original signature')
  fs.writeFileSync(join(installed, 'Contents/Info.plist'), 'inert metadata')
  const runtime = join(root, 'inert-runtime'); fs.writeFileSync(runtime, 'inert copied runtime, never executed')
  const cleanup = beginSmokeCleanup(state)
  state.smoke = { installedPath: installed, installedOwned: true, ownedPids: [], ownedProcesses: [], processIdentityUncertain: false, launchRequested: false }
  const installer = join(workspace, 'target', identity.target, 'release/bundle/dmg', `${identity.productName}_1.dmg`)
  fs.mkdirSync(dirname(installer), { recursive: true }); fs.writeFileSync(installer, 'inert installer')
  const mount = fs.mkdtempSync(join(state.directory, 'mount-')); state.smoke.mount = mount
  cleanup.armMount(installer, mount); cleanup.detached(); cleanup.armProcess()
  const birth = { seconds: '12345', microseconds: '7' }, pid = 23456
  let alive = false, nativeExecuted = false, now = 0, gateTask
  const calls = [], native = {
    platform: 'darwin', execArgv: [], syncDirectory: fixtureDirectorySync, gateRuntime: () => ({ path: runtime, sha256: gateHashFile(runtime), version: '22.19.0', mode: 0o600 }),
    pythonTool: () => ({ path: runtime, sha256: gateHashFile(runtime) }),
    signBootstrap() { calls.push('sign-bootstrap'); fs.writeFileSync(join(installed, 'Contents/_CodeSignature/CodeResources'), 'instrumented signature') },
    verify() { calls.push('verify') },
    async capability(session) { atomicGateJson(session.capabilityResult, { nonce: session.nonce, version: '22.19.0', execve: true }); session.toolStopped = true; calls.push('capability') },
    image(value, session) { return alive ? { status: 'present', pid: value, birth, executablePath: nativeExecuted ? binary : gatePresent(session.aside) ? session.aside : binary } : { status: 'absent', pid: value, reason: 'ESRCH' } },
    async launch(path, args) {
      calls.push('launch'); expect(path).toBe(installed); expect(args[0]).toMatch(/qa-launch-gate.mjs$/); alive = true
      gateTask = gateMain(args.at(-1), { platform: 'darwin', execArgv: [], syncDirectory: native.gateDirectorySync || fixtureDirectorySync, monotonicNow: native.gateMonotonicNow, pid, observe: value => native.image(value, state.smoke.launchGate), wait: async () => { await new Promise(resolve => setImmediate(resolve)) }, execve(file, args) { expect(file).toBe(binary); expect(args).toEqual([binary]); nativeExecuted = true; calls.push('native-exec'); throw Error('inert-exec-boundary') } }).then(() => { alive = false }, error => { if (error.message !== 'inert-exec-boundary') { alive = false; native.gateError = error } })
      while (!gatePresent(state.smoke.launchGate.hello)) await Promise.resolve()
    },
    processes() { return alive ? [{ pid, bundlePath: installed, executablePath: binary, identifier: identity.identifier }] : [] },
    windowOwnerCounts(pids) { return Object.fromEntries(pids.map(value => [value, alive ? 1 : 0])) },
    pidAlive() { return alive }, quit() { calls.push('quit'); alive = false; return { requested: true, pid } },
    async wait(ms) { await new Promise(resolve => setImmediate(resolve)); now += ms }, now: () => now
  }
  const options = { state, installed, native, checkpoint: () => { cleanup.sync(); saveQaState(state) } }
  const boundaries = { processes: () => native.processes(), windows: () => native.windowOwnerCounts(state.smoke.ownedPids), remember: rows => { state.smoke.ownedProcesses = rows }, checkpoint: options.checkpoint }
  return { root, state, native, installed, binary, runtime, installer, birth, pid, calls, options, boundaries, cleanup, setAlive: value => { alive = value }, setNative: value => { nativeExecuted = value }, task: () => gateTask }
}
describe('portable mandatory external evidence and independent fixture cleanup', () => {
  it('lazily retains a private fsynced metadata root outside fixture teardown when no environment is supplied', () => {
    const storage = {}, calls = [], io = { ...fs, openSync(...args) { calls.push(args); return fs.openSync(...args) }, fsyncSync(fd) { calls.push('fsync'); fs.fsyncSync(fd) } }
    external({ phase: 'portable-first' }, { environment: {}, storage, io })
    const root = storage.root
    external({ phase: 'portable-second' }, { environment: {}, storage, io })
    expect(storage.root).toBe(root); expect(roots).not.toContain(root)
    expect(root.startsWith(join(tmpdir(), 'mark-qa-core-evidence-'))).toBe(true)
    const path = join(root, 'gate-fixtures.jsonl'), rows = fs.readFileSync(path, 'utf8').trim().split('\n').map(line => JSON.parse(line))
    expect(rows.map(row => row.phase)).toEqual(['portable-first', 'portable-second'])
    expect(rows.every(row => JSON.stringify(row.source) === JSON.stringify(source()))).toBe(true)
    expect(calls.filter(call => call === 'fsync')).toHaveLength(2)
    expect(calls.filter(Array.isArray).every(call => call[2] === 0o600)).toBe(true)
    if (process.platform !== 'win32') expect(fs.statSync(path).mode & 0o777).toBe(0o600)
    cleanupFixtures({ ownedChildren: [], ownedRoots: [], syncCalls: [], write: () => {} })
    expect(fs.existsSync(path)).toBe(true)
    external({ phase: 'portability-metadata-retained', root, metadataOnly: true })
  })
  it('honors an explicit metadata root without allocating or changing the caller environment', () => {
    const root = fs.mkdtempSync(join(tmpdir(), 'mark-qa-core-evidence-')), environment = { MARK_QA_CORE_EVIDENCE_ROOT: root }, storage = {}
    external({ phase: 'explicit-control' }, { environment, storage, io: { ...fs, mkdtempSync() { throw Error('unexpected-default-root') } } })
    expect(environment).toEqual({ MARK_QA_CORE_EVIDENCE_ROOT: root }); expect(storage).toEqual({})
    expect(JSON.parse(fs.readFileSync(join(root, 'gate-fixtures.jsonl'), 'utf8')).phase).toBe('explicit-control')
    external({ phase: 'portability-metadata-retained', root, metadataOnly: true })
  })
  it.each(['create', 'write', 'fsync'])('fails closed on automatic metadata %s faults', fault => {
    const storage = {}, io = { ...fs, ...(fault === 'create' ? { mkdtempSync() { throw Error('metadata-create-fault') } } : fault === 'write' ? { writeFileSync() { throw Error('metadata-write-fault') } } : { fsyncSync() { throw Error('metadata-fsync-fault') } }) }
    expect(() => external({ phase: 'must-not-complete' }, { environment: {}, storage, io })).toThrow(`metadata-${fault}-fault`)
    if (storage.root) external({ phase: 'portability-incomplete-metadata-retained', root: storage.root, metadataOnly: true })
  })
  it('does not fall back or release an actual inert child payload after an explicit evidence fault', async () => {
    const f = fixture(), metadata = fs.mkdtempSync(join(tmpdir(), 'mark-qa-core-evidence-')), blocked = join(metadata, 'not-a-directory')
    fs.writeFileSync(blocked, 'inert invalid metadata sink')
    const script = "process.stdin.once('data',()=>{process.stdout.write('forbidden-payload-release');process.exit(0)})"
    vi.stubEnv('MARK_QA_CORE_EVIDENCE_ROOT', blocked)
    try { await expect(ownedTool(f, process.execPath, ['-e', script], script)).rejects.toThrow() } finally { vi.unstubAllEnvs() }
    const result = JSON.parse(fs.readFileSync(join(f.state.smoke.launchGate.evidence, 'tool-result.json')))
    expect(result.reaped).toBe(true); expect(result.stdout).not.toContain('forbidden-payload-release')
    external({ phase: 'portability-incomplete-metadata-retained', root: metadata, metadataOnly: true })
  })
  it.each(['child-after-test', 'directory-sync-fixture', 'fixture-removed'])('deletes safe fixture copies despite %s evidence faults and reports failure', phase => {
    const root = fs.mkdtempSync(join(tmpdir(), 'qa-gate-cleanup-')), calls = [], child = { pid: 23456, root, simulatedObservation: true }
    try {
      expect(() => cleanupFixtures({ ownedChildren: [child], ownedRoots: [root], syncCalls: [], observe() { throw Object.assign(Error('stopped'), { code: 'ESRCH' }) }, write(record) { calls.push(record); if (record.phase === phase) throw Error('inert-evidence-fault') } })).toThrow(AggregateError)
      expect(fs.existsSync(root)).toBe(false); expect(calls.find(record => record.phase === 'fixture-removed')).toMatchObject({ root, absent: true })
    } finally { fs.rmSync(root, { recursive: true, force: true }); external({ phase: 'portability-cleanup-control', roots: [root], absent: !fs.existsSync(root), simulatedObservation: true }) }
  })
  it.each(['alive', 'EPERM', 'EIO'])('retains only the %s child root while independently removing a safe root', mode => {
    const retained = fs.mkdtempSync(join(tmpdir(), 'qa-gate-cleanup-')), safe = fs.mkdtempSync(join(tmpdir(), 'qa-gate-cleanup-')), calls = []
    try {
      expect(() => cleanupFixtures({ ownedChildren: [{ pid: 23456, root: retained, simulatedObservation: true }], ownedRoots: [retained, safe], syncCalls: [], observe() { if (mode !== 'alive') throw Object.assign(Error(mode), { code: mode }) }, write: record => calls.push(record) })).toThrow(AggregateError)
      expect(fs.existsSync(retained)).toBe(true); expect(fs.existsSync(safe)).toBe(false)
      expect(calls).toContainEqual({ phase: 'fixture-retained', root: retained, reason: 'live-or-unknown-tool' })
    } finally { fs.rmSync(retained, { recursive: true, force: true }); fs.rmSync(safe, { recursive: true, force: true }); external({ phase: 'portability-cleanup-control', roots: [retained, safe], absent: !fs.existsSync(retained) && !fs.existsSync(safe), simulatedObservation: true }) }
  })
  it('attempts other safe roots after an independent removal fault without claiming failed removal complete', () => {
    const failed = fs.mkdtempSync(join(tmpdir(), 'qa-gate-cleanup-')), safe = fs.mkdtempSync(join(tmpdir(), 'qa-gate-cleanup-')), calls = []
    try {
      expect(() => cleanupFixtures({ ownedChildren: [], ownedRoots: [failed, safe], syncCalls: [], write: record => calls.push(record), io: { ...fs, rmSync(root, options) { if (root === failed) throw Object.assign(Error('inert-denied'), { code: 'EACCES' }); fs.rmSync(root, options) } } })).toThrow(AggregateError)
      expect(fs.existsSync(failed)).toBe(true); expect(fs.existsSync(safe)).toBe(false)
      expect(calls.find(record => record.root === failed)).toMatchObject({ phase: 'fixture-removed', absent: false })
    } finally { fs.rmSync(failed, { recursive: true, force: true }); fs.rmSync(safe, { recursive: true, force: true }); external({ phase: 'portability-cleanup-control', roots: [failed, safe], absent: !fs.existsSync(failed) && !fs.existsSync(safe), simulatedObservation: true }) }
  })
})
async function execute(f) {
  const session = await prepareLaunchGate(f.options)
  await launchGate(session, f.boundaries)
  await f.task()
  expect(f.native.gateError).toBeUndefined()
  return session
}
describe('actual protected gate protocol', () => {
  it('physically copies a separate runtime inode, restores complete original and records before native execution', async () => {
    const f = fixture(), baseline = bundleManifest(f.installed), originalRuntime = gateHashFile(f.runtime)
    const session = await execute(f)
    expect(bundleManifest(f.installed)).toEqual(baseline)
    expect(gateHashFile(f.runtime)).toBe(originalRuntime)
    expect(fs.statSync(session.aside).ino).not.toBe(fs.statSync(f.runtime).ino)
    const before = JSON.parse(fs.readFileSync(session.beforeExec))
    expect(before).toMatchObject({ pid: f.pid, birth: f.birth, nativeSha256: session.artifact.sha256, baseline: baseline.digest, targetPath: f.binary, asidePath: session.aside, beforeExecImage: { executablePath: session.aside, pid: f.pid, birth: f.birth } })
    expect(f.calls).toEqual(['sign-bootstrap', 'capability', 'launch', 'verify', 'native-exec'])
    expect(gatePresent(session.aside)).toBe(true)
    const result = await finishGate(session, f.boundaries)
    expect(result.errors).toEqual([]); expect(result.processSafe).toBe(true); expect(result.windowSafe).toBe(true)
    expect(isGateStopProof(result.proof, f.state)).toBe(true); expect(isGateStopProof(JSON.parse(JSON.stringify(result.proof)), f.state)).toBe(false)
    expect(gatePresent(f.installed)).toBe(false); expect(gatePresent(session.aside)).toBe(false)
    expect(session.normalQuitResult).toEqual({ requested: true, pid: f.pid }); expect(session.stopObservations.at(-1)).toMatchObject({ image: { status: 'absent', pid: f.pid, reason: 'ESRCH' }, pidAlive: false, windowCounts: { [f.pid]: 0 } })
    external({ phase: 'inert-positive', root: f.root, pidIsInjected: true, proof: before, nativeCommands: 0 })
  })
  it('does not allow missing guards, omitted smoke or forged terminal JSON through generic cleanup', async () => {
    const f = fixture(), session = await prepareLaunchGate(f.options)
    fs.unlinkSync(session.guard); delete f.state.smoke.launchGate
    expect(gateProtected(f.state)).toBe(true)
    expect(() => cleanupGenerated(f.state)).toThrow('gate-native-proof-required')
    delete f.state.smoke
    expect(() => cleanupGenerated(f.state)).toThrow('gate-native-proof-required')
    expect(fs.readFileSync(f.installer, 'utf8')).toBe('inert installer')
  })
  it('retains LSaccepted/nohello without adopting discovery, releasing or minting stop proof', async () => {
    const f = fixture(); f.native.launch = () => { f.calls.push('launch') }
    const session = await prepareLaunchGate(f.options)
    await expect(launchGate(session, f.boundaries)).rejects.toThrow('startup-timeout')
    const result = await finishGate(session, f.boundaries)
    expect(result.proof).toBeUndefined(); expect(result.processSafe).toBe(false)
    expect(f.state.smoke.ownedPids).toEqual([]); expect(f.calls).not.toContain('native-exec'); expect(f.calls).not.toContain('quit')
    expect(gatePresent(f.installed)).toBe(true); expect(session.retainedPaths).toContain(session.aside)
    expect(JSON.parse(fs.readFileSync(session.control)).action).toBe('abort')
    expect(result.errors.join(' ')).toContain('unknown-lifetime')
  })
  it('aborts a known held gate and deletes only after exact PID absence', async () => {
    const f = fixture(); f.native.verify = () => { throw Error('inert-restoration-refusal') }
    const session = await prepareLaunchGate(f.options)
    await expect(launchGate(session, f.boundaries)).rejects.toThrow('inert-restoration-refusal')
    expect(f.calls).not.toContain('native-exec')
    const result = await finishGate(session, f.boundaries); await f.task()
    expect(result.errors).toEqual([]); expect(result.processSafe).toBe(true); expect(gatePresent(f.installed)).toBe(false)
    expect(f.calls).not.toContain('quit')
  })
  it('keeps copied-runtime capability failure before every LS request', async () => {
    const f = fixture(); f.native.capability = () => { throw Error('inert-relocation-failed') }
    let session
    try { await prepareLaunchGate(f.options) } catch (error) { session = error.gateSession; expect(error.message).toContain('inert-relocation-failed') }
    expect(session).toBeTruthy(); expect(f.calls).not.toContain('launch')
    const result = await finishGate(session, f.boundaries)
    expect(result.processSafe).toBe(true); expect(gatePresent(f.installed)).toBe(false)
  })
  it('refuses wrong release nonce before actual executor, retaining a bound PID for cleanup', async () => {
    const f = fixture(), launch = f.native.launch
    f.native.launch = async (...args) => {
      await launch(...args)
      const hello = JSON.parse(fs.readFileSync(f.state.smoke.launchGate.hello)); hello.nonce = '0'.repeat(32)
      atomicGateJson(f.state.smoke.launchGate.hello, hello)
    }
    const session = await prepareLaunchGate(f.options)
    await expect(launchGate(session, f.boundaries)).rejects.toThrow('receipt-identity')
    const result = await finishGate(session, f.boundaries)
    expect(result.processSafe).toBe(false); expect(f.calls).not.toContain('native-exec'); expect(gatePresent(f.installed)).toBe(true)
    // Inert protocol finally: stop its loop without adopting the malformed receipt.
    atomicGateJson(session.control, { action: 'abort', nonce: session.nonce }); await f.task()
  })
  it('fresh recovery re-observes PID/birth and never relaunches or releases', async () => {
    const f = fixture(), session = await execute(f)
    const fresh = JSON.parse(fs.readFileSync(join(f.state.directory, 'state.json')))
    const recovered = resumeGateCleanup(fresh, f.native, () => saveQaState(fresh))
    const result = await finishGate(recovered, { processes: f.boundaries.processes, windows: () => f.native.windowOwnerCounts(fresh.smoke.ownedPids) })
    expect(result.processSafe).toBe(true); expect(isGateStopProof(result.proof, fresh)).toBe(true)
    expect(f.calls.filter(x => x === 'launch')).toHaveLength(1); expect(f.calls.filter(x => x === 'native-exec')).toHaveLength(1)
    expect(JSON.parse(fs.readFileSync(session.control)).action).toBe('release')
  })
  it('fresh stale no-launch flags never prove no process was launched', async () => {
    const f = fixture(), session = await prepareLaunchGate(f.options)
    const fresh = JSON.parse(fs.readFileSync(join(f.state.directory, 'state.json')))
    const recovered = resumeGateCleanup(fresh, f.native, () => saveQaState(fresh))
    const result = await finishGate(recovered, f.boundaries)
    expect(result.processSafe).toBe(false); expect(result.proof).toBeUndefined(); expect(gatePresent(f.installed)).toBe(true)
    expect(session.launchRequested).toBe(false)
  })
  it.each(['seconds-zero', 'seconds-leading-zero', 'seconds-overflow', 'usec-overflow', 'usec-leading-zero', 'number'])('rejects noncanonical birth %s', mode => {
    const birth = { seconds: '1', microseconds: '0' }
    if (mode === 'seconds-zero') birth.seconds = '0'
    if (mode === 'seconds-leading-zero') birth.seconds = '01'
    if (mode === 'seconds-overflow') birth.seconds = '18446744073709551616'
    if (mode === 'usec-overflow') birth.microseconds = '1000000'
    if (mode === 'usec-leading-zero') birth.microseconds = '01'
    if (mode === 'number') birth.seconds = 1
    expect(validBirth(birth)).toBe(false)
  })
  it('rejects unsupported platform and hook before any mutation, without a skipped test', async () => {
    const f = fixture(); f.native.platform = 'win32'
    await expect(prepareLaunchGate(f.options)).rejects.toThrow('unsupported-platform')
    expect(gateProtected(f.state)).toBe(false); expect(f.calls).toEqual([])
    vi.stubEnv('NODE_OPTIONS', '--require unreviewed')
    try { expect(() => currentGateRuntime()).toThrow('execution-hooks') } finally { vi.unstubAllEnvs() }
    await expect(gateMain(join(f.root, 'must-not-read.json'), { platform: 'win32' })).rejects.toThrow('unsupported-platform')
    await expect(capabilityMain(join(f.root, 'must-not-read.json'), { platform: 'win32' })).rejects.toThrow('unsupported-platform')
    expect(gateProtected(f.state)).toBe(false); expect(f.calls).toEqual([])
  })
})

async function ownedTool(f, file, args, payloadSource, onReady, signal) {
  const session = await prepareLaunchGate(f.options)
  let ownedChild, childClosed = false, childClose
  try {
    return await runGateTool({ file, args, session, signal, inspect: async (tool, child, closed) => {
      ownedChild = child; childClose = new Promise(resolve => child.once('close', () => { childClosed = true; resolve() }))
      children.push({ pid: tool.pidAtSpawn, root: f.root, toolPath: file, toolSha256: tool.sha256, payloadSha256: hash(payloadSource) })
      external({ phase: 'before-payload-release', ...children.at(-1), args, closed: closed() })
      if (onReady) await onReady(tool, child)
      else child.stdin.end('continue\n')
    } })
  } finally {
    let evidenceError, rescue = false
    try {
      const path = join(session.evidence, 'tool-result.json')
      if (gatePresent(path)) external({ phase: 'owned-tool-result', result: JSON.parse(fs.readFileSync(path)), rescue: false })
      else evidenceError = Error('owned tool result receipt missing')
    } catch (error) { evidenceError = error }
    // Independent rescue is only for this exact source/digest/barrier-owned inert tool.
    if (ownedChild && !childClosed) { rescue = true; ownedChild.kill('SIGKILL'); await childClose }
    const result = await finishGate(session, f.boundaries)
    try { external({ phase: 'owned-tool-copy-cleanup', rescue, processSafe: result.processSafe, copyCleanup: session.copyCleanup, errors: result.errors }) } catch (error) { evidenceError ||= error }
    expect(rescue).toBe(false); expect(session.toolStopped).toBe(true); expect(result.processSafe).toBe(true)
    if (evidenceError) throw evidenceError
  }
}
it('actual owned Node CLI receives durable PID evidence before payload release and is reaped', async () => {
  const f = fixture(), script = "process.stdin.once('data',()=>{process.stdout.write('owned control');process.exit(0)})"
  const result = await ownedTool(f, process.execPath, ['-e', script], script)
  expect(result).toMatchObject({ code: 0, reaped: true, stdout: 'owned control' })
})
it('actual owned Node CLI closes before evidence failure rejects and known copies still clean', async () => {
  const f = fixture(), script = "process.stdin.resume();setInterval(()=>{},1000)"
  await expect(ownedTool(f, process.execPath, ['-e', script], script, () => { throw Error('inert-evidence-failure') })).rejects.toThrow('inert-evidence-failure')
})
it('actual Python observer code uses injected backend, never system libproc at import or in controls', async () => {
  const f = fixture()
  let python
  for (const parent of (process.env.PATH || '').split(delimiter)) for (const name of ['python3', 'python', 'python.exe']) if (!python && fs.existsSync(join(parent, name))) python = fs.realpathSync(join(parent, name))
  expect(python).toBeTruthy()
  const script = `import sys;sys.stdin.readline();sys.dont_write_bytecode=True
import ctypes,importlib.util,json,errno
original=ctypes.CDLL
ctypes.CDLL=lambda *a,**k: (_ for _ in ()).throw(AssertionError('native libproc forbidden'))
spec=importlib.util.spec_from_file_location('observer',sys.argv[1]);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class Backend:
 def __init__(self,mode='ok'):self.mode=mode;self.calls=0
 def birth(self,pid):
  self.calls+=1
  if self.mode in ['ESRCH','EPERM','EIO']:raise OSError(getattr(errno,self.mode),'inert')
  return {'size':135 if self.mode=='short' else 136,'pid':pid+1 if self.mode=='wrongpid' else pid,'seconds':0 if self.mode=='zero' else (2 if self.mode=='reuse' and self.calls==2 else 1),'microseconds':1000000 if self.mode=='micros' else 0}
 def path(self,pid):return '/owned/image'
result={name:m.observe_pid(23456,Backend(name)) for name in ['ok','ESRCH','EPERM','EIO','short','wrongpid','zero','reuse','micros']}
assert result['ok']=={'status':'present','pid':23456,'executablePath':'/owned/image','birth':{'seconds':'1','microseconds':'0'}}
assert result['ESRCH']['status']=='absent'
assert all(result[x]['status']=='unknown' for x in ['EPERM','EIO','short','wrongpid','zero','reuse','micros'])
assert ctypes.sizeof(m.ProcBsdInfo)==136
print(json.dumps({'cases':len(result),'nativeCalls':0}))`
  const result = await ownedTool(f, python, ['-I', '-S', '-B', '-c', script, join(process.cwd(), 'tools/qa-pid-image.py')], script)
  expect(JSON.parse(result.stdout)).toEqual({ cases: 9, nativeCalls: 0 })
  expect(fs.existsSync(join(process.cwd(), 'tools/__pycache__/qa-pid-image.cpython-315.pyc'))).toBe(false)
})

describe('gate refusal, recovery and independent cleanup faults', () => {
  it.each(['missing', 'old-node', 'no-execve', 'wrong-nonce'])('refuses copied-runtime capability result %s before LS', async change => {
    const f = fixture()
    f.native.capability = session => {
      if (change !== 'missing') atomicGateJson(session.capabilityResult, { nonce: change === 'wrong-nonce' ? '0'.repeat(32) : session.nonce, version: change === 'old-node' ? '20.0.0' : '22.19.0', execve: change !== 'no-execve' })
    }
    let session
    try { await prepareLaunchGate(f.options); throw Error('unexpected capability admission') } catch (error) { session = error.gateSession; expect(session).toBeTruthy() }
    expect(f.calls).not.toContain('launch'); expect(f.calls).not.toContain('native-exec')
    const result = await finishGate(session, f.boundaries); expect(result.processSafe).toBe(true); expect(gatePresent(f.installed)).toBe(false)
  })
  it('executes actual capabilityMain through bound hello/control without a native query', async () => {
    const f = fixture()
    f.native.capability = async session => {
      atomicGateJson(session.capabilityControl, { action: 'continue', nonce: session.nonce, pid: f.pid })
      await capabilityMain(session.intent, { platform: 'darwin', execArgv: [], syncDirectory: fixtureDirectorySync, pid: f.pid, observe: () => ({ status: 'present', pid: f.pid, birth: f.birth, executablePath: session.binary }) })
      expect(JSON.parse(fs.readFileSync(session.capabilityHello))).toMatchObject({ pid: f.pid, nonce: session.nonce, birth: f.birth })
    }
    let session
    if (typeof process.execve === 'function') session = await prepareLaunchGate(f.options)
    else { try { await prepareLaunchGate(f.options) } catch (error) { session = error.gateSession; expect(error.message).toContain('copied-runtime-capability') } }
    expect(f.calls).not.toContain('launch'); expect(JSON.parse(fs.readFileSync(session.capabilityResult)).execve).toBe(typeof process.execve === 'function')
    await finishGate(session, f.boundaries)
  })
  it('keeps an accepted normal Quit separate from mere later process absence', async () => {
    const f = fixture(), session = await execute(f)
    f.native.quit = () => { f.setAlive(false); return { requested: false, pid: f.pid } }
    const result = await finishGate(session, f.boundaries)
    expect(result.errors.join(';')).toContain('normal-quit-not-accepted'); expect(result.errors.join(';')).toContain('accepted-Quit-unproven')
    expect(session.normalQuitAccepted).not.toBe(true); expect(result.processSafe).toBe(true); expect(gatePresent(f.installed)).toBe(false)
  })
  it('keeps a transient unknown process observation sticky even after ESRCH', async () => {
    const f = fixture(), session = await execute(f)
    f.setAlive(false)
    let calls = 0
    f.native.image = () => ++calls === 1 ? { status: 'unknown', pid: f.pid, reason: 'EPERM' } : { status: 'absent', pid: f.pid, reason: 'ESRCH' }
    const result = await finishGate(session, f.boundaries)
    expect(f.state.smoke.processIdentityUncertain).toBe(true); expect(result.processSafe).toBe(false); expect(result.proof).toBeUndefined()
    expect(gatePresent(f.installed)).toBe(true); expect(f.calls).not.toContain('quit')
  })
  it('never lets PID reuse or an unrecorded process authorize Quit or deletion', async () => {
    const f = fixture(), session = await execute(f)
    f.native.image = () => ({ status: 'present', pid: f.pid, birth: { seconds: '99999', microseconds: '0' }, executablePath: f.binary })
    const result = await finishGate(session, f.boundaries)
    expect(result.processSafe).toBe(false); expect(result.proof).toBeUndefined(); expect(gatePresent(f.installed)).toBe(true); expect(f.calls).not.toContain('quit')
  })
  it('fails window acceptance but deletes independently stopped known copies with a local file-only proof', async () => {
    const f = fixture(), session = await execute(f)
    let calls = 0
    const result = await finishGate(session, { ...f.boundaries, windows: () => { if (++calls === 1) throw Error('inert window uncertainty'); return { [f.pid]: 0 } } })
    expect(result.processSafe).toBe(true); expect(result.windowSafe).toBe(false); expect(result.errors.join(';')).toContain('window uncertainty')
    expect(isGateStopProof(result.proof, f.state)).toBe(true); expect(gatePresent(f.installed)).toBe(false)
    expect(gatePresent(session.guard)).toBe(true); expect(gatePresent(session.intent)).toBe(true)
  })
  it.each(['checkpoint', 'export'])('continues every known-copy deletion independently of %s evidence failure', async fault => {
    const f = fixture(), session = await execute(f)
    if (fault === 'export') { fs.rmSync(session.evidence, { recursive: true }); fs.writeFileSync(session.evidence, 'inert export denial') }
    const result = await finishGate(session, { ...f.boundaries, checkpoint: () => { if (fault === 'checkpoint') throw Error('inert checkpoint failure') } })
    expect(result.processSafe).toBe(true); expect(result.errors.length).toBeGreaterThan(0)
    for (const path of [f.installed, session.backup, session.aside, session.signatureBackup]) expect(gatePresent(path)).toBe(false)
    expect(gatePresent(session.guard)).toBe(true); expect(gatePresent(session.root)).toBe(true)
  })
  it('refuses fresh cleanup when a formerly owned capability tool has no proven close', async () => {
    const f = fixture(), session = await execute(f)
    await finishGate(session, f.boundaries)
    const fresh = JSON.parse(fs.readFileSync(join(f.state.directory, 'state.json')))
    const record = fresh.smoke.launchGate
    record.toolIntent = true; record.toolStopped = true; record.toolRecords = [{ path: session.binary, pidAtSpawn: process.pid, reaped: true }]
    atomicGateJson(record.intent, record); atomicGateJson(record.guard, record); saveQaState(fresh)
    const native = { ...f.native, pidAlive: pid => pid === process.pid }
    const recovered = resumeGateCleanup(fresh, native, () => saveQaState(fresh))
    const result = await finishGate(recovered, f.boundaries)
    expect(result.processSafe).toBe(false); expect(result.proof).toBeUndefined(); expect(f.calls.filter(x => x === 'launch')).toHaveLength(1)
  })
  it('binds source/config and restored resource modes rather than only executable names', async () => {
    const f = fixture(), session = await prepareLaunchGate(f.options)
    const record = structuredClone(f.state.smoke.launchGate)
    record.sources['qa-pid-image.py'] = '0'.repeat(64)
    expect(() => validateGateRecord(record, f.state)).toThrow('record-source-config')
    const before = session.baseline
    fs.chmodSync(join(f.installed, 'Contents/Info.plist'), 0o400)
    expect(bundleManifest(f.installed).digest).not.toBe(before.digest)
    expect(f.calls).not.toContain('launch')
    await finishGate(session, f.boundaries)
  })
})

it('critical atomic records rename real bytes before directory sync and propagate sync failure', async () => {
  const f = fixture(), path = join(f.root, 'atomic.json'), order = []
  expect(() => actualAtomicGateJson(path, { nonce: 'inert' }, { syncDirectory: parent => {
    expect(parent).toBe(f.root); expect(JSON.parse(fs.readFileSync(path))).toEqual({ nonce: 'inert' })
    expect(fs.readdirSync(parent).filter(name => name.endsWith('.tmp'))).toEqual([])
    order.push('real-bytes-renamed'); throw Error('controlled directory fsync failure')
  } })).toThrow('controlled directory fsync failure')
  expect(order).toEqual(['real-bytes-renamed'])
  if (process.platform !== 'win32') {
    actualAtomicGateJson(path, { realPosixDirectorySync: true })
    expect(JSON.parse(fs.readFileSync(path))).toEqual({ realPosixDirectorySync: true })
  } else {
    f.native.platform = 'win32'
    await expect(prepareLaunchGate(f.options)).rejects.toThrow('unsupported-platform')
    expect(f.calls).toEqual([]); expect(gateProtected(f.state)).toBe(false)
  }
})
it('directory fsync failure blocks instrumentation and LS while retaining independent cleanup', async () => {
  const f = fixture(), original = fs.readFileSync(f.binary)
  f.native.syncDirectory = () => { throw Error('controlled guard directory fsync failure') }
  let session
  try { await prepareLaunchGate(f.options) } catch (error) { session = error.gateSession; expect(error.message).toContain('directory fsync failure') }
  expect(session).toBeTruthy(); expect(fs.readFileSync(f.binary)).toEqual(original); expect(f.calls).toEqual([]); expect(gateProtected(f.state)).toBe(true)
  const result = await finishGate(session, f.boundaries)
  expect(result.processSafe).toBe(true); expect(result.errors.join(';')).toContain('directory fsync failure'); expect(gatePresent(f.installed)).toBe(false)
})
it('a fresh controlled Node CLI recovers exact stopped state using real exported helpers and no relaunch', async () => {
  const f = fixture(), session = await execute(f)
  await finishGate(session, f.boundaries)
  const controller = fixture()
  const script = `process.stdin.once('data',async()=>{try{const {loadQaState}=await import(${JSON.stringify(pathToFileURL(join(process.cwd(), 'tools/prepare-qa-artifacts.mjs')).href)});const {cleanupSmokeQa}=await import(${JSON.stringify(pathToFileURL(join(process.cwd(), 'tools/qa-artifact-smoke.mjs')).href)});const state=loadQaState(${JSON.stringify(join(f.state.directory, 'state.json'))});let nativeCalls=0;const native={now:()=>0,wait:async()=>{},image:pid=>({status:'absent',pid,reason:'ESRCH'}),pidAlive:()=>false,processes:()=>[],windowOwnerCounts:pids=>Object.fromEntries(pids.map(pid=>[pid,0])),launch(){throw Error('relaunch forbidden')},quit(){throw Error('no live native payload')}};${process.platform === 'win32' ? "native.syncDirectory=()=>{};" : ''}await cleanupSmokeQa({state,native});process.stdout.write(JSON.stringify({shutdown:state.smoke.shutdownVerified,generated:state.generatedCleanupComplete,nativeCalls}));}catch(e){process.stderr.write(e.message);process.exitCode=1}})`
  const result = await ownedTool(controller, process.execPath, ['-e', script], script)
  expect(JSON.parse(result.stdout)).toEqual({ shutdown: true, generated: true, nativeCalls: 0 })
  expect(fs.existsSync(f.installer)).toBe(false); expect(gatePresent(session.guard)).toBe(true)
})
it.each(['SIGINT', 'SIGTERM'])('cleanup-only retains signal handling until independent cleanup completes for %s', async signal => {
  const f = fixture(), session = await execute(f)
  const signals = new EventEmitter(), quit = f.native.quit
  f.native.quit = app => { signals.emit(signal); return quit(app) }
  await expect(smokeWithSignals({ cleanupOnly: true, signals, state: f.state, native: f.native })).rejects.toThrow('cancelled')
  expect(f.state.smoke.shutdownVerified).toBe(true); expect(gatePresent(f.installed)).toBe(false)
  expect(signals.listenerCount('SIGINT')).toBe(0); expect(signals.listenerCount('SIGTERM')).toBe(0)
  expect(fs.existsSync(f.installer)).toBe(false); expect(session.normalQuitAccepted).not.toBe(true) // Recovery owns a new in-memory session.
})

it('actual owned CLI cancellation is reaped before rejection and stopped inert copies are removed', async () => {
  const f = fixture(), controller = new AbortController(), script = "process.stdin.resume();setInterval(()=>{},1000)"
  await expect(ownedTool(f, process.execPath, ['-e', script], script, () => controller.abort(), controller.signal)).rejects.toThrow('cancel')
})
it('actual gate refuses full-resource corruption after restoration without reaching native executor', async () => {
  const f = fixture()
  f.native.verify = () => { fs.writeFileSync(join(f.installed, 'Contents/Info.plist'), 'inert changed resource') }
  const session = await prepareLaunchGate(f.options)
  await expect(launchGate(session, f.boundaries)).rejects.toThrow('startup-timeout')
  await f.task()
  expect(f.native.gateError?.message).toContain('native-manifest'); expect(f.calls).not.toContain('native-exec')
  expect(gatePresent(session.beforeExec)).toBe(false)
  const result = await finishGate(session, f.boundaries)
  expect(isGateStopProof(result.proof, f.state)).toBe(true); expect(result.processSafe).toBe(true); expect(result.errors.join(';')).toContain('accepted-Quit-unproven')
})
it('a failing actual gate beforeExec directory sync cannot reach the native executor', async () => {
  const f = fixture(); let faultObserved = false
  f.native.gateDirectorySync = parent => {
    if (gatePresent(join(parent, 'before-exec.json'))) { faultObserved = true; throw Error('inert beforeExec fsync refusal') }
    fixtureDirectorySync(parent)
  }
  const session = await prepareLaunchGate(f.options)
  await expect(launchGate(session, f.boundaries)).rejects.toThrow('pid-birth-image')
  await f.task()
  expect(faultObserved).toBe(true); expect(f.native.gateError?.message).toContain('beforeExec fsync refusal'); expect(f.calls).not.toContain('native-exec')
  await finishGate(session, f.boundaries)
})
it('late hello consumes the original LS appearance deadline and never receives release', async () => {
  const f = fixture(), launch = f.native.launch
  f.native.launch = async (...args) => { await launch(...args); await f.native.wait(10000) }
  const session = await prepareLaunchGate(f.options)
  await expect(launchGate(session, f.boundaries)).rejects.toThrow('startup-timeout')
  expect(f.calls.filter(call => call === 'launch')).toHaveLength(1); expect(f.calls).not.toContain('native-exec'); expect(gatePresent(session.release)).toBe(false)
  const result = await finishGate(session, f.boundaries); await f.task()
  expect(result.processSafe).toBe(true); expect(f.calls).not.toContain('quit')
})
it('actual cleanup-only CLI refuses missing guard before any native observer or deletion', async () => {
  const f = fixture(), session = await prepareLaunchGate(f.options)
  fs.unlinkSync(session.guard)
  const outer = fixture(), modulePath = join(process.cwd(), 'tools/qa-artifact-smoke.mjs')
  const script = `process.stdin.once('data',async()=>{process.argv=[process.execPath,${JSON.stringify(modulePath)},'--cleanup-only','--state',${JSON.stringify(join(f.state.directory, 'state.json'))}];await import(${JSON.stringify(pathToFileURL(modulePath).href)})})`
  await expect(ownedTool(outer, process.execPath, ['-e', script], script)).rejects.toThrow('tool-failed')
  const result = JSON.parse(fs.readFileSync(join(outer.state.directory, 'evidence/native-launch/tool-result.json')))
  expect(result.stderr).toContain('missing-recovery-state'); expect(result.reaped).toBe(true)
  expect(gatePresent(f.installed)).toBe(true); expect(gatePresent(f.installer)).toBe(true); expect(f.calls).not.toContain('launch')
  await finishGate(session, f.boundaries)
})

it('does not exec native when beforeExec fsync crosses the existing shared deadline', async () => {
  const f = fixture(); let expired = false
  f.native.gateMonotonicNow = () => BigInt(f.state.smoke.launchGate.deadlineNanoseconds) + (expired ? 1n : -1n)
  f.native.gateDirectorySync = parent => { fixtureDirectorySync(parent); if (gatePresent(f.state.smoke.launchGate.beforeExec)) expired = true }
  const session = await prepareLaunchGate(f.options)
  try { await launchGate(session, f.boundaries) } catch (error) { expect(error.message).toMatch(/pid-birth-image|startup-timeout/) }
  await f.task()
  const attempted = f.calls.includes('native-exec')
  const result = await finishGate(session, f.boundaries)
  expect(expired).toBe(true); expect(attempted).toBe(false)
  expect(result.processSafe).toBe(true); expect(gatePresent(f.installed)).toBe(false)
})
it('does not accept native appearance when a slow observer consumes the original deadline', async () => {
  const f = fixture(), image = f.native.image; let advanced = false, accepted = false
  f.native.image = async (...args) => {
    const result = image(...args)
    if (!advanced && f.calls.includes('native-exec') && result.status === 'present' && result.executablePath === f.binary) { advanced = true; await f.native.wait(10000) }
    return result
  }
  const session = await prepareLaunchGate(f.options)
  try { await launchGate(session, f.boundaries); accepted = true } catch (error) { expect(error.message).toContain('startup-timeout') }
  await f.task(); await finishGate(session, f.boundaries)
  expect(advanced).toBe(true); expect(accepted).toBe(false)
})
it('a fresh abort during beforeExec fsync prevents the captured earlier release from executing native', async () => {
  const f = fixture(); let aborted = false
  f.native.gateDirectorySync = parent => {
    fixtureDirectorySync(parent)
    const record = f.state.smoke.launchGate
    if (!aborted && gatePresent(record.beforeExec)) { aborted = true; atomicGateJson(record.control, { action: 'abort', nonce: record.nonce }) }
  }
  const session = await prepareLaunchGate(f.options)
  try { await launchGate(session, f.boundaries) } catch (error) { expect(error.message).toMatch(/pid-birth-image|startup-timeout/) }
  await f.task()
  const attempted = f.calls.includes('native-exec')
  const result = await finishGate(session, f.boundaries)
  expect(aborted).toBe(true); expect(attempted).toBe(false)
  expect(result.processSafe).toBe(true); expect(gatePresent(f.installed)).toBe(false)
})
it('does not use an ESRCH record for a different PID as owned absence', async () => {
  const f = fixture(), session = await execute(f)
  f.setAlive(false); f.native.image = () => ({ status: 'absent', pid: f.pid + 1, reason: 'ESRCH' })
  const result = await finishGate(session, f.boundaries)
  expect(result.processSafe).toBe(false); expect(result.proof).toBeUndefined(); expect(gatePresent(f.installed)).toBe(true)
})
it.each(['prelaunch', 'native'])('never persists or deletes through a replaced linked gate parent: %s', async stage => {
  const f = fixture(), session = stage === 'native' ? await execute(f) : await prepareLaunchGate(f.options)
  const held = join(f.root, 'held-native-launch'), unrelated = join(f.root, 'unrelated-inert-directory'), sentinel = join(unrelated, 'original-mark')
  fs.mkdirSync(unrelated); fs.writeFileSync(sentinel, 'unrelated sentinel bytes')
  fs.renameSync(session.root, held); fs.symlinkSync(unrelated, session.root, process.platform === 'win32' ? 'junction' : 'dir')
  try {
    await finishGate(session, f.boundaries)
    expect(gatePresent(sentinel)).toBe(true); expect(fs.readFileSync(sentinel, 'utf8')).toBe('unrelated sentinel bytes')
    expect(fs.readdirSync(unrelated)).toEqual(['original-mark'])
    expect(f.calls.includes('quit')).toBe(stage === 'native'); expect(gatePresent(f.installed)).toBe(false)
  } finally { fs.unlinkSync(session.root); fs.renameSync(held, session.root) }
})
it('does not export an unrelated JSON file from the protocol directory', async () => {
  const f = fixture(), session = await prepareLaunchGate(f.options)
  fs.writeFileSync(join(session.root, 'unrelated.json'), JSON.stringify({ inertUnrelatedValue: 'must stay local' }))
  await finishGate(session, f.boundaries)
  expect(gatePresent(join(session.evidence, 'unrelated.json'))).toBe(false)
})
it('includes launch-intent persistence in the one shared appearance window before open', async () => {
  const f = fixture(), now = f.native.now, checkpoint = f.options.checkpoint; let offset = 0, advanced = false, accepted = false
  f.native.now = () => now() + offset
  f.options.checkpoint = () => { checkpoint(); if (!advanced && f.state.smoke.launchGate?.phase === 'launch-intent') { advanced = true; offset += 10000 } }
  const session = await prepareLaunchGate(f.options)
  try { await launchGate(session, f.boundaries); accepted = true } catch (error) { expect(error.message).toContain('startup-timeout') }
  await f.task(); await finishGate(session, f.boundaries)
  expect(advanced).toBe(true); expect(accepted).toBe(false); expect(f.calls).not.toContain('launch'); expect(gatePresent(f.installed)).toBe(false)
})

it.each([['--require', 'inert'], ['-r', 'inert'], ['-rinert'], ['-r=inert'], ['--require=inert'], ['--import', 'inert'], ['--import=inert'], ['--loader', 'inert'], ['--loader=inert'], ['--experimental-loader', 'inert'], ['--experimental-loader=inert']])('rejects known CLI preload/loader argv %j without executing it', (...argv) => {
  expect(() => rejectExecutionHooks(argv, {})).toThrow('MT_QA_GATE:execution-hooks')
})
it.each(['NODE_OPTIONS', 'NODE_PATH'])('rejects inherited %s without logging its value', key => {
  let message
  try { rejectExecutionHooks([], { [key]: 'inert value never executed' }) } catch (error) { message = error.message }
  expect(message).toBe('MT_QA_GATE:execution-hooks')
})
it('preserves benign Node flags while rejecting no unrelated runtime policy', () => {
  expect(() => rejectExecutionHooks(['--conditions=node', '--conditions', 'development', '--enable-source-maps', '--inspect=127.0.0.1:0', '--max-old-space-size=2048'], {})).not.toThrow()
})
