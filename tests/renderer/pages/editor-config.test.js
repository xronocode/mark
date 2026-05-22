/**
 * Tests for src/renderer/src/prefComponents/editor/config.js
 *
 * Verifies exported option arrays and factory functions.
 */

vi.mock('@/i18n', () => ({
  t: (key) => key
}))

vi.mock('common/encoding', () => ({
  ENCODING_NAME_MAP: Object.freeze({
    utf8: 'UTF-8',
    utf16be: 'UTF-16 BE',
    utf16le: 'UTF-16 LE'
  })
}))

import {
  tabSizeOptions,
  getEndOfLineOptions,
  getTrimTrailingNewlineOptions,
  getTextDirectionOptions,
  getDefaultEncodingOptions
} from '@/prefComponents/editor/config'

describe('editor/config.js', () => {
  describe('tabSizeOptions', () => {
    it('is an array of 4 entries with label/value pairs', () => {
      expect(tabSizeOptions).toHaveLength(4)
      tabSizeOptions.forEach((opt) => {
        expect(opt).toHaveProperty('label')
        expect(opt).toHaveProperty('value')
        expect(typeof opt.value).toBe('number')
      })
    })

    it('has values 1 through 4', () => {
      const values = tabSizeOptions.map((o) => o.value)
      expect(values).toEqual([1, 2, 3, 4])
    })
  })

  describe('getEndOfLineOptions', () => {
    it('returns 3 options with correct values', () => {
      const options = getEndOfLineOptions()
      expect(options).toHaveLength(3)
      expect(options.map((o) => o.value)).toEqual(['default', 'crlf', 'lf'])
    })

    it('uses i18n keys as labels', () => {
      const options = getEndOfLineOptions()
      options.forEach((opt) => {
        expect(typeof opt.label).toBe('string')
        expect(opt.label.startsWith('preferences.editor.')).toBe(true)
      })
    })
  })

  describe('getTrimTrailingNewlineOptions', () => {
    it('returns 4 options with numeric values 0-3', () => {
      const options = getTrimTrailingNewlineOptions()
      expect(options).toHaveLength(4)
      expect(options.map((o) => o.value)).toEqual([0, 1, 2, 3])
    })
  })

  describe('getTextDirectionOptions', () => {
    it('returns ltr and rtl options', () => {
      const options = getTextDirectionOptions()
      expect(options).toHaveLength(2)
      expect(options.map((o) => o.value)).toEqual(['ltr', 'rtl'])
    })
  })

  describe('getDefaultEncodingOptions', () => {
    it('returns an array derived from ENCODING_NAME_MAP', () => {
      const options = getDefaultEncodingOptions()
      expect(Array.isArray(options)).toBe(true)
      expect(options.length).toBeGreaterThan(0)
      options.forEach((opt) => {
        expect(opt).toHaveProperty('label')
        expect(opt).toHaveProperty('value')
      })
    })

    it('caches result on subsequent calls', () => {
      const a = getDefaultEncodingOptions()
      const b = getDefaultEncodingOptions()
      expect(a).toBe(b)
    })
  })
})
