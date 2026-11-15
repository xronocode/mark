#!/usr/bin/env node
// FILE: tools/run-rust-tests.mjs
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Preserve Cargo test orchestration while recording and cleaning exact owned project executables.
//   SCOPE: CI Cargo parent and gated target runner; cooperative cancellation/failure cleanup; no app packaging or dependency deletion.
//   DEPENDS: Node22 built-ins, existing Cargo/Rust/Git tools and Cargo compiler metadata.
//   LINKS: M-046; V-M-046; C-CI-RUST-TEST-ARTIFACT-LIFECYCLE-EXECVE.
//   ROLE: SCRIPT
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
// START_MODULE_MAP
//   HELPER - Exact runner script installed by the current source checkout.
//   inside - Require strict lexical path containment.
//   measured - Validate a contained regular file and measure its digest.
//   containedRegular - Reject outside, symlinked or non-file identities before ownership or format reads.
//   executable - Recognize native ELF, PE and Mach-O executable formats only.
//   namedExecutable - Match workspace output identities without dependency/object suffixes.
//   present - Distinguish actual ENOENT from inaccessible/unknown owned paths.
//   validateRuntime - Fail closed before Cargo build on unsupported Node/POSIX execve runtimes.
//   snapshotExecutables - Inventory recognized workspace executable names without dependency/build caches.
//   sourceIdentity - Bind checkout revision and current tracked delta.
//   workspaceContext - Resolve original Cargo workspace/target and compiler host without building.
//   save - Write a durable JSON receipt with restrictive permissions.
//   alive - Observe one recorded process without killing by name.
//   exitStatus - Preserve numeric and signal failures, including cooperative cancellation.
//   execGate - Replace a recorded POSIX Node gate with the same-PID executable, preserving Cargo's environment.
//   runOwned - Track one ChildProcess, catch evidence errors, forward signals and await bounded shutdown.
//   cleanupFiles - Remove only validated exact owned artifacts, continuing after independent failures.
//   runExecutable - Record and gate one Cargo-selected native executable; reap/delete in finally.
//   observeRunners - Guard every independent receipt read and retain observation errors.
//   waitForRunners - Await cooperative runners before parent-side artifact cleanup.
//   runRustTests - Preserve original Cargo selection and clean metadata/snapshot-owned outputs in finally.
// END_MODULE_MAP
// START_CHANGE_SUMMARY
//   - 2026-11-15 C-CI-RUST-TEST-ARTIFACT-LIFECYCLE-EXECVE: Cargo-preserving executable ownership and finally cleanup.
// END_CHANGE_SUMMARY

import * as fs from 'node:fs'
import { spawn, execFileSync } from 'node:child_process'
import { resolve, join, relative, isAbsolute, basename, sep } from 'node:path'
import { tmpdir, constants } from 'node:os'
import { createHash, randomUUID } from 'node:crypto'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { StringDecoder } from 'node:string_decoder'

const HELPER = fileURLToPath(import.meta.url)

function inside(parent, path) {
  const part = relative(parent, path)
  return part !== '' && part !== '..' && !part.startsWith(`..${sep}`) && !isAbsolute(part)
}

function containedRegular(target, path) {
  const absolute = resolve(path)
  if (!inside(target, absolute) || fs.lstatSync(absolute).isSymbolicLink() || !fs.statSync(absolute).isFile() ||
      !inside(fs.realpathSync(target), fs.realpathSync(absolute))) throw Error(`MT_RUST_TEST:unsafe-artifact:${absolute}`)
  return absolute
}

function measured(target, path) {
  const absolute = containedRegular(target, path)
  return { path: absolute, sha256: createHash('sha256').update(fs.readFileSync(absolute)).digest('hex') }
}

function executable(path) {
  const fd = fs.openSync(path, 'r')
  try {
    const bytes = Buffer.alloc(20), n = fs.readSync(fd, bytes, 0, bytes.length, 0)
    if (n < 16) return false
    if (bytes.subarray(0, 2).toString() === 'MZ') return true
    if (bytes.subarray(0, 4).equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46]))) {
      const type = bytes[5] === 2 ? bytes.readUInt16BE(16) : bytes.readUInt16LE(16)
      return type === 2 || type === 3
    }
    const magic = bytes.readUInt32LE(0)
    if (magic === 0xfeedfacf || magic === 0xfeedface) return bytes.readUInt32LE(12) === 2
    if (magic === 0xcffaedfe || magic === 0xcefaedfe) return bytes.readUInt32BE(12) === 2
    return false
  } finally { fs.closeSync(fd) }
}

function namedExecutable(path, names) {
  return names.flatMap(name => [name, name.replaceAll('-', '_')]).some(name =>
    new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:-[a-f0-9]{16})?(?:\\.exe)?$`, 'i').test(basename(path)))
}

function present(path, stat = fs.lstatSync) {
  try { stat(path); return true } catch (error) { if (error.code === 'ENOENT') return false; throw error }
}

export function validateRuntime({ platform = process.platform, version = process.versions.node, execve = process.execve } = {}) {
  const [major, minor] = version.split('.').map(Number)
  if (major < 22 || (platform !== 'win32' && (typeof execve !== 'function' || (major === 22 && minor < 15)))) {
    throw Error('MT_RUST_TEST:requires-Node22-and-POSIX-execve22.15-or-newer')
  }
}

export function snapshotExecutables(target, names) {
  const result = new Map()
  if (!present(target)) return result
  const walk = directory => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) continue
      const path = join(directory, entry.name)
      if (entry.isDirectory()) {
        if (!['build', 'incremental', '.fingerprint', 'doc', 'bundle'].includes(entry.name)) walk(path)
      } else if (entry.isFile() && namedExecutable(path, names) && executable(path)) {
        const item = measured(target, path); result.set(item.path, item.sha256)
      }
    }
  }
  walk(target)
  return result
}

export function sourceIdentity(cwd) {
  return {
    revision: execFileSync('git', ['rev-parse', 'HEAD'], { cwd, encoding: 'utf8' }).trim(),
    trackedDeltaSha256: createHash('sha256').update(execFileSync('git', ['diff', '--binary', 'HEAD'], { cwd })).digest('hex'),
    helperSha256: createHash('sha256').update(fs.readFileSync(HELPER)).digest('hex')
  }
}

export function workspaceContext(cwd, environment, args) {
  const metadata = JSON.parse(execFileSync('cargo', ['metadata', '--format-version=1', '--no-deps'], { cwd, env: environment, encoding: 'utf8' }))
  const host = execFileSync('rustc', ['-vV'], { cwd, env: environment, encoding: 'utf8' }).match(/^host: ([\w-]+)$/m)?.[1]
  const targetOption = args.find(arg => arg.startsWith('--target='))?.slice(9) ??
    (args.includes('--target') ? args[args.indexOf('--target') + 1] : undefined)
  const triple = targetOption || environment.CARGO_BUILD_TARGET || host
  if (!triple || !/^[\w-]+$/.test(triple)) throw Error('MT_RUST_TEST:unsupported-target-identity')
  const targetOptionDir = args.find(arg => arg.startsWith('--target-dir='))?.slice(13) ??
    (args.includes('--target-dir') ? args[args.indexOf('--target-dir') + 1] : undefined)
  const target = resolve(cwd, targetOptionDir || metadata.target_directory)
  const packages = metadata.packages.filter(pkg => metadata.workspace_members.includes(pkg.id))
  return { target, triple, packageIds: packages.map(pkg => pkg.id), names: [...new Set(packages.flatMap(pkg => pkg.targets.map(item => item.name)))] }
}

function save(path, data) {
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`
  try {
    fs.writeFileSync(temporary, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600 })
    fs.renameSync(temporary, path)
  } finally { fs.rmSync(temporary, { force: true }) }
}

function alive(pid) {
  if (!Number.isInteger(pid) || pid < 1) return false
  try { process.kill(pid, 0); return true } catch (error) { return error.code !== 'ESRCH' }
}

function exitStatus(result) {
  if (result.cancelled) return 128 + (constants.signals[result.cancellationSignal] || 2)
  return result.status ?? (result.signal ? 128 + (constants.signals[result.signal] || 0) : 1)
}

async function execGate() {
  if (typeof process.execve !== 'function') throw Error('MT_RUST_TEST:POSIX-execve-requires-Node22.15-or-newer')
  let input = ''
  for await (const bytes of process.stdin) input += bytes.toString()
  if (input !== 'run\n') throw Error('MT_RUST_TEST:gate-not-released')
  const args = process.argv.slice(3)
  process.execve(args[0], args, process.env)
}

export function runOwned(file, args, {
  cwd, env, onSpawn = () => {}, onStdout = () => {}, onStderr = () => {},
  cancelled = () => false, onCancel = () => {}, signals = process,
  gate = false, graceMs = 2000, spawnProcess = spawn,
  outputStreams = [process.stdout, process.stderr]
} = {}) {
  return new Promise((resolveResult, reject) => {
    let failure, interrupted = false, interruptionSignal, escalation, poll
    const child = spawnProcess(file, args, { cwd, env, stdio: [gate ? 'pipe' : 'ignore', 'pipe', 'pipe'] })
    const stop = signal => {
      if (!child.pid || child.exitCode !== null || child.signalCode !== null) return
      try { child.kill(signal) } catch (error) { failure ||= error }
      escalation ||= setTimeout(() => {
        if (child.exitCode === null && child.signalCode === null) {
          try { child.kill('SIGKILL') } catch (error) { failure ||= error }
        }
      }, graceMs)
    }
    const failed = error => { failure ||= error; try { onCancel() } catch (next) { failure ||= next }; stop('SIGTERM') }
    const interrupt = signal => { interrupted = true; interruptionSignal ||= signal; try { onCancel() } catch (error) { failure ||= error }; stop(signal) }
    const int = () => interrupt('SIGINT'), term = () => interrupt('SIGTERM')
    signals.on('SIGINT', int); signals.on('SIGTERM', term)
    for (const stream of outputStreams) stream.on('error', failed)
    child.once('spawn', () => {
      try {
        onSpawn(child.pid)
        if (cancelled()) { interrupt('SIGTERM'); return }
        if (gate) child.stdin.end('run\n')
      } catch (error) { failed(error) }
    })
    child.stdin?.on('error', failed)
    child.stdout.on('data', bytes => { try { onStdout(bytes) } catch (error) { failed(error) } })
    child.stderr.on('data', bytes => { try { onStderr(bytes) } catch (error) { failed(error) } })
    child.stdout.on('error', failed); child.stderr.on('error', failed)
    child.once('error', failed)
    poll = setInterval(() => { try { if (cancelled()) interrupt('SIGTERM') } catch (error) { failed(error) } }, 25)
    child.once('close', (status, signal) => {
      clearInterval(poll); clearTimeout(escalation)
      signals.off('SIGINT', int); signals.off('SIGTERM', term)
      for (const stream of outputStreams) stream.off('error', failed)
      const result = { status, signal, cancelled: interrupted, cancellationSignal: interruptionSignal, pid: child.pid ?? null, reaped: true }
      if (failure) { failure.result = result; reject(failure) } else resolveResult(result)
    })
  })
}

export function cleanupFiles(target, artifacts, errors, remove = path => fs.rmSync(path), stat = fs.lstatSync) {
  for (const item of artifacts) {
    try {
      if (!present(item.path, stat)) { item.available = false; continue }
      const current = measured(target, item.path)
      if (!executable(item.path) || current.sha256 !== item.sha256) throw Error('identity-changed-or-not-executable')
      remove(item.path)
      if (present(item.path, stat)) throw Error('path-remains')
      item.available = false
    } catch (error) { errors.push(`artifact:${item.path}:${error.message}`) }
  }
}

export async function runExecutable({
  statePath = process.env.MARK_RUST_TEST_STATE, args = process.argv.slice(3), cwd = process.cwd(),
  env = process.env, write = save, log = (path, bytes) => fs.appendFileSync(path, bytes),
  signals = process, platform = process.platform, graceMs = 2000
} = {}) {
  const state = JSON.parse(fs.readFileSync(statePath, 'utf8'))
  const path = resolve(args[0] || '')
  containedRegular(state.target, path)
  if (!args.length || !namedExecutable(path, state.names || []) || !executable(path)) throw Error('MT_RUST_TEST:invalid-executable')
  const artifact = measured(state.target, path)
  const receipt = join(state.directory, `runner-${process.pid}-${randomUUID()}.json`)
  const record = { identity: state.identity, source: state.source, path: artifact.path, sha256: artifact.sha256,
    runnerPid: process.pid, cargoPid: process.ppid, nativePid: null, available: true, stopped: false,
    recording: platform === 'win32' ? 'native PID at spawn before further input' : 'same PID recorded before gated exec' }
  const errors = []
  let result, failure
  try {
    write(receipt, record)
    if (fs.existsSync(join(state.directory, 'cancel')) || !alive(record.cargoPid) || !alive(state.parentPid)) throw Error('MT_RUST_TEST:cancelled-before-launch')
    const gated = platform !== 'win32'
    const file = gated ? process.execPath : path
    const launch = gated ? [HELPER, '--exec-gate', path, ...args.slice(1)] : args.slice(1)
    result = await runOwned(file, launch, {
      cwd, env, signals, graceMs, gate: gated,
      cancelled: () => fs.existsSync(join(state.directory, 'cancel')) || !alive(record.cargoPid) || !alive(state.parentPid),
      onSpawn(pid) { record.nativePid = pid; write(receipt, record) },
      onStdout(bytes) { log(`${receipt}.stdout`, bytes); process.stdout.write(bytes) },
      onStderr(bytes) { log(`${receipt}.stderr`, bytes); process.stderr.write(bytes) }
    })
  } catch (error) { failure = error; result = error.result } finally {
    record.result = result; record.stopped = !record.nativePid || result?.reaped === true
    if (record.stopped) cleanupFiles(state.target, [record], errors)
    else errors.push(`process-not-reaped:${record.nativePid}:${path}`)
    record.cleanupErrors = errors
    try { write(receipt, record) } catch (error) { failure ||= error }
  }
  if (errors.length) throw Error(`MT_RUST_TEST:cleanup:${errors.join(';')}`)
  if (failure) throw failure
  return { ...result, status: exitStatus(result), receipt }
}

function observeRunners(state) {
  const records = [], issues = []
  let names
  try { names = fs.readdirSync(state.directory).filter(name => /^runner-.*\.json$/.test(name)) }
  catch (error) { return { records, issues: [`runner-directory:${state.directory}:${error.message}`] } }
  for (const name of names) {
    try {
      const record = JSON.parse(fs.readFileSync(join(state.directory, name), 'utf8'))
      if (record.identity !== state.identity) throw Error('runner-identity-mismatch')
      records.push(record)
    } catch (error) { issues.push(`runner-receipt:${join(state.directory, name)}:${error.message}`) }
  }
  return { records, issues }
}

async function waitForRunners(state, errors, cargoSucceeded, observe = observeRunners, maxMs = 5000) {
  const deadline = Date.now() + maxMs
  while (true) {
    let observation
    try { observation = observe(state) } catch (error) { observation = { records: [], issues: [`runner-observation:${error.message}`] } }
    const active = observation.records.filter(record => !record.stopped && (alive(record.runnerPid) || alive(record.nativePid)))
    // Successful Cargo has awaited its runners. A failed/cancelled Cargo
    // needs affirmative runner evidence before parent-side unlinking.
    if ((!active.length && (!observation.issues.length || cargoSucceeded)) || Date.now() >= deadline) {
      errors.push(...observation.issues)
      for (const record of active) errors.push(`active-runner:${record.runnerPid}:native:${record.nativePid}:${record.path}`)
      for (const record of observation.records) {
        for (const issue of record.cleanupErrors || []) errors.push(`runner-cleanup:${record.path}:${issue}`)
      }
      return { records: observation.records, safe: !active.length && (!observation.issues.length || cargoSucceeded) }
    }
    await new Promise(resolveWait => setTimeout(resolveWait, 25))
  }
}

export async function runRustTests({
  args = process.argv.slice(2), cwd = process.cwd(), environment = process.env,
  context = workspaceContext, identity = sourceIdentity, write = save,
  log = (path, bytes) => fs.appendFileSync(path, bytes), signals = process,
  cargo = 'cargo', cargoPrefix = [], output = bytes => process.stdout.write(bytes),
  errorOutput = bytes => process.stderr.write(bytes), graceMs = 2000,
  runtime = validateRuntime, observe = observeRunners
} = {}) {
  runtime()
  if (args.some(arg => arg === '--no-run' || arg === '--doc' || arg.startsWith('--message-format'))) throw Error('MT_RUST_TEST:unsupported-test-mode')
  const source = identity(cwd), workspace = context(cwd, environment, args)
  fs.mkdirSync(workspace.target, { recursive: true })
  const directory = fs.mkdtempSync(join(environment.RUNNER_TEMP || tmpdir(), 'mark-rust-tests-'))
  const state = { ...workspace, identity: randomUUID(), directory, parentPid: process.pid, source,
    original: { cwd, command: ['cargo', 'test', ...args] }, artifacts: [], cleanupErrors: [], stopped: false }
  const statePath = join(directory, 'state.json'), receipt = join(directory, 'result.json')
  const baseline = snapshotExecutables(state.target, state.names)
  const known = new Map(), harnesses = new Set(), errors = state.cleanupErrors
  let result, failure, line = ''
  const decoder = new StringDecoder('utf8')
  const cancel = () => { try { fs.writeFileSync(join(directory, 'cancel'), '') } catch (error) { errors.push(`cancel-evidence:${error.message}`) } }
  let parentSignal
  const interrupted = signal => { parentSignal ||= signal; cancel() }
  const int = () => interrupted('SIGINT'), term = () => interrupted('SIGTERM')
  signals.on('SIGINT', int); signals.on('SIGTERM', term)
  const outputFailed = error => { failure ||= error; cancel() }
  process.stdout.on('error', outputFailed); process.stderr.on('error', outputFailed)
  const register = artifact => {
    const path = resolve(artifact.executable)
    // Register the selected identity before digest/log work can fail. Finally
    // retries the measurement; snapshot fallback also catches truncated metadata.
    if (!inside(state.target, path)) throw Error(`MT_RUST_TEST:outside-target:${path}`)
    if (!namedExecutable(path, state.names)) throw Error(`MT_RUST_TEST:not-workspace-executable:${path}`)
    if (!present(path)) {
      // Cargo's stdout can be delivered after the independent runner has
      // already recorded, reaped and deleted this very short-lived harness.
      known.set(path, { path, available: false, reason: 'compiler-artifact-already-removed' })
      return
    }
    containedRegular(state.target, path)
    if (!executable(path)) throw Error(`MT_RUST_TEST:not-native-executable:${path}`)
    known.set(path, { path })
    known.set(path, { ...measured(state.target, path), available: true, reason: 'compiler-workspace-artifact' })
  }
  const parseLine = value => {
    // Cargo and native test output share stdout. Ordinary diagnostics and
    // JSON are not compiler messages; strict parsing applies only to Cargo's
    // recognizable reason envelope, including truncated compiler metadata.
    if (!/^\{\s*"reason"\s*:\s*"(?:compiler-artifact|compiler-message|build-script-executed|build-finished)"/.test(value)) return
    const message = JSON.parse(value)
    if (message.reason === 'compiler-artifact' && state.packageIds.includes(message.package_id) && message.executable &&
        !message.target?.kind?.includes('custom-build')) {
      if (message.profile?.test) harnesses.add(resolve(message.executable))
      register(message)
    }
  }
  try {
    write(statePath, state)
    const runner = [process.execPath, HELPER, '--runner']
    const config = `target.${state.triple}.runner=${JSON.stringify(runner)}`
    const command = [...cargoPrefix, '--config', config, 'test', ...args, '--message-format=json']
    state.command = [cargo, ...command]; write(receipt, state)
    result = await runOwned(cargo, command, {
      cwd, env: { ...environment, MARK_RUST_TEST_STATE: statePath }, signals, graceMs, onCancel: cancel,
      cancelled: () => Boolean(failure) || Boolean(parentSignal),
      onSpawn(pid) { state.cargoPid = pid; write(receipt, state) },
      onStdout(bytes) {
        // Parse ownership before optional durable output logging can fail.
        line += decoder.write(bytes)
        let newline
        while ((newline = line.indexOf('\n')) >= 0) { parseLine(line.slice(0, newline).replace(/\r$/, '')); line = line.slice(newline + 1) }
        log(join(directory, 'cargo.stdout'), bytes); output(bytes)
      },
      onStderr(bytes) { log(join(directory, 'cargo.stderr'), bytes); errorOutput(bytes) }
    })
    line += decoder.end()
    if (line.trim()) parseLine(line.trim())
  } catch (error) { failure = error; result = error.result || result; cancel() } finally {
    if (result?.cancelled || failure) cancel()
    let observation = { records: [], safe: false }
    try { observation = await waitForRunners(state, errors, result?.status === 0, observe) }
    catch (error) { errors.push(`runner-wait:${error.message}`); observation.safe = result?.status === 0 }
    if (!failure && result?.status === 0) {
      for (const path of harnesses) {
        if (!observation.records.some(record => record.identity === state.identity && record.path === path && record.stopped && !record.available && record.sha256)) {
          errors.push(`missing-completed-runner:${path}`)
        }
      }
      if (!harnesses.size) errors.push('missing-test-harness-evidence')
    }
    try {
      for (const [path, digest] of snapshotExecutables(state.target, state.names)) {
        if (baseline.get(path) !== digest && !known.has(path)) known.set(path, { path, sha256: digest, available: true, reason: 'created-or-changed-workspace-executable' })
      }
    } catch (error) { errors.push(`snapshot:${error.message}`) }
    // Do not unlink an artifact while any recorded owned test process is active.
    if (observation.safe) {
      for (const [path, item] of known) {
        if (!item.sha256) {
          try {
            if (present(path)) {
              if (!namedExecutable(path, state.names) || !executable(path)) throw Error('not-workspace-executable')
              known.set(path, { ...measured(state.target, path), available: true, reason: 'compiler-workspace-artifact-recovered' })
            }
          }
          catch (error) { errors.push(`recover:${path}:${error.message}`) }
        }
      }
      cleanupFiles(state.target, [...known.values()].filter(item => item.sha256), errors)
    } else errors.push(`owned-process-state-unknown:${state.directory}`)
    state.artifacts = [...known.values()]; state.result = result; state.stopped = result?.reaped === true || !state.cargoPid
    state.failure = failure?.message || null
    try { write(receipt, state) } catch (error) { failure ||= error }
    signals.off('SIGINT', int); signals.off('SIGTERM', term)
    process.stdout.off('error', outputFailed); process.stderr.off('error', outputFailed)
  }
  if (errors.length) throw Error(`MT_RUST_TEST:cleanup:${errors.join(';')}`)
  if (failure) throw failure
  return { status: exitStatus({ ...result, cancelled: Boolean(parentSignal) || result.cancelled, cancellationSignal: parentSignal || result.cancellationSignal }), receipt, state }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    if (process.argv[2] === '--exec-gate') await execGate()
    else {
      const result = process.argv[2] === '--runner' ? await runExecutable() : await runRustTests()
      process.exitCode = result.status
    }
  } catch (error) { console.error(`MT_RUST_TEST:failed:${error.message}`); process.exitCode = 1 }
}
