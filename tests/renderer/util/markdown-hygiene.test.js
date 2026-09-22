// FILE: tests/renderer/util/markdown-hygiene.test.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Verify the C-17 markdownLint rule subset and the markdownFormat normalizer (fires/non-fires, idempotence, semantics preservation).
//   SCOPE: Pure-function table tests over fixture documents; no DOM/store.
//   DEPENDS: src/renderer/src/util/markdownLint.js, markdownFormat.js, Vitest.
//   LINKS: .grace/changes/active/C-17; .grace/verification/runtime.xml V-M-011 scenario-30 — pins markdownLint/formatMarkdown used by START_BLOCK_LINT_RULES and START_BLOCK_FORMAT_DOCUMENT.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   issuesOf - Runs lintMarkdown and returns "rule:line" tuples for compact assertions.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - C-17: per-rule fire/non-fire tables, code-content immunity, formatter fixtures (WS/blank-lines/setext/cascade), idempotence, semantics preservation, no-op null.
// END_CHANGE_SUMMARY

import { describe, expect, it } from 'vitest'
import { lintMarkdown } from '@/util/markdownLint'
import { formatMarkdown } from '@/util/markdownFormat'
import Muya from 'muya/lib'

const issuesOf = (md) => lintMarkdown(md).map((i) => `${i.rule}:${i.line}`)

describe('markdownLint — C-17 rule subset', () => {
  it('MD001 fires on heading-level jumps and not on clean cascades', () => {
    expect(issuesOf('# A\n\n## B\n\n### C\n')).toEqual([])
    expect(issuesOf('# A\n\n### C\n')).toEqual(['md001:3'])
  })

  it('MD003 fires on setext headings when ATX headings are also present', () => {
    expect(issuesOf('# Atx\n\nSetext\n=======\n')).toEqual(['md003:3', 'md025:3']) // second H1 is also MD025
    // A pure-setext document is internally consistent — no flag.
    expect(issuesOf('Setext\n======\n\nOther\n-----\n')).toEqual([])
  })

  it('MD009 fires on trailing spaces and tabs', () => {
    expect(issuesOf('clean line\ntrailing \nalso\t\n')).toEqual(['md009:2', 'md009:3'])
    expect(issuesOf('clean line\nclean too\n')).toEqual([])
  })

  it('MD025 fires on every H1 after the first', () => {
    expect(issuesOf('# First\n\ntext\n\n# Second\n')).toEqual(['md025:5'])
    expect(issuesOf('# First\n\n## Second\n')).toEqual([])
  })

  it('MD032 fires on headings and lists without a preceding blank line', () => {
    expect(issuesOf('text\n## Heading\n')).toEqual(['md032:2'])
    expect(issuesOf('text\n- item\n')).toEqual(['md032:2'])
    expect(issuesOf('text\n\n- item\n')).toEqual([])
    // Continuing a list group is fine.
    expect(issuesOf('- one\n- two\n')).toEqual([])
  })

  it('MD040 fires on fenced code without a language and not with one', () => {
    expect(issuesOf('```\nconst x = 1\n```\n')).toEqual(['md040:1'])
    expect(issuesOf('```js\nconst x = 1\n```\n')).toEqual([])
  })

  it('ignores fenced-code contents for every rule', () => {
    const md = '```txt\n# not a heading   \n- not a list\n```\n'
    expect(issuesOf(md)).toEqual([])
    // The closing fence itself is structural; contents between are opaque.
    const md2 = '```js\nconst a = `code`\n```\n'
    expect(issuesOf(md2)).toEqual([])
  })

  it('treats a lone --- after a blank as a thematic break, not setext', () => {
    expect(issuesOf('# Title\n\ntext\n\n---\n\nmore\n')).toEqual([])
  })

  it('returns [] for empty and non-string input', () => {
    expect(lintMarkdown('')).toEqual([])
    expect(lintMarkdown(undefined)).toEqual([])
  })
})

describe('markdownFormat — C-17 Format document', () => {
  it('strips trailing whitespace outside code and preserves code verbatim', () => {
    const md = 'line one  \n```txt\nkept   \n\ttab kept\n```\nline two \t\n'
    const out = formatMarkdown(md)
    expect(out).toBe('line one\n```txt\nkept   \n\ttab kept\n```\nline two\n')
  })

  it('converts setext headings to ATX', () => {
    expect(formatMarkdown('Title\n=====\n\nSub\n---\n')).toBe('# Title\n\n## Sub\n')
  })

  it('demotes heading-level jumps to parent+1 (MD001 fix)', () => {
    expect(formatMarkdown('# A\n\n### C\n')).toBe('# A\n\n## C\n')
    // Lowering is never "fixed" — only jumps upward are demoted.
    // Already canonical (downward step is not a jump) → null, no churn.
    expect(formatMarkdown('### C\n\n# A\n')).toBeNull()
  })

  it('inserts blank lines around headings and before paragraph-start lists', () => {
    expect(formatMarkdown('text\n## H\nmore')).toBe('text\n\n## H\n\nmore')
    expect(formatMarkdown('para\n- a\n- b\npara2')).toBe('para\n\n- a\n- b\npara2')
    // Already-structured documents come back unchanged (null).
    expect(formatMarkdown('# A\n\n- a\n\nafter\n')).toBeNull()
  })

  it('review-1 regressions: front matter, blockquotes, thematic breaks, nested fences, lazy lists', () => {
    // Front matter is opaque and verbatim (muya exports it as-is).
    const fm = '---\ntitle: My Doc\n---\n\n# Heading\n\nbody\n'
    expect(issuesOf(fm)).toEqual([])
    expect(formatMarkdown(fm)).toBeNull()

    // A setext underline after a blockquote/thematic break is NOT a heading.
    expect(issuesOf('> quote\n---\n')).toEqual([])
    expect(formatMarkdown('> quote\n---\n')).toBeNull()
    expect(issuesOf('text\n***\n---\nmore\n')).toEqual([])

    // Spaced thematic breaks are not list items.
    expect(issuesOf('text\n* * *\nafter\n')).toEqual([])

    // A list after a closing fence is not MD032 (and format agrees).
    expect(issuesOf('```js\nx\n```\n- item\n')).toEqual([])
    expect(formatMarkdown('```js\nx\n```\n- item\n')).toBeNull()

    // Nested fences: the outer opener has info; the inner ```js line and
    // the trailing-space line are CONTENT — nothing fires inside.
    expect(issuesOf('```markdown\n# fake\n```js\nx  \n```\n')).toEqual([])

    // Lazy list continuations are never split by the formatter.
    expect(formatMarkdown('text\n- item\ncontinuation text\nmore\n')).toBe(
      'text\n\n- item\ncontinuation text\nmore\n'
    )
    expect(issuesOf('- a\nlazy\n- b\n')).toEqual([])
    expect(formatMarkdown('- a\nlazy\n- b\n')).toBeNull()
  })

  it('is idempotent: format(format(x)) === format(x)', () => {
    const messy = 'Title  \n=====\npara\n#### deep\ntext\n- a\n- b\nend \t\n```txt\nraw   \n```\n'
    const once = formatMarkdown(messy)
    expect(once).not.toBeNull()
    expect(formatMarkdown(once)).toBeNull() // second pass is a no-op
  })

  it('preserves semantics: text, links, inline code, tables untouched', () => {
    const md = 'A [link](https://x.com) and `code` span.  \n\n| a | b |\n| - | - |\n| 1 | 2 |\n'
    const out = formatMarkdown(md)
    expect(out).toContain('[link](https://x.com)')
    expect(out).toContain('`code`')
    expect(out.split('\n').filter((l) => l.startsWith('|')).length).toBe(3)
  })

  it('returns null for empty input and already-canonical documents', () => {
    expect(formatMarkdown('')).toBeNull()
    expect(formatMarkdown('# A\n\nbody\n')).toBeNull()
  })
})

describe('real muya integration — Format document one-step undo (C-17)', () => {
  it('setMarkdown(format) leaves a single undo step back to the original', () => {
    const container = document.createElement('div')
    const inner = document.createElement('div')
    container.appendChild(inner)
    const muya = new Muya(container, { markdown: '# A\n\n### jump  \n' })

    const before = muya.getMarkdown()
    const formatted = formatMarkdown(before)
    expect(formatted).toBe('# A\n\n## jump\n')

    // The exact sequence the editor.vue handler performs.
    muya.setMarkdown(formatted, null, false)
    expect(muya.getMarkdown()).toBe(formatted)

    muya.undo()
    expect(muya.getMarkdown()).toBe(before)
  })
})
