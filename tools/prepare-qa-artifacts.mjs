#!/usr/bin/env node
// FILE: tools/prepare-qa-artifacts.mjs
// START_MODULE_CONTRACT
//   PURPOSE: Bind unsigned QA identities and preserve active/unknown smoke artifacts across cleanup processes.
//   SCOPE: Isolated state, contained installer/digest receipts, persisted mount/process protection and exact generated-output cleanup.
//   DEPENDS: Node filesystem/path/crypto/process built-ins; existing target bundle layouts.
//   LINKS: M-046; V-M-046; C-QA-NATIVE-BRIDGE-MOUNT-CLEANUP; C-QA-INSTALLER-ARTIFACTS; N-QA-DRYRUN-ARTIFACT-HYGIENE.
//   ROLE: SCRIPT
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
// START_MODULE_MAP
//   PLATFORMS - Fixed existing platform/target/package layouts.
//   hash - SHA256 of exact bytes.
//   fail - Stable QA failure without incidental environment data.
//   inside - Strict lexical containment.
//   present - Treat only ENOENT as absence; preserve permission and I/O failures.
//   safeParents - Reject link/junction parents below the owned workspace.
//   measuredFile - Read a contained regular nonempty file through its checked descriptor.
//   qaIdentity - Validate and derive source/run/platform/test-bound QA identity.
//   cachedExecutables - Enumerate only regular project executable-name cache candidates.
//   candidateFiles - Discover only expected-identity package/app and exact project executable candidates.
//   prepareQa - Create a fresh isolated config/evidence/staging state before any build.
//   saveQaState - Persist current evidence and private runner state.
//   localSmokeProofs - Opaque same-invocation proof, never a serialized or CLI cleanup bypass.
//   validateSmokeProtection - Validate persisted identity, paths, digest and mount/process safety schema.
//   smokeCleanupPolicy - Preserve uncertain persisted smoke artifacts across fresh cleanup.
//   beginSmokeCleanup - Arm native intent before action/query and bind actual local cleanup facts.
//   loadQaState - Revalidate identity and derived runner paths.
//   recordBinary - Bind one owned executable to bytes and source before launch.
//   recordGenerated - Record created/changed output candidates and digest-identical executable copies.
//   collectQaInstaller - Copy only the expected installer bytes and manifest to fresh staging.
//   recordQaUpload - Record the remote ZIP identity separately from installer bytes.
//   cleanupGenerated - Remove only proved-owned generated outputs and stage copies, preserving evidence/caches.
//   qaCli - Dispatch the narrow local helper commands.
// END_MODULE_MAP
// START_CHANGE_SUMMARY
//   - C-QA-MACOS-LAUNCH-GATE: fixed-directory protection requires an opaque fresh native stop proof.
//   - C-QA-NATIVE-BRIDGE-MOUNT-CLEANUP: persist identity-bound mount/process intent and enforce it across fresh cleanup; commit authoritative state last.
//   - 2026-11-16 C-CI-ARTIFACT-CACHE-FAILURE-CLEANUP: permission/I/O errors stay explicit, only ENOENT confirms absence; independent owned cleanup continues.
//   - 2026-11-15 C-QA-INSTALLER-ARTIFACTS: purpose-bound QA handoff and exact generated-output hygiene.
// END_CHANGE_SUMMARY
import { constants, closeSync, fstatSync, lstatSync, mkdirSync, mkdtempSync, openSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import { gateProtected, isGateStopProof } from './qa-launch-gate.mjs'

export const PLATFORMS = Object.freeze({
  'macos-arm64': { target: 'aarch64-apple-darwin', folder: 'dmg', extension: '.dmg', bundles: ['app', 'dmg'], executable: 'mark' },
  'windows-x64': { target: 'x86_64-pc-windows-msvc', folder: 'nsis', extension: '.exe', bundles: ['nsis'], executable: 'mark.exe' }
})
export const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const fail = reason => { throw new Error(`MT_QA_ARTIFACT:${reason}`) }
const inside = (parent, path) => { const part = relative(parent, path); return part !== '' && part !== '..' && !part.startsWith(`..${sep}`) && !isAbsolute(part) }
const present = path => {
  try { lstatSync(path); return true } catch (error) { if (error.code === 'ENOENT') return false; throw error }
}
const safeParents = (root, path) => {
  if (!inside(root, path)) fail('outside-root')
  let current = root
  for (const piece of relative(root, dirname(path)).split(sep)) {
    if (!piece) continue
    current = join(current, piece)
    if (lstatSync(current).isSymbolicLink()) fail('linked-parent')
  }
}
export function measuredFile(root, path, { nonempty = true } = {}) {
  safeParents(root, path)
  const before = lstatSync(path)
  if (!before.isFile() || before.isSymbolicLink()) fail('not-regular')
  const fd = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW || 0))
  try {
    const opened = fstatSync(fd)
    if (!opened.isFile() || opened.dev !== before.dev || opened.ino !== before.ino) fail('file-changed')
    const bytes = readFileSync(fd)
    if (bytes.length !== opened.size || (nonempty && bytes.length === 0)) fail('empty-or-changing-file')
    return { bytes, sha256: hash(bytes), size: bytes.length }
  } finally { closeSync(fd) }
}
export function qaIdentity({ sourceSha, candidateSha = sourceSha, runId, attempt, platform, mode, testCase = '', actor = '' }) {
  if (!/^[a-f0-9]{40}$/.test(sourceSha || '') || !/^[a-f0-9]{40}$/.test(candidateSha || '')) fail('source-identity')
  if (!/^[1-9][0-9]{0,19}$/.test(String(runId)) || !/^[1-9][0-9]{0,5}$/.test(String(attempt))) fail('run-identity')
  if (!Object.hasOwn(PLATFORMS, platform) || !['dryrun', 'manual-handoff'].includes(mode)) fail('platform-or-mode')
  if (mode === 'manual-handoff' && !/^[A-Z][A-Z0-9-]{2,79}$/.test(testCase)) fail('unfinished-test-required')
  if (mode === 'dryrun' && testCase) fail('dryrun-cannot-retain-installer')
  const token = `${platform}-${sourceSha.slice(0, 12)}-${runId}-${attempt}`
  return { sourceSha, candidateSha, runId: String(runId), attempt: String(attempt), platform, mode, testCase: testCase || null,
    actor, target: PLATFORMS[platform].target, productName: `Mark QA ${token}`,
    identifier: `com.xronocode.mark.qa.${platform.replaceAll('-', '')}.s${sourceSha.slice(0, 12)}.r${runId}.a${attempt}`,
    artifactName: `mark-qa-${platform}-${sourceSha}-${runId}-${attempt}` }
}
const candidateFiles = state => {
  const { workspace, identity } = state, spec = PLATFORMS[identity.platform]
  const release = join(workspace, 'target', identity.target, 'release')
  const result = [join(release, spec.executable), join(workspace, 'target/release', spec.executable)]
  const app = join(release, 'bundle/macos', `${identity.productName}.app`)
  if (identity.platform === 'macos-arm64' && present(app)) result.push(app)
  const directory = join(release, 'bundle', spec.folder)
  if (present(directory)) {
    safeParents(workspace, join(directory, 'entry'))
    for (const name of readdirSync(directory)) if (name.startsWith(`${identity.productName}_`) && name.endsWith(spec.extension)) result.push(join(directory, name))
  }
  return result.filter(path => present(path))
}
const cachedExecutables = state => {
  const result = []
  for (const directory of [join(state.workspace, 'target/release/deps'), join(state.workspace, 'target/debug/deps'), join(state.workspace, 'target', state.identity.target, 'release/deps')]) {
    if (!present(directory)) continue
    safeParents(state.workspace, join(directory, 'entry'))
    for (const name of readdirSync(directory)) {
      if (!/^mark-[a-f0-9]+(?:\.exe)?$/.test(name)) continue
      const path = join(directory, name), info = lstatSync(path)
      if (info.isFile() && !info.isSymbolicLink() && info.size > 0) result.push(path)
    }
  }
  return result
}
export function prepareQa({ workspace, temporaryRoot, identity, actualHead = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: workspace, encoding: 'utf8' }).trim() }) {
  identity = qaIdentity(identity)
  if (actualHead !== identity.sourceSha) fail('checkout-source-mismatch')
  workspace = realpathSync(workspace)
  const directory = realpathSync(mkdtempSync(join(realpathSync(temporaryRoot), 'mark-qa-')))
  const state = { schema: 1, workspace, directory, identity, baseline: {}, owned: [], processes: [], events: [], cleanupErrors: [] }
  for (const name of ['evidence', 'handoff']) mkdirSync(join(directory, name))
  const config = { productName: identity.productName, identifier: identity.identifier, bundle: { createUpdaterArtifacts: false, targets: PLATFORMS[identity.platform].bundles } }
  state.configSha256 = hash(Buffer.from(JSON.stringify(config)))
  writeFileSync(join(directory, 'qa-config.json'), JSON.stringify(config), { flag: 'wx', mode: 0o600 })
  for (const path of candidateFiles(state)) {
    const info = lstatSync(path)
    if (info.isDirectory() || info.isSymbolicLink() || basename(path).startsWith(`${identity.productName}_`)) fail('existing-identity-output')
    state.baseline[path] = measuredFile(workspace, path).sha256
  }
  for (const path of cachedExecutables(state)) state.baseline[path] = measuredFile(workspace, path).sha256
  saveQaState(state)
  return state
}
export function saveQaState(state) {
  const bytes = JSON.stringify(state, null, 2) + '\n'
  // state.json is authoritative for the next cleanup process. Commit it last.
  writeFileSync(join(state.directory, 'evidence', 'lifecycle.json'), bytes, { mode: 0o600 })
  writeFileSync(join(state.directory, 'state.json'), bytes, { mode: 0o600 })
}
// Local proof cannot be reconstructed from JSON or a cleanup CLI flag.
const localSmokeProofs = new WeakMap()
function validateSmokeProtection(state) {
  const p = state.smoke?.cleanupProtection
  if (!p || p.version !== 1 || p.workspace !== state.workspace || p.directory !== state.directory || p.configSha256 !== state.configSha256 || JSON.stringify(p.identity) !== JSON.stringify(state.identity)) fail('smoke-protection-identity')
  if (state.identity.platform !== 'macos-arm64' || state.identity.mode !== 'dryrun') fail('smoke-protection-mode')
  if (measuredFile(state.directory, join(state.directory, 'qa-config.json')).sha256 !== p.configSha256) fail('smoke-protection-config')
  const installer = p.installer, mount = p.mount, process = p.process
  const parent = join(state.workspace, 'target', state.identity.target, 'release/bundle/dmg')
  if (!installer || dirname(installer.path || '') !== parent || !basename(installer.path).startsWith(`${state.identity.productName}_`) || !installer.path.endsWith('.dmg') || !/^[a-f0-9]{64}$/.test(installer.sha256 || '') || !Number.isSafeInteger(installer.size) || installer.size <= 0) fail('smoke-protection-installer')
  if (!mount || dirname(mount.path || '') !== state.directory || !/^mount-[A-Za-z0-9]+$/.test(basename(mount.path)) || !['not-attempted', 'active-or-unknown', 'verified-detached'].includes(mount.status)) fail('smoke-protection-mount')
  if (!process || !['not-launched', 'active-or-unknown', 'identity-uncertain', 'independently-stopped'].includes(process.status) || !Array.isArray(process.pids) || process.pids.some(pid => !Number.isSafeInteger(pid) || pid <= 0) || new Set(process.pids).size !== process.pids.length) fail('smoke-protection-process')
  if (typeof state.smoke.launchRequested !== 'boolean' || typeof state.smoke.processIdentityUncertain !== 'boolean' || state.smoke.mount !== mount.path || !Array.isArray(state.smoke.ownedPids) || JSON.stringify(process.pids) !== JSON.stringify(state.smoke.ownedPids) || (process.status === 'not-launched' && (state.smoke.launchRequested || process.pids.length !== 0)) || (process.status === 'independently-stopped' && (state.smoke.processStopped !== true || state.smoke.processIdentityUncertain))) fail('smoke-protection-proof')
  if (present(installer.path)) {
    const measured = measuredFile(state.workspace, installer.path)
    if (measured.sha256 !== installer.sha256 || measured.size !== installer.size) fail('smoke-protection-digest')
  }
  if (present(mount.path)) {
    safeParents(state.directory, mount.path)
    const info = lstatSync(mount.path)
    if (!info.isDirectory() || info.isSymbolicLink()) fail('smoke-protection-mount-link')
  }
  return p
}
function smokeCleanupPolicy(state, localProof, gateProof) {
  let protectedGate, freshGate = false
  try {
    protectedGate = gateProtected(state)
    freshGate = isGateStopProof(gateProof || localSmokeProofs.get(localProof)?.gateProof, state)
  } catch (error) { return { processSafe: false, mountSafe: false, error: `gate-protection:${error.message}:${state.directory}` } }
  if (protectedGate && !freshGate) return { processSafe: false, mountSafe: false, error: `gate-native-proof-required:${join(state.directory, 'native-launch')}` }
  if (state.smoke === undefined) return { processSafe: true, mountSafe: true }
  const local = localSmokeProofs.get(localProof)
  let p
  try {
    if (state.smoke?.cleanupProtection !== undefined) p = validateSmokeProtection(state)
    else if (!local || local.state !== state || !local.finished) fail('legacy-smoke-protection-missing')
  } catch (error) { return { processSafe: false, mountSafe: false, error: `${error.message}:${state.smoke?.mount || state.directory}` } }
  if (local && local.state === state && local.finished && local.identity === JSON.stringify(state.identity) && local.workspace === state.workspace && local.directory === state.directory && local.configSha256 === state.configSha256) {
    return { processSafe: local.processSafe, mountSafe: local.mountSafe, installer: p?.installer.path, mount: p?.mount.path }
  }
  return { processSafe: freshGate || (!state.smoke.processIdentityUncertain && ['not-launched', 'independently-stopped'].includes(p.process.status)), mountSafe: p.mount.status !== 'active-or-unknown', installer: p.installer.path, mount: p.mount.path }
}
export function beginSmokeCleanup(state, { gateProof } = {}) {
  const previous = smokeCleanupPolicy(state, undefined, gateProof)
  if (!previous.processSafe || (!previous.mountSafe && !isGateStopProof(gateProof, state)) || previous.error) fail(`smoke-restart-uncertain:${previous.error || previous.installer || state.directory}`)
  const token = {}, local = { state, identity: JSON.stringify(state.identity), workspace: state.workspace, directory: state.directory, configSha256: state.configSha256, finished: false, gateProof }
  localSmokeProofs.set(token, local)
  const sync = () => {
    const p = state.smoke?.cleanupProtection
    if (p) {
      p.process.pids = [...state.smoke.ownedPids]
      if (state.smoke.processIdentityUncertain) p.process.status = 'identity-uncertain'
    }
  }
  const saveTransition = change => {
    const old = structuredClone(state.smoke.cleanupProtection)
    change(state.smoke.cleanupProtection); sync()
    try { saveQaState(state) } catch (error) { state.smoke.cleanupProtection = old; throw error }
  }
  return {
    sync,
    armMount(installerPath, mountPath) {
      const file = measuredFile(state.workspace, installerPath)
      state.smoke.cleanupProtection = { version: 1, identity: structuredClone(state.identity), configSha256: state.configSha256, workspace: state.workspace, directory: state.directory,
        installer: { path: installerPath, sha256: file.sha256, size: file.size }, mount: { path: mountPath, status: 'active-or-unknown' }, process: { status: 'not-launched', pids: [...state.smoke.ownedPids] } }
      validateSmokeProtection(state); saveQaState(state)
    },
    detached() { saveTransition(p => { p.mount.status = 'verified-detached' }) },
    armProcess() { saveTransition(p => { if (p.process.status === 'identity-uncertain') fail('smoke-process-already-uncertain'); p.process.status = 'active-or-unknown' }) },
    finish({ mountStatus, processSafe, gateProof: completedGateProof }) {
      if (completedGateProof) local.gateProof = completedGateProof
      local.finished = true; local.mountSafe = mountStatus !== 'active-or-unknown'; local.processSafe = processSafe && !state.smoke.processIdentityUncertain
      if (state.smoke.cleanupProtection) saveTransition(p => {
        p.mount.status = mountStatus
        p.process.status = state.smoke.processIdentityUncertain ? 'identity-uncertain' : local.processSafe ? (state.smoke.launchRequested ? 'independently-stopped' : 'not-launched') : 'active-or-unknown'
      })
    },
    cleanup() { return cleanupGenerated(state, { localProof: token }) }
  }
}
export function loadQaState(path) {
  const state = JSON.parse(readFileSync(path, 'utf8'))
  if (state.schema !== 1 || realpathSync(dirname(path)) !== state.directory || realpathSync(state.workspace) !== state.workspace) fail('state-path')
  const identity = qaIdentity(state.identity)
  if (JSON.stringify(identity) !== JSON.stringify(state.identity)) fail('state-identity')
  if (measuredFile(state.directory, join(state.directory, 'qa-config.json')).sha256 !== state.configSha256) fail('config-digest-changed')
  if (state.smoke?.cleanupProtection !== undefined) validateSmokeProtection(state)
  if (gateProtected(state) && (!state.smoke?.launchGate || state.smoke.launchGate.version !== 1)) fail('gate-protection-state-missing')
  return state
}
export function recordBinary(state, path, reason = 'compiled-output') {
  const releaseRoots = [join(state.workspace, 'target/release'), join(state.workspace, 'target/debug'), join(state.workspace, 'target', state.identity.target, 'release')]
  const appExecutable = join(state.workspace, 'target', state.identity.target, 'release/bundle/macos', `${state.identity.productName}.app`, 'Contents/MacOS/mark')
  const projectExecutable = releaseRoots.some(root => path === join(root, PLATFORMS[state.identity.platform].executable) || (dirname(path) === join(root, 'deps') && /^mark-[a-f0-9]+(?:\.exe)?$/.test(basename(path))))
  if (!projectExecutable && !(state.identity.platform === 'macos-arm64' && path === appExecutable)) fail('unexpected-executable-path')
  const data = measuredFile(state.workspace, path)
  const old = state.owned.find(entry => entry.path === path)
  if (old) Object.assign(old, { sha256: data.sha256, size: data.size })
  else state.owned.push({ path, kind: 'executable', sha256: data.sha256, size: data.size, reason })
  saveQaState(state)
  return data
}
export function recordGenerated(state) {
  if (state.smoke?.cleanupProtection !== undefined) validateSmokeProtection(state)
  for (const path of candidateFiles(state)) {
    safeParents(state.workspace, path)
    const info = lstatSync(path)
    if (info.isSymbolicLink()) fail('linked-output')
    if (info.isDirectory()) {
      if (!path.endsWith(`${state.identity.productName}.app`)) fail('unexpected-directory')
      if (!state.owned.some(entry => entry.path === path)) state.owned.push({ path, kind: 'app', reason: 'unique-run-identity' })
      const executable = join(path, 'Contents/MacOS/mark')
      if (present(executable)) recordBinary(state, executable)
    } else if (info.isFile()) {
      const data = measuredFile(state.workspace, path)
      if (state.baseline[path] !== data.sha256 || state.owned.some(entry => entry.path === path)) {
        const old = state.owned.find(entry => entry.path === path)
        const entry = { path, kind: path.endsWith(PLATFORMS[state.identity.platform].extension) && basename(path).startsWith(`${state.identity.productName}_`) ? 'installer' : 'executable', size: data.size, sha256: data.sha256, reason: 'created-or-changed-output' }
        if (old) Object.assign(old, entry); else state.owned.push(entry)
      }
    }
  }
  if (state.rustCompilationAttempted) for (const path of cachedExecutables(state)) {
    if (dirname(path) !== join(state.workspace, 'target/debug/deps')) continue
    const data = measuredFile(state.workspace, path)
    if (state.baseline[path] !== data.sha256 && !state.owned.some(entry => entry.path === path)) state.owned.push({ path, kind: 'executable', sha256: data.sha256, size: data.size, reason: 'created-or-changed-rust-test-output' })
  }
  const digests = new Set(state.owned.filter(entry => entry.kind === 'executable').map(entry => entry.sha256))
  for (const path of cachedExecutables(state)) {
    const data = measuredFile(state.workspace, path)
    if (digests.has(data.sha256) && state.baseline[path] !== data.sha256 && !state.owned.some(entry => entry.path === path)) state.owned.push({ path, kind: 'executable', sha256: data.sha256, size: data.size, reason: 'created-or-changed-digest-identical-copy' })
  }
  saveQaState(state)
  return state
}
export function collectQaInstaller(state) {
  if (state.identity.mode !== 'manual-handoff' || !state.identity.testCase) fail('unfinished-test-required')
  const spec = PLATFORMS[state.identity.platform]
  const directory = join(state.workspace, 'target', state.identity.target, 'release/bundle', spec.folder)
  safeParents(state.workspace, join(directory, 'entry'))
  const matches = readdirSync(directory).filter(name => name.startsWith(`${state.identity.productName}_`) && name.endsWith(spec.extension))
  if (matches.length !== 1) fail('missing-or-ambiguous-installer')
  const name = matches[0]
  if (!/^[A-Za-z0-9][A-Za-z0-9 ._()+-]{0,240}\.(?:dmg|exe)$/.test(name)) fail('installer-name')
  const data = measuredFile(state.workspace, join(directory, name))
  const staging = join(state.directory, 'handoff')
  if (readdirSync(staging).length !== 0) fail('staging-not-empty')
  const manifest = { schema: 1, ...state.identity, configSha256: state.configSha256,
    installer: { filename: name, size: data.size, sha256: data.sha256 },
    retention: { testCase: state.identity.testCase, state: 'awaiting-requested-test', maximumDays: 1, deleteOnCompletionOrCancellation: true,
      authorization: 'A case ID is provenance only; prior explicit owner request and exact-candidate dispatch authorization must be recorded separately.', ownerAcceptanceInferred: false } }
  writeFileSync(join(staging, name), data.bytes, { flag: 'wx', mode: 0o600 })
  writeFileSync(join(staging, 'qa-manifest.json'), JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx', mode: 0o600 })
  writeFileSync(join(state.directory, 'evidence', 'qa-manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
  state.handoff = manifest
  saveQaState(state)
  return manifest
}
export function recordQaUpload(state, { id, digest }) {
  if (!state.handoff || !/^[1-9][0-9]*$/.test(String(id)) || !/^(?:sha256:)?[a-f0-9]{64}$/.test(digest || '')) fail('upload-identity')
  state.upload = { artifactId: String(id), zipSha256: digest.replace(/^sha256:/, ''), installerSha256: state.handoff.installer.sha256,
    purpose: 'Only the separately owner-requested active unfinished test; delete this exact ID when it finishes or is cancelled.' }
  saveQaState(state)
}
export function cleanupGenerated(state, { localProof } = {}) {
  state.generatedCleanupComplete = false
  const errors = []
  const protection = smokeCleanupPolicy(state, localProof)
  if (protection.error) errors.push(protection.error)
  if (!protection.processSafe) errors.push(`smoke-process-unknown:${state.smoke?.ownedPids?.join(',') || 'unrecorded'}:${state.smoke?.installedPath || state.directory}`)
  if (!protection.mountSafe) errors.push(`smoke-mount-unknown:${protection.mount || state.smoke?.mount || state.directory}:${protection.installer || state.owned.map(entry => entry.path).join(',')}`)
  try { recordGenerated(state) } catch (error) { errors.push(`discovery:${error.message}`) }
  for (const entry of [...state.owned].sort((a, b) => b.path.length - a.path.length)) {
    entry.deleted = false
    try {
      if (!protection.processSafe || (!protection.mountSafe && (!protection.installer || entry.path === protection.installer))) { errors.push(`protected:${entry.path}`); continue }
      if (!present(entry.path)) { entry.deleted = true; continue }
      if (!inside(join(state.workspace, 'target'), entry.path)) fail('unsafe-cleanup-path')
      safeParents(state.workspace, entry.path)
      if (lstatSync(entry.path).isSymbolicLink()) fail('linked-cleanup-path')
      if (entry.kind !== 'app' && measuredFile(state.workspace, entry.path).sha256 !== entry.sha256) fail('cleanup-digest-changed')
      rmSync(entry.path, { recursive: entry.kind === 'app' })
      if (present(entry.path)) fail('cleanup-path-remains')
      entry.deleted = true
    } catch (error) { errors.push(`${entry.path}:${error.message}`) }
  }
  const stage = join(state.directory, 'handoff')
  for (const name of protection.processSafe ? readdirSync(stage) : []) {
    const path = join(stage, name)
    try { rmSync(path) } catch (error) { errors.push(`${path}:${error.message}`) }
  }
  state.generatedCleanupComplete = errors.length === 0
  state.cleanupErrors.push(...errors)
  try { saveQaState(state) } catch (error) {
    state.generatedCleanupComplete = false
    const message = `evidence:${error.message}`
    errors.push(message); state.cleanupErrors.push(message)
  }
  if (errors.length) fail(`cleanup:${errors.join(';')}`)
  return state
}
export function qaCli(args = process.argv.slice(2), environment = process.env) {
  const command = args[0], stateIndex = args.indexOf('--state')
  if (command === 'prepare') {
    const state = prepareQa({ workspace: environment.GITHUB_WORKSPACE || process.cwd(), temporaryRoot: environment.RUNNER_TEMP,
      identity: { sourceSha: environment.QA_SOURCE_SHA, candidateSha: environment.QA_CANDIDATE_SHA || environment.QA_SOURCE_SHA,
        runId: environment.QA_RUN_ID, attempt: environment.QA_RUN_ATTEMPT, platform: environment.QA_PLATFORM,
        mode: environment.QA_MODE, testCase: environment.QA_TEST_CASE || '', actor: environment.GITHUB_ACTOR || '' } })
    const outputs = { state: join(state.directory, 'state.json'), config: join(state.directory, 'qa-config.json'), evidence: join(state.directory, 'evidence'), handoff: join(state.directory, 'handoff'), artifact_name: state.identity.artifactName }
    if (!environment.GITHUB_OUTPUT) fail('output-file-required')
    for (const [key, value] of Object.entries(outputs)) writeFileSync(environment.GITHUB_OUTPUT, `${key}=${value}\n`, { flag: 'a' })
    return outputs
  }
  if (stateIndex < 0 || !args[stateIndex + 1]) fail('state-required')
  const state = loadQaState(args[stateIndex + 1])
  if (command === 'record') return recordGenerated(state)
  if (command === 'collect') return collectQaInstaller(state)
  if (command === 'upload-receipt') return recordQaUpload(state, { id: environment.QA_UPLOAD_ID, digest: environment.QA_UPLOAD_DIGEST })
  if (command === 'cleanup') return cleanupGenerated(state)
  fail('unknown-command')
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { qaCli() } catch (error) { console.error(error.message); process.exitCode = 1 }
}
