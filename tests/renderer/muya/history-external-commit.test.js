// FILE: tests/renderer/muya/history-external-commit.test.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Verify C-SPLIT-DUAL-EDIT T-323 — the muya History external-commit path: flushPendingExternal commits a pending edit, commitExternal pushes the post-external state as exactly one undoable entry carrying renderer meta, and undo/redo traverse external and native entries in one linear document history.
//   SCOPE: History class against a stub contentState (blocks/cursor/renderRange/render spy); no DOM.
//   DEPENDS: Vitest, muya/lib/contentState/history.js.
//   LINKS: .grace/verification/runtime.xml V-M-012 split dual-edit history scenarios (C-SPLIT-DUAL-EDIT).
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   makeCs - stub contentState whose blocks/cursor the tests mutate between commits.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - C-SPLIT-DUAL-EDIT T-323 initial pins.
// END_CHANGE_SUMMARY

import { describe, expect, it, vi } from 'vitest'
import History from 'muya/lib/contentState/history'

const makeCs = (blocks) => {
  const cs = {
    blocks,
    cursor: { start: { key: 'a', offset: 0 }, end: { key: 'a', offset: 0 }, isEdit: false },
    renderRange: null,
    muya: null,
    render: vi.fn()
  }
  return cs
}

describe('History external commit (C-SPLIT-DUAL-EDIT)', () => {
  it('owns exact Markdown and both carets in one step, without caret-only entries', () => {
    const cs = makeCs([])
    cs.muya = { options: {}, setMarkdown: vi.fn() }
    const h = new History(cs)
    h.enableUnified('* original\n', { rich: { anchor: { line: 0, ch: 2 }, focus: { line: 0, ch: 4 } } })
    h.commitDocument('* source edit\n', { source: { anchor: { line: 0, ch: 8 }, head: { line: 0, ch: 4 } } })
    h.commitDocument('* source edit\n', { source: { anchor: { line: 0, ch: 3 }, head: { line: 0, ch: 3 } } })
    expect(h.stack).toHaveLength(2)
    h.undo()
    expect(cs.muya.setMarkdown).toHaveBeenLastCalledWith('* original\n', null, false, expect.anything(), undefined, { renderOnly: true })
    expect(h.index).toBe(0)
    h.redo()
    expect(h.stack[h.index].markdown).toBe('* source edit\n')
    expect(h.stack[h.index].meta.source.head.ch).toBe(3)
  })

  it('stores one bounded document payload per unified entry and constant-size caret metadata', () => {
    const cs = makeCs([{ text: 'old blocks' }])
    const h = new History(cs)
    h.push({ blocks: cs.blocks, cursor: cs.cursor })
    h.enableUnified('x'.repeat(100000), { selectedSourceText: 'x'.repeat(100000) })
    for (let i = 0; i < 100; i++) h.commitDocument(`next ${i}`, { selectedSourceText: 'x'.repeat(100000), source: { anchor: { line: 0, ch: 0 }, head: { line: 0, ch: 1 } } }, true)
    expect(h.stack).toHaveLength(2)
    for (const entry of h.stack) {
      expect(entry.blocks).toBeUndefined()
      expect(entry.renderRange).toBeUndefined()
      expect(JSON.stringify(entry.meta).length).toBeLessThan(150)
    }
  })

  it('retains native pre-split content edits while collapsing only adjacent caret snapshots', () => {
    const cs = makeCs([{ key: 'a', text: 'original' }])
    cs.muya = { options: {}, setMarkdown: vi.fn() }
    const h = new History(cs)
    h.push({ blocks: cs.blocks, cursor: cs.cursor })
    h.push({ blocks: cs.blocks, cursor: { ...cs.cursor, start: { key: 'a', offset: 2 } } })
    cs.blocks = [{ key: 'a', text: 'native before split' }]
    h.push({ blocks: cs.blocks, cursor: { ...cs.cursor, isEdit: true } })
    h.push({ blocks: cs.blocks, cursor: cs.cursor })
    h.enableUnified('native before split')
    expect(h.stack).toHaveLength(2)
    expect(h.stack[1].cursor.isEdit).toBe(true)
    h.commitDocument('source after split')
    h.undo()
    expect(h.stack[h.index].markdown).toBe('native before split')
    h.undo()
    expect(cs.blocks[0].text).toBe('original')
    expect(h.index).toBe(0)
    expect(h.stack).toHaveLength(3)
    h.redo()
    expect(h.stack[h.index].markdown).toBe('native before split')
  })
  it('commitExternal pushes exactly one entry carrying the renderer meta', () => {
    const cs = makeCs([{ key: 'a', text: 'one' }])
    const h = new History(cs)
    // muya's own load pushes the initial state (non-edit cursor path).
    h.push({ blocks: cs.blocks, renderRange: null, cursor: cs.cursor })

    cs.blocks = [{ key: 'a', text: 'one edited from source' }]
    h.commitExternal({ source: 'cm', cmCursor: { line: 0, ch: 3 } })

    expect(h.stack).toHaveLength(2)
    expect(h.index).toBe(1)
    expect(h.stack[1].meta).toEqual({ source: 'cm', cmCursor: { line: 0, ch: 3 } })
    expect(h.stack[1].cursor.isEdit).toBe(true)
  })

  it('undo/redo traverse native and external entries in one linear history', () => {
    const cs = makeCs([{ key: 'a', text: 'v0' }])
    const h = new History(cs)
    h.push({ blocks: cs.blocks, renderRange: null, cursor: cs.cursor })

    // Native muya edit -> v1.
    cs.blocks = [{ key: 'a', text: 'v1 native' }]
    h.push({ blocks: cs.blocks, renderRange: null, cursor: { ...cs.cursor, isEdit: true } })

    // External source-pane commit -> v2.
    cs.blocks = [{ key: 'a', text: 'v2 external' }]
    h.flushPendingExternal()
    h.commitExternal({ source: 'cm', cmCursor: { line: 0, ch: 0 } })

    // Native again -> v3.
    cs.blocks = [{ key: 'a', text: 'v3 native' }]
    h.push({ blocks: cs.blocks, renderRange: null, cursor: { ...cs.cursor, isEdit: true } })

    expect(h.stack).toHaveLength(4)

    // Three undos revert v3, then the EXTERNAL v2, then v1 — document order.
    h.undo(); expect(cs.blocks[0].text).toBe('v2 external')
    h.undo(); expect(cs.blocks[0].text).toBe('v1 native')
    h.undo(); expect(cs.blocks[0].text).toBe('v0')
    // Redo replays in order, external entry included, meta intact.
    h.redo(); expect(cs.blocks[0].text).toBe('v1 native')
    h.redo(); expect(cs.blocks[0].text).toBe('v2 external')
    expect(h.stack[h.index].meta).toEqual({ source: 'cm', cmCursor: { line: 0, ch: 0 } })
    h.redo(); expect(cs.blocks[0].text).toBe('v3 native')
  })

  it('flushPendingExternal commits a pending edit so an external commit cannot split it', () => {
    const cs = makeCs([{ key: 'a', text: 'pending text' }])
    const h = new History(cs)
    h.push({ blocks: [{ key: 'a', text: 'start' }], renderRange: null, cursor: cs.cursor })
    h.pushPending({ blocks: cs.blocks, renderRange: null, cursor: { ...cs.cursor, isEdit: true } })
    expect(h.pendingIndex).not.toBe(-1)

    h.flushPendingExternal()
    expect(h.pendingIndex).toBe(-1)
    // The pending state is on the stack as the current state.
    expect(h.stack[h.index].blocks[0].text).toBe('pending text')
  })

  it('a lone external commit on a fresh document is still undoable', () => {
    const cs = makeCs([{ key: 'a', text: 'fresh' }])
    const h = new History(cs)
    h.push({ blocks: cs.blocks, renderRange: null, cursor: cs.cursor })

    cs.blocks = [{ key: 'a', text: 'external edit' }]
    h.commitExternal({ source: 'cm' })

    h.undo()
    expect(cs.blocks[0].text).toBe('fresh')
    h.redo()
    expect(cs.blocks[0].text).toBe('external edit')
  })
})
