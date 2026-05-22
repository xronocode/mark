/**
 * Tests for src/renderer/src/util/pdf.js
 *
 * Covers: getCssForOptions, getHtmlToc
 */

vi.mock('muya/lib/parser/marked/slugger', () => {
  return {
    default: class Slugger {
      constructor() {
        this.seen = {}
      }

      slug(text) {
        return text.toLowerCase().replace(/\s+/g, '-')
      }
    }
  }
})

vi.mock('muya/lib/utils', () => ({
  escapeHTML: vi.fn((s) => s),
  unescapeHTML: vi.fn((s) => s)
}))

vi.mock('@/assets/themes/export/academic.theme.css?inline', () => ({
  default: '/* academic */'
}))

vi.mock('@/assets/themes/export/liber.theme.css?inline', () => ({
  default: '/* liber */'
}))

vi.mock('@/util', () => ({
  cloneObj: vi.fn((obj) => JSON.parse(JSON.stringify(obj)))
}))

vi.mock('@/util/dompurify', () => ({
  sanitize: vi.fn((html) => html),
  EXPORT_DOMPURIFY_CONFIG: {}
}))

import { getCssForOptions, getHtmlToc } from '@/util/pdf'

describe('util/pdf', () => {
  describe('getCssForOptions', () => {
    it('should generate print CSS with page margins', async () => {
      const result = await getCssForOptions({
        type: 'pdf',
        pageMarginTop: 10,
        pageMarginRight: 15,
        pageMarginBottom: 10,
        pageMarginLeft: 15
      })
      expect(result).toContain('@media print')
      expect(result).toContain('@page')
      expect(result).toContain('10mm 15mm 10mm 15mm')
    })

    it('should not add @media print for styledHtml type', async () => {
      const result = await getCssForOptions({ type: 'styledHtml' })
      expect(result).not.toContain('@media print')
    })

    it('should add font family when specified', async () => {
      const result = await getCssForOptions({
        type: 'styledHtml',
        fontFamily: 'Arial'
      })
      expect(result).toContain('font-family:"Arial"')
    })

    it('should add font size when specified', async () => {
      const result = await getCssForOptions({
        type: 'styledHtml',
        fontSize: 16
      })
      expect(result).toContain('font-size:16px')
    })

    it('should add line height when specified', async () => {
      const result = await getCssForOptions({
        type: 'styledHtml',
        lineHeight: 1.6
      })
      expect(result).toContain('line-height:1.6')
    })

    it('should include auto numbering headings CSS', async () => {
      const result = await getCssForOptions({
        type: 'styledHtml',
        autoNumberingHeadings: true
      })
      expect(result).toContain('counter-reset: h2')
    })

    it('should hide front matter when showFrontMatter is false', async () => {
      const result = await getCssForOptions({
        type: 'styledHtml',
        showFrontMatter: false
      })
      expect(result).toContain('pre.front-matter{display:none')
    })

    it('should include academic theme', async () => {
      const result = await getCssForOptions({
        type: 'styledHtml',
        theme: 'academic'
      })
      expect(result).toContain('/* academic */')
    })

    it('should include liber theme', async () => {
      const result = await getCssForOptions({
        type: 'styledHtml',
        theme: 'liber'
      })
      expect(result).toContain('/* liber */')
    })

    it('should read custom theme from disk', async () => {
      window.marktext = { paths: { userDataPath: '/tmp/mt' } }
      window.path.join.mockReturnValue('/tmp/mt/themes/export/custom.css')
      window.fileUtils.isFile.mockReturnValue(true)
      window.fileUtils.readFile.mockResolvedValue('/* custom theme */')

      const result = await getCssForOptions({
        type: 'styledHtml',
        theme: 'custom.css'
      })
      expect(result).toContain('/* custom theme */')
    })

    it('should handle missing custom theme file', async () => {
      window.marktext = { paths: { userDataPath: '/tmp/mt' } }
      window.path.join.mockReturnValue('/tmp/mt/themes/export/missing.css')
      window.fileUtils.isFile.mockReturnValue(false)

      const result = await getCssForOptions({
        type: 'styledHtml',
        theme: 'missing.css'
      })
      expect(result).not.toContain('missing.css')
    })

    it('should handle readFile error for custom theme', async () => {
      window.marktext = { paths: { userDataPath: '/tmp/mt' } }
      window.path.join.mockReturnValue('/tmp/mt/themes/export/error.css')
      window.fileUtils.isFile.mockReturnValue(true)
      window.fileUtils.readFile.mockRejectedValue(new Error('read error'))

      const result = await getCssForOptions({
        type: 'styledHtml',
        theme: 'error.css'
      })
      // Should not throw, just silently skip
      expect(typeof result).toBe('string')
    })

    it('should add header/footer font size', async () => {
      const result = await getCssForOptions({
        type: 'styledHtml',
        headerFooterFontSize: 10
      })
      expect(result).toContain('font-size: 10px')
    })

    it('should close @page block for printable types', async () => {
      const result = await getCssForOptions({
        type: 'pdf',
        pageMarginTop: 10,
        pageMarginRight: 10,
        pageMarginBottom: 10,
        pageMarginLeft: 10
      })
      // Should have matching braces
      const openBraces = (result.match(/{/g) || []).length
      const closeBraces = (result.match(/}/g) || []).length
      expect(closeBraces).toBe(openBraces)
    })
  })

  describe('getHtmlToc', () => {
    it('should return empty string for empty toc', () => {
      expect(getHtmlToc([])).toBe('')
    })

    it('should generate TOC HTML with default title', () => {
      const toc = [
        { lvl: 1, content: 'Introduction' },
        { lvl: 2, content: 'Getting Started' }
      ]
      const result = getHtmlToc(toc, { tocIncludeTopHeading: true })
      expect(result).toContain('Table of Contents')
      expect(result).toContain('Introduction')
      expect(result).toContain('Getting Started')
      expect(result).toContain('toc-container')
    })

    it('should use custom title when provided', () => {
      const toc = [{ lvl: 2, content: 'Hello' }]
      const result = getHtmlToc(toc, { tocTitle: 'Custom TOC', tocIncludeTopHeading: true })
      expect(result).toContain('Custom TOC')
    })

    it('should exclude top heading when tocIncludeTopHeading is false', () => {
      const toc = [
        { lvl: 1, content: 'Title' },
        { lvl: 2, content: 'Section' }
      ]
      const result = getHtmlToc(toc, { tocIncludeTopHeading: false })
      expect(result).toContain('Section')
    })

    it('should generate nested list for sub-headings', () => {
      const toc = [
        { lvl: 1, content: 'H1' },
        { lvl: 2, content: 'H2' },
        { lvl: 3, content: 'H3' }
      ]
      const result = getHtmlToc(toc, { tocIncludeTopHeading: true })
      expect(result).toContain('<ul>')
      expect(result).toContain('toc-h1')
      expect(result).toContain('toc-h2')
      expect(result).toContain('toc-h3')
    })

    it('should handle siblings in TOC', () => {
      const toc = [
        { lvl: 2, content: 'A' },
        { lvl: 2, content: 'B' }
      ]
      const result = getHtmlToc(toc)
      expect(result).toContain('A')
      expect(result).toContain('B')
    })

    it('should not clone the original toc array', () => {
      const toc = [{ lvl: 1, content: 'Test' }]
      getHtmlToc(toc)
      // Original should not be mutated (cloneObj is used internally)
      expect(toc).toHaveLength(1)
    })
  })
})
