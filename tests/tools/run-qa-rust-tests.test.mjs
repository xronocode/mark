// @vitest-environment node
// FILE: tests/tools/run-qa-rust-tests.test.mjs
// START_MODULE_CONTRACT
//   PURPOSE: Prove the full Rust bin-mark test gate and exact harness cleanup without compiling or executing native code.
//   SCOPE: Compiler metadata, all harnesses, process/digest ordering, failure propagation and unowned-file preservation.
//   DEPENDS: Vitest; Node built-ins; prepare-qa-artifacts; run-qa-rust-tests.
//   LINKS: M-046; V-M-046; C-QA-INSTALLER-ARTIFACTS.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
// START_MODULE_MAP
//   roots - Owned fixture trees removed after every case.
//   fixture - Synthetic compiler metadata and non-executable test files.
//   qaWait - Bound real fixture readiness and exact child shutdown.
//   qaCliFixture - Real QA CLI/controller with synthetic Cargo/executable process adapters and external finally receipts.
// END_MODULE_MAP
// START_CHANGE_SUMMARY
//   - 2026-11-15 C-QA-INSTALLER-ARTIFACTS: exact lifecycle fixture evidence; native acceptance remains separate.
// END_CHANGE_SUMMARY
import { afterEach, describe, expect, it } from 'vitest'
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { EventEmitter } from 'node:events'
import { tmpdir } from 'node:os'
import { prepareQa, qaIdentity } from '../../tools/prepare-qa-artifacts.mjs'
import { runCommand, runQaRustTests } from '../../tools/run-qa-rust-tests.mjs'
const roots = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })
function fixture() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'qa-rust-'))); roots.push(root)
  const workspace = join(root, 'workspace'); mkdirSync(join(workspace, 'src-tauri'), { recursive: true })
  const identity = qaIdentity({ sourceSha: 'a'.repeat(40), runId: '123', attempt: '1', platform: 'macos-arm64', mode: 'manual-handoff', testCase: 'CI-F002' })
  const state = prepareQa({ workspace, temporaryRoot: root, identity, actualHead: identity.sourceSha })
  const files = ['mark-aaaa', 'mark-bbbb'].map(name => join(workspace, 'target/debug/deps', name))
  mkdirSync(join(workspace, 'target/debug/deps'), { recursive: true }); files.forEach((path, i) => writeFileSync(path, `synthetic test ${i}, never executed`))
  const metadata = files.map(executable => ({ reason: 'compiler-artifact', target: { name: 'mark', kind: ['bin'] }, profile: { test: true }, executable }))
  return { root, workspace, state, files, metadata }
}
describe('complete QA Rust harness gate', () => {
  it('compiles the unchanged full bin target, runs every harness without filters under the package cwd, and cleans binary copies', async () => {
    const f = fixture(), calls = []
    const duplicate = join(f.workspace, 'target/debug/deps/mark-cccc'); writeFileSync(duplicate, readFileSync(f.files[0]))
    const run = async (file, args, options) => {
      calls.push({ file, args, options }); options.onSpawn(200 + calls.length)
      if (file === 'cargo') return { status: 0, stdout: [...f.metadata, { reason: 'compiler-artifact', target: { name: 'serde', kind: ['lib'] }, profile: { test: false }, executable: null }].map(x => JSON.stringify(x)).join('\n') }
      const evidence = JSON.parse(readFileSync(join(f.state.directory, 'evidence/lifecycle.json')))
      expect(evidence.owned.find(entry => entry.path === file).sha256).toMatch(/^[a-f0-9]{64}$/)
      expect(options.cwd).toBe(join(f.workspace, 'src-tauri')); expect(args).toEqual([])
      expect(options.env.GH_TOKEN).toBeUndefined(); return { status: 0, stdout: 'all cases passed' }
    }
    await runQaRustTests({ state: f.state, run, environment: { PATH: '/tools', GH_TOKEN: 'never pass' } })
    expect(calls[0].args).toEqual(['test', '--bin', 'mark', '--manifest-path', 'src-tauri/Cargo.toml', '--no-run', '--message-format=json'])
    expect(calls.slice(1).map(x => x.file)).toEqual(f.files)
    for (const path of [...f.files, duplicate]) expect(existsSync(path)).toBe(false)
    expect(f.state.processes.every(x => x.stopped)).toBe(true)
  })
  it('propagates compilation failure without running any harness and cleans metadata-owned outputs', async () => {
    const f = fixture(); let calls = 0
    await expect(runQaRustTests({ state: f.state, run: async (_file, _args, options) => { calls++; options.onSpawn(123); return { status: 1, stdout: f.metadata.map(x => JSON.stringify(x)).join('\n') } } })).rejects.toThrow(/compile/)
    expect(calls).toBe(1); f.files.forEach(path => expect(existsSync(path)).toBe(false))
  })
  it('propagates failed tests, stops before later harnesses and still removes every compiled harness', async () => {
    const f = fixture(); let calls = 0
    await expect(runQaRustTests({ state: f.state, run: async (_file, _args, options) => { calls++; options.onSpawn(123 + calls); return { status: calls === 1 ? 0 : 1, stdout: calls === 1 ? f.metadata.map(x => JSON.stringify(x)).join('\n') : 'failure' } } })).rejects.toThrow(/test-failed/)
    expect(calls).toBe(2); f.files.forEach(path => expect(existsSync(path)).toBe(false))
  })
  it.each(['compile', 'test'])('does not report success after %s cancellation even if the child exits zero', async phase => {
    const f = fixture(); let calls = 0
    await expect(runQaRustTests({ state: f.state, run: async (_file, _args, options) => {
      calls++; options.onSpawn(123 + calls)
      return { status: 0, cancelled: phase === 'compile' ? calls === 1 : calls > 1, stdout: calls === 1 ? f.metadata.map(x => JSON.stringify(x)).join('\n') : 'cancelled child' }
    } })).rejects.toThrow(/cancelled/)
    f.files.forEach(path => expect(existsSync(path)).toBe(false))
  })
  it('rejects empty metadata and never silently turns the Rust gate into zero tests', async () => {
    const f = fixture(); await expect(runQaRustTests({ state: f.state, run: async (_file, _args, options) => { options.onSpawn(123); return { status: 0, stdout: '{}' } } })).rejects.toThrow(/no-test-executable/)
  })
  it('rejects forged dependency or outside-workspace executable metadata without executing/deleting it', async () => {
    const f = fixture(), outside = join(f.root, 'owner-executable'); writeFileSync(outside, 'keep')
    await expect(runQaRustTests({ state: f.state, run: async (_file, _args, options) => { options.onSpawn(123); return { status: 0, stdout: JSON.stringify({ ...f.metadata[0], executable: outside }) } } })).rejects.toThrow()
    expect(readFileSync(outside, 'utf8')).toBe('keep')
  })
})

describe('actual command stream failure containment', () => {
  for (const fault of ['spawn-record', 'stdout', 'stderr']) it(`awaits exact child close after ${fault} evidence failure`, async () => {
    let closed = false, killed
    const child = new EventEmitter(); child.pid = 42424; child.exitCode = null
    child.stdout = new EventEmitter(); child.stderr = new EventEmitter()
    child.kill = signal => { killed = signal; queueMicrotask(() => { closed = true; child.exitCode = 1; child.emit('close', 1, 'SIGTERM') }) }
    const spawnProcess = () => { queueMicrotask(() => { child.emit('spawn'); child.stdout.emit('data', Buffer.from('stdout')); child.stderr.emit('data', Buffer.from('stderr')) }); return child }
    await expect(runCommand('fixture-only-not-executed', [], { cwd: '/', env: {}, logPath: 'fixture', spawnProcess, signals: new EventEmitter(),
      onSpawn() { if (fault === 'spawn-record') throw Error('record-failure') },
      writeLog(path) { if ((fault === 'stdout' && !path.endsWith('.stderr')) || (fault === 'stderr' && path.endsWith('.stderr'))) throw Error('disk-failure') }, writeStderr() {} })).rejects.toThrow()
    expect(killed).toBe('SIGTERM'); expect(closed).toBe(true)
  })
  it('reaches lifecycle finally after compiler logging failure and removes only changed project test outputs', async () => {
    const f = fixture(); let closed = false
    const child = new EventEmitter(); child.pid = 42424; child.exitCode = null; child.stdout = new EventEmitter(); child.stderr = new EventEmitter()
    child.kill = () => { expect(f.files.every(existsSync)).toBe(true); queueMicrotask(() => { closed = true; child.exitCode = 1; child.emit('close', 1, 'SIGTERM') }) }
    const spawnProcess = () => { queueMicrotask(() => { child.emit('spawn'); child.stdout.emit('data', Buffer.from(f.metadata.map(x => JSON.stringify(x)).join('\n'))) }); return child }
    await expect(runQaRustTests({ state: f.state, run: (file, args, options) => runCommand(file, args, { ...options, spawnProcess, signals: new EventEmitter(), writeLog() { throw Error('disk-failure') }, writeStderr() {} }) })).rejects.toThrow()
    expect(closed).toBe(true); f.files.forEach(path => expect(existsSync(path)).toBe(false))
  })
})


async function qaWait(observe, message) {
  const deadline = Date.now() + 2500
  while (!observe()) {
    if (Date.now() >= deadline) throw Error(message)
    await new Promise(resolve => setTimeout(resolve, 10))
  }
}

async function qaCliFixture(phase, closePipe) {
  const f = fixture(), helper = resolve('tools/run-qa-rust-tests.mjs'), executable = f.files[0]
  const statePath = join(f.state.directory, 'state.json'), ready = join(f.root, 'ready.json'), start = join(f.root, 'start'), stopped = join(f.root, 'stopped.json')
  const crash = join(f.root, 'uncaught.json'), trace = join(f.root, 'adapter.jsonl'), gate = join(f.root, 'gate.mjs')
  const cargo = join(f.root, 'cargo.mjs'), harness = join(f.root, 'harness.mjs')
  const runtime = `import*as fs from'node:fs';
    const statePath=${JSON.stringify(statePath)},ready=${JSON.stringify(ready)},start=${JSON.stringify(start)},stopped=${JSON.stringify(stopped)};
    process.stderr.on('error',()=>{});
    process.on('SIGTERM',()=>{fs.writeFileSync(stopped,JSON.stringify({pid:process.pid,signal:'SIGTERM'}));process.exit(0)});
    const recorded=async()=>{for(let i=0;i<200;i++){const s=JSON.parse(fs.readFileSync(statePath));if(s.processes.some(p=>p.pid===process.pid))return;await new Promise(r=>setTimeout(r,5))}process.exit(98)};
    const pending=async()=>{await recorded();fs.writeFileSync(ready,JSON.stringify({pid:process.pid,beforeOutputIdentityRecorded:true}));const timer=setInterval(()=>{if(fs.existsSync(start))process.stderr.write('actual stderr pipe fixture\\n')},10);await new Promise(()=>{})};`
  writeFileSync(cargo, runtime + (phase === 'compile-pending' ? '\nawait pending();' : `\nconsole.log(${JSON.stringify(JSON.stringify(f.metadata[0]))});`))
  writeFileSync(harness, runtime + (phase === 'native-active' ? '\nawait pending();' : `\nawait recorded();process.stderr.write('ordinary stderr positive control\\n');`))
  // Real CLI/default runCommand; only the OS executable boundary is translated
  // to installed Node + owned JS fixtures, never Cargo or a Mark build.
  writeFileSync(gate, `import fs from'node:fs';import cp from'node:child_process';import{syncBuiltinESMExports}from'node:module';import{pathToFileURL}from'node:url';
    await new Promise(done=>process.stdin.once('data',done));
    const original=cp.spawn;cp.spawn=(file,args,opts)=>{fs.appendFileSync(${JSON.stringify(trace)},JSON.stringify({file,args,cwd:opts.cwd})+'\\n');return original(process.execPath,[file==='cargo'?${JSON.stringify(cargo)}:${JSON.stringify(harness)}],opts)};syncBuiltinESMExports();
    process.on('uncaughtExceptionMonitor',error=>fs.writeFileSync(${JSON.stringify(crash)},JSON.stringify({code:error.code,message:error.message})));
    process.argv=[process.execPath,${JSON.stringify(helper)},'--state',${JSON.stringify(statePath)}];await import(pathToFileURL(${JSON.stringify(helper)}).href);`)
  const digest = path => createHash('sha256').update(readFileSync(path)).digest('hex')
  const source = { helper, helperSha256: digest(helper), preparedHelperSha256: digest(resolve('tools/prepare-qa-artifacts.mjs')),
    nodePath: process.execPath, nodeSha256: digest(process.execPath), fixtureFiles: Object.fromEntries([gate, cargo, harness, executable].map(path => [path, digest(path)])), phase, closePipe }
  const child = spawn(process.execPath, [gate], { cwd: f.workspace, env: process.env, stdio: ['pipe', 'pipe', 'pipe'] })
  let closed = false, result, failure, readyProof
  const finished = new Promise(resolve => child.once('close', (code, signal) => { closed = true; result = { code, signal }; resolve() }))
  child.stdout.resume(); child.stderr.on('error', () => {}); child.stderr.resume()
  const beforeExec = { pid: child.pid, source, gatedBeforeProductionImport: true }
  writeFileSync(join(f.root, 'before-exec.json'), JSON.stringify(beforeExec))
  child.stdin.end('run')
  try {
    if (closePipe) {
      await qaWait(() => existsSync(ready) || closed, 'real child did not reach fixture readiness')
      expect(closed).toBe(false)
      readyProof = JSON.parse(readFileSync(ready))
      expect(readyProof.beforeOutputIdentityRecorded).toBe(true)
      child.stderr.destroy(); writeFileSync(start, 'closed-reader')
    }
    await qaWait(() => closed, 'QA CLI did not settle after output control')
    await finished
    const state = JSON.parse(readFileSync(statePath))
    const calls = readFileSync(trace, 'utf8').trim().split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line))
    expect(calls[0].file).toBe('cargo')
    expect(calls[0].args).toEqual(['test', '--bin', 'mark', '--manifest-path', 'src-tauri/Cargo.toml', '--no-run', '--message-format=json'])
    expect(calls[0].cwd).toBe(f.workspace)
    if (closePipe) {
      expect(result.code).not.toBe(0)
      expect(state.generatedCleanupComplete).toBe(true)
      expect(state.processes.every(entry => entry.stopped)).toBe(true)
      expect(existsSync(crash)).toBe(false)
    } else { expect(result.code).toBe(0); expect(state.rustTests.passed).toBe(true) }
    expect(f.files.every(path => !existsSync(path))).toBe(true)
  } catch (error) { failure = error; throw error } finally {
    const state = existsSync(statePath) ? JSON.parse(readFileSync(statePath)) : f.state
    const pids = [...new Set([child.pid, ...state.processes.map(entry => entry.pid).filter(Boolean)])]
    for (const pid of pids) {
      try { process.kill(pid, 0); process.kill(pid, 'SIGTERM') } catch (error) { if (error.code !== 'ESRCH') throw error }
    }
    await finished
    await qaWait(() => pids.every(pid => { try { process.kill(pid, 0); return false } catch (error) { if (error.code !== 'ESRCH') throw error; return true } }), 'owned synthetic PID remains')
    const evidence = { ...beforeExec, readyProof, result, failure: failure?.message, stateBeforeFixtureRemoval: state,
      uncaught: existsSync(crash) ? JSON.parse(readFileSync(crash)) : null, stopped: existsSync(stopped) ? JSON.parse(readFileSync(stopped)) : null,
      remainingGeneratedBeforeFixtureRemoval: f.files.filter(existsSync), allOwnedPidsAbsent: true, fixture: f.root }
    rmSync(f.root, { recursive: true, force: true }); evidence.fixtureRemoved = !existsSync(f.root)
    const sink = process.env.MARK_RUST_TEST_EVIDENCE_ROOT
    if (sink) { mkdirSync(sink, { recursive: true }); appendFileSync(join(sink, 'qa-output-failure-receipts.jsonl'), JSON.stringify(evidence) + '\n') }
    else console.log(`[QaOutputFailureFixture] ${JSON.stringify(evidence)}`)
  }
}

describe('real QA CLI outer stderr lifecycle', () => {
  it('keeps ordinary streamed output and complete harness cleanup', async () => { await qaCliFixture('healthy', false) })
  it.each(['compile-pending', 'native-active'])('reaps and cleans %s after actual outer stderr EPIPE', async phase => { await qaCliFixture(phase, true) })
})
