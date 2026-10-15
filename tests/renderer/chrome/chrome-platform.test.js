// FILE: tests/renderer/chrome/chrome-platform.test.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Verify the C-38 T-006 N4 a/b chrome identity helpers — the per-OS root platform class installer, the per-OS accent fallback table and the system UI font stack — and that assets/styles/index.css mirrors the same values.
//   SCOPE: Unit tests over util/chromePlatform.js plus static reads of the global stylesheet.
//   DEPENDS: Vitest, the window.electron shim from tests/renderer/setup.ts (platform swapped through getters, never captured values).
//   LINKS: .grace/verification/runtime.xml V-M-011 scenario-56; .grace/graph/runtime.xml M-011.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   withPlatform - installs a getter-backed window.electron.process.platform per test (no captured values).
//   restoreProcess - puts back the original window.electron.process after each test.
//   readIndexCss - reads assets/styles/index.css for the mirrored literals.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - 2026-10-15 C-38 T-006 initial pins.
// END_CHANGE_SUMMARY

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  CHROME_ACCENT_FALLBACKS,
  CHROME_FONT_FAMILY,
  CHROME_PLATFORM_CLASSES,
  chromePlatformClass,
  installChromePlatformClass,
  resolveChromeAccentFallback,
  resolveChromePlatform
} from '@/util/chromePlatform'

const readIndexCss = () =>
  readFileSync(
    resolve(__dirname, '../../../src/renderer/src/assets/styles/index.css'),
    'utf8'
  )

// Getter-backed platform override: the module reads
// window.electron.process.platform lazily, so a live getter keeps the
// per-OS assertions honest (never a value captured at import time).
const withPlatform = (platform) => {
  Object.defineProperty(window.electron, 'process', {
    configurable: true,
    get: () => ({ platform })
  })
}

const restoreProcess = () => {
  delete window.electron.process
  window.electron.process = { platform: 'darwin' }
}

describe('chrome platform identity (C-38 T-006 N4 a/b)', () => {
  afterEach(restoreProcess)

  describe('platform normalization and root class', () => {
    it('maps every known platform and defaults unknowns to linux', () => {
      expect(resolveChromePlatform('darwin')).toBe('darwin')
      expect(resolveChromePlatform('win32')).toBe('win32')
      expect(resolveChromePlatform('linux')).toBe('linux')
      expect(resolveChromePlatform('freebsd')).toBe('linux')
      expect(resolveChromePlatform(undefined)).toBe('linux')
    })

    it('resolves the platform class per OS (isOsx true / false / linux)', () => {
      withPlatform('darwin')
      expect(chromePlatformClass(window.electron.process.platform)).toBe('platform-darwin')
      withPlatform('win32')
      expect(chromePlatformClass(window.electron.process.platform)).toBe('platform-win32')
      withPlatform('linux')
      expect(chromePlatformClass(window.electron.process.platform)).toBe('platform-linux')
    })

    it('installs the class on the document root, idempotently, swapping platforms live', () => {
      withPlatform('darwin')
      expect(installChromePlatformClass()).toBe('platform-darwin')
      expect(document.documentElement.classList.contains('platform-darwin')).toBe(true)

      // A later install with a different platform must swap, not stack.
      withPlatform('win32')
      expect(installChromePlatformClass()).toBe('platform-win32')
      expect(document.documentElement.classList.contains('platform-darwin')).toBe(false)
      expect(document.documentElement.classList.contains('platform-win32')).toBe(true)
      expect(installChromePlatformClass()).toBe('platform-win32')

      document.documentElement.classList.remove('platform-win32')
    })

    it('exposes exactly the three classes the CSS keys on', () => {
      expect(Object.values(CHROME_PLATFORM_CLASSES).sort()).toEqual([
        'platform-darwin',
        'platform-linux',
        'platform-win32'
      ])
    })
  })

  describe('per-OS accent fallbacks', () => {
    it('macOS: #007aff light / #0a84ff dark with ~14% soft variants', () => {
      expect(resolveChromeAccentFallback('darwin', false)).toEqual({
        accent: '#007aff',
        soft: 'rgba(0, 122, 255, 0.14)'
      })
      expect(resolveChromeAccentFallback('darwin', true)).toEqual({
        accent: '#0a84ff',
        soft: 'rgba(10, 132, 255, 0.14)'
      })
    })

    it('Windows: #005fb8 light / #4cc2ff dark with ~14% soft variants', () => {
      expect(resolveChromeAccentFallback('win32', false)).toEqual({
        accent: '#005fb8',
        soft: 'rgba(0, 103, 192, 0.14)'
      })
      expect(resolveChromeAccentFallback('win32', true)).toEqual({
        accent: '#4cc2ff',
        soft: 'rgba(76, 194, 255, 0.14)'
      })
    })

    it('Linux: #3584e4 in both modes', () => {
      expect(resolveChromeAccentFallback('linux', false)).toEqual({
        accent: '#3584e4',
        soft: 'rgba(53, 132, 228, 0.14)'
      })
      expect(resolveChromeAccentFallback('linux', true)).toEqual({
        accent: '#3584e4',
        soft: 'rgba(53, 132, 228, 0.14)'
      })
      // Unknown platforms resolve through the linux fallback.
      expect(resolveChromeAccentFallback('plan9', false).accent).toBe('#3584e4')
    })

    it('every fallback literal is mirrored in the global stylesheet', () => {
      const css = readIndexCss()
      for (const entry of Object.values(CHROME_ACCENT_FALLBACKS)) {
        for (const value of [entry.accentLight, entry.accentDark, entry.softLight, entry.softDark]) {
          expect(css).toContain(value)
        }
      }
    })
  })

  describe('system UI font stack (N4 a)', () => {
    it('is the per-OS system stack in one variable', () => {
      expect(CHROME_FONT_FAMILY).toBe(
        '-apple-system, BlinkMacSystemFont, "Segoe UI Variable Text", "Segoe UI", system-ui, Ubuntu, Cantarell, "Noto Sans", sans-serif'
      )
    })

    it('is defined once as --chromeFontFamily in the global stylesheet', () => {
      const css = readIndexCss()
      const definitions = css.match(/--chromeFontFamily:/g) || []
      expect(definitions).toHaveLength(1)
      expect(css).toContain(`--chromeFontFamily: ${CHROME_FONT_FAMILY};`)
    })

    it('the chrome surfaces consume the variable and the document does not', () => {
      const css = readIndexCss()
      expect(css).toMatch(/\.title-bar,[\s\S]*?\.el-dialog,\n\.ag-dialog-table \{\n  font-family: var\(--chromeFontFamily\);/)
      // The document font stays on the editor wrapper (editor.vue inline
      // style) — the stylesheet must not scope the chrome stack onto
      // editor content selectors.
      expect(css).not.toMatch(/#ag-editor-id[^{]*\{[^}]*--chromeFontFamily/)
      expect(css).not.toMatch(/\.editor-component[^{]*\{[^}]*chromeFontFamily/)
    })
  })

  describe('accent resolution in the stylesheet', () => {
    it('prefers CSS AccentColor behind @supports and keys fallbacks on the platform classes', () => {
      const css = readIndexCss()
      expect(css).toMatch(/@supports \(color: AccentColor\)/)
      expect(css).toMatch(/--chromeAccent: AccentColor/)
      expect(css).toContain(':root.platform-darwin')
      expect(css).toContain(':root.platform-win32')
      expect(css).toContain('body.dark')
      expect(css).toMatch(/--chromeAccentSoft: color-mix\(in srgb, AccentColor 14%, transparent\)/)
      expect(css.match(/--chromeAccentSoftLight:/g)).toHaveLength(3)
    })
  })
})
