/**
 * Tests for src/renderer/src/util/theme.js
 *
 * Covers: addThemeStyle, setWrapCodeBlocks, setEditorWidth,
 *         addCommonStyle, addCustomStyle, addStyles
 */

// Mock the config module
vi.mock('@/config', () => ({
  THEME_STYLE_ID: 'ag-theme',
  COMMON_STYLE_ID: 'ag-common-style',
  DEFAULT_CODE_FONT_FAMILY: '"DejaVu Sans Mono", monospace',
  oneDarkThemes: Object.freeze(['one-dark']),
  railscastsThemes: Object.freeze(['dark', 'material-dark', 'dracula', 'nord'])
}))

// Mock themeColor — each factory returns CSS with a variable for testing
vi.mock('@/util/themeColor', () => {
  const factory = (name) => () => `:root { --theme: ${name}; }`
  return {
    dark: factory('dark'),
    graphite: factory('graphite'),
    materialDark: factory('materialDark'),
    oneDark: factory('oneDark'),
    ulysses: factory('ulysses'),
    dracula: factory('dracula'),
    nord: factory('nord'),
    catppuccinMocha: factory('catppuccinMocha'),
    gruvboxDark: factory('gruvboxDark'),
    tokyoNight: factory('tokyoNight'),
    tokyoNightStorm: factory('tokyoNightStorm'),
    solarizedDark: factory('solarizedDark'),
    ayuDark: factory('ayuDark'),
    ayuMirage: factory('ayuMirage'),
    everforestDark: factory('everforestDark'),
    rosePine: factory('rosePine'),
    rosePineMoon: factory('rosePineMoon'),
    monokaiPro: factory('monokaiPro'),
    synthwave84: factory('synthwave84'),
    horizonDark: factory('horizonDark'),
    palenight: factory('palenight'),
    oxocarbonDark: factory('oxocarbonDark'),
    kanagawa: factory('kanagawa'),
    nightfox: factory('nightfox'),
    cyberdream: factory('cyberdream'),
    catppuccinLatte: factory('catppuccinLatte'),
    gruvboxLight: factory('gruvboxLight'),
    tokyoNightLight: factory('tokyoNightLight'),
    solarizedLight: factory('solarizedLight'),
    ayuLight: factory('ayuLight'),
    everforestLight: factory('everforestLight'),
    rosePineDawn: factory('rosePineDawn')
  }
})

// Mock util/index for isLinux
vi.mock('@/util/index', () => ({
  isLinux: false,
  isOsx: true,
  isWindows: false
}))

import {
  addThemeStyle,
  setWrapCodeBlocks,
  setEditorWidth,
  addCommonStyle,
  addCustomStyle,
  addStyles
} from '@/util/theme'

describe('util/theme', () => {
  beforeEach(() => {
    // Clean up all style elements from head and body children
    document.head.innerHTML = ''
    document.body.innerHTML = ''
    document.body.className = ''
    document.documentElement.style.cssText = ''
    delete document.documentElement.__themeVars
  })

  describe('addThemeStyle', () => {
    it('should do nothing for falsy theme', () => {
      addThemeStyle(null)
      addThemeStyle(undefined)
      addThemeStyle('')
      addThemeStyle(0)
      expect(document.querySelector('#ag-theme')).toBeNull()
    })

    it('should do nothing for non-string theme', () => {
      addThemeStyle(123)
      addThemeStyle({})
      expect(document.querySelector('#ag-theme')).toBeNull()
    })

    it('should create a style element and inject CSS for a known theme', () => {
      addThemeStyle('dark')
      const el = document.querySelector('#ag-theme')
      expect(el).not.toBeNull()
      expect(el.textContent).toContain('--theme: dark')
    })

    it('should set empty CSS for an unknown theme', () => {
      addThemeStyle('nonexistent-theme')
      const el = document.querySelector('#ag-theme')
      expect(el).not.toBeNull()
      expect(el.textContent).toBe('')
    })

    it('should reuse existing style element', () => {
      addThemeStyle('dark')
      addThemeStyle('nord')
      const els = document.querySelectorAll('#ag-theme')
      expect(els.length).toBe(1)
      expect(els[0].textContent).toContain('--theme: nord')
    })

    it('should add dark class for railscasts themes', () => {
      addThemeStyle('dark')
      expect(document.body.classList.contains('dark')).toBe(true)
    })

    it('should add dark class for oneDark themes', () => {
      addThemeStyle('one-dark')
      expect(document.body.classList.contains('dark')).toBe(true)
    })

    it('should remove dark class for light themes', () => {
      document.body.classList.add('dark')
      addThemeStyle('graphite')
      expect(document.body.classList.contains('dark')).toBe(false)
    })

    it('should set colorScheme to dark for dark themes', () => {
      addThemeStyle('dracula')
      expect(document.documentElement.style.colorScheme).toBe('dark')
    })

    it('should set colorScheme to light for light themes', () => {
      addThemeStyle('ulysses')
      expect(document.documentElement.style.colorScheme).toBe('light')
    })

    it('should set titleBarBorderColor for dark themes', () => {
      addThemeStyle('dark')
      expect(document.documentElement.style.getPropertyValue('--titleBarBorderColor')).toBe(
        'rgba(255, 255, 255, 0.06)'
      )
    })

    it('should set titleBarBorderColor for light themes', () => {
      addThemeStyle('graphite')
      expect(document.documentElement.style.getPropertyValue('--titleBarBorderColor')).toBe(
        'rgba(0, 0, 0, 0.08)'
      )
    })

    it('should mirror CSS variables to document root style', () => {
      addThemeStyle('dark')
      expect(document.documentElement.style.getPropertyValue('--theme')).toBe('dark')
    })

    it('should clear old variables when switching themes', () => {
      addThemeStyle('dark')
      expect(document.documentElement.style.getPropertyValue('--theme')).toBe('dark')
      addThemeStyle('nord')
      // Old theme var should be overwritten (same name) or removed
      expect(document.documentElement.style.getPropertyValue('--theme')).toBe('nord')
    })

    it('should cache theme to localStorage', () => {
      addThemeStyle('dark')
      expect(localStorage.getItem('mark-cached-theme')).toBe('dark')
    })

    it('should handle localStorage errors gracefully', () => {
      const orig = localStorage.setItem
      localStorage.setItem = () => {
        throw new Error('quota exceeded')
      }
      expect(() => addThemeStyle('dark')).not.toThrow()
      localStorage.setItem = orig
    })

    it('should handle CodeMirror element for oneDark themes', () => {
      const cm = document.createElement('div')
      cm.classList.add('CodeMirror', 'cm-s-default')
      document.body.appendChild(cm)

      addThemeStyle('one-dark')
      expect(cm.classList.contains('cm-s-one-dark')).toBe(true)
      expect(cm.classList.contains('cm-s-default')).toBe(false)
      expect(cm.classList.contains('cm-s-railscasts')).toBe(false)
    })

    it('should handle CodeMirror element for railscasts themes', () => {
      const cm = document.createElement('div')
      cm.classList.add('CodeMirror')
      document.body.appendChild(cm)

      addThemeStyle('material-dark')
      expect(cm.classList.contains('cm-s-railscasts')).toBe(true)
      expect(cm.classList.contains('cm-s-one-dark')).toBe(false)
    })

    it('should handle CodeMirror element for default themes (not dark)', () => {
      const cm = document.createElement('div')
      cm.classList.add('CodeMirror')
      document.body.appendChild(cm)

      addThemeStyle('ulysses')
      expect(cm.classList.contains('cm-s-default')).toBe(true)
    })

    it('should handle missing CodeMirror element', () => {
      // No CodeMirror in DOM — should not throw
      expect(() => addThemeStyle('dark')).not.toThrow()
    })
  })

  describe('setWrapCodeBlocks', () => {
    it('should set pre-wrap CSS when value is true', () => {
      setWrapCodeBlocks(true)
      const el = document.querySelector('#ag-code-wrap')
      expect(el).not.toBeNull()
      expect(el.textContent).toContain('white-space: pre-wrap')
    })

    it('should set pre CSS when value is false', () => {
      setWrapCodeBlocks(false)
      const el = document.querySelector('#ag-code-wrap')
      expect(el).not.toBeNull()
      expect(el.textContent).toContain('white-space: pre')
      expect(el.textContent).toContain('overflow: auto')
    })
  })

  describe('setEditorWidth', () => {
    it('should set editor width with ch unit', () => {
      setEditorWidth('80ch')
      const el = document.querySelector('#editor-width')
      expect(el.textContent).toContain('--editorAreaWidth: calc(100px + 80ch)')
    })

    it('should set editor width with px unit', () => {
      setEditorWidth('600px')
      const el = document.querySelector('#editor-width')
      expect(el.textContent).toContain('--editorAreaWidth: calc(100px + 600px)')
    })

    it('should set editor width with % unit', () => {
      setEditorWidth('80%')
      const el = document.querySelector('#editor-width')
      expect(el.textContent).toContain('--editorAreaWidth: calc(100px + 80%)')
    })

    it('should set empty content for invalid value', () => {
      setEditorWidth('invalid')
      const el = document.querySelector('#editor-width')
      expect(el.textContent).toBe('')
    })

    it('should set empty content for falsy value', () => {
      setEditorWidth('')
      const el = document.querySelector('#editor-width')
      expect(el.textContent).toBe('')
    })

    it('should set empty content for null', () => {
      setEditorWidth(null)
      const el = document.querySelector('#editor-width')
      expect(el.textContent).toBe('')
    })
  })

  describe('addCommonStyle', () => {
    it('should add code font family and size', () => {
      addCommonStyle({ codeFontFamily: 'Fira Code', codeFontSize: 16, hideScrollbar: false })
      const el = document.querySelector('#ag-common-style')
      expect(el).not.toBeNull()
      expect(el.textContent).toContain('Fira Code')
      expect(el.textContent).toContain('16px')
    })

    it('should add scrollbar hide CSS when hideScrollbar is true', () => {
      addCommonStyle({ codeFontFamily: 'mono', codeFontSize: 14, hideScrollbar: true })
      const el = document.querySelector('#ag-common-style')
      expect(el.textContent).toContain('::-webkit-scrollbar {display: none;}')
    })

    it('should not add scrollbar CSS when hideScrollbar is false', () => {
      addCommonStyle({ codeFontFamily: 'mono', codeFontSize: 14, hideScrollbar: false })
      const el = document.querySelector('#ag-common-style')
      expect(el.textContent).not.toContain('::-webkit-scrollbar')
    })
  })

  describe('addCustomStyle', () => {
    it('should inject custom CSS', () => {
      addCustomStyle({ customCss: 'body { color: red; }' })
      const el = document.querySelector('#custom-styles')
      expect(el.textContent).toBe('body { color: red; }')
    })

    it('should do nothing for falsy customCss', () => {
      addCustomStyle({ customCss: '' })
      expect(document.querySelector('#custom-styles')).toBeNull()
    })

    it('should do nothing for undefined customCss', () => {
      addCustomStyle({})
      expect(document.querySelector('#custom-styles')).toBeNull()
    })
  })

  describe('addStyles', () => {
    it('should call addThemeStyle and addCommonStyle', () => {
      addStyles({
        theme: 'dark',
        codeFontFamily: 'mono',
        codeFontSize: 14,
        hideScrollbar: false
      })
      expect(document.querySelector('#ag-theme')).not.toBeNull()
      expect(document.querySelector('#ag-common-style')).not.toBeNull()
    })
  })
})
