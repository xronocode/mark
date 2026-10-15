/**
 * Tests for src/renderer/src/prefComponents/tabsBar/config.js (C-38 T-003)
 *
 * Covers: the tab catalog, the legacy-route redirect map completeness,
 * the search category → tab map, tabPath/tabTitle helpers and the
 * remembered-tab persistence (including the try/catch paths).
 */

import {
  TABS,
  TAB_IDS,
  LEGACY_ROUTE_REDIRECTS,
  CATEGORY_TO_TAB,
  LAST_TAB_STORAGE_KEY,
  tabPath,
  tabTitle,
  readLastTab,
  writeLastTab
} from '@/prefComponents/tabsBar/config'

describe('tabsBar/config.js', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  describe('TABS catalog', () => {
    it('has the 5 IA tabs in display order', () => {
      expect(TAB_IDS).toEqual(['general', 'appearance', 'editor', 'markdown', 'advanced'])
    })

    it('every tab has an i18n label key and a /preference path', () => {
      TABS.forEach((tab) => {
        expect(tab.labelKey).toBe(`preferences.tabs.${tab.id}`)
        expect(tab.path).toBe(`/preference/${tab.id}`)
      })
    })
  })

  describe('LEGACY_ROUTE_REDIRECTS', () => {
    it('covers all six retired routes of the old 9-route table', () => {
      expect(Object.keys(LEGACY_ROUTE_REDIRECTS).sort()).toEqual(
        ['extensions', 'image', 'keybindings', 'language', 'spelling', 'theme'].sort()
      )
    })

    it('every redirect target is one of the 5 tab paths', () => {
      Object.values(LEGACY_ROUTE_REDIRECTS).forEach((target) => {
        expect(TABS.map((t) => t.path)).toContain(target)
      })
    })

    it('maps the N2 IA homes: spelling→editor, theme→appearance, language→general', () => {
      expect(LEGACY_ROUTE_REDIRECTS.spelling).toBe('/preference/editor')
      expect(LEGACY_ROUTE_REDIRECTS.theme).toBe('/preference/appearance')
      expect(LEGACY_ROUTE_REDIRECTS.language).toBe('/preference/general')
      expect(LEGACY_ROUTE_REDIRECTS.image).toBe('/preference/advanced')
      expect(LEGACY_ROUTE_REDIRECTS.keybindings).toBe('/preference/advanced')
      expect(LEGACY_ROUTE_REDIRECTS.extensions).toBe('/preference/advanced')
    })
  })

  describe('CATEGORY_TO_TAB', () => {
    it('routes schema search categories to the owning tab', () => {
      expect(CATEGORY_TO_TAB.theme).toBe('appearance')
      expect(CATEGORY_TO_TAB.spelling).toBe('editor')
      expect(CATEGORY_TO_TAB.image).toBe('advanced')
      expect(CATEGORY_TO_TAB['custom css']).toBe('advanced')
      expect(CATEGORY_TO_TAB.general).toBe('general')
      expect(CATEGORY_TO_TAB.editor).toBe('editor')
      expect(CATEGORY_TO_TAB.markdown).toBe('markdown')
    })

    it('every mapped tab id is a real tab', () => {
      Object.values(CATEGORY_TO_TAB).forEach((id) => {
        expect(TAB_IDS).toContain(id)
      })
    })
  })

  describe('tabPath', () => {
    it('builds the path for each tab', () => {
      expect(tabPath('appearance')).toBe('/preference/appearance')
    })

    it('falls back to general for unknown ids', () => {
      expect(tabPath('theme')).toBe('/preference/general')
      expect(tabPath(undefined)).toBe('/preference/general')
    })
  })

  describe('tabTitle', () => {
    it('macOS shows the bare tab label', () => {
      expect(tabTitle('Appearance', true)).toBe('Appearance')
    })

    it('Windows/Linux appends the app name', () => {
      expect(tabTitle('Appearance', false)).toBe('Appearance — Mark')
    })

    it('falls back to Settings for missing labels', () => {
      expect(tabTitle('', true)).toBe('Settings')
      expect(tabTitle(undefined, false)).toBe('Settings — Mark')
    })
  })

  describe('remembered tab persistence', () => {
    it('readLastTab returns general when nothing is stored', () => {
      expect(readLastTab()).toBe('general')
    })

    it('writeLastTab persists and readLastTab returns it', () => {
      writeLastTab('markdown')
      expect(window.localStorage.getItem(LAST_TAB_STORAGE_KEY)).toBe('markdown')
      expect(readLastTab()).toBe('markdown')
    })

    it('readLastTab rejects stored values that are not tab ids', () => {
      window.localStorage.setItem(LAST_TAB_STORAGE_KEY, 'theme')
      expect(readLastTab()).toBe('general')
    })

    it('writeLastTab ignores non-tab ids', () => {
      writeLastTab('spelling')
      expect(window.localStorage.getItem(LAST_TAB_STORAGE_KEY)).toBeNull()
    })

    it('readLastTab survives localStorage throwing (private mode)', () => {
      const getter = vi.spyOn(window.localStorage, 'getItem').mockImplementation(() => {
        throw new Error('quota')
      })
      expect(readLastTab()).toBe('general')
      getter.mockRestore()
    })

    it('writeLastTab survives localStorage throwing', () => {
      const setter = vi
        .spyOn(window.localStorage, 'setItem')
        .mockImplementation(() => {
          throw new Error('quota')
        })
      expect(() => writeLastTab('editor')).not.toThrow()
      setter.mockRestore()
    })
  })
})
