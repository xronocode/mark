/**
 * Tests for src/renderer/src/prefComponents/sideBar/config.js
 *
 * This module exports getCategory(), getTranslatedSearchContent(),
 * setupLanguageChangeListener(), refreshSearchContent(), debugLanguageState().
 */

vi.mock('@/i18n', () => ({
  t: (key) => key
}))

// Mock SVG icon imports
vi.mock('@/assets/icons/pref_general.svg', () => ({ default: {} }))
vi.mock('@/assets/icons/pref_editor.svg', () => ({ default: {} }))
vi.mock('@/assets/icons/pref_markdown.svg', () => ({ default: {} }))
vi.mock('@/assets/icons/pref_theme.svg', () => ({ default: {} }))
vi.mock('@/assets/icons/pref_image.svg', () => ({ default: {} }))
vi.mock('@/assets/icons/pref_spellcheck.svg', () => ({ default: {} }))
vi.mock('@/assets/icons/pref_key_binding.svg', () => ({ default: {} }))
vi.mock('@/assets/icons/pref_language.svg', () => ({ default: {} }))

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

import {
  getCategory,
  getTranslatedSearchContent,
  refreshSearchContent
} from '@/prefComponents/sideBar/config'

describe('sideBar/config.js', () => {
  describe('getCategory', () => {
    it('returns an array of 9 categories', () => {
      const categories = getCategory()
      expect(categories).toHaveLength(9)
    })

    it('each category has name, label, icon, path', () => {
      const categories = getCategory()
      categories.forEach((cat) => {
        expect(cat).toHaveProperty('name')
        expect(cat).toHaveProperty('label')
        expect(cat).toHaveProperty('icon')
        expect(cat).toHaveProperty('path')
      })
    })

    it('contains expected labels', () => {
      const labels = getCategory().map((c) => c.label)
      expect(labels).toContain('general')
      expect(labels).toContain('editor')
      expect(labels).toContain('markdown')
      expect(labels).toContain('theme')
      expect(labels).toContain('image')
      expect(labels).toContain('keybindings')
      expect(labels).toContain('language')
    })

    it('paths start with /preference/', () => {
      const categories = getCategory()
      categories.forEach((cat) => {
        expect(cat.path).toMatch(/^\/preference\//)
      })
    })
  })

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
  })

  describe('refreshSearchContent', () => {
    it('returns search content array', () => {
      const result = refreshSearchContent()
      expect(Array.isArray(result)).toBe(true)
    })
  })
})
