/**
 * Tests for src/renderer/src/prefComponents/theme/config.js
 */

import { themes } from '@/prefComponents/theme/config'

describe('theme/config.js', () => {
  describe('themes', () => {
    it('is an array of theme objects', () => {
      expect(Array.isArray(themes)).toBe(true)
      expect(themes.length).toBeGreaterThan(0)
    })

    it('each theme has a name property', () => {
      themes.forEach((theme) => {
        expect(theme).toHaveProperty('name')
        expect(typeof theme.name).toBe('string')
        expect(theme.name.length).toBeGreaterThan(0)
      })
    })

    it('contains known light themes', () => {
      const names = themes.map((t) => t.name)
      expect(names).toContain('light')
      expect(names).toContain('graphite')
      expect(names).toContain('ulysses')
    })

    it('contains known dark themes', () => {
      const names = themes.map((t) => t.name)
      expect(names).toContain('dark')
      expect(names).toContain('one-dark')
      expect(names).toContain('dracula')
      expect(names).toContain('nord')
    })

    it('has no duplicate names', () => {
      const names = themes.map((t) => t.name)
      const unique = new Set(names)
      expect(unique.size).toBe(names.length)
    })
  })
})
