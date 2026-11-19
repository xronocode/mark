// FILE: tests/renderer/quicklook-runner.test.js
// VERSION: 1.1.0
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
//   packagedResource - read the packaged QuickLook css as text for the palette controls.
//   LIGHT_MEDIA_MARKER - locator of the single prefers-color-scheme light branch.
//   LIGHT_RULES - parsed rule bodies of the light branch.
//   DARK_RULES - parsed rule bodies of the dark declarations for coverage comparison.
//   declarations - split a rule body into its exact declarations.
//   srgbLinear - linearized sRGB channel for the WCAG luminance formula.
//   relativeLuminance - WCAG relative luminance of a css hex color.
//   contrastRatio - unrounded WCAG contrast ratio of two hex colors.
//   SPEC_LIGHT_CONTRAST - the approved spec's expected unrounded light contrast table.
// END_MODULE_MAP
// START_CHANGE_SUMMARY
//   - 2026-11-12: bound fixture deletion retries for transient Windows ENOTEMPTY while deadline-failure receipt writes finish.
//   - 2026-11-20: C-QUICKLOOK-SYNTAX-THEME 26-case protocol pins, theme failure controls and static light-palette coverage.
//   LAST_CHANGE: 2026-11-20 C-QUICKLOOK-SYNTAX-THEME: 26-case protocol pins and deterministic light-palette coverage.
// END_CHANGE_SUMMARY

import { afterEach, describe, expect, it, vi } from 'vitest'
import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { createServer } from 'node:http'
import { EventEmitter } from 'node:events'
import { fileURLToPath } from 'node:url'
import { REQUIRED_QUICKLOOK_CASES, executeChild, runQuickLookChecks, validateNativeResult } from '../../tools/check-quicklook.mjs'

const owned = []
afterEach(async () => {
  await Promise.all(owned.splice(0).map(path => fs.rm(path, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 })))
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

// C-QUICKLOOK-SYNTAX-THEME static palette controls: the 13 light group rules of the
// appended @media (prefers-color-scheme: light) branch, pinned as exact strings.
const LIGHT_RULES = Object.freeze([
  '.hljs,.hljs-subst{color:#1f2328}',
  '.hljs-doctag,.hljs-keyword,.hljs-meta .hljs-keyword,.hljs-template-tag,.hljs-template-variable,.hljs-type,.hljs-variable.language_{color:#cf222e}',
  '.hljs-title,.hljs-title.class_,.hljs-title.class_.inherited__,.hljs-title.function_{color:#6f42c1}',
  '.hljs-attr,.hljs-attribute,.hljs-literal,.hljs-meta,.hljs-number,.hljs-operator,.hljs-selector-attr,.hljs-selector-class,.hljs-selector-id,.hljs-variable{color:#005cc5}',
  '.hljs-meta .hljs-string,.hljs-regexp,.hljs-string{color:#032f62}',
  '.hljs-built_in,.hljs-symbol{color:#953800}',
  '.hljs-code,.hljs-comment,.hljs-formula{color:#656d76}',
  '.hljs-name,.hljs-quote,.hljs-selector-pseudo,.hljs-selector-tag{color:#116329}',
  '.hljs-emphasis,.hljs-strong{color:#1f2328}',
  '.hljs-section{color:#005cc5}',
  '.hljs-bullet{color:#735c0f}',
  '.hljs-addition{color:#116329;background-color:#f0fff4}',
  '.hljs-deletion{color:#b31d28;background-color:#ffeef0}'
])
// Original dark rules that must survive the append verbatim.
const DARK_RULES = Object.freeze([
  '.hljs{color:#c9d1d9;background:#0d1117}',
  '.hljs-doctag,.hljs-keyword,.hljs-meta .hljs-keyword,.hljs-template-tag,.hljs-template-variable,.hljs-type,.hljs-variable.language_{color:#ff7b72}',
  '.hljs-title,.hljs-title.class_,.hljs-title.class_.inherited__,.hljs-title.function_{color:#d2a8ff}',
  '.hljs-attr,.hljs-attribute,.hljs-literal,.hljs-meta,.hljs-number,.hljs-operator,.hljs-selector-attr,.hljs-selector-class,.hljs-selector-id,.hljs-variable{color:#79c0ff}',
  '.hljs-meta .hljs-string,.hljs-regexp,.hljs-string{color:#a5d6ff}',
  '.hljs-built_in,.hljs-symbol{color:#ffa657}',
  '.hljs-code,.hljs-comment,.hljs-formula{color:#8b949e}',
  '.hljs-name,.hljs-quote,.hljs-selector-pseudo,.hljs-selector-tag{color:#7ee787}',
  '.hljs-subst{color:#c9d1d9}',
  '.hljs-section{color:#1f6feb;font-weight:700}',
  '.hljs-bullet{color:#f2cc60}',
  '.hljs-emphasis{color:#c9d1d9;font-style:italic}',
  '.hljs-strong{color:#c9d1d9;font-weight:700}',
  '.hljs-addition{color:#aff5b4;background-color:#033a16}',
  '.hljs-deletion{color:#ffdcd7;background-color:#67060c}'
])
// Unrounded WCAG ratios per approved spec palette table (backgrounds per applicable element).
const SPEC_LIGHT_CONTRAST = Object.freeze([
  { rule: LIGHT_RULES[0], background: '#f6f8fa', ratio: 14.8392 },
  { rule: LIGHT_RULES[1], background: '#f6f8fa', ratio: 5.0304 },
  { rule: LIGHT_RULES[2], background: '#f6f8fa', ratio: 6.1161 },
  { rule: LIGHT_RULES[3], background: '#f6f8fa', ratio: 5.9111 },
  { rule: LIGHT_RULES[4], background: '#f6f8fa', ratio: 12.4309 },
  { rule: LIGHT_RULES[5], background: '#f6f8fa', ratio: 6.937 },
  { rule: LIGHT_RULES[6], background: '#f6f8fa', ratio: 4.9285 },
  { rule: LIGHT_RULES[7], background: '#f6f8fa', ratio: 6.9443 },
  { rule: LIGHT_RULES[8], background: '#f6f8fa', ratio: 14.8392 },
  { rule: LIGHT_RULES[9], background: '#f6f8fa', ratio: 5.9111 },
  { rule: LIGHT_RULES[10], background: '#f6f8fa', ratio: 6.0385 },
  { rule: LIGHT_RULES[11], background: '#f0fff4', ratio: 7.1518 },
  { rule: LIGHT_RULES[12], background: '#ffeef0', ratio: 6.0004 }
])
const LIGHT_MEDIA_MARKER = '@media (prefers-color-scheme: light){'
const packagedResource = async name => fs.readFile(
  join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'mark-quicklook/Sources/PreviewExtension/Resources', name),
  'utf8')
const declarations = rule => rule.slice(rule.indexOf('{') + 1, -1).split(';')
const srgbLinear = channel => {
  const c = channel / 255
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}
const relativeLuminance = hex => {
  const value = Number.parseInt(hex.slice(1), 16)
  return 0.2126 * srgbLinear((value >> 16) & 255) + 0.7152 * srgbLinear((value >> 8) & 255) + 0.0722 * srgbLinear(value & 255)
}
const contrastRatio = (front, back) => {
  const hi = Math.max(relativeLuminance(front), relativeLuminance(back))
  const lo = Math.min(relativeLuminance(front), relativeLuminance(back))
  return (hi + 0.05) / (lo + 0.05)
}

describe('QuickLook native evidence protocol', () => {
  it('requires every expected case exactly once and an independent zero request count', () => {
    expect(validateNativeResult(nativeResult())).toBe(26)
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
  it('freezes exactly the 24 boundary cases plus the required theme cases in order', () => {
    expect(REQUIRED_QUICKLOOK_CASES).toEqual([
      'markdown', 'highlight', 'unicode-title', 'embedded-raster',
      'raw-event-handler', 'raw-script', 'script-terminator', 'mixed-case-terminator',
      'svg-handler', 'iframe-srcdoc', 'object-embed', 'form', 'javascript-link',
      'data-svg', 'remote-image', 'fetch-beacon', 'external-navigation', 'new-window',
      'subframe', 'initial-load', 'missing-file', 'resource-integrity',
      'file-resource-policy', 'repeat-preview', 'theme-light', 'theme-dark'
    ])
  })
  it('rejects a result missing a required theme case', () => {
    const result = nativeResult()
    result.cases = result.cases.filter(row => row.id !== 'theme-dark')
    expect(() => validateNativeResult(result)).toThrow('QL_CASE_SET_INCOMPLETE')
  })
  it('rejects a duplicated theme case', () => {
    const result = nativeResult()
    result.cases[0] = { id: 'theme-light', passed: true }
    expect(() => validateNativeResult(result)).toThrow('QL_CASE_SET_INCOMPLETE')
  })
  it.each([false, undefined, 'true', 1])('requires a literal pass from the theme cases (%s)', passed => {
    const result = nativeResult()
    result.cases.find(row => row.id === 'theme-light').passed = passed
    expect(() => validateNativeResult(result)).toThrow('QL_NATIVE_CASE_FAILED')
  })
})

describe('QuickLook light syntax palette (C-QUICKLOOK-SYNTAX-THEME)', () => {
  it('appends exactly one light media branch with the pinned 13 color-only group rules', async () => {
    const githubDark = await packagedResource('github-dark.css')
    expect(githubDark.split(LIGHT_MEDIA_MARKER)).toHaveLength(2)
    const branch = githubDark.slice(
      githubDark.indexOf(LIGHT_MEDIA_MARKER) + LIGHT_MEDIA_MARKER.length, githubDark.lastIndexOf('}'))
    expect(branch.split('\n').filter(line => line.length > 0)).toEqual([...LIGHT_RULES])
    expect(LIGHT_RULES.flatMap(declarations)
      .every(declaration => /^(background-)?color:#[0-9a-f]{6}$/.test(declaration))).toBe(true)
  })
  it('covers every dark color-bearing selector exactly once while every dark rule survives verbatim', async () => {
    const githubDark = await packagedResource('github-dark.css')
    const head = githubDark.slice(0, githubDark.indexOf(LIGHT_MEDIA_MARKER)).replace(/\/\*[\s\S]*?\*\//g, '')
    const darkSelectors = []
    for (const statement of head.split('}').filter(chunk => chunk.includes('{'))) {
      const [selectors, body] = statement.split('{')
      if (/(^|;)color:/.test(body)) darkSelectors.push(...selectors.split(',').map(selector => selector.trim()))
    }
    const lightSelectors = LIGHT_RULES.flatMap(rule => rule.slice(0, rule.indexOf('{')).split(','))
    expect(darkSelectors).toHaveLength(41)
    expect(lightSelectors).toHaveLength(41)
    expect(new Set(lightSelectors).size).toBe(41)
    expect([...darkSelectors].sort()).toEqual([...lightSelectors].sort())
    for (const rule of DARK_RULES) expect(githubDark).toContain(rule)
  })
  it('keeps the applicable light code-block background real', async () => {
    expect(await packagedResource('style.css')).toContain('--code-bg: #f6f8fa')
  })
  it('reaches the 4.5:1 floor and the approved spec ratio for every light group', () => {
    for (const { rule, background, ratio } of SPEC_LIGHT_CONTRAST) {
      const foreground = declarations(rule).find(declaration => declaration.startsWith('color:')).slice('color:'.length)
      const computed = contrastRatio(foreground, background)
      expect(computed).toBeGreaterThanOrEqual(4.5)
      expect(Math.abs(computed - ratio)).toBeLessThanOrEqual(0.01)
    }
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
    expect(result.cases).toHaveLength(26)
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
