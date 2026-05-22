/**
 * Tests for src/renderer/src/prefComponents/markdown/config.js
 */

vi.mock('@/i18n', () => ({
  t: (key) => key
}))

import {
  bulletListMarkerOptions,
  orderListDelimiterOptions,
  getPreferHeadingStyleOptions,
  getListIndentationOptions,
  getFrontmatterTypeOptions,
  getSequenceThemeOptions
} from '@/prefComponents/markdown/config'

describe('markdown/config.js', () => {
  describe('bulletListMarkerOptions', () => {
    it('has *, -, + options', () => {
      expect(bulletListMarkerOptions).toHaveLength(3)
      expect(bulletListMarkerOptions.map((o) => o.value)).toEqual(['*', '-', '+'])
    })
  })

  describe('orderListDelimiterOptions', () => {
    it('has . and ) options', () => {
      expect(orderListDelimiterOptions).toHaveLength(2)
      expect(orderListDelimiterOptions.map((o) => o.value)).toEqual(['.', ')'])
    })
  })

  describe('getPreferHeadingStyleOptions', () => {
    it('returns atx and setext', () => {
      const options = getPreferHeadingStyleOptions()
      expect(options).toHaveLength(2)
      expect(options.map((o) => o.value)).toEqual(['atx', 'setext'])
    })
  })

  describe('getListIndentationOptions', () => {
    it('returns 6 indentation options', () => {
      const options = getListIndentationOptions()
      expect(options).toHaveLength(6)
      expect(options[0].value).toBe('dfm')
      expect(options[1].value).toBe('tab')
    })
  })

  describe('getFrontmatterTypeOptions', () => {
    it('returns 4 frontmatter types', () => {
      const options = getFrontmatterTypeOptions()
      expect(options).toHaveLength(4)
      expect(options.map((o) => o.value)).toEqual(['-', '+', ';', '{'])
    })
  })

  describe('getSequenceThemeOptions', () => {
    it('returns hand and simple themes', () => {
      const options = getSequenceThemeOptions()
      expect(options).toHaveLength(2)
      expect(options.map((o) => o.value)).toEqual(['hand', 'simple'])
    })
  })
})
