// FILE: tests/renderer/muya/copy-data.test.js
// VERSION: 1.1.0
// START_MODULE_CONTRACT
//   PURPOSE: Verify that Muya#getCopyData returns the markdown text of whatever is selected (range, table cells, image) without touching the clipboard.
//   SCOPE: Prototype delegation via stub instances; table-cell export plumbing through createTableInFigure + ExportMarkdown; image raw fallback; collapsed/absent selection emptiness.
//   DEPENDS: src/muya/lib/index.js (Muya class prototype), muya/lib/utils/exportMarkdown (mocked), Vitest, jsdom.
//   LINKS: .grace/graph/runtime.xml M-012 fn-getCopyData; .grace/verification/runtime.xml V-M-012; C-3.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   createRangeStub - Builds a stub Muya with only getClipBoardData wired (DOM-range path).
//   createCellsStub - Builds a stub Muya with selectedTableCells plus table-builder stubs.
//   exportMarkdownInstances - Captures ExportMarkdown constructor calls for table-export assertions.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.1.0 - Cover table-cell and image selection branches (review-1 finding 1); pin the { text } contract.
//   v1.0.0 - Initial coverage for the C-3 getCopyData accessor.
// END_CHANGE_SUMMARY

import { describe, expect, it, vi } from 'vitest'
import Muya from 'muya/lib'

const exportMarkdownInstances = []
vi.mock('muya/lib/utils/exportMarkdown', () => ({
  default: class ExportMarkdown {
    constructor(blocks, listIndentation, isGitlabCompatibilityEnabled) {
      this.blocks = blocks
      this.listIndentation = listIndentation
      this.isGitlabCompatibilityEnabled = isGitlabCompatibilityEnabled
      exportMarkdownInstances.push(this)
    }

    generate() {
      return '| a | b |\n| --- | --- |\n| 1 | 2 |'
    }
  }
}))

function createRangeStub(payload) {
  return {
    selectedTableCells: null,
    selectedImage: null,
    contentState: { getClipBoardData: vi.fn(() => payload) },
    clipboard: { copyAsRich: vi.fn(), copyAsHtml: vi.fn() }
  }
}

function createCellsStub({ row, column, cells }) {
  return {
    selectedTableCells: null,
    selectedImage: null,
    contentState: {
      selectedTableCells: { row, column, cells },
      createBlock: vi.fn((type, extras) => ({ type, ...extras })),
      createTableInFigure: vi.fn(() => ({ type: 'table' })),
      appendChild: vi.fn(),
      isGitlabCompatibilityEnabled: false,
      listIndentation: 1
    }
  }
}

describe('Muya#getCopyData (C-3)', () => {
  it('returns the DOM-range payload text as-is', () => {
    const stubMuya = createRangeStub({ html: '<h1>Title</h1>', text: '# Title' })

    expect(Muya.prototype.getCopyData.call(stubMuya)).toEqual({ text: '# Title' })
    expect(stubMuya.contentState.getClipBoardData).toHaveBeenCalledTimes(1)
  })

  it('propagates empty text when the selection is collapsed or absent', () => {
    const stubMuya = createRangeStub({ html: '', text: '' })

    expect(Muya.prototype.getCopyData.call(stubMuya)).toEqual({ text: '' })
  })

  it('exports a multi-cell table selection as a markdown table', () => {
    const stubMuya = createCellsStub({
      row: 2,
      column: 2,
      cells: [
        { text: 'a', align: '' }, { text: 'b', align: '' },
        { text: '1', align: '' }, { text: '2', align: '' }
      ]
    })

    const result = Muya.prototype.getCopyData.call(stubMuya)

    expect(result).toEqual({ text: '| a | b |\n| --- | --- |\n| 1 | 2 |' })
    const cs = stubMuya.contentState
    expect(cs.createBlock).toHaveBeenCalledWith('figure', { functionType: 'table' })
    expect(cs.createTableInFigure).toHaveBeenCalledWith(
      { rows: 2, columns: 2 },
      [
        [{ text: 'a', align: '' }, { text: 'b', align: '' }],
        [{ text: '1', align: '' }, { text: '2', align: '' }]
      ]
    )
    expect(cs.appendChild).toHaveBeenCalledTimes(1)
    expect(exportMarkdownInstances.at(-1).blocks).toHaveLength(1)
  })

  it('copies the single selected cell text directly', () => {
    const stubMuya = createCellsStub({
      row: 1,
      column: 1,
      cells: [{ text: 'only cell', align: '' }]
    })

    expect(Muya.prototype.getCopyData.call(stubMuya)).toEqual({ text: 'only cell' })
    expect(stubMuya.contentState.createTableInFigure).not.toHaveBeenCalled()
  })

  it('returns the selected image raw markdown', () => {
    const stubMuya = createRangeStub({})
    stubMuya.contentState.selectedImage = { token: { raw: '![alt](img.png)' } }

    expect(Muya.prototype.getCopyData.call(stubMuya)).toEqual({
      text: '![alt](img.png)'
    })
  })

  it('returns empty text for a selected image with no raw token', () => {
    const stubMuya = createRangeStub({})
    stubMuya.contentState.selectedImage = { token: { raw: '' } }

    expect(Muya.prototype.getCopyData.call(stubMuya)).toEqual({ text: '' })
  })

  it('does not touch the clipboard transport', () => {
    const stubMuya = createRangeStub({ html: '<p>x</p>', text: 'x' })

    Muya.prototype.getCopyData.call(stubMuya)

    expect(stubMuya.clipboard.copyAsRich).not.toHaveBeenCalled()
    expect(stubMuya.clipboard.copyAsHtml).not.toHaveBeenCalled()
  })
})
