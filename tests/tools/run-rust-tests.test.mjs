// FILE: tests/tools/run-rust-tests.test.mjs
// START_MODULE_CONTRACT
//   PURPOSE: Prove CI Rust test executable ownership, actual child lifecycle and failure cleanup.
//   SCOPE: Synthetic Cargo orchestration and real temporary executable children; no Rust/app build or production paths.
//   DEPENDS: Vitest, Node built-ins and tools/run-rust-tests.mjs.
//   LINKS: M-046; V-M-046; C-CI-RUST-TEST-ARTIFACT-LIFECYCLE-EXECVE.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
// START_MODULE_MAP
//   helper - Current production lifecycle entry point.
//   fixtures - Temporary owned roots always disposed after each case.
//   fixture - Synthetic two-target Cargo and native Node executable copies.
//   waitUntil - Bound waits for observed real child evidence.
//   receipts - Read exact run evidence outside the synthetic target cache.
//   stopped - Assert the recorded native child no longer exists.
//   recordControl - Fsync exact synthetic launch, signal and cleanup evidence.
//   prepareControl - Measure owned executable/script identities before controlled launch.
//   thinFormat - Construct inert complete thin Mach-O member headers without executing them.
//   universalFormat - Construct bounded canonical FAT32/FAT64 inventory fixtures.
//   formatInventory - Exercise the actual executable inventory and retain source-bound no-launch cleanup evidence.
//   formatEvidenceStorage - Keep one lazily owned fallback metadata directory outside fixture cleanup.
//   carrierSource - Generate the reviewed literal-path execv source without interpreting runtime path bytes.
//   carrierRecord - Atomically retain fsynced source/tool/build/cleanup metadata outside executable teardown.
//   carrierState - Track only this suite's owned compiler/template and fixture cleanup proofs.
//   fixtureEvidenceRoot - Honor existing metadata sinks or lazily own a private external root.
//   digestFile - Bind exact existing runtime, compiler, script and owned fixture bytes.
//   settleCarrierToolGroup - Reap and stop only a recorded detached resolver/compiler process group.
//   syntheticEvidence - Retain fsynced pre-cleanup payload proof and final fixture cleanup without requiring a private environment.
// END_MODULE_MAP
// START_CHANGE_SUMMARY
//   - C-CI-NATIVE-FIXTURE-CARRIER: attribute a suite-owned universal execv fixture carrier separately from the unchanged Node payload; retain direct Node controls and every existing timer.
//   - C-CI-NATIVE-EVIDENCE-COMPATIBILITY: inert universal-format validation and unchanged actual official-runtime lifecycle controls.
//   - C-CI-RUST-PLATFORM-CANCELLATION-VERIFICATION: distinguish parent recovery and direct runner completion; prove exact-child escalation.
//   - 2026-11-15 C-CI-RUST-TEST-ARTIFACT-LIFECYCLE-EXECVE: actual synthetic process/filesystem fault coverage.
// END_CHANGE_SUMMARY
import * as fs from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, dirname, basename, isAbsolute } from 'node:path'
import { EventEmitter } from 'node:events'
import { spawn } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import { createHash, randomUUID } from 'node:crypto'
import { beforeAll, afterAll, afterEach, describe, expect, it, vi } from 'vitest'

// Spawn-fixture suites drive real child processes through shims; the 5 s
// vitest default flakes on loaded shared runners (C-CI-TOOLS-TIMEOUT).
vi.setConfig({ testTimeout: 30000 })
import { runRustTests, runExecutable, runOwned, cleanupFiles, validateRuntime, snapshotExecutables } from '../../tools/run-rust-tests.mjs'

const helper = resolve('tools/run-rust-tests.mjs')
const formatEvidenceStorage = {}
const digestFile = path => createHash('sha256').update(fs.readFileSync(path)).digest('hex')
const fixtureEvidenceRoot = () => process.env.MARK_RUST_TEST_EVIDENCE_ROOT || process.env.MARK_QA_CORE_EVIDENCE_ROOT || (formatEvidenceStorage.root ||= fs.mkdtempSync(join(tmpdir(), 'mark-rust-format-evidence-')))
let carrierState
function carrierSource(nodePath) {
  const literal = '"' + [...Buffer.from(nodePath)].map(byte => '\\x' + byte.toString(16).padStart(2, '0')).join('') + '"'
  return '#include <unistd.h>\n\nstatic const char bound_node[] = ' + literal + ';\n\nint main(int argc, char **argv) {\n    if (argc < 2) return 64;\n    execv(bound_node, argv);\n    static const char failure[] = "fixture-carrier: execv failed\\n";\n    (void)write(STDERR_FILENO, failure, sizeof(failure) - 1);\n    return 126;\n}\n'
}
function carrierRecord(state, phase, fields = {}) {
  Object.assign(state.record, fields, { phase })
  fs.mkdirSync(state.evidence, { recursive: true, mode: 0o700 })
  const path = join(state.evidence, `carrier-${state.identity}.json`), temporary = path + '.tmp'
  try {
    const fd = fs.openSync(temporary, 'w', 0o600)
    try { fs.writeFileSync(fd, JSON.stringify(state.record, null, 2) + '\n'); fs.fsyncSync(fd) } finally { fs.closeSync(fd) }
    fs.renameSync(temporary, path)
    const directory = fs.openSync(state.evidence, 'r'); try { fs.fsyncSync(directory) } finally { fs.closeSync(directory) }
  } finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary) }
}
async function settleCarrierToolGroup(tool, result) {
  tool.stopped = !tool.pid || result?.reaped === true
  if (!tool.stopped || !tool.pid) return
  try {
    const absent = () => { try { process.kill(-tool.pid, 0); return false } catch (error) { if (error.code === 'ESRCH') return true; throw error } }
    if (!absent()) {
      tool.groupCleanup = { group: tool.pid, requestedSignal: 'SIGTERM', stopped: false }
      process.kill(-tool.pid, 'SIGTERM')
      const deadline = Date.now() + 2000
      while (!absent() && Date.now() < deadline) await new Promise(done => setTimeout(done, 25))
    }
    tool.stopped = absent()
    if (tool.groupCleanup) tool.groupCleanup.stopped = tool.stopped
  } catch (error) { tool.stopped = false; tool.groupObservationError = error.code || 'unknown' }
}
beforeAll(async () => {
  if (process.platform !== 'darwin') return
  const fd = fs.openSync(process.execPath, 'r'), header = Buffer.alloc(4)
  try { if (fs.readSync(fd, header, 0, 4, 0) !== 4) throw Error('fixture runtime header truncated') } finally { fs.closeSync(fd) }
  if (![0xcafebabe, 0xcafebabf].includes(header.readUInt32BE(0))) return
  const root = fs.realpathSync(fs.mkdtempSync(join(tmpdir(), 'mark-rust-carrier-'))), source = join(root, 'carrier.c'), binary = join(root, 'carrier'), temporary = join(root, 'compiler-temporary')
  const resolver = '/usr/bin/xcrun', identity = randomUUID()
  fs.mkdirSync(temporary); fs.writeFileSync(source, carrierSource(process.execPath), { mode: 0o600 })
  const args = ['-arch', 'arm64', '-arch', 'x86_64', '-std=c11', '-O2', '-Wall', '-Wextra', '-Werror', '-fno-modules', source, '-o', binary]
  const state = carrierState = { root, source, binary, temporary, evidence: fixtureEvidenceRoot(), identity, fixtures: [], record: {
    identity, source: { path: source, sha256: digestFile(source), testSha256: digestFile(resolve('tests/tools/run-rust-tests.test.mjs')), helperSha256: digestFile(helper) },
    node: { path: process.execPath, sha256: digestFile(process.execPath), version: process.versions.node, arch: process.arch },
    resolver: { path: resolver, sha256: digestFile(resolver), args: ['--find', 'clang'], stopped: true },
    sdkResolver: { path: resolver, sha256: digestFile(resolver), args: ['--sdk', 'macosx', '--show-sdk-path'], stopped: true },
    compiler: { args, cwd: root, environmentOverrides: { TMPDIR: temporary } },
    ownedPaths: { root, source, binary, temporary, stdout: join(root, 'compiler.stdout'), stderr: join(root, 'compiler.stderr') },
    nativeBuild: true, linkerDefaultIncludesImplicitAdHocSigning: true, explicitSigningKeysOrCodesignUsed: false, compilerManagedSubprocessesIndividuallyPreexecRecorded: false,
    template: { path: binary, available: false }, builderStopped: true, noMarkOrAppOperation: true
  } }
  carrierRecord(state, 'source-and-resolver-before-lookup')
  let compilerOutput = '', resolverFailure
  try {
    state.record.resolver.result = await runOwned(process.execPath, [helper, '--exec-gate', resolver, '--find', 'clang'], {
      cwd: root, env: process.env, gate: true, spawnProcess: (file, launch, settings) => spawn(file, launch, { ...settings, detached: true }),
      onSpawn(pid) { state.record.resolver.pid = pid; state.record.resolver.stopped = false; carrierRecord(state, 'held-before-compiler-lookup') },
      onStdout(bytes) { compilerOutput += bytes.toString(); if (compilerOutput.length > 8192) throw Error('compiler lookup output exceeds path bound') },
      onStderr(bytes) { fs.appendFileSync(join(root, 'resolver.stderr'), bytes) }
    })
  } catch (error) { resolverFailure = error; state.record.resolver.result = error.result } finally {
    await settleCarrierToolGroup(state.record.resolver, state.record.resolver.result)
    try { carrierRecord(state, 'compiler-lookup-closed') } catch (error) { resolverFailure ||= error }
  }
  if (resolverFailure) throw resolverFailure
  const selected = compilerOutput.trim()
  if (!state.record.resolver.stopped || state.record.resolver.result.status !== 0 || !isAbsolute(selected) || /[\r\n\0]/.test(selected)) throw Error('selected Apple compiler lookup failed')
  const compiler = fs.realpathSync(selected)
  if (!fs.lstatSync(compiler).isFile()) throw Error('selected Apple compiler is not a regular file')
  let sdkOutput = '', sdkFailure
  try {
    state.record.sdkResolver.result = await runOwned(process.execPath, [helper, '--exec-gate', resolver, '--sdk', 'macosx', '--show-sdk-path'], {
      cwd: root, env: process.env, gate: true, spawnProcess: (file, launch, settings) => spawn(file, launch, { ...settings, detached: true }),
      onSpawn(pid) { state.record.sdkResolver.pid = pid; state.record.sdkResolver.stopped = false; carrierRecord(state, 'held-before-sdk-lookup') },
      onStdout(bytes) { sdkOutput += bytes.toString(); if (sdkOutput.length > 8192) throw Error('SDK lookup output exceeds path bound') },
      onStderr(bytes) { fs.appendFileSync(join(root, 'sdk-resolver.stderr'), bytes) }
    })
  } catch (error) { sdkFailure = error; state.record.sdkResolver.result = error.result } finally {
    await settleCarrierToolGroup(state.record.sdkResolver, state.record.sdkResolver.result)
    try { carrierRecord(state, 'sdk-lookup-closed') } catch (error) { sdkFailure ||= error }
  }
  if (sdkFailure) throw sdkFailure
  const selectedSDK = sdkOutput.trim()
  if (!state.record.sdkResolver.stopped || state.record.sdkResolver.result.status !== 0 || !isAbsolute(selectedSDK) || /[\r\n\0]/.test(selectedSDK)) throw Error('selected Apple SDK lookup failed')
  const sdk = fs.realpathSync(selectedSDK), sdkHeader = fs.realpathSync(join(sdk, 'usr/include/unistd.h')), sdkSettings = fs.realpathSync(join(sdk, 'SDKSettings.json'))
  if (!fs.lstatSync(sdk).isDirectory() || !sdkHeader.startsWith(sdk + '/') || !sdkSettings.startsWith(sdk + '/') || !fs.lstatSync(sdkHeader).isFile() || !fs.lstatSync(sdkSettings).isFile()) throw Error('selected Apple SDK identity is not regular')
  state.record.sdk = { path: sdk, header: { path: sdkHeader, sha256: digestFile(sdkHeader) }, settings: { path: sdkSettings, sha256: digestFile(sdkSettings) } }
  state.record.sdkResolver.selectedPath = selectedSDK
  args.unshift('-isysroot', sdk)
  Object.assign(state.record.compiler, { path: compiler, sha256: digestFile(compiler) })
  state.record.resolver.selectedPath = selected
  state.record.builderLaunch = { file: process.execPath, args: [helper, '--exec-gate', compiler, ...args] }
  carrierRecord(state, 'source-and-recipe-before-build')
  const options = { cwd: root, env: { ...process.env, TMPDIR: temporary }, gate: true,
    spawnProcess: (file, launch, settings) => spawn(file, launch, { ...settings, detached: true }),
    onSpawn(pid) { state.record.builderPid = pid; state.record.compiler.pid = pid; state.record.builderStopped = false; carrierRecord(state, 'held-before-compiler-exec', { builderGroup: pid }) },
    onStdout(bytes) { fs.appendFileSync(join(root, 'compiler.stdout'), bytes) }, onStderr(bytes) { fs.appendFileSync(join(root, 'compiler.stderr'), bytes) }
  }
  let buildFailure
  try {
    state.record.builderResult = await runOwned(process.execPath, [helper, '--exec-gate', compiler, ...args], options)
  } catch (error) { state.record.builderResult = error.result; buildFailure = error } finally {
    await settleCarrierToolGroup(state.record.compiler, state.record.builderResult)
    state.record.builderStopped = state.record.compiler.stopped
    try { carrierRecord(state, 'builder-closed') } catch (error) { buildFailure ||= error }
  }
  if (buildFailure) throw buildFailure
  if (!state.record.builderStopped || state.record.builderResult.status !== 0) throw Error('fixture carrier compiler failed or remains active')
  const bytes = fs.readFileSync(binary), magic = bytes.readUInt32BE(0), wide = magic === 0xcafebabf
  if (![0xcafebabe, 0xcafebabf].includes(magic) || bytes.readUInt32BE(4) !== 2 || !snapshotExecutables(root, ['carrier']).has(binary)) throw Error('fixture carrier is not a validated universal executable')
  expect([bytes.readUInt32BE(8), bytes.readUInt32BE(8 + (wide ? 32 : 20))].sort()).toEqual([0x01000007, 0x0100000c].sort())
  state.record.template = { path: binary, sha256: digestFile(binary), mode: fs.statSync(binary).mode, bytes: bytes.length, available: true, signatureAttribution: 'compiler/linker output covered by complete binary digest; no signing keys or explicit codesign' }
  carrierRecord(state, 'template-ready-before-any-carrier-exec')
})
afterAll(() => {
  const state = carrierState
  if (!state) return
  if (!state.record.builderStopped || !state.record.resolver.stopped || !state.record.sdkResolver.stopped) {
    carrierRecord(state, 'cleanup-held-unknown-process-or-fixture', { remainingTemplate: state.binary })
    throw Error(`fixture carrier cleanup safety unconfirmed: ${state.binary}`)
  }
  const remainingFixtures = state.fixtures.filter(f => !f.cleanupVerified).map(f => f.root)
  let failure = remainingFixtures.length ? Error(`fixture copy cleanup unconfirmed: ${remainingFixtures.join(', ')}`) : null
  let nodeUnchanged = false
  try { nodeUnchanged = digestFile(process.execPath) === state.record.node.sha256; if (!nodeUnchanged) failure ||= Error('bound fixture Node changed') } catch (error) { failure ||= error }
  const cleanupErrors = [], remainingPaths = []
  for (const path of [state.binary, state.temporary]) {
    try { fs.rmSync(path, { recursive: path === state.temporary, force: true }) } catch (error) { failure ||= error; cleanupErrors.push({ path, code: error.code || 'unknown' }) }
    try { fs.lstatSync(path); remainingPaths.push(path) } catch (error) { if (error.code !== 'ENOENT') { failure ||= error; cleanupErrors.push({ path, code: error.code || 'unknown' }); remainingPaths.push(path) } }
  }
  state.record.template.available = remainingPaths.includes(state.binary)
  state.record.executablesRemoved = remainingPaths.length === 0
  try { carrierRecord(state, state.record.executablesRemoved && !remainingFixtures.length ? 'suite-executable-cleanup-complete' : 'suite-executable-cleanup-incomplete', { boundNodeUnchanged: nodeUnchanged, remainingFixtures, remainingPaths, cleanupErrors }) } catch (error) { failure ||= error }
  if (!state.record.executablesRemoved) failure ||= Error(`fixture carrier executable remains: ${state.binary}`)
  if (failure) throw failure
})
function thinFormat({ bits = 64, little = true, cpu = 0x01000007, subtype = 3, type = 2, commands = 0 } = {}) {
  const bytes = Buffer.alloc(64), write = (value, offset) => little ? bytes.writeUInt32LE(value >>> 0, offset) : bytes.writeUInt32BE(value >>> 0, offset)
  write(bits === 64 ? 0xfeedfacf : 0xfeedface, 0); write(cpu, 4); write(subtype, 8); write(type, 12); write(commands, 20)
  return bytes
}
function universalFormat(wide = false, bits = 64, little = true, capability = false) {
  const bytes = Buffer.alloc(512), rowBytes = wide ? 32 : 20
  bytes.writeUInt32BE(wide ? 0xcafebabf : 0xcafebabe, 0); bytes.writeUInt32BE(2, 4)
  for (let index = 0; index < 2; index++) {
    const row = 8 + index * rowBytes, offset = 128 + index * 128, cpu = (bits === 64 ? 0x01000000 : 0) + (index ? 12 : 7), subtype = index ? 0 : 3
    bytes.writeUInt32BE(cpu, row); bytes.writeUInt32BE(subtype, row + 4)
    if (wide) { bytes.writeBigUInt64BE(BigInt(offset), row + 8); bytes.writeBigUInt64BE(64n, row + 16); bytes.writeUInt32BE(6, row + 24) }
    else { bytes.writeUInt32BE(offset, row + 8); bytes.writeUInt32BE(64, row + 12); bytes.writeUInt32BE(6, row + 16) }
    thinFormat({ bits, little, cpu, subtype: capability ? (subtype | 0x80000000) >>> 0 : subtype }).copy(bytes, offset)
  }
  return bytes
}
function formatInventory(bytes) {
  const root = fs.mkdtempSync(join(tmpdir(), 'mark-rust-format-fixture-')), path = join(root, 'first-0123456789abcdef'), sentinel = join(root, 'libfirst.rlib')
  const evidence = process.env.MARK_RUST_TEST_EVIDENCE_ROOT || process.env.MARK_QA_CORE_EVIDENCE_ROOT || (formatEvidenceStorage.root ||= fs.mkdtempSync(join(tmpdir(), 'mark-rust-format-evidence-')))
  const record = { root, path, evidenceDirectory: evidence, syntheticFormatOnly: true, launched: false, nativePid: null, source: { helperSha256: createHash('sha256').update(fs.readFileSync(helper)).digest('hex'), testSha256: createHash('sha256').update(fs.readFileSync(resolve('tests/tools/run-rust-tests.test.mjs'))).digest('hex') }, sha256: createHash('sha256').update(bytes).digest('hex') }
  try {
    fs.writeFileSync(path, bytes); fs.writeFileSync(sentinel, 'unrelated dependency sentinel')
    record.recognized = snapshotExecutables(root, ['first']).has(path)
    expect(fs.readFileSync(sentinel, 'utf8')).toBe('unrelated dependency sentinel')
    return record.recognized
  } finally {
    fs.rmSync(root, { recursive: true, force: true }); record.fixtureRemoved = !fs.existsSync(root)
    fs.mkdirSync(evidence, { recursive: true, mode: 0o700 }); const fd = fs.openSync(join(evidence, 'format-fixtures.jsonl'), 'a', 0o600)
    try { fs.writeFileSync(fd, JSON.stringify(record) + '\n'); fs.fsyncSync(fd) } finally { fs.closeSync(fd) }
  }
}
describe('bounded universal format inventory', () => {
  it.each([[false, 32, true, false], [false, 64, true, false], [true, 32, false, false], [true, 64, false, false], [true, 64, true, true]])('recognizes complete executable members in FAT configuration %s/%s/%s/%s without launching', (wide, bits, little, capability) => {
    expect(formatInventory(universalFormat(wide, bits, little, capability))).toBe(true)
  })
  it.each([
    ['Java magic', bytes => { bytes.writeUInt32BE(0x003d0000, 4) }],
    ['zero count', bytes => { bytes.writeUInt32BE(0, 4) }],
    ['excess count', bytes => { bytes.writeUInt32BE(204, 4) }],
    ['table truncation', bytes => bytes.subarray(0, 35)],
    ['header truncation', bytes => bytes.subarray(0, 7)],
    ['offset inside table', bytes => { bytes.writeUInt32BE(8, 16) }],
    ['zero size', bytes => { bytes.writeUInt32BE(0, 20) }],
    ['short member', bytes => { bytes.writeUInt32BE(20, 20) }],
    ['end past file', bytes => { bytes.writeUInt32BE(500, 20) }],
    ['misalignment', bytes => { bytes.writeUInt32BE(129, 16) }],
    ['alignment overflow', bytes => { bytes.writeUInt32BE(32, 24) }],
    ['overlapping members', bytes => { bytes.writeUInt32BE(128, 36) }],
    ['duplicate architecture', bytes => { bytes.copy(bytes, 28, 8, 16); bytes.writeUInt32LE(0x01000007, 260); bytes.writeUInt32LE(3, 264) }],
    ['nested FAT', bytes => { bytes.writeUInt32BE(0xcafebabe, 128) }],
    ['static archive', bytes => { bytes.write('!<arch>\n', 128) }],
    ['ELF member', bytes => { bytes.writeUInt32BE(0x7f454c46, 128) }],
    ['object member', bytes => { bytes.writeUInt32LE(1, 140) }],
    ['dylib member', bytes => { bytes.writeUInt32LE(6, 140) }],
    ['CPU mismatch', bytes => { bytes.writeUInt32LE(7, 132) }],
    ['subtype mismatch', bytes => { bytes.writeUInt32LE(4, 136) }],
    ['commands past slice', bytes => { bytes.writeUInt32LE(33, 148) }],
    ['invalid second member', bytes => { bytes.writeUInt32LE(6, 268) }]
  ])('rejects malformed FAT32 %s without registration or launch', (_name, mutate) => {
    const bytes = universalFormat(); expect(formatInventory(mutate(bytes) || bytes)).toBe(false)
  })
  it.each([
    ['excess count', bytes => { bytes.writeUInt32BE(128, 4) }],
    ['unsafe offset', bytes => { bytes.writeBigUInt64BE(9007199254740992n, 16) }],
    ['overflow-like end', bytes => { bytes.writeBigUInt64BE(0xffffffffffffffffn, 24) }],
    ['reserved', bytes => { bytes.writeUInt32BE(1, 36) }],
    ['alignment overflow', bytes => { bytes.writeUInt32BE(64, 32) }],
    ['overlap', bytes => { bytes.writeBigUInt64BE(128n, 48) }]
  ])('rejects malformed FAT64 %s without registration or launch', (_name, mutate) => {
    const bytes = universalFormat(true); mutate(bytes); expect(formatInventory(bytes)).toBe(false)
  })
  it.each([[32, true], [32, false], [64, true], [64, false]])('preserves existing thin Mach-O %s/%s recognition', (bits, little) => {
    expect(formatInventory(thinFormat({ bits, little }))).toBe(true)
  })
  it('preserves existing ELF and PE recognition', () => {
    for (const type of [2, 3]) { const bytes = Buffer.alloc(20); bytes.writeUInt32BE(0x7f454c46, 0); bytes[5] = 1; bytes.writeUInt16LE(type, 16); expect(formatInventory(bytes)).toBe(true) }
    const bytes = Buffer.alloc(20); bytes.write('MZ'); expect(formatInventory(bytes)).toBe(true)
  })
})
const fixtures = []
function syntheticEvidence(record) {
  const root = fixtureEvidenceRoot(); fs.mkdirSync(root, { recursive: true, mode: 0o700 })
  const fd = fs.openSync(join(root, 'synthetic-child-receipts.jsonl'), 'a', 0o600)
  try { fs.writeFileSync(fd, JSON.stringify(record) + '\n'); fs.fsyncSync(fd) } finally { fs.closeSync(fd) }
}
afterEach(async () => {
  const errors = []
  for (const f of fixtures.splice(0)) {
    let records = [], safe = false, payloadProof = [], payloadProofState = 'unread'
    try {
      f.signals.emit('SIGTERM')
      for (const child of f.external) if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM')
      await Promise.allSettled([...f.pending])
      records = receipts(f.root)
      for (const row of records) if (row.nativePid) stopped(row.nativePid)
      safe = f.external.every(child => child.exitCode !== null || child.signalCode !== null)
      if (!safe) errors.push(Error(`owned fixture tools remain: ${f.root}`))
    } catch (error) { errors.push(error) }
    try {
      let payload
      try { payload = fs.readFileSync(f.proof, 'utf8') } catch (error) {
        if (error.code === 'ENOENT') payloadProofState = 'no-payload-ENOENT'
        else { payloadProofState = 'read-failed'; errors.push(Error(`fixture payload proof read failed: ${error.code || 'unknown'}`)) }
      }
      if (payload !== undefined) {
        try {
          if (!payload.trim()) throw Error('empty proof')
          payloadProof = payload.trim().split('\n').map(line => JSON.parse(line))
          if (payloadProof.some(row => !row || typeof row !== 'object' || Array.isArray(row))) throw Error('proof row shape')
          payloadProofState = 'retained'
        } catch {
          payloadProof = []; payloadProofState = 'parse-failed'; errors.push(Error('fixture payload proof parse failed'))
        }
      }
      syntheticEvidence({ phase: 'payload-before-fixture-cleanup', fixture: f.root, source: f.source, records, payloadProofState, payloadProof, controls: f.controls, externalPids: f.external.map(child => child.pid) })
    } catch (error) { errors.push(error) }
    if (safe) {
      try {
        fs.rmSync(f.root, { recursive: true, force: true })
        try { fs.lstatSync(f.root); errors.push(Error(`owned fixture remains: ${f.root}`)) } catch (error) { if (error.code === 'ENOENT') f.cleanupVerified = true; else throw error }
      } catch (error) { errors.push(error) }
    }
    try {
      syntheticEvidence({ phase: 'fixture-after-cleanup', fixture: f.root, source: f.source, records, controls: f.controls, externalPids: f.external.map(child => child.pid),
        artifactAvailable: !f.cleanupVerified, fixtureRemoved: f.cleanupVerified === true, ownedProcessesReaped: safe, payloadProofState })
    } catch (error) { errors.push(error) }
  }
  if (errors.length) throw new AggregateError(errors, 'fixture proof or cleanup failed; safe independent cleanup was attempted')
})

const fixture = (mode = 'success', { count = 2, direct = false } = {}) => {
  const root = fs.realpathSync(fs.mkdtempSync(join(tmpdir(), 'mark-rust-lifecycle-fixture-')))
  const target = join(root, 'target'), directory = join(target, 'debug', 'deps')
  fs.mkdirSync(directory, { recursive: true })
  // Homebrew Node uses an executable-relative libnode rpath. Keep this
  // fixture dependency linked to the unchanged installed tool, never copied.
  if (process.platform === 'darwin') {
    const lib = join(dirname(process.execPath), '..', 'lib')
    for (const name of fs.readdirSync(lib).filter(name => /^libnode.*\.dylib$/.test(name))) fs.symlinkSync(join(lib, name), join(directory, name))
  }
  const proof = join(root, 'child-proof.jsonl'), cargoProof = join(root, 'cargo-proof.json')
  const script = join(root, 'child.mjs'), cargoScript = join(root, 'cargo.mjs')
  const suffix = process.platform === 'win32' ? '.exe' : ''
  const paths = ['first', 'second'].slice(0, count).map(name => join(directory, `${name}-0123456789abcdef${suffix}`))
  const artifactSource = carrierState && !direct ? carrierState.binary : process.execPath
  const source = { revision: 'synthetic-current-source', helperSha256: createHash('sha256').update(fs.readFileSync(helper)).digest('hex'),
    testSha256: createHash('sha256').update(fs.readFileSync(resolve('tests/tools/run-rust-tests.test.mjs'))).digest('hex'),
    node: { path: process.execPath, sha256: digestFile(process.execPath) },
    carrier: carrierState ? { path: carrierState.binary, sha256: carrierState.record.template.sha256, sourceSha256: carrierState.record.source.sha256 } : null }
  fs.writeFileSync(script, `
    import*as fs from'node:fs';import{dirname,join}from'node:path';
    import{createHash}from'node:crypto';
    const control=JSON.parse(fs.readFileSync(process.env.MARK_RUST_TEST_STATE,'utf8'));
    const records=fs.readdirSync(control.directory).filter(n=>/^runner-.*\\.json$/.test(n)).map(n=>JSON.parse(fs.readFileSync(join(control.directory,n),'utf8')));
    const own=records.find(r=>r.nativePid===process.pid);
    if(!own||own.source.revision!==${JSON.stringify(source.revision)}||!own.sha256)process.exit(98);
    const node=${JSON.stringify(source.node)},carrier=${JSON.stringify(source.carrier)};
    const selected=own.sha256===node.sha256?'direct-node':carrier&&own.sha256===carrier.sha256?'carrier':null;
    const digest=path=>createHash('sha256').update(fs.readFileSync(path)).digest('hex');
    const runtime={path:process.execPath,sha256:digest(process.execPath)},scriptSha256=digest(process.argv[1]);
    if(!selected||runtime.sha256!==node.sha256||scriptSha256!==own.source.scriptSha256||process.argv0!==own.path||process.execPath!==(selected==='carrier'?node.path:own.path))process.exit(98);
    const mode=${JSON.stringify(mode)};
    if(mode==='ordinary-brace-output')console.log('{ordinary test diagnostic}');
    if(mode==='child-failure')process.exitCode=7;
    if(mode==='wait'||mode==='ignore-signals'){
      setInterval(()=>{},100);
      for(const signal of['SIGINT','SIGTERM'])process.on(signal,()=>{if(mode==='wait')process.exit(0)});
    }
    fs.appendFileSync(${JSON.stringify(proof)},JSON.stringify({pid:process.pid,beforeExecRecorded:true,cwd:process.cwd(),args:process.argv.slice(2),marker:process.env.FIXTURE_RUNTIME_ENV,dynamic:process.env.DYLD_FALLBACK_LIBRARY_PATH,receipt:own,selectedArtifact:{kind:selected,path:own.path,sha256:own.sha256},runtime,scriptSha256,argv0:process.argv0,argv:process.argv.slice(1)})+'\\n');
    console.log('synthetic child started');
  `)
  source.scriptSha256 = digestFile(script)
  const refreshScriptIdentity = () => { source.scriptSha256 = digestFile(script); return source }
  fs.writeFileSync(cargoScript, `
    import*as fs from'node:fs';import{spawn}from'node:child_process';import{dirname,join}from'node:path';
    const args=process.argv.slice(2),config=args[args.indexOf('--config')+1];
    const runner=JSON.parse(config.slice(config.indexOf('=')+1));
    fs.writeFileSync(${JSON.stringify(cargoProof)},JSON.stringify({pid:process.pid,cwd:process.cwd(),args,runner,marker:process.env.FIXTURE_RUNTIME_ENV}));
    const mode=${JSON.stringify(mode)};
    const original=args.slice(args.indexOf('test')+1).filter(a=>!a.startsWith('--message-format'));
    const harnessArgs=original[0]==='--bin'?[]:original;
    if(mode==='compile-pending'){
      const path=${JSON.stringify(paths[0])};fs.copyFileSync(${JSON.stringify(artifactSource)},path,fs.constants.COPYFILE_FICLONE);fs.chmodSync(path,0o755);
      const ticker=setInterval(()=>console.log('synthetic compiler still running'),5);
      await new Promise(done=>setTimeout(done,8000));clearInterval(ticker);process.exit(0);
    }
    if(mode==='chatty'){
      const path=${JSON.stringify(paths[1] || paths[0])};fs.copyFileSync(${JSON.stringify(artifactSource)},path,fs.constants.COPYFILE_FICLONE);fs.chmodSync(path,0o755);
      console.log(JSON.stringify({reason:'compiler-artifact',package_id:'workspace',profile:{test:false},target:{name:'second',kind:['bin']},executable:path}));
    }
    for(const path of ${JSON.stringify(paths)}){
      if(!fs.existsSync(path))fs.copyFileSync(${JSON.stringify(artifactSource)},path,fs.constants.COPYFILE_FICLONE);fs.chmodSync(path,0o755);
      if(mode==='changed-output-failure'){fs.appendFileSync(path,Buffer.of(0));process.exit(2)};
      if(mode==='missing-metadata')process.exit(2);
      if(mode==='truncated-metadata'){process.stdout.write('{"reason":"compiler-artifact"');process.exit(0)};
      const executable=mode==='outside-metadata'?${JSON.stringify(join(root, 'outside'))}:mode==='dependency-metadata'?${JSON.stringify(join(directory, 'libfirst.rlib'))}:mode==='linked-parent-metadata'?${JSON.stringify(join(target, 'linked-parent', basename(paths[0])))}:path;
      console.log(JSON.stringify({reason:'compiler-artifact',package_id:'workspace',profile:{test:mode!=='normal-output-failure'},target:{name:path.includes('first')?'first':'second',kind:['bin']},executable}));
      if(mode==='compile-failure'||mode==='normal-output-failure')process.exit(101);
      if(mode==='corrupt-runner-receipt'){fs.writeFileSync(join(dirname(process.env.MARK_RUST_TEST_STATE),'runner-corrupt.json'),'{');process.exit(0)};
      if(mode==='inaccessible-runner-evidence')process.exit(0);
      const status=await new Promise((done,fail)=>{
        const child=spawn(runner[0],[...runner.slice(1),path,${JSON.stringify(script)},...harnessArgs],{stdio:'inherit',env:process.env});
        child.once('error',fail);child.once('close',code=>done(code));
      });
      if(status!==0)process.exit(101);
    }
  `)
  const context = () => ({ target, triple: 'synthetic-host', packageIds: ['workspace'], names: ['first', 'second'] })
  const signals = new EventEmitter()
  const options = { args: [], cwd: root, context, identity: () => source, cargo: process.execPath, cargoPrefix: [cargoScript],
    environment: { ...process.env, FIXTURE_RUNTIME_ENV: 'preserved-cargo-environment', DYLD_FALLBACK_LIBRARY_PATH: 'synthetic-preserved-dynamic-search', RUNNER_TEMP: root },
    output() {}, errorOutput(bytes) { process.stderr.write(bytes) }, signals, graceMs: 150 }
  const pending = new Set()
  const external = []
  const run = (overrides = {}) => {
    refreshScriptIdentity()
    const operation = runRustTests({ ...options, ...overrides })
    pending.add(operation)
    operation.finally(() => pending.delete(operation)).catch(() => {})
    return operation
  }
  // Driver/state serialization binds edits made before launch; teardown retains the last snapshot.
  const value = { root, target, directory, paths, proof, cargoProof, script, get source() { return this.cleanupVerified ? source : refreshScriptIdentity() }, signals, options, pending, external, run, controls: [] }
  fixtures.push(value)
  if (carrierState) carrierState.fixtures.push(value)
  return value
}

const waitUntil = async predicate => {
  const deadline = Date.now() + 2500
  while (!predicate()) {
    if (Date.now() > deadline) throw Error('synthetic child watchdog')
    await new Promise(done => setTimeout(done, 10))
  }
}
const receipts = root => fs.readdirSync(root).filter(name => name.startsWith('mark-rust-tests-')).flatMap(name => {
  const directory = join(root, name)
  return fs.readdirSync(directory).filter(file => /^runner-.*\.json$/.test(file)).map(file => { try { return JSON.parse(fs.readFileSync(join(directory, file), 'utf8')) } catch { return { malformed: true, file } } })
})
const stopped = pid => {
  expect(() => process.kill(pid, 0)).toThrow()
}

// Only these new controls add launch records; old fixture behavior stays intact.
const recordControl = control => {
  const fd = fs.openSync(control.evidencePath, 'w', 0o600)
  try { fs.writeFileSync(fd, JSON.stringify(control)); fs.fsyncSync(fd) } finally { fs.closeSync(fd) }
}
const prepareControl = (f, name, executables, scripts) => {
  const digest = path => createHash('sha256').update(fs.readFileSync(path)).digest('hex')
  const control = {
    name, evidencePath: join(f.root, `control-${f.controls.length}.json`), source: f.source,
    runtime: { path: process.execPath, sha256: digest(process.execPath) },
    scripts: Object.fromEntries(scripts.map(path => [path, digest(path)])),
    executables: executables.map(path => ({ path, sha256: digest(path), available: true })),
    recording: process.platform === 'win32' ? 'PID at spawn before controlled input' : 'same PID before production exec gate release',
    events: [{ phase: 'identities-before-launch' }]
  }
  f.controls.push(control)
  recordControl(control)
  return control
}

describe('selected native fixture and final Node attribution', () => {
  it('keeps the recorded native PID through the selected carrier or direct fixture into the bound Node payload', async () => {
    const f = fixture('success', { count: 1 })
    expect((await f.run()).status).toBe(0)
    const row = JSON.parse(fs.readFileSync(f.proof, 'utf8'))
    expect(row.pid).toBe(row.receipt.nativePid)
    expect(row.selectedArtifact).toEqual({ kind: carrierState ? 'carrier' : 'direct-node', path: f.paths[0], sha256: carrierState ? carrierState.record.template.sha256 : f.source.node.sha256 })
    expect(row.runtime).toEqual({ path: carrierState ? f.source.node.path : f.paths[0], sha256: f.source.node.sha256 })
    expect(row.scriptSha256).toBe(f.source.scriptSha256)
    expect(row.argv0).toBe(f.paths[0]); expect(row.argv).toEqual([f.script]); expect(row.args).toEqual([])
    expect(row.cwd).toBe(f.root); expect(row.marker).toBe('preserved-cargo-environment'); expect(row.dynamic).toBe('synthetic-preserved-dynamic-search')
    expect(row.receipt.source).toEqual(f.source); stopped(row.pid)
    expect(f.paths.every(path => !fs.existsSync(path))).toBe(true)
  })
  it('executes a genuine complete copied current Node image as one direct target under the unchanged case limit', async () => {
    const f = fixture('success', { count: 1, direct: true })
    expect((await f.run()).status).toBe(0)
    const row = JSON.parse(fs.readFileSync(f.proof, 'utf8'))
    expect(row.pid).toBe(row.receipt.nativePid)
    expect(row.selectedArtifact).toEqual({ kind: 'direct-node', path: f.paths[0], sha256: f.source.node.sha256 })
    expect(row.runtime).toEqual({ path: f.paths[0], sha256: f.source.node.sha256 })
    expect(row.scriptSha256).toBe(f.source.scriptSha256); expect(row.argv0).toBe(f.paths[0]); expect(row.argv).toEqual([f.script])
    expect(row.cwd).toBe(f.root); expect(row.marker).toBe('preserved-cargo-environment'); expect(row.dynamic).toBe('synthetic-preserved-dynamic-search')
    expect(row.receipt.source).toEqual(f.source); stopped(row.pid)
    expect(f.paths.every(path => !fs.existsSync(path))).toBe(true)
  })
})

describe('Cargo-preserving parent and actual executable runner', () => {
  it('preserves successful child output beginning with an ordinary brace', async () => {
    const f = fixture('ordinary-brace-output')
    const result = await f.run()
    expect(result.status).toBe(0)
    expect(fs.readFileSync(join(result.state.directory, 'cargo.stdout'), 'utf8')).toContain('{ordinary test diagnostic}')
    expect(f.paths.every(path => !fs.existsSync(path))).toBe(true)
  })
  it('runs every synthetic default target with durable before-exec source/digest/PID evidence and cleans them', async () => {
    const f = fixture()
    const result = await f.run()
    expect(result.status).toBe(0)
    const proof = fs.readFileSync(f.proof, 'utf8').trim().split('\n').map(JSON.parse)
    expect(proof).toHaveLength(2)
    for (const row of proof) {
      expect(row.beforeExecRecorded).toBe(true)
      expect(row.receipt.path).toBe(f.paths[proof.indexOf(row)])
      expect(row.receipt.source).toEqual(f.source)
      expect(row.marker).toBe('preserved-cargo-environment')
      expect(row.dynamic).toBe('synthetic-preserved-dynamic-search')
      expect(row.cwd).toBe(f.root)
      expect(row.args).toEqual([])
      stopped(row.pid)
    }
    expect(f.paths.every(path => !fs.existsSync(path))).toBe(true)
    expect(receipts(f.root).every(row => row.stopped && !row.available && row.result.reaped)).toBe(true)
  })

  it.each([{ args: [] }, { args: ['--bin', 'mark'] }, { args: ['embedded_fixture_parses_and_matches_registered'] }])('preserves original arguments/cwd and lets Cargo supply harness arguments: %j', async ({ args }) => {
    const f = fixture()
    expect((await f.run({ args })).status).toBe(0)
    const cargo = JSON.parse(fs.readFileSync(f.cargoProof, 'utf8'))
    expect(cargo.args.slice(cargo.args.indexOf('test') + 1)).toEqual([...args, '--message-format=json'])
    expect(cargo.cwd).toBe(f.root)
    const proof = fs.readFileSync(f.proof, 'utf8').trim().split('\n').map(JSON.parse)
    expect(proof.every(row => JSON.stringify(row.args) === JSON.stringify(args[0] === '--bin' ? [] : args))).toBe(true)
  })

  it('preserves Cargo failure status after a real failing child and still reaps/deletes it', async () => {
    const f = fixture('child-failure')
    const result = await f.run()
    expect(result.status).toBe(101)
    expect(f.paths.every(path => !fs.existsSync(path))).toBe(true)
    const rows = receipts(f.root)
    expect(rows).toHaveLength(1)
    stopped(rows[0].nativePid)
    expect(rows[0].result.status).toBe(7)
  })

  it.each(['compile-failure', 'normal-output-failure', 'missing-metadata', 'truncated-metadata'])('cleans created project outputs after %s while preserving unrelated caches', async mode => {
    const f = fixture(mode)
    const preserved = [join(f.directory, 'unrelated-0123456789abcdef'), join(f.directory, 'first-0123456789abcdef.rlib'), join(f.directory, 'libfirst.rmeta'), join(f.target, 'dependency.dylib')]
    for (const path of preserved) fs.writeFileSync(path, 'unrelated-cache-bytes')
    if (mode === 'truncated-metadata') await expect(f.run()).rejects.toThrow()
    else expect((await f.run()).status).toBe(mode === 'missing-metadata' ? 2 : 101)
    expect(f.paths.every(path => !fs.existsSync(path))).toBe(true)
    expect(preserved.map(path => fs.readFileSync(path, 'utf8'))).toEqual(preserved.map(() => 'unrelated-cache-bytes'))
  })

  it.each(['SIGINT', 'SIGTERM'])('handles %s cancellation and reaps/deletes the exact child', async signal => {
    const f = fixture('wait')
    const running = f.run()
    await waitUntil(() => fs.existsSync(f.proof))
    f.signals.emit(signal)
    const result = await running
    expect(result.status).toBe(signal === 'SIGINT' ? 130 : 143)
    expect(f.paths.every(path => !fs.existsSync(path))).toBe(true)
    const row = receipts(f.root)[0]
    stopped(row.nativePid)
    expect(row.source).toEqual(f.source)
    expect(row.path).toBe(f.paths[0])
    expect(row.sha256).toBe(f.source.carrier ? f.source.carrier.sha256 : createHash('sha256').update(fs.readFileSync(process.execPath)).digest('hex'))
    const payload = JSON.parse(fs.readFileSync(f.proof, 'utf8').trim())
    expect(payload.pid).toBe(row.nativePid)
    expect(payload.selectedArtifact).toEqual({ kind: f.source.carrier ? 'carrier' : 'direct-node', path: row.path, sha256: row.sha256 })
    expect(payload.runtime).toEqual({ path: f.source.carrier ? f.source.node.path : row.path, sha256: createHash('sha256').update(fs.readFileSync(process.execPath)).digest('hex') })
    expect(payload.scriptSha256).toBe(f.source.scriptSha256)
    expect(payload.argv0).toBe(row.path); expect(payload.argv).toEqual([f.script]); expect(payload.args).toEqual([])
    expect(payload.cwd).toBe(f.root); expect(payload.marker).toBe('preserved-cargo-environment'); expect(payload.dynamic).toBe('synthetic-preserved-dynamic-search')
    if (process.platform === 'win32') {
      expect(result.state.stopped).toBe(true)
      expect(result.state.result.reaped).toBe(true)
      expect(result.state.result.cancelled).toBe(true)
      expect(result.state.cleanupErrors).toEqual([])
      expect(result.state.artifacts).toContainEqual(expect.objectContaining({ path: row.path, sha256: row.sha256, available: false }))
      // Windows may abruptly stop the runner, or it may finish first.
      // Preserve the actual record; an incomplete one is not a reap result.
      if (row.result) {
        expect(row.stopped).toBe(true)
        expect(row.available).toBe(false)
        expect(row.result.reaped).toBe(true)
        expect(row.result.cancelled).toBe(true)
        expect(row.result.signal).toBe('SIGTERM')
        expect(row.cleanupErrors).toEqual([])
      } else {
        expect(row.stopped).toBe(false)
        expect(row.available).toBe(true)
      }
      f.controls.push({ name: `parent-${signal}`, receiptKind: row.result ? 'completed-runner' : 'partial-spawn', parentState: result.state })
    } else {
      expect(row.stopped).toBe(true)
      expect(row.available).toBe(false)
      expect(row.result.reaped).toBe(true)
      expect(row.result.cancelled).toBe(true)
      expect(row.result.status).toBe(0) // The installed handler exits cooperatively.
      expect(row.cleanupErrors).toEqual([])
    }
  })

  it.each(['SIGINT', 'SIGTERM'])('records complete direct runner %s cancellation', async signal => {
    const f = fixture('wait', { count: 1 })
    fs.copyFileSync(process.execPath, f.paths[0], fs.constants.COPYFILE_FICLONE)
    fs.chmodSync(f.paths[0], 0o755)
    const directory = join(f.root, 'mark-rust-tests-direct')
    fs.mkdirSync(directory)
    const statePath = join(directory, 'state.json')
    fs.writeFileSync(statePath, JSON.stringify({ identity: randomUUID(), target: f.target, names: ['first'], directory, parentPid: process.pid, source: f.source }))
    const control = prepareControl(f, `direct-${signal}`, f.paths, [f.script, helper])
    const signals = new EventEmitter()
    const running = runExecutable({ statePath, args: [f.paths[0], f.script], cwd: f.root,
      env: { ...f.options.environment, MARK_RUST_TEST_STATE: statePath }, signals, graceMs: f.options.graceMs })
    f.pending.add(running)
    try {
      // existsSync fires on creation, before the writer flushes — wait for
      // PARSEABLE content (the empty-read race flakes loaded runners).
      let ready = null
      await waitUntil(() => {
        try { ready = JSON.parse(fs.readFileSync(f.proof, 'utf8').trim()); return true } catch { return false }
      })
      expect(ready.beforeExecRecorded).toBe(true)
      expect(ready.receipt.nativePid).toBe(ready.pid)
      expect(ready.receipt.sha256).toBe(control.executables[0].sha256)
      expect(ready.receipt.source).toEqual(f.source)
      control.events.push({ phase: 'ready-before-cancel', nativePid: ready.pid, receipt: ready.receipt, signal })
      recordControl(control)
      signals.emit(signal)
      const result = await running
      expect(result.status).toBe(signal === 'SIGINT' ? 130 : 143)
      const row = JSON.parse(fs.readFileSync(result.receipt, 'utf8'))
      expect(row.nativePid).toBe(ready.pid)
      expect(row.path).toBe(f.paths[0])
      expect(row.source).toEqual(f.source)
      expect(row.sha256).toBe(control.executables[0].sha256)
      expect(row.result.pid).toBe(ready.pid)
      expect(row.result.reaped).toBe(true)
      expect(row.result.cancelled).toBe(true)
      expect(row.stopped).toBe(true)
      expect(row.available).toBe(false)
      expect(row.cleanupErrors).toEqual([])
      if (process.platform === 'win32') expect(row.result.signal).toBe(signal)
      else expect(row.result.status).toBe(0)
      stopped(row.nativePid)
      expect(fs.existsSync(row.path)).toBe(false)
      control.executables[0].available = false
      control.events.push({ phase: 'completed-and-absent', receipt: row })
      recordControl(control)
    } finally {
      signals.emit('SIGTERM')
      await Promise.allSettled([running])
      f.pending.delete(running)
    }
  })

  it.each([false, true])('escalates the exact owned child after a controlled first SIGTERM no-op (receipt failure: %s)', async failEvidence => {
    const f = fixture('ignore-signals', { count: 1 })
    const script = join(f.root, 'controlled-child.mjs'), sentinelScript = join(f.root, 'sentinel.mjs')
    const proof = join(f.root, 'controlled-ready.json'), sentinelProof = join(f.root, 'sentinel-ready.json')
    const evidencePath = join(f.root, 'control-0.json')
    fs.writeFileSync(script, String.raw`
      import*as fs from'node:fs';
      if(process.platform==='win32'){let input='';for await(const bytes of process.stdin)input+=bytes;if(input!=='run\n')process.exit(98)}
      const record=JSON.parse(fs.readFileSync(${JSON.stringify(evidencePath)},'utf8'));
      if(record.nativePid!==process.pid||!record.executables[0].sha256)process.exit(98);
      process.on('SIGTERM',()=>{});setInterval(()=>{},100);
      fs.writeFileSync(${JSON.stringify(proof)},JSON.stringify({pid:process.pid,identityRecorded:true}));
    `)
    fs.writeFileSync(sentinelScript, String.raw`
      import*as fs from'node:fs';let input='';for await(const bytes of process.stdin)input+=bytes;if(input!=='run\n')process.exit(98);
      const record=JSON.parse(fs.readFileSync(${JSON.stringify(evidencePath)},'utf8'));if(record.sentinelPid!==process.pid)process.exit(98);
      process.on('SIGTERM',()=>process.exit(0));setInterval(()=>{},100);
      fs.writeFileSync(${JSON.stringify(sentinelProof)},JSON.stringify({pid:process.pid,identityRecorded:true}));
    `)
    fs.copyFileSync(process.execPath, f.paths[0], fs.constants.COPYFILE_FICLONE)
    fs.chmodSync(f.paths[0], 0o755)
    const control = prepareControl(f, 'controlled-escalation', f.paths, [script, sentinelScript, helper])
    const signals = new EventEmitter(), requests = []
    let sentinel, sentinelClosed, running, child, nativeKill, nativeClosed = false
    try {
      sentinel = spawn(process.execPath, [sentinelScript], { cwd: f.root, env: f.options.environment, stdio: ['pipe', 'ignore', 'pipe'] })
      f.external.push(sentinel)
      sentinelClosed = new Promise((done, reject) => { sentinel.once('error', reject); sentinel.once('close', (status, signal) => done({ status, signal, pid: sentinel.pid, reaped: true })) })
      f.pending.add(sentinelClosed)
      sentinel.once('spawn', () => {
        control.sentinelPid = sentinel.pid
        control.events.push({ phase: 'sentinel-spawn-before-input', pid: sentinel.pid })
        try { recordControl(control); sentinel.stdin.end('run\n') } catch (error) {
          control.evidenceError = error.message; sentinel.kill('SIGTERM')
        }
      })
      const gated = process.platform !== 'win32'
      running = runOwned(gated ? process.execPath : f.paths[0], gated ? [helper, '--exec-gate', f.paths[0], script] : [script], {
        cwd: f.root, env: f.options.environment, signals, gate: true, graceMs: f.options.graceMs,
        spawnProcess(file, args, options) {
          child = spawn(file, args, options)
          const kill = child.kill.bind(child)
          nativeKill = kill
          child.kill = signal => {
            const request = { signal, pid: child.pid }
            requests.push(request)
            if (requests.length === 1 && signal === 'SIGTERM') {
              process.kill(child.pid, 0)
              request.controlledNoOp = true
              request.aliveAfterNoOp = true
              control.events.push({ phase: 'signal-request', ...request })
              try { recordControl(control) } catch (error) {
                control.evidenceError = error.message
                control.events.push({ phase: 'evidence-write-failed', signal, code: error.code })
              }
              return true
            }
            control.events.push({ phase: 'signal-request', ...request })
            try { recordControl(control) } catch (error) {
              control.evidenceError = error.message
              control.events.push({ phase: 'evidence-write-failed', signal, code: error.code })
            }
            return kill(signal)
          }
          child.once('close', (status, signal) => {
            nativeClosed = true
            control.events.push({ phase: 'native-close', pid: child.pid, status, signal })
            try { recordControl(control) } catch (error) { control.evidenceError = error.message }
          })
          return child
        },
        onSpawn(pid) {
          control.nativePid = pid
          control.events.push({ phase: 'native-spawn-before-gate', pid }); recordControl(control)
        }
      })
      f.pending.add(running)
      await waitUntil(() => fs.existsSync(proof) && fs.existsSync(sentinelProof))
      expect(JSON.parse(fs.readFileSync(proof, 'utf8'))).toEqual({ pid: child.pid, identityRecorded: true })
      expect(JSON.parse(fs.readFileSync(sentinelProof, 'utf8'))).toEqual({ pid: sentinel.pid, identityRecorded: true })
      if (failEvidence) {
        // A real post-launch filesystem error, not a mocked controller.
        fs.unlinkSync(control.evidencePath)
        fs.mkdirSync(control.evidencePath)
        control.events.push({ phase: 'receipt-path-blocked-after-ready', fault: 'directory-instead-of-receipt' })
      }
      signals.emit('SIGTERM')
      await waitUntil(() => nativeClosed)
      const result = await running
      expect(requests).toEqual([{ signal: 'SIGTERM', pid: child.pid, controlledNoOp: true, aliveAfterNoOp: true }, { signal: 'SIGKILL', pid: child.pid }])
      expect(result).toMatchObject({ pid: child.pid, signal: 'SIGKILL', cancelled: true, cancellationSignal: 'SIGTERM', reaped: true })
      expect(control.events.some(event => event.phase === 'native-close' && event.pid === child.pid)).toBe(true)
      if (failEvidence) {
        expect(control.evidenceError).toBeTruthy()
        const failures = control.events.filter(event => event.phase === 'evidence-write-failed')
        expect(failures.map(event => event.signal)).toEqual(['SIGTERM', 'SIGKILL'])
        expect(failures.every(event => ['EISDIR', 'EACCES', 'EPERM'].includes(event.code))).toBe(true)
      } else expect(control.evidenceError).toBeUndefined()
      stopped(child.pid)
      expect(fs.existsSync(f.paths[0])).toBe(true)
      const errors = []
      cleanupFiles(f.target, control.executables, errors)
      expect(errors).toEqual([])
      expect(control.executables[0].available).toBe(false)
      expect(fs.existsSync(f.paths[0])).toBe(false)
      expect(() => process.kill(sentinel.pid, 0)).not.toThrow()
      expect(sentinel.exitCode).toBeNull()
      expect(sentinel.signalCode).toBeNull()
      control.events.push({ phase: 'native-reaped-deleted-sentinel-alive', result, sentinelPid: sentinel.pid })
      try { recordControl(control) } catch (error) {
        control.evidenceError = error.message
        control.events.push({ phase: 'post-close-evidence-write-failed', code: error.code })
      }
    } finally {
      // Rescue bypasses the evidence-writing adapter; an assertion or log
      // failure cannot prevent exact-child termination and awaited close.
      if (child?.pid && child.exitCode === null && child.signalCode === null) {
        control.events.push({ phase: 'independent-finally-rescue', pid: child.pid })
        nativeKill('SIGKILL')
      }
      await Promise.allSettled(running ? [running] : [])
      if (sentinel?.pid && sentinel.exitCode === null && sentinel.signalCode === null) sentinel.kill('SIGTERM')
      const closed = sentinelClosed ? await sentinelClosed : null
      const errors = []
      cleanupFiles(f.target, control.executables, errors)
      if (failEvidence && fs.statSync(control.evidencePath).isDirectory()) fs.rmdirSync(control.evidencePath)
      control.events.push({ phase: 'finally-cleanup', sentinelResult: closed, cleanupErrors: errors })
      recordControl(control)
      if (running) f.pending.delete(running)
      if (sentinelClosed) f.pending.delete(sentinelClosed)
      if (child?.pid) stopped(child.pid)
      if (sentinel?.pid) stopped(sentinel.pid)
      expect(errors).toEqual([])
    }
    expect(control.events.some(event => event.phase === 'independent-finally-rescue')).toBe(false)
    if (!failEvidence) expect(control.evidenceError).toBeUndefined()
  })

  it('catches parent output log failure, stops active runners and recovers owned artifact cleanup', async () => {
    const f = fixture('wait')
    await expect(f.run({ log() { throw Error('injected stdout log failure') } })).rejects.toThrow('injected stdout log failure')
    expect(f.paths.every(path => !fs.existsSync(path))).toBe(true)
    for (const row of receipts(f.root)) if (row.nativePid) stopped(row.nativePid)
  })

  it('deletes a selected cached harness while preserving unrelated preexisting output', async () => {
    const f = fixture()
    fs.copyFileSync(process.execPath, f.paths[0])
    const unrelated = join(f.directory, 'other-project-0123456789abcdef')
    fs.copyFileSync(process.execPath, unrelated)
    const original = createHash('sha256').update(fs.readFileSync(unrelated)).digest('hex')
    expect((await f.run()).status).toBe(0)
    expect(fs.existsSync(f.paths[0])).toBe(false)
    expect(createHash('sha256').update(fs.readFileSync(unrelated)).digest('hex')).toBe(original)
  })
})

describe('runner evidence and exact filesystem failures', () => {
  it('fails closed before Cargo context/build on an unsupported POSIX Node runtime', async () => {
    const f = fixture()
    let queried = false
    await expect(f.run({
      runtime() { validateRuntime({ platform: 'darwin', version: '22.14.0', execve: undefined }) },
      context() { queried = true; return f.options.context() }
    })).rejects.toThrow('requires-Node22')
    expect(queried).toBe(false)
    expect(fs.existsSync(f.cargoProof)).toBe(false)
    expect(() => validateRuntime({ platform: 'win32', version: '22.0.0', execve: undefined })).not.toThrow()
  })

  it('preserves an in-target dependency file falsely named by workspace compiler metadata', async () => {
    const f = fixture('dependency-metadata')
    const dependency = join(f.directory, 'libfirst.rlib')
    fs.writeFileSync(dependency, 'preserve-dependency-object')
    const failure = await f.run().then(() => null, error => error)
    expect(fs.readFileSync(dependency, 'utf8')).toBe('preserve-dependency-object')
    expect(failure?.message).toContain('not-workspace-executable')
    expect(f.paths.every(path => !fs.existsSync(path))).toBe(true)
  })

  it('rejects a linked parent directory and preserves its outside executable', async () => {
    const f = fixture('linked-parent-metadata')
    const outside = join(f.root, 'outside-directory')
    fs.mkdirSync(outside)
    const binary = join(outside, basename(f.paths[0]))
    fs.copyFileSync(process.execPath, binary)
    const digest = createHash('sha256').update(fs.readFileSync(binary)).digest('hex')
    fs.symlinkSync(outside, join(f.target, 'linked-parent'), 'junction')
    await expect(f.run()).rejects.toThrow('unsafe-artifact')
    expect(createHash('sha256').update(fs.readFileSync(binary)).digest('hex')).toBe(digest)
    expect(fs.lstatSync(join(f.target, 'linked-parent')).isSymbolicLink()).toBe(true)
    expect(f.paths.every(path => !fs.existsSync(path))).toBe(true)
  })

  it('cleans changed baseline project output after metadata is lost', async () => {
    const f = fixture('changed-output-failure')
    fs.copyFileSync(process.execPath, f.paths[0]); fs.chmodSync(f.paths[0], 0o755)
    expect((await f.run()).status).toBe(2)
    expect(fs.existsSync(f.paths[0])).toBe(false)
  })

  it.each(['chatty', 'compile-pending'])('catches asynchronous real CLI output EPIPE during %s and reaps/cleans owned outputs', async mode => {
    const f = fixture(mode)
    const driver = join(f.root, 'driver.mjs'), failurePath = join(f.root, 'driver-error.txt')
    fs.appendFileSync(join(f.root, 'child.mjs'), "\nif (mode === 'chatty') setInterval(() => console.log('owned synthetic output'), 5)\n")
    fs.writeFileSync(driver, `
      import{runRustTests}from ${JSON.stringify(pathToFileURL(helper).href)};import*as fs from'node:fs';
      try{const result=await runRustTests({cwd:${JSON.stringify(f.root)},args:[],
        identity:()=>(${JSON.stringify(f.source)}),context:()=>(${JSON.stringify(f.options.context())}),
        cargo:process.execPath,cargoPrefix:[${JSON.stringify(join(f.root, 'cargo.mjs'))}],environment:{...process.env,RUNNER_TEMP:${JSON.stringify(f.root)}}});process.exitCode=result.status}
      catch(error){fs.writeFileSync(${JSON.stringify(failurePath)},error.message);process.exitCode=1}
    `)
    const child = spawn(process.execPath, [driver], { stdio: ['ignore', 'pipe', 'pipe'] })
    f.external.push(child)
    child.stderr.resume()
    const closed = new Promise((done, reject) => { child.once('close', done); child.once('error', reject) })
    f.pending.add(closed); closed.finally(() => f.pending.delete(closed)).catch(() => {})
    await waitUntil(() => mode === 'chatty' ? fs.existsSync(f.proof) : fs.existsSync(f.cargoProof) && fs.existsSync(f.paths[0]))
    const interrupted = Date.now()
    child.stdout.destroy()
    expect(await closed).toBe(1)
    expect(Date.now() - interrupted).toBeLessThan(2500)
    expect(fs.readFileSync(failurePath, 'utf8')).toMatch(/EPIPE|broken pipe/i)
    expect(f.paths.every(path => !fs.existsSync(path))).toBe(true)
    for (const row of receipts(f.root)) if (row.nativePid) stopped(row.nativePid)
    const cargo = JSON.parse(fs.readFileSync(f.cargoProof, 'utf8'))
    stopped(cargo.pid)
  })

  it.each(['corrupt-runner-receipt', 'inaccessible-runner-evidence'])('still cleans real created output when %s breaks runner evidence', async mode => {
    const f = fixture(mode)
    let failure
    try { await f.run(mode === 'inaccessible-runner-evidence' ? { observe() { throw Object.assign(Error('injected directory EACCES'), { code: 'EACCES' }) } } : {}) } catch (error) { failure = error }
    finally {
      for (const name of fs.readdirSync(f.root).filter(name => name.startsWith('mark-rust-tests-'))) fs.chmodSync(join(f.root, name), 0o700)
    }
    expect(failure).toBeTruthy()
    expect(f.paths.every(path => !fs.existsSync(path))).toBe(true)
    expect(f.signals.listenerCount('SIGINT')).toBe(0)
    expect(f.signals.listenerCount('SIGTERM')).toBe(0)
  })

  it('reports inaccessible owned paths as unknown rather than deleted', () => {
    const f = fixture()
    fs.copyFileSync(process.execPath, f.paths[0])
    const item = { path: f.paths[0], available: true, sha256: createHash('sha256').update(fs.readFileSync(f.paths[0])).digest('hex') }
    const errors = []
    try {
      fs.chmodSync(f.directory, 0o000)
      cleanupFiles(f.target, [item], errors, undefined, () => { throw Object.assign(Error('injected inaccessible owned path'), { code: 'EACCES' }) })
    } finally { fs.chmodSync(f.directory, 0o700) }
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain(f.paths[0])
    expect(item.available).toBe(true)
    expect(fs.existsSync(f.paths[0])).toBe(true)
  })

  it.each([1, 2])('reaps/deletes after runner receipt write failure at write%s', async failAt => {
    const f = fixture('wait', { count: 1 })
    fs.copyFileSync(process.execPath, f.paths[0]); fs.chmodSync(f.paths[0], 0o755)
    const directory = join(f.root, 'direct'); fs.mkdirSync(directory)
    const statePath = join(directory, 'state.json')
    fs.writeFileSync(statePath, JSON.stringify({ target: f.target, names: ['first', 'second'], directory, identity: 'direct-fixture', source: f.source, parentPid: process.pid }))
    let writes = 0
    await expect(runExecutable({ statePath, args: [f.paths[0], join(f.root, 'child.mjs')], cwd: f.root, env: { ...process.env, MARK_RUST_TEST_STATE: statePath }, graceMs: 150,
      write(path, value) { if (++writes === failAt) throw Error('injected runner evidence failure'); fs.writeFileSync(path, JSON.stringify(value)) }
    })).rejects.toThrow('injected runner evidence failure')
    expect(fs.existsSync(f.paths[0])).toBe(false)
    const rows = fs.readdirSync(directory).filter(name => name.startsWith('runner-')).map(name => JSON.parse(fs.readFileSync(join(directory, name), 'utf8')))
    for (const row of rows) if (row.nativePid) stopped(row.nativePid)
    if (process.platform !== 'win32') expect(fs.existsSync(f.proof)).toBe(false)
  })

  it('fails closed on outside compiler metadata and preserves the unrelated executable', async () => {
    const f = fixture('outside-metadata')
    const outside = join(f.root, 'outside'); fs.copyFileSync(process.execPath, outside)
    await expect(f.run()).rejects.toThrow('outside-target')
    expect(fs.existsSync(outside)).toBe(true)
    expect(f.paths.every(path => !fs.existsSync(path))).toBe(true)
  })

  it('reports exact remaining artifacts on persistent cleanup failure', () => {
    const f = fixture()
    fs.copyFileSync(process.execPath, f.paths[0])
    const sha256 = createHash('sha256').update(fs.readFileSync(f.paths[0])).digest('hex')
    const errors = []
    cleanupFiles(f.target, [{ path: f.paths[0], sha256 }], errors, () => { throw Error('injected unlink denial') })
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain(f.paths[0])
    expect(fs.existsSync(f.paths[0])).toBe(true)
  })
})
