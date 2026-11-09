// FILE: tests/renderer/components/split-anchor.test.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Verify C-SPLIT-SCROLL-SYNC T-302/T-303 wiring — the split
//            anchor blocks exist and are wired where the plan requires:
//            editor.vue re-centers on splitActive transitions with a
//            caret-first/last-fraction anchor and stashes that fraction
//            from real scrolls; sourceCode.vue pairs both instances and
//            aligns/re-anchors; index.vue passes :split-active down.
//   SCOPE: Source-level pins (readSource) over the three components plus
//            anchor-math sanity through the exported helpers.
//   DEPENDS: Vitest, node:fs, util/splitScrollSync.js.
//   LINKS: .grace/verification/runtime.xml V-M-011 split anchor scenarios (C-SPLIT-SCROLL-SYNC).
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   ROOT - repo root resolver for source pins.
//   readSource - reads a repo file for source-level presence pins.
//   EDITOR - editor.vue path for source pins.
//   SOURCE - sourceCode.vue path for source pins.
//   INDEX - index.vue path for source pins.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - C-SPLIT-SCROLL-SYNC T-302/T-303 initial pins.
// END_CHANGE_SUMMARY

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { computeAnchorTarget } from '@/util/splitScrollSync'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const readSource = (rel) => readFileSync(path.join(ROOT, rel), 'utf8')

const EDITOR = 'src/renderer/src/components/editorWithTabs/editor.vue'
const SOURCE = 'src/renderer/src/components/editorWithTabs/sourceCode.vue'
const INDEX = 'src/renderer/src/components/editorWithTabs/index.vue'

describe('split anchor wiring (C-SPLIT-SCROLL-SYNC)', () => {
  it('editor.vue re-anchors on splitActive transitions with a caret-first anchor', () => {
    const src = readSource(EDITOR)
    expect(src).toContain('START_BLOCK_SPLIT_ANCHOR_SYNC')
    expect(src).toContain('reanchorSplit')
    expect(src).toContain('caretContentOffset')
    // caret-first, fraction fallback, other-pane alignment
    expect(src).toContain('computeAnchorTarget')
    expect(src).toContain('setScrollFraction')
    expect(src).toContain("splitScrollSync.align('source'")
    // the fraction fallback is stashed from real scrolls, not measured
    // post-reflow
    expect(src).toContain('lastSurfaceFraction')
    // width observer keeps the anchor through divider drags
    expect(src).toContain('observeAnchorWidth')
    // lifecycle: attach on mount, detach on unmount
    expect(src).toContain("splitScrollSync.attach('rich'")
    expect(src).toContain("splitScrollSync.detach('rich'")
  })

  it('sourceCode.vue pairs both instances and aligns to the rich pane', () => {
    const src = readSource(SOURCE)
    expect(src).toContain('START_BLOCK_SPLIT_ALIGN_SYNC')
    expect(src).toContain('reanchorSourcePane')
    expect(src).toContain('alignToFraction')
    // the single editable instance mounts paired (mirror branch retired)
    expect(src.match(/splitScrollSync\.attach\('source'/g)?.length).toBe(1)
    expect(src).toContain("splitScrollSync.detach('source'")
    // pane-width changes re-anchor the editable pane while split is on
    expect(src).toContain('props.splitActive && !props.mirror')
  })

  it('index.vue passes split-active to the editor and the source-code instance, split-edit to the companion', () => {
    const src = readSource(INDEX)
    expect(src.match(/:split-active="active"/g)?.length).toBe(2)
    expect(src).toContain(':split-edit="active && !sourceCode"')
  })

  it('anchor math keeps a mid-document caret centered after a re-wrap', () => {
    // Caret 5000px into the content, pane 800px high, document 12000px:
    // centered means scrollTop 4600 (clamped inside [0, 11200]).
    expect(computeAnchorTarget({ anchorOffset: 5000, viewportHeight: 800, scrollHeight: 12000 })).toBe(4600)
    // A re-wrap that doubles the document height keeps the same centering
    // rule — the anchor offset is re-measured post-reflow by the caller.
    expect(computeAnchorTarget({ anchorOffset: 5000, viewportHeight: 800, scrollHeight: 24000 })).toBe(4600)
  })
})
