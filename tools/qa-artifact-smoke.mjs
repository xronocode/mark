#!/usr/bin/env node
// FILE: tools/qa-artifact-smoke.mjs
// START_MODULE_CONTRACT
//   PURPOSE: Preserve the installed macOS launch gate with an isolated exact app and normal-Quit finally cleanup.
//   SCOPE: Ad-hoc signing, readonly DMG mount, exclusive install, exact identity/PID/window verification and owned-copy deletion.
//   DEPENDS: Node built-ins; prepare-qa-artifacts; macOS codesign/hdiutil/open/AppKit/CoreGraphics metadata.
//   LINKS: M-046; V-M-046; C-QA-INSTALLER-ARTIFACTS; N-QA-DRYRUN-ARTIFACT-HYGIENE.
//   ROLE: SCRIPT
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
// START_MODULE_MAP
//   command - Execute an argument-vector native command without a shell.
//   appQuery - Read exact running app and WindowServer ownership metadata or request normal Quit.
//   nativeAdapter - Native operations behind the fixture boundary.
//   checkedProcesses - Reject ambiguous or mismatched process identity before any Quit.
//   smokeWithSignals - Convert cancellation signals into cooperative cleanup and unregister handlers.
//   smokeQa - Run the installed-app smoke and finally shut down/remove only owned copies.
// END_MODULE_MAP
// START_CHANGE_SUMMARY
//   - 2026-11-15 C-QA-INSTALLER-ARTIFACTS: replace shared app installation and broad forced kills with exact lifecycle evidence.
// END_CHANGE_SUMMARY
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { execFileSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import { cleanupGenerated, loadQaState, measuredFile, recordGenerated, saveQaState } from './prepare-qa-artifacts.mjs'
const command = (file, args) => execFileSync(file, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
function appQuery(path, identifier, process = null, ownedPids = []) {
  const script = `ObjC.import('AppKit'); ObjC.import('CoreGraphics');
function run(argv) {
 const path=argv[0], id=argv[1], quitPid=Number(argv[2] || 0), owned=JSON.parse(argv[3]), result=[];
 const apps=$.NSWorkspace.sharedWorkspace.runningApplications;
 const windows=ObjC.deepUnwrap($.CGWindowListCopyWindowInfo(0,0)) || [];
 for(let i=0;i<apps.count;i++) {
  const app=apps.objectAtIndex(i), bundle=ObjC.unwrap(app.bundleURL.path) || '', identifier=ObjC.unwrap(app.bundleIdentifier) || '';
  if(bundle !== path && identifier !== id && !owned.includes(Number(app.processIdentifier))) continue;
  const executable=ObjC.unwrap(app.executableURL.path) || '', pid=Number(app.processIdentifier);
  if(quitPid) {
   if(pid !== quitPid) continue;
   if(bundle !== path || identifier !== id || executable !== path+'/Contents/MacOS/mark') throw Error('process-identity-changed');
   if(!app.terminate) throw Error('normal-quit-refused');
  } else result.push({pid,bundlePath:bundle,executablePath:executable,identifier,windows:windows.filter(w=>w.kCGWindowOwnerPID===pid).length});
 }
 if(!quitPid) for(const pid of owned) {
  const count=windows.filter(w=>w.kCGWindowOwnerPID===pid).length;
  if(count && !result.some(app=>app.pid===pid)) result.push({pid,bundlePath:path,executablePath:path+'/Contents/MacOS/mark',identifier:id,windows:count});
 }
 return JSON.stringify(result);
}`
  return JSON.parse(command('/usr/bin/osascript', ['-l', 'JavaScript', '-e', script, path, identifier, process ? String(process.pid) : '', JSON.stringify(ownedPids)]))
}
export const nativeAdapter = {
  sign(path) { command('/usr/bin/codesign', ['--force', '--deep', '--sign', '-', path]); command('/usr/bin/codesign', ['--verify', '--verbose=4', path]) },
  mount(path, directory) { command('/usr/bin/hdiutil', ['attach', path, '-nobrowse', '-mountpoint', directory, '-readonly']) },
  detach(path) { command('/usr/bin/hdiutil', ['detach', path]) },
  metadata(path) { return { identifier: command('/usr/libexec/PlistBuddy', ['-c', 'Print :CFBundleIdentifier', join(path, 'Contents/Info.plist')]), executable: command('/usr/libexec/PlistBuddy', ['-c', 'Print :CFBundleExecutable', join(path, 'Contents/Info.plist')]) } },
  clearQuarantine(path) { command('/usr/bin/xattr', ['-cr', path]) },
  size(path) { return { bytes: Number(command('/usr/bin/du', ['-sk', path]).split(/\s+/)[0]) * 1024, human: command('/usr/bin/du', ['-sh', path]).split(/\s+/)[0] } },
  launch(path) { command('/usr/bin/open', ['-n', '-g', path]) },
  probe(path, identifier, ownedPids) { return appQuery(path, identifier, null, ownedPids) },
  quit(process) { appQuery(process.bundlePath, process.identifier, process) },
  wait: ms => new Promise(resolve => setTimeout(resolve, ms)), now: () => performance.now()
}
function checkedProcesses(state, native, installed) {
  const entries = native.probe(installed, state.identity.identifier, state.smoke.ownedPids)
  for (const entry of entries) if (!Number.isSafeInteger(entry.pid) || entry.pid < 1 || entry.bundlePath !== installed || entry.executablePath !== join(installed, 'Contents/MacOS/mark') || entry.identifier !== state.identity.identifier || !Number.isSafeInteger(entry.windows) || entry.windows < 0) throw Error('MT_QA_SMOKE:process-identity')
  if (entries.length > 1) throw Error('MT_QA_SMOKE:ambiguous-process')
  const owned = state.smoke.ownedPids
  for (const entry of entries) if (!owned.includes(entry.pid)) owned.push(entry.pid)
  saveQaState(state)
  return entries
}
export async function smokeQa({ state, native = nativeAdapter, applicationsRoot = '/Applications', signal }) {
  const checkCancellation = () => { if (signal?.aborted) throw Error('MT_QA_SMOKE:cancelled') }
  if (state.identity.platform !== 'macos-arm64' || state.identity.mode !== 'dryrun') throw Error('MT_QA_SMOKE:mode')
  const release = join(state.workspace, 'target', state.identity.target, 'release/bundle')
  const app = join(release, 'macos', `${state.identity.productName}.app`)
  const directory = join(release, 'dmg')
  const installers = readdirSync(directory).filter(name => name.startsWith(`${state.identity.productName}_`) && name.endsWith('.dmg'))
  if (installers.length !== 1) throw Error('MT_QA_SMOKE:installer-count')
  const dmg = join(directory, installers[0]), installed = join(applicationsRoot, `${state.identity.productName}.app`)
  const mount = mkdtempSync(join(state.directory, 'mount-'))
  state.smoke = { installedPath: installed, bundleIdentifier: state.identity.identifier, sourceSha: state.identity.sourceSha, ownedPids: [], mount, installedOwned: false, launchRequested: false }
  let mounted = false, failure
  try {
    checkCancellation()
    recordGenerated(state)
    const installer = measuredFile(state.workspace, dmg)
    state.smoke.installer = { path: dmg, sha256: installer.sha256, size: installer.size }
    saveQaState(state)
    native.sign(app)
    mounted = true; native.mount(dmg, mount)
    mkdirSync(installed); state.smoke.installedOwned = true; saveQaState(state)
    const mountedApp = join(mount, `${state.identity.productName}.app`)
    for (const name of readdirSync(mountedApp)) cpSync(join(mountedApp, name), join(installed, name), { recursive: true, force: false, errorOnExist: true })
    native.detach(mount); mounted = false
    const metadata = native.metadata(installed)
    if (metadata.identifier !== state.identity.identifier || metadata.executable !== 'mark') throw Error('MT_QA_SMOKE:bundle-identity')
    native.sign(installed); native.clearQuarantine(installed)
    const binaryPath = join(installed, 'Contents/MacOS/mark'), binary = measuredFile(applicationsRoot, binaryPath)
    state.smoke.binaryPath = binaryPath; state.smoke.binarySha256 = binary.sha256; state.smoke.size = native.size(installed)
    if (!Number.isSafeInteger(state.smoke.size.bytes) || state.smoke.size.bytes <= 0) throw Error('MT_QA_SMOKE:size')
    if (checkedProcesses(state, native, installed).length) throw Error('MT_QA_SMOKE:already-running')
    state.smoke.launchRequested = true; saveQaState(state)
    native.launch(installed)
    checkCancellation()
    const deadline = native.now() + 10000
    let running = checkedProcesses(state, native, installed)
    while (!running.length && native.now() < deadline) { await native.wait(Math.min(1000, deadline - native.now())); checkCancellation(); running = checkedProcesses(state, native, installed) }
    if (!running.length) throw Error('MT_QA_SMOKE:startup-timeout')
    state.smoke.startupVerified = true; saveQaState(state)
  } catch (error) { failure = error } finally {
    let shutdown = !state.smoke.launchRequested
    if (state.smoke.launchRequested) {
      try {
        const running = checkedProcesses(state, native, installed)
        for (const process of running) native.quit(process)
        const deadline = native.now() + 10000
        let remaining = checkedProcesses(state, native, installed)
        while (remaining.length && native.now() < deadline) { await native.wait(Math.min(250, deadline - native.now())); remaining = checkedProcesses(state, native, installed) }
        if (remaining.length) throw Error(`remaining-pids:${remaining.map(entry => entry.pid).join(',')}:${installed}`)
        shutdown = true
      } catch (error) { state.cleanupErrors.push(`normal-Quit:${error.message}`) }
    }
    state.smoke.shutdownVerified = shutdown
    if (mounted) { try { native.detach(mount); mounted = false } catch (error) { state.cleanupErrors.push(`detach:${mount}:${error.message}`) } }
    if (shutdown && state.smoke.installedOwned) {
      try { rmSync(installed, { recursive: true }); state.smoke.installedDeleted = !existsSync(installed) } catch (error) { state.cleanupErrors.push(`installed:${installed}:${error.message}`) }
    }
    if (!mounted) { try { rmSync(mount, { recursive: true, force: true }) } catch (error) { state.cleanupErrors.push(`mount-directory:${mount}:${error.message}`) } }
    try { cleanupGenerated(state) } catch (error) { state.cleanupErrors.push(`generated:${error.message}`) }
    state.smoke.cancelled = signal?.aborted === true
    saveQaState(state)
  }
  if (state.cleanupErrors.length) throw Error(`MT_QA_SMOKE:cleanup:${state.cleanupErrors.join(';')}`)
  if (failure) throw failure
  checkCancellation()
  return state.smoke
}
export async function smokeWithSignals({ signals = process, ...options }) {
  const controller = new AbortController()
  const cancel = () => controller.abort()
  signals.on('SIGINT', cancel); signals.on('SIGTERM', cancel)
  try { return await smokeQa({ ...options, signal: controller.signal }) } finally {
    signals.off('SIGINT', cancel); signals.off('SIGTERM', cancel)
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const index = process.argv.indexOf('--state'); if (index < 0 || !process.argv[index + 1]) throw Error('MT_QA_SMOKE:state-required')
    const state = loadQaState(process.argv[index + 1]); await smokeWithSignals({ state })
    if (process.env.GITHUB_OUTPUT) for (const [key, value] of Object.entries({ bundle_bytes: state.smoke.size.bytes, bundle_human: state.smoke.size.human })) writeFileSync(process.env.GITHUB_OUTPUT, `${key}=${value}\n`, { flag: 'a' })
  } catch (error) { console.error(error.message); process.exitCode = 1 }
}
