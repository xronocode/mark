// FILE: tests/renderer/util/structured-text.test.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Pin the C-32 structured-text rendering over the real marked + DOMPurify export pipeline.
//   SCOPE: Paragraphs, headings, inline marks, links/autolinks/fragments, images, nested/ordered/task lists, quotes, tables, code, hr, hard breaks, footnotes.
//   DEPENDS: src/renderer/src/util/structuredText.js; muya marked, sanitize, EXPORT_DOMPURIFY_CONFIG.
//   LINKS: .grace/changes/active/C-32; .grace/verification/runtime.xml V-M-011.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   OPTIONS - marked options matching the editor defaults (footnotes on).
//   render - Markdown → sanitized HTML → htmlToStructuredText (same pipeline as editor.vue).
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - C-32: initial suite (+ review regressions: leading code indent, raw-HTML whitespace, www/linked-image links, loose items, front matter).
// END_CHANGE_SUMMARY

import { describe, it, expect } from 'vitest'
import marked from 'muya/lib/parser/marked'
import { sanitize } from 'muya/lib/utils'
import { EXPORT_DOMPURIFY_CONFIG } from 'muya/lib/config'
import { htmlToStructuredText } from '@/util/structuredText'

const OPTIONS = { footnote: true, superSubScript: true, isGitlabCompatibilityEnabled: true }
const render = (md) =>
  htmlToStructuredText(
    sanitize(marked(md, OPTIONS), EXPORT_DOMPURIFY_CONFIG, false)
  )

describe('htmlToStructuredText (C-32)', () => {
  it('keeps paragraphs and headings apart by one blank line and drops inline markers', () => {
    expect(render('# Title\n\nSome **bold**, *em*, ~~del~~ and `code`.\n\nNext.')).toBe(
      'Title\n\nSome bold, em, del and code.\n\nNext.'
    )
  })

  it('writes links as "text (url)", bare urls once, and fragments as text only', () => {
    expect(render('[site](https://x.y) <https://auto.link> [top](#top) [x](mailto:a@b.c)')).toBe(
      'site (https://x.y) https://auto.link top x (mailto:a@b.c)'
    )
  })

  it('writes images as "alt (src)" and drops data: sources', () => {
    expect(render('![cat](https://i.png) ![](https://j.png) ![dot](data:image/png;base64,AA==)')).toBe(
      'cat (https://i.png) https://j.png dot'
    )
  })

  it('turns bullets into "- " with nested items indented under the text', () => {
    expect(render('- a\n  - nested\n    - deeper\n- b')).toBe('- a\n  - nested\n    - deeper\n- b')
  })

  it('numbers ordered lists from their start and aligns continuation lines', () => {
    // (muya's marked keeps a list nested under an ordered item as a
    // paragraph, so alignment is pinned with a hard break instead)
    expect(render('3. three\n4. four  \n   more')).toBe('3. three\n4. four\n   more')
  })

  it('renders task items with [ ] and [x]', () => {
    expect(render('- [ ] todo\n- [x] done')).toBe('- [ ] todo\n- [x] done')
  })

  it('prefixes block quotes and keeps their inner structure', () => {
    expect(render('> quote\n>\n> - item')).toBe('> quote\n>\n> - item')
  })

  it('writes table rows with " | " between cells and flattens cell line breaks', () => {
    expect(render('| h1 | h2 |\n|---|---|\n| c1 | c2<br/>x |')).toBe('h1 | h2\nc1 | c2 x')
  })

  it('keeps code blocks verbatim, including blank lines', () => {
    expect(render('```js\nconst a = 1\n\n\nconst b = **2**\n```')).toBe(
      'const a = 1\n\n\nconst b = **2**'
    )
  })

  it('renders hr, hard breaks and footnotes', () => {
    expect(render('a  \nb\n\n---\n\nnote[^1]\n\n[^1]: the note')).toBe(
      'a\nb\n\n———\n\nnote[1]\n\n———\n\n1. the note'
    )
  })

  it('keeps the first-line indentation of a leading code block', () => {
    expect(render('```py\n  a\n    b\n```\n\ntext')).toBe('  a\n    b\n\ntext')
  })

  it('drops source-formatting whitespace from raw HTML blocks', () => {
    expect(
      render('<p align="center">\n  <img alt="Logo" src="logo.png">\n  <br>\n  <b>Tagline</b>\n</p>')
    ).toBe('Logo (logo.png)\nTagline')
  })

  it('does not repeat www autolinks or a linked image source', () => {
    expect(render('www.y.com and [![badge](b.svg)](http://ci)')).toBe(
      'www.y.com and badge (http://ci)'
    )
  })

  it('separates the blocks of a loose list item with a blank line', () => {
    expect(render('- first para\n\n  second para\n\n- next')).toBe(
      '- first para\n\n  second para\n\n- next'
    )
    expect(render('- item\n\n  ```\n  const x = 1\n  ```')).toBe('- item\n\n  const x = 1')
  })

  it('skips front matter', () => {
    expect(render('---\ntitle: X\n---\n\nBody')).toBe('Body')
  })

  it('breaks raw-HTML containers into separate blocks', () => {
    expect(htmlToStructuredText('<section><p>a</p></section><aside>b</aside>c')).toBe('a\n\nb\n\nc')
  })

  it('returns an empty string for empty input', () => {
    expect(htmlToStructuredText('')).toBe('')
    expect(htmlToStructuredText(null)).toBe('')
  })
})
