/**
 * Deep coverage tests for src/renderer/src/util/dompurify.js
 *
 * Covers: PREVIEW_DOMPURIFY_CONFIG, EXPORT_DOMPURIFY_CONFIG, sanitize()
 */

vi.mock('muya/lib/utils/dompurify', () => ({
  default: vi.fn((html, opts) => `sanitized:${html}`)
}))

import {
  PREVIEW_DOMPURIFY_CONFIG,
  EXPORT_DOMPURIFY_CONFIG,
  sanitize
} from '@/util/dompurify'

describe('util/dompurify', () => {
  describe('PREVIEW_DOMPURIFY_CONFIG', () => {
    it('is frozen', () => {
      expect(Object.isFrozen(PREVIEW_DOMPURIFY_CONFIG)).toBe(true)
    })

    it('forbids style and contenteditable attributes', () => {
      expect(PREVIEW_DOMPURIFY_CONFIG.FORBID_ATTR).toEqual(['style', 'contenteditable'])
    })

    it('disallows data attributes', () => {
      expect(PREVIEW_DOMPURIFY_CONFIG.ALLOW_DATA_ATTR).toBe(false)
    })

    it('enables html and svg profiles', () => {
      expect(PREVIEW_DOMPURIFY_CONFIG.USE_PROFILES.html).toBe(true)
      expect(PREVIEW_DOMPURIFY_CONFIG.USE_PROFILES.svg).toBe(true)
      expect(PREVIEW_DOMPURIFY_CONFIG.USE_PROFILES.svgFilters).toBe(true)
      expect(PREVIEW_DOMPURIFY_CONFIG.USE_PROFILES.mathMl).toBe(false)
    })

    it('disables trusted types', () => {
      expect(PREVIEW_DOMPURIFY_CONFIG.RETURN_TRUSTED_TYPE).toBe(false)
    })
  })

  describe('EXPORT_DOMPURIFY_CONFIG', () => {
    it('is frozen', () => {
      expect(Object.isFrozen(EXPORT_DOMPURIFY_CONFIG)).toBe(true)
    })

    it('forbids only contenteditable', () => {
      expect(EXPORT_DOMPURIFY_CONFIG.FORBID_ATTR).toEqual(['contenteditable'])
    })

    it('adds data-align attribute', () => {
      expect(EXPORT_DOMPURIFY_CONFIG.ADD_ATTR).toEqual(['data-align'])
    })

    it('has ALLOWED_URI_REGEXP for file protocol', () => {
      const regex = EXPORT_DOMPURIFY_CONFIG.ALLOWED_URI_REGEXP
      expect(regex).toBeInstanceOf(RegExp)
      // Test that file: protocol is allowed
      expect(regex.test('file:///path/to/image.png')).toBe(true)
      expect(regex.test('https://example.com')).toBe(true)
      expect(regex.test('mailto:user@example.com')).toBe(true)
    })
  })

  describe('sanitize()', () => {
    it('calls runSanitize with html and options', () => {
      const result = sanitize('<p>hello</p>', { FORBID_ATTR: ['style'] })
      expect(result).toBe('sanitized:<p>hello</p>')
    })

    it('passes through purifyOptions', () => {
      const opts = { ...PREVIEW_DOMPURIFY_CONFIG }
      const result = sanitize('<div>test</div>', opts)
      expect(result).toBe('sanitized:<div>test</div>')
    })

    it('handles empty string', () => {
      const result = sanitize('', {})
      expect(result).toBe('sanitized:')
    })
  })
})
