/**
 * Tests for src/renderer/src/util/markdownToHtml.js
 *
 * Covers: markdownToHtml default export
 */

vi.mock('muya/lib/utils/exportHtml', () => {
  return {
    default: class ExportHtml {
      constructor(markdown) {
        this._md = markdown
      }

      async renderHtml() {
        return `<p>${this._md}</p>`
      }
    }
  }
})

import markdownToHtml from '@/util/markdownToHtml'

describe('util/markdownToHtml', () => {
  it('should export a function', () => {
    expect(typeof markdownToHtml).toBe('function')
  })

  it('should convert markdown to html wrapped in article', async () => {
    const result = await markdownToHtml('Hello world')
    expect(result).toBe('<article class="markdown-body"><p>Hello world</p></article>')
  })

  it('should handle empty markdown', async () => {
    const result = await markdownToHtml('')
    expect(result).toBe('<article class="markdown-body"><p></p></article>')
  })

  it('should handle markdown with special characters', async () => {
    const result = await markdownToHtml('# Title & <stuff>')
    expect(result).toContain('markdown-body')
    expect(result).toContain('# Title & <stuff>')
  })
})
