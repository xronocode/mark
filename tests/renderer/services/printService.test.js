/**
 * Tests for src/renderer/src/services/printService.js
 *
 * Covers: MarkdownPrint class — renderMarkdown (normal + static),
 * clearup, container lifecycle.
 */

vi.mock('muya/lib/utils', () => ({
  getImageInfo: vi.fn((src) => ({ src: `resolved:${src}` }))
}))

import MarkdownPrint from '@/services/printService'

describe('MarkdownPrint', () => {
  let printer

  beforeEach(() => {
    printer = new MarkdownPrint()
    // Clean up any leftover DOM
    document.body.innerHTML = ''
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  describe('renderMarkdown', () => {
    it('creates a print container and appends to body', () => {
      printer.renderMarkdown('<p>Hello</p>')

      const container = document.querySelector('.print-container')
      expect(container).not.toBeNull()
      expect(container.innerHTML).toBe('<p>Hello</p>')
    })

    it('container is an article element', () => {
      printer.renderMarkdown('<p>Test</p>')

      const container = document.querySelector('.print-container')
      expect(container.tagName).toBe('ARTICLE')
    })

    it('stores container reference on instance', () => {
      printer.renderMarkdown('<p>Stored</p>')
      expect(printer.container).toBeDefined()
      expect(printer.container.classList.contains('print-container')).toBe(true)
    })

    it('clears previous container before rendering', () => {
      printer.renderMarkdown('<p>First</p>')
      printer.renderMarkdown('<p>Second</p>')

      const containers = document.querySelectorAll('.print-container')
      expect(containers).toHaveLength(1)
      expect(containers[0].innerHTML).toBe('<p>Second</p>')
    })

    it('fixes image sources when renderStatic is true', () => {
      const html = '<p><img src="./local.png" /><img src="https://example.com/remote.png" /></p>'
      printer.renderMarkdown(html, true)

      const images = document.querySelectorAll('.print-container img')
      expect(images[0].src).toContain('resolved:./local.png')
      expect(images[1].src).toContain('resolved:https://example.com/remote.png')
    })

    it('does not fix image sources when renderStatic is false/undefined', async () => {
      const muyaUtils = await import('muya/lib/utils')

      // Clear mock call count before this test
      vi.mocked(muyaUtils.getImageInfo).mockClear()

      printer.renderMarkdown('<p><img src="test.png" /></p>')

      // getImageInfo should not have been called for non-static rendering
      expect(muyaUtils.getImageInfo).not.toHaveBeenCalled()
      const container = document.querySelector('.print-container')
      expect(container).not.toBeNull()
    })

    it('handles HTML with no images in static mode', () => {
      printer.renderMarkdown('<p>No images here</p>', true)
      const container = document.querySelector('.print-container')
      expect(container.innerHTML).toBe('<p>No images here</p>')
    })

    it('handles empty HTML', () => {
      printer.renderMarkdown('')
      const container = document.querySelector('.print-container')
      expect(container).not.toBeNull()
      expect(container.innerHTML).toBe('')
    })
  })

  describe('clearup', () => {
    it('removes the container from DOM', () => {
      printer.renderMarkdown('<p>To be cleared</p>')
      expect(document.querySelector('.print-container')).not.toBeNull()

      printer.clearup()
      expect(document.querySelector('.print-container')).toBeNull()
    })

    it('does nothing when no container exists', () => {
      // Should not throw
      expect(() => printer.clearup()).not.toThrow()
    })

    it('is safe to call multiple times', () => {
      printer.renderMarkdown('<p>test</p>')
      printer.clearup()
      printer.clearup()
      expect(document.querySelector('.print-container')).toBeNull()
    })
  })
})
