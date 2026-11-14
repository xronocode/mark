#!/usr/bin/env node
// FILE: tools/build-test-artifact.mjs
// VERSION: 1.1.0
// START_MODULE_CONTRACT
//   PURPOSE: Build isolated unsigned QA artifacts with a prepared lockfile-matched local CLI; record artifact evidence without implying owner acceptance.
//   SCOPE: Existing --item/--platform/--smoke/--dry-run recipe; reject invalid local tools before configuration, build or registry writes; minimize the build child's environment.
//   DEPENDS: Node built-ins; repository manifest/lock; prepared local @tauri-apps/cli; existing native toolchain and acceptance registry.
//   LINKS: M-046; V-M-046; C-QA-LOCAL-TAURI-TOOL; docs/acceptance/README.md.
//   ROLE: SCRIPT
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
// START_MODULE_MAP
//   ROOT - Repository directory derived from this script.
//   BUILD_ENVIRONMENT_NAMES - Exact unsigned-build runtime and toolchain allowlist.
//   failTool - Throw a stable path-free prepared-tool failure.
//   readMetadata - Read a JSON object without exposing its body or filesystem errors.
//   releaseVersion - Parse a supported canonical stable version.
//   satisfiesDeclaration - Check exact, caret or tilde bounds without loading package code.
//   relativeEntry - Normalize a safe relative JavaScript bin entry.
//   inside - Test real path containment.
//   resolvePreparedTauri - Validate manifest/lock/installed identity and contained regular bin entry.
//   buildEnvironment - Copy only allowlisted environment names with Windows alias handling.
//   runBuilder - Preserve the isolated artifact, cleanup, smoke and registry recipe.
//   isDirectInvocation - Recognize direct CLI entry without failing imports from stdin or tooling.
// END_MODULE_MAP
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.1.0 - 2026-11-12 C-QA-LOCAL-TAURI-TOOL: validate prepared local tooling, invoke Node directly and minimize child environment.
// END_CHANGE_SUMMARY

import { readFileSync, writeFileSync, mkdtempSync, rmSync, realpathSync, statSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { resolve, dirname, join, relative, isAbsolute } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
export const BUILD_ENVIRONMENT_NAMES = Object.freeze([
  'PATH', 'HOME', 'USERPROFILE', 'USER', 'LOGNAME', 'TMPDIR', 'TMP', 'TEMP',
  'LANG', 'LC_ALL', 'LC_CTYPE', 'SystemRoot', 'WINDIR', 'COMSPEC', 'PATHEXT',
  'SystemDrive', 'LOCALAPPDATA', 'APPDATA', 'CARGO_HOME', 'RUSTUP_HOME',
  'RUSTUP_TOOLCHAIN', 'DEVELOPER_DIR', 'SDKROOT', 'MACOSX_DEPLOYMENT_TARGET',
  'CC', 'CXX', 'AR', 'CFLAGS', 'CXXFLAGS', 'CPPFLAGS', 'LDFLAGS', 'LIB',
  'INCLUDE', 'LIBPATH', 'WindowsSdkDir', 'WindowsSDKVersion',
  'UniversalCRTSdkDir', 'UCRTVersion', 'VCToolsInstallDir', 'VCINSTALLDIR', 'VSINSTALLDIR'
])

function failTool(reason) {
  const error = new Error(`MT_QA_LOCAL_TOOL_INVALID:${reason}`)
  error.code = 'MT_QA_LOCAL_TOOL_INVALID'
  throw error
}

function readMetadata(path, category) {
  try {
    const value = JSON.parse(readFileSync(path, 'utf8'))
    if (!value || typeof value !== 'object' || Array.isArray(value)) failTool(category)
    return value
  } catch {
    failTool(category)
  }
}

function releaseVersion(value) {
  if (typeof value !== 'string' || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value)) return null
  const parts = value.split('.').map(Number)
  return parts.every(Number.isSafeInteger) ? parts : null
}

function satisfiesDeclaration(version, declaration) {
  if (typeof declaration !== 'string') return false
  const prefix = declaration[0] === '^' || declaration[0] === '~' ? declaration[0] : ''
  const lower = releaseVersion(prefix ? declaration.slice(1) : declaration)
  const actual = releaseVersion(version)
  if (!lower || !actual) return false
  const compare = (a, b) => {
    for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1
    return 0
  }
  if (!prefix) return compare(actual, lower) === 0
  if (compare(actual, lower) < 0) return false
  const upper = prefix === '~'
    ? [lower[0], lower[1] + 1, 0]
    : lower[0] > 0 ? [lower[0] + 1, 0, 0]
      : lower[1] > 0 ? [0, lower[1] + 1, 0] : [0, 0, lower[2] + 1]
  return compare(actual, upper) < 0
}

function relativeEntry(value) {
  if (typeof value !== 'string' || value.includes('\0') || value.includes(':') || /^[\\/]/.test(value)) failTool('entry-path')
  const parts = value.replaceAll('\\', '/').split('/')
  if (parts.includes('..')) failTool('entry-path')
  const entry = parts.filter(part => part && part !== '.').join('/')
  if (!entry || !/\.(?:c|m)?js$/.test(entry)) failTool('entry-path')
  return entry
}

function inside(parent, path) {
  const rel = relative(parent, path)
  return rel !== '' && rel !== '..' && !rel.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) && !isAbsolute(rel)
}

export function resolvePreparedTauri(root = ROOT, { realpath = realpathSync, stat = statSync } = {}) {
  const manifest = readMetadata(join(root, 'package.json'), 'manifest')
  const lock = readMetadata(join(root, 'package-lock.json'), 'lock')
  const declaration = manifest.devDependencies?.['@tauri-apps/cli'] ?? manifest.dependencies?.['@tauri-apps/cli']
  const lockRoot = lock.packages?.['']
  const lockedDeclaration = lockRoot?.devDependencies?.['@tauri-apps/cli'] ?? lockRoot?.dependencies?.['@tauri-apps/cli']
  const locked = lock.packages?.['node_modules/@tauri-apps/cli']
  if (lock.lockfileVersion !== 3 || !declaration || declaration !== lockedDeclaration || !locked ||
      !satisfiesDeclaration(locked.version, declaration)) failTool('lock-coherence')
  for (const metadata of [manifest, lockRoot]) {
    const dev = metadata.devDependencies?.['@tauri-apps/cli']
    const prod = metadata.dependencies?.['@tauri-apps/cli']
    if (dev !== undefined && prod !== undefined && dev !== prod) failTool('lock-coherence')
  }
  if (typeof locked.integrity !== 'string' || !/^sha512-[A-Za-z0-9+/]{86}==$/.test(locked.integrity) ||
      Buffer.from(locked.integrity.slice(7), 'base64').toString('base64') !== locked.integrity.slice(7)) failTool('lock-integrity')
  const installedPath = join(root, 'node_modules/@tauri-apps/cli')
  const installed = readMetadata(join(installedPath, 'package.json'), 'installed')
  if (installed.name !== '@tauri-apps/cli' || installed.version !== locked.version) failTool('installed-identity')
  const entry = relativeEntry(installed.bin?.tauri)
  if (entry !== relativeEntry(locked.bin?.tauri)) failTool('entry-mismatch')
  let realEntry
  try {
    const modules = realpath(join(root, 'node_modules'))
    const packageDir = realpath(installedPath)
    if (!inside(modules, packageDir) || !stat(packageDir).isDirectory()) failTool('package-containment')
    realEntry = realpath(join(packageDir, entry))
    if (!inside(packageDir, realEntry) || !stat(realEntry).isFile()) failTool('entry-containment')
  } catch (error) {
    if (error.code === 'MT_QA_LOCAL_TOOL_INVALID') throw error
    failTool('entry-unavailable')
  }
  return { entry: realEntry, version: locked.version, integrity: locked.integrity }
}

export function buildEnvironment(environment = process.env, platform = process.platform) {
  const result = {}
  const keys = Object.keys(environment).sort()
  for (const name of BUILD_ENVIRONMENT_NAMES) {
    const key = Object.hasOwn(environment, name) ? name
      : platform === 'win32' ? keys.find(candidate => candidate.toLowerCase() === name.toLowerCase()) : undefined
    if (key !== undefined && typeof environment[key] === 'string') result[name] = environment[key]
  }
  return result
}

export function runBuilder({ root = ROOT, args = process.argv.slice(2), environment = process.env,
  hostPlatform = process.platform, execute = execFileSync, log = console.log } = {}) {
  const get = name => { const i = args.indexOf(name); return i > -1 ? args[i + 1] : undefined }
  const item = get('--item')
  const platform = get('--platform') ?? 'macos'
  const dryRun = args.includes('--dry-run')
  const smoke = args.includes('--smoke')
  if (!item) {
    log(`Usage:
  node tools/build-test-artifact.mjs --item FIX-009 [--platform macos|windows] [--smoke] [--dry-run]

Builds an isolated Mark Test artifact from the CURRENT worktree head:
  - identity: Mark Test <ITEM> / com.xronocode.mark.test.<item-slug>.<short-sha>
  - updater artifacts off, debug bundle (macos: .app, windows: nsis)
  - binary SHA-256 recorded; --smoke launches and quits (macos)
  - appends the artifact to docs/acceptance/registry.json (skipped with --dry-run)`)
    return
  }
  const sha = execute('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim()
  const short = sha.slice(0, 7)
  const slug = item.toLowerCase().replace(/[^a-z0-9]+/g, '')
  const productName = `Mark Test ${item}`
  const identifier = `com.xronocode.mark.test.${slug}.${short}`
  const merge = { productName, identifier, bundle: {
    createUpdaterArtifacts: false, targets: platform === 'macos' ? ['app'] : ['nsis']
  } }
  log('[build-test-artifact] source:', sha)
  log('[build-test-artifact] identity:', identifier)
  log('[build-test-artifact] merge config:', JSON.stringify(merge))
  if (dryRun) {
    log('[build-test-artifact] dry run — nothing built, nothing recorded')
    return
  }
  const tool = resolvePreparedTauri(root)
  log(`[build-test-artifact][BLOCK_QA_LOCAL_TOOL_VALIDATED] version=${tool.version}`)
  const tmp = mkdtempSync(join(tmpdir(), 'mark-test-conf-'))
  const confPath = join(tmp, 'tauri.test.conf.json')
  try {
    writeFileSync(confPath, JSON.stringify(merge))
    execute(process.execPath, [tool.entry, 'build', '--debug', '--config', confPath], {
      cwd: root, stdio: 'inherit', env: buildEnvironment(environment, hostPlatform)
    })
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
  const bundleDir = platform === 'macos'
    ? join(root, 'target/debug/bundle/macos', `${productName}.app`)
    : join(root, 'target/debug/bundle/nsis')
  const binary = platform === 'macos' ? join(bundleDir, 'Contents/MacOS/mark') : null
  if (!binary) {
    log('[build-test-artifact] windows: inspect', bundleDir, 'and record the digest manually')
    return
  }
  const digest = createHash('sha256').update(readFileSync(binary)).digest('hex')
  if (smoke) {
    execute('open', [bundleDir])
    const pid = parseInt(execute('pgrep', ['-f', productName], { encoding: 'utf8' }).split('\n')[0], 10)
    execute('sleep', ['5'])
    process.kill(pid, 'SIGTERM')
  }
  const registryPath = join(root, 'docs/acceptance/registry.json')
  const registry = JSON.parse(readFileSync(registryPath, 'utf8'))
  registry.artifacts.push({
    id: `mark-test-${slug}-${short}`,
    source: { sha, branch: execute('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim() },
    platform: platform === 'macos' ? 'macos-arm64-debug' : 'windows-x64-debug-nsis',
    bundleIdentity: identifier, productName, binarySha256: digest,
    productVersion: JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version,
    builtAt: new Date().toISOString().slice(0, 10), builtBy: 'tools/build-test-artifact.mjs',
    covers: [item], location: `target/debug/bundle/${platform === 'macos' ? 'macos' : 'nsis'} (repo build dir; rebuild via the builder)`,
    ...(smoke ? { smoke: 'launch + 5s alive + clean quit' } : {})
  })
  registry.lastSynced = new Date().toISOString().slice(0, 10)
  writeFileSync(registryPath, `${JSON.stringify(registry, null, 2)}\n`)
  log(`[build-test-artifact] recorded mark-test-${slug}-${short} sha256=${digest}`)
}

function isDirectInvocation() {
  if (!process.argv[1] || process.argv[1] === '-') return false
  try {
    return realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url))
  } catch {
    return false
  }
}

if (isDirectInvocation()) {
  try { runBuilder() } catch (error) {
    console.error('[build-test-artifact] failed:', error.code === 'MT_QA_LOCAL_TOOL_INVALID' ? error.message : 'MT_QA_BUILD_FAILED')
    process.exitCode = 1
  }
}
