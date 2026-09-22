// FILE: tests/renderer/muya/paste-smart.test.js
// VERSION: 1.2.0
// START_MODULE_CONTRACT
//   PURPOSE: Verify the pasteHandler URL smart-paste branch (C-16 R-1) and pin the existing HTML sanitization + bitmap paste paths (R-2/R-3) without booting the full editor.
//   SCOPE: Prototype-level stub instances driving pasteHandler/standardizeHTML/pasteImage with synthetic clipboard payloads.
//   DEPENDS: src/muya/lib (prototype methods), DOMPurify via muya utils, Vitest, jsdom.
//   LINKS: .grace/changes/active/C-16; .grace/graph/runtime.xml M-012; .grace/verification/runtime.xml V-M-012 — pins START_BLOCK_SMART_PASTE_URL in src/muya/lib/contentState/pasteCtrl.js.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   createPasteStub - ContentState-shaped stub with only the members pasteHandler touches, plus call recording.
//   runPaste - Invokes the real ContentState.prototype.pasteHandler on the stub with a paste type.
//   makeClipboardEvent - Synthetic paste event carrying text/plain + text/html payloads.
//   makeImageFileEvent - Synthetic paste event whose clipboardData.items expose an image File.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.2.0 - reviews 1+2: honest guards (URLs that actually match; mailto declined), bare-host wrap, bracket/backslash/newline label escaping, paren-URL decline, languageInput/cellContent/selectedTableCells decline cases; marker cross-reference for the C-16 plan grep gate.
//   v1.1.0 - review-1: guard cases use URLs that actually match (bare host + path forms), mailto pinned as declined; bracket-escaping case; bare-host wrap case.
//   v1.0.0 - C-16: URL-over-selection → [text](url); fall-through guards (empty selection, non-URL, code blocks); standardizeHTML adversarial sanitization pins; pasteImage items-branch pin.
// END_CHANGE_SUMMARY

import { describe, expect, it, vi } from 'vitest'
import Muya from 'muya/lib'
import ContentState from 'muya/lib/contentState'

async function runPaste (stub, event, type = 'normal') {
  return ContentState.prototype.pasteHandler.call(stub, event, type)
}

function createPasteStub ({ block, cursor, selectedTableCells = null } = {}) {
  const calls = { checkInlineUpdate: [], partialRender: 0, dispatchChange: 0, selectionChange: 0, selectionFormats: 0 }
  const muya = {
    dispatchSelectionChange: () => calls.selectionChange++,
    dispatchSelectionFormats: () => calls.selectionFormats++,
    dispatchChange: () => calls.dispatchChange++,
    // Needed only by the languageInput fall-through branch.
    eventCenter: { dispatch: () => {} }
  }
  return {
    calls,
    muya,
    cursor: cursor || { start: { key: 'b1', offset: 0 }, end: { key: 'b1', offset: 0 } },
    selectedTableCells,
    blocks: [block],
    getBlock: (key) => (block.key === key ? block : null),
    getParent: () => block,
    checkInlineUpdate: (b) => calls.checkInlineUpdate.push(b),
    partialRender: () => calls.partialRender++,
    // Fall-through pipeline members (only reached when the smart branch declines).
    standardizeHTML: async (html) => html,
    checkCopyType: () => 'normal',
    html2State: () => [],
    cutHandler: vi.fn(),
    pasteImage: async () => null,
    markdownToState: () => [],
    updateCodeLanguage: () => {}
  }
}

function makeClipboardEvent ({ text = '', html = '' } = {}) {
  return {
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
    clipboardData: {
      getData: (type) => (type === 'text/plain' ? text : type === 'text/html' ? html : '')
    }
  }
}

function makeImageFileEvent () {
  const file = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], 'shot.png', { type: 'image/png' })
  const items = [{ type: 'image/png', getAsFile: () => file }]
  return {
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
    clipboardData: { items, getData: () => '' }
  }
}

describe('pasteHandler — C-16 URL smart paste', () => {
  it('wraps a non-empty selection as a markdown link when pasting a bare URL', async () => {
    const block = { key: 'b1', type: 'span', text: 'read this now please', functionType: null }
    const stub = createPasteStub({
      block,
      cursor: { start: { key: 'b1', offset: 5 }, end: { key: 'b1', offset: 9 } } // "this"
    })

    await runPaste(stub, makeClipboardEvent({ text: 'https://example.com/docs' }))

    expect(block.text).toBe('read [this](https://example.com/docs) now please')
    expect(stub.calls.partialRender).toBe(1)
    expect(stub.calls.dispatchChange).toBe(1)
    expect(stub.calls.checkInlineUpdate).toHaveLength(1)
    // Cursor lands right after the inserted link.
    expect(stub.cursor.start.offset).toBe('read [this](https://example.com/docs)'.length)
    expect(stub.cursor.start.key).toBe('b1')
  })

  it('wraps a bare-host URL (no path) — the most common clipboard form', async () => {
    const block = { key: 'b1', type: 'span', text: 'read this now please', functionType: null }
    const stub = createPasteStub({
      block,
      cursor: { start: { key: 'b1', offset: 5 }, end: { key: 'b1', offset: 9 } } // "this"
    })

    await runPaste(stub, makeClipboardEvent({ text: 'https://github.com' }))

    expect(block.text).toBe('read [this](https://github.com) now please')
    expect(stub.calls.dispatchChange).toBe(1)
  })

  it('escapes brackets in the selection so they cannot break the link syntax', async () => {
    // Selection "[bar](baz" (offsets 4..13) contains raw brackets.
    const block = { key: 'b1', type: 'span', text: 'foo [bar](baz qux', functionType: null }
    const stub = createPasteStub({
      block,
      cursor: { start: { key: 'b1', offset: 4 }, end: { key: 'b1', offset: 13 } }
    })

    await runPaste(stub, makeClipboardEvent({ text: 'https://example.com/docs' }))

    expect(block.text).toBe('foo [\\[bar\\](baz](https://example.com/docs) qux')
    expect(stub.calls.dispatchChange).toBe(1)
  })

  it('escapes a trailing backslash and flattens a soft line break in the label', async () => {
    // Selection "foo\<newline>bar" (offsets 0..8): the backslash would
    // swallow the closing bracket, the newline would invalidate the label.
    const block = { key: 'b1', type: 'span', text: 'foo\\\nbar tail', functionType: null }
    const stub = createPasteStub({
      block,
      cursor: { start: { key: 'b1', offset: 0 }, end: { key: 'b1', offset: 8 } }
    })

    await runPaste(stub, makeClipboardEvent({ text: 'https://example.com/docs' }))

    expect(block.text).toBe('[foo\\\\ bar](https://example.com/docs) tail')
    expect(stub.calls.dispatchChange).toBe(1)
  })

  it('declines URLs containing parentheses so the destination cannot be truncated', async () => {
    const block = { key: 'b1', type: 'span', text: 'wrap me please', functionType: null }
    const stub = createPasteStub({
      block,
      cursor: { start: { key: 'b1', offset: 0 }, end: { key: 'b1', offset: 7 } }
    })

    await runPaste(stub, makeClipboardEvent({ text: 'https://x.com/] [click](https://phish.com' }))

    // Smart branch declined; fall-through fragments empty → no mutation.
    expect(block.text).toBe('wrap me please')
    expect(stub.calls.dispatchChange).toBe(0)
  })

  it('never hijacks code content, language input, or table cell surfaces', async () => {
    for (const functionType of ['codeContent', 'languageInput', 'cellContent']) {
      const block = { key: 'b1', type: 'span', text: 'target surface', functionType }
      const stub = createPasteStub({
        block,
        cursor: { start: { key: 'b1', offset: 0 }, end: { key: 'b1', offset: 6 } }
      })

      await runPaste(stub, makeClipboardEvent({ text: 'https://example.com/x' }))

      // The smart branch declined for every special surface — no link wrap.
      // (Their own fall-through branches may splice the URL as plain text.)
      expect(block.text).not.toContain('](https://example.com/x)')
      expect(stub.calls.dispatchChange).toBe(0)
    }
  })

  it('declines while table cells are selected', async () => {
    const block = { key: 'b1', type: 'span', text: 'cell text here', functionType: null }
    const stub = createPasteStub({
      block,
      cursor: { start: { key: 'b1', offset: 0 }, end: { key: 'b1', offset: 4 } },
      selectedTableCells: { row: 2, column: 2, cells: [] }
    })

    await runPaste(stub, makeClipboardEvent({ text: 'https://example.com/x' }))

    expect(block.text).toBe('cell text here')
    expect(stub.calls.dispatchChange).toBe(0)
  })

  it('leaves an empty selection to the existing plain-URL path', async () => {
    const block = { key: 'b1', type: 'span', text: 'hello', functionType: null }
    const stub = createPasteStub({ block, cursor: { start: { key: 'b1', offset: 0 }, end: { key: 'b1', offset: 0 } } })

    await runPaste(stub, makeClipboardEvent({ text: 'https://example.com/x' }))

    // Smart branch declined (collapsed selection); the fall-through pipeline
    // produced no fragments (html2State stub) so nothing was mutated.
    expect(block.text).toBe('hello')
    expect(stub.calls.dispatchChange).toBe(0)
  })

  it('does not hijack text containing spaces or non-URL text', async () => {
    const block = { key: 'b1', type: 'span', text: 'see the docs here', functionType: null }
    const stub = createPasteStub({
      block,
      cursor: { start: { key: 'b1', offset: 0 }, end: { key: 'b1', offset: 3 } }
    })

    await runPaste(stub, makeClipboardEvent({ text: 'see https://example.com now' }))
    await runPaste(stub, makeClipboardEvent({ text: 'just words' }))
    await runPaste(stub, makeClipboardEvent({ text: 'mailto:a@b.com' }))

    expect(block.text).toBe('see the docs here')
    expect(stub.calls.dispatchChange).toBe(0)
  })

  it('code content keeps its plain-text paste through the fall-through', async () => {
    const block = { key: 'b1', type: 'span', text: 'const x = 1', functionType: 'codeContent' }
    const stub = createPasteStub({
      block,
      cursor: { start: { key: 'b1', offset: 6 }, end: { key: 'b1', offset: 11 } } // "x = 1"
    })

    await runPaste(stub, makeClipboardEvent({ text: 'https://example.com/x' }))

    // The smart branch declined; the code-content branch pasted the URL as
    // plain text over the selection — the correct pre-existing behavior.
    expect(block.text).toBe('const https://example.com/x')
    expect(stub.calls.dispatchChange).toBe(0) // smart branch not taken
    expect(stub.calls.partialRender).toBeGreaterThanOrEqual(1) // code branch rendered
  })

  it('skips the smart branch for pasteAsPlainText regardless of selection', async () => {
    const block = { key: 'b1', type: 'span', text: 'wrap me please', functionType: null }
    const stub = createPasteStub({
      block,
      cursor: { start: { key: 'b1', offset: 0 }, end: { key: 'b1', offset: 7 } }
    })

    await runPaste(stub, makeClipboardEvent({ text: 'https://example.com/x' }), 'pasteAsPlainText')

    expect(block.text).toBe('wrap me please')
    expect(stub.calls.dispatchChange).toBe(0)
  })
})

describe('paste pipeline pins — C-16 R-2/R-3 (existing behavior)', () => {
  it('standardizeHTML strips scripts, styles, and event handlers (adversarial fixtures)', async () => {
    const muya = new Muya(document.createElement('div'))
    const hostile = [
      '<p onclick="alert(1)">keep me</p>',
      '<script>evil()</script>',
      '<style>body{}</style>',
      '<img src=x onerror="evil()">',
      '<p>text<a href="https://e.com" onmouseover="evil()">link</a></p>'
    ].join('')

    const out = await muya.contentState.standardizeHTML(hostile)

    // DOMPurify neutralizes hostile markup — inert escaped text (e.g.
    // "&lt;script&gt;" as visible characters) is fine; live tags and event
    // handler attributes must be gone.
    expect(out).toContain('keep me')
    expect(out).not.toMatch(/<script/i)
    expect(out).not.toMatch(/<style/i)
    expect(out).not.toContain('onerror')
    expect(out).not.toContain('onclick')
    expect(out).not.toContain('onmouseover')
  })

  it('pasteImage inserts a clipboard image File through the imageAction pipeline', async () => {
    const container = document.createElement('div')
    const inner = document.createElement('div')
    container.appendChild(inner)
    const muya = new Muya(container, {})
    // Drive pasteImage directly with a synthetic clipboard File.
    const state = muya.contentState
    state.muya.options.imageAction = async () => '/assets/final.png'
    state.selectedImage = null
    state.insertImage = vi.fn()
    state.replaceImage = vi.fn()

    const event = makeImageFileEvent()
    const result = await state.pasteImage(event)

    expect(result).toBeInstanceOf(File)
    expect(state.insertImage).toHaveBeenCalledTimes(1)
    expect(event.preventDefault).not.toHaveBeenCalled() // pasteHandler's caller decides
  })
})
