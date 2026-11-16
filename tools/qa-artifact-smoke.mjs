#!/usr/bin/env node
// FILE: tools/qa-artifact-smoke.mjs
// START_MODULE_CONTRACT
//   PURPOSE: Preserve the installed macOS appearance gate and independent exact normal-Quit cleanup.
//   SCOPE: Typed native collections, exact process/window observations, ESRCH-only exit and persisted mount/process cleanup protection; native/publication hold remains.
//   DEPENDS: Node built-ins; prepare-qa-artifacts; existing macOS signing, LaunchServices, AppKit and CoreGraphics APIs.
//   LINKS: M-046; V-M-046; C-QA-NATIVE-BRIDGE-MOUNT-CLEANUP; C-QA-NATIVE-BRIDGE-CLEANUP; C-QA-INSTALLER-ARTIFACTS.
//   ROLE: SCRIPT
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
// START_MODULE_MAP
//   present - Only ENOENT proves an owned installed path absent.
//   command - Execute an argument-vector native command without a shell.
//   processQuery - Enumerate exact AppKit identities or request a revalidated normal Quit, independently of windows.
//   windowOwnerCounts - Normalize CF collection/key references and strict NSNumber owner PIDs.
//   nativeAdapter - Existing native operations and read-only exact-PID liveness boundary.
//   checkedProcesses - Validate exact process identities without manufacturing window-only applications.
//   smokeQa - Preserve appearance timing and attempt independent shutdown, observation and owned-copy cleanup.
//   smokeWithSignals - Keep cooperative smoke or cleanup active while cancellation is pending.
//   cleanupSmokeQa - Fresh exact native recovery and same-process opaque generic cleanup.
// END_MODULE_MAP
// START_CHANGE_SUMMARY
//   - C-QA-MACOS-LAUNCH-GATE: durable PID/birth before native exec and fresh cleanup-only route.
//   - C-QA-NATIVE-BRIDGE-MOUNT-CLEANUP: arm persisted cleanup protection before attach/preflight/open and retain unresolved mounted/process copies across outer cleanup.
//   - C-QA-NATIVE-BRIDGE-CLEANUP: typed CFArray/CFString conversion and cleanup independent of window/evidence failures.
//   - 2026-11-15 C-QA-INSTALLER-ARTIFACTS: isolated install and exact lifecycle evidence.
// END_CHANGE_SUMMARY
import { cpSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { execFileSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import { beginSmokeCleanup, cleanupGenerated, loadQaState, measuredFile, recordGenerated, saveQaState } from './prepare-qa-artifacts.mjs'
import { currentGateRuntime, gateProtected, observeOwnedImage, prepareLaunchGate, launchGate, finishGate, resumeGateCleanup } from './qa-launch-gate.mjs'
const present = path => {
  try { lstatSync(path); return true } catch (error) { if (error.code === 'ENOENT') return false; throw error }
}
const command = (file, args) => execFileSync(file, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()

function processQuery(path, identifier, ownedPids = [], quit = null) {
  const script = `ObjC.import('AppKit'); ObjC.import('Foundation');
function run(argv) {
 var path=argv[0], id=argv[1], owned=JSON.parse(argv[2]), quit=JSON.parse(argv[3]), result=[];
 function integer(value) {
  if(typeof value==='string' && /^(0|[1-9][0-9]*)$/.test(value)) value=Number(value);
  if(typeof value!=='number' || !Number.isSafeInteger(value) || value<0) throw Error('process-integer');
  return value;
 }
 function string(value) { if(value===null || value===undefined) return ''; var s=ObjC.unwrap(value); return typeof s==='string'?s:''; }
 var apps=$.NSWorkspace.sharedWorkspace.runningApplications;
 if(!apps || typeof apps.isKindOfClass!=='function' || !apps.isKindOfClass($.NSArray)) throw Error('process-array');
 var count=integer(apps.count), requested=false;
 for(var i=0;i<count;i++) {
  var app=apps.objectAtIndex(i), pid=app.processIdentifier;
  if(typeof pid!=='number' || !Number.isSafeInteger(pid) || pid<=0) throw Error('process-pid');
  var bundle=app.bundleURL?string(app.bundleURL.path):'', identifier=string(app.bundleIdentifier);
  if(bundle!==path && identifier!==id && owned.indexOf(pid)<0) continue;
  var executable=app.executableURL?string(app.executableURL.path):'';
  if(quit) {
   if(pid!==quit.pid) continue;
   if(bundle!==quit.bundlePath || identifier!==quit.identifier || executable!==quit.executablePath || bundle!==path || identifier!==id) throw Error('process-identity-changed');
   if(app.terminate!==true) throw Error('normal-quit-refused');
   requested=true;
  } else result.push({pid:pid,bundlePath:bundle,executablePath:executable,identifier:identifier});
 }
 return JSON.stringify(quit?{requested:requested,pid:quit.pid}:result);
}`
  return JSON.parse(command('/usr/bin/osascript', ['-l', 'JavaScript', '-e', script, path, identifier, JSON.stringify(ownedPids), JSON.stringify(quit)]))
}

function windowOwnerCounts(pids) {
  const script = `ObjC.import('Foundation'); ObjC.import('CoreGraphics');
function run(argv) {
 var pids=JSON.parse(argv[0]), result={};
 for(var p=0;p<pids.length;p++) { if(typeof pids[p]!=='number' || !Number.isSafeInteger(pids[p]) || pids[p]<=0) throw Error('window-request-pid'); result[pids[p]]=0; }
 var raw=$.CGWindowListCopyWindowInfo(0,0);
 if(raw===null || raw===undefined) throw Error('window-query-null');
 if(typeof ObjC.castRefToObject!=='function') throw Error('window-cast-unavailable');
 var array=ObjC.castRefToObject(raw);
 if(!array || typeof array.isKindOfClass!=='function' || !array.isKindOfClass($.NSArray)) throw Error('window-array-type');
 var count=array.count;
 if(typeof count==='string' && /^(0|[1-9][0-9]*)$/.test(count)) count=Number(count);
 if(typeof count!=='number' || !Number.isSafeInteger(count) || count<0) throw Error('window-count');
 var key=ObjC.castRefToObject($.kCGWindowOwnerPID);
 if(!key || typeof key.isKindOfClass!=='function' || !key.isKindOfClass($.NSString) || ObjC.unwrap(key)!=='kCGWindowOwnerPID') throw Error('window-key-type');
 for(var i=0;i<count;i++) {
  var row=array.objectAtIndex(i);
  if(!row || typeof row.isKindOfClass!=='function' || !row.isKindOfClass($.NSDictionary)) throw Error('window-row-type');
  var owner=row.objectForKey(key);
  if(!owner || typeof owner.isKindOfClass!=='function' || !owner.isKindOfClass($.NSNumber)) throw Error('window-owner-type');
  var pid=ObjC.unwrap(owner);
  if(typeof pid!=='number' || !Number.isSafeInteger(pid) || pid<=0) throw Error('window-owner-pid');
  if(Object.prototype.hasOwnProperty.call(result,pid)) result[pid]++;
 }
 return JSON.stringify(result);
}`
  return JSON.parse(command('/usr/bin/osascript', ['-l', 'JavaScript', '-e', script, JSON.stringify(pids)]))
}

export const nativeAdapter = {
  sign(path) { command('/usr/bin/codesign', ['--force', '--deep', '--sign', '-', path]); command('/usr/bin/codesign', ['--verify', '--verbose=4', path]) },
  mount(path, directory) { command('/usr/bin/hdiutil', ['attach', path, '-nobrowse', '-mountpoint', directory, '-readonly']) },
  detach(path) { command('/usr/bin/hdiutil', ['detach', path]) },
  metadata(path) { return { identifier: command('/usr/libexec/PlistBuddy', ['-c', 'Print :CFBundleIdentifier', join(path, 'Contents/Info.plist')]), executable: command('/usr/libexec/PlistBuddy', ['-c', 'Print :CFBundleExecutable', join(path, 'Contents/Info.plist')]) } },
  clearQuarantine(path) { command('/usr/bin/xattr', ['-cr', path]) },
  size(path) { return { bytes: Number(command('/usr/bin/du', ['-sk', path]).split(/\s+/)[0]) * 1024, human: command('/usr/bin/du', ['-sh', path]).split(/\s+/)[0] } },
  platform: process.platform,
  gateRuntime: currentGateRuntime,
  signBootstrap(path) { command('/usr/bin/codesign', ['--force', '--sign', '-', path]); command('/usr/bin/codesign', ['--verify', '--verbose=4', path]) },
  verify(path) { command('/usr/bin/codesign', ['--verify', '--verbose=4', path]) },
  image(pid, session) { return observeOwnedImage(pid, session.python) },
  launch(path, args = []) { command('/usr/bin/open', ['-n', '-g', path, ...(args.length ? ['--args', ...args] : [])]) },
  processes: processQuery,
  windowOwnerCounts,
  // Compatibility facade; orchestration uses the independent boundaries below.
  probe(path, identifier, ownedPids) {
    const rows = processQuery(path, identifier, ownedPids)
    const counts = windowOwnerCounts([...new Set([...ownedPids, ...rows.map(row => row.pid)])])
    return rows.map(row => ({ ...row, windows: counts[row.pid] }))
  },
  quit(process) {
    const result = processQuery(process.bundlePath, process.identifier, [process.pid], process)
    if (!result.requested) throw Error(`normal-quit-not-found:${process.pid}`)
    return result
  },
  pidAlive(pid) {
    try { process.kill(pid, 0); return true } catch (error) { if (error.code === 'ESRCH') return false; throw error }
  },
  wait: ms => new Promise(resolve => setTimeout(resolve, ms)), now: () => performance.now()
}

function checkedProcesses(state, native, installed) {
  try {
    const entries = native.processes(installed, state.identity.identifier, state.smoke.ownedPids)
    if (!Array.isArray(entries)) throw Error('MT_QA_SMOKE:process-query')
    for (const entry of entries) if (!entry || !Number.isSafeInteger(entry.pid) || entry.pid < 1 || entry.bundlePath !== installed || entry.executablePath !== join(installed, 'Contents/MacOS/mark') || entry.identifier !== state.identity.identifier) throw Error(`MT_QA_SMOKE:process-identity:${installed}`)
    if (entries.length > 1) throw Error(`MT_QA_SMOKE:ambiguous-process:${installed}`)
    return entries
  } catch (error) {
    // A later empty registration cannot prove absence of a rejected/unknown process.
    state.smoke.processIdentityUncertain = true
    throw error
  }
}

export async function smokeQa({ state, native = nativeAdapter, applicationsRoot = '/Applications', signal }) {
  const checkCancellation = () => { if (signal?.aborted) throw Error('MT_QA_SMOKE:cancelled') }
  if (state.identity.platform !== 'macos-arm64' || state.identity.mode !== 'dryrun') throw Error('MT_QA_SMOKE:mode')
  const cleanupSession = beginSmokeCleanup(state)
  const release = join(state.workspace, 'target', state.identity.target, 'release/bundle')
  const app = join(release, 'macos', `${state.identity.productName}.app`)
  const installed = join(applicationsRoot, `${state.identity.productName}.app`)
  state.smoke = { installedPath: installed, bundleIdentifier: state.identity.identifier, sourceSha: state.identity.sourceSha,
    ownedPids: [], ownedProcesses: [], processIdentityUncertain: false, installedOwned: false, launchRequested: false }
  let mount, gate, gateProof, mounted = false, attachAttempted = false, failure, preflightProcessSafe = true, preflightWindowsSafe = true
  const errors = state.cleanupErrors
  const failed = (phase, error) => {
    const message = `${phase}:${error.message}`
    if (!errors.includes(message)) errors.push(message)
    failure ||= error
  }
  const checkpoint = () => { try { cleanupSession.sync(); saveQaState(state); return true } catch (error) { failed('evidence', error); return false } }
  const requiredCheckpoint = () => { if (!checkpoint()) throw failure }
  const remember = entries => {
    for (const entry of entries) {
      if (!state.smoke.ownedPids.includes(entry.pid)) state.smoke.ownedPids.push(entry.pid)
      if (!state.smoke.ownedProcesses.some(owned => owned.pid === entry.pid)) state.smoke.ownedProcesses.push({ pid: entry.pid, bundlePath: entry.bundlePath, executablePath: entry.executablePath, identifier: entry.identifier })
    }
  }
  const windows = () => {
    const counts = native.windowOwnerCounts(state.smoke.ownedPids)
    if (!counts || typeof counts !== 'object' || Array.isArray(counts) || Object.keys(counts).length !== state.smoke.ownedPids.length || state.smoke.ownedPids.some(pid => !Number.isSafeInteger(counts[pid]) || counts[pid] < 0)) throw Error('MT_QA_SMOKE:window-counts')
    return counts
  }
  try {
    checkCancellation()
    recordGenerated(state)
    const directory = join(release, 'dmg')
    const installers = readdirSync(directory).filter(name => name.startsWith(`${state.identity.productName}_`) && name.endsWith('.dmg'))
    if (installers.length !== 1) throw Error('MT_QA_SMOKE:installer-count')
    const installerPath = join(directory, installers[0]), installer = measuredFile(state.workspace, installerPath)
    state.smoke.installer = { path: installerPath, sha256: installer.sha256, size: installer.size }
    mount = mkdtempSync(join(state.directory, 'mount-')); state.smoke.mount = mount
    requiredCheckpoint()
    native.sign(app)
    cleanupSession.armMount(installerPath, mount)
    mounted = true; attachAttempted = true; native.mount(installerPath, mount)
    mkdirSync(installed); state.smoke.installedOwned = true; requiredCheckpoint()
    const mountedApp = join(mount, `${state.identity.productName}.app`)
    for (const name of readdirSync(mountedApp)) cpSync(join(mountedApp, name), join(installed, name), { recursive: true, force: false, errorOnExist: true })
    native.detach(mount); mounted = false; cleanupSession.detached()
    const metadata = native.metadata(installed)
    if (metadata.identifier !== state.identity.identifier || metadata.executable !== 'mark') throw Error('MT_QA_SMOKE:bundle-identity')
    native.sign(installed); native.clearQuarantine(installed)
    const binaryPath = join(installed, 'Contents/MacOS/mark'), binary = measuredFile(applicationsRoot, binaryPath)
    state.smoke.binaryPath = binaryPath; state.smoke.binarySha256 = binary.sha256; state.smoke.size = native.size(installed)
    if (!Number.isSafeInteger(state.smoke.size.bytes) || state.smoke.size.bytes <= 0) throw Error('MT_QA_SMOKE:size')
    cleanupSession.armProcess()
    preflightProcessSafe = false
    if (checkedProcesses(state, native, installed).length) throw Error('MT_QA_SMOKE:already-running')
    preflightProcessSafe = true; preflightWindowsSafe = false
    windows() // Validate CF collection even when no application has appeared.
    preflightWindowsSafe = true
    cleanupSession.armProcess()
    gate = await prepareLaunchGate({ state, installed, native, checkpoint: requiredCheckpoint, signal })
    await launchGate(gate, { remember, processes: () => checkedProcesses(state, native, installed), windows })
    state.smoke.startupVerified = true; requiredCheckpoint()
  } catch (error) { gate ||= error.gateSession; failure ||= error } finally {
    let processStopped = !state.smoke.launchRequested && preflightProcessSafe
    let windowStopped = !state.smoke.launchRequested && preflightWindowsSafe
    if (gate) {
      try {
        const result = await finishGate(gate, { processes: () => checkedProcesses(state, native, installed), windows, remember, checkpoint: requiredCheckpoint })
        processStopped = result.processSafe; windowStopped = result.windowSafe; gateProof = result.proof
        try { state.smoke.installedDeleted = !present(installed) } catch (error) { failed('installed-metadata', error) }
        for (const message of result.errors) failed('gate', Error(message))
      } catch (error) { processStopped = false; windowStopped = false; failed('gate-cleanup', error) }
    } else if (state.smoke.launchRequested) {
      let current, observationValid = false
      try {
        current = checkedProcesses(state, native, installed)
        if (state.smoke.ownedPids.length && current.some(entry => !state.smoke.ownedPids.includes(entry.pid))) { state.smoke.processIdentityUncertain = true; throw Error('unrecorded-process') }
        remember(current); observationValid = true
      } catch (error) { failed('process-query', error) }
      checkpoint() // Ownership remains in memory even if the evidence sink failed.
      if (observationValid) for (const process of current) {
        try { native.quit(process) } catch (error) { failed(`normal-Quit:${process.pid}:${installed}`, error) }
      }
      const deadline = native.now() + 10000
      do {
        let registrationAbsent = false, allPidsAbsent = true
        try {
          const remaining = checkedProcesses(state, native, installed)
          if (remaining.some(entry => !state.smoke.ownedPids.includes(entry.pid))) { state.smoke.processIdentityUncertain = true; throw Error('unrecorded-process') }
          registrationAbsent = remaining.length === 0
        } catch (error) { failed('process-stop', error) }
        // Observe each exact recorded PID even if registration failed or another PID is still live.
        for (const pid of state.smoke.ownedPids) {
          try { if (native.pidAlive(pid) !== false) allPidsAbsent = false } catch (error) { allPidsAbsent = false; failed(`pid:${pid}`, error) }
        }
        processStopped = registrationAbsent && allPidsAbsent && !state.smoke.processIdentityUncertain
        try { const counts = windows(); windowStopped = state.smoke.ownedPids.every(pid => counts[pid] === 0) } catch (error) { windowStopped = false; failed('window-stop', error) }
        if (processStopped && windowStopped) break
        if (native.now() >= deadline) break
        try { await native.wait(Math.min(250, deadline - native.now())) } catch (error) { failed('shutdown-wait', error); break }
      } while (true)
      if (!processStopped) failed('process-stop', Error(`remaining-or-unknown-pids:${state.smoke.ownedPids.join(',')}:${installed}`))
      if (!windowStopped) failed('window-stop', Error(`remaining-or-unknown-windows:${installed}`))
    }
    state.smoke.processStopped = processStopped; state.smoke.windowsStopped = windowStopped
    state.smoke.shutdownVerified = processStopped && windowStopped
    if (mounted) { try { native.detach(mount); mounted = false } catch (error) { failed(`detach:${mount}`, error) } }
    if (processStopped && !gate && state.smoke.installedOwned) {
      try { rmSync(installed, { recursive: true }); state.smoke.installedDeleted = !present(installed); if (!state.smoke.installedDeleted) throw Error('installed-path-remains') } catch (error) { failed(`installed:${installed}`, error) }
    }
    if (!mounted && mount) { try { rmSync(mount, { recursive: true, force: true }) } catch (error) { failed(`mount-directory:${mount}`, error) } }
    try { cleanupSession.finish({ mountStatus: !attachAttempted ? 'not-attempted' : mounted ? 'active-or-unknown' : 'verified-detached', processSafe: processStopped, gateProof }) } catch (error) { failed('protection-save', error) }
    try { cleanupSession.cleanup() } catch (error) { failed('generated', error) }
    state.smoke.cancelled = signal?.aborted === true
    checkpoint()
  }
  if (errors.length) throw Error(`MT_QA_SMOKE:cleanup:${[failure?.message, ...errors].filter(Boolean).join(';')}`)
  if (failure) throw failure
  checkCancellation()
  return state.smoke
}
export async function cleanupSmokeQa({ state, native = nativeAdapter, signal }) {
  if (!gateProtected(state)) { const result = cleanupGenerated(state); if (signal?.aborted) throw Error('MT_QA_SMOKE:cancelled'); return result }
  const errors = [], checkpoint = () => saveQaState(state)
  const session = resumeGateCleanup(state, native, checkpoint)
  if (state.smoke.cleanupProtection?.mount.status === 'active-or-unknown') {
    try { native.detach(state.smoke.mount); state.smoke.cleanupProtection.mount.status = 'verified-detached' } catch (error) { errors.push(`detach:${state.smoke.mount}:${error.message}`) }
  }
  const counts = () => {
    const value = native.windowOwnerCounts(state.smoke.ownedPids)
    if (!value || Object.keys(value).length !== state.smoke.ownedPids.length || state.smoke.ownedPids.some(pid => !Number.isSafeInteger(value[pid]) || value[pid] < 0)) throw Error('window-counts')
    return value
  }
  const result = await finishGate(session, { processes: () => checkedProcesses(state, native, session.installed), windows: counts, checkpoint })
  errors.push(...result.errors)
  state.smoke.processStopped = result.processSafe; state.smoke.windowsStopped = result.windowSafe
  state.smoke.shutdownVerified = result.processSafe && result.windowSafe
  if (result.proof) {
    const cleanup = beginSmokeCleanup(state, { gateProof: result.proof })
    try { cleanup.finish({ mountStatus: state.smoke.cleanupProtection.mount.status, processSafe: result.processSafe, gateProof: result.proof }) } catch (error) { errors.push(`save:${error.message}`) }
    try { cleanup.cleanup() } catch (error) { errors.push(`generated:${error.message}`) }
  }
  try { saveQaState(state) } catch (error) { errors.push(`evidence:${error.message}`) }
  if (signal?.aborted) errors.push('cancelled')
  if (errors.length) throw Error(`MT_QA_SMOKE:cleanup:${errors.join(';')}`)
  return state
}
export async function smokeWithSignals({ signals = process, cleanupOnly = false, ...options }) {
  const controller = new AbortController()
  const cancel = () => controller.abort()
  signals.on('SIGINT', cancel); signals.on('SIGTERM', cancel)
  try { return await (cleanupOnly ? cleanupSmokeQa : smokeQa)({ ...options, signal: controller.signal }) } finally {
    signals.off('SIGINT', cancel); signals.off('SIGTERM', cancel)
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const index = process.argv.indexOf('--state'); if (index < 0 || !process.argv[index + 1]) throw Error('MT_QA_SMOKE:state-required')
    const state = loadQaState(process.argv[index + 1])
    if (process.argv.includes('--cleanup-only')) await smokeWithSignals({ state, cleanupOnly: true })
    else await smokeWithSignals({ state })
    if (!process.argv.includes('--cleanup-only') && process.env.GITHUB_OUTPUT) for (const [key, value] of Object.entries({ bundle_bytes: state.smoke.size.bytes, bundle_human: state.smoke.size.human })) writeFileSync(process.env.GITHUB_OUTPUT, `${key}=${value}\n`, { flag: 'a' })
  } catch (error) { console.error(error.message); process.exitCode = 1 }
}
