// FILE: tests/renderer/muya/copy-cut-stale-selection.test.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Verify FIX-019 — table-cell/image selection flags whose anchor block is gone no longer swallow cut/copy of normal text, and setMarkdown resets both flags when other content loads.
//   SCOPE: ContentState.prototype.clearStaleSelections (stale vs live anchors), copyHandler/cutHandler/docCutHandler fall-through on stale flags and preserved live table branch, Muya.prototype.setMarkdown flag reset.
//   DEPENDS: src/muya/lib/contentState (prototype installation), src/muya/lib (Muya.prototype.setMarkdown), muya selection module (mocked), Vitest, jsdom.
//   LINKS: .grace/graph/runtime.xml M-012 fn-clearStaleSelections; .grace/verification/runtime.xml V-M-012; FIX-019.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   makeCs - minimal ContentState stub: muya container/dispatchChange, getBlock resolver, writable selection flags.
//   makeClipboardEvent - preventDefault spy + clipboardData.setData spy.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - FIX-019 initial coverage: stale-selection guard on every cut/copy entry point and the setMarkdown reset.
// END_CHANGE_SUMMARY

import { describe, expect, it, vi } from 'vitest'
import ContentState from 'muya/lib/contentState'
import Muya from 'muya/lib'

vi.mock('muya/lib/selection', () => ({
  default: {
    getCursorRange: () => ({
      start: { key: 'p1', offset: 2 },
      end: { key: 'p1', offset: 5 }
    })
  }
}))

void Muya // importing muya/lib applies the ContentState prototype modifiers

function makeCs(getBlock) {
  // Object.create keeps the real prototype chain: handlers reach
  // clearStaleSelections, and the selectedTableCells/selectedImage
  // assignments run through the real class setters.
  const cs = Object.create(ContentState.prototype)
  cs.muya = {
    container: { querySelectorAll: () => [] },
    dispatchChange: vi.fn()
  }
  cs.getBlock = getBlock
  // Shadow the class cursor accessor (history-commit side effects) with a
  // plain own property — this suite pins the stale-selection mechanics only.
  Object.defineProperty(cs, 'cursor', { value: null, writable: true, configurable: true })
  cs.selectedTableCells = null
  cs.selectedImage = null
  return cs
}

function makeClipboardEvent() {
  return {
    preventDefault: vi.fn(),
    clipboardData: { setData: vi.fn() }
  }
}

describe('ContentState#clearStaleSelections (FIX-019)', () => {
  it('drops a table-cell selection whose table block no longer exists', () => {
    const cs = makeCs((key) => (key === 'live-table' ? { key } : null))
    cs.selectedTableCells = { tableId: 'gone-table' }
    ContentState.prototype.clearStaleSelections.call(cs)
    expect(cs.selectedTableCells).toBeNull()
  })

  it('keeps a table-cell selection whose table block still exists', () => {
    const cs = makeCs((key) => (key === 'live-table' ? { key } : null))
    cs.selectedTableCells = { tableId: 'live-table' }
    ContentState.prototype.clearStaleSelections.call(cs)
    expect(cs.selectedTableCells).toEqual({ tableId: 'live-table' })
  })

  it('drops a selected image whose block no longer exists', () => {
    const cs = makeCs((key) => (key === 'live-img' ? { key } : null))
    cs.selectedImage = { key: 'gone-img', token: { raw: '![x](x.png)' } }
    ContentState.prototype.clearStaleSelections.call(cs)
    expect(cs.selectedImage).toBeNull()
  })
})

describe('stale selections no longer swallow cut/copy (FIX-019)', () => {
  it('copyHandler writes the normal text payload when the table flag is stale', () => {
    const cs = makeCs(() => null)
    cs.selectedTableCells = { tableId: 'gone-table' }
    cs.getClipBoardData = () => ({ html: '<p>hello</p>', text: 'hello' })
    const event = makeClipboardEvent()
    ContentState.prototype.copyHandler.call(cs, event, 'normal')
    expect(event.preventDefault).toHaveBeenCalled()
    expect(event.clipboardData.setData).toHaveBeenCalledWith('text/plain', 'hello')
  })

  it('cutHandler deletes the cursor range when the table flag is stale', () => {
    const block = { key: 'p1', text: 'abcdefgh' }
    const cs = makeCs((key) => (key === 'p1' ? block : null))
    cs.selectedTableCells = { tableId: 'gone-table' }
    cs.removeBlocks = vi.fn()
    cs.checkInlineUpdate = vi.fn()
    cs.partialRender = vi.fn()
    ContentState.prototype.cutHandler.call(cs)
    expect(block.text).toBe('abfgh')
    expect(cs.partialRender).toHaveBeenCalled()
    expect(cs.muya.dispatchChange).toHaveBeenCalled()
  })

  it('docCutHandler leaves the default action alone when the table flag is stale', () => {
    const cs = makeCs(() => null)
    cs.selectedTableCells = { tableId: 'gone-table' }
    cs.deleteSelectedTableCells = vi.fn()
    const event = makeClipboardEvent()
    ContentState.prototype.docCutHandler.call(cs, event)
    expect(event.preventDefault).not.toHaveBeenCalled()
    expect(cs.deleteSelectedTableCells).not.toHaveBeenCalled()
  })

  it('docCutHandler still cuts a live table selection (no FIX-019 regression)', () => {
    const cs = makeCs((key) => (key === 'live-table' ? { key } : null))
    cs.selectedTableCells = { tableId: 'live-table' }
    cs.deleteSelectedTableCells = vi.fn(() => 'deleted')
    const event = makeClipboardEvent()
    ContentState.prototype.docCutHandler.call(cs, event)
    expect(event.preventDefault).toHaveBeenCalled()
    expect(cs.deleteSelectedTableCells).toHaveBeenCalledWith(true)
  })

  it('copyHandler still hands a live table selection to docCopyHandler (no regression)', () => {
    const cs = makeCs((key) => (key === 'live-table' ? { key } : null))
    cs.selectedTableCells = { tableId: 'live-table' }
    cs.getClipBoardData = vi.fn()
    const event = makeClipboardEvent()
    ContentState.prototype.copyHandler.call(cs, event, 'normal')
    expect(event.preventDefault).not.toHaveBeenCalled()
    expect(cs.getClipBoardData).not.toHaveBeenCalled()
  })
})

describe('Muya#setMarkdown resets document-scoped selections (FIX-019)', () => {
  it('nulls both selection flags when other content loads', () => {
    const cs = makeCs(() => null)
    cs.importMarkdown = vi.fn()
    cs.importCursor = vi.fn()
    cs.render = vi.fn()
    cs.selectedTableCells = { tableId: 'previous-doc-table' }
    cs.selectedImage = { key: 'previous-doc-image', token: { raw: '![x](x.png)' } }
    Muya.prototype.setMarkdown.call({ contentState: cs, dispatchChange: vi.fn() }, '# next doc')
    expect(cs.importMarkdown).toHaveBeenCalledWith('# next doc')
    expect(cs.selectedTableCells).toBeNull()
    expect(cs.selectedImage).toBeNull()
  })
})
