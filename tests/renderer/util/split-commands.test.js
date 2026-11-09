// FILE: tests/renderer/util/split-commands.test.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Pin the complete editor command-id matrix and functional source command/search edits.
//   SCOPE: Pure command outputs and exact registry coverage; actual routing is covered in browsers.
//   DEPENDS: Vitest, splitCommands, renderer command source.
//   LINKS: C-STABILIZE-SPLIT-DUAL-EDIT R-4.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
// START_MODULE_MAP
//   selection - Whole-word source selection fixture.
// END_MODULE_MAP
// START_CHANGE_SUMMARY
//   - 2026-11-10 C-STABILIZE-SPLIT-VERIFICATION: requirement boundaries for selections, block transforms and search.
//   LAST_CHANGE: v1.0.0 - Recovery full command matrix and transforms.
// END_CHANGE_SUMMARY
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { SPLIT_COMMAND_MATRIX, applySourceCommand, sourceSearch } from '@/util/splitCommands'
const selection = { anchor: { line: 0, ch: 0 }, head: { line: 0, ch: 4 } }

describe('focused split command matrix', () => {
  it('accounts for every registered edit, paragraph and format command id exactly', () => {
    const registry = readFileSync('src/renderer/src/commands/index.js', 'utf8')
    const ids = [...registry.matchAll(/id: '((?:edit|paragraph|format)\.[^']+)'/g)].map(match => match[1]).sort()
    expect(Object.keys(SPLIT_COMMAND_MATRIX).sort()).toEqual(ids)
  })
  it.each([
    ['strong', '**word**'], ['em', '*word*'], ['u', '<u>word</u>'], ['mark', '==word=='],
    ['sup', '^word^'], ['sub', '~word~'], ['inline_code', '`word`'], ['inline_math', '$word$'],
    ['del', '~~word~~'], ['link', '[word](https://)'], ['image', '![word](image.png)']
  ])('formats source selection with %s', (format, expected) => {
    expect(applySourceCommand('word', selection, 'format', format).text).toBe(expected)
  })
  it.each([
    ['heading 1', '# word'], ['heading 6', '###### word'], ['blockquote', '> word'],
    ['ol-bullet', '1. word'], ['ul-bullet', '* word'], ['ul-task', '* [ ] word'],
    ['pre', '```\nword\n```'], ['mathblock', '$$\nword\n$$'], ['html', '<div>\nword\n</div>'],
    ['paragraph', 'word'], ['reset-to-paragraph', 'word'], ['hr', 'word\n\n---\n']
  ])('applies paragraph %s', (paragraph, expected) => {
    expect(applySourceCommand('word', selection, 'paragraph', paragraph).text).toBe(expected)
  })
  it('explains the genuinely inapplicable loose-list command', () => {
    expect(applySourceCommand('word', selection, 'paragraph', 'loose-list-item').reason).toMatch(/requires.*list/)
  })
  it('creates source table with the chosen dimensions', () => {
    expect(applySourceCommand('word', selection, 'table', { rows: 4, columns: 3 }).text.split('\n')).toHaveLength(6)
  })
  it('preserves selected-line boundaries for reversed selections and multiline lists', () => {
    const reverse = { anchor: { line: 1, ch: 0 }, head: { line: 0, ch: 0 } }
    expect(applySourceCommand('one\ntwo', reverse, 'paragraph', 'ul-bullet')).toMatchObject({ from: 0, to: 3, text: '* one' })
  })
  it('searches with case, whole-word, regexp and invalid/zero-width patterns safely', () => {
    expect(sourceSearch('One one lonely\none', 'one').matches).toHaveLength(4)
    expect(sourceSearch('One one lonely\none', 'one', { isCaseSensitive: true, isWholeWord: true }).matches).toHaveLength(2)
    expect(sourceSearch('aa\nAB', 'a.', { isRegexp: true }).matches[1]).toEqual({ start: { line: 1, ch: 0 }, end: { line: 1, ch: 2 } })
    expect(sourceSearch('aa', '[', { isRegexp: true }).matches).toHaveLength(0)
    expect(sourceSearch('aa', '(?=a)', { isRegexp: true }).matches).toHaveLength(2)
  })
})


describe('source command selection and Markdown boundaries', () => {
  it.each([2, 3, 4, 5])('sets heading %i without retaining existing block markers', (level) => {
    expect(applySourceCommand('> word', selection, 'paragraph', `heading ${level}`).text)
      .toBe(`${'#'.repeat(level)} word`)
  })

  it('keeps a reversed inline selection reversed inside its new delimiters', () => {
    expect(applySourceCommand('word', {
      anchor: { line: 0, ch: 4 }, head: { line: 0, ch: 0 }
    }, 'format', 'strong')).toEqual({ from: 0, to: 4, text: '**word**', anchor: 6, head: 2 })
  })

  it.each([
    [{ anchor: { line: 0, ch: 2 }, head: { line: 0, ch: 6 } }],
    [{ anchor: { line: 0, ch: 0 }, head: { line: 0, ch: 8 } }]
  ])('toggles strong off whether selecting its content or delimiters', (range) => {
    expect(applySourceCommand('**word**', range, 'format', 'strong'))
      .toEqual({ from: 0, to: 8, text: 'word', anchor: 0, head: 4 })
  })

  it('puts an empty hyperlink caret inside the label and inserts at clamped source positions', () => {
    expect(applySourceCommand('ab', { anchor: { line: 0, ch: 1 }, head: { line: 0, ch: 1 } }, 'format', 'link'))
      .toEqual({ from: 1, to: 1, text: '[](https://)', anchor: 2, head: 2 })
    expect(applySourceCommand('ab', { anchor: { line: -1, ch: -9 }, head: { line: 99, ch: 99 } }, 'insert', 42))
      .toEqual({ from: 0, to: 2, text: '42', anchor: 2, head: 2 })
  })

  it('replaces reversed multiline selections with one insertion and collapses the caret after it', () => {
    expect(applySourceCommand('one\ntwo', { anchor: { line: 1, ch: 3 }, head: { line: 0, ch: 0 } }, 'insert', 'new'))
      .toEqual({ from: 0, to: 7, text: 'new', anchor: 3, head: 3 })
  })

  it('clears supported inline syntax while preserving the visible words and line break', () => {
    const markdown = '**bold** _em_ ~~del~~ ==mark== `code` $math$ ^sup^ ~sub~\n<u>u</u> <sup>s</sup> <sub>b</sub> <mark>m</mark> [link](url) ![alt](url)'
    expect(applySourceCommand(markdown, {
      anchor: { line: 0, ch: 0 }, head: { line: 1, ch: 200 }
    }, 'format', 'clear').text).toBe('bold em del mark code math sup sub\nu s b m link alt')
  })

  it.each(['format', 'paragraph', 'unsupported'])('explains unsupported %s operations without a partial edit', (command) => {
    const result = applySourceCommand('word', selection, command, 'not-a-command')
    expect(result.reason).toContain('unavailable in Markdown source')
    expect(result).not.toHaveProperty('text')
  })

  it.each(['ol-bullet', 'ul-bullet', 'ul-task', 'blockquote'])('converts all selected lines with %s, excluding a zero-column final line', (kind) => {
    const expected = {
      'ol-bullet': '1. one\n2. two\n3. three',
      'ul-bullet': '* one\n* two\n* three',
      'ul-task': '* [ ] one\n* [ ] two\n* [ ] three',
      blockquote: '> one\n> two\n> three'
    }
    const markdown = '> one\n2) two\n* [X] three\nkeep'
    expect(applySourceCommand(markdown, {
      anchor: { line: 0, ch: 0 }, head: { line: 3, ch: 0 }
    }, 'paragraph', kind)).toMatchObject({ from: 0, to: 24, text: expected[kind] })
  })

  it('includes a final line when its selected endpoint is beyond column zero', () => {
    expect(applySourceCommand('one\ntwo\nkeep', {
      anchor: { line: 1, ch: 1 }, head: { line: 0, ch: 2 }
    }, 'paragraph', 'ul-bullet')).toEqual({ from: 0, to: 7, text: '* one\n* two', anchor: 11, head: 0 })
  })

  it.each([
    ['### word', 'upgrade heading', '## word'],
    ['### word', 'degrade heading', '#### word'],
    ['# word', 'upgrade heading', '# word'],
    ['###### word', 'degrade heading', '###### word'],
    ['word', 'upgrade heading', '# word'],
    ['word', 'degrade heading', '# word']
  ])('changes heading level at its document boundary: %s / %s', (markdown, command, expected) => {
    expect(applySourceCommand(markdown, selection, 'paragraph', command).text).toBe(expected)
  })

  it.each(['paragraph', 'reset-to-paragraph'])('unwraps a complete language fence using %s', (kind) => {
    expect(applySourceCommand('```js\nlet x = 1\n```', {
      anchor: { line: 0, ch: 0 }, head: { line: 2, ch: 3 }
    }, 'paragraph', kind).text).toBe('let x = 1')
  })

  it('removes heading, quote and task-list markers without removing indentation beyond Markdown prefixes', () => {
    expect(applySourceCommand('  ### title\n> quote\n- [x] task', {
      anchor: { line: 0, ch: 0 }, head: { line: 2, ch: 10 }
    }, 'paragraph', 'paragraph').text).toBe('title\nquote\ntask')
  })

  it('loosens selected list items without changing their markers or body', () => {
    expect(applySourceCommand('* one\n* two', { anchor: { line: 0, ch: 0 }, head: { line: 1, ch: 5 } }, 'paragraph', 'loose-list-item').text)
      .toBe('* one\n\n* two')
  })

  it('duplicates complete selected lines and selects the duplicate', () => {
    expect(applySourceCommand('one\ntwo\nkeep', { anchor: { line: 0, ch: 1 }, head: { line: 2, ch: 0 } }, 'duplicate'))
      .toEqual({ from: 7, to: 7, text: '\none\ntwo', anchor: 8, head: 15 })
  })

  it.each([
    ['createParagraph', 'before', 4, 6],
    ['createParagraph', 'after', 7, 9],
    ['insertParagraph', undefined, 7, 9]
  ])('creates an empty paragraph with %s %s without replacing selected text', (command, payload, from, caret) => {
    expect(applySourceCommand('one\ntwo', { anchor: { line: 1, ch: 1 }, head: { line: 1, ch: 2 } }, command, payload))
      .toEqual({ from, to: from, text: '\n\n', anchor: caret, head: caret })
  })

  it.each([
    ['one\ntwo\nkeep', 1, { from: 4, to: 8, text: '', anchor: 4, head: 4 }],
    ['one\ntwo', 1, { from: 4, to: 7, text: '', anchor: 4, head: 4 }],
    ['one', 0, { from: 0, to: 3, text: '', anchor: 0, head: 0 }]
  ])('deletes a complete paragraph and its following separator when present: %s', (markdown, line, expected) => {
    expect(applySourceCommand(markdown, { anchor: { line, ch: 0 }, head: { line, ch: 1 } }, 'deleteParagraph')).toEqual(expected)
  })

  it('inserts front matter at the document start while preserving body text outside the edit', () => {
    expect(applySourceCommand('body', selection, 'paragraph', 'front-matter'))
      .toEqual({ from: 0, to: 0, text: '---\nbody\n---\n\n', anchor: 4, head: 8 })
    expect(applySourceCommand('', { anchor: { line: 0, ch: 0 }, head: { line: 0, ch: 0 } }, 'paragraph', 'front-matter'))
      .toEqual({ from: 0, to: 0, text: '---\ntitle: \n---\n\n', anchor: 4, head: 11 })
  })

  it('uses documented default/minimum table dimensions for missing and undersized input', () => {
    expect(applySourceCommand('word', selection, 'table', {}).text)
      .toBe('|   |   |   |\n| --- | --- | --- |\n|   |   |   |\n|   |   |   |\n|   |   |   |\n')
    expect(applySourceCommand('word', selection, 'table', { rows: 1, columns: -1 }).text)
      .toBe('|   |\n| --- |\n|   |\n')
  })
})

describe('source search contract boundaries', () => {
  it('returns explicit no-selection state for an empty query, no match and invalid regexp', () => {
    for (const [value, options] of [['', {}], ['missing', {}], ['[', { isRegexp: true }]]) {
      expect(sourceSearch('one', value, options)).toEqual({ value, matches: [], index: -1 })
    }
  })

  it('treats regexp punctuation literally unless regular-expression mode is selected', () => {
    expect(sourceSearch('a.b a+b [x] (x)', 'a.b').matches)
      .toEqual([{ start: { line: 0, ch: 0 }, end: { line: 0, ch: 3 } }])
    expect(sourceSearch('a.b a+b [x] (x)', '[x]').matches)
      .toEqual([{ start: { line: 0, ch: 8 }, end: { line: 0, ch: 11 } }])
  })

  it('separates whole words from substrings and honors case across line breaks', () => {
    expect(sourceSearch('One someone one\nONE one1 one', 'one', { isWholeWord: true }).matches)
      .toEqual([
        { start: { line: 0, ch: 0 }, end: { line: 0, ch: 3 } },
        { start: { line: 0, ch: 12 }, end: { line: 0, ch: 15 } },
        { start: { line: 1, ch: 0 }, end: { line: 1, ch: 3 } },
        { start: { line: 1, ch: 9 }, end: { line: 1, ch: 12 } }
      ])
    expect(sourceSearch('One someone one\nONE one1 one', 'one', { isWholeWord: true, isCaseSensitive: true }).matches)
      .toEqual([
        { start: { line: 0, ch: 12 }, end: { line: 0, ch: 15 } },
        { start: { line: 1, ch: 9 }, end: { line: 1, ch: 12 } }
      ])
  })

  it('reports multiline regexp spans and zero-width matches in source coordinates', () => {
    expect(sourceSearch('one\ntwo', 'e\\nt', { isRegexp: true }))
      .toEqual({ value: 'e\\nt', matches: [{ start: { line: 0, ch: 2 }, end: { line: 1, ch: 1 } }], index: 0 })
    expect(sourceSearch('ab', '(?=.)', { isRegexp: true }).matches)
      .toEqual([
        { start: { line: 0, ch: 0 }, end: { line: 0, ch: 0 } },
        { start: { line: 0, ch: 1 }, end: { line: 0, ch: 1 } }
      ])
  })
})
