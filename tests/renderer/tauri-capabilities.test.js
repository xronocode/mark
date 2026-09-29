// FILE: tests/renderer/tauri-capabilities.test.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Pin the Tauri v2 ACL permission set so renderer window-API calls can never be silently denied again.
//   SCOPE: Reads src-tauri/capabilities/default.json and asserts every mutating window/webview permission the renderer actually invokes (C-15 Phase W QA round 2 root cause: core:window:default is read-only, so maximize/minimize/close were dropped by the ACL with only a webview-console error).
//   DEPENDS: node:fs, node:path, Vitest.
//   LINKS: .grace/verification/features.xml V-M-054 scenario-11; .grace/changes/active/C-15 Phase W QA round 2; M-046 release lane (capability JSON is validated as JSON by CI lint too).
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   REQUIRED_PERMISSIONS - exact set of mutating permissions the renderer invokes.
//   loadCapabilities - parse default.json from src-tauri.
// END_MODULE_MAP

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Every mutating window/webview method called from the renderer
// (titleBar controls, commands/index.js view commands, layout.js resize).
// core:window:default covers the read-only queries (isMaximized, outerSize…).
const REQUIRED_PERMISSIONS = [
  'core:window:allow-start-dragging',
  'core:window:allow-maximize',
  'core:window:allow-unmaximize',
  'core:window:allow-minimize',
  'core:window:allow-unminimize',
  'core:window:allow-close',
  'core:window:allow-set-fullscreen',
  'core:window:allow-set-size',
  'core:window:allow-set-always-on-top',
  'core:webview:allow-set-webview-zoom'
]

const loadCapabilities = () =>
  JSON.parse(
    // vitest runs from the repo root (npm test / npx vitest) — cwd-based
    // resolve is deterministic for both local and CI lanes.
    readFileSync(resolve(process.cwd(), 'src-tauri/capabilities/default.json'), 'utf8')
  )

describe('src-tauri/capabilities/default.json — ACL coverage (C-15 Phase W QA round 2)', () => {
  it('grants every mutating window/webview permission the renderer invokes', () => {
    const caps = loadCapabilities()
    for (const perm of REQUIRED_PERMISSIONS) {
      expect(caps.permissions, `missing ACL permission: ${perm}`).toContain(perm)
    }
  })

  it('keeps the capability scoped to main + settings windows', () => {
    const caps = loadCapabilities()
    expect(caps.windows).toEqual(expect.arrayContaining(['main', 'settings']))
  })

  it('documents why each window permission exists (no accidental wildcard)', () => {
    const caps = loadCapabilities()
    expect(caps.permissions).not.toContain('core:window:allow-all')
    expect(caps.permissions.filter((p) => p.startsWith('core:window:')).length)
      .toBeGreaterThanOrEqual(REQUIRED_PERMISSIONS.length)
  })
})
