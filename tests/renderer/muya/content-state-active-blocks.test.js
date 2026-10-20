// FILE: tests/renderer/muya/content-state-active-blocks.test.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Pin ContentState active-block ancestry so transient missing parents never enter the renderer as undefined (FIX-012).
//   SCOPE: Direct getActiveBlocks prototype calls over valid, missing-immediate-parent and missing-deeper-parent fixtures.
//   DEPENDS: src/muya/lib/contentState/index.js, Vitest.
//   LINKS: .grace/graph/runtime.xml M-012; .grace/verification/runtime.xml V-M-012; .grace/changes/archive/C-FIX-012-ACTIVE-BLOCK-ANCESTRY.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   activeBlocksFor - Calls the real ContentState#getActiveBlocks method with a minimal indexed-block fixture.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - 2026-10-20 FIX-012: missing parents terminate the derived active chain; valid ancestry remains leaf-to-root.
// END_CHANGE_SUMMARY

import { describe, expect, it } from 'vitest'
import ContentState from 'muya/lib/contentState'

const activeBlocksFor = ({ cursorKey, blocks }) => {
  const byKey = new Map(blocks.map((block) => [block.key, block]))
  return ContentState.prototype.getActiveBlocks.call({
    cursor: { start: { key: cursorKey } },
    getBlock: (key) => byKey.get(key)
  })
}

describe('ContentState#getActiveBlocks ancestry integrity (FIX-012)', () => {
  it('returns valid ancestry from leaf to root', () => {
    const root = { key: 'root', parent: null }
    const middle = { key: 'middle', parent: 'root' }
    const leaf = { key: 'leaf', parent: 'middle' }

    expect(activeBlocksFor({ cursorKey: 'leaf', blocks: [root, middle, leaf] }))
      .toEqual([leaf, middle, root])
  })

  it('does not append undefined when the immediate parent is missing', () => {
    const leaf = { key: 'leaf', parent: 'missing' }

    expect(activeBlocksFor({ cursorKey: 'leaf', blocks: [leaf] })).toEqual([leaf])
  })

  it('keeps the valid prefix when a deeper parent is missing', () => {
    const middle = { key: 'middle', parent: 'missing-root' }
    const leaf = { key: 'leaf', parent: 'middle' }

    expect(activeBlocksFor({ cursorKey: 'leaf', blocks: [middle, leaf] }))
      .toEqual([leaf, middle])
  })
})
