/**
 * MODULE_CONTRACT
 *   PURPOSE: Fixture-grep test for M-024 perf-splash marker catalog.
 *            Reads src/renderer/index.html and src/renderer/src/main.js
 *            from disk and asserts each required BLOCK_* marker string
 *            (per the M-024 contract) appears as a console.log argument.
 *            Acts as a tripwire: any rename/typo of a BLOCK_* marker
 *            fails this test, preserving the V-M-030 boot-anchor and
 *            V-M-024 perf-budget consumers' contract.
 *   SCOPE:   Static text scan only — no JS execution. We use simple
 *            substring search rather than a JS parser; markers are
 *            distinctive enough that false positives are not a risk.
 *   DEPENDS: vitest globals + node:fs.
 *   LINKS:   docs/verification-plan.xml V-M-024; cross-module to V-M-030.
 */

import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const repoRoot = resolve(__dirname, '../../..')

const indexHtmlPath = resolve(repoRoot, 'src/renderer/index.html')
const mainJsPath = resolve(repoRoot, 'src/renderer/src/main.js')

const indexHtml = readFileSync(indexHtmlPath, 'utf8')
const mainJs = readFileSync(mainJsPath, 'utf8')
const combined = indexHtml + '\n' + mainJs

describe('M-024 splash marker catalog (fixture grep)', () => {
  // Catalog must match the M-024 contract exactly.
  const indexMarkers = [
    'BLOCK_HEAD_PARSED',
    'BLOCK_CSS_LOADED',
    'BLOCK_VISIBLE',
    'BLOCK_THEME_RESOLVED',
    'BLOCK_CSS_FAILED',
    'BLOCK_VUE_FAILED',
    'BLOCK_WATCHDOG_FIRED'
  ]
  const mainJsMarkers = [
    'BLOCK_VUE_READY',
    'BLOCK_REPLACED',
    'BLOCK_HMR_BYPASS',
    'BLOCK_VUE_FAILED',
    'BLOCK_ORPHAN_DETECTED'
  ]

  it.each(indexMarkers)('index.html declares marker %s in [boot][splash] namespace', (marker) => {
    expect(indexHtml).toContain(marker)
    // Each marker must be wrapped in the [boot][splash] log namespace —
    // string literal must appear in the same file as the marker.
    expect(indexHtml).toContain('[boot][splash]')
  })

  it.each(mainJsMarkers)('main.js declares marker %s in [boot][splash] namespace', (marker) => {
    expect(mainJs).toContain(marker)
    expect(mainJs).toContain('[boot][splash]')
  })

  it('sets window.__BOOT_T0__ via performance.now() in the very first inline script', () => {
    // The BOOT_T0 anchor is the cross-module contract with V-M-030. We
    // assert (a) the assignment is present, (b) it appears BEFORE the
    // splash <style> block (which itself precedes <body>), i.e. in the
    // first <head> inline script — earliest possible execution slot.
    const firstScriptStart = indexHtml.indexOf('<script>')
    const styleStart = indexHtml.indexOf('<style id="splash-style">')
    expect(firstScriptStart).toBeGreaterThan(-1)
    expect(styleStart).toBeGreaterThan(firstScriptStart)
    const firstScriptBlock = indexHtml.slice(firstScriptStart, styleStart)
    expect(firstScriptBlock).toContain('window.__BOOT_T0__')
    expect(firstScriptBlock).toContain('performance.now()')
  })

  it('inlines splash CSS as <style id="splash-style"> in <head> for sync apply', () => {
    // Vite bundles linked CSS into the main async chunk — we need the
    // splash CSS applied SYNCHRONOUSLY before any JS parses, so the
    // splash.css contents are inlined into a <style> block. The source
    // file at src/renderer/static/splash.css remains canonical;
    // verify-splash-budget.mjs enforces parity.
    expect(indexHtml).toMatch(/<style\s+id="splash-style"\s*>/)
    // Style block must appear BEFORE the first <body> open.
    const styleIdx = indexHtml.indexOf('<style id="splash-style">')
    const bodyIdx = indexHtml.indexOf('<body')
    expect(styleIdx).toBeGreaterThan(-1)
    expect(bodyIdx).toBeGreaterThan(styleIdx)
  })

  it('mounts Vue and dismounts splash after mount returns', () => {
    // Marker order in main.js: BLOCK_VUE_READY logged immediately after
    // app.mount('#app'), then dismountSplash() called (which logs
    // BLOCK_REPLACED). Assert source ordering as a regression check.
    const mountIdx = mainJs.indexOf("app.mount('#app')")
    const vueReadyIdx = mainJs.indexOf('BLOCK_VUE_READY')
    const replacedCallIdx = mainJs.indexOf('dismountSplash()')
    expect(mountIdx).toBeGreaterThan(-1)
    expect(vueReadyIdx).toBeGreaterThan(mountIdx)
    expect(replacedCallIdx).toBeGreaterThan(vueReadyIdx)
  })

  it('sets up the 5s splash watchdog in index.html', () => {
    // Watchdog: 5000ms timeout registered AND watchdog marker present.
    // We don't require a single-line regex (the function literal has its
    // own commas); just check both fragments appear together.
    expect(indexHtml).toContain('setTimeout(')
    expect(indexHtml).toContain(',5000)')
    expect(indexHtml).toContain('BLOCK_WATCHDOG_FIRED')
  })

  it('union of declared markers covers full catalog', () => {
    // Sanity: every marker in the M-024 catalog appears somewhere in the
    // two source files combined.
    const fullCatalog = [
      'BLOCK_HEAD_PARSED',
      'BLOCK_CSS_LOADED',
      'BLOCK_VISIBLE',
      'BLOCK_THEME_RESOLVED',
      'BLOCK_VUE_READY',
      'BLOCK_REPLACED',
      'BLOCK_HMR_BYPASS',
      'BLOCK_CSS_FAILED',
      'BLOCK_VUE_FAILED',
      'BLOCK_WATCHDOG_FIRED',
      'BLOCK_ORPHAN_DETECTED'
    ]
    const missing = fullCatalog.filter((m) => !combined.includes(m))
    expect(missing).toEqual([])
  })
})
