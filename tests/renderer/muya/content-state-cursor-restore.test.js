// FILE: tests/renderer/muya/content-state-cursor-restore.test.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Pin ContentState cursor restoration when accumulated commands leave no complete selection (FIX-012).
//   SCOPE: Null/incomplete cursor handoff, valid cursor forwarding, and null-cursor render range.
//   DEPENDS: src/muya/lib/contentState/index.js, src/muya/lib/selection/index.js, Vitest.
//   LINKS: .grace/graph/runtime.xml M-012; .grace/verification/runtime.xml V-M-012; .grace/changes/archive/C-FIX-012-CURSOR-RESTORE-GUARD.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   validCursor - Creates a complete collapsed cursor fixture that is safe to forward to DOM selection.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - 2026-10-20 FIX-012: skip invalid selection restoration and retain a full render range without a cursor.
// END_CHANGE_SUMMARY

import { afterEach, describe, expect, it, vi } from 'vitest'
import ContentState from 'muya/lib/contentState'
import selection from 'muya/lib/selection'

const validCursor = () => ({
  anchor: { key: 'a', offset: 0 },
  focus: { key: 'a', offset: 0 }
})

describe('ContentState cursor restore guard (FIX-012)', () => {
  afterEach(() => vi.restoreAllMocks())

  it.each([null, {}, { anchor: { key: 'a' } }, { focus: { key: 'a' } }])(
    'does not restore an incomplete cursor: %j',
    (cursor) => {
      const setCursorRange = vi.spyOn(selection, 'setCursorRange').mockImplementation(() => {})

      ContentState.prototype.setCursor.call({ cursor })

      expect(setCursorRange).not.toHaveBeenCalled()
    }
  )

  it('forwards a complete cursor unchanged', () => {
    const cursor = validCursor()
    const setCursorRange = vi.spyOn(selection, 'setCursorRange').mockImplementation(() => {})

    ContentState.prototype.setCursor.call({ cursor })

    expect(setCursorRange).toHaveBeenCalledWith(cursor)
  })

  it('uses the full render range when cursor state is null', () => {
    const fixture = { cursor: null, renderRange: ['before', 'after'], getBlock: vi.fn() }

    ContentState.prototype.setNextRenderRange.call(fixture)

    expect(fixture.renderRange).toEqual([null, null])
    expect(fixture.getBlock).not.toHaveBeenCalled()
  })
})
