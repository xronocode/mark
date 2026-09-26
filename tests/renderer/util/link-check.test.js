// FILE: tests/renderer/util/link-check.test.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Verify the C-21 dead-link checker (dead files/images/anchors, skips, immunity, clamp, cache).
//   SCOPE: Pure-function table tests with an injected statFn.
//   DEPENDS: src/renderer/src/util/linkCheck.js, Vitest.
//   LINKS: .grace/changes/active/C-21; .grace/verification/runtime.xml V-M-011 scenario-33.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   issuesOf - Runs checkMarkdownLinks and returns "rule:line" tuples.
//   statExisting - statFn that knows a fixed file set.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - C-21: dead file/image/anchor detection; URL/#-only/data skips; code+front-matter immunity; subtree clamp; stat cache; no-statFn = anchor-only.
// END_CHANGE_SUMMARY

import { describe, expect, it, vi } from 'vitest'
import { checkMarkdownLinks, extractDestinations } from '@/util/linkCheck'

const issuesOf = async (md, opts = {}) =>
  (await checkMarkdownLinks(md, opts)).map((i) => `${i.rule}:${i.line}`)

const statExisting = (existing) => {
  const fn = vi.fn(async (p) => existing.includes(p))
  return fn
}

describe('checkMarkdownLinks — C-21', () => {
  it('flags missing relative files and images; existing ones pass', async () => {
    const stat = statExisting(['/docs/notes.md'])
    const md = '# T\n\n[good](notes.md) [bad](missing.md)\n\n![img](pic.png)\n'
    expect(await issuesOf(md, { statFn: stat, fileDir: '/docs' })).toEqual([
      'deadlink-file:3',
      'deadlink-image:5'
    ])
    expect(stat).toHaveBeenCalledTimes(3) // one per unique path (cache dedupes repeats)
  })

  it('validates anchors against document headings (github slugs)', async () => {
    const md = '# Hello World\n\n[good](#hello-world) [bad](#nope)\n'
    expect(await issuesOf(md, {})).toEqual(['deadlink-anchor:3'])
    // Anchor-only documents run file-less.
    expect(await issuesOf(md)).toEqual(['deadlink-anchor:3'])
  })

  it('skips external URLs, data/mailto schemes, absolute paths, and bare anchors without target', async () => {
    const stat = statExisting([])
    const md = [
      '# T',
      '',
      '[web](https://x.com/a) [proto](//y.com) [mail](mailto:a@b.c)',
      '[data](data:image/png;base64,xx) [abs](/etc/hosts)',
      '![empty]()',
      ''
    ].join('\n')
    expect(await issuesOf(md, { statFn: stat, fileDir: '/docs' })).toEqual([])
  })

  it('is immune to fenced code and front matter', async () => {
    const md = [
      '---',
      'link: [fm](missing.md)',
      '---',
      '',
      '```txt',
      '[code](missing.md) ![img](gone.png) [a](#nope)',
      '```',
      ''
    ].join('\n')
    expect(await issuesOf(md, { statFn: statExisting([]), fileDir: '/docs' })).toEqual([])
  })

  it('clamps traversal and skips scheme-like paths', async () => {
    const stat = statExisting([])
    const md = '[up](../outside.md) [win](C:/x.md) [dot](./ok.md)\n'
    // '../' is clamped out; 'C:' scheme-like is skipped; './ok.md' is probed.
    expect(await issuesOf(md, { statFn: stat, fileDir: '/docs' })).toEqual(['deadlink-file:1'])
    expect(stat.mock.calls.map((c) => c[0])).toEqual(['/docs/./ok.md'])
  })

  it('strips cross-file anchors before the existence probe', async () => {
    const stat = statExisting(['/docs/file.md'])
    const md = '[x](file.md#section) [y](file.md#missing)\n'
    expect(await issuesOf(md, { statFn: stat, fileDir: '/docs' })).toEqual([])
    expect(stat).toHaveBeenCalledTimes(1)
  })

  it('without statFn: file checks skipped, anchors still run', async () => {
    const md = '[x](missing.md) [a](#gone)\n'
    expect(await issuesOf(md, { statFn: null, fileDir: '/docs' })).toEqual(['deadlink-anchor:1'])
  })

  it('extractDestinations classifies kinds and skips code blocks', async () => {
    const md = '# T\n\n[a](b.md) ![i](p.png)\n\n```\n[c](d.md)\n```\n'
    expect(extractDestinations(md)).toEqual([
      { kind: 'link', dest: 'b.md', line: 3 },
      { kind: 'image', dest: 'p.png', line: 3 }
    ])
  })

  it('review-1 regressions: unicode anchors, dup -n slugs, %20, front-matter headings', async () => {
    // Cyrillic heading: unicode-aware slug matches; ASCII-empty muya slug
    // also registered (self-consistency).
    const ru = '# Привет\n\n[ок](#привет) [нет](#нет)\n'
    expect(await issuesOf(ru, {})).toEqual(['deadlink-anchor:3'])

    // Duplicate headings register GitHub's -1 suffix.
    const dup = '# Intro\n\n## Intro\n\n[x](#intro-1) [y](#intro)\n'
    expect(await issuesOf(dup, {})).toEqual([])

    // %20-decoded destination probed against the real filename.
    const stat = vi.fn(async (p) => p === '/docs/my file.md')
    const enc = '[x](my%20file.md)\n'
    expect(await issuesOf(enc, { statFn: stat, fileDir: '/docs' })).toEqual([])

    // Front-matter `# comment` and setext lookalikes do NOT validate
    // anchors (immunity both directions).
    const fm = '---\n# notes\ntitle: Foo\n---\n\n[a](#notes) [b](#title-foo)\n'
    expect(await issuesOf(fm, {})).toEqual(['deadlink-anchor:6', 'deadlink-anchor:6'])

    // Linked image: the inner image destination is checked too.
    const stat2 = vi.fn(async () => false)
    const nested = '[![img](i.png)](l.md)\n'
    expect((await issuesOf(nested, { statFn: stat2, fileDir: '/docs' })).sort()).toEqual([
      'deadlink-file:1',
      'deadlink-image:1'
    ])
  })

  it('percent-encoded traversal stays a literal (fail-safe) probe', async () => {
    const stat = vi.fn(async () => false)
    const md = '[x](%2e%2e%2fetc%2fpasswd)\n'
    const out = await issuesOf(md, { statFn: stat, fileDir: '/docs' })
    // The stat receives the RAW encoded string — decoding it here would
    // turn the fail-safe into traversal.
    expect(stat).toHaveBeenCalledWith('/docs/%2e%2e%2fetc%2fpasswd')
    expect(out).toEqual(['deadlink-file:1'])
  })

  it('empty input returns []', async () => {
    expect(await checkMarkdownLinks('')).toEqual([])
    expect(await checkMarkdownLinks(undefined)).toEqual([])
  })
})
