/**
 * Function coverage tests for exportSettings/index.vue
 * Covers ALL remaining uncovered functions: onSelectChange (text fields),
 * handleClicked (toc fields), updateTranslations, showDialog (print),
 * loadThemesFromDisk (non-css files, multiple CSS files), lifecycle hooks.
 */
import { shallowMount } from '@vue/test-utils'
import { setupTestPinia } from '../pinia'
import { createI18n } from 'vue-i18n'
import { nextTick } from 'vue'

vi.mock('@/bus', () => ({
  default: { on: vi.fn(), off: vi.fn(), emit: vi.fn() }
}))

vi.mock('./exportOptions', () => ({
  getPageSizeList: () => [{ label: 'A4', value: 'A4' }],
  getHeaderFooterTypes: () => [{ label: 'None', value: 0 }],
  getExportThemeList: () => [{ label: 'Default', value: 'default' }]
}))

const i18n = createI18n({
  legacy: false,
  locale: 'en',
  messages: {
    en: {
      exportSettings: {
        title: 'Export', export: 'Export',
        autoNumberingHeadings: 'Auto', showFrontMatter: 'FM',
        info: { label: 'Info', description: 'Info' },
        page: {
          label: 'Page', pageTitle: 'PT', pageSize: 'PS',
          widthHeight: 'WH', landscapeOrientation: 'LO',
          pageMargin: 'PM', topBottom: 'TB', leftRight: 'LR'
        },
        style: {
          label: 'Style', overwriteThemeFont: 'OT',
          fontFamily: 'FF', fontSize: 'FS', lineHeight: 'LH'
        },
        theme: { label: 'Theme', description: 'TD', theme: 'T' },
        headerFooter: {
          label: 'HF', description: 'HFD', headerType: 'HT',
          leftHeaderText: 'LH', mainHeaderText: 'MH', rightHeaderText: 'RH',
          footerType: 'FT', leftFooterText: 'LF', mainFooterText: 'MF',
          rightFooterText: 'RF', customizeStyle: 'CS', allowStyled: 'AS',
          fontSize: 'FS'
        },
        toc: { label: 'TOC', includeTopHeading: 'ITH', includeTopHeadingDetail: 'D', title: 'T' }
      }
    }
  }
})

const stubs = {
  ElDialog: { template: '<div><slot /></div>' },
  ElTabs: { template: '<div><slot /></div>' },
  ElTabPane: { template: '<div><slot /></div>' },
  ElInputNumber: true,
  Bool: true,
  CurSelect: true,
  FontTextBox: true,
  Range: true,
  TextBox: true
}

describe('exportSettings/index.vue — fn coverage', () => {
  let pinia, bus, ExportSettings

  beforeEach(async () => {
    pinia = setupTestPinia()
    bus = (await import('@/bus')).default
    window.marktext = {
      paths: { userDataPath: '/tmp/mt' },
      env: { type: 'editor', windowId: 1, debug: false, paths: { userDataPath: '/tmp/mt' } }
    }
    window.path = {
      join: vi.fn((...p) => p.join('/')),
      basename: vi.fn((p) => p.split('/').pop()),
      extname: vi.fn((p) => { const b = p.split('/').pop() || ''; const i = b.lastIndexOf('.'); return i <= 0 ? '' : b.slice(i) })
    }
    window.fileUtils = {
      isDirectory: vi.fn(() => false),
      isFile: vi.fn(() => true),
      readdir: vi.fn(async () => []),
      readFile: vi.fn(async () => '')
    }
    ExportSettings = (await import('@/components/exportSettings/index.vue')).default
  })

  const mount = () => shallowMount(ExportSettings, {
    global: { plugins: [pinia, i18n], stubs }
  })

  it('onSelectChange sets all text header/footer fields', () => {
    const w = mount()
    const textFields = [
      'htmlTitle', 'headerTextLeft', 'headerTextCenter', 'headerTextRight',
      'footerTextLeft', 'footerTextCenter', 'footerTextRight', 'tocTitle'
    ]
    for (const field of textFields) {
      w.vm.onSelectChange(field, `val-${field}`)
      expect(w.vm[field]).toBe(`val-${field}`)
    }
  })

  it('handleClicked includes toc options', () => {
    const w = mount()
    const show = bus.on.mock.calls.find(c => c[0] === 'showExportDialog')[1]
    show('pdf')
    w.vm.tocTitle = 'TOC'
    w.vm.tocIncludeTopHeading = false
    bus.emit.mockClear()
    w.vm.handleClicked()
    const args = bus.emit.mock.calls.find(c => c[0] === 'export')[1]
    expect(args.tocTitle).toBe('TOC')
    expect(args.tocIncludeTopHeading).toBe(false)
  })

  it('handleClicked includes pageSizeWidth and pageSizeHeight', () => {
    const w = mount()
    const show = bus.on.mock.calls.find(c => c[0] === 'showExportDialog')[1]
    show('pdf')
    w.vm.pageSizeWidth = 300
    w.vm.pageSizeHeight = 400
    bus.emit.mockClear()
    w.vm.handleClicked()
    const args = bus.emit.mock.calls.find(c => c[0] === 'export')[1]
    expect(args.pageSizeWidth).toBe(300)
    expect(args.pageSizeHeight).toBe(400)
  })

  it('showDialog for print type sets isPrintable true', () => {
    const w = mount()
    const show = bus.on.mock.calls.find(c => c[0] === 'showExportDialog')[1]
    show('print')
    expect(w.vm.isPrintable).toBe(true)
    expect(w.vm.exportType).toBe('print')
  })

  it('loadThemesFromDisk skips non-css files', async () => {
    window.fileUtils.isDirectory = vi.fn(() => true)
    window.fileUtils.readdir = vi.fn(async () => ['readme.txt', 'notes.md'])
    window.fileUtils.isFile = vi.fn(() => true)

    const w = mount()
    const baseLen = w.vm.themeList.length
    const show = bus.on.mock.calls.find(c => c[0] === 'showExportDialog')[1]
    show('pdf')
    await new Promise(r => setTimeout(r, 50))

    expect(w.vm.themeList.length).toBe(baseLen)
  })

  it('loadThemesFromDisk skips files where isFile returns false', async () => {
    window.fileUtils.isDirectory = vi.fn(() => true)
    window.fileUtils.readdir = vi.fn(async () => ['style.css'])
    window.fileUtils.isFile = vi.fn(() => false)

    const w = mount()
    const baseLen = w.vm.themeList.length
    const show = bus.on.mock.calls.find(c => c[0] === 'showExportDialog')[1]
    show('pdf')
    await new Promise(r => setTimeout(r, 50))

    expect(w.vm.themeList.length).toBe(baseLen)
  })

  it('loadThemesFromDisk extracts label from CSS comment', async () => {
    window.fileUtils.isDirectory = vi.fn(() => true)
    window.fileUtils.readdir = vi.fn(async () => ['fancy.css'])
    window.fileUtils.isFile = vi.fn(() => true)
    window.fileUtils.readFile = vi.fn(async () => '/** Fancy Theme */\nbody {}')

    const w = mount()
    const show = bus.on.mock.calls.find(c => c[0] === 'showExportDialog')[1]
    show('pdf')
    await new Promise(r => setTimeout(r, 50))

    const entry = w.vm.themeList.find(t => t.value === 'fancy.css')
    expect(entry).toBeTruthy()
    expect(entry.label.trim()).toBe('Fancy Theme')
  })

  it('onBeforeUnmount removes listeners', () => {
    const w = mount()
    w.unmount()
    expect(bus.off).toHaveBeenCalledWith('showExportDialog', expect.any(Function))
    expect(bus.off).toHaveBeenCalledWith('language-changed', expect.any(Function))
  })

  it('handleClicked with all optional blocks combined', () => {
    const w = mount()
    const show = bus.on.mock.calls.find(c => c[0] === 'showExportDialog')[1]
    show('styledHtml')
    w.vm.htmlTitle = 'Title'
    w.vm.fontSettingsOverwrite = true
    w.vm.fontFamily = 'Mono'
    w.vm.fontSize = 12
    w.vm.lineHeight = 1.2
    w.vm.headerType = 2
    w.vm.headerTextLeft = 'HL'
    w.vm.headerTextCenter = 'HC'
    w.vm.headerTextRight = 'HR'
    w.vm.footerType = 1
    w.vm.footerTextCenter = 'FC'
    w.vm.headerFooterCustomize = true
    w.vm.headerFooterStyled = true
    w.vm.headerFooterFontSize = 16
    bus.emit.mockClear()
    w.vm.handleClicked()
    const args = bus.emit.mock.calls.find(c => c[0] === 'export')[1]
    expect(args.htmlTitle).toBe('Title')
    expect(args.fontFamily).toBe('Mono')
    expect(args.header.type).toBe(2)
    expect(args.footer.type).toBe(1)
    expect(args.headerFooterFontSize).toBe(16)
  })

  it('updateTranslations refreshes all three lists', () => {
    const w = mount()
    const langHandler = bus.on.mock.calls.find(c => c[0] === 'language-changed')[1]
    langHandler()
    expect(w.vm.themeList).toBeTruthy()
    expect(w.vm.pageSizeList).toBeTruthy()
    expect(w.vm.headerFooterTypes).toBeTruthy()
  })

  it('showDialog keeps activeName on style tab for styledHtml', () => {
    const w = mount()
    w.vm.activeName = 'style'
    const show = bus.on.mock.calls.find(c => c[0] === 'showExportDialog')[1]
    show('styledHtml')
    expect(w.vm.activeName).toBe('style')
  })

  it('showDialog keeps activeName on toc tab for styledHtml', () => {
    const w = mount()
    w.vm.activeName = 'toc'
    const show = bus.on.mock.calls.find(c => c[0] === 'showExportDialog')[1]
    show('styledHtml')
    expect(w.vm.activeName).toBe('toc')
  })

  it('handleClicked omits header/footer/fontSettings/htmlTitle when conditions not met', () => {
    const w = mount()
    const show = bus.on.mock.calls.find(c => c[0] === 'showExportDialog')[1]
    show('pdf') // isPrintable = true, so no htmlTitle
    w.vm.headerType = 0
    w.vm.footerType = 0
    w.vm.fontSettingsOverwrite = false
    w.vm.headerFooterCustomize = false
    bus.emit.mockClear()
    w.vm.handleClicked()
    const args = bus.emit.mock.calls.find(c => c[0] === 'export')[1]
    expect(args.header).toBeUndefined()
    expect(args.footer).toBeUndefined()
    expect(args.htmlTitle).toBeUndefined()
    expect(args.headerFooterStyled).toBeUndefined()
  })

  it('handleClicked sets pageMargin values correctly', () => {
    const w = mount()
    const show = bus.on.mock.calls.find(c => c[0] === 'showExportDialog')[1]
    show('pdf')
    w.vm.pageMarginTop = 10
    w.vm.pageMarginRight = 12
    w.vm.pageMarginBottom = 14
    w.vm.pageMarginLeft = 16
    bus.emit.mockClear()
    w.vm.handleClicked()
    const args = bus.emit.mock.calls.find(c => c[0] === 'export')[1]
    expect(args.pageMarginTop).toBe(10)
    expect(args.pageMarginRight).toBe(12)
    expect(args.pageMarginBottom).toBe(14)
    expect(args.pageMarginLeft).toBe(16)
  })
})
