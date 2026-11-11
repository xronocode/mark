// FILE: tests/renderer/quicklook-runner.test.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Prove QuickLook orchestration refuses missing, failed or unbounded evidence.
//   SCOPE: Temporary source trees and injected host/process results; these doubles are not native boundary proof.
//   DEPENDS: Vitest, Node built-ins, tools/check-quicklook.mjs.
//   LINKS: M-073; V-M-073; C-QUICKLOOK-CONTENT-BOUNDARY.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
// START_MODULE_MAP
//   owned - Temporary roots removed after every orchestration test.
//   fixture - Minimal isolated runner inputs and deterministic child adapter.
//   nativeResult - Complete positive result protocol for orchestration tests only.
// END_MODULE_MAP
// START_CHANGE_SUMMARY
//   LAST_CHANGE: 2026-11-12 C-QUICKLOOK-CONTENT-BOUNDARY: fail-closed runner regression matrix.
// END_CHANGE_SUMMARY

import { afterEach, describe, expect, it, vi } from 'vitest'
import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'node:http'
import { EventEmitter } from 'node:events'
import { REQUIRED_QUICKLOOK_CASES, executeChild, runQuickLookChecks, validateNativeResult } from '../../tools/check-quicklook.mjs'

const owned = []
afterEach(async () => {
  await Promise.all(owned.splice(0).map(path => fs.rm(path, { recursive: true, force: true })))
})
const nativeResult = () => ({ cases: REQUIRED_QUICKLOOK_CASES.map(id => ({ id, passed: true })) })
async function fixture(native = async () => ({ code: 0, stdout: JSON.stringify(nativeResult()), stderr: '' })) {
  const root = await fs.mkdtemp(join(tmpdir(), 'mark-quicklook-runner-'))
  owned.push(root)
  const paths = [
    'mark-quicklook/Sources/Shared/MarkdownRenderer.swift',
    'mark-quicklook/Sources/PreviewExtension/PreviewProvider.swift',
    'mark-quicklook/Sources/PreviewExtension/MarkPreview.entitlements',
    'tests/quicklook/PreviewBoundaryTests.swift', 'tools/check-quicklook.mjs',
    ...['style.css', 'github-dark.css', 'markdown-it.min.js', 'highlight.min.js']
      .map(name => `mark-quicklook/Sources/PreviewExtension/Resources/${name}`)
  ]
  for (const path of paths) {
    await fs.mkdir(join(root, path, '..'), { recursive: true })
    await fs.writeFile(join(root, path), 'fixture-only')
  }
  const execute = vi.fn(async (command, args, options) => {
    if (command === 'git') return { code: 0, stdout: 'a'.repeat(40), stderr: '' }
    if (command === 'xcrun') {
      await fs.writeFile(args.at(-1), 'fixture-binary')
      return { code: 0, stdout: '', stderr: '' }
    }
    return native(command, args, options, root)
  })
  return { root, platform: 'darwin', architecture: 'arm64', execute }
}

describe('QuickLook native evidence protocol', () => {
  it('requires every expected case exactly once and an independent zero request count', () => {
    expect(validateNativeResult(nativeResult())).toBe(24)
    expect(() => validateNativeResult(nativeResult(), 1)).toThrow('QL_NETWORK_REQUESTS')
  })
  it.each([null, {}, { cases: [] }, { cases: nativeResult().cases.slice(1) },
    { cases: [...nativeResult().cases.slice(1), { id: 'highlight', passed: true }] },
    { cases: nativeResult().cases.map((row, i) => i ? row : { id: 'unknown', passed: true }) }
  ])('rejects malformed, omitted, duplicate or unknown cases %#', result => {
    expect(() => validateNativeResult(result)).toThrow('QL_CASE_SET_INCOMPLETE')
  })
  it.each([false, undefined, 'true', 1])('requires a literal successful result (%s)', passed => {
    const result = nativeResult()
    result.cases[0].passed = passed
    expect(() => validateNativeResult(result)).toThrow('QL_NATIVE_CASE_FAILED')
  })
})

describe('QuickLook fail-closed orchestration', () => {
  it('terminates its owned descendants when the direct child exits before closing inherited pipes', async () => {
    // Inject the same parent-exited/close-pending state on every unit host;
    // a separate real-process macOS probe covers the actual detached group.
    const children = new Set()
    const child = Object.assign(new EventEmitter(), {
      pid: 12345, exitCode: 0, stdout: new EventEmitter(), stderr: new EventEmitter()
    })
    const kill = vi.spyOn(process, 'kill').mockImplementation((pid, signal) => {
      expect(pid).toBe(-12345)
      expect(signal).toBe('SIGKILL')
      child.emit('close', 0)
      return true
    })
    const execution = executeChild('fixture-only', [], {
      cwd: process.cwd(), timeoutMs: 50, children, spawnImpl: () => child
    })
    try {
      await expect(execution).rejects.toMatchObject({ code: 'QL_DEADLINE' })
      expect(kill).toHaveBeenCalledTimes(1)
      expect(children.size).toBe(0)
    } finally {
      kill.mockRestore()
    }
  })
  it('binds success to complete results and writes separate source/binary/observer receipts', async () => {
    const options = await fixture()
    const result = await runQuickLookChecks(options)
    expect(result.status).toBe('passed')
    expect(result.cases).toHaveLength(24)
    expect(result.binarySha256).toMatch(/^[a-f0-9]{64}$/)
    expect(result.sources).toHaveLength(9)
    expect(result.sources.every(row => /^[a-f0-9]{64}$/.test(row.sha256))).toBe(true)
    expect(options.execute.mock.calls[0][0]).toBe('git')
    expect(options.execute.mock.calls[1][0]).toBe('xcrun')
    expect(options.execute.mock.calls[2][0]).toContain('Fixture.app')
    expect(result.revision).toBe('a'.repeat(40))
    const persisted = JSON.parse(await fs.readFile(join(result.directory, 'receipt.json')))
    expect(persisted).toMatchObject({ status: 'passed', networkRequests: 0 })
    const info = await fs.readFile(join(result.directory, 'Fixture.app/Contents/Info.plist'), 'utf8')
    expect(info).toContain('com.xronocode.mark.quicklook.fixture')
  })
  it.each(['linux', 'win32'])('fails rather than skipping the unsupported %s host', async platform => {
    await expect(runQuickLookChecks({ platform })).rejects.toMatchObject({ code: 'QL_HOST_UNSUPPORTED' })
  })
  it('rejects an unsupported architecture before spawning', async () => {
    await expect(runQuickLookChecks({ platform: 'darwin', architecture: 'riscv64' }))
      .rejects.toMatchObject({ code: 'QL_ARCH_UNSUPPORTED' })
  })
  it('fails when a packaged resource is absent', async () => {
    const options = await fixture()
    await fs.unlink(join(options.root, 'mark-quicklook/Sources/PreviewExtension/Resources/style.css'))
    await expect(runQuickLookChecks(options)).rejects.toThrow()
    expect(options.execute).not.toHaveBeenCalled()
  })
  it('rejects oversized source input', async () => {
    const options = await fixture()
    await fs.writeFile(join(options.root, 'tests/quicklook/PreviewBoundaryTests.swift'), Buffer.alloc(1_048_577))
    await expect(runQuickLookChecks(options)).rejects.toMatchObject({ code: 'QL_SOURCE_INVALID' })
  })
  it('fails on a missing compiler without claiming native success', async () => {
    const options = await fixture()
    options.execute = async () => { throw new Error('compiler unavailable') }
    await expect(runQuickLookChecks(options)).rejects.toThrow('compiler unavailable')
  })
  it('does not execute a failed compiler output', async () => {
    const options = await fixture()
    const original = options.execute
    options.execute = vi.fn(async (...args) => args[0] === 'git' ? original(...args) : ({ code: 1, stdout: '', stderr: 'compile error' }))
    await expect(runQuickLookChecks(options)).rejects.toMatchObject({ code: 'QL_COMPILE_FAILED' })
    expect(options.execute).toHaveBeenCalledTimes(2)
  })
  it('does not accept compiler success without an actual binary', async () => {
    const options = await fixture()
    const original = options.execute
    options.execute = vi.fn(async (...args) => args[0] === 'git' ? original(...args) : ({ code: 0, stdout: '', stderr: '' }))
    await expect(runQuickLookChecks(options)).rejects.toThrow()
    expect(options.execute).toHaveBeenCalledTimes(2)
  })
  it.each(['', 'not json', '{"cases":'])('fails on empty or malformed native output (%s)', async stdout => {
    await expect(runQuickLookChecks(await fixture(async () => ({ code: 0, stdout, stderr: '' }))))
      .rejects.toMatchObject({ code: 'QL_NATIVE_PROTOCOL_INVALID' })
  })
  it('rejects a nonzero native exit even with complete positive JSON', async () => {
    await expect(runQuickLookChecks(await fixture(async () => ({ code: 1, stdout: JSON.stringify(nativeResult()), stderr: '' }))))
      .rejects.toMatchObject({ code: 'QL_NATIVE_PROCESS_FAILED' })
  })
  it('fails the complete run on observed loopback traffic and closes its server', async () => {
    let observer
    const options = await fixture(async (_command, args) => {
      observer = args[1]
      await fetch(observer + '/fixture-only')
      return { code: 0, stdout: JSON.stringify(nativeResult()), stderr: '' }
    })
    await expect(runQuickLookChecks(options)).rejects.toMatchObject({ code: 'QL_NETWORK_REQUESTS' })
    await expect(fetch(observer)).rejects.toThrow()
  })
  it('detects source mutation during the native run', async () => {
    const options = await fixture(async (_command, _args, _opts, root) => {
      await fs.appendFile(join(root, 'mark-quicklook/Sources/Shared/MarkdownRenderer.swift'), 'changed')
      return { code: 0, stdout: JSON.stringify(nativeResult()), stderr: '' }
    })
    await expect(runQuickLookChecks(options)).rejects.toMatchObject({ code: 'QL_SOURCE_CHANGED' })
  })
  it('detects mutation of a copied bundled resource during native execution', async () => {
    const options = await fixture(async (binary) => {
      await fs.appendFile(join(binary, '..', '..', 'Resources/style.css'), 'changed')
      return { code: 0, stdout: JSON.stringify(nativeResult()), stderr: '' }
    })
    await expect(runQuickLookChecks(options)).rejects.toMatchObject({ code: 'QL_BUNDLED_RESOURCE_CHANGED' })
  })
  it('rejects an observer error even after listening has succeeded', async () => {
    let server
    const options = await fixture(async () => {
      server.emit('error', new Error('owned observer failure'))
      return { code: 0, stdout: JSON.stringify(nativeResult()), stderr: '' }
    })
    options.createObserver = handler => { server = createServer(handler); return server }
    await expect(runQuickLookChecks(options)).rejects.toMatchObject({ code: 'QL_OBSERVER_FAILED' })
  })
  it('bounds a stalled child and cleans up the observer before rejecting', async () => {
    const options = await fixture(async () => new Promise(() => {}))
    await expect(runQuickLookChecks({ ...options, timeoutMs: 100 })).rejects.toMatchObject({ code: 'QL_DEADLINE' })
  })
  it('rejects a request arriving during post-native source integrity collection', async () => {
    let nativeDone = false
    let observer
    let injected = false
    const options = await fixture(async (_binary, args) => {
      observer = args[1]
      nativeDone = true
      return { code: 0, stdout: JSON.stringify(nativeResult()), stderr: '' }
    })
    const readFile = fs.readFile.bind(fs)
    const spy = vi.spyOn(fs, 'readFile').mockImplementation(async (...args) => {
      if (nativeDone && !injected && String(args[0]).endsWith('MarkdownRenderer.swift')) {
        injected = true
        await fetch(observer + '/late-integrity-request')
      }
      return readFile(...args)
    })
    try {
      await expect(runQuickLookChecks(options)).rejects.toMatchObject({ code: 'QL_NETWORK_REQUESTS' })
    } finally { spy.mockRestore() }
  })
  it('rejects observer errors arriving after the last child has exited', async () => {
    let server
    let nativeDone = false
    let injected = false
    const options = await fixture(async () => {
      nativeDone = true
      return { code: 0, stdout: JSON.stringify(nativeResult()), stderr: '' }
    })
    options.createObserver = handler => { server = createServer(handler); return server }
    const readFile = fs.readFile.bind(fs)
    const spy = vi.spyOn(fs, 'readFile').mockImplementation(async (...args) => {
      if (nativeDone && !injected && String(args[0]).endsWith('MarkdownRenderer.swift')) {
        injected = true
        server.emit('error', new Error('late observer error'))
      }
      return readFile(...args)
    })
    try {
      await expect(runQuickLookChecks(options)).rejects.toMatchObject({ code: 'QL_OBSERVER_FAILED' })
    } finally { spy.mockRestore() }
  })
  it('bounds stalled observer startup instead of waiting indefinitely', async () => {
    const options = await fixture()
    options.createObserver = handler => {
      const server = createServer(handler)
      server.listen = () => server
      return server
    }
    const verdict = await Promise.race([
      runQuickLookChecks({ ...options, timeoutMs: 100 }).then(() => 'passed', error => error.code),
      new Promise(resolve => setTimeout(() => resolve('still-waiting'), 400))
    ])
    expect(verdict).toBe('QL_DEADLINE')
  })
  it('applies the overall budget to post-native integrity collection', async () => {
    let nativeDone = false
    let stalled = false
    const options = await fixture(async () => {
      nativeDone = true
      return { code: 0, stdout: JSON.stringify(nativeResult()), stderr: '' }
    })
    const readFile = fs.readFile.bind(fs)
    const spy = vi.spyOn(fs, 'readFile').mockImplementation(async (...args) => {
      if (nativeDone && !stalled && String(args[0]).endsWith('MarkdownRenderer.swift')) {
        stalled = true
        await new Promise(resolve => setTimeout(resolve, 600))
      }
      return readFile(...args)
    })
    try {
      await expect(runQuickLookChecks({ ...options, timeoutMs: 500 })).rejects.toMatchObject({ code: 'QL_DEADLINE' })
    } finally { spy.mockRestore() }
  })
})
