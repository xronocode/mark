// FILE: tests/renderer/prefComponents/export-section-deep.test.js
// VERSION: 2.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Preserve detailed export form controls, theme discovery and language cleanup after relocation into Preferences.
//   SCOPE: Inherited field/option assertions with actual appearance persistence; replace modal lifecycle with section lifecycle.
//   DEPENDS: Vue Test Utils, Pinia, actual editor store/page-default helper, controlled filesystem and bus.
//   LINKS: M-072; V-M-072; C-EXPORT-SETTINGS-SECTION.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
// START_MODULE_MAP
//   i18n - Existing form labels.
//   makeStubs - Existing control and section boundaries.
// END_MODULE_MAP
// START_CHANGE_SUMMARY
//   LAST_CHANGE: 2026-11-12 C-EXPORT-SETTINGS-SECTION: retain deep form assertions without obsolete dialog events.
// END_CHANGE_SUMMARY
import { shallowMount } from '@vue/test-utils'
import { setupTestPinia } from '../pinia'
import { createI18n } from 'vue-i18n'
import { nextTick } from 'vue'

vi.mock('@/prefComponents/common/compound', () => ({ default: { name: 'Compound', template: '<section><slot name="head"/><slot name="children"/></section>' } }))

vi.mock('@/bus', () => ({
  default: { on: vi.fn(), off: vi.fn(), emit: vi.fn() }
}))


const i18n = createI18n({
  legacy: false,
  locale: 'en',
  messages: {
    en: {
      exportSettings: {
        title: 'Export',
        export: 'Export',
        autoNumberingHeadings: 'Auto-numbering',
        showFrontMatter: 'Show Front Matter',
        info: { label: 'Info', description: 'Info' },
        page: {
          label: 'Page',
          pageTitle: 'Page Title',
          pageSize: 'Page Size',
          widthHeight: 'Width/Height',
          landscapeOrientation: 'Landscape',
          pageMargin: 'Page Margin',
          topBottom: 'Top/Bottom',
          leftRight: 'Left/Right'
        },
        style: {
          label: 'Style',
          overwriteThemeFont: 'Overwrite Theme Font',
          fontFamily: 'Font Family',
          fontSize: 'Font Size',
          lineHeight: 'Line Height'
        },
        theme: { label: 'Theme', description: 'Theme desc', theme: 'Theme' },
        headerFooter: {
          label: 'Header/Footer',
          description: 'H/F desc',
          headerType: 'Header Type',
          leftHeaderText: 'Left',
          mainHeaderText: 'Main',
          rightHeaderText: 'Right',
          footerType: 'Footer Type',
          leftFooterText: 'Left',
          mainFooterText: 'Main',
          rightFooterText: 'Right',
          customizeStyle: 'Customize',
          allowStyled: 'Styled',
          fontSize: 'Font Size'
        },
        toc: {
          label: 'TOC',
          includeTopHeading: 'Include Top',
          includeTopHeadingDetail: 'Detail',
          title: 'TOC Title'
        }
      }
    }
  }
})

const makeStubs = () => ({
  Compound: { template: '<section><slot name="head"/><slot name="children"/></section>' },
  ElInputNumber: true,
  Bool: true,
  CurSelect: true,
  FontTextBox: true,
  Range: true,
  TextBox: true
})

describe('Export preferences — inherited deep behavior', () => {
  let pinia, bus, ExportSettings, rememberOptions
  const wrappers = []
  afterEach(() => {
    for (const w of wrappers.splice(0)) if (!w.vm.$.isUnmounted) w.unmount()
  })

  beforeEach(async () => {
    localStorage.clear()
    pinia = setupTestPinia()
    bus = (await import('@/bus')).default

    window.marktext = {
      paths: { userDataPath: '/tmp/mt-test' },
      env: { type: 'editor', windowId: 1, debug: false, paths: { userDataPath: '/tmp/mt-test' } }
    }
    window.path = {
      join: vi.fn((...parts) => parts.join('/')),
      basename: vi.fn((p) => p.split('/').pop()),
      extname: vi.fn((p) => {
        const base = p.split('/').pop() || ''
        const idx = base.lastIndexOf('.')
        return idx <= 0 ? '' : base.slice(idx)
      })
    }
    window.fileUtils = {
      isDirectory: vi.fn(() => false),
      isFile: vi.fn(() => true),
      readdir: vi.fn(async () => []),
      readFile: vi.fn(async () => '')
    }

    const store = (await import('@/store/editor')).useEditorStore()
    rememberOptions = vi.spyOn(store, 'REMEMBER_EXPORT_OPTIONS')
    ExportSettings = (await import('@/prefComponents/tabs/export/index.vue')).default
  })

  const mountComponent = () => {
    const w = shallowMount(ExportSettings, { global: { plugins: [pinia, i18n], stubs: makeStubs() } })
    wrappers.push(w)
    return w
  }

  describe('section lifecycle', () => {
    it('is available immediately without an export dialog or editor blur', () => {
      const wrapper = mountComponent()
      expect(wrapper.exists()).toBe(true)
      expect(bus.on.mock.calls.some(call => call[0] === 'showExportDialog')).toBe(false)
      expect(bus.emit).not.toHaveBeenCalledWith('editor-blur')
    })
    it('discovers export themes when mounted', () => {
      mountComponent()
      expect(window.fileUtils.isDirectory).toHaveBeenCalledTimes(1)
    })
    it('does not reload themes when unrelated settings change', () => {
      const wrapper = mountComponent()
      window.fileUtils.isDirectory.mockClear()
      wrapper.vm.onSelectChange('tocTitle', 'TOC')
      wrapper.vm.onSelectChange('theme', 'academic')
      expect(window.fileUtils.isDirectory).not.toHaveBeenCalled()
    })
  })

  // --- persistCurrentOptions ---
  describe('persistCurrentOptions', () => {
    it('persists the original factory form options without exporting', () => {
      const wrapper = mountComponent()

      bus.emit.mockClear()
      wrapper.vm.persistCurrentOptions()

      expect(bus.emit).not.toHaveBeenCalledWith('export', expect.anything())
      expect(rememberOptions).toHaveBeenCalledWith(expect.objectContaining({
        pageSize: 'A4',
        isLandscape: false,
        pageMarginTop: 20,
        autoNumberingHeadings: false,
        showFrontMatter: false,
        theme: null
      }))
    })

    it('includes htmlTitle for styledHtml', () => {
      const wrapper = mountComponent()
      wrapper.vm.htmlTitle = 'My Page'

      bus.emit.mockClear()
      wrapper.vm.persistCurrentOptions()

      const exportArgs = rememberOptions.mock.calls.at(-1)[0]
      expect(exportArgs.htmlTitle).toBe('My Page')
    })

    it('includes font settings when overwrite is on', () => {
      const wrapper = mountComponent()
      wrapper.vm.fontSettingsOverwrite = true
      wrapper.vm.fontSize = 16
      wrapper.vm.lineHeight = 1.8
      wrapper.vm.fontFamily = 'Arial'

      bus.emit.mockClear()
      wrapper.vm.persistCurrentOptions()

      const exportArgs = rememberOptions.mock.calls.at(-1)[0]
      expect(exportArgs.fontSize).toBe(16)
      expect(exportArgs.lineHeight).toBe(1.8)
      expect(exportArgs.fontFamily).toBe('Arial')
    })

    it('sets fontFamily to null when Default', () => {
      const wrapper = mountComponent()
      wrapper.vm.fontSettingsOverwrite = true
      wrapper.vm.fontFamily = 'Default'

      bus.emit.mockClear()
      wrapper.vm.persistCurrentOptions()

      const exportArgs = rememberOptions.mock.calls.at(-1)[0]
      expect(exportArgs.fontFamily).toBeNull()
    })

    it('includes header settings when headerType is not 0', () => {
      const wrapper = mountComponent()
      wrapper.vm.headerTextCenter = 'My Header'

      bus.emit.mockClear()
      wrapper.vm.persistCurrentOptions()

      const exportArgs = rememberOptions.mock.calls.at(-1)[0]
      expect(exportArgs.header).toEqual({
        type: 1,
        left: '',
        center: 'My Header',
        right: ''
      })
    })

    it('includes footer settings when footerType is not 0', () => {
      const wrapper = mountComponent()
      wrapper.vm.footerTextLeft = 'Left'
      wrapper.vm.footerTextCenter = 'Center'
      wrapper.vm.footerTextRight = 'Right'

      bus.emit.mockClear()
      wrapper.vm.persistCurrentOptions()

      const exportArgs = rememberOptions.mock.calls.at(-1)[0]
      expect(exportArgs.footer).toEqual({
        type: 2,
        left: 'Left',
        center: 'Center',
        right: 'Right'
      })
    })

    it('includes headerFooter customize settings', () => {
      const wrapper = mountComponent()
      wrapper.vm.headerFooterCustomize = true
      wrapper.vm.headerFooterStyled = false
      wrapper.vm.headerFooterFontSize = 10

      bus.emit.mockClear()
      wrapper.vm.persistCurrentOptions()

      const exportArgs = rememberOptions.mock.calls.at(-1)[0]
      expect(exportArgs.headerFooterStyled).toBe(false)
      expect(exportArgs.headerFooterFontSize).toBe(10)
    })

    it('uses non-default theme value', () => {
      const wrapper = mountComponent()
      wrapper.vm.theme = 'academic'

      bus.emit.mockClear()
      wrapper.vm.persistCurrentOptions()

      const exportArgs = rememberOptions.mock.calls.at(-1)[0]
      expect(exportArgs.theme).toBe('academic')
    })
  })

  // --- onSelectChange ---
  describe('onSelectChange', () => {
    it('updates known keys', () => {
      const wrapper = mountComponent()

      wrapper.vm.onSelectChange('pageSize', 'Letter')
      expect(wrapper.vm.pageSize).toBe('Letter')

      wrapper.vm.onSelectChange('pageSizeWidth', 220)
      expect(wrapper.vm.pageSizeWidth).toBe(220)

      wrapper.vm.onSelectChange('pageSizeHeight', 300)
      expect(wrapper.vm.pageSizeHeight).toBe(300)

      wrapper.vm.onSelectChange('isLandscape', true)
      expect(wrapper.vm.isLandscape).toBe(true)

      wrapper.vm.onSelectChange('fontFamily', 'Times')
      expect(wrapper.vm.fontFamily).toBe('Times')

      wrapper.vm.onSelectChange('fontSize', 18)
      expect(wrapper.vm.fontSize).toBe(18)

      wrapper.vm.onSelectChange('lineHeight', 2.0)
      expect(wrapper.vm.lineHeight).toBe(2.0)

      wrapper.vm.onSelectChange('theme', 'academic')
      expect(wrapper.vm.theme).toBe('academic')

      wrapper.vm.onSelectChange('headerTextLeft', 'HL')
      expect(wrapper.vm.headerTextLeft).toBe('HL')

      wrapper.vm.onSelectChange('footerTextCenter', 'FC')
      expect(wrapper.vm.footerTextCenter).toBe('FC')

      wrapper.vm.onSelectChange('autoNumberingHeadings', true)
      expect(wrapper.vm.autoNumberingHeadings).toBe(true)

      wrapper.vm.onSelectChange('showFrontMatter', true)
      expect(wrapper.vm.showFrontMatter).toBe(true)

      wrapper.vm.onSelectChange('fontSettingsOverwrite', true)
      expect(wrapper.vm.fontSettingsOverwrite).toBe(true)

      wrapper.vm.onSelectChange('headerFooterCustomize', true)
      expect(wrapper.vm.headerFooterCustomize).toBe(true)

      wrapper.vm.onSelectChange('headerFooterStyled', false)
      expect(wrapper.vm.headerFooterStyled).toBe(false)

      wrapper.vm.onSelectChange('headerFooterFontSize', 14)
      expect(wrapper.vm.headerFooterFontSize).toBe(14)

      wrapper.vm.onSelectChange('tocIncludeTopHeading', false)
      expect(wrapper.vm.tocIncludeTopHeading).toBe(false)

      wrapper.vm.onSelectChange('tocTitle', 'Table of Contents')
      expect(wrapper.vm.tocTitle).toBe('Table of Contents')
    })

    it('ignores unknown keys', () => {
      const wrapper = mountComponent()
      // Should not throw
      wrapper.vm.onSelectChange('unknownKey', 'value')
    })
  })

  // --- updateTranslations ---
  describe('updateTranslations', () => {
    it('refreshes option lists on language-changed', () => {
      const wrapper = mountComponent()
      const langHandler = bus.on.mock.calls.find((c) => c[0] === 'language-changed')[1]

      langHandler()

      // Should not throw and lists should be refreshed
      expect(wrapper.vm.themeList).toBeTruthy()
      expect(wrapper.vm.pageSizeList).toBeTruthy()
    })
  })

  // --- loadThemesFromDisk ---
  describe('loadThemesFromDisk', () => {
    it('does nothing when theme dir does not exist', async () => {
      window.fileUtils.isDirectory = vi.fn(() => false)

      const wrapper = mountComponent()

      await nextTick()
      await new Promise((r) => setTimeout(r, 10))

      // readdir should not be called
      expect(window.fileUtils.readdir).not.toHaveBeenCalled()
    })

    it('loads CSS themes from disk', async () => {
      window.fileUtils.isDirectory = vi.fn(() => true)
      window.fileUtils.readdir = vi.fn(async () => ['custom-theme.css', 'readme.txt'])
      window.fileUtils.isFile = vi.fn(() => true)
      window.fileUtils.readFile = vi.fn(async () => '/* My Custom Theme */\nbody { color: red; }')

      const wrapper = mountComponent()

      // Wait for async operations
      await new Promise((r) => setTimeout(r, 50))

      // Should have added the custom theme
      const hasCustom = wrapper.vm.themeList.some((t) => t.value === 'custom-theme.css')
      expect(hasCustom).toBe(true)
    })

    it('uses filename as label when no comment header', async () => {
      window.fileUtils.isDirectory = vi.fn(() => true)
      window.fileUtils.readdir = vi.fn(async () => ['no-header.css'])
      window.fileUtils.isFile = vi.fn(() => true)
      window.fileUtils.readFile = vi.fn(async () => 'body { color: blue; }')

      const wrapper = mountComponent()

      await new Promise((r) => setTimeout(r, 50))

      const entry = wrapper.vm.themeList.find((t) => t.value === 'no-header.css')
      expect(entry).toBeTruthy()
      expect(entry.label).toBe('no-header.css')
    })

    it('handles readdir error', async () => {
      window.fileUtils.isDirectory = vi.fn(() => true)
      window.fileUtils.readdir = vi.fn(async () => { throw new Error('EACCES') })

      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      const wrapper = mountComponent()

      await new Promise((r) => setTimeout(r, 50))

      expect(errorSpy).toHaveBeenCalledWith('loadThemesFromDisk readdir failed:', expect.any(Error))
      errorSpy.mockRestore()
    })

    it('handles readFile error for individual file', async () => {
      window.fileUtils.isDirectory = vi.fn(() => true)
      window.fileUtils.readdir = vi.fn(async () => ['bad.css'])
      window.fileUtils.isFile = vi.fn(() => true)
      window.fileUtils.readFile = vi.fn(async () => { throw new Error('read fail') })

      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      const wrapper = mountComponent()

      await new Promise((r) => setTimeout(r, 50))

      expect(errorSpy).toHaveBeenCalledWith('loadThemesFromDisk failed:', expect.any(Error))
      errorSpy.mockRestore()
    })
  })

  // --- unmount ---
  describe('unmount', () => {
    it('unregisters bus listeners', () => {
      const wrapper = mountComponent()
      wrapper.unmount()

      expect(bus.on.mock.calls.some(call => call[0] === 'showExportDialog')).toBe(false)
      expect(bus.off).toHaveBeenCalledWith('language-changed', expect.any(Function))
    })
  })
})
