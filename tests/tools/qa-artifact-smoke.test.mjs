// @vitest-environment node
// FILE: tests/tools/qa-artifact-smoke.test.mjs
// START_MODULE_CONTRACT
//   PURPOSE: Prove exact installed-app lifecycle ordering and finally cleanup without invoking native commands.
//   SCOPE: Synthetic readonly-package inputs, isolated app copies, normal Quit, startup deadline and failure ownership.
//   DEPENDS: Vitest; Node built-ins; prepare-qa-artifacts; qa-artifact-smoke.
//   LINKS: M-046; V-M-046; C-QA-INSTALLER-ARTIFACTS.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
// START_MODULE_MAP
//   roots - Owned fixture trees removed after every case.
//   fixture - Synthetic native adapter and filesystem state, never a runnable app.
// END_MODULE_MAP
// START_CHANGE_SUMMARY
//   - 2026-11-15 C-QA-INSTALLER-ARTIFACTS: exact lifecycle fixture evidence; native acceptance remains separate.
// END_CHANGE_SUMMARY
import { afterEach, describe, expect, it } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { EventEmitter } from 'node:events'
import { tmpdir } from 'node:os'
import { prepareQa, qaIdentity } from '../../tools/prepare-qa-artifacts.mjs'
import { smokeQa, smokeWithSignals } from '../../tools/qa-artifact-smoke.mjs'
const roots = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })
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
    mount(path, mount) { calls.push(['mount', path]); mkdirSync(join(mount, `${identity.productName}.app/Contents/MacOS`), { recursive: true }); writeFileSync(join(mount, `${identity.productName}.app/Contents/MacOS/mark`), 'synthetic, never executed'); if (fault === 'mount') throw Error('mount-failed') },
    detach(path) { calls.push(['detach', path]) },
    metadata() { return { identifier: fault === 'identity' ? 'com.xronocode.mark' : identity.identifier, executable: 'mark' } },
    clearQuarantine(path) { calls.push(['xattr', path]) },
    size() { return { bytes: 1024, human: '1.0K' } },
    launch(path) { const recorded = JSON.parse(readFileSync(join(state.directory, 'evidence/lifecycle.json'))); expect(recorded.smoke.binarySha256).toMatch(/^[a-f0-9]{64}$/); expect(recorded.smoke.ownedPids).toEqual([]); calls.push(['open', path]); alive = fault !== 'timeout'; if (fault === 'open') throw Error('open-failed') },
    probe(path) { return alive ? [{ pid: 12345, bundlePath: path, executablePath: join(path, 'Contents/MacOS/mark'), identifier: identity.identifier, windows: 1 }] : [] },
    quit(process) { const recorded = JSON.parse(readFileSync(join(state.directory, 'evidence/lifecycle.json'))); expect(recorded.smoke.ownedPids).toEqual([12345]); calls.push(['quit', process.pid]); if (fault !== 'quit') alive = false },
    async wait(ms) { now += ms }, now() { return now }
  }
  return { state, native, applications, calls, app, dmg }
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
