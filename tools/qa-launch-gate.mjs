#!/usr/bin/env node
// FILE: tools/qa-launch-gate.mjs
// START_MODULE_CONTRACT
//   PURPOSE: Hold native QA execution behind a durable same-PID/birth receipt.
//   SCOPE: Owned physical copies, complete manifests, strict controls and fresh opaque cleanup proofs.
//   DEPENDS: Node built-ins; qa-pid-image read-only macOS observer; injected native boundaries.
//   LINKS: M-046; V-M-046; C-QA-MACOS-LAUNCH-GATE.
//   ROLE: SCRIPT
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
// START_MODULE_MAP
//   atomicGateJson - Exclusive atomic file and directory fsync for critical records.
//   bundleManifest - Ordered byte/mode/link inventory without following links.
//   gateProtected - Directory/guard presence independently prevents generic cleanup.
//   validateGateRecord - Bind paths, source, config, identity and current candidate.
//   observeOwnedImage - Query only the exact recorded PID using a bound Python tool.
//   prepareLaunchGate - Protect then physically instrument one owned installed app.
//   launchGate - Include the entire gate transition in the original appearance deadline.
//   gateMain - Block native execution until actual PID/birth and verified release are durable.
//   finishGate - Independent normal shutdown, stop observations and known-copy deletion.
//   resumeGateCleanup - Revalidate persisted state; recovery never releases/relaunches.
//   isGateStopProof - Pure same-invocation capability validation, never JSON authorization.
//   currentGateRuntime - Validate dynamic runtime capability without touching the source tool.
//   rejectExecutionHooks - Reject only known inherited or CLI preload/loader hooks.
//   runGateTool - Retain exact owned tool PID/argv/digest/close under a held payload barrier.
//   capabilityMain - Report only a positively observed signed copied runtime.
//   validBirth - Enforce canonical non-lossy seconds/usec tokens.
//   gateHashFile - Hash ordinary owned source and artifact bytes.
//   gatePresent - Treat only ENOENT as absence.
//   self - Resolve the checked-out gate entry path.
//   toolRoot - Locate bound observer and orchestration sources.
//   sourceNames - Enumerate the complete runtime source binding.
//   proofs - Keep file-deletion capabilities private to this invocation.
//   sessions - Reject cleanup sessions not created or revalidated here.
//   phases - Allow only declared protocol transitions.
//   launchAttempts - Distinguish actual local LS calls from serialized intent.
//   recordNames - Export only declared regular protocol JSON records.
//   fail - Emit a bounded gate failure.
//   sha - Hash record bytes.
//   mode - Read ordinary permission bits.
//   json - Read one exact JSON record.
//   optional - Treat only missing records as absent.
//   sourceHashes - Bind all runtime source bytes.
//   fingerprint - Bind isolated state/config identity.
//   same - Compare canonical protocol structures.
//   regular - Reject links and non-regular artifacts.
//   contained - Reject paths escaping or crossing linked ownership parents.
//   syncGateDirectory - Fsync the actual parent directory by default.
//   observed - Validate positive PID/birth/image observations.
//   pythonTool - Resolve and hash the existing Python interpreter.
//   snapshot - Exclude native adapters and local callbacks from records.
//   writeRecord - Use real atomic records or an explicitly injected inert sync adapter.
//   persist - Synchronize intent, independent guard and authoritative state.
//   receipt - Export JSON only under the existing evidence folder.
//   copy - Create and verify an exclusive separate-inode copy.
//   capability - Hold the exact signed copied runtime until identity is observed.
//   checkedCapability - Reject incomplete runtime/execve results.
//   until - Bound receipt appearance by the original LS deadline.
//   boundReceipt - Validate nonce/source/PID/birth ownership.
//   loadSession - Require matching intent, independent guard and state.
// END_MODULE_MAP
// START_CHANGE_SUMMARY
//   - C-QA-MACOS-LAUNCH-GATE: pre-exec ownership and independent protected cleanup; native acceptance separate.
// END_CHANGE_SUMMARY
import * as fs from 'node:fs'
import { basename, delimiter, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { execFileSync, spawn } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'

const self = fileURLToPath(import.meta.url), toolRoot = dirname(self)
const sourceNames = ['qa-launch-gate.mjs', 'qa-pid-image.py', 'qa-artifact-smoke.mjs', 'prepare-qa-artifacts.mjs']
const proofs = new WeakMap(), sessions = new WeakSet(), launchAttempts = new WeakSet()
const recordNames = new Set(['intent.json', 'control.json', 'hello.json', 'before-exec.json', 'release.json', 'capability-hello.json', 'capability-control.json', 'capability-result.json', 'gate-exit.json'])
const phases = new Set(['planned', 'protected', 'instrument-intent', 'instrumented', 'capability-confirmed', 'launch-intent', 'aside-intent', 'aside', 'restore-intent', 'restored', 'release-intent', 'native-observed', 'normal-Quit-intent', 'normal-Quit-requested', 'process-and-window-stopped', 'process-stopped-window-unknown'])
const fail = reason => { throw Error(`MT_QA_GATE:${reason}`) }
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
export const gateHashFile = path => sha(fs.readFileSync(path))
export const gatePresent = path => { try { fs.lstatSync(path); return true } catch (error) { if (error.code === 'ENOENT') return false; throw error } }
const mode = path => fs.lstatSync(path).mode & 0o777
const json = path => JSON.parse(fs.readFileSync(path, 'utf8'))
const optional = path => { try { return json(path) } catch (error) { if (error.code === 'ENOENT') return null; throw error } }
const sourceHashes = () => Object.fromEntries(sourceNames.map(name => [name, gateHashFile(join(toolRoot, name))]))
const fingerprint = state => JSON.stringify({ identity: state.identity, directory: state.directory, workspace: state.workspace, configSha256: state.configSha256 })
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
function regular(path) {
  const info = fs.lstatSync(path)
  if (!info.isFile() || info.isSymbolicLink()) fail('regular-file')
  return info
}
function contained(root, path) {
  const part = relative(root, path)
  if (!isAbsolute(root) || resolve(root) !== root || fs.realpathSync(root) !== root || !part || part === '..' || part.startsWith('..' + sep) || isAbsolute(part)) fail('path')
  let current = path
  while (current !== root) {
    if (gatePresent(current) && fs.lstatSync(current).isSymbolicLink()) fail('linked-path')
    current = dirname(current)
  }
}
function syncGateDirectory(path) {
  const parent = fs.openSync(path, 'r'); try { fs.fsyncSync(parent) } finally { fs.closeSync(parent) }
}
export function atomicGateJson(path, value, { syncDirectory = syncGateDirectory } = {}) {
  const temporary = join(dirname(path), `.${randomUUID()}.tmp`)
  let fd
  try {
    fd = fs.openSync(temporary, 'wx', 0o600)
    fs.writeFileSync(fd, JSON.stringify(value, null, 2) + '\n'); fs.fsyncSync(fd); fs.closeSync(fd); fd = undefined
    fs.renameSync(temporary, path)
    syncDirectory(dirname(path))
  } finally {
    if (fd !== undefined) fs.closeSync(fd)
    try { fs.unlinkSync(temporary) } catch (error) { if (error.code !== 'ENOENT') throw error }
  }
}
export function bundleManifest(root) {
  const entries = []
  const visit = path => {
    const info = fs.lstatSync(path), name = relative(root, path) || '.'
    if (info.isSymbolicLink()) entries.push({ path: name, kind: 'link', target: fs.readlinkSync(path) })
    else if (info.isDirectory()) {
      entries.push({ path: name, kind: 'directory', mode: info.mode & 0o777 })
      for (const child of fs.readdirSync(path).sort()) visit(join(path, child))
    } else if (info.isFile()) entries.push({ path: name, kind: 'file', mode: info.mode & 0o777, bytes: info.size, sha256: gateHashFile(path) })
    else fail('manifest-entry')
  }
  visit(root)
  return { digest: sha(JSON.stringify(entries)), entries }
}
export function gateProtected(state) {
  // Do not short circuit these observations on serialized state flags.
  const directory = gatePresent(join(state.directory, 'native-launch'))
  const guard = gatePresent(join(state.directory, 'gate-protection.json'))
  return directory || guard || state.smoke?.launchGate !== undefined
}
export function validBirth(birth) {
  return birth && typeof birth === 'object' && typeof birth.seconds === 'string' && /^[1-9][0-9]{0,19}$/.test(birth.seconds) && BigInt(birth.seconds) <= 18446744073709551615n && typeof birth.microseconds === 'string' && /^(0|[1-9][0-9]{0,5})$/.test(birth.microseconds) && Number(birth.microseconds) <= 999999
}
function observed(value, pid, birth, path) {
  if (!value || value.status !== 'present' || value.pid !== pid || !validBirth(value.birth) || (birth && !same(value.birth, birth)) || (path && value.executablePath !== path)) {
    const error = Error('MT_QA_GATE:pid-birth-image')
    error.observationUncertain = !(value?.status === 'absent' && value.pid === pid && value.reason === 'ESRCH')
    throw error
  }
  return value
}
export function rejectExecutionHooks(argv = process.execArgv, environment = process.env) {
  if (environment.NODE_OPTIONS || environment.NODE_PATH || argv.some(arg => ['--require', '-r', '--import', '--loader', '--experimental-loader'].includes(arg) || /^--(?:require|import|loader|experimental-loader)=/.test(arg) || /^-r.+/.test(arg))) fail('execution-hooks')
}
export function currentGateRuntime() {
  rejectExecutionHooks()
  if (Number(process.versions.node.split('.')[0]) < 22 || typeof process.execve !== 'function') fail('runtime-capability')
  const path = fs.realpathSync(process.execPath); regular(path)
  return { path, sha256: gateHashFile(path), mode: mode(path), version: process.versions.node }
}
// path/hash below identify the REQUESTED INTERPRETER FILE only; its framework
// process image is not inferred; separately observed tooling images remain separate evidence.
function pythonTool() {
  for (const parent of (process.env.PATH || '').split(delimiter)) {
    if (!isAbsolute(parent)) continue
    const path = join(parent, 'python3')
    if (gatePresent(path)) {
      const actual = fs.realpathSync(path); regular(actual)
      return { path: actual, sha256: gateHashFile(actual) }
    }
  }
  fail('python-unavailable')
}
// Returned executablePath/birth describe the TARGET PID, never the observer image.
export function observeOwnedImage(pid, tool) {
  if (process.platform !== 'darwin' || !Number.isSafeInteger(pid) || pid < 1 || pid > 2147483647) fail('observer-platform-or-pid')
  if (gateHashFile(tool.path) !== tool.sha256) fail('observer-tool-changed')
  return JSON.parse(execFileSync(tool.path, ['-I', '-S', '-B', join(toolRoot, 'qa-pid-image.py'), '--pid', String(pid)], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }))
}
export function validateGateRecord(record, state) {
  if (!record || record.version !== 1 || !/^[a-f0-9]{32}$/.test(record.nonce || '') || record.binding !== fingerprint(state) || record.root !== join(state.directory, 'native-launch') || record.guard !== join(state.directory, 'gate-protection.json') || record.evidence !== join(state.directory, 'evidence/native-launch')) fail('record-identity')
  if (!phases.has(record.phase) || typeof record.launchRequested !== 'boolean' || typeof record.nativeRequested !== 'boolean' || typeof record.toolStopped !== 'boolean' || (record.nativeRequested && !record.launchRequested) || (record.pid !== undefined && (!Number.isSafeInteger(record.pid) || record.pid < 1 || record.pid > 2147483647 || !validBirth(record.birth)))) fail('record-phase-or-process')
  if (state.identity.platform !== 'macos-arm64' || state.identity.mode !== 'dryrun' || !same(record.sources, sourceHashes()) || gateHashFile(join(state.directory, 'qa-config.json')) !== state.configSha256) fail('record-source-config')
  if (record.installed !== state.smoke?.installedPath || state.smoke.installedOwned !== true || basename(record.installed) !== `${state.identity.productName}.app` || record.binary !== join(record.installed, 'Contents/MacOS/mark') || fs.realpathSync(dirname(record.installed)) !== dirname(record.installed)) fail('installed-path')
  for (const [key, name] of Object.entries({ backup: 'original-mark', signatureBackup: 'original-CodeResources', aside: 'active-node-gate', intent: 'intent.json', control: 'control.json', hello: 'hello.json', beforeExec: 'before-exec.json', release: 'release.json', capabilityHello: 'capability-hello.json', capabilityControl: 'capability-control.json', capabilityResult: 'capability-result.json' })) if (record[key] !== join(record.root, name)) fail('record-path')
  contained(state.directory, record.root); contained(state.directory, record.guard); contained(state.directory, record.evidence)
  for (const key of ['backup', 'signatureBackup', 'aside', 'intent', 'control', 'hello', 'beforeExec', 'release', 'capabilityHello', 'capabilityControl', 'capabilityResult']) contained(state.directory, record[key])
  if (!record.native || !/^[a-f0-9]{64}$/.test(record.native.sha256) || !Number.isInteger(record.native.mode) || !record.baseline || sha(JSON.stringify(record.baseline.entries)) !== record.baseline.digest || !record.runtime || !/^[a-f0-9]{64}$/.test(record.runtime.sha256)) fail('record-digests')
  return record
}
const snapshot = session => {
  const { state, native, checkpoint, signal, artifact, ...record } = session
  return { ...record, native: artifact }
}
const writeRecord = (session, path, value) => { contained(session.state.directory, path); atomicGateJson(path, value, { syncDirectory: session.native.syncDirectory }) }
function persist(session) {
  const record = snapshot(session)
  writeRecord(session, session.intent, record); writeRecord(session, session.guard, record)
  session.state.smoke.launchGate = record
  session.checkpoint()
}
function receipt(session, name, value) {
  contained(session.state.directory, session.evidence)
  fs.mkdirSync(session.evidence, { recursive: true, mode: 0o700 })
  writeRecord(session, join(session.evidence, name + '.json'), value)
}
function copy(from, to) {
  const before = regular(from)
  if (gatePresent(to)) fail('copy-exists')
  fs.copyFileSync(from, to, fs.constants.COPYFILE_EXCL | fs.constants.COPYFILE_FICLONE)
  fs.chmodSync(to, before.mode & 0o777)
  const after = regular(to)
  if (gateHashFile(from) !== gateHashFile(to) || (before.dev === after.dev && before.ino === after.ino)) fail('copy-alias')
}
export async function runGateTool({ file, args, session, inspect, signal }) {
  regular(file)
  const tool = { path: file, sha256: gateHashFile(file), args, role: 'owned-tool-not-native-app', stdout: '', stderr: '' }
  session.toolStopped = false; session.toolIntent = true; session.toolRecords = [tool]; persist(session)
  receipt(session, 'tool-intent', tool)
  const child = spawn(file, args, { cwd: session.state.directory, stdio: ['pipe', 'pipe', 'pipe'] })
  let error, closed = false
  const stop = () => { try { child.kill('SIGTERM') } catch (value) { error ||= value } }
  const bad = value => { error ||= value; stop() }
  const done = new Promise(resolveDone => {
    child.once('error', bad)
    child.once('close', (code, signal) => { Object.assign(tool, { code, signal, reaped: true }); closed = true; resolveDone() })
  })
  child.stdout.on('data', bytes => { tool.stdout = (tool.stdout + bytes).slice(-16384) })
  child.stderr.on('data', bytes => { tool.stderr = (tool.stderr + bytes).slice(-16384) })
  child.stdout.on('error', bad); child.stderr.on('error', bad); child.stdin.on('error', bad)
  tool.pidAtSpawn = child.pid || null
  signal?.addEventListener('abort', stop)
  try {
    receipt(session, 'tool-spawn', tool); persist(session)
    await inspect?.(tool, child, () => closed)
    const deadline = performance.now() + 10000
    while (!closed && performance.now() < deadline && !signal?.aborted && !error) await new Promise(resolveWait => setTimeout(resolveWait, 10))
    if (!closed) { error ||= Error('tool-timeout-or-cancel'); stop() }
  } catch (value) { bad(value) } finally {
    if (!closed) { stop(); await Promise.race([done, new Promise(resolveWait => setTimeout(resolveWait, 2000))]) }
    signal?.removeEventListener('abort', stop)
    session.toolStopped = closed
    if (!closed) session.state.smoke.processIdentityUncertain = true
    try { receipt(session, 'tool-result', tool); persist(session) } catch (value) { error ||= value }
  }
  if (!closed || error || tool.code !== 0 || signal?.aborted) throw error || Error('MT_QA_GATE:tool-failed')
  return tool
}
async function capability(session) {
  await runGateTool({ file: session.binary, args: [self, 'capability', '--intent', session.intent], session, signal: session.signal, inspect: async (tool, child, closed) => {
    const deadline = performance.now() + 10000
    let hello
    while (!(hello = optional(session.capabilityHello))) {
      if (closed() || performance.now() >= deadline || session.signal?.aborted) fail('capability-hello')
      await new Promise(resolveWait => setTimeout(resolveWait, 10))
    }
    observed(hello.image, tool.pidAtSpawn, hello.birth, session.binary)
    observed(await session.native.image(tool.pidAtSpawn, session), tool.pidAtSpawn, hello.birth, session.binary)
    writeRecord(session, session.capabilityControl, { nonce: session.nonce, action: 'continue', pid: tool.pidAtSpawn })
  } })
}
function checkedCapability(session) {
  const result = json(session.capabilityResult)
  if (result.nonce !== session.nonce || typeof result.version !== 'string' || !/^[0-9]+\.[0-9]+\.[0-9]+/.test(result.version) || Number(result.version.split('.')[0]) < 22 || result.execve !== true) fail('copied-runtime-capability')
}
export async function prepareLaunchGate({ state, installed, native, checkpoint, signal }) {
  if ((native.platform ?? process.platform) !== 'darwin') fail('unsupported-platform')
  rejectExecutionHooks(native.execArgv ?? process.execArgv)
  if (gateProtected(state)) fail('existing-launch-protection')
  const runtime = { ...(native.gateRuntime ? native.gateRuntime() : currentGateRuntime()) }
  const sourceRuntime = regular(runtime.path)
  Object.assign(runtime, { device: String(sourceRuntime.dev), inode: String(sourceRuntime.ino), mode: sourceRuntime.mode & 0o777 })
  if (gateHashFile(runtime.path) !== runtime.sha256 || Number(runtime.version?.split('.')[0]) < 22) fail('runtime-identity')
  const root = join(state.directory, 'native-launch'), binary = join(installed, 'Contents/MacOS/mark')
  contained(dirname(installed), binary); regular(binary)
  const session = { version: 1, nonce: randomBytes(16).toString('hex'), binding: fingerprint(state), root, guard: join(state.directory, 'gate-protection.json'), evidence: join(state.directory, 'evidence/native-launch'), installed, binary,
    native: { sha256: gateHashFile(binary), mode: mode(binary) }, baseline: bundleManifest(installed), runtime, python: native.pythonTool ? native.pythonTool() : pythonTool(), sources: sourceHashes(), phase: 'planned', launchRequested: false, nativeRequested: false, toolStopped: true }
  for (const [key, name] of Object.entries({ backup: 'original-mark', signatureBackup: 'original-CodeResources', aside: 'active-node-gate', intent: 'intent.json', control: 'control.json', hello: 'hello.json', beforeExec: 'before-exec.json', release: 'release.json', capabilityHello: 'capability-hello.json', capabilityControl: 'capability-control.json', capabilityResult: 'capability-result.json' })) session[key] = join(root, name)
  // Protect in authoritative state before creating even the deterministic directory.
  const artifact = session.native
  Object.assign(session, { artifact, state, native, checkpoint, signal })
  validateGateRecord(snapshot(session), state)
  sessions.add(session)
  try {
    state.smoke.launchGate = snapshot(session); checkpoint()
    fs.mkdirSync(root, { mode: 0o700 })
    fs.mkdirSync(session.evidence, { recursive: true, mode: 0o700 })
    session.phase = 'protected'; persist(session)
    if (signal?.aborted) fail('cancelled')
    session.phase = 'instrument-intent'; persist(session)
    fs.renameSync(binary, session.backup)
    const signature = join(installed, 'Contents/_CodeSignature/CodeResources')
    contained(dirname(installed), signature)
    if (gatePresent(signature)) copy(signature, session.signatureBackup)
    copy(runtime.path, binary)
    native.signBootstrap(installed)
    const gateFile = regular(binary)
    session.gateIdentity = { device: String(gateFile.dev), inode: String(gateFile.ino), mode: gateFile.mode & 0o777 }
    if (session.gateIdentity.device === runtime.device && session.gateIdentity.inode === runtime.inode) fail('signed-copy-alias')
    session.gateSha256 = gateHashFile(binary); session.phase = 'instrumented'; persist(session)
    if (native.capability) await native.capability(session)
    else await capability(session)
    checkedCapability(session)
    const unchangedRuntime = regular(runtime.path)
    if (gateHashFile(runtime.path) !== runtime.sha256 || String(unchangedRuntime.dev) !== runtime.device || String(unchangedRuntime.ino) !== runtime.inode || (unchangedRuntime.mode & 0o777) !== runtime.mode || session.toolStopped !== true) fail('runtime-changed-or-active-tool')
    session.phase = 'capability-confirmed'; persist(session)
    return session
  } catch (error) { error.gateSession = session; throw error }
}
async function until(session, path, deadline) {
  let value
  while (!(value = optional(path))) {
    if (session.signal?.aborted) fail('cancelled')
    if (session.native.now() >= deadline) fail('startup-timeout')
    await session.native.wait(Math.min(20, deadline - session.native.now()))
  }
  if (session.native.now() >= deadline) fail('startup-timeout')
  return value
}
function boundReceipt(session, value) {
  if (!value || value.nonce !== session.nonce || value.binding !== session.binding || value.sources !== sha(JSON.stringify(session.sources)) || !Number.isSafeInteger(value.pid) || value.pid < 1 || !validBirth(value.birth)) fail('receipt-identity')
  return value
}
export async function launchGate(session, { remember, processes, windows }) {
  const { native, state } = session
  validateGateRecord(snapshot(session), state)
  // One window begins at LS-intent preparation, including its durable save.
  session.startedAt = native.now()
  const deadline = session.startedAt + 10000
  session.phase = 'launch-intent'; session.launchRequested = true; session.deadlineNanoseconds = (process.hrtime.bigint() + 10000000000n).toString(); persist(session)
  state.smoke.launchRequested = true; session.checkpoint()
  try {
    if (session.signal?.aborted) fail('cancelled')
    if (native.now() >= deadline) fail('startup-timeout')
    launchAttempts.add(session)
    await native.launch(session.installed, [self, 'gate', '--intent', session.intent])
    if (session.signal?.aborted) fail('cancelled')
    const hello = boundReceipt(session, await until(session, session.hello, deadline))
    if (hello.gateSha256 !== session.gateSha256) fail('gate-digest')
    session.pid = hello.pid; session.birth = hello.birth
    state.smoke.ownedPids.push(hello.pid)
    persist(session)
    observed(await native.image(session.pid, session), session.pid, session.birth, session.binary)
    session.phase = 'aside-intent'; persist(session)
    fs.renameSync(session.binary, session.aside)
    session.phase = 'aside'; persist(session)
    session.asideObservation = observed(await native.image(session.pid, session), session.pid, session.birth, session.aside)
    receipt(session, 'gate-aside', session.asideObservation)
    session.phase = 'restore-intent'; persist(session)
    fs.renameSync(session.backup, session.binary)
    if (gatePresent(session.signatureBackup)) {
      const signature = join(session.installed, 'Contents/_CodeSignature/CodeResources')
      const temporary = join(session.root, 'restore-signature')
      copy(session.signatureBackup, temporary); fs.renameSync(temporary, signature)
    }
    if (!same(bundleManifest(session.installed), session.baseline)) fail('restore-manifest')
    await native.verify(session.installed)
    session.phase = 'restored'; persist(session)
    if (session.signal?.aborted) fail('cancelled')
    if (native.now() >= deadline) fail('startup-timeout')
    writeRecord(session, session.release, { nonce: session.nonce, binding: session.binding, sources: sha(JSON.stringify(session.sources)), pid: session.pid, birth: session.birth, nativeSha256: session.artifact.sha256, baseline: session.baseline.digest })
    session.phase = 'release-intent'; session.nativeRequested = true; persist(session)
    writeRecord(session, session.control, { action: 'release', nonce: session.nonce, receiptSha256: gateHashFile(session.release) })
    const before = boundReceipt(session, await until(session, session.beforeExec, deadline))
    if (before.pid !== session.pid || !same(before.birth, session.birth) || before.nativeSha256 !== session.artifact.sha256 || before.baseline !== session.baseline.digest || before.targetPath !== session.binary || before.toolSha256 !== session.runtime.sha256 || before.asidePath !== session.aside) fail('before-exec-binding')
    observed(before.beforeExecImage, session.pid, session.birth, session.aside)
    receipt(session, 'before-exec', before)
    while (true) {
      if (session.signal?.aborted) fail('cancelled')
      if (native.now() >= deadline) fail('startup-timeout')
      const image = await native.image(session.pid, session)
      observed(image, session.pid, session.birth)
      if (image.executablePath === session.binary) {
        const rows = processes()
        if (rows.length === 1 && rows[0].pid === session.pid) {
          remember(rows); windows()
          session.phase = 'native-observed'; session.nativeObserved = true; receipt(session, 'native-observed', image); persist(session)
          if (session.signal?.aborted) fail('cancelled')
          if (native.now() >= deadline) fail('startup-timeout')
          return rows
        }
      } else if (image.executablePath !== session.aside) fail('native-image')
      await native.wait(Math.min(20, deadline - native.now()))
    }
  } catch (error) {
    if (error.observationUncertain !== false && (error.message.includes('pid-birth') || error.message.includes('native-image'))) state.smoke.processIdentityUncertain = true
    throw error
  }
}
function loadSession(recordPath) {
  const record = json(recordPath)
  const state = json(join(dirname(record.root), 'state.json'))
  validateGateRecord(record, state)
  const guard = json(record.guard)
  if (!same(record, guard) || !same(state.smoke?.launchGate, record)) fail('guard-state-mismatch')
  return { record, state }
}
export async function gateMain(intentPath, dependencies = {}) {
  const platform = dependencies.platform ?? process.platform
  if (platform !== 'darwin') fail('unsupported-platform')
  const { record, state } = loadSession(intentPath)
  const write = (path, value) => { contained(state.directory, path); atomicGateJson(path, value, { syncDirectory: dependencies.syncDirectory }) }
  rejectExecutionHooks(dependencies.execArgv ?? process.execArgv)
  const pid = dependencies.pid ?? process.pid
  const observe = dependencies.observe || (value => observeOwnedImage(value, record.python))
  const execute = dependencies.execve || process.execve
  const wait = dependencies.wait || (ms => new Promise(resolveWait => setTimeout(resolveWait, ms)))
  if (typeof execute !== 'function' || Number(process.versions.node.split('.')[0]) < 22) fail('runtime-capability')
  if (gateHashFile(record.binary) !== record.gateSha256) fail('gate-image')
  const image = observed(await observe(pid), pid, null, record.binary)
  const hello = { nonce: record.nonce, binding: record.binding, sources: sha(JSON.stringify(record.sources)), pid, birth: image.birth, image, gateSha256: record.gateSha256 }
  write(record.hello, hello)
  if (typeof record.deadlineNanoseconds !== 'string' || !/^[1-9][0-9]{0,19}$/.test(record.deadlineNanoseconds)) fail('gate-deadline-binding')
  const deadline = BigInt(record.deadlineNanoseconds), monotonicNow = dependencies.monotonicNow || process.hrtime.bigint
  let control
  while (!(control = optional(record.control))) { if (monotonicNow() >= deadline) fail('gate-deadline'); await wait(10) }
  if (control.nonce !== record.nonce) fail('control-nonce')
  if (control.action === 'abort') { write(join(record.root, 'gate-exit.json'), { ...hello, abortedBeforeNative: true }); return }
  if (control.action !== 'release' || gateHashFile(record.release) !== control.receiptSha256) fail('release-control')
  if (monotonicNow() >= deadline) fail('gate-deadline')
  const release = json(record.release)
  if (release.nonce !== record.nonce || release.binding !== record.binding || release.sources !== hello.sources || release.pid !== pid || !same(release.birth, image.birth) || release.nativeSha256 !== record.native.sha256 || release.baseline !== record.baseline.digest) fail('release-binding')
  // Revalidate immutable identity and the full restored original, not its filename.
  validateGateRecord(record, state)
  const beforeExecImage = observed(await observe(pid), pid, image.birth, record.aside)
  if (gateHashFile(record.aside) !== record.gateSha256 || mode(record.aside) !== record.gateIdentity.mode || gateHashFile(record.binary) !== record.native.sha256 || mode(record.binary) !== record.native.mode || !same(bundleManifest(record.installed), record.baseline)) fail('native-manifest')
  const before = { ...hello, nativeSha256: record.native.sha256, baseline: record.baseline.digest, targetPath: record.binary, asidePath: record.aside, beforeExecImage, toolSha256: record.runtime.sha256 }
  if (monotonicNow() >= deadline) fail('gate-deadline')
  write(record.beforeExec, before)
  write(join(record.evidence, 'before-exec.json'), before)
  // Fsync/manifest I/O may race a known abort or consume the same deadline.
  contained(state.directory, record.control); regular(record.control)
  const finalControl = json(record.control)
  if (finalControl.nonce !== record.nonce) fail('control-nonce')
  if (finalControl.action === 'abort') { write(join(record.root, 'gate-exit.json'), { ...hello, abortedBeforeNative: true }); return }
  contained(state.directory, record.release); regular(record.release)
  if (finalControl.action !== 'release' || finalControl.receiptSha256 !== control.receiptSha256 || gateHashFile(record.release) !== finalControl.receiptSha256) fail('release-control')
  if (monotonicNow() >= deadline) fail('gate-deadline')
  execute(record.binary, [record.binary], process.env)
  fail('execve-returned')
}
export async function capabilityMain(intentPath, dependencies = {}) {
  if ((dependencies.platform ?? process.platform) !== 'darwin') fail('unsupported-platform')
  rejectExecutionHooks(dependencies.execArgv ?? process.execArgv)
  const { record, state } = loadSession(intentPath), pid = dependencies.pid ?? process.pid
  const write = (path, value) => { contained(state.directory, path); atomicGateJson(path, value, { syncDirectory: dependencies.syncDirectory }) }
  const image = observed(await (dependencies.observe || (value => observeOwnedImage(value, record.python)))(pid), pid, null, record.binary)
  if (gateHashFile(record.binary) !== record.gateSha256) fail('capability-image')
  write(record.capabilityHello, { nonce: record.nonce, pid, birth: image.birth, image })
  const deadline = performance.now() + 10000, wait = dependencies.wait || (ms => new Promise(resolveWait => setTimeout(resolveWait, ms)))
  let control
  while (!(control = optional(record.capabilityControl))) { if (performance.now() >= deadline) fail('capability-timeout'); await wait(10) }
  if (control.nonce !== record.nonce || control.pid !== pid || control.action !== 'continue') fail('capability-control')
  write(record.capabilityResult, { nonce: record.nonce, version: process.versions.node, execve: typeof process.execve === 'function' })
}
export function isGateStopProof(proof, expected) {
  const record = proofs.get(proof)
  return !!record && record.binding === fingerprint(expected) && record.root === join(expected.directory, 'native-launch') && record.sources === sha(JSON.stringify(sourceHashes())) && record.nonce === expected.smoke?.launchGate?.nonce && record.installed === expected.smoke?.installedPath
}
export async function finishGate(session, { processes, windows, remember = () => {}, checkpoint = () => {} }) {
  const { state, native } = session, errors = []
  const error = (phase, value) => { errors.push(`${phase}:${value.message}`) }
  const save = () => { try { state.smoke.launchGate = snapshot(session); checkpoint(); persist(session) } catch (value) { error('evidence', value) } }
  let processSafe = false, windowSafe = false, windowUncertain = false, toolsSafe = session.toolStopped === true
  if (session.recovery && session.toolIntent) {
    if (!Array.isArray(session.toolRecords) || !session.toolRecords.length) toolsSafe = false
    for (const tool of session.toolRecords || []) {
      try { if (!Number.isSafeInteger(tool.pidAtSpawn) || tool.pidAtSpawn < 1 || tool.reaped !== true || native.pidAlive(tool.pidAtSpawn) !== false) toolsSafe = false } catch (value) { toolsSafe = false; error('tool-stop', value) }
    }
  }
  if (!sessions.has(session)) fail('unowned-session')
  // Serialized pre-launch flags cannot prove a crashed invocation never launched.
  if (session.recovery) session.launchRequested = true
  const launchMayHaveStarted = session.recovery || launchAttempts.has(session)
  // A missing hello never authorizes adopting a later discovered PID.
  if (launchMayHaveStarted && !session.pid) {
    try {
      const hello = optional(session.hello)
      if (hello) { boundReceipt(session, hello); session.pid = hello.pid; session.birth = hello.birth; if (!state.smoke.ownedPids.includes(hello.pid)) state.smoke.ownedPids.push(hello.pid) }
    } catch (value) { error('recovery-receipt', value) }
  }
  if (launchMayHaveStarted) {
    if (state.smoke.ownedPids.some(pid => pid !== session.pid)) state.smoke.processIdentityUncertain = true
    if (!session.pid) {
      state.smoke.processIdentityUncertain = true
      try { writeRecord(session, session.control, { nonce: session.nonce, action: 'abort' }) } catch (value) { error('abort', value) }
      try { windows() } catch (value) { error('window', value) }
      session.retainedPaths = [session.installed, session.root, session.backup, session.aside, session.signatureBackup, state.smoke.mount, state.smoke.cleanupProtection?.installer.path].filter(Boolean)
      error('process', Error(`unknown-lifetime:${session.installed}:${session.root}`))
    } else {
      try {
        const image = await native.image(session.pid, session)
        if (image.status === 'present') {
          observed(image, session.pid, session.birth)
          if (image.executablePath === session.aside || (!session.nativeRequested && image.executablePath === session.binary)) writeRecord(session, session.control, { nonce: session.nonce, action: 'abort' })
          else if (image.executablePath === session.binary && session.nativeRequested) {
            const rows = processes()
            if (rows.length !== 1 || rows[0].pid !== session.pid) fail('quit-identity')
            remember(rows)
            session.phase = 'normal-Quit-intent'; session.normalQuitImage = image; save()
            const result = await native.quit(rows[0]); session.normalQuitResult = result
            if (!result || result.requested !== true || result.pid !== session.pid) fail('normal-quit-not-accepted')
            session.normalQuitAccepted = true; session.phase = 'normal-Quit-requested'; save()
            receipt(session, 'normal-Quit', { pid: session.pid, birth: session.birth, image, result })
          } else fail('quit-image')
        } else if (image.status !== 'absent' || image.reason !== 'ESRCH' || image.pid !== session.pid) { state.smoke.processIdentityUncertain = true; fail('unknown-image') }
      } catch (value) { if (value.message.includes('identity') || value.message.includes('pid-birth') || value.message.includes('image')) state.smoke.processIdentityUncertain = true; error('normal-Quit', value) }
      const deadline = native.now() + 10000
      do {
        let registrationAbsent = false, absent = true
        const observation = { pid: session.pid, expectedBirth: session.birth, at: native.now() }
        session.stopObservations ||= []; session.stopObservations.push(observation)
        try { const rows = processes(); observation.registration = rows; if (rows.some(row => row.pid !== session.pid)) { state.smoke.processIdentityUncertain = true; fail('unrecorded-process') } registrationAbsent = rows.length === 0 } catch (value) { error('process-query', value) }
        try {
          const image = await native.image(session.pid, session); observation.image = image
          if (image.status === 'present') { observed(image, session.pid, session.birth); if (![session.binary, session.aside].includes(image.executablePath)) fail('image'); absent = false }
          else if (image.status !== 'absent' || image.reason !== 'ESRCH' || image.pid !== session.pid) { state.smoke.processIdentityUncertain = true; absent = false; error('image', Error('unknown-image')) }
        } catch (value) { state.smoke.processIdentityUncertain = true; absent = false; error('image', value) }
        try { observation.pidAlive = native.pidAlive(session.pid); if (observation.pidAlive !== false) absent = false } catch (value) { absent = false; error('pid', value) }
        processSafe = registrationAbsent && absent && !state.smoke.processIdentityUncertain && toolsSafe
        try { const counts = windows(); observation.windowCounts = counts; windowSafe = !windowUncertain && state.smoke.ownedPids.every(pid => counts[pid] === 0) } catch (value) { windowSafe = false; windowUncertain = true; error('window', value) }
        if (processSafe && windowSafe) break
        if (native.now() >= deadline) break
        try { await native.wait(Math.min(250, deadline - native.now())) } catch (value) { error('wait', value); break }
      } while (true)
      if (session.nativeRequested && !session.normalQuitAccepted) error('normal-Quit', Error('accepted-Quit-unproven'))
    }
  } else { processSafe = toolsSafe && !state.smoke.processIdentityUncertain; windowSafe = true }
  if (!processSafe || !windowSafe) error('stop', Error(`remaining-or-unknown:${session.pid || 'no-PID'}:${session.installed}:${session.root}`))
  let proof
  // Failed window observation remains an acceptance failure; exact process/birth
  // absence can independently prove known files safe for deletion.
  if (processSafe && state.smoke.cleanupProtection?.mount.status !== 'active-or-unknown') {
    proof = {}; proofs.set(proof, { binding: fingerprint(state), root: session.root, sources: sha(JSON.stringify(session.sources)), nonce: session.nonce, installed: session.installed, windowObserved: windowSafe })
    session.phase = windowSafe ? 'process-and-window-stopped' : 'process-stopped-window-unknown'; session.windowObserved = windowSafe; save()
    const copies = [session.installed, session.backup, session.aside, session.signatureBackup, join(session.root, 'restore-signature')]
    session.copyCleanup = []
    for (const path of copies) {
      const entry = { path }; session.copyCleanup.push(entry)
      try {
        contained(path === session.installed ? dirname(session.installed) : state.directory, path)
        if (gatePresent(path)) {
          try { entry.manifest = bundleManifest(path); save() } catch (value) { error('inventory', value) }
          fs.rmSync(path, { recursive: path === session.installed })
        }
        entry.absent = !gatePresent(path)
      } catch (value) { entry.error = value.message; error('copy', value) }
    }
    try {
      contained(state.directory, session.root)
      for (const name of fs.readdirSync(session.root)) if (recordNames.has(name)) { const path = join(session.root, name); contained(state.directory, path); regular(path); receipt(session, name.slice(0, -5), json(path)) }
    } catch (value) { error('export', value) }
  }
  session.errors = [...(session.errors || []), ...errors]; save()
  return { proof, processSafe, windowSafe, errors }
}
export function resumeGateCleanup(state, native, checkpoint) {
  const record = state.smoke?.launchGate
  if (!record || !gatePresent(join(state.directory, 'native-launch')) || !gatePresent(join(state.directory, 'gate-protection.json'))) fail('missing-recovery-state')
  validateGateRecord(record, state)
  const guard = json(record.guard)
  if (!same(guard, record) || !same(json(record.intent), record)) fail('recovery-guard-mismatch')
  const { native: artifact, ...rest } = record
  const session = { ...rest, artifact, state, native, checkpoint, recovery: true }
  sessions.add(session)
  return session
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [operation, flag, intentPath, ...extra] = process.argv.slice(2)
  if (!['gate', 'capability'].includes(operation) || flag !== '--intent' || !intentPath || extra.length) fail('entry-arguments')
  try { if (operation === 'gate') await gateMain(intentPath); else await capabilityMain(intentPath) } catch (error) { console.error(error.message); process.exitCode = 1 }
}
