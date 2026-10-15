/**
 * Tests for src/renderer/src/prefComponents/sideBar/config.js
 *
 * C-38 T-003: the module is the schema.json settings-search index.
 * getCategory() (the retired 9-item rail catalog) is gone; search hits
 * carry a routeCategory resolved against the 5 new tabs.
 */

vi.mock('@/i18n', () => ({
  t: (key) => key
}))

// Mock the preferences schema
vi.mock('@/_shims/preferences/schema.json', () => ({
  default: {
    fontSize: {
      description: 'Editor--Font size',
      type: 'number'
    },
    theme: {
      description: 'Theme--Current theme',
      type: 'string',
      enum: ['light', 'dark']
    },
    internalOption: {
      description: 'General--internal',
      type: 'string'
    }
  }
}))

import { getTranslatedSearchContent, refreshSearchContent } from '@/prefComponents/sideBar/config'
import { TAB_IDS } from '@/prefComponents/tabsBar/config'

describe('sideBar/config.js', () => {
  describe('getTranslatedSearchContent', () => {
    it('returns an array of search items', () => {
      const content = getTranslatedSearchContent()
      expect(Array.isArray(content)).toBe(true)
    })

    it('filters out internal options', () => {
      const content = getTranslatedSearchContent()
      const keys = content.map((c) => c.key)
      expect(keys).not.toContain('internalOption')
    })

    it('each item has expected shape', () => {
      const content = getTranslatedSearchContent()
      content.forEach((item) => {
        expect(item).toHaveProperty('key')
        expect(item).toHaveProperty('category')
        expect(item).toHaveProperty('preference')
        expect(item).toHaveProperty('routeCategory')
        expect(item).toHaveProperty('description')
      })
    })

    it('every routeCategory is one of the 5 new tab ids', () => {
      const content = getTranslatedSearchContent()
      content.forEach((item) => {
        expect(TAB_IDS).toContain(item.routeCategory)
      })
    })
  })

  describe('refreshSearchContent', () => {
    it('returns search content array', () => {
      const result = refreshSearchContent()
      expect(Array.isArray(result)).toBe(true)
    })
  })
})
