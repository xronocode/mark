// FILE: tests/renderer/commands/inline-format-shortcuts.test.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Pin the FIX-SIDEBAR-BOLD-CONFLICT binding split — Bold owns plain ⌘B in the editor keydown layer, the native sidebar item rides ⇧⌘B, and no native accelerator claims the plain chord.
//   SCOPE: Source-level accelerator and keydown-block extraction across the native menu (m009_menu.rs), the editor keydown layer (editor.vue) and the muya format-picker advertisement; no runtime muya bootstrap.
//   DEPENDS: src-tauri/src/m009_menu.rs, src/renderer/src/components/editorWithTabs/editor.vue, src/muya/lib/ui/formatPicker/config.js, Vitest, Node fs/path.
//   LINKS: .grace/graph/runtime.xml M-009, M-012; .grace/verification/runtime.xml V-M-009; docs/acceptance/registry.json FIX-SIDEBAR-BOLD-CONFLICT.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   ROOT - repository root resolved from this test file for source reads.
//   readSource - read a repo file as text for source-level extraction.
//   sidebarAccelerator - the accelerator of the view.toggle-sidebar native menu item.
//   plainCmdBMenuClaims - every native accelerator equal to plain CmdOrCtrl+B.
//   keydownBlock - the FIX-SIDEBAR-BOLD-CONFLICT keydown block in editor.vue.
//   formatPickerAdvertisesBold - the muya format picker Bold tooltip/shortcut pair.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - 2026-11-17 FIX-SIDEBAR-BOLD-CONFLICT: pin Bold ⌘B (editor keydown layer → contentState.format('strong')) and sidebar ⇧⌘B (native menu) with the plain chord unclaimed by any native accelerator.
// END_CHANGE_SUMMARY

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = resolve(__dirname, '..', '..', '..')
const readSource = (relPath) => readFileSync(resolve(ROOT, relPath), 'utf-8')

const sidebarAccelerator = () => {
  const source = readSource('src-tauri/src/m009_menu.rs')
  const item = source.slice(
    source.indexOf('"view.toggle-sidebar".to_string()'),
    source.indexOf('"view.toggle-tabbar".to_string()')
  )
  const match = /accelerator:\s*Some\("([^"]+)"/.exec(item)
  return match ? match[1] : undefined
}

const plainCmdBMenuClaims = () => {
  const source = readSource('src-tauri/src/m009_menu.rs')
  return source.match(/accelerator:\s*Some\("CmdOrCtrl\+B"/g) || []
}

const keydownBlock = () => {
  const source = readSource('src/renderer/src/components/editorWithTabs/editor.vue')
  return source.slice(
    source.indexOf('START_BLOCK_INLINE_FORMAT_SHORTCUTS'),
    source.indexOf('END_BLOCK_INLINE_FORMAT_SHORTCUTS')
  )
}

const formatPickerAdvertisesBold = () => {
  const source = readSource('src/muya/lib/ui/formatPicker/config.js')
  const entry = source.slice(source.indexOf("type: 'strong'"), source.indexOf("type: 'em'"))
  return /tooltip:\s*'Bold'/.test(entry) && /shortcut:\s*`\$\{COMMAND_KEY\}\+B`/.test(entry)
}

describe('FIX-SIDEBAR-BOLD-CONFLICT binding split', () => {
  it('the native sidebar item rides CmdOrCtrl+Shift+B', () => {
    expect(sidebarAccelerator()).toBe('CmdOrCtrl+Shift+B')
  })

  it('no native accelerator claims the plain CmdOrCtrl+B chord', () => {
    expect(plainCmdBMenuClaims()).toEqual([])
  })

  it('the editor keydown layer delivers KeyB to contentState.format("strong") with the surface guards', () => {
    const block = keydownBlock()
    expect(block).toContain("event.code === 'KeyB'")
    expect(block).toContain("contentState.format('strong')")
    expect(block).toContain("event.preventDefault()")
    expect(block).toContain(".closest('.editor-component')")
    expect(block).toContain(".closest('.ag-block-viewer')")
    expect(block).toContain('isReadOnlySurface.value')
    expect(block).toContain('if (isReadOnlySurface.value) return')
    expect(block).toContain('event.isComposing')
    // Shift and Alt must not trigger the bold chord (shift belongs to the
    // sidebar's new ⇧⌘B).
    expect(block).toContain('event.altKey || event.shiftKey')
  })

  it('the handler is wired into the editor surface keydown chain', () => {
    const source = readSource('src/renderer/src/components/editorWithTabs/editor.vue')
    expect(source).toContain('handleInlineFormatShortcutKeys(event)')
  })

  it('the muya format picker still advertises Bold with the Cmd+B shortcut', () => {
    expect(formatPickerAdvertisesBold()).toBe(true)
  })
})
