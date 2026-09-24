// FILE: tests/renderer/commands/menu-consistency.test.js
// VERSION: 1.4.2
// START_MODULE_CONTRACT
//   PURPOSE: Keep native application-menu IDs and renderer command IDs synchronized.
//   SCOPE: Source-level native-menu extraction, renderer command/shortcut extraction, and intentional renderer-only exceptions.
//   DEPENDS: src-tauri/src/m009_menu.rs, src/renderer/src/commands/index.js, Vitest, Node fs/path.
//   LINKS: docs/verification-plan.xml V-M-009 and V-M-012 scenario-10; docs/knowledge-graph.xml M-009 and M-012.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   extractNativeMenuIds - Reads explicit native menu IDs from build_native_menu.
//   extractRendererCommandIds - Reads renderer command registry IDs.
//   extractRendererShortcutIds - Maps renderer keyboard shortcuts back to command IDs.
//   RENDERER_ONLY_ALLOWLIST - Documents commands intentionally absent from the native menu.
//   ROOT - GRACE 4 synchronized symbol
//   readSource - GRACE 4 synchronized symbol
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.3.0 - Pin tabs.cycleForward/Backward menu ids + Ctrl+Tab/Ctrl+Shift+Tab accelerators; ids leave the RENDERER_ONLY_ALLOWLIST (C-8).
//   v1.4.2 - C-19: pin edit.go-to-heading menu id + CmdOrCtrl+T accelerator.
//   v1.4.1 - C-17: pin edit.format-document menu id + Shift+Alt+F accelerator; view.problems / view.toggle-markdown-lint enter the RENDERER_ONLY_ALLOWLIST (palette-only).
//   v1.4.0 - Pin edit.copy-as-plain-text menu id + CmdOrCtrl+Alt+Shift+C accelerator (C-12).
//   v1.2.0 - Pin edit.copy-as-html menu id + Cmd+Shift+C accelerator (C-3).
//   v1.1.0 - Require edit.undo/edit.redo to be native menu IDs routed to Muya history.
// END_CHANGE_SUMMARY

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const ROOT = resolve(__dirname, '..', '..', '..')

const readSource = (relPath) =>
  readFileSync(resolve(ROOT, relPath), 'utf-8')

const extractNativeMenuIds = () => {
  const rust = readSource('src-tauri/src/m009_menu.rs')
  const buildFn = rust.slice(rust.indexOf('pub fn build_native_menu'))
  const ids = new Set()
  for (const m of buildFn.matchAll(/with_id\("([^"]+)"/g)) {
    ids.add(m[1])
  }
  return ids
}

const extractRendererCommandIds = () => {
  const js = readSource('src/renderer/src/commands/index.js')
  const ids = new Set()
  for (const m of js.matchAll(/id:\s*'([^']+)'/g)) {
    ids.add(m[1])
  }
  return ids
}

const extractRendererShortcutIds = () => {
  const js = readSource('src/renderer/src/commands/index.js')
  const lines = js.split('\n')
  const ids = new Set()
  for (let i = 0; i < lines.length; i++) {
    if (/shortcut:/.test(lines[i])) {
      for (let j = i; j >= Math.max(i - 8, 0); j--) {
        const m = lines[j].match(/id:\s*'([^']+)'/)
        if (m) {
          ids.add(m[1])
          break
        }
      }
    }
  }
  return ids
}

// Commands that intentionally exist only in the renderer (command
// palette / internal dispatch) and don't need a native menu entry.
// Each entry must have a reason — add new entries only with a comment.
const RENDERER_ONLY_ALLOWLIST = new Set([
  // C-17: palette-only surfaces (problems overlay + lint toggle)
  'view.problems',
  'view.toggle-markdown-lint',
  // Tauri predefined .quit() on macOS
  'file.quit',
  // Multi-window not yet implemented
  'file.new-window',
  'file.close-window',
  // Uses electron IPC — not yet ported to Tauri
  'file.toggle-auto-save',
  'file.import-file',
  // Parent group — subcommands are in menu
  'file.export-file',
  // Paragraph/format commands: too many for menu, command-palette only
  'paragraph.heading-1',
  'paragraph.heading-2',
  'paragraph.heading-3',
  'paragraph.heading-4',
  'paragraph.heading-5',
  'paragraph.heading-6',
  'paragraph.upgrade-heading',
  'paragraph.degrade-heading',
  'paragraph.table',
  'paragraph.code-fence',
  'paragraph.quote-block',
  'paragraph.math-formula',
  'paragraph.html-block',
  'paragraph.order-list',
  'paragraph.bullet-list',
  'paragraph.task-list',
  'paragraph.loose-list-item',
  'paragraph.paragraph',
  'paragraph.reset-paragraph',
  'paragraph.horizontal-line',
  'paragraph.front-matter',
  'edit.duplicate',
  'edit.create-paragraph',
  'edit.delete-paragraph',
  // Format commands: command-palette only
  'format.strong',
  'format.emphasis',
  'format.underline',
  'format.highlight',
  'format.superscript',
  'format.subscript',
  'format.inline-code',
  'format.inline-math',
  'format.strike',
  'format.hyperlink',
  'format.image',
  'format.clear-format',
  // Zoom subcommands — mouse gesture (Ctrl+Scroll)
  'file.zoom',
  'file.zoom-0',
  'file.zoom-1',
  'file.zoom-2',
  'file.zoom-3',
  'file.zoom-4',
  'file.zoom-5',
  'file.zoom-6',
  'file.zoom-7',
  'file.zoom-8',
  'file.zoom-9',
  'file.zoom-10',
  'file.zoom-11',
  // Theme parent — subcommands are in menu
  'window.change-theme',
  // Window management — command-palette accessible
  'window.toggle-always-on-top',
  // Niche — command-palette only
  'edit.screenshot',
  'view.text-direction',
  'view.text-direction-ltr',
  'view.text-direction-rtl',
  'docs.markdown-syntax',
])

describe('menu ↔ commands consistency', () => {
  let menuIds
  let commandIds
  let shortcutIds

  beforeAll(() => {
    menuIds = extractNativeMenuIds()
    commandIds = extractRendererCommandIds()
    shortcutIds = extractRendererShortcutIds()
  })

  const DISPLAY_ONLY_MENU_IDS = new Set([
    'help.version',
  ])

  it('every native menu ID has a renderer command', () => {
    const missing = []
    for (const id of menuIds) {
      if (!commandIds.has(id) && !DISPLAY_ONLY_MENU_IDS.has(id)) {
        missing.push(id)
      }
    }
    expect(missing).toEqual([])
  })

  it('every renderer command is in native menu or allowlist', () => {
    const missing = []
    for (const id of commandIds) {
      if (!menuIds.has(id) && !RENDERER_ONLY_ALLOWLIST.has(id)) {
        missing.push(id)
      }
    }
    expect(missing).toEqual([])
  })

  it('renderer commands with keyboard shortcuts have native menu entries', () => {
    const missing = []
    for (const id of shortcutIds) {
      if (!menuIds.has(id) && !RENDERER_ONLY_ALLOWLIST.has(id)) {
        missing.push(id)
      }
    }
    expect(missing).toEqual([])
  })

  it('routes native undo/redo accelerators through explicit renderer command IDs', () => {
    const rust = readSource('src-tauri/src/m009_menu.rs')
    const buildFn = rust.slice(rust.indexOf('pub fn build_native_menu'))

    expect(buildFn).toMatch(
      /with_id\("edit\.undo", "Undo"\)[\s\S]*?accelerator\("CmdOrCtrl\+Z"\)/
    )
    expect(buildFn).toMatch(
      /with_id\("edit\.redo", "Redo"\)[\s\S]*?accelerator\("CmdOrCtrl\+Shift\+Z"\)/
    )
  })

  it('pins Copy as HTML menu item id and Cmd+Shift+C accelerator (C-3)', () => {
    const rust = readSource('src-tauri/src/m009_menu.rs')
    const buildFn = rust.slice(rust.indexOf('pub fn build_native_menu'))

    expect(buildFn).toMatch(
      /with_id\("edit\.copy-as-html", "Copy as HTML"\)[\s\S]*?accelerator\("CmdOrCtrl\+Shift\+C"\)/
    )
    // The accelerator must stay unique across the whole menu.
    expect(buildFn.match(/CmdOrCtrl\+Shift\+C/g)).toHaveLength(1)
  })

  it('pins Go to Heading menu item id and accelerator (C-19)', () => {
    const rust = readSource('src-tauri/src/m009_menu.rs')
    const buildFn = rust.slice(rust.indexOf('pub fn build_native_menu'))

    expect(buildFn).toMatch(
      /with_id\("edit\.go-to-heading", "Go to Heading…"[\s\S]*?accelerator\("CmdOrCtrl\+T"\)/
    )
    expect(buildFn.match(/CmdOrCtrl\+T/g)).toHaveLength(1)
  })

  it('pins Format Document menu item id and accelerator (C-17)', () => {
    const rust = readSource('src-tauri/src/m009_menu.rs')
    const buildFn = rust.slice(rust.indexOf('pub fn build_native_menu'))

    expect(buildFn).toMatch(
      /with_id\("edit\.format-document", "Format Document"\)[\s\S]*?accelerator\("Shift\+Alt\+F"\)/
    )
  })

  it('pins Copy as Plain Text menu item id and accelerator (C-12)', () => {
    const rust = readSource('src-tauri/src/m009_menu.rs')
    const buildFn = rust.slice(rust.indexOf('pub fn build_native_menu'))

    expect(buildFn).toMatch(
      /with_id\("edit\.copy-as-plain-text", "Copy as Plain Text"\)[\s\S]*?accelerator\("CmdOrCtrl\+Alt\+Shift\+C"\)/
    )
    expect(buildFn.match(/CmdOrCtrl\+Alt\+Shift\+C/g)).toHaveLength(1)
  })

  it('pins tab-cycling menu item ids and Ctrl+Tab accelerators (C-8)', () => {
    const rust = readSource('src-tauri/src/m009_menu.rs')
    const buildFn = rust.slice(rust.indexOf('pub fn build_native_menu'))

    expect(buildFn).toMatch(
      /with_id\("tabs\.cycleForward", "Select Next Tab"\)[\s\S]*?accelerator\("Ctrl\+Tab"\)/
    )
    expect(buildFn).toMatch(
      /with_id\("tabs\.cycleBackward", "Select Previous Tab"\)[\s\S]*?accelerator\("Ctrl\+Shift\+Tab"\)/
    )
    // Both accelerators stay unique across the whole menu.
    expect(buildFn.match(/Ctrl\+Tab"/g)).toHaveLength(1)
    expect(buildFn.match(/Ctrl\+Shift\+Tab"/g)).toHaveLength(1)
  })

  it('allowlist entries actually exist in renderer commands', () => {
    const stale = []
    for (const id of RENDERER_ONLY_ALLOWLIST) {
      if (!commandIds.has(id)) {
        stale.push(id)
      }
    }
    expect(stale).toEqual([])
  })

  it('no allowlist entry is also in native menu (redundant)', () => {
    const redundant = []
    for (const id of RENDERER_ONLY_ALLOWLIST) {
      if (menuIds.has(id)) {
        redundant.push(id)
      }
    }
    expect(redundant).toEqual([])
  })
})
