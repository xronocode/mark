// FILE: tests/renderer/util/export-docx-shapes.test.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Pin muya's REAL export-HTML shapes (C-NATIVE-DOCX-RTF-EXPORT T-002) — the exact markup the DOCX pre-pass depends on: footnote class/role structure, the pre.front-matter block, task checkboxes, table align attributes and KaTeX MathML.
//   SCOPE: ExportHtml.renderHtml output on the shared EN+RU fixture with the product's option values (footnote on, Mark preferences).
//   DEPENDS: muya/lib/utils/exportHtml (the same engine editor.value.exportStyledHTML drives), Vitest.
//   LINKS: .grace/changes/active/C-NATIVE-DOCX-RTF-EXPORT (R-3, R-4, R-5); tests/renderer/util/export-docx.test.js consumes these shapes.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   FIXTURE - the EN+RU document exercising every pre-pass-dependent construct.
//   stubMuya - the options-only muya stand-in (footnote: true matches Mark's preferences.js default).
//   render - ExportHtml.renderHtml() result, i.e. the body the styledHtml branch and the DOCX pipeline share.
// END_MODULE_MAP

import { describe, expect, it } from 'vitest'
import ExportHtml from 'muya/lib/utils/exportHtml'

const FIXTURE = [
  '---',
  'title: Front matter must ride as a pre block',
  '---',
  '',
  '# Заголовок H1 — Тест печи',
  '',
  'Обычный **жирный**, *курсив*, ~~зачёркнутый~~, `code span`, ссылка на [Mark](https://mark.xronocode.com).',
  '',
  '中文混排: 传统中文与俄文本 Привет мир.',
  '',
  '- [ ] незадача задачи',
  '- [x] выполненная задача',
  '',
  '> Цитата с **жирным**',
  '',
  '| Колонка | Column | 中文 |',
  '|---|:---:|---:|',
  '| значение | 2 | 3 |',
  '',
  '```js',
  'const x = "code block";',
  '```',
  '',
  'Inline math $E = mc^2$ и дробь $\\frac{a}{b}$.',
  '',
  '$$\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}$$',
  '',
  'Сноска про Марка[^1] и ещё примечание[^прим].',
  '',
  '[^1]: Текст сноски один — кириллица.',
  '[^прим]: Вторая сноска с **жирным**.',
  ''
].join('\n')

// Mark runs with footnote: true (src/renderer/src/store/preferences.js) against
// muya's false default; ExportHtml only reads options off muya, so a plain
// object carrying the product's values drives the identical code path.
const stubMuya = {
  options: {
    footnote: true,
    superSubScript: false,
    isGitlabCompatibilityEnabled: false,
    sequenceTheme: undefined
  }
}

async function render() {
  return new ExportHtml(FIXTURE, stubMuya).renderHtml()
}

describe('muya export-HTML shapes for the DOCX pre-pass (T-002)', () => {
  it('renders footnotes in the muya class/role shape the pre-pass adapts from', async () => {
    const html = await render()
    // Reference: <a href="#fn..." class="footnote-ref" id="fnref..." role="doc-noteref"><sup>n</sup></a>
    expect(html).toMatch(/<a href="#fn[^"]*" class="footnote-ref" id="fnref[^"]*" role="doc-noteref"><sup>/)
    // Section: <section class="footnotes" role="doc-endnotes"> with ordered items carrying ids and backlinks
    expect(html).toContain('<section class="footnotes" role="doc-endnotes">')
    expect(html).toMatch(/<li id="fn[^"]*" role="doc-endnote">/)
    expect(html).toContain('class="footnote-back"')
    expect(html).toContain('Текст сноски один — кириллица.')
  })

  it('emits front matter as a pre.front-matter block (the strip target)', async () => {
    const html = await render()
    expect(html).toContain('<pre class="front-matter">')
    expect(html).toContain('title: Front matter must ride as a pre block')
  })

  it('renders task list items as real checkbox inputs carrying their state', async () => {
    const html = await render()
    expect(html).toContain('<li class="task-list-item"><input type="checkbox" checked="" disabled="">')
    expect(html).toContain('<li class="task-list-item"><input type="checkbox" disabled="">')
  })

  it('renders table alignment as align attributes on cells', async () => {
    const html = await render()
    expect(html).toContain('<th align="center">')
    expect(html).toContain('<td align="right">')
  })

  it('renders math through KaTeX with its MathML twin (the docx/html equation input)', async () => {
    const html = await render()
    expect(html).toContain('katex-mathml')
    expect(html).toMatch(/<math[^>]*>/)
    // The fraction structure survives into MathML
    expect(html).toContain('<mfrac>')
  })

  it('keeps the surrounding constructs intact (headings, blockquote, code, links)', async () => {
    const html = await render()
    expect(html).toContain('<h1')
    expect(html).toContain('<blockquote>')
    expect(html).toContain('<pre><code class="fenced-code-block language-js"')
    expect(html).toContain('href="https://mark.xronocode.com"')
    expect(html).toContain('传统中文与俄文本')
  })
})
