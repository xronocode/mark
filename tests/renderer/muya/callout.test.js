// FILE: tests/renderer/muya/callout.test.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Pin callout recognition (C-24 R-5/R-7): GitHub alerts, Obsidian aliases, custom titles, folds, and what must stay a plain blockquote.
//   SCOPE: parseCalloutMarker / CALLOUT_ALIASES / CALLOUT_STYLES in src/muya/lib/utils/callout.js.
//   DEPENDS: src/muya/lib/utils/callout.js, Vitest.
//   LINKS: .grace/changes/active/C-24; START_BLOCK_CALLOUT_DETECT.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   GITHUB - the five GitHub alert markers with their expected style and title.
//   NOT_CALLOUTS - first lines that must not be recognised.
//   html - exports markdown through the muya marked parser (START_BLOCK_CALLOUT_EXPORT).
// END_MODULE_MAP

import { describe, expect, it } from 'vitest'
import { CALLOUT_ALIASES, CALLOUT_STYLES, parseCalloutMarker } from 'muya/lib/utils/callout'
import marked from 'muya/lib/parser/marked'

const GITHUB = [
  ['[!NOTE]', 'note', 'Note'],
  ['[!TIP]', 'tip', 'Tip'],
  ['[!IMPORTANT]', 'important', 'Important'],
  ['[!WARNING]', 'warning', 'Warning'],
  ['[!CAUTION]', 'caution', 'Caution']
]

const NOT_CALLOUTS = [
  'Plain quote with [!NOTE] inside.',
  ' [!NOTE]',
  '[!]',
  '[!1note]',
  '[NOTE]',
  '[!NOTE',
  '![NOTE]',
  '',
  null
]

describe('parseCalloutMarker', () => {
  for (const [line, style, title] of GITHUB) {
    it(`GitHub ${line} -> ${style}`, () => {
      expect(parseCalloutMarker(`${line}\nBody.`)).toEqual({ type: style, style, title, fold: null, markerLength: line.length })
    })
  }

  it('is case-insensitive for the type and keeps a custom title', () => {
    expect(parseCalloutMarker('[!note] Custom title\nx')).toMatchObject({ type: 'note', style: 'note', title: 'Custom title' })
    expect(parseCalloutMarker('[!NOTE] Custom title on a GitHub type')).toMatchObject({ title: 'Custom title on a GitHub type' })
  })

  it('resolves every Obsidian alias to a base style', () => {
    for (const [alias, style] of Object.entries(CALLOUT_ALIASES)) {
      expect(parseCalloutMarker(`[!${alias}]`).style, alias).toBe(style)
      expect(CALLOUT_STYLES).toContain(style)
    }
  })

  it('falls back to the note style for unknown types and titles them by name', () => {
    expect(parseCalloutMarker('[!unknown-type] Falls back to note')).toMatchObject({ type: 'unknown-type', style: 'note', title: 'Falls back to note' })
    expect(parseCalloutMarker('[!recipe]')).toMatchObject({ style: 'note', title: 'Recipe' })
  })

  it('reads fold markers', () => {
    expect(parseCalloutMarker('[!faq]- Collapsed question')).toMatchObject({ style: 'question', fold: 'collapsed', title: 'Collapsed question' })
    expect(parseCalloutMarker('[!example]+ Expanded example')).toMatchObject({ style: 'example', fold: 'expanded' })
    expect(parseCalloutMarker('[!tip]-')).toMatchObject({ fold: 'collapsed', title: 'Tip' })
  })

  it('markerLength covers only the first line (trailing spaces included)', () => {
    expect(parseCalloutMarker('[!info] Title  \nBody').markerLength).toBe('[!info] Title  '.length)
  })

  for (const line of NOT_CALLOUTS) {
    it(`does not recognise ${JSON.stringify(line)}`, () => {
      expect(parseCalloutMarker(line)).toBeNull()
    })
  }
})

const html = (md) => marked(md, {})

describe('callout HTML export', () => {
  it('a GitHub alert exports as GitHub alert markup without the marker line', () => {
    const out = html('> [!WARNING]\n> Urgent info.\n')
    expect(out).toContain('<div class="markdown-alert markdown-alert-warning" data-callout="warning">')
    expect(out).toContain('<p class="markdown-alert-title">Warning</p>')
    expect(out).toContain('<p>Urgent info.</p>')
    expect(out).not.toContain('[!WARNING]')
  })

  it('folds export as details, open only for +', () => {
    expect(html('> [!faq]- Q\n> A\n')).toMatch(/<details class="markdown-alert markdown-alert-question" data-callout="faq">\n<summary class="markdown-alert-title">Q<\/summary>/)
    expect(html('> [!example]+ E\n> B\n')).toContain('data-callout="example" open>')
  })

  it('a marker-only first paragraph leaves no empty paragraph; titles are escaped', () => {
    const out = html('> [!tip] <b>x</b>\n>\n> Body\n')
    expect(out).toContain('<p class="markdown-alert-title">&lt;b&gt;x&lt;/b&gt;</p>')
    expect(out).not.toMatch(/<p>\s*<\/p>/)
  })

  it('a plain blockquote still exports as a blockquote', () => {
    expect(html('> Plain quote with [!NOTE] inside.\n')).toContain('<blockquote>')
  })

  it('a callout inside a list item exports as a callout (review-1: text tokens)', () => {
    for (const md of ['- item\n  > [!warning] T\n  > body\n', '- item\n\n  > [!warning] T\n  > body\n']) {
      const out = html(md)
      expect(out).toContain('markdown-alert-warning')
      expect(out).not.toContain('[!warning]')
    }
  })

  it('an empty footnote definition followed by another exports (review-1: used to throw)', () => {
    const out = marked('x[^1] y[^2]\n\n[^1]:\n[^2]: b\n', { footnote: true })
    expect(out).toContain('b')
    expect(out).not.toContain('[^2]:')
  })
})
