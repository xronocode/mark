/**
 * Tests for src/renderer/src/prefComponents/general/config.js
 */

vi.mock('@/i18n', () => ({
  t: (key) => key
}))

import {
  getTitleBarStyleOptions,
  zoomOptions,
  getFileSortByOptions,
  getLanguageOptions
} from '@/prefComponents/general/config'

describe('general/config.js', () => {
  describe('getTitleBarStyleOptions', () => {
    it('returns custom and native options', () => {
      const options = getTitleBarStyleOptions()
      expect(options).toHaveLength(2)
      expect(options.map((o) => o.value)).toEqual(['custom', 'native'])
    })
  })

  describe('zoomOptions', () => {
    it('is a static array of 13 zoom levels', () => {
      expect(zoomOptions).toHaveLength(13)
      expect(zoomOptions[0].value).toBe(0.5)
      expect(zoomOptions[zoomOptions.length - 1].value).toBe(2.0)
    })

    it('each entry has label and value', () => {
      zoomOptions.forEach((opt) => {
        expect(typeof opt.label).toBe('string')
        expect(typeof opt.value).toBe('number')
      })
    })
  })

  describe('getFileSortByOptions', () => {
    it('returns created, modified, and title options', () => {
      const options = getFileSortByOptions()
      expect(options).toHaveLength(3)
      expect(options.map((o) => o.value)).toEqual(['created', 'modified', 'title'])
    })
  })

  describe('getLanguageOptions', () => {
    it('returns 10 language options', () => {
      const options = getLanguageOptions()
      expect(options).toHaveLength(10)
    })

    it('includes English as first entry', () => {
      const options = getLanguageOptions()
      expect(options[0].value).toBe('en')
    })

    it('includes expected language codes', () => {
      const values = getLanguageOptions().map((o) => o.value)
      expect(values).toContain('en')
      expect(values).toContain('ru')
      expect(values).toContain('zh-CN')
      expect(values).toContain('ja')
    })
  })
})
