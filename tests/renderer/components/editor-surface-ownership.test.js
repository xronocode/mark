// FILE: tests/renderer/components/editor-surface-ownership.test.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Prove the one-definition-owner shape of the editor surface answers.
//   SCOPE: Structural source pins over editor.vue — the START_BLOCK_SURFACE_OWNERSHIP block owns each surface answer exactly once, the provably redundant disjuncts stay collapsed, and the START_BLOCK_EXT_TEXT_OPS zone consumes the raw rendered identity untouched.
//   DEPENDS: editor.vue source text (node:fs read — no mount, no behavior run).
//   LINKS: M-011; V-M-011; C-SURFACE-OWNERSHIP.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
// START_MODULE_MAP
//   source - The editor.vue file text under assertion.
//   block - The START_BLOCK_SURFACE_OWNERSHIP..END_BLOCK_SURFACE_OWNERSHIP region.
//   extZone - The START_BLOCK_EXT_TEXT_OPS..END_BLOCK_EXT_TEXT_OPS region (edit-free consumer).
//   region - Slices a marker-delimited source region between two markers.
//   countMatches - Counts regex matches in a text slice.
// END_MODULE_MAP
// START_CHANGE_SUMMARY
//   LAST_CHANGE: 2026-11-24 C-SURFACE-OWNERSHIP: the structural one-definition-owner suite (meaningful-proof pins — NO behavioral red-first is claimed for the predicate collapse; recorded honestly per spec AC 2).
// END_CHANGE_SUMMARY
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const source = readFileSync(
  join(__dirname, '../../../src/renderer/src/components/editorWithTabs/editor.vue'),
  'utf8'
)

const region = (startMarker, endMarker) => {
  const start = source.indexOf(startMarker)
  const end = source.indexOf(endMarker)
  expect(start, startMarker).toBeGreaterThan(-1)
  expect(end, endMarker).toBeGreaterThan(start)
  return source.slice(start, end)
}

const block = region('// START_BLOCK_SURFACE_OWNERSHIP', '// END_BLOCK_SURFACE_OWNERSHIP')
const extZone = region('// START_BLOCK_EXT_TEXT_OPS', '// END_BLOCK_EXT_TEXT_OPS')

const countMatches = (text, regex) => (text.match(regex) || []).length

describe('editor surface ownership (structural one-definition-owner)', () => {
  it('owns each surface answer exactly once inside START_BLOCK_SURFACE_OWNERSHIP', () => {
    // One-definition-owner: each answer has exactly one definition site in the file, and that site sits in the block.
    for (const [name, definition] of [
      ['isReadOnlySurface', /const isReadOnlySurface = computed\(/g],
      ['isMirrorSurface', /const isMirrorSurface = computed\(/g],
      ['followsStore', /const followsStore = \(\) =>/g],
      ['unified', /const unified = \(\) =>/g],
      ['sourceFocused', /const sourceFocused = \(\) =>/g],
      ['renderedTabId', /let renderedTabId = null/g],
      ['renderedDocumentOwner', /let renderedDocumentOwner = null/g]
    ]) {
      expect(countMatches(source, definition), `${name} definition sites in the file`).toBe(1)
      expect(countMatches(block, definition), `${name} definition inside the block`).toBe(1)
    }
    // The pair's one owned writer sets both values in one place.
    expect(countMatches(source, /const writeRenderedIdentity = \(tab\) =>/g)).toBe(1)
    expect(countMatches(block, /const writeRenderedIdentity = \(tab\) =>/g)).toBe(1)
  })

  it('owns the save-authority answer at its OWNED_SAVE_SNAPSHOT registration, consumed verbatim', () => {
    // START_BLOCK_OWNED_SAVE_SNAPSHOT markers are fixed predecessors
    // (C-SPLIT-SAVE-AUTHORITY): the axis keeps its exact arrow inside that
    // registration and is never redefined elsewhere.
    expect(countMatches(source, /isAuthoritative: \(\) => !props\.mirror/g)).toBe(1)
    expect(countMatches(source, /registerDocumentSurface\(/g)).toBe(1)
    expect(block).toContain('START_BLOCK_OWNED_SAVE_SNAPSHOT')
  })

  it('collapses the four provably redundant disjuncts into the owned predicate', () => {
    // BaselineAssertions recombination strings — gone by inclusion
    // (locked and mirror are disjuncts of the read-only predicate).
    expect(source).not.toContain('if (isReadOnlySurface.value || currentFile.value?.locked) return')
    expect(source).not.toContain('if (props.mirror || isReadOnlySurface.value) return')
  })

  it('keeps the ext targeting zone edit-free on the raw rendered identity', () => {
    // No owned axis-predicate name is referenced inside the ext zone —
    // its handlers keep consuming the raw identity pair byte-identically
    // (the zone's pre-existing unified()/sourceFocused() calls are part of
    // that frozen baseline and are not re-sourced).
    for (const owned of ['isReadOnlySurface', 'isMirrorSurface', 'followsStore', 'isAuthoritative']) {
      expect(extZone).not.toContain(owned)
    }
    expect(extZone).toMatch(/const extBindingMatchesRendered/)
    expect(extZone).toMatch(/renderedTabId === documentId &&/)
  })
})
