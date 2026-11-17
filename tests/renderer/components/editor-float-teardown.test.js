// FILE: tests/renderer/components/editor-float-teardown.test.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Pin the FIX-IMAGE-TOOLBAR-RESIDUE teardown — the currentFile watcher clears muya float overlays on every transition, including the falsy one that closes the last tab onto the home screen.
//   SCOPE: Source-level pin of the watcher block in editor.vue plus the muya registry fact that one hideAllFloatTools call covers toolbars and transformer circles.
//   DEPENDS: src/renderer/src/components/editorWithTabs/editor.vue, src/muya/lib/eventHandler/keyboard.js, Vitest, Node fs/path.
//   LINKS: .grace/graph/runtime.xml M-012; docs/acceptance/registry.json FIX-IMAGE-TOOLBAR-RESIDUE.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   ROOT - repository root resolved from this test file for source reads.
//   readSource - read a repo file as text.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - 2026-11-17 FIX-IMAGE-TOOLBAR-RESIDUE: pin the null-transition hide (no value-truthy guard around hideAllFloatTools) and the muya-float registry that makes one call cover toolbars and resize circles.
// END_CHANGE_SUMMARY

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = resolve(__dirname, '..', '..', '..')
const readSource = (relPath) => readFileSync(resolve(ROOT, relPath), 'utf-8')

describe('FIX-IMAGE-TOOLBAR-RESIDUE float-tools teardown', () => {
  it('the currentFile watcher hides float tools on falsy transitions too', () => {
    const source = readSource('src/renderer/src/components/editorWithTabs/editor.vue')
    const block = source.slice(
      source.indexOf('START_BLOCK_FLOAT_TOOLS_TEARDOWN'),
      source.indexOf('END_BLOCK_FLOAT_TOOLS_TEARDOWN')
    )
    expect(block).toContain('if (value !== oldValue && editor.value)')
    expect(block).toContain('editor.value.hideAllFloatTools()')
    // The old shape — hide nested under the truthy guard — must not return.
    expect(block).not.toMatch(/if \(value && value !== oldValue\) \{[^}]*hideAllFloatTools/s)
  })

  it('one hideAllFloatTools call covers toolbars and transformer circles', () => {
    const keyboard = readSource('src/muya/lib/eventHandler/keyboard.js')
    expect(keyboard).toContain("this.shownFloat[tool.name] = tool")
    expect(keyboard).toContain('this.shownFloat[tool].hide()')
    const transformer = readSource('src/muya/lib/ui/transformer/index.js')
    expect(transformer).toContain("dispatch('muya-float', this, true)")
    expect(transformer).toContain("dispatch('muya-float', this, false)")
  })
})
