// FILE: tests/renderer/util/split-dual-edit.test.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Verify C-SPLIT-DUAL-EDIT T-325 helpers — caret translation/clamping across text changes and the IME composition fence state machine.
//   SCOPE: Pure function assertions, no DOM.
//   DEPENDS: Vitest, util/splitDualEdit.js.
//   LINKS: .grace/verification/runtime.xml V-M-011 split dual-edit scenarios (C-SPLIT-DUAL-EDIT).
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   ROOT_CARET - Document-start endpoint used for invalid-text clamping.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   - 2026-11-10 C-STABILIZE-SPLIT-VERIFICATION: syntax delta/fallback and caret/composition lifecycle boundaries.
//   LAST_CHANGE: v1.0.0 - C-SPLIT-DUAL-EDIT T-325 initial pins.
// END_CHANGE_SUMMARY

import { describe, expect, it } from 'vitest'
import { createCompositionFence, preserveSourceSyntax, translateAndClamp } from '@/util/splitDualEdit'

const ROOT_CARET = { line: 0, ch: 0 }

describe('translateAndClamp', () => {
  it('translates an inactive caret through inserted and deleted lines', () => {
    expect(translateAndClamp({ line: 1, ch: 3 }, 'one\ntarget\nend', 'new\none\ntarget\nend')).toEqual({ line: 2, ch: 3 })
    expect(translateAndClamp({ line: 2, ch: 3 }, 'new\none\ntarget\nend', 'one\ntarget\nend')).toEqual({ line: 1, ch: 3 })
  })

  it('translates a selection endpoint through an insertion before it on the same line', () => {
    expect(translateAndClamp({ line: 0, ch: 6 }, 'hello world', 'hello beautiful world')).toEqual({ line: 0, ch: 16 })
  })
  it('keeps the caret position when the text around it is unchanged', () => {
    expect(translateAndClamp({ line: 2, ch: 5 }, 'a\nb\ncdefg\nh')).toEqual({ line: 2, ch: 5 })
  })

  it('clamps the column into a shortened line instead of jumping to the start', () => {
    expect(translateAndClamp({ line: 2, ch: 5 }, 'a\nb\ncd\ng')).toEqual({ line: 2, ch: 2 })
  })

  it('moves a caret whose line was deleted to the document end, never the start', () => {
    expect(translateAndClamp({ line: 6, ch: 0 }, 'a\nb')).toEqual({ line: 1, ch: 0 })
  })

  it('clamps negative positions and rejects garbage', () => {
    expect(translateAndClamp({ line: -3, ch: -1 }, 'ab')).toEqual({ line: 0, ch: 0 })
    expect(translateAndClamp(null, 'ab')).toBe(null)
    expect(translateAndClamp({ line: 0 }, 'ab')).toBe(null)
    expect(translateAndClamp(ROOT_CARET, null)).toBe(null)
  })
})

describe('createCompositionFence', () => {
  it('defers only while armed and reports the deferred flag on release', () => {
    const fence = createCompositionFence()
    // Idle: nothing is deferred.
    expect(fence.markDeferred()).toBe(false)
    // Composing: the re-render is deferred exactly once.
    fence.arm()
    expect(fence.isArmed()).toBe(true)
    expect(fence.markDeferred()).toBe(true)
    expect(fence.markDeferred()).toBe(true)
    // compositionend: release reports the pending flush and disarms.
    expect(fence.release()).toBe(true)
    expect(fence.isArmed()).toBe(false)
    expect(fence.markDeferred()).toBe(false)
    // A second release without a new composition is a no-op.
    expect(fence.release()).toBe(false)
  })
})


describe('caret and syntax preservation boundaries', () => {
  it.each([
    [{ line: Infinity, ch: 0 }], [{ line: 0, ch: NaN }], [{ line: '0', ch: 0 }], [{ line: 0, ch: '0' }]
  ])('rejects a non-finite or non-numeric caret: %j', (position) => {
    expect(translateAndClamp(position, 'text')).toBe(null)
  })

  it('clamps both endpoints independently after a selected multiline span is deleted', () => {
    expect(translateAndClamp({ line: 0, ch: 2 }, 'aabb\nccdd\nend', 'aaend')).toEqual({ line: 0, ch: 2 })
    expect(translateAndClamp({ line: 1, ch: 4 }, 'aabb\nccdd\nend', 'aaend')).toEqual({ line: 0, ch: 2 })
  })

  it('clamps an out-of-range old caret before mapping through a new line', () => {
    expect(translateAndClamp({ line: 99, ch: 99 }, 'old', 'new\nold')).toEqual({ line: 1, ch: 3 })
    expect(translateAndClamp({ line: -1, ch: -1 }, 'old', 'old!')).toEqual({ line: 0, ch: 0 })
  })

  it('handles empty documents and legacy clamping without requiring previous text', () => {
    expect(translateAndClamp({ line: 7, ch: 8 }, '')).toEqual({ line: 0, ch: 0 })
    expect(translateAndClamp({ line: 1, ch: 2 }, null, 'a\nbcd')).toEqual({ line: 1, ch: 2 })
    expect(translateAndClamp({ line: 0, ch: 9 }, 'deleted', '')).toEqual({ line: 0, ch: 0 })
  })

  it('keeps exact source when rich serialization has no actual edit', () => {
    expect(preserveSourceSyntax('- item  \n\n', '* item\n', '* item\n')).toBe('- item  \n\n')
  })

  it('uses the native rich change directly when source already matches its baseline', () => {
    expect(preserveSourceSyntax('before', 'before', 'after')).toBe('after')
  })

  it('merges a rich word edit without normalizing unrelated raw list and fence syntax', () => {
    const raw = '- first  \n- second\n\n~~~js\nconst n = 1\n~~~\n'
    const richBefore = '* first\n* second\n\n```js\nconst n = 1\n```\n'
    const richAfter = '* first\n* changed\n\n```js\nconst n = 1\n```\n'
    expect(preserveSourceSyntax(raw, richBefore, richAfter))
      .toBe('- first  \n- changed\n\n~~~js\nconst n = 1\n~~~\n')
  })

  it('falls back to the complete rich edit when its baseline cannot be found in raw text', () => {
    expect(preserveSourceSyntax('unrelated raw document', 'The old paragraph has a unique long body.', 'The new paragraph has a unique long body.'))
      .toBe('The new paragraph has a unique long body.')
  })
})

describe('composition fence lifecycle boundaries', () => {
  it('releases an unmodified composition without requesting a render', () => {
    const fence = createCompositionFence()
    expect(fence.isArmed()).toBe(false)
    expect(fence.release()).toBe(false)
    fence.arm()
    expect(fence.release()).toBe(false)
    expect(fence.isArmed()).toBe(false)
  })

  it('starts each new composition with a fresh deferred-render flag', () => {
    const fence = createCompositionFence()
    fence.arm()
    expect(fence.markDeferred()).toBe(true)
    fence.arm()
    expect(fence.isArmed()).toBe(true)
    expect(fence.release()).toBe(false)
    fence.arm()
    expect(fence.markDeferred()).toBe(true)
    expect(fence.release()).toBe(true)
    expect(fence.release()).toBe(false)
  })

  it('keeps composition and deferred state private to each pane', () => {
    const source = createCompositionFence()
    const rich = createCompositionFence()
    source.arm()
    expect(rich.markDeferred()).toBe(false)
    expect(source.markDeferred()).toBe(true)
    expect(rich.release()).toBe(false)
    expect(source.isArmed()).toBe(true)
    expect(source.release()).toBe(true)
    rich.arm()
    expect(source.markDeferred()).toBe(false)
    expect(rich.release()).toBe(false)
  })
})
