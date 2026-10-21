// FILE: tests/renderer/muya/export-markdown-table.test.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Pin Markdown table export escaping and rectangular-grid integrity for FIX-015.
//   SCOPE: Leading and parity-sensitive pipe escaping, ragged rows, extra cells, and stable aligned-table output.
//   DEPENDS: src/muya/lib/utils/exportMarkdown.js, Vitest.
//   LINKS: .grace/graph/runtime.xml M-012; .grace/verification/runtime.xml V-M-012; .grace/changes/archive/C-FIX-015-TABLE-EXPORT-INTEGRITY.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   cell - Creates the minimal Muya table-cell shape consumed by ExportMarkdown.
//   exportTable - Calls the real table normalizer with explicit content and optional advisory geometry.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - 2026-10-20 FIX-015: cover pipe parity and normalize ragged real rows without data loss or undefined access.
// END_CHANGE_SUMMARY

import { describe, expect, it } from 'vitest'
import ExportMarkdown from 'muya/lib/utils/exportMarkdown'

const cell = (text, align) => ({ align, children: [{ text }] })

const exportTable = ({ header, body, aligns = [], row = body.length, column = header.length - 1 }) => {
  const table = {
    row,
    column,
    children: [
      { children: [{ children: header.map((text, index) => cell(text, aligns[index])) }] },
      { children: body.map((values) => ({ children: values.map((text) => cell(text)) })) }
    ]
  }

  return new ExportMarkdown([]).normalizeTable(table, '')
}

describe('ExportMarkdown table integrity (FIX-015)', () => {
  it('escapes every unescaped pipe according to its preceding backslash parity', () => {
    const markdown = exportTable({
      header: ['kind', 'value'],
      body: [[
        '|leading and mid|pipe',
        String.raw`odd\|kept even\\|escaped`
      ]]
    })

    expect(markdown).toContain(String.raw`\|leading and mid\|pipe`)
    expect(markdown).toContain(String.raw`odd\|kept even\\\|escaped`)
    expect(markdown).not.toContain(String.raw`odd\\|kept`)
  })

  it('pads short rows and retains cells beyond the advisory header geometry', () => {
    const markdown = exportTable({
      header: ['h1', 'h2'],
      body: [['one'], ['a', 'b', 'c']],
      row: 2,
      column: 1
    })

    expect(markdown).toBe(
      '| h1  | h2  |     |\n' +
      '| --- | --- | --- |\n' +
      '| one |     |     |\n' +
      '| a   | b   | c   |\n'
    )
    expect(markdown).not.toContain('undefined')
  })

  it('keeps regular aligned table output stable', () => {
    const markdown = exportTable({
      header: ['alpha', 'beta', 'gamma'],
      body: [['1', '22', '333']],
      aligns: ['left', 'center', 'right']
    })

    expect(markdown).toBe(
      '| alpha | beta | gamma |\n' +
      '|:----- |:----:| -----:|\n' +
      '| 1     | 22   | 333   |\n'
    )
  })
})
