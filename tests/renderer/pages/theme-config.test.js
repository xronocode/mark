/**
 * Tests for src/renderer/src/prefComponents/theme/config.js
 * C-41 T-002: the picker config is derived from config THEME_FAMILIES —
 * the families list drives the tiles, the flat member list the selects.
 */

import { themes, families } from '@/prefComponents/theme/config'
import { THEME_FAMILIES } from '@/util/themeFamilies'

const RETIRED_IDS = [
  'light', 'dark', 'material-dark', 'rose-pine-moon', 'tokyo-night-storm',
  'ayu-mirage', 'monokai-pro', 'nightfox', 'palenight', 'horizon-dark',
  'synthwave-84', 'cyberdream', 'oxocarbon-dark'
]

describe('theme/config.js', () => {
  describe('families', () => {
    it('is an array derived from THEME_FAMILIES in the same order', () => {
      expect(Array.isArray(families)).toBe(true)
      expect(families.length).toBe(THEME_FAMILIES.length)
      families.forEach((family, index) => {
        expect(family.id).toBe(THEME_FAMILIES[index].id)
        expect(family.name).toBe(THEME_FAMILIES[index].name)
        expect(family.light).toBe(THEME_FAMILIES[index].light)
        expect(family.dark).toBe(THEME_FAMILIES[index].dark)
      })
    })

    it('each family has id, name, light, and dark', () => {
      families.forEach((family) => {
        expect(typeof family.id).toBe('string')
        expect(family.id.length).toBeGreaterThan(0)
        expect(typeof family.name).toBe('string')
        expect(family.name.length).toBeGreaterThan(0)
        expect(family.light).not.toBe(family.dark)
      })
    })

    it('contains the brand family first', () => {
      expect(families[0]).toEqual({ id: 'paper', name: 'Paper', light: 'paper', dark: 'ink' })
    })

    it('contains no retired member', () => {
      const members = families.flatMap((f) => [f.light, f.dark])
      for (const retired of RETIRED_IDS) {
        expect(members, retired).not.toContain(retired)
      }
    })
  })

  describe('themes', () => {
    it('is the flat member list in family order', () => {
      expect(Array.isArray(themes)).toBe(true)
      expect(themes.length).toBe(THEME_FAMILIES.length * 2)
      expect(themes[0]).toEqual({ name: 'paper' })
      expect(themes[1]).toEqual({ name: 'ink' })
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
      expect(names).toContain('paper')
      expect(names).toContain('graphite')
      expect(names).toContain('ulysses')
    })

    it('contains known dark themes', () => {
      const names = themes.map((t) => t.name)
      expect(names).toContain('ink')
      expect(names).toContain('one-dark')
      expect(names).toContain('dracula')
      expect(names).toContain('nord')
    })

    it('has no duplicate names', () => {
      const names = themes.map((t) => t.name)
      const unique = new Set(names)
      expect(unique.size).toBe(names.length)
    })

    it('contains no retired theme (C-41 T-002)', () => {
      const names = themes.map((t) => t.name)
      for (const retired of RETIRED_IDS) {
        expect(names).not.toContain(retired)
      }
    })

    it('each member is classified consistently with its family half', async () => {
      // config.js reads window.path at module scope — import it lazily.
      const { isDarkTheme } = await import('@/config')
      for (const family of families) {
        expect(isDarkTheme(family.light), `${family.light} should be light`).toBe(false)
        // graphite-dark and ulysses-dark are registered by C-41 T-003.
        if (family.dark !== 'graphite-dark' && family.dark !== 'ulysses-dark') {
          expect(isDarkTheme(family.dark), `${family.dark} should be dark`).toBe(true)
        }
      }
    })
  })
})
