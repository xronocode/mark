// @vitest-environment node
// FILE: tests/tools/qa-artifact-smoke.test.mjs
// START_MODULE_CONTRACT
//   PURPOSE: Prove exact installed-app lifecycle ordering and finally cleanup without invoking native commands.
//   SCOPE: Generated-JXA VM/inert fixtures, persisted cleanup protection and owned Node CLI; no native execution.
//   DEPENDS: Vitest; Node built-ins; prepare-qa-artifacts; qa-artifact-smoke.
//   LINKS: M-046; V-M-046; C-QA-NATIVE-BRIDGE-CLEANUP; C-QA-INSTALLER-ARTIFACTS.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
// START_MODULE_MAP
//   roots - Owned fixture trees removed after every case.
//   cleanupCliFixture - Retain external receipts for an exact owned Node cleanup CLI child.
//   bridgeFixture - Intercept actual generated native command with typed CF/Foundation VM doubles.
//   fixture - Synthetic native adapter and filesystem state, never a runnable app.
//   commandBoundary - Execute actual generated JXA with typed CF/Foundation VM command doubles.
// END_MODULE_MAP
// START_CHANGE_SUMMARY
//   - C-QA-NATIVE-BRIDGE-CLEANUP: actual-adapter failure-first and independent cleanup controls without native commands.
//   - 2026-11-15 C-QA-INSTALLER-ARTIFACTS: exact lifecycle fixture evidence; native acceptance remains separate.
// END_CHANGE_SUMMARY
import { afterEach, describe, expect, it, vi } from 'vitest'
import { runInNewContext } from 'node:vm'
const commandBoundary = vi.hoisted(() => ({ run() { throw Error('unexpected native command: blocked') } }))
vi.mock('node:child_process', () => ({ execFileSync: (...args) => commandBoundary.run(...args) }))
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import { syncBuiltinESMExports } from 'node:module'
import { EventEmitter } from 'node:events'
import { tmpdir } from 'node:os'
import { prepareQa, qaIdentity, loadQaState } from '../../tools/prepare-qa-artifacts.mjs'
import { smokeQa, smokeWithSignals, nativeAdapter } from '../../tools/qa-artifact-smoke.mjs'
const roots = []
afterEach(() => {
  const cleaned = [], errors = []
  for (const root of roots.splice(0)) {
    try { rmSync(root, { recursive: true, force: true }) } catch (error) { errors.push(`${root}:${error.message}`) }
    cleaned.push({ root, absent: !existsSync(root), inertTextOnly: true })
  }
  if (process.env.MARK_QA_CORE_EVIDENCE_ROOT) {
    const source = Object.fromEntries(['tools/qa-artifact-smoke.mjs', 'tools/prepare-qa-artifacts.mjs', 'tests/tools/qa-artifact-smoke.test.mjs', 'tests/tools/prepare-qa-artifacts.test.mjs'].map(path => [path, createHash('sha256').update(readFileSync(path)).digest('hex')]))
    try {
      mkdirSync(process.env.MARK_QA_CORE_EVIDENCE_ROOT, { recursive: true })
      appendFileSync(join(process.env.MARK_QA_CORE_EVIDENCE_ROOT, 'fixture-cleanup.jsonl'), `${JSON.stringify({ source, cleaned, errors, nativeCommandsExecuted: false })}\n`)
    } catch (error) { errors.push(`external-evidence:${error.message}`) }
  }
  commandBoundary.run = () => { throw Error('unexpected native command: blocked') }
  vi.restoreAllMocks()
  expect(errors).toEqual([])
})

// Execute the adapter's actual generated command in a VM. CF references are
// deliberately not JS arrays; raw CFString keys deliberately do not look up.
function bridgeFixture({ windows = [12345], count, collection = 'array', owner = 'number', rowType = 'dictionary', keyType = 'string', apps = 1, appPid = 12345, quitResult = true } = {}) {
  const path = '/fixture/Mark QA.app', identifier = 'com.fixture.mark.qa'
  const classes = { array: {}, dictionary: {}, number: {}, string: {} }
  const boxed = (kind, value) => Object.assign(function () {}, {
    isKindOfClass: expected => expected === classes[kind], value
  })
  const key = { cf: 'string' }
  const rows = windows.map(pid => Object.assign(boxed(rowType), {
    objectForKey(candidate) {
      if (candidate !== 'kCGWindowOwnerPID' && !(candidate?.isKindOfClass?.(classes.string) && candidate.value === 'kCGWindowOwnerPID')) return null
      return owner === 'missing' ? null : boxed(owner === 'string' ? 'string' : 'number', owner === 'boolean' ? true : owner === 'string' ? String(pid) : pid)
    }
  }))
  const array = (items, override) => Object.assign(boxed('array'), {
    count: override === undefined ? String(items.length) : override,
    objectAtIndex(index) { if (index >= items.length) throw Error('index out of bounds'); return items[index] }
  })
  const app = { bundleURL: { path: boxed('string', path) }, bundleIdentifier: boxed('string', identifier),
    executableURL: { path: boxed('string', `${path}/Contents/MacOS/mark`) }, processIdentifier: appPid, get terminate() { quits.push(appPid); return quitResult } }
  const quits = [], queries = []
  const raw = { cf: 'array' }, casts = [], commands = []
  const $ = { NSArray: classes.array, NSDictionary: classes.dictionary, NSNumber: classes.number, NSString: classes.string,
    NSWorkspace: { sharedWorkspace: { runningApplications: array(Array.from({ length: apps }, () => app)) } },
    kCGWindowOwnerPID: key, CGWindowListCopyWindowInfo: () => { queries.push('windows'); if (collection === 'throw') throw Error('CG query failed'); return collection === 'null' ? null : raw } }
  const ObjC = { import() {}, unwrap: value => value?.value ?? value,
    deepUnwrap: value => value === raw ? function rawCFReference() {} : value,
    castRefToObject(value) { casts.push(value.cf); return value === key ? boxed(keyType, keyType === 'bad-value' ? 'wrong key' : 'kCGWindowOwnerPID') : collection === 'array' ? array(rows, count) : boxed('string', 'wrong class') } }
  commandBoundary.run = (file, args) => {
    expect(file).toBe('/usr/bin/osascript')
    expect(args.slice(0, 3)).toEqual(['-l', 'JavaScript', '-e'])
    commands.push(args[3])
    return String(runInNewContext(`${args[3]}; run(argv)`, { $, ObjC, argv: args.slice(4) }))
  }
  return { path, identifier, casts, commands, quits, queries }
}

describe('actual native collection bridge', () => {
  it('converts the actual CF array and CFString key before scalar owner lookup', () => {
    const f = bridgeFixture()
    expect(nativeAdapter.probe(f.path, f.identifier, [])).toEqual([
      { pid: 12345, bundlePath: f.path, executablePath: `${f.path}/Contents/MacOS/mark`, identifier: f.identifier, windows: 1 }
    ])
    expect(f.casts).toContain('array')
    expect(f.casts).toContain('string')
    expect(f.commands.length).toBeGreaterThan(0)
  })
  it.each([0, '0'])('accepts valid empty NSArray count %s without manufacturing an app', count => {
    bridgeFixture({ windows: [], count, apps: 0 })
    expect(nativeAdapter.windowOwnerCounts([12345])).toEqual({ 12345: 0 })
  })
  it.each([1, '1'])('accepts safe native count %s', count => {
    bridgeFixture({ count }); expect(nativeAdapter.windowOwnerCounts([12345])).toEqual({ 12345: 1 })
  })
  it.each([true, -1, 1.5, ' 1', '+1', '01', '1e0', '1.0', '9007199254740992', Number.MAX_SAFE_INTEGER + 1])('rejects invalid count %s without coercion', count => {
    bridgeFixture({ count }); expect(() => nativeAdapter.windowOwnerCounts([12345])).toThrow('window-count')
  })
  it.each(['null', 'wrong-class', 'throw'])('keeps invalid collection %s distinct from empty', collection => {
    bridgeFixture({ collection, apps: 0 }); expect(() => nativeAdapter.windowOwnerCounts([])).toThrow()
  })
  it.each(['boolean', 'string', 'missing'])('rejects owner %s instead of making a PID', owner => {
    bridgeFixture({ owner }); expect(() => nativeAdapter.windowOwnerCounts([12345])).toThrow(/window-owner/)
  })
  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])('rejects invalid NSNumber owner scalar %s', pid => {
    bridgeFixture({ windows: [pid] }); expect(() => nativeAdapter.windowOwnerCounts([12345])).toThrow('window-owner-pid')
  })
  it('rejects malformed NSDictionary and SDK NSString key classes', () => {
    bridgeFixture({ rowType: 'string' }); expect(() => nativeAdapter.windowOwnerCounts([])).toThrow('window-row-type')
    bridgeFixture({ keyType: 'number' }); expect(() => nativeAdapter.windowOwnerCounts([])).toThrow('window-key-type')
  })
  it('does not create application identity from a window-only stale owner', () => {
    const f = bridgeFixture({ apps: 0 })
    expect(nativeAdapter.probe(f.path, f.identifier, [12345])).toEqual([])
    expect(f.quits).toEqual([])
  })
  it('normal-quits only a revalidated process without consulting broken CoreGraphics', () => {
    const f = bridgeFixture({ collection: 'throw' })
    const [app] = nativeAdapter.processes(f.path, f.identifier, [])
    nativeAdapter.quit(app)
    expect(f.quits).toEqual([12345]); expect(f.queries).toEqual([])
    expect(() => nativeAdapter.quit({ ...app, executablePath: '/owner/app' })).toThrow('process-identity-changed')
    expect(f.quits).toEqual([12345])
  })
  it.each([false, 'true'])('requires actual boolean true for normal Quit acceptance: %s', quitResult => {
    const f = bridgeFixture({ quitResult })
    expect(() => nativeAdapter.quit(nativeAdapter.processes(f.path, f.identifier, [])[0])).toThrow('normal-quit-refused')
  })
  it('never accepts a string process PID as numeric identity', () => {
    const f = bridgeFixture({ appPid: '12345' }); expect(() => nativeAdapter.processes(f.path, f.identifier, [])).toThrow('process-pid')
  })
  it('observes only exact PID with signal zero, and only ESRCH means absent', () => {
    const kill = vi.spyOn(process, 'kill').mockImplementation(() => true)
    expect(nativeAdapter.pidAlive(12345)).toBe(true)
    kill.mockImplementation(() => { throw Object.assign(Error('gone'), { code: 'ESRCH' }) })
    expect(nativeAdapter.pidAlive(12345)).toBe(false)
    for (const code of ['EPERM', 'EIO']) {
      kill.mockImplementation(() => { throw Object.assign(Error(code), { code }) })
      expect(() => nativeAdapter.pidAlive(12345)).toThrow(code)
    }
    expect(kill.mock.calls).toEqual(Array.from({ length: 4 }, () => [12345, 0]))
  })
})
function fixture(fault = '') {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'qa-smoke-'))); roots.push(root)
  const workspace = join(root, 'workspace'), applications = join(root, 'Applications'); mkdirSync(workspace); mkdirSync(applications)
  const identity = qaIdentity({ sourceSha: 'a'.repeat(40), runId: '123', attempt: '1', platform: 'macos-arm64', mode: 'dryrun' })
  const state = prepareQa({ workspace, temporaryRoot: root, identity, actualHead: identity.sourceSha })
  const release = join(workspace, 'target', identity.target, 'release/bundle')
  const app = join(release, 'macos', `${identity.productName}.app`), dmg = join(release, 'dmg', `${identity.productName}_1.0_aarch64.dmg`)
  mkdirSync(join(app, 'Contents/MacOS'), { recursive: true }); writeFileSync(join(app, 'Contents/MacOS/mark'), 'synthetic, never executed'); mkdirSync(join(release, 'dmg')); writeFileSync(dmg, 'synthetic installer')
  const calls = []; let alive = false; let now = 0
  const native = {
    sign(path) { calls.push(['sign', path]); if (fault === 'sign') throw Error('sign-failed') },
    mount(path, mount) { expect(path).toBe(dmg); calls.push(['mount', path]); mkdirSync(join(mount, `${identity.productName}.app/Contents/MacOS`), { recursive: true }); writeFileSync(join(mount, `${identity.productName}.app/Contents/MacOS/mark`), 'synthetic, never executed'); if (fault === 'mount') throw Error('mount-failed') },
    detach(path) { calls.push(['detach', path]) },
    metadata() { return { identifier: fault === 'identity' ? 'com.xronocode.mark' : identity.identifier, executable: 'mark' } },
    clearQuarantine(path) { calls.push(['xattr', path]) },
    size() { return { bytes: 1024, human: '1.0K' } },
    launch(path) { const recorded = JSON.parse(readFileSync(join(state.directory, 'evidence/lifecycle.json'))); expect(recorded.smoke.binarySha256).toMatch(/^[a-f0-9]{64}$/); expect(recorded.smoke.ownedPids).toEqual([]); calls.push(['open', path]); alive = fault !== 'timeout'; if (fault === 'open') throw Error('open-failed') },
    probe(path) { return alive ? [{ pid: 12345, bundlePath: path, executablePath: join(path, 'Contents/MacOS/mark'), identifier: identity.identifier, windows: 1 }] : [] },
    processes(path) { return native.probe(path).map(({ windows, ...row }) => row) },
    windowOwnerCounts(pids) { return Object.fromEntries(pids.map(pid => [pid, alive ? 1 : 0])) },
    pidAlive(pid) { expect(pid).toBe(12345); return alive },
    quit(process) { const recorded = JSON.parse(readFileSync(join(state.directory, 'evidence/lifecycle.json'))); expect(recorded.smoke.ownedPids).toEqual([12345]); calls.push(['quit', process.pid]); if (fault !== 'quit') alive = false },
    async wait(ms) { now += ms }, now() { return now }
  }
  return { state, native, applications, calls, app, dmg, setAlive(value) { alive = value } }
}
describe('exact QA native smoke lifecycle', () => {
  it('records identity/digest before launch, normal-quits exact PID and deletes all completed copies', async () => {
    const f = fixture(); await smokeQa({ ...f, applicationsRoot: f.applications })
    expect(f.calls.map(x => x[0])).toEqual(['sign', 'mount', 'detach', 'sign', 'xattr', 'open', 'quit'])
    expect(f.state.smoke.ownedPids).toEqual([12345]); expect(f.state.smoke.shutdownVerified).toBe(true)
    expect(f.state.smoke.size.bytes).toBe(1024)
    for (const path of [f.app, f.dmg, f.state.smoke.installedPath]) expect(existsSync(path)).toBe(false)
    expect(existsSync(join(f.state.directory, 'evidence/lifecycle.json'))).toBe(true)
  })
  for (const fault of ['sign', 'mount', 'identity', 'open', 'timeout']) it(`runs finally cleanup after ${fault} failure`, async () => {
    const f = fixture(fault); await expect(smokeQa({ ...f, applicationsRoot: f.applications })).rejects.toThrow()
    expect(existsSync(f.app)).toBe(false); expect(existsSync(f.dmg)).toBe(false)
    if (f.state.smoke?.installedPath) expect(existsSync(f.state.smoke.installedPath)).toBe(false)
    if (fault === 'open') expect(f.calls).toContainEqual(['quit', 12345])
    if (fault === 'timeout') expect(f.native.now()).toBe(10000)
  })
  it.each(['SIGINT', 'SIGTERM'])('handles actual wrapper %s cooperatively and unregisters handlers', async signalName => {
    const f = fixture(), signals = new EventEmitter(), probe = f.native.probe, wait = f.native.wait
    let cancelled = false
    f.native.probe = path => cancelled ? probe(path) : []
    f.native.wait = async ms => { await wait(ms); cancelled = true; signals.emit(signalName) }
    await expect(smokeWithSignals({ ...f, signals, applicationsRoot: f.applications })).rejects.toThrow(/cancelled/)
    expect(f.calls).toContainEqual(['quit', 12345])
    expect(f.state.smoke.shutdownVerified).toBe(true); expect(f.state.smoke.cancelled).toBe(true)
    expect(existsSync(f.state.smoke.installedPath)).toBe(false)
    expect(signals.listenerCount('SIGINT')).toBe(0); expect(signals.listenerCount('SIGTERM')).toBe(0)
  })
  it('unwinds cancellation after launch through normal Quit and deletion', async () => {
    const f = fixture(), controller = new AbortController(), probe = f.native.probe, wait = f.native.wait
    f.native.probe = path => controller.signal.aborted ? probe(path) : []
    f.native.wait = async ms => { await wait(ms); controller.abort() }
    await expect(smokeQa({ ...f, applicationsRoot: f.applications, signal: controller.signal })).rejects.toThrow(/cancelled/)
    expect(f.calls).toContainEqual(['quit', 12345])
    expect(f.state.smoke.shutdownVerified).toBe(true)
    expect(existsSync(f.state.smoke.installedPath)).toBe(false)
    expect(existsSync(f.app)).toBe(false); expect(existsSync(f.dmg)).toBe(false)
  })
  it('finishes normal shutdown if cancellation arrives while waiting for Quit', async () => {
    const f = fixture(), controller = new AbortController(), quit = f.native.quit, wait = f.native.wait
    let quitting
    f.native.quit = process => { quitting = process }
    f.native.wait = async ms => { await wait(ms); controller.abort(); quit(quitting) }
    await expect(smokeQa({ ...f, applicationsRoot: f.applications, signal: controller.signal })).rejects.toThrow(/cancelled/)
    expect(f.state.smoke.shutdownVerified).toBe(true)
    expect(existsSync(f.state.smoke.installedPath)).toBe(false)
  })
  it('refuses an existing installed path and leaves it intact', async () => {
    const f = fixture(); const path = join(f.applications, `${f.state.identity.productName}.app`); mkdirSync(path); writeFileSync(join(path, 'owner-data'), 'keep')
    await expect(smokeQa({ ...f, applicationsRoot: f.applications })).rejects.toThrow()
    expect(readFileSync(join(path, 'owner-data'), 'utf8')).toBe('keep'); expect(f.calls.some(x => x[0] === 'open')).toBe(false)
  })
  it('reports an exact remaining app/PID if normal Quit fails, without forced termination', async () => {
    const f = fixture('quit'); await expect(smokeQa({ ...f, applicationsRoot: f.applications })).rejects.toThrow(/cleanup/)
    expect(existsSync(f.state.smoke.installedPath)).toBe(true); expect(f.state.cleanupErrors.join(' ')).toContain('12345')
    expect(f.calls.filter(x => x[0] === 'quit')).toHaveLength(1)
  })
  it('refuses process identity mismatches before Quit', async () => {
    const f = fixture(); f.native.probe = path => [{ pid: 22, bundlePath: '/Applications/Mark.app', executablePath: join(path, 'Contents/MacOS/mark'), identifier: f.state.identity.identifier, windows: 1 }]
    await expect(smokeQa({ ...f, applicationsRoot: f.applications })).rejects.toThrow()
    expect(f.calls.some(x => x[0] === 'quit')).toBe(false)
  })
})

describe('independent cleanup proof under failed observations', () => {
  it('window failure cannot prevent normal Quit, PID absence and exact-copy cleanup', async () => {
    const f = fixture(), counts = f.native.windowOwnerCounts
    f.native.windowOwnerCounts = pids => {
      if (f.state.smoke.launchRequested) { expect(f.state.smoke.ownedPids).toEqual([12345]); throw Error('persistent-window-error') }
      return counts(pids)
    }
    await expect(smokeQa({ ...f, applicationsRoot: f.applications })).rejects.toThrow(/window/)
    expect(f.calls).toContainEqual(['quit', 12345])
    expect(f.state.smoke).toMatchObject({ processStopped: true, windowsStopped: false, shutdownVerified: false, installedDeleted: true })
    for (const path of [f.app, f.dmg, f.state.smoke.installedPath]) expect(existsSync(path)).toBe(false)
    expect(f.state.cleanupErrors.join(' ')).toContain('persistent-window-error')
  })
  it('validates collection with zero processes before launch, keeping query failure explicit', async () => {
    const f = fixture(); let queries = 0
    f.native.windowOwnerCounts = pids => { queries++; expect(pids).toEqual([]); throw Error('NULL-window-query') }
    await expect(smokeQa({ ...f, applicationsRoot: f.applications })).rejects.toThrow(/NULL-window-query|cleanup/)
    expect(queries).toBe(1); expect(f.calls.some(([name]) => name === 'open')).toBe(false)
    expect(f.state.smoke.shutdownVerified).toBe(false)
    expect(f.state.smoke.processStopped).toBe(true); expect(f.state.smoke.installedDeleted).toBe(true)
    expect(existsSync(f.app)).toBe(false); expect(existsSync(f.dmg)).toBe(false)
  })
  it('stale windows never create an application or a normal-Quit target', async () => {
    const f = fixture('timeout'); let count = 0
    f.native.windowOwnerCounts = pids => { count++; expect(pids).toEqual([]); return {} }
    await expect(smokeQa({ ...f, applicationsRoot: f.applications })).rejects.toThrow('startup-timeout')
    expect(count).toBeGreaterThan(1); expect(f.state.smoke.ownedPids).toEqual([])
    expect(f.calls.some(([name]) => name === 'quit')).toBe(false)
    expect(f.state.smoke.shutdownVerified).toBe(true)
  })
  it.each(['alive', 'EPERM', 'EIO', 'absent'])('checks recorded OS PID after AppKit registration disappears: %s', async mode => {
    const f = fixture(), observe = [], quit = f.native.quit
    f.native.quit = app => { quit(app) }
    f.native.pidAlive = pid => {
      observe.push(pid)
      if (mode === 'EPERM' || mode === 'EIO') throw Object.assign(Error(mode), { code: mode })
      return mode === 'alive'
    }
    const result = smokeQa({ ...f, applicationsRoot: f.applications })
    if (mode === 'absent') await result
    else await expect(result).rejects.toThrow(/12345/)
    expect(observe.length).toBeGreaterThan(0); expect(new Set(observe)).toEqual(new Set([12345]))
    expect(f.state.smoke.processStopped).toBe(mode === 'absent')
    expect(existsSync(f.state.smoke.installedPath)).toBe(mode !== 'absent')
    expect(existsSync(f.app)).toBe(mode !== 'absent')
    if (mode !== 'absent') expect(f.state.cleanupErrors.join(' ')).toContain(f.state.smoke.installedPath)
  })
  it.each(['mismatched', 'ambiguous', 'reused'])('refuses %s process identities without touching unrelated apps', async mode => {
    const f = fixture(), processes = f.native.processes
    f.native.processes = path => {
      const rows = processes(path)
      if (!f.state.smoke.ownedPids.length) {
        if (mode === 'mismatched' && f.state.smoke.launchRequested) return rows.map(row => ({ ...row, executablePath: '/owner/Mark.app/Contents/MacOS/mark' }))
        if (mode === 'ambiguous' && f.state.smoke.launchRequested) return [...rows, ...rows.map(row => ({ ...row, pid: 54321 }))]
        return rows
      }
      if (mode === 'reused') return rows.map(row => ({ ...row, bundlePath: '/owner/Mark.app' }))
      return rows
    }
    await expect(smokeQa({ ...f, applicationsRoot: f.applications })).rejects.toThrow(/cleanup/)
    expect(f.calls.some(([name]) => name === 'quit')).toBe(false)
    expect(f.state.smoke.processStopped).toBe(false)
    expect(existsSync(f.state.smoke.installedPath)).toBe(true)
  })
  it.each(['before-launch', 'after-launch', 'during-Quit'].flatMap(phase => ['state.json', 'evidence/lifecycle.json'].map(sink => ({ phase, sink }))))('contains actual EISDIR evidence-write fault $phase at $sink', async ({ phase, sink }) => {
    const f = fixture(), launch = f.native.launch, quit = f.native.quit, sign = f.native.sign
    const receipt = join(f.state.directory, sink)
    const obstruct = () => { rmSync(receipt); mkdirSync(receipt) }
    if (phase === 'before-launch') f.native.sign = path => { sign(path); obstruct() }
    if (phase === 'after-launch') {
      f.native.launch = path => { launch(path); obstruct() }
      f.native.quit = app => { expect(f.state.smoke.ownedPids).toEqual([12345]); f.calls.push(['quit', app.pid]); f.setAlive(false) }
    }
    if (phase === 'during-Quit') f.native.quit = app => { quit(app); obstruct() }
    await expect(smokeQa({ ...f, applicationsRoot: f.applications })).rejects.toThrow(/cleanup|EISDIR/)
    if (phase !== 'before-launch') expect(f.calls).toContainEqual(['quit', 12345])
    else expect(f.calls.some(([name]) => name === 'open')).toBe(false)
    expect(f.state.smoke.processStopped).toBe(true)
    expect(f.state.cleanupErrors.join(' ')).toMatch(/EISDIR|illegal operation/)
    for (const path of [f.app, f.dmg, f.state.smoke.installedPath]) expect(existsSync(path)).toBe(false)
  })
  it('cancellation before launch still cleans exact generated copies without native launch', async () => {
    const f = fixture(), controller = new AbortController(); controller.abort()
    await expect(smokeQa({ ...f, applicationsRoot: f.applications, signal: controller.signal })).rejects.toThrow(/cancelled/)
    expect(f.calls).toEqual([])
    expect(existsSync(f.app)).toBe(false); expect(existsSync(f.dmg)).toBe(false)
  })
  it('first appearance ends the startup gate immediately rather than demanding ten-second survival', async () => {
    const f = fixture(); await smokeQa({ ...f, applicationsRoot: f.applications })
    expect(f.native.now()).toBe(0); expect(f.state.smoke.startupVerified).toBe(true)
  })
})


describe('cleanup identity boundary', () => {
  it('does not adopt a replacement PID first seen during finally', async () => {
    const f = fixture(), processes = f.native.processes, observed = []
    f.native.processes = path => {
      const rows = processes(path)
      return f.state.smoke.ownedPids.length ? rows.map(row => ({ ...row, pid: 54321 })) : rows
    }
    f.native.pidAlive = pid => { observed.push(pid); return true }
    await expect(smokeQa({ ...f, applicationsRoot: f.applications })).rejects.toThrow(/12345/)
    expect(f.state.smoke.ownedPids).toEqual([12345])
    expect(f.calls.some(([name]) => name === 'quit')).toBe(false)
    expect(new Set(observed)).toEqual(new Set([12345]))
    expect(existsSync(f.state.smoke.installedPath)).toBe(true)
  })
})

describe('sticky rejected-process uncertainty', () => {
  it.each(['mismatch', 'ambiguity'])('does not erase a transient first post-launch %s with empty registration', async mode => {
    const f = fixture(), processes = f.native.processes, observed = []
    let rejected = false
    f.native.processes = path => {
      if (!f.state.smoke.launchRequested || rejected) return []
      rejected = true
      const rows = processes(path)
      return mode === 'mismatch' ? rows.map(row => ({ ...row, executablePath: '/owner/app/mark' })) : [...rows, ...rows.map(row => ({ ...row, pid: 54321 }))]
    }
    f.native.pidAlive = pid => { observed.push(pid); return true }
    await expect(smokeQa({ ...f, applicationsRoot: f.applications })).rejects.toThrow()
    expect(rejected).toBe(true)
    expect(f.state.smoke.ownedPids).toEqual([])
    expect(f.state.smoke.processStopped).toBe(false)
    expect(f.state.smoke.shutdownVerified).toBe(false)
    expect(f.calls.some(([name]) => name === 'quit')).toBe(false)
    for (const path of [f.app, f.dmg, f.state.smoke.installedPath]) expect(existsSync(path)).toBe(true)
    expect(f.state.cleanupErrors.join(' ')).toContain(f.state.smoke.installedPath)
    expect(observed).toEqual([]) // Rejected candidates are not fabricated owned processes.
  })
  it('does not erase a replacement seen once in finally when the old exact PID is absent', async () => {
    const f = fixture(), processes = f.native.processes, observed = []
    let replaced = false
    f.native.processes = path => {
      if (!f.state.smoke.ownedPids.length) return processes(path)
      if (replaced) return []
      replaced = true
      return processes(path).map(row => ({ ...row, pid: 54321 }))
    }
    f.native.pidAlive = pid => { observed.push(pid); expect(pid).toBe(12345); return false }
    await expect(smokeQa({ ...f, applicationsRoot: f.applications })).rejects.toThrow(/cleanup/)
    expect(replaced).toBe(true); expect(observed.length).toBeGreaterThan(0)
    expect(f.state.smoke.ownedPids).toEqual([12345])
    expect(f.state.smoke.processStopped).toBe(false)
    expect(f.calls.some(([name]) => name === 'quit')).toBe(false)
    for (const path of [f.app, f.dmg, f.state.smoke.installedPath]) expect(existsSync(path)).toBe(true)
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


describe('cross-helper mounted installer protection', () => {
  it('detach failure retains active installer through outer cleanup', async () => {
    const f = fixture(); f.native.detach = path => { f.calls.push(['detach-failed', path]); throw Error('detach-failed-owned-mount') }
    await expect(smokeQa({ ...f, applicationsRoot: f.applications })).rejects.toThrow(/detach/)
    const immediateRetained = existsSync(f.dmg)
    // Exercise the actual fresh process even when the old immediate path already deleted it.
    const result = await cleanupCliFixture(f.state)
    expect(immediateRetained).toBe(true)
    expect(result.result.code).not.toBe(0)
    expect(existsSync(f.dmg)).toBe(true); expect(existsSync(f.state.smoke.mount)).toBe(true)
    expect(f.calls.filter(([name]) => name === 'detach-failed')).toHaveLength(2)
    expect(f.state.cleanupErrors.join(' ')).toContain(f.state.smoke.mount)
  })
})


describe('preflight durable process-protection ordering', () => {
  it.each(['mismatch', 'ambiguity', 'query-error'])('arms stale-safe state before %s and failed uncertainty saves reach outer CLI', async mode => {
    const f = fixture(), original = fs.writeFileSync, processes = f.native.processes
    let failure, queryObserved = false, staleSafeObserved = false
    // detached() has persisted the legitimate earlier safe no-launch record.
    const size = f.native.size
    f.native.size = path => {
      const saved = loadQaState(join(f.state.directory, 'state.json'))
      staleSafeObserved = saved.smoke.cleanupProtection.mount.status === 'verified-detached' && saved.smoke.cleanupProtection.process.status === 'not-launched'
      return size(path)
    }
    f.native.processes = path => {
      queryObserved = true
      failure = vi.spyOn(fs, 'writeFileSync').mockImplementation((file, ...args) => {
        if (String(file).startsWith(f.state.directory)) throw Object.assign(Error('EACCES uncertainty-save'), { code: 'EACCES' })
        return original(file, ...args)
      }); syncBuiltinESMExports()
      if (mode === 'query-error') throw Error('process-query-unavailable')
      const row = { pid: 12345, bundlePath: path, executablePath: join(path, 'Contents/MacOS/mark'), identifier: f.state.identity.identifier }
      return mode === 'mismatch' ? [{ ...row, executablePath: '/unrelated/mark' }] : [row, { ...row, pid: 54321 }]
    }
    try { await expect(smokeQa({ ...f, applicationsRoot: f.applications })).rejects.toThrow() }
    finally { failure?.mockRestore(); syncBuiltinESMExports() }
    expect(staleSafeObserved).toBe(true); expect(queryObserved).toBe(true)
    expect(f.calls.some(([name]) => name === 'open' || name === 'quit')).toBe(false)
    const result = await cleanupCliFixture(f.state)
    expect(result.result.code).not.toBe(0)
    for (const path of [f.app, f.dmg, f.state.smoke.installedPath]) expect(existsSync(path)).toBe(true)
    expect(loadQaState(join(f.state.directory, 'state.json')).smoke.cleanupProtection.process.status).toBe('active-or-unknown')
  })
})


describe('before-action saves and local completed-copy cleanup', () => {
  it('persists armed intent before actual attach/preflight/open adapter boundaries', async () => {
    const f = fixture(), mount = f.native.mount, processes = f.native.processes, launch = f.native.launch
    const observed = []
    f.native.mount = (...args) => { const p = loadQaState(join(f.state.directory, 'state.json')).smoke.cleanupProtection; expect(p.mount.status).toBe('active-or-unknown'); expect(p.installer.path).toBe(f.dmg); observed.push('attach'); mount(...args) }
    f.native.processes = path => { const p = loadQaState(join(f.state.directory, 'state.json')).smoke.cleanupProtection; expect(p.process.status).toBe('active-or-unknown'); observed.push('process'); return processes(path) }
    f.native.launch = path => { const p = loadQaState(join(f.state.directory, 'state.json')).smoke.cleanupProtection; expect(p.process.status).toBe('active-or-unknown'); expect(p.mount.status).toBe('verified-detached'); observed.push('open'); launch(path) }
    await smokeQa({ ...f, applicationsRoot: f.applications })
    expect(observed[0]).toBe('attach'); expect(observed.indexOf('process')).toBeLessThan(observed.indexOf('open'))
  })
  it.each(['attach', 'first-preflight', 'open'])('failed required %s save prevents the side effect and cleans known-safe copies', async boundary => {
    const f = fixture(), original = fs.writeFileSync, sign = f.native.sign, size = f.native.size, processes = f.native.processes
    let write, queried = false
    const obstruct = () => {
      write = vi.spyOn(fs, 'writeFileSync').mockImplementation((path, ...args) => {
        if (String(path).startsWith(f.state.directory)) throw Object.assign(Error('EACCES before action'), { code: 'EACCES' })
        return original(path, ...args)
      }); syncBuiltinESMExports()
    }
    if (boundary === 'attach') f.native.sign = path => { sign(path); obstruct() }
    if (boundary === 'first-preflight') f.native.size = path => { const value = size(path); obstruct(); return value }
    f.native.processes = path => { queried = true; const rows = processes(path); if (boundary === 'open') obstruct(); return rows }
    try { await expect(smokeQa({ ...f, applicationsRoot: f.applications })).rejects.toThrow(/EACCES/) }
    finally { write?.mockRestore(); syncBuiltinESMExports() }
    expect(f.calls.some(([name]) => name === 'open')).toBe(false)
    if (boundary === 'attach') expect(f.calls.some(([name]) => name === 'mount')).toBe(false)
    expect(queried).toBe(boundary === 'open')
    expect(f.state.smoke.processStopped).toBe(true)
    for (const path of [f.app, f.dmg, f.state.smoke.installedPath]) expect(existsSync(path)).toBe(false)
  })
  it('retains failed normal-Quit copies through the actual later cleanup CLI', async () => {
    const f = fixture('quit'); await expect(smokeQa({ ...f, applicationsRoot: f.applications })).rejects.toThrow(/cleanup/)
    const result = await cleanupCliFixture(f.state)
    expect(result.result.code).not.toBe(0)
    expect(result.output).toContain('12345')
    for (const path of [f.app, f.dmg, f.state.smoke.installedPath]) expect(existsSync(path)).toBe(true)
  })
  it('removes locally completed copies despite failed clear evidence and keeps fresh outer state conservative', async () => {
    const f = fixture(), quit = f.native.quit, receipt = join(f.state.directory, 'evidence/lifecycle.json')
    f.native.quit = app => { quit(app); rmSync(receipt); mkdirSync(receipt) }
    await expect(smokeQa({ ...f, applicationsRoot: f.applications })).rejects.toThrow(/EISDIR/)
    expect(f.state.smoke.processStopped).toBe(true)
    for (const path of [f.app, f.dmg, f.state.smoke.installedPath]) expect(existsSync(path)).toBe(false)
    const persisted = loadQaState(join(f.state.directory, 'state.json'))
    expect(persisted.smoke.cleanupProtection.process.status).toBe('active-or-unknown')
    const result = await cleanupCliFixture(f.state)
    expect(result.result.code).not.toBe(0); expect(result.output).toContain('12345')
  })
})
