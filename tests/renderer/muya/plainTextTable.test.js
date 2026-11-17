// FILE: tests/renderer/muya/plainTextTable.test.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Pin the C-PASTE-ASCII-TABLES converter — detection boundaries and GFM output for boxed and rule-aligned terminal tables, with non-tables and existing GFM tables declined.
//   SCOPE: Pure-function tests of plainTextTableToMarkdown plus the pasteCtrl wiring guard (normal path only).
//   DEPENDS: src/muya/lib/utils/plainTextTable.js, src/muya/lib/contentState/pasteCtrl.js, Vitest, Node fs/path.
//   LINKS: .grace/graph/runtime.xml M-012; .grace/verification/runtime.xml V-M-012; docs/acceptance/registry.json C-PASTE-ASCII-TABLES.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   ROOT - repository root resolved from this test file for source reads.
//   readSource - read a repo file as text.
//   convert - plainTextTableToMarkdown under test.
//   TESTER_BOXED_TABLE - the external tester's real terminal table.
//   RULE_ALIGNED_TABLE - rule-row aligned table fixture.
//   TESTER_BOXED_TABLE - The external tester's real terminal table (Telegram 2026-11-17 report).
//   readSource - Read a repo file for the wiring guard.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - 2026-11-17 C-PASTE-ASCII-TABLES: initial pin — boxed table conversion, rule-aligned conversion, declines (GFM table, single column, prose, short input), pipe escaping, ragged-row padding and the pasteCtrl normal-path-only wiring.
// END_CHANGE_SUMMARY

const ROOT = resolve(__dirname, '..', '..', '..')
const readSource = (relPath) => readFileSync(resolve(ROOT, relPath), 'utf-8')
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { plainTextTableToMarkdown } from 'muya/lib/utils/plainTextTable'

const TESTER_BOXED_TABLE = [
  'Пересчёт по Daily Banking без кеш-кредитов, тыс. сум в месяц:',
  '',
  '┌─────────────────────────────────────────────────────────────┬─────────────┐',
  '│                                                             │     CM2     │',
  '├─────────────────────────────────────────────────────────────┼─────────────┤',
  '│ Средний розничный клиент                                    │ −19,7       │',
  '├─────────────────────────────────────────────────────────────┼─────────────┤',
  '│ Плюс аплифт зарплатника, 19,1 пересчитано на зарплату 8 млн │ +10         │',
  '├─────────────────────────────────────────────────────────────┼─────────────┤',
  '│ Минус ретро сверх стоимости ввода, 0,1%                     │ −8          │',
  '├─────────────────────────────────────────────────────────────┼─────────────┤',
  '│ Зарплатник ЗПП                                              │ около −17,7 │',
  '└─────────────────────────────────────────────────────────────┴─────────────┘'
].join('\n')

const RULE_ALIGNED_TABLE = [
  'name    status   size',
  '─────   ──────   ────',
  'alpha   ok       12',
  'beta    paused   7'
].join('\n')

const convert = plainTextTableToMarkdown

describe('plainTextTableToMarkdown', () => {
  it('converts the tester box-drawing table into a GFM pipe table', () => {
    const out = convert(TESTER_BOXED_TABLE)
    expect(out).not.toBeNull()
    const tableLines = out.split('\n\n')[1].split('\n')
    // 5 content rows + 1 injected delimiter row.
    expect(tableLines).toHaveLength(6)
    expect(tableLines[0]).toBe('|  | CM2 |')
    expect(tableLines[1]).toBe('| --- | --- |')
    expect(tableLines[2]).toContain('Средний розничный клиент')
    expect(tableLines[2]).toContain('−19,7')
    expect(tableLines[5]).toContain('около −17,7')
  })

  it('preserves the prose sentence above the boxed table', () => {
    const out = convert(TESTER_BOXED_TABLE)
    expect(out).toContain('Пересчёт по Daily Banking')
    // Prose and table are separated by a blank line.
    expect(out.split('\n\n')[0]).toContain('Пересчёт по Daily Banking')
  })

  it('converts rule-aligned tables through the rule row spans', () => {
    const out = convert(RULE_ALIGNED_TABLE)
    expect(out).not.toBeNull()
    const lines = out.split('\n')
    expect(lines[0]).toBe('| name | status | size |')
    expect(lines[1]).toBe('| --- | --- | --- |')
    expect(lines[2]).toBe('| alpha | ok | 12 |')
    expect(lines[3]).toBe('| beta | paused | 7 |')
  })

  it('declines text that already carries a GFM delimiter row', () => {
    const gfm = '| a | b |\n| --- | --- |\n| 1 | 2 |'
    expect(convert(gfm)).toBeNull()
  })

  it('declines single-column boxed lists', () => {
    const single = '┌──────┐\n│ one  │\n│ two  │\n└──────┘'
    expect(convert(single)).toBeNull()
  })

  it('declines prose and code-like text without a rule row', () => {
    expect(convert('just a sentence\nspanning lines')).toBeNull()
    expect(convert('a = 1\nb = 2\nc = 3')).toBeNull()
    expect(convert('short')).toBeNull()
  })

  it('escapes pipes inside cells and cannot break out of the GFM row', () => {
    const boxed = '┌────┬────┐\n│ a|b │ c  │\n│ d  │ e  │\n└────┴────┘'
    const out = convert(boxed)
    expect(out).toContain('a\\|b')
  })

  it('pads ragged rows and clips phantom columns', () => {
    const boxed = '┌────┬────┬────┐\n│ a  │ b  │ c  │\n│ d  │ e  │\n└────┴────┴────┘'
    const lines = convert(boxed).split('\n')
    expect(lines[0]).toBe('| a | b | c |')
    expect(lines[2]).toBe('| d | e |  |')
  })

  it('pasteCtrl wires the converter on the normal path only', () => {
    const source = readSource('src/muya/lib/contentState/pasteCtrl.js')
    const block = source.slice(
      source.indexOf('START_BLOCK_SMART_PASTE_ASCII_TABLE'),
      source.indexOf('END_BLOCK_SMART_PASTE_ASCII_TABLE')
    )
    expect(block).toContain("type === 'normal' && copyType === 'onlyMarkdown'")
    expect(block).toContain('plainTextTableToMarkdown(text)')
    expect(block).toContain('markdownSource')
    // The markdown parse consumes the converted source; the HTML path is untouched.
    expect(source).toContain('this.markdownToState(markdownSource)')
  })
})
