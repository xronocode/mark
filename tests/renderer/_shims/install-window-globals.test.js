// FILE: tests/renderer/_shims/install-window-globals.test.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: C-52 gate pin — the boot shim must never STATICALLY import
//            the C-52 clipboard modules. The shim installs
//            window.electron at the END of its own body (after several
//            top-level awaits), so every static import evaluates BEFORE
//            the global exists; a static @/util/clipboardPath edge
//            pulled the shared renderer chunk — with import-time
//            window.electron.process readers such as @/util/index.js —
//            into the entry chunk, and the app crashed on every boot
//            (2026-10-17 gate round: every e2e red, «Cannot read
//            properties of undefined (reading 'process')»). The drop
//            handler must keep the dynamic import instead.
//   SCOPE: source-level pins. The shim module itself hosts top-level
//            await plus webview/localeLoader dependencies jsdom cannot
//            provide, so the established source-scan pattern from
//            tests/renderer/assets/symbolIcon.test.js (which pins
//            main.js the same way) is used here.
//   DEPENDS: vitest, node:fs, node:path.
//   LINKS: .grace/changes/active/C-52 (gate fix);
//          .grace/verification/runtime.xml V-M-059;
//          src/renderer/src/_shims/install-window-globals.js
//          START_BLOCK_DROP_FOLDER_WORKSPACE.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   SHIM_PATH - absolute path of _shims/install-window-globals.js.
//   MAIN_PATH - absolute path of main.js (pins the shim-first import).
//   readSource - utf8 source reader for the scanned files.
//   STATIC_CLIPBOARD_IMPORT_RE - matches a STATIC import declaration of a C-52 clipboard module.
//   DYNAMIC_CLIPBOARD_IMPORT_RE - matches the drop handler's dynamic import('…clipboardPath').
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   - 2026-10-17 C-52 gate fix: initial pin (would have failed before
//     the fix — the shim had `import { openMarkdownFileTab } from
//     '@/util/clipboardPath'` at module top level).
// END_CHANGE_SUMMARY

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect } from 'vitest'

const SHIM_PATH = resolve(__dirname, '../../../src/renderer/src/_shims/install-window-globals.js')
const MAIN_PATH = resolve(__dirname, '../../../src/renderer/src/main.js')

const readSource = (p) => readFileSync(p, 'utf8')

// A static import DECLARATION whose specifier ends in clipboardPath or
// clipboardOpen (`import { x } from '…'` / `import '…'`). The [^();]*?
// guard keeps it from crossing into a dynamic import(…) call, and the
// line-start anchor keeps `= await import('…')` out (no whitespace
// between `import` and `(` there either).
const STATIC_CLIPBOARD_IMPORT_RE =
  /^[ \t]*import\s+(?:[^();]*?from\s+)?['"][^'"]*clipboard(Path|Open)['"]/m
// The dynamic form the drop handler must use for dropped Markdown.
const DYNAMIC_CLIPBOARD_IMPORT_RE = /import\(\s*['"][^'"]*clipboardPath['"]\s*\)/

describe('_shims/install-window-globals boot-order pins (C-52 gate fix)', () => {
  it('never statically imports the C-52 clipboard modules (window.electron does not exist yet)', () => {
    expect(readSource(SHIM_PATH)).not.toMatch(STATIC_CLIPBOARD_IMPORT_RE)
  })

  it('the drop handler still opens dropped Markdown through the dynamic clipboardPath import', () => {
    expect(readSource(SHIM_PATH)).toMatch(DYNAMIC_CLIPBOARD_IMPORT_RE)
  })

  it('stays the FIRST import of main.js (every static import of it evaluates before window.electron readers)', () => {
    const firstImport = readSource(MAIN_PATH).match(/^[ \t]*import[^\n]*/m)
    expect(firstImport).not.toBeNull()
    expect(firstImport[0]).toContain('./_shims/install-window-globals')
  })
})
