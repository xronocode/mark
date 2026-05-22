import { shallowMount } from '@vue/test-utils'
import { setupTestPinia } from '../pinia'
import { createI18n } from 'vue-i18n'
import { nextTick } from 'vue'

vi.mock('@/bus', () => ({
  default: { on: vi.fn(), off: vi.fn(), emit: vi.fn() }
}))

vi.mock('./exportOptions', () => ({
  getPageSizeList: () => [{ label: 'A4', value: 'A4' }, { label: 'Custom', value: 'custom' }],
  getHeaderFooterTypes: () => [
    { label: 'None', value: 0 },
    { label: 'Single', value: 1 },
    { label: 'Three', value: 2 }
  ],
  getExportThemeList: () => [{ label: 'Default', value: 'default' }, { label: 'Academic', value: 'academic' }]
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
  ElDialog: { template: '<div><slot /></div>' },
  ElTabs: { template: '<div><slot /></div>' },
  ElTabPane: { template: '<div><slot /></div>' },
  ElInputNumber: true,
  Bool: true,
  CurSelect: true,
  FontTextBox: true,
  Range: true,
  TextBox: true
})

describe('exportSettings/index.vue — deep coverage', () => {
  let pinia, bus, ExportSettings

  beforeEach(async () => {
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

    ExportSettings = (await import('@/components/exportSettings/index.vue')).default
  })

  const mountComponent = () =>
    shallowMount(ExportSettings, {
      global: {
        plugins: [pinia, i18n],
        stubs: makeStubs()
      }
    })

  // --- showDialog ---
  describe('showDialog', () => {
    it('opens dialog for pdf type', () => {
      const wrapper = mountComponent()
      const showHandler = bus.on.mock.calls.find((c) => c[0] === 'showExportDialog')[1]

      showHandler('pdf')

      expect(wrapper.vm.showExportSettingsDialog).toBe(true)
      expect(wrapper.vm.exportType).toBe('pdf')
      expect(wrapper.vm.isPrintable).toBe(true)
      expect(bus.emit).toHaveBeenCalledWith('editor-blur')
    })

    it('opens dialog for styledHtml and resets activeName if needed', () => {
      const wrapper = mountComponent()
      wrapper.vm.activeName = 'header'

      const showHandler = bus.on.mock.calls.find((c) => c[0] === 'showExportDialog')[1]
      showHandler('styledHtml')

      expect(wrapper.vm.isPrintable).toBe(false)
      expect(wrapper.vm.activeName).toBe('info')
    })

    it('resets activeName from page to info for styledHtml', () => {
      const wrapper = mountComponent()
      wrapper.vm.activeName = 'page'

      const showHandler = bus.on.mock.calls.find((c) => c[0] === 'showExportDialog')[1]
      showHandler('styledHtml')

      expect(wrapper.vm.activeName).toBe('info')
    })

    it('does not reset activeName for styledHtml when on other tab', () => {
      const wrapper = mountComponent()
      wrapper.vm.activeName = 'style'

      const showHandler = bus.on.mock.calls.find((c) => c[0] === 'showExportDialog')[1]
      showHandler('styledHtml')

      expect(wrapper.vm.activeName).toBe('style')
    })

    it('loads themes from disk on first show', () => {
      const wrapper = mountComponent()
      const showHandler = bus.on.mock.calls.find((c) => c[0] === 'showExportDialog')[1]

      showHandler('pdf')
      expect(wrapper.vm.themesLoaded).toBe(true)
    })

    it('does not reload themes on subsequent shows', () => {
      const wrapper = mountComponent()
      const showHandler = bus.on.mock.calls.find((c) => c[0] === 'showExportDialog')[1]

      showHandler('pdf')
      window.fileUtils.isDirectory.mockClear()
      showHandler('pdf')

      // isDirectory should only be called once (from the first show)
      expect(window.fileUtils.isDirectory).not.toHaveBeenCalled()
    })
  })

  // --- handleClicked ---
  describe('handleClicked', () => {
    it('emits export with basic PDF options', () => {
      const wrapper = mountComponent()
      const showHandler = bus.on.mock.calls.find((c) => c[0] === 'showExportDialog')[1]
      showHandler('pdf')

      bus.emit.mockClear()
      wrapper.vm.handleClicked()

      expect(wrapper.vm.showExportSettingsDialog).toBe(false)
      expect(bus.emit).toHaveBeenCalledWith('export', expect.objectContaining({
        type: 'pdf',
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
      const showHandler = bus.on.mock.calls.find((c) => c[0] === 'showExportDialog')[1]
      showHandler('styledHtml')
      wrapper.vm.htmlTitle = 'My Page'

      bus.emit.mockClear()
      wrapper.vm.handleClicked()

      const exportArgs = bus.emit.mock.calls.find((c) => c[0] === 'export')[1]
      expect(exportArgs.htmlTitle).toBe('My Page')
    })

    it('includes font settings when overwrite is on', () => {
      const wrapper = mountComponent()
      const showHandler = bus.on.mock.calls.find((c) => c[0] === 'showExportDialog')[1]
      showHandler('pdf')
      wrapper.vm.fontSettingsOverwrite = true
      wrapper.vm.fontSize = 16
      wrapper.vm.lineHeight = 1.8
      wrapper.vm.fontFamily = 'Arial'

      bus.emit.mockClear()
      wrapper.vm.handleClicked()

      const exportArgs = bus.emit.mock.calls.find((c) => c[0] === 'export')[1]
      expect(exportArgs.fontSize).toBe(16)
      expect(exportArgs.lineHeight).toBe(1.8)
      expect(exportArgs.fontFamily).toBe('Arial')
    })

    it('sets fontFamily to null when Default', () => {
      const wrapper = mountComponent()
      const showHandler = bus.on.mock.calls.find((c) => c[0] === 'showExportDialog')[1]
      showHandler('pdf')
      wrapper.vm.fontSettingsOverwrite = true
      wrapper.vm.fontFamily = 'Default'

      bus.emit.mockClear()
      wrapper.vm.handleClicked()

      const exportArgs = bus.emit.mock.calls.find((c) => c[0] === 'export')[1]
      expect(exportArgs.fontFamily).toBeNull()
    })

    it('includes header settings when headerType is not 0', () => {
      const wrapper = mountComponent()
      const showHandler = bus.on.mock.calls.find((c) => c[0] === 'showExportDialog')[1]
      showHandler('pdf')
      wrapper.vm.headerType = 1
      wrapper.vm.headerTextCenter = 'My Header'

      bus.emit.mockClear()
      wrapper.vm.handleClicked()

      const exportArgs = bus.emit.mock.calls.find((c) => c[0] === 'export')[1]
      expect(exportArgs.header).toEqual({
        type: 1,
        left: '',
        center: 'My Header',
        right: ''
      })
    })

    it('includes footer settings when footerType is not 0', () => {
      const wrapper = mountComponent()
      const showHandler = bus.on.mock.calls.find((c) => c[0] === 'showExportDialog')[1]
      showHandler('pdf')
      wrapper.vm.footerType = 2
      wrapper.vm.footerTextLeft = 'Left'
      wrapper.vm.footerTextCenter = 'Center'
      wrapper.vm.footerTextRight = 'Right'

      bus.emit.mockClear()
      wrapper.vm.handleClicked()

      const exportArgs = bus.emit.mock.calls.find((c) => c[0] === 'export')[1]
      expect(exportArgs.footer).toEqual({
        type: 2,
        left: 'Left',
        center: 'Center',
        right: 'Right'
      })
    })

    it('includes headerFooter customize settings', () => {
      const wrapper = mountComponent()
      const showHandler = bus.on.mock.calls.find((c) => c[0] === 'showExportDialog')[1]
      showHandler('pdf')
      wrapper.vm.headerFooterCustomize = true
      wrapper.vm.headerFooterStyled = false
      wrapper.vm.headerFooterFontSize = 10

      bus.emit.mockClear()
      wrapper.vm.handleClicked()

      const exportArgs = bus.emit.mock.calls.find((c) => c[0] === 'export')[1]
      expect(exportArgs.headerFooterStyled).toBe(false)
      expect(exportArgs.headerFooterFontSize).toBe(10)
    })

    it('uses non-default theme value', () => {
      const wrapper = mountComponent()
      const showHandler = bus.on.mock.calls.find((c) => c[0] === 'showExportDialog')[1]
      showHandler('pdf')
      wrapper.vm.theme = 'academic'

      bus.emit.mockClear()
      wrapper.vm.handleClicked()

      const exportArgs = bus.emit.mock.calls.find((c) => c[0] === 'export')[1]
      expect(exportArgs.theme).toBe('academic')
    })
  })

  // --- onSelectChange ---
  describe('onSelectChange', () => {
    it('updates known keys', () => {
      const wrapper = mountComponent()

      wrapper.vm.onSelectChange('pageSize', 'Letter')
      expect(wrapper.vm.pageSize).toBe('Letter')

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

      wrapper.vm.onSelectChange('headerType', 2)
      expect(wrapper.vm.headerType).toBe(2)

      wrapper.vm.onSelectChange('footerType', 1)
      expect(wrapper.vm.footerType).toBe(1)

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
      const showHandler = bus.on.mock.calls.find((c) => c[0] === 'showExportDialog')[1]
      showHandler('pdf')

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
      const showHandler = bus.on.mock.calls.find((c) => c[0] === 'showExportDialog')[1]
      showHandler('pdf')

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
      const showHandler = bus.on.mock.calls.find((c) => c[0] === 'showExportDialog')[1]
      showHandler('pdf')

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
      const showHandler = bus.on.mock.calls.find((c) => c[0] === 'showExportDialog')[1]
      showHandler('pdf')

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
      const showHandler = bus.on.mock.calls.find((c) => c[0] === 'showExportDialog')[1]
      showHandler('pdf')

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

      expect(bus.off).toHaveBeenCalledWith('showExportDialog', expect.any(Function))
      expect(bus.off).toHaveBeenCalledWith('language-changed', expect.any(Function))
    })
  })
})
