// FILE: tests/renderer/platform-truth.test.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Pin renderer platform truth — util flags follow the injected platform, and the shim no longer hardcodes 'darwin'.
//   SCOPE: Dynamic-import platform matrix for @/util plus source-level regression pins on the shim (C-15 T-W0).
//   DEPENDS: Vitest, @/util, tests/renderer/setup.ts (installs window.electron double).
//   LINKS: .grace/verification/features.xml V-M-011/V-M-046 (C-15 T-W0); .grace/changes/archive/C-15.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   workspaceRoot - repo root for source-level shim regression pins
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   - 2026-09-28 v1.0.0: C-15 T-W0 — the shim now derives the platform from
//     the build-time Vite define; these tests pin the flags matrix and guard
//     against the 'darwin' hardcode returning.
// END_CHANGE_SUMMARY

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const workspaceRoot = resolve(import.meta.dirname, '../..')

describe('renderer platform truth (C-15 T-W0)', () => {
  // Vite-8 order-independence: util/_platform reads the build-time
  // process.platform define (the release matrix builds per-platform), so the
  // flags are BUILD constants — window.electron.process.platform is set by
  // the shim from the same define and mutating it here no longer re-drives
  // the util (the source pins below cover the mechanism).
  const hostPlatform = process.platform
  const loadUtil = async () => {
    return await import('@/util')
  }

  afterEach(() => {
    vi.resetModules()
  })

  it('isOsx/isWindows/isLinux are build-time constants matching the build host', async () => {
    const util = await loadUtil()
    expect(util.isOsx).toBe(hostPlatform === 'darwin')
    expect(util.isWindows).toBe(hostPlatform === 'win32')
    expect(util.isLinux).toBe(hostPlatform === 'linux')
  })

  it('the shim derives platform from the build-time define, not a hardcode', () => {
    const src = readFileSync(
      resolve(workspaceRoot, 'src/renderer/src/_shims/install-window-globals.js'),
      'utf8'
    )
    // The vite define replaces the `process.platform` expression with the
    // build host platform string; a literal here would freeze every build
    // to one OS (the exact bug C-15 T-W0 fixes).
    expect(src).toContain('platform: process.platform')
    expect(src).not.toContain("platform: 'darwin'")
  })

  it('the shim selects the platform-correct path implementation', () => {
    const src = readFileSync(
      resolve(workspaceRoot, 'src/renderer/src/_shims/install-window-globals.js'),
      'utf8'
    )
    // path-browserify is POSIX-only and rejected drive-letter paths
    // (Windows folder-import regression); the win32 sibling
    // port is selected at build time via the folded process.platform
    // ternary, so sep/dirname/relative/isAbsolute all speak win32.
    expect(src).toContain("import win32Path from 'path-win32'")
    expect(src).toContain(
      "const path = process.platform === 'win32' ? win32Path : posixPath"
    )
    expect(src).not.toContain('_path.sep = process.platform')
  })
})
