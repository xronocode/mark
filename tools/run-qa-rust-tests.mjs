#!/usr/bin/env node
// FILE: tools/run-qa-rust-tests.mjs
// START_MODULE_CONTRACT
//   PURPOSE: Keep the complete manual bin-mark unit gate while recording and cleaning its exact test executables.
//   SCOPE: Same Cargo test target compiled without launch, all compiler-reported test harnesses run without filters, normal completion and finally cleanup.
//   DEPENDS: Node built-ins; prepare-qa-artifacts; existing buildEnvironment allowlist; installed Cargo toolchain.
//   LINKS: M-046; V-M-046; C-QA-INSTALLER-ARTIFACTS; N-QA-DRYRUN-ARTIFACT-HYGIENE.
//   ROLE: SCRIPT
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
// START_MODULE_MAP
//   runCommand - Stream durable command evidence and expose each exact spawned PID; route child/outer stderr errors and cancellation through that owned child controller.
//   runQaRustTests - Compile the full existing target, prove executable ownership, run all harnesses and clean in finally.
// END_MODULE_MAP
// START_CHANGE_SUMMARY
//   - 2026-11-16 C-CI-ARTIFACT-CACHE-FAILURE-CLEANUP: asynchronous outer stderr failure stops/reaps the owned CLI child before finally cleanup and failed settlement.
//   - 2026-11-15 C-QA-INSTALLER-ARTIFACTS: record source/digests/PIDs and remove completed Rust test binaries without reducing the gate.
// END_CHANGE_SUMMARY
import { appendFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { spawn } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import { buildEnvironment } from './build-test-artifact.mjs'
import { cleanupGenerated, loadQaState, recordBinary, saveQaState } from './prepare-qa-artifacts.mjs'
export function runCommand(file, args, { cwd, env, onSpawn, logPath, spawnProcess = spawn, writeLog = appendFileSync, writeStderr = bytes => process.stderr.write(bytes), signals = process }) {
  return new Promise((resolve, reject) => {
    let stdout = '', failure, cancelled = false
    const child = spawnProcess(file, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] })
    const stopOwned = signal => { if (child.pid && child.exitCode === null) child.kill(signal) }
    const callbackFailure = error => {
      failure ||= error
      try { stopOwned('SIGTERM') } catch (stopError) { failure = new Error(`MT_QA_RUST:child-stop:${child.pid}:${file}:${stopError.message}`) }
    }
    const interrupted = signal => { cancelled = true; try { stopOwned(signal) } catch (error) { callbackFailure(error) } }
    const onInterrupt = () => interrupted('SIGINT'), onTerminate = () => interrupted('SIGTERM')
    signals.on('SIGINT', onInterrupt); signals.on('SIGTERM', onTerminate)
    process.stderr.on('error', callbackFailure)
    child.once('spawn', () => { try { onSpawn(child.pid) } catch (error) { callbackFailure(error) } })
    child.stdout.on('data', bytes => { stdout += bytes.toString(); try { writeLog(logPath, bytes) } catch (error) { callbackFailure(error) } })
    child.stderr.on('data', bytes => { try { writeLog(`${logPath}.stderr`, bytes); writeStderr(bytes) } catch (error) { callbackFailure(error) } })
    child.stdout.on('error', callbackFailure); child.stderr.on('error', callbackFailure)
    child.once('error', callbackFailure)
    child.once('close', (status, signal) => {
      signals.off('SIGINT', onInterrupt); signals.off('SIGTERM', onTerminate)
      process.stderr.off('error', callbackFailure)
      const result = { status, signal, stdout, cancelled }
      if (failure) {
        const error = new Error(`MT_QA_RUST:child-evidence:${child.pid || 'not-started'}:${file}:${failure.message}`)
        error.result = result; reject(error)
      } else resolve(result)
    })
  })
}
export async function runQaRustTests({ state, run = runCommand, environment = process.env }) {
  const env = buildEnvironment(environment), cwd = state.workspace
  const execute = async (file, args, directory, logName) => {
    const entry = { file, args, cwd: directory, sourceSha: state.identity.sourceSha, pid: null, stopped: false }
    state.processes.push(entry); saveQaState(state)
    const logPath = join(state.directory, 'evidence', logName)
    writeFileSync(logPath, '')
    try {
      const result = await run(file, args, { cwd: directory, env, logPath, onSpawn(pid) { entry.pid = pid; saveQaState(state) } })
      entry.stopped = true; entry.status = result.status; entry.signal = result.signal || null; entry.cancelled = result.cancelled === true
      if (run !== runCommand) writeFileSync(logPath, result.stdout || '')
      saveQaState(state); return result
    } catch (error) { entry.error = error.message; entry.stopped = Boolean(error.result) || entry.pid === null; saveQaState(state); throw error }
  }
  let failure
  try {
    state.rustCompilationAttempted = true; saveQaState(state)
    let compileFailure, result
    try { result = await execute('cargo', ['test', '--bin', 'mark', '--manifest-path', 'src-tauri/Cargo.toml', '--no-run', '--message-format=json'], cwd, 'rust-compile.jsonl') } catch (error) { compileFailure = error; result = error.result || { stdout: '' } }
    const executables = new Set()
    for (const line of (result.stdout || '').split(/\r?\n/).filter(Boolean)) {
      let message
      try { message = JSON.parse(line) } catch { throw Error('MT_QA_RUST:invalid-compiler-metadata') }
      if (message.reason === 'compiler-artifact' && message.target?.name === 'mark' && message.target?.kind?.includes('bin') && message.profile?.test === true && message.executable) {
        recordBinary(state, message.executable, 'compiler-test-metadata'); executables.add(message.executable)
      }
    }
    if (compileFailure) throw compileFailure
    if (result.cancelled) throw Error('MT_QA_RUST:cancelled')
    if (result.status !== 0) throw Error('MT_QA_RUST:compile-failed')
    if (!executables.size) throw Error('MT_QA_RUST:no-test-executable')
    let index = 0
    for (const path of executables) {
      recordBinary(state, path, 'before-test-launch')
      const result = await execute(path, [], join(cwd, 'src-tauri'), `rust-test-${++index}.log`)
      if (result.cancelled) throw Error('MT_QA_RUST:cancelled')
      if (result.status !== 0) throw Error('MT_QA_RUST:test-failed')
    }
    state.rustTests = { completeBinMarkGate: true, executables: [...executables], passed: true }
  } catch (error) { failure = error } finally {
    try { cleanupGenerated(state) } catch (error) { state.cleanupErrors.push(`rust-generated:${error.message}`) }
    saveQaState(state)
  }
  if (state.cleanupErrors.length) throw Error(`MT_QA_RUST:cleanup:${state.cleanupErrors.join(';')}`)
  if (failure) throw failure
  return state.rustTests
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  // Stdio can emit another queued error after the child has closed. Keep the
  // CLI output guard until exit; active runCommand still stops its own child.
  let stderrFailed = false
  const onCliStderrError = () => { stderrFailed = true; process.exitCode = 1 }
  process.stderr.on('error', onCliStderrError)
  process.once('exit', () => process.stderr.off('error', onCliStderrError))
  try {
    const index = process.argv.indexOf('--state'); if (index < 0 || !process.argv[index + 1]) throw Error('MT_QA_RUST:state-required')
    await runQaRustTests({ state: loadQaState(process.argv[index + 1]) })
  } catch (error) {
    if (!stderrFailed && !process.stderr.destroyed && !process.stderr.errored) console.error(error.message)
    process.exitCode = 1
  }
}
