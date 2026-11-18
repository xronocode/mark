// FILE: tests/renderer/muya/html-ruby-sanitize.test.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Pin the #282 hardening — the ruby inline renderer routes token.raw through the DOMPurify preview pass before htmlToVNode's innerHTML sink.
//   SCOPE: Source-level pin of the sanitize routing in htmlRuby.js plus a behavioral check that PREVIEW_DOMPURIFY_CONFIG keeps ruby markup while stripping event handlers.
//   DEPENDS: src/muya/lib/parser/render/renderInlines/htmlRuby.js, src/muya/lib/utils/index.js, src/muya/lib/config/index.js, Vitest, Node fs/path.
//   LINKS: issue #282; .grace/graph/runtime.xml muya render surface.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   ROOT - repository root resolved from this test file for source reads.
//   readSource - read a repo file as text.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - 2026-11-18 #282 ruby sanitizer: initial pin — sanitize(token.raw, PREVIEW_DOMPURIFY_CONFIG, disableHtml) feeds htmlToVNode, and the purify pass drops onerror while keeping <ruby>/<rt>.
// END_CHANGE_SUMMARY

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { PREVIEW_DOMPURIFY_CONFIG } from 'muya/lib/config'
import { sanitize } from 'muya/lib/utils'

const ROOT = resolve(__dirname, '..', '..', '..')
const readSource = (relPath) => readFileSync(resolve(ROOT, relPath), 'utf-8')

describe('#282 ruby renderer sanitization', () => {
  it('htmlRuby routes token.raw through the preview sanitize pass, not raw', () => {
    const source = readSource('src/muya/lib/parser/render/renderInlines/htmlRuby.js')
    expect(source).toContain("htmlToVNode(sanitize(token.raw, PREVIEW_DOMPURIFY_CONFIG, disableHtml))")
    expect(source).not.toContain('htmlToVNode(token.raw)')
  })

  it('the preview purify config keeps ruby markup and strips event handlers', () => {
    const hostile = '<ruby>漢<rt><img src=x onerror=alert(1)>kan</rt></ruby>'
    const clean = sanitize(hostile, PREVIEW_DOMPURIFY_CONFIG, false)
    expect(clean).toContain('<ruby>')
    expect(clean).toContain('<rt>')
    expect(clean).not.toContain('onerror')
    expect(clean).not.toContain('alert(1)')
  })
})
