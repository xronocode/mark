// FILE: tests/renderer/muya/footnote-options.test.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Reproduce the open-document footnote toggle bug with the real Muya parser and renderer.
//   SCOPE: Both toggle directions, source/selection/scroll preservation, no content/history mutation, and undo/redo across a grammar change.
//   DEPENDS: muya/lib, Vitest, jsdom.
//   LINKS: .grace/changes/archive/C-60; .grace/verification/runtime.xml V-M-012.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
// START_MODULE_MAP
//   MARKDOWN - a named footnote fixture with adjacent definitions and inline formatting.
//   editors - mounted Muya instances released after each test.
//   mountEditor - constructs the real editor and drains its initial change notification.
//   footnoteCount - counts rendered definition figures, not inline reference-looking links.
// END_MODULE_MAP
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - 2026-10-18 C-60: old-code proof for live footnote option changes and editing-state preservation.
// END_CHANGE_SUMMARY

import { afterEach, describe, expect, it, vi } from 'vitest'
import Muya from 'muya/lib'

const MARKDOWN = '# Report\n\nA paragraph with a note[^history] and **bold** text.\n\nAnother paragraph.\n\n[^history]: Evidence with `code` and a [link](https://example.com).\n\n[^other]: Second note.\n'
const editors = []

async function mountEditor(footnote) {
  const root = document.createElement('div')
  document.body.appendChild(root)
  const muya = new Muya(root, { markdown: MARKDOWN, footnote })
  editors.push(muya)
  await new Promise(resolve => setTimeout(resolve, 0))
  return muya
}

function footnoteCount(muya) {
  return muya.container.querySelectorAll('figure[data-role="FOOTNOTE"]').length
}

afterEach(() => {
  for (const muya of editors.splice(0)) {
    clearTimeout(muya.contentState.historyTimer)
    const container = muya.container
    // The parser harness does not install the optional UI plugins that
    // Muya.destroy expects; release its actual state/listeners directly.
    muya.contentState.clear()
    muya.resize.destroy()
    muya.eventCenter.detachAllDomEvents()
    container.remove()
  }
})

describe('live footnote option (C-60)', () => {
  // START_BLOCK_FOOTNOTE_TOGGLE_REGRESSION
  it('turns existing definition paragraphs into footnotes and back without reopening', async () => {
    const muya = await mountEditor(false)
    expect(footnoteCount(muya)).toBe(0)
    const before = muya.getMarkdown()
    muya.setOptions({ footnote: true }, true)
    expect(footnoteCount(muya)).toBe(2)
    expect(muya.getMarkdown()).toBe(before)
    muya.setOptions({ footnote: false }, true)
    expect(footnoteCount(muya)).toBe(0)
    expect(muya.getMarkdown()).toBe(before)
  })

  it('keeps selection, scroll, history and text without emitting a content change', async () => {
    const muya = await mountEditor(false)
    const state = muya.contentState
    const paragraph = state.blocks[1].children[0]
    state.cursor = {
      anchor: { key: paragraph.key, offset: 2 },
      focus: { key: paragraph.key, offset: 13 },
      noHistory: true
    }
    const cursor = state.getMuyaIndexCursor()
    const { stack, index, lastEditIndex } = state.getHistory()
    const length = stack.length
    const changed = vi.fn()
    muya.on('change', changed)
    muya.container.scrollTop = 123
    muya.container.scrollLeft = 17
    muya.setOptions({ footnote: true }, true)
    expect(footnoteCount(muya)).toBe(2)
    expect(state.getMuyaIndexCursor()).toEqual(cursor)
    expect(state.getHistory()).toEqual({ stack, index, lastEditIndex })
    expect(stack).toHaveLength(length)
    expect(muya.container.scrollTop).toBe(123)
    expect(muya.container.scrollLeft).toBe(17)
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(changed).not.toHaveBeenCalled()
    expect(muya.getMarkdown()).toBe(MARKDOWN)
  })

  it.each([false, true])('keeps undo/redo in the current grammar after starting with footnote=%s', async initial => {
    const muya = await mountEditor(initial)
    const state = muya.contentState
    const paragraph = state.blocks[1].children[0]
    paragraph.text += ' Unsaved edit.'
    state.cursor = {
      start: { key: paragraph.key, offset: paragraph.text.length },
      end: { key: paragraph.key, offset: paragraph.text.length },
      isEdit: true
    }
    state.history.commitPending()
    const edited = muya.getMarkdown()
    const index = state.history.index
    muya.setOptions({ footnote: !initial }, true)
    expect(state.history.index).toBe(index)
    expect(muya.getMarkdown()).toBe(edited)
    state.history.undo()
    expect(muya.getMarkdown()).toBe(MARKDOWN)
    expect(footnoteCount(muya)).toBe(initial ? 0 : 2)
    state.history.redo()
    expect(muya.getMarkdown()).toBe(edited)
    expect(footnoteCount(muya)).toBe(initial ? 0 : 2)
  })

  it('keeps existing blocks for unchanged footnotes and ordinary view options', async () => {
    const muya = await mountEditor(true)
    const blocks = muya.contentState.blocks
    muya.setOptions({ footnote: true }, true)
    muya.setOptions({ codeBlockLineNumbers: true }, true)
    expect(muya.contentState.blocks).toBe(blocks)
  })

  it.each([0, 1, 2, 7, 9, 10, 11, 12, 20])('keeps the definition intact with the caret at source offset %s', async offset => {
    const muya = await mountEditor(false)
    const state = muya.contentState
    const definition = state.blocks.find(block => block.children[0]?.text.startsWith('[^history]:')).children[0]
    state.cursor = {
      start: { key: definition.key, offset },
      end: { key: definition.key, offset },
      noHistory: true
    }
    muya.setOptions({ footnote: true }, true)
    expect(footnoteCount(muya)).toBe(2)
    expect(muya.getMarkdown()).toBe(MARKDOWN)
  })
  // END_BLOCK_FOOTNOTE_TOGGLE_REGRESSION
})
