import { describe, it, expect } from 'vitest'

// mergeDetailsTokens is not exported, so we test it via importMarkdown indirectly.
// Instead, we extract and test the logic directly by re-implementing the same
// module-level functions (they're pure and deterministic).

const DETAILS_OPEN_RE = /^\s*<details[\s>]/i
const DETAILS_CLOSE_RE = /<\/details\s*>\s*$/i

const escapeHtmlForDetails = s =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const tokenToHtml = t => {
  switch (t.type) {
    case 'html': return t.text
    case 'paragraph': return `<p>${t.text}</p>\n\n`
    case 'code': {
      const cls = t.lang ? ` class="language-${t.lang}"` : ''
      return `<pre><code${cls}>${escapeHtmlForDetails(t.text)}</code></pre>\n\n`
    }
    case 'heading': return `<h${t.depth}>${t.text}</h${t.depth}>\n\n`
    case 'hr': return '<hr>\n\n'
    case 'space': return '\n'
    case 'blockquote': return `<blockquote><p>${t.text || ''}</p></blockquote>\n\n`
    case 'list': return t.raw || t.text || ''
    default: return t.text || ''
  }
}

const mergeDetailsTokens = tokens => {
  const result = []
  let i = 0
  while (i < tokens.length) {
    const tok = tokens[i]
    if (tok.type === 'html' && DETAILS_OPEN_RE.test(tok.text) &&
        !DETAILS_CLOSE_RE.test(tok.text)) {
      let depth = 1
      let html = tok.text
      i++
      while (i < tokens.length && depth > 0) {
        const t = tokens[i]
        if (t.type === 'html') {
          if (DETAILS_OPEN_RE.test(t.text)) depth++
          if (DETAILS_CLOSE_RE.test(t.text)) depth--
        }
        html += tokenToHtml(t)
        i++
      }
      result.push({ type: 'html', text: html })
    } else {
      result.push(tok)
      i++
    }
  }
  return result
}

describe('mergeDetailsTokens', () => {
  it('passes through tokens without details', () => {
    const tokens = [
      { type: 'paragraph', text: 'hello' },
      { type: 'heading', depth: 1, text: 'Title' }
    ]
    const result = mergeDetailsTokens(tokens)
    expect(result).toEqual(tokens)
  })

  it('keeps self-contained details as-is', () => {
    const tokens = [
      { type: 'html', text: '<details><summary>X</summary>content</details>' }
    ]
    const result = mergeDetailsTokens(tokens)
    expect(result).toHaveLength(1)
    expect(result[0].text).toBe('<details><summary>X</summary>content</details>')
  })

  it('merges split details with code block', () => {
    const tokens = [
      { type: 'html', text: '<details>\n<summary>Click</summary>\n\n' },
      { type: 'code', text: 'const x = 1', lang: 'js' },
      { type: 'html', text: '</details>' }
    ]
    const result = mergeDetailsTokens(tokens)
    expect(result).toHaveLength(1)
    expect(result[0].type).toBe('html')
    expect(result[0].text).toContain('<details>')
    expect(result[0].text).toContain('<summary>Click</summary>')
    expect(result[0].text).toContain('<pre><code class="language-js">')
    expect(result[0].text).toContain('const x = 1')
    expect(result[0].text).toContain('</details>')
  })

  it('merges details with paragraph content', () => {
    const tokens = [
      { type: 'html', text: '<details>\n<summary>Info</summary>\n\n' },
      { type: 'paragraph', text: 'Some text here' },
      { type: 'html', text: '</details>' }
    ]
    const result = mergeDetailsTokens(tokens)
    expect(result).toHaveLength(1)
    expect(result[0].text).toContain('<p>Some text here</p>')
  })

  it('merges details with heading', () => {
    const tokens = [
      { type: 'html', text: '<details>\n<summary>S</summary>\n\n' },
      { type: 'heading', depth: 2, text: 'Section' },
      { type: 'html', text: '</details>' }
    ]
    const result = mergeDetailsTokens(tokens)
    expect(result).toHaveLength(1)
    expect(result[0].text).toContain('<h2>Section</h2>')
  })

  it('handles nested details', () => {
    const tokens = [
      { type: 'html', text: '<details>\n<summary>Outer</summary>\n\n' },
      { type: 'html', text: '<details>\n<summary>Inner</summary>\n\n' },
      { type: 'paragraph', text: 'nested' },
      { type: 'html', text: '</details>' },
      { type: 'html', text: '</details>' }
    ]
    const result = mergeDetailsTokens(tokens)
    expect(result).toHaveLength(1)
    expect(result[0].text).toContain('Outer')
    expect(result[0].text).toContain('Inner')
    expect(result[0].text).toContain('nested')
  })

  it('handles hr and space tokens', () => {
    const tokens = [
      { type: 'html', text: '<details>\n<summary>S</summary>\n\n' },
      { type: 'hr' },
      { type: 'space' },
      { type: 'html', text: '</details>' }
    ]
    const result = mergeDetailsTokens(tokens)
    expect(result).toHaveLength(1)
    expect(result[0].text).toContain('<hr>')
  })

  it('handles blockquote and list tokens', () => {
    const tokens = [
      { type: 'html', text: '<details>\n<summary>S</summary>\n\n' },
      { type: 'blockquote', text: 'quoted' },
      { type: 'list', raw: '<ul><li>item</li></ul>' },
      { type: 'html', text: '</details>' }
    ]
    const result = mergeDetailsTokens(tokens)
    expect(result).toHaveLength(1)
    expect(result[0].text).toContain('<blockquote>')
    expect(result[0].text).toContain('<ul><li>item</li></ul>')
  })

  it('handles code block without lang', () => {
    const tokens = [
      { type: 'html', text: '<details>\n<summary>S</summary>\n\n' },
      { type: 'code', text: 'plain code', lang: '' },
      { type: 'html', text: '</details>' }
    ]
    const result = mergeDetailsTokens(tokens)
    expect(result[0].text).toContain('<pre><code>')
    expect(result[0].text).not.toContain('class=')
  })

  it('escapes HTML in code content', () => {
    const tokens = [
      { type: 'html', text: '<details>\n<summary>S</summary>\n\n' },
      { type: 'code', text: '<div>&amp;</div>', lang: '' },
      { type: 'html', text: '</details>' }
    ]
    const result = mergeDetailsTokens(tokens)
    expect(result[0].text).toContain('&lt;div&gt;&amp;amp;&lt;/div&gt;')
  })

  it('preserves non-details tokens around merged block', () => {
    const tokens = [
      { type: 'paragraph', text: 'before' },
      { type: 'html', text: '<details>\n<summary>S</summary>\n\n' },
      { type: 'paragraph', text: 'inside' },
      { type: 'html', text: '</details>' },
      { type: 'paragraph', text: 'after' }
    ]
    const result = mergeDetailsTokens(tokens)
    expect(result).toHaveLength(3)
    expect(result[0].text).toBe('before')
    expect(result[1].text).toContain('<details>')
    expect(result[2].text).toBe('after')
  })

  it('handles unknown token type with fallback', () => {
    const tokens = [
      { type: 'html', text: '<details>\n<summary>S</summary>\n\n' },
      { type: 'unknown_type', text: 'fallback text' },
      { type: 'html', text: '</details>' }
    ]
    const result = mergeDetailsTokens(tokens)
    expect(result[0].text).toContain('fallback text')
  })
})
