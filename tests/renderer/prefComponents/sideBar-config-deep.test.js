/**
 * Deep tests for src/renderer/src/prefComponents/sideBar/config.js
 *
 * Targets uncovered branches in getTranslatedSearchContent, setupLanguageChangeListener,
 * refreshSearchContent, debugLanguageState, createDebugPopup, getI18nInstance.
 */

// Mutable delegate so tests can swap the t() implementation per-test.
// vi.hoisted runs before vi.mock factories, avoiding the TDZ issue.
const { tRef } = vi.hoisted(() => {
  const tRef = { fn: (key) => key }
  return { tRef }
})

vi.mock('@/i18n', () => ({
  t: (...args) => tRef.fn(...args)
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

// Mock the preferences schema with various categories for branch coverage
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
    },
    autoSave: {
      description: 'General--Auto save',
      type: 'boolean'
    },
    bulletListMarker: {
      description: 'Markdown--Bullet list marker',
      type: 'string'
    },
    imageAction: {
      description: 'Image--Image insert action',
      type: 'string'
    },
    viewOption: {
      description: 'View--View option',
      type: 'string'
    },
    searcherSetting: {
      description: 'Searcher--Max file size',
      type: 'string'
    },
    watcherSetting: {
      description: 'Watcher--Use polling',
      type: 'boolean'
    },
    spellOption: {
      description: 'Spelling--Enable spell checker',
      type: 'boolean'
    },
    customCss: {
      description: 'Custom CSS--Custom stylesheet',
      type: 'string'
    },
    unknownCategory: {
      description: 'SomeNewCategory--Unknown setting',
      type: 'string'
    },
    bareDescription: {
      description: 'NoDashItem',
      type: 'string'
    }
  }
}))

import {
  getCategory,
  getTranslatedSearchContent,
  refreshSearchContent,
  debugLanguageState,
  setupLanguageChangeListener
} from '@/prefComponents/sideBar/config'

describe('sideBar/config.js – deep tests', () => {
  beforeEach(() => {
    // Clean up any debug popups from previous tests
    const popup = document.getElementById('debugPopup')
    if (popup) popup.remove()
    const buttonContainer = document.getElementById('debugButtonContainer')
    if (buttonContainer) buttonContainer.remove()
  })

  // ── getCategory ──────────────────────────────────────────────────────

  describe('getCategory deep', () => {
    it('returns exactly 9 categories with correct labels', () => {
      const cats = getCategory()
      expect(cats).toHaveLength(9)
      const labels = cats.map((c) => c.label)
      expect(labels).toEqual([
        'general', 'editor', 'markdown', 'spelling',
        'theme', 'image', 'keybindings', 'language', 'extensions'
      ])
    })

    it('all paths start with /preference/', () => {
      const cats = getCategory()
      cats.forEach((c) => {
        expect(c.path).toMatch(/^\/preference\//)
      })
    })

    it('each category has a non-empty name', () => {
      const cats = getCategory()
      cats.forEach((c) => {
        expect(c.name).toBeTruthy()
      })
    })
  })

  // ── getTranslatedSearchContent ───────────────────────────────────────

  describe('getTranslatedSearchContent deep', () => {
    it('filters out items ending with --internal', () => {
      const content = getTranslatedSearchContent()
      const keys = content.map((c) => c.key)
      expect(keys).not.toContain('internalOption')
    })

    it('maps General category correctly', () => {
      const content = getTranslatedSearchContent()
      const autoSave = content.find((c) => c.key === 'autoSave')
      expect(autoSave).toBeDefined()
      expect(autoSave.routeCategory).toBe('general')
    })

    it('maps Editor category correctly', () => {
      const content = getTranslatedSearchContent()
      const fontSize = content.find((c) => c.key === 'fontSize')
      expect(fontSize).toBeDefined()
      expect(fontSize.routeCategory).toBe('editor')
    })

    it('maps Markdown category correctly', () => {
      const content = getTranslatedSearchContent()
      const bullet = content.find((c) => c.key === 'bulletListMarker')
      expect(bullet).toBeDefined()
      expect(bullet.routeCategory).toBe('markdown')
    })

    it('maps Theme category correctly', () => {
      const content = getTranslatedSearchContent()
      const theme = content.find((c) => c.key === 'theme')
      expect(theme).toBeDefined()
      expect(theme.routeCategory).toBe('theme')
    })

    it('maps Image category correctly', () => {
      const content = getTranslatedSearchContent()
      const img = content.find((c) => c.key === 'imageAction')
      expect(img).toBeDefined()
      expect(img.routeCategory).toBe('image')
    })

    it('maps View category to general (invalid route)', () => {
      const content = getTranslatedSearchContent()
      const view = content.find((c) => c.key === 'viewOption')
      expect(view).toBeDefined()
      // View is not in validRoutes, so it falls back to general
      expect(view.routeCategory).toBe('general')
    })

    it('maps Searcher category to general (invalid route)', () => {
      const content = getTranslatedSearchContent()
      const searcher = content.find((c) => c.key === 'searcherSetting')
      expect(searcher).toBeDefined()
      expect(searcher.routeCategory).toBe('general')
    })

    it('maps Watcher category to general (invalid route)', () => {
      const content = getTranslatedSearchContent()
      const watcher = content.find((c) => c.key === 'watcherSetting')
      expect(watcher).toBeDefined()
      expect(watcher.routeCategory).toBe('general')
    })

    it('maps Spelling category correctly', () => {
      const content = getTranslatedSearchContent()
      const spell = content.find((c) => c.key === 'spellOption')
      expect(spell).toBeDefined()
      expect(spell.routeCategory).toBe('spelling')
    })

    it('maps Custom CSS category to general (invalid route)', () => {
      const content = getTranslatedSearchContent()
      const css = content.find((c) => c.key === 'customCss')
      expect(css).toBeDefined()
      expect(css.routeCategory).toBe('general')
    })

    it('handles unknown category via else branch (lowercased with dashes)', () => {
      const content = getTranslatedSearchContent()
      const unknown = content.find((c) => c.key === 'unknownCategory')
      expect(unknown).toBeDefined()
      // "SomeNewCategory" -> "somenewcategory", not in validRoutes -> general
      expect(unknown.routeCategory).toBe('general')
    })

    it('each item has categoryEn and preferenceEn fields', () => {
      const content = getTranslatedSearchContent()
      content.forEach((item) => {
        expect(item).toHaveProperty('categoryEn')
        expect(item).toHaveProperty('preferenceEn')
      })
    })

    it('preserves enum field from schema', () => {
      const content = getTranslatedSearchContent()
      const theme = content.find((c) => c.key === 'theme')
      expect(theme.enum).toEqual(['light', 'dark'])
    })

    it('sets undefined enum when schema has no enum', () => {
      const content = getTranslatedSearchContent()
      const fontSize = content.find((c) => c.key === 'fontSize')
      expect(fontSize.enum).toBeUndefined()
    })
  })

  // ── getTranslatedSearchContent — t() throwing (catch branches) ──────

  describe('getTranslatedSearchContent with throwing t()', () => {
    afterEach(() => {
      tRef.fn = (key) => key
    })

    it('catches category translation failure and tries fallback', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      tRef.fn = (key) => {
        if (key.startsWith('preferences.search.categories.')) {
          throw new Error('no-category')
        }
        return key
      }

      const content = getTranslatedSearchContent()
      expect(content.length).toBeGreaterThan(0)
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('搜索分类翻译失败'))
      warnSpy.mockRestore()
    })

    it('catches both category translation and fallback failure', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      tRef.fn = (key) => {
        if (key.startsWith('preferences.search.categories.') ||
            key.startsWith('preferences.categories.')) {
          throw new Error('no-category-at-all')
        }
        return key
      }

      const content = getTranslatedSearchContent()
      expect(content.length).toBeGreaterThan(0)
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('搜索分类翻译失败'))
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('搜索分类fallback也失败'))
      warnSpy.mockRestore()
    })

    it('catches item translation failure and tries fallback', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      tRef.fn = (key) => {
        if (key.startsWith('preferences.search.items.')) {
          throw new Error('no-item')
        }
        return key
      }

      const content = getTranslatedSearchContent()
      expect(content.length).toBeGreaterThan(0)
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('搜索项目翻译失败'))
      warnSpy.mockRestore()
    })

    it('catches both item translation and fallback failure', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      tRef.fn = (key) => {
        if (key.startsWith('preferences.search.items.') ||
            key.startsWith('preferences.items.')) {
          throw new Error('no-item-at-all')
        }
        return key
      }

      const content = getTranslatedSearchContent()
      expect(content.length).toBeGreaterThan(0)
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('搜索项目翻译失败'))
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('搜索项目fallback也失败'))
      warnSpy.mockRestore()
    })

    it('falls back to original category name when all translations throw', () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {})

      tRef.fn = () => { throw new Error('all-fail') }

      const content = getTranslatedSearchContent()
      const autoSave = content.find(c => c.key === 'autoSave')
      expect(autoSave).toBeDefined()
      expect(autoSave.category).toBe('General')
      expect(autoSave.preferenceEn).toBe('Auto save')

      console.warn.mockRestore()
    })

    it('uses fallback category value when primary throws but fallback succeeds', () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {})

      tRef.fn = (key) => {
        if (key.startsWith('preferences.search.categories.')) {
          throw new Error('primary-fail')
        }
        if (key.startsWith('preferences.categories.')) {
          return 'fallback-category-value'
        }
        return key
      }

      const content = getTranslatedSearchContent()
      const autoSave = content.find(c => c.key === 'autoSave')
      expect(autoSave).toBeDefined()
      expect(autoSave.category).toBe('fallback-category-value')

      console.warn.mockRestore()
    })

    it('uses fallback item value when primary throws but fallback succeeds', () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {})

      tRef.fn = (key) => {
        if (key.startsWith('preferences.search.items.')) {
          throw new Error('primary-fail')
        }
        if (key.startsWith('preferences.items.')) {
          return 'fallback-item-value'
        }
        return key
      }

      const content = getTranslatedSearchContent()
      const autoSave = content.find(c => c.key === 'autoSave')
      expect(autoSave).toBeDefined()
      expect(autoSave.preference).toBe('fallback-item-value')

      console.warn.mockRestore()
    })
  })

  // ── refreshSearchContent ─────────────────────────────────────────────

  describe('refreshSearchContent deep', () => {
    it('clears lastLanguage cache', () => {
      getTranslatedSearchContent.lastLanguage = 'zh-CN'
      refreshSearchContent()
      expect(getTranslatedSearchContent.lastLanguage).toBeUndefined()
    })

    it('dispatches languageChanged event', () => {
      const handler = vi.fn()
      window.addEventListener('languageChanged', handler)
      refreshSearchContent()
      expect(handler).toHaveBeenCalled()
      window.removeEventListener('languageChanged', handler)
    })

    it('returns fresh search content array', () => {
      const result = refreshSearchContent()
      expect(Array.isArray(result)).toBe(true)
      expect(result.length).toBeGreaterThan(0)
    })
  })

  // ── setupLanguageChangeListener ──────────────────────────────────────

  describe('setupLanguageChangeListener deep', () => {
    it('sets up without error when window.__VUE_I18N__ is absent', () => {
      delete window.__VUE_I18N__
      expect(() => setupLanguageChangeListener()).not.toThrow()
    })

    it('handles window.__VUE_I18N__ with global as function', () => {
      window.__VUE_I18N__ = {
        global: () => ({ locale: { value: 'en' }, t: (k) => k })
      }
      expect(() => setupLanguageChangeListener()).not.toThrow()
      delete window.__VUE_I18N__
    })

    it('handles window.__VUE_I18N__ with global as object', () => {
      window.__VUE_I18N__ = {
        global: { locale: { value: 'fr' }, t: (k) => k }
      }
      expect(() => setupLanguageChangeListener()).not.toThrow()
      delete window.__VUE_I18N__
    })

    it('handles window.__VUE_I18N__.global without locale.value', () => {
      window.__VUE_I18N__ = {
        global: { locale: 'en' }
      }
      expect(() => setupLanguageChangeListener()).not.toThrow()
      delete window.__VUE_I18N__
    })
  })

  // ── debugLanguageState ───────────────────────────────────────────────

  describe('debugLanguageState deep', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
      const popup = document.getElementById('debugPopup')
      if (popup) popup.remove()
    })

    it('creates debug popup when none exists', () => {
      debugLanguageState()
      const popup = document.getElementById('debugPopup')
      expect(popup).not.toBeNull()
    })

    it('reuses existing debug popup', () => {
      debugLanguageState()
      const popup1 = document.getElementById('debugPopup')
      debugLanguageState()
      const popup2 = document.getElementById('debugPopup')
      // The popup should still exist
      expect(popup2).not.toBeNull()
    })

    it('populates debug content after timeout', () => {
      delete window.__VUE_I18N__
      debugLanguageState()
      vi.advanceTimersByTime(600)
      const content = document.getElementById('debugContent')
      expect(content).not.toBeNull()
      // Should contain error about missing __VUE_I18N__
      expect(content.innerHTML).toContain('__VUE_I18N__')
    })

    it('shows i18n details when __VUE_I18N__ exists with global.t', () => {
      window.__VUE_I18N__ = {
        global: {
          locale: { value: 'en' },
          t: (k) => `translated:${k}`
        }
      }
      debugLanguageState()
      vi.advanceTimersByTime(600)
      const content = document.getElementById('debugContent')
      expect(content.innerHTML).toContain('global.t')
      delete window.__VUE_I18N__
    })

    it('handles __VUE_I18N__ with global as function', () => {
      window.__VUE_I18N__ = {
        global: () => ({
          locale: { value: 'ru' },
          t: (k) => `translated:${k}`
        })
      }
      debugLanguageState()
      vi.advanceTimersByTime(600)
      const content = document.getElementById('debugContent')
      expect(content).not.toBeNull()
      delete window.__VUE_I18N__
    })

    it('handles i18n instance with t function on top-level', () => {
      window.__VUE_I18N__ = {
        t: (k) => `translated:${k}`,
        locale: { value: 'en' }
      }
      debugLanguageState()
      vi.advanceTimersByTime(600)
      const content = document.getElementById('debugContent')
      expect(content).not.toBeNull()
      delete window.__VUE_I18N__
    })

    it('handles i18n with $i18n sub-object', () => {
      window.__VUE_I18N__ = {
        $i18n: {
          t: (k) => `translated:${k}`,
          locale: { value: 'en' }
        }
      }
      debugLanguageState()
      vi.advanceTimersByTime(600)
      const content = document.getElementById('debugContent')
      expect(content).not.toBeNull()
      delete window.__VUE_I18N__
    })

    it('close button removes popup', () => {
      debugLanguageState()
      const popup = document.getElementById('debugPopup')
      expect(popup).not.toBeNull()
      // Find close button (the button with onclick to remove popup)
      const buttons = popup.querySelectorAll('button')
      expect(buttons.length).toBeGreaterThan(0)
      buttons[0].click()
      expect(document.getElementById('debugPopup')).toBeNull()
    })

    it('replaces existing popup when called twice (createDebugPopup branch)', () => {
      // First call creates the popup
      debugLanguageState()
      const popup1 = document.getElementById('debugPopup')
      expect(popup1).not.toBeNull()
      // Remove popup and create a fresh one manually to hit the "existingPopup" branch
      const fake = document.createElement('div')
      fake.id = 'debugPopup'
      document.body.appendChild(fake)
      // Now debugLanguageState should find and remove the existing popup
      debugLanguageState()
      const popup2 = document.getElementById('debugPopup')
      expect(popup2).not.toBeNull()
    })

    it('handles __VUE_I18N__ with locale.value undefined (uses locale directly)', () => {
      window.__VUE_I18N__ = {
        global: { locale: 'zh', t: (k) => k }
      }
      debugLanguageState()
      vi.advanceTimersByTime(600)
      const content = document.getElementById('debugContent')
      expect(content).not.toBeNull()
      expect(content.innerHTML).toContain('zh')
      delete window.__VUE_I18N__
    })
  })

  // ── setupLanguageChangeListener interval handler ────────────────────

  describe('setupLanguageChangeListener interval', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
      delete window.__VUE_I18N__
    })

    it('interval handler detects language change and dispatches event', () => {
      window.__VUE_I18N__ = {
        global: { locale: { value: 'en' }, t: (k) => k }
      }
      setupLanguageChangeListener()
      // Set initial language
      getTranslatedSearchContent.lastLanguage = 'en'

      const handler = vi.fn()
      window.addEventListener('languageChanged', handler)

      // Change the language
      window.__VUE_I18N__.global.locale.value = 'fr'

      // Advance timers past the 1-second interval
      vi.advanceTimersByTime(1100)

      expect(handler).toHaveBeenCalled()
      window.removeEventListener('languageChanged', handler)
    })

    it('interval handler does nothing when language has not changed', () => {
      window.__VUE_I18N__ = {
        global: { locale: { value: 'en' }, t: (k) => k }
      }
      setupLanguageChangeListener()
      getTranslatedSearchContent.lastLanguage = 'en'

      const handler = vi.fn()
      window.addEventListener('languageChanged', handler)

      // Don't change language, advance timer
      vi.advanceTimersByTime(1100)

      expect(handler).not.toHaveBeenCalled()
      window.removeEventListener('languageChanged', handler)
    })

    it('interval handler with global as function', () => {
      window.__VUE_I18N__ = {
        global: () => ({ locale: { value: 'de' }, t: (k) => k })
      }
      setupLanguageChangeListener()
      getTranslatedSearchContent.lastLanguage = 'en'

      const handler = vi.fn()
      window.addEventListener('languageChanged', handler)

      vi.advanceTimersByTime(1100)

      expect(handler).toHaveBeenCalled()
      window.removeEventListener('languageChanged', handler)
    })

    it('interval handler with locale as string (no .value)', () => {
      window.__VUE_I18N__ = {
        global: { locale: 'ja' }
      }
      setupLanguageChangeListener()
      getTranslatedSearchContent.lastLanguage = 'en'

      vi.advanceTimersByTime(1100)
      expect(getTranslatedSearchContent.lastLanguage).toBe('ja')
    })
  })

  // ── getTranslatedSearchContent edge cases ──────────────────────────

  describe('getTranslatedSearchContent edge cases', () => {
    it('handles description without -- separator (fallback path)', () => {
      const content = getTranslatedSearchContent()
      const bare = content.find((c) => c.key === 'bareDescription')
      expect(bare).toBeDefined()
      // Description "NoDashItem" has no --, so split('--')[1] is undefined
      // Falls back to the full description
      expect(bare.preferenceEn).toBe('NoDashItem')
    })
  })
})
