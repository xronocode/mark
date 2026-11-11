// FILE: tools/check-quicklook.mjs
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Compile and run the actual QuickLook provider in an isolated, explicitly identified native fixture.
//   SCOPE: Owned artifacts/loopback observer, complete native results, source binding and bounded child cleanup; no installation or release.
//   DEPENDS: Node built-ins, existing Xcode Swift compiler, Cocoa/QuickLookUI/WebKit.
//   LINKS: M-073; V-M-073; C-QUICKLOOK-CONTENT-BOUNDARY.
//   ROLE: SCRIPT
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
// START_MODULE_MAP
//   REQUIRED_QUICKLOOK_CASES - Complete native case IDs; omissions cannot pass.
//   RESOURCE_FILES - Existing packaged resources copied unchanged.
//   QuickLookCheckError - Stable fail-closed runner error.
//   digest - SHA-256 of source or artifact bytes.
//   sourceSnapshot - Bound regular source/resource files before and after execution.
//   terminateOwnedGroup - Kill a tracked detached group even after its direct child exits.
//   executeChild - Bounded owned process execution without a shell.
//   validateNativeResult - Reject failed, incomplete or network-active native results.
//   createFixtureBundle - Build an independently identified fixture layout without registration.
//   runQuickLookChecks - Compile, observe and validate the native matrix with unconditional cleanup.
//   main - Emit a success marker only after complete native proof.
// END_MODULE_MAP
// START_CHANGE_SUMMARY
//   LAST_CHANGE: 2026-11-12 C-QUICKLOOK-CONTENT-BOUNDARY: source-bound actual-provider native verification.
// END_CHANGE_SUMMARY

import { createHash } from 'node:crypto'
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { promises as fs } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { release } from 'node:os'

export const REQUIRED_QUICKLOOK_CASES = Object.freeze([
  'markdown', 'highlight', 'unicode-title', 'embedded-raster',
  'raw-event-handler', 'raw-script', 'script-terminator', 'mixed-case-terminator',
  'svg-handler', 'iframe-srcdoc', 'object-embed', 'form', 'javascript-link',
  'data-svg', 'remote-image', 'fetch-beacon', 'external-navigation', 'new-window',
  'subframe', 'initial-load', 'missing-file', 'resource-integrity',
  'file-resource-policy', 'repeat-preview'
])
const RESOURCE_FILES = ['style.css', 'github-dark.css', 'markdown-it.min.js', 'highlight.min.js']

class QuickLookCheckError extends Error {
  constructor(code) { super(code); this.code = code }
}
const digest = bytes => createHash('sha256').update(bytes).digest('hex')

async function sourceSnapshot(root) {
  const paths = [
    'mark-quicklook/Sources/Shared/MarkdownRenderer.swift',
    'mark-quicklook/Sources/PreviewExtension/PreviewProvider.swift',
    'mark-quicklook/Sources/PreviewExtension/MarkPreview.entitlements',
    'tests/quicklook/PreviewBoundaryTests.swift', 'tools/check-quicklook.mjs',
    ...RESOURCE_FILES.map(name => `mark-quicklook/Sources/PreviewExtension/Resources/${name}`)
  ]
  return Promise.all(paths.map(async path => {
    const source = join(root, path)
    const stat = await fs.lstat(source)
    if (!stat.isFile() || stat.size > 1_048_576) throw new QuickLookCheckError('QL_SOURCE_INVALID')
    const bytes = await fs.readFile(source)
    if (bytes.length !== stat.size) throw new QuickLookCheckError('QL_SOURCE_CHANGED')
    return { path, bytes: bytes.length, sha256: digest(bytes) }
  }))
}

function terminateOwnedGroup(child) {
  // A descendant can retain inherited pipes after the group leader exits.
  if (child.pid) { try { process.kill(-child.pid, 'SIGKILL') } catch {} }
}

export function executeChild(command, args, options) {
  return new Promise((resolveResult, reject) => {
    const env = {}
    // Preserve required toolchain/system values without passing signing or API credentials.
    for (const name of ['PATH', 'HOME', 'TMPDIR', 'DEVELOPER_DIR', 'SDKROOT', 'LANG', 'LC_ALL', 'LC_CTYPE', '__CF_USER_TEXT_ENCODING']) {
      if (process.env[name] !== undefined) env[name] = process.env[name]
    }
    const child = (options.spawnImpl ?? spawn)(command, args, { cwd: options.cwd, env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] })
    options.children.add(child)
    let stdout = ''
    let stderr = ''
    let bytes = 0
    let failure = null
    const stop = code => {
      failure ||= new QuickLookCheckError(code)
      terminateOwnedGroup(child)
    }
    const timer = setTimeout(() => stop('QL_DEADLINE'), options.timeoutMs)
    const append = (chunk, channel) => {
      bytes += chunk.length
      if (bytes > 1_048_576) { stop('QL_OUTPUT_TOO_LARGE'); return }
      if (channel === 'out') stdout += chunk.toString('utf8')
      else stderr += chunk.toString('utf8')
    }
    child.stdout.on('data', chunk => append(chunk, 'out'))
    child.stderr.on('data', chunk => append(chunk, 'err'))
    child.once('error', () => {
      clearTimeout(timer)
      options.children.delete(child)
      reject(new QuickLookCheckError('QL_TOOL_UNAVAILABLE'))
    })
    child.once('close', code => {
      clearTimeout(timer)
      options.children.delete(child)
      if (failure) reject(failure)
      else resolveResult({ code, stdout, stderr })
    })
  })
}

export function validateNativeResult(result, networkRequests = 0) {
  if (!result || !Array.isArray(result.cases) || result.cases.length !== REQUIRED_QUICKLOOK_CASES.length) {
    throw new QuickLookCheckError('QL_CASE_SET_INCOMPLETE')
  }
  const ids = result.cases.map(row => row?.id)
  if (new Set(ids).size !== ids.length || REQUIRED_QUICKLOOK_CASES.some(id => !ids.includes(id))) {
    throw new QuickLookCheckError('QL_CASE_SET_INCOMPLETE')
  }
  if (result.cases.some(row => row.passed !== true)) throw new QuickLookCheckError('QL_NATIVE_CASE_FAILED')
  if (networkRequests !== 0) throw new QuickLookCheckError('QL_NETWORK_REQUESTS')
  return result.cases.length
}

async function createFixtureBundle(root, directory) {
  const bundle = join(directory, 'Fixture.app', 'Contents')
  await fs.mkdir(join(bundle, 'MacOS'), { recursive: true })
  await fs.mkdir(join(bundle, 'Resources'), { recursive: true })
  for (const name of RESOURCE_FILES) {
    await fs.copyFile(join(root, 'mark-quicklook/Sources/PreviewExtension/Resources', name), join(bundle, 'Resources', name))
  }
  await fs.writeFile(join(bundle, 'Info.plist'), `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleExecutable</key><string>Fixture</string>
<key>CFBundleIdentifier</key><string>com.xronocode.mark.quicklook.fixture</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>NSPrincipalClass</key><string>NSApplication</string>
<key>LSUIElement</key><true/>
<key>NSAppTransportSecurity</key><dict><key>NSAllowsLocalNetworking</key><true/></dict>
</dict></plist>
`)
  return join(bundle, 'MacOS', 'Fixture')
}

export async function runQuickLookChecks(options = {}) {
  const root = options.root ?? resolve(dirname(fileURLToPath(import.meta.url)), '..')
  if ((options.platform ?? process.platform) !== 'darwin') throw new QuickLookCheckError('QL_HOST_UNSUPPORTED')
  const architecture = options.architecture ?? process.arch
  if (!['arm64', 'x64'].includes(architecture)) throw new QuickLookCheckError('QL_ARCH_UNSUPPORTED')
  const timeoutMs = options.timeoutMs ?? 110_000
  const started = Date.now()
  const execute = options.execute ?? executeChild
  const children = new Set()
  const base = options.outputRoot ?? join(root, '.claude', 'quicklook-content-boundary')
  let directory
  const requests = []
  let requestCount = 0
  const server = (options.createObserver ?? createServer)((request, response) => {
    requestCount += 1
    if (requests.length < 256) requests.push({ method: request.method, path: request.url })
    request.resume()
    response.writeHead(200, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' })
    response.end('owned fixture observer')
  })
  let deadlineTimer
  const receipt = { status: 'failed', platform: 'darwin', architecture, osRelease: release(),
    bundleIdentifier: 'com.xronocode.mark.quicklook.fixture', sources: [], cases: [], networkRequests: 0 }
  let failure
  let observerError
  let closing
  const deadline = new Promise((_, reject) => {
    deadlineTimer = setTimeout(() => reject(new QuickLookCheckError('QL_DEADLINE')), Math.max(1, timeoutMs - (Date.now() - started)))
  })
  // Setup may exhaust the budget before the first child attaches its race.
  deadline.catch(() => {})
  const observerFailure = new Promise((_, reject) => {
    server.on('error', () => {
      observerError = new QuickLookCheckError('QL_OBSERVER_FAILED')
      reject(observerError)
    })
  })
  observerFailure.catch(() => {})
  const bounded = operation => Promise.race([operation, deadline, observerFailure])
  const closeObserver = () => {
    if (!closing) {
      server.closeAllConnections()
      closing = new Promise(accept => server.close(() => accept()))
    }
    return closing
  }
  const run = async (command, args) => {
    const remaining = timeoutMs - (Date.now() - started)
    if (remaining <= 0) throw new QuickLookCheckError('QL_DEADLINE')
    return bounded(execute(command, args, { cwd: root, timeoutMs: remaining, children }))
  }
  try {
    const sources = await bounded(sourceSnapshot(root))
    receipt.sources = sources
    await bounded(fs.mkdir(base, { recursive: true }))
    if (!(await bounded(fs.lstat(base))).isDirectory()) throw new QuickLookCheckError('QL_OUTPUT_INVALID')
    directory = await bounded(fs.mkdtemp(join(base, 'run-')))
    await bounded(new Promise(accept => {
      server.listen(0, '127.0.0.1', accept)
    }))
    const observer = `http://127.0.0.1:${server.address().port}`
    const revision = await run('git', ['rev-parse', '--verify', 'HEAD'])
    if (revision.code !== 0 || !/^[a-f0-9]{40}$/.test(revision.stdout.trim())) throw new QuickLookCheckError('QL_REVISION_INVALID')
    receipt.revision = revision.stdout.trim()
    const binary = await bounded(createFixtureBundle(root, directory))
    const resourceSnapshot = async () => Promise.all(RESOURCE_FILES.map(async name => ({
      name, sha256: digest(await fs.readFile(join(binary, '..', '..', 'Resources', name)))
    })))
    receipt.bundledResources = await bounded(resourceSnapshot())
    for (const row of receipt.bundledResources) {
      if (row.sha256 !== sources.find(source => source.path.endsWith('/Resources/' + row.name))?.sha256) {
        throw new QuickLookCheckError('QL_BUNDLED_RESOURCE_CHANGED')
      }
    }
    const fixtures = join(directory, 'documents')
    await bounded(fs.mkdir(fixtures))
    const target = `${architecture === 'x64' ? 'x86_64' : 'arm64'}-apple-macos12.0`
    const compilation = await run('xcrun', ['swiftc', '-swift-version', '5', '-parse-as-library',
      '-target', target, '-module-cache-path', join(directory, 'module-cache'),
      '-framework', 'Cocoa', '-framework', 'QuickLookUI', '-framework', 'WebKit',
      join(root, 'mark-quicklook/Sources/Shared/MarkdownRenderer.swift'),
      join(root, 'mark-quicklook/Sources/PreviewExtension/PreviewProvider.swift'),
      join(root, 'tests/quicklook/PreviewBoundaryTests.swift'), '-o', binary])
    await bounded(fs.writeFile(join(directory, 'compiler.log'), compilation.stderr + compilation.stdout))
    if (compilation.code !== 0) throw new QuickLookCheckError('QL_COMPILE_FAILED')
    const binaryInfo = await bounded(fs.lstat(binary).catch(() => null))
    if (!binaryInfo?.isFile()) throw new QuickLookCheckError('QL_BINARY_MISSING')
    receipt.binarySha256 = digest(await bounded(fs.readFile(binary)))
    const css = await bounded(fs.readFile(join(root, 'mark-quicklook/Sources/PreviewExtension/Resources/style.css'), 'utf8'))
    const native = await run(binary, [fixtures, observer, String(css.replace(/\r\n?/g, '\n').length)])
    await bounded(fs.writeFile(join(directory, 'native.log'), native.stderr))
    let result
    try { result = JSON.parse(native.stdout.trim()) } catch { throw new QuickLookCheckError('QL_NATIVE_PROTOCOL_INVALID') }
    receipt.cases = result.cases
    receipt.nativeExitCode = native.code
    await bounded(fs.writeFile(join(directory, 'native-results.json'), JSON.stringify(result, null, 2) + '\n'))
    validateNativeResult(result, requestCount)
    if (native.code !== 0) throw new QuickLookCheckError('QL_NATIVE_PROCESS_FAILED')
    if (JSON.stringify(sources) !== JSON.stringify(await bounded(sourceSnapshot(root)))) throw new QuickLookCheckError('QL_SOURCE_CHANGED')
    if (JSON.stringify(receipt.bundledResources) !== JSON.stringify(await bounded(resourceSnapshot()))) throw new QuickLookCheckError('QL_BUNDLED_RESOURCE_CHANGED')
    // Seal observation before constructing success; traffic during integrity reads still fails.
    await bounded(closeObserver())
    validateNativeResult(result, requestCount)
  } catch (error) {
    failure = error
  } finally {
    for (const child of children) terminateOwnedGroup(child)
    // Start cleanup even if the shared deadline has already rejected.
    try { await Promise.race([closeObserver(), deadline]) } catch (error) { failure ||= error }
    failure ||= observerError
    if (Date.now() - started >= timeoutMs) failure ||= new QuickLookCheckError('QL_DEADLINE')
    receipt.networkRequests = requestCount
    receipt.status = failure ? 'failed' : 'passed'
    if (failure) receipt.error = failure.code ?? 'QL_RUNNER_FAILED'
    if (directory) {
      const persist = async () => {
        await fs.writeFile(join(directory, 'observer.json'), JSON.stringify({ count: requestCount, requests }, null, 2) + '\n')
        await fs.writeFile(join(directory, 'receipt.json'), JSON.stringify(receipt, null, 2) + '\n')
      }
      const persistence = persist()
      try { await Promise.race(failure ? [persistence, deadline] : [persistence, deadline, observerFailure]) } catch (error) {
        failure ||= error
        receipt.status = 'failed'
        receipt.error = failure.code ?? 'QL_RUNNER_FAILED'
        // Serialize any failed rewrite after the in-flight write; it cannot restore a passed receipt.
        persistence.then(() => fs.writeFile(join(directory, 'receipt.json'), JSON.stringify(receipt, null, 2) + '\n')).catch(() => {})
      }
    }
    if (Date.now() - started >= timeoutMs && !failure) {
      failure = new QuickLookCheckError('QL_DEADLINE')
      receipt.status = 'failed'
      receipt.error = failure.code
      if (directory) fs.writeFile(join(directory, 'receipt.json'), JSON.stringify(receipt, null, 2) + '\n').catch(() => {})
    }
    clearTimeout(deadlineTimer)
  }
  if (failure) { failure.receiptDirectory = directory; throw failure }
  return { ...receipt, directory }
}

async function main() {
  try {
    if (process.argv.length !== 2) throw new QuickLookCheckError('QL_USAGE_INVALID')
    const result = await runQuickLookChecks()
    console.info(`[QuickLook][verify][BLOCK_QUICKLOOK_BOUNDARY_CONFIRMED] cases=${result.cases.length} network=${result.networkRequests}`)
    console.info(`Receipt: ${result.directory}`)
  } catch (error) {
    console.error(`[QuickLook][verify][BLOCK_QUICKLOOK_BOUNDARY_REJECTED] code=${error.code ?? 'QL_RUNNER_FAILED'}`)
    if (error.receiptDirectory) console.error(`Receipt: ${error.receiptDirectory}`)
    process.exitCode = 1
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main()
