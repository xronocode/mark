// FILE: tests/renderer/prefComponents/export-section-fn.test.js
// VERSION: 3.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Preserve the shipped export form's hydration, presets, optional blocks, slot derivation and factory Reset in Preferences.
//   SCOPE: Original meaningful form assertions, adapted from modal submission to immediate settings persistence; no export dispatch.
//   DEPENDS: Vue Test Utils, controlled appearance accessor/write result, actual page-default helper and existing controls/options.
//   LINKS: M-072; V-M-072; C-EXPORT-SETTINGS-SECTION.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
// START_MODULE_MAP
//   rememberedFixture - Legacy appearance inputs and write observation.
//   i18n - Existing form labels.
//   stubs - Control/section boundaries.
// END_MODULE_MAP
// START_CHANGE_SUMMARY
//   LAST_CHANGE: 2026-11-12 C-EXPORT-SETTINGS-SECTION: retain form assertions while replacing obsolete modal behavior.
// END_CHANGE_SUMMARY
import { shallowMount } from '@vue/test-utils'
import { setupTestPinia } from '../pinia'
import { createI18n } from 'vue-i18n'

const { rememberedFixture } = vi.hoisted(() => {
  // Mirrors the real accessor's defaults merge (store/editor.js
  // DEFAULT_PRINT_OPTIONS) so per-test fixtures only override what they
  // pin.
  const DEFAULTS = {
    theme: null,
    pageMarginTop: 20,
    pageMarginRight: 15,
    pageMarginBottom: 20,
    pageMarginLeft: 15,
    autoNumberingHeadings: false,
    showFrontMatter: false,
    tocTitle: '',
    tocIncludeTopHeading: true
  }
  return { rememberedFixture: { value: {}, DEFAULTS, remember: vi.fn(() => true) } }
})

vi.mock('@/bus', () => ({
  default: { on: vi.fn(), off: vi.fn(), emit: vi.fn() }
}))

vi.mock('@/prefComponents/common/compound', () => ({ default: { name: 'Compound', template: '<section><slot name="head"/><slot name="children"/></section>' } }))

vi.mock('@/store/editor', () => ({
  useEditorStore: () => ({ REMEMBER_EXPORT_OPTIONS: rememberedFixture.remember }),
  getRememberedExportAppearance: vi.fn(() => ({
    ...rememberedFixture.DEFAULTS,
    ...rememberedFixture.value
  }))
}))

vi.mock('@/i18n', () => ({
  t: vi.fn(key => key)
}))

const i18n = createI18n({
  legacy: false,
  locale: 'en',
  messages: {
    en: {
      exportSettings: {
        title: 'Export', export: 'Export', reset: 'Reset',
        autoNumberingHeadings: 'Auto', showFrontMatter: 'FM',
        info: { description: 'Info' },
        content: { label: 'Content' },
        page: {
          label: 'Page', pageTitle: 'PT', pageSize: 'PS',
          widthHeight: 'WH', landscapeOrientation: 'LO',
          pageMarginPreset: 'MP', topBottom: 'TB', leftRight: 'LR'
        },
        style: {
          label: 'Style', overwriteThemeFont: 'OT',
          fontFamily: 'FF', fontSize: 'FS', lineHeight: 'LH'
        },
        theme: { theme: 'T' },
        headerFooter: {
          label: 'HF', headerText: 'HT', footerText: 'FT',
          leftSlot: 'L', centerSlot: 'C', rightSlot: 'R',
          customizeStyle: 'CS', allowStyled: 'AS', fontSize: 'FS'
        },
        toc: { includeTopHeading: 'ITH', includeTopHeadingDetail: 'D', title: 'T' }
      }
    }
  }
})

const stubs = {
  Compound: { template: '<section><slot name="head"/><slot name="children"/></section>' },
  ElInputNumber: true,
  Bool: true,
  CurSelect: true,
  FontTextBox: true,
  Range: true,
  TextBox: true,
  HeaderFooterStrip: true
}

describe('Export preferences — preserved form behavior', () => {
  let pinia, bus, ExportSettings
  const wrappers = []
  afterEach(() => {
    for (const w of wrappers.splice(0)) if (!w.vm.$.isUnmounted) w.unmount()
  })

  beforeEach(async () => {
    localStorage.clear()
    rememberedFixture.value = {}
    rememberedFixture.remember.mockReset().mockReturnValue(true)
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
    ExportSettings = (await import('@/prefComponents/tabs/export/index.vue')).default
  })

  const mount = () => {
    const w = shallowMount(ExportSettings, { global: { plugins: [pinia, i18n], stubs } })
    wrappers.push(w)
    return w
  }

  describe('single-page anatomy (R-1/R-2, corner-4)', () => {
    it('renders no tab chrome and the four sections in order for all future exports', async () => {
      const w = mount()
      await w.vm.$nextTick()
      const html = w.html()
      expect(html).not.toMatch(/el-tabs|el-tab/)
      const pageAt = html.indexOf('>Page<')
      const styleAt = html.indexOf('>Style<')
      const contentAt = html.indexOf('>Content<')
      const hfAt = html.indexOf('>HF<')
      expect(pageAt).toBeGreaterThanOrEqual(0)
      expect(styleAt).toBeGreaterThan(pageAt)
      expect(contentAt).toBeGreaterThan(styleAt)
      expect(hfAt).toBeGreaterThan(contentAt)
    })

    it('shows HTML title together with page geometry and running-head controls', async () => {
      const w = mount()
      await w.vm.$nextTick()
      const html = w.html()
      expect(html).toContain('>Page<')
      expect(html).toContain('>Style<')
      expect(html).toContain('>Content<')
      expect(html).toContain('>HF<')
      expect(html).toContain('PT')
      expect(html).toContain('PS')
    })
  })

  describe('hydration from remembered options (R-5, corner-1/8)', () => {
    it('fills appearance fields, infers toggles and maps theme null to default', () => {
      rememberedFixture.value = {
        theme: 'academic',
        pageMarginTop: 8,
        pageMarginRight: 15,
        pageMarginBottom: 20,
        pageMarginLeft: 15,
        tocTitle: 'TOC',
        tocIncludeTopHeading: false,
        autoNumberingHeadings: true,
        showFrontMatter: true,
        fontSize: 12,
        lineHeight: 1.4,
        fontFamily: 'Georgia',
        header: { type: 2, left: 'HL', center: 'HC', right: 'HR' },
        headerFooterStyled: false,
        headerFooterFontSize: 10
      }
      const w = mount()
      expect(w.vm.theme).toBe('academic')
      expect(w.vm.pageMarginTop).toBe(8)
      expect(w.vm.tocTitle).toBe('TOC')
      expect(w.vm.tocIncludeTopHeading).toBe(false)
      expect(w.vm.autoNumberingHeadings).toBe(true)
      expect(w.vm.showFrontMatter).toBe(true)
      expect(w.vm.fontSettingsOverwrite).toBe(true)
      expect(w.vm.fontSize).toBe(12)
      expect(w.vm.fontFamily).toBe('Georgia')
      expect(w.vm.headerTextLeft).toBe('HL')
      expect(w.vm.headerTextCenter).toBe('HC')
      expect(w.vm.headerTextRight).toBe('HR')
      expect(w.vm.footerTextCenter).toBe('')
      expect(w.vm.headerFooterCustomize).toBe(true)
      expect(w.vm.headerFooterStyled).toBe(false)
      expect(w.vm.headerFooterFontSize).toBe(10)
      // Missing page defaults use the factory values.
      expect(w.vm.pageSize).toBe('A4')
      expect(w.vm.isLandscape).toBe(false)
    })

    it('empty remembered state falls back to factory defaults everywhere', () => {
      rememberedFixture.value = {}
      const w = mount()
      expect(w.vm.theme).toBe('default')
      expect(w.vm.fontSettingsOverwrite).toBe(false)
      expect(w.vm.headerFooterCustomize).toBe(false)
      expect(w.vm.headerTextCenter).toBe('')
      expect(w.vm.tocIncludeTopHeading).toBe(true)
    })

    it('theme null maps to the default sentinel', () => {
      rememberedFixture.value = { theme: null }
      const w = mount()
      expect(w.vm.theme).toBe('default')
    })
  })

  describe('Reset (R-6, corner-6)', () => {
    it('restores and remembers the factory defaults without exporting', async () => {
      window.localStorage.setItem('mark-last-print-options', '{"sentinel":1}')
      rememberedFixture.value = { theme: 'academic', pageMarginTop: 8 }
      const w = mount()
      w.vm.tocTitle = 'changed'
      w.vm.headerTextCenter = 'H'
      w.vm.onSelectChange('pageMarginTop', 33)
      await w.vm.handleReset()
      expect(w.vm.tocTitle).toBe('')
      expect(w.vm.headerTextCenter).toBe('')
      expect(w.vm.pageMarginTop).toBe(20)
      expect(w.vm.theme).toBe('default')
      expect(w.vm.marginPreset).toBe('normal')
      expect(rememberedFixture.remember).toHaveBeenCalledWith(expect.objectContaining({ theme: null, pageMarginTop: 20 }))
      expect(bus.emit).not.toHaveBeenCalledWith('export', expect.anything())
    })
  })

  describe('margin presets (R-3, corner-3)', () => {
    it('factory values derive the normal preset', () => {
      const w = mount()
      expect(w.vm.marginPreset).toBe('normal')
    })

    it('non-matching values derive custom', () => {
      const w = mount()
      w.vm.onSelectChange('pageMarginTop', 11)
      w.vm.onSelectChange('pageMarginRight', 12)
      w.vm.onSelectChange('pageMarginBottom', 13)
      w.vm.onSelectChange('pageMarginLeft', 14)
      expect(w.vm.marginPreset).toBe('custom')
    })

    it('picking a preset applies its values; Custom restores the pre-detour values', () => {
      const w = mount()
      w.vm.onSelectChange('pageMarginTop', 11)
      w.vm.onSelectChange('pageMarginRight', 12)
      w.vm.onSelectChange('pageMarginBottom', 13)
      w.vm.onSelectChange('pageMarginLeft', 14)

      w.vm.onMarginPresetChange('wide')
      expect(w.vm.pageMarginTop).toBe(30)
      expect(w.vm.pageMarginRight).toBe(25)
      expect(w.vm.marginPreset).toBe('wide')

      w.vm.onMarginPresetChange('custom')
      expect(w.vm.marginPreset).toBe('custom')
      expect(w.vm.pageMarginTop).toBe(11)
      expect(w.vm.pageMarginRight).toBe(12)
      expect(w.vm.pageMarginBottom).toBe(13)
      expect(w.vm.pageMarginLeft).toBe(14)
    })

    it('a preset choice itself switches the derived preset', () => {
      const w = mount()
      w.vm.onMarginPresetChange('narrow')
      expect(w.vm.pageMarginTop).toBe(10)
      expect(w.vm.marginPreset).toBe('narrow')
    })
  })

  describe('slot strips → payload (R-4, corner-2)', () => {
    it('onStripChange patches only the addressed slot', () => {
      const w = mount()
      w.vm.onStripChange('header', { left: 'X' })
      expect(w.vm.headerTextLeft).toBe('X')
      expect(w.vm.headerTextCenter).toBe('')
      w.vm.onStripChange('footer', { center: 'Y' })
      expect(w.vm.footerTextCenter).toBe('Y')
    })

    it('centre-only text emits header type 1 (single cell)', () => {
      const w = mount()
      w.vm.onStripChange('header', { center: 'H' })
      bus.emit.mockClear()
      w.vm.persistCurrentOptions()
      const args = rememberedFixture.remember.mock.calls.at(-1)[0]
      expect(args.header).toEqual({ type: 1, left: '', center: 'H', right: '' })
      expect(args.footer).toBeUndefined()
    })

    it('any side slot emits type 2 with verbatim strings', () => {
      const w = mount()
      w.vm.onStripChange('header', { left: 'L', right: 'R' })
      w.vm.onStripChange('footer', { left: 'FL', center: 'FC', right: 'FR' })
      bus.emit.mockClear()
      w.vm.persistCurrentOptions()
      const args = rememberedFixture.remember.mock.calls.at(-1)[0]
      expect(args.header).toEqual({ type: 2, left: 'L', center: '', right: 'R' })
      expect(args.footer).toEqual({ type: 2, left: 'FL', center: 'FC', right: 'FR' })
    })

    it('a remembered three-cells shape with empty sides re-exports as single-cell (conscious normalization)', () => {
      rememberedFixture.value = { header: { type: 2, left: '', center: 'H', right: '' } }
      const w = mount()
      bus.emit.mockClear()
      w.vm.persistCurrentOptions()
      const args = rememberedFixture.remember.mock.calls.at(-1)[0]
      expect(args.header.type).toBe(1)
    })
  })

  describe('legacy behaviour kept intact', () => {
    it('onSelectChange sets all text fields', () => {
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

    it('persistCurrentOptions includes toc options', () => {
      const w = mount()
      w.vm.tocTitle = 'TOC'
      w.vm.tocIncludeTopHeading = false
      bus.emit.mockClear()
      w.vm.persistCurrentOptions()
      const args = rememberedFixture.remember.mock.calls.at(-1)[0]
      expect(args.tocTitle).toBe('TOC')
      expect(args.tocIncludeTopHeading).toBe(false)
    })

    it('persistCurrentOptions includes pageSizeWidth and pageSizeHeight', () => {
      const w = mount()
      w.vm.pageSizeWidth = 300
      w.vm.pageSizeHeight = 400
      bus.emit.mockClear()
      w.vm.persistCurrentOptions()
      const args = rememberedFixture.remember.mock.calls.at(-1)[0]
      expect(args.pageSizeWidth).toBe(300)
      expect(args.pageSizeHeight).toBe(400)
    })

    it('persistCurrentOptions sets pageMargin values correctly', () => {
      const w = mount()
      w.vm.pageMarginTop = 10
      w.vm.pageMarginRight = 12
      w.vm.pageMarginBottom = 14
      w.vm.pageMarginLeft = 16
      bus.emit.mockClear()
      w.vm.persistCurrentOptions()
      const args = rememberedFixture.remember.mock.calls.at(-1)[0]
      expect(args.pageMarginTop).toBe(10)
      expect(args.pageMarginRight).toBe(12)
      expect(args.pageMarginBottom).toBe(14)
      expect(args.pageMarginLeft).toBe(16)
    })

    it('persistCurrentOptions with all optional blocks combined', () => {
      const w = mount()
      w.vm.htmlTitle = 'Title'
      w.vm.fontSettingsOverwrite = true
      w.vm.fontFamily = 'Mono'
      w.vm.fontSize = 12
      w.vm.lineHeight = 1.2
      w.vm.onStripChange('header', { left: 'HL', center: 'HC', right: 'HR' })
      w.vm.onStripChange('footer', { center: 'FC' })
      w.vm.headerFooterCustomize = true
      w.vm.headerFooterStyled = true
      w.vm.headerFooterFontSize = 16
      bus.emit.mockClear()
      w.vm.persistCurrentOptions()
      const args = rememberedFixture.remember.mock.calls.at(-1)[0]
      expect(args.htmlTitle).toBe('Title')
      expect(args.fontFamily).toBe('Mono')
      expect(args.header.type).toBe(2)
      expect(args.footer.type).toBe(1)
      expect(args.headerFooterFontSize).toBe(16)
    })

    it('persistCurrentOptions omits disabled optional appearance while keeping the explicit empty HTML default', () => {
      const w = mount()
      w.vm.fontSettingsOverwrite = false
      w.vm.headerFooterCustomize = false
      bus.emit.mockClear()
      w.vm.persistCurrentOptions()
      const args = rememberedFixture.remember.mock.calls.at(-1)[0]
      expect(args.header).toBeUndefined()
      expect(args.footer).toBeUndefined()
      expect(args.htmlTitle).toBe('')
      expect(JSON.parse(localStorage.getItem('mark-export-page-options')).htmlTitle).toBe('')
      expect(args.headerFooterStyled).toBeUndefined()
    })

    it('mounting the section never dispatches print or any export', () => {
      const w = mount()
      expect(w.exists()).toBe(true)
      expect(bus.emit).not.toHaveBeenCalledWith('export', expect.anything())
    })

    it('loadThemesFromDisk skips non-css files', async () => {
      window.fileUtils.isDirectory = vi.fn(() => true)
      window.fileUtils.readdir = vi.fn(async () => ['readme.txt', 'notes.md'])
      window.fileUtils.isFile = vi.fn(() => true)

      const w = mount()
      const baseLen = w.vm.themeList.length
      await new Promise(r => setTimeout(r, 50))

      expect(w.vm.themeList.length).toBe(baseLen)
    })

    it('loadThemesFromDisk skips files where isFile returns false', async () => {
      window.fileUtils.isDirectory = vi.fn(() => true)
      window.fileUtils.readdir = vi.fn(async () => ['style.css'])
      window.fileUtils.isFile = vi.fn(() => false)

      const w = mount()
      const baseLen = w.vm.themeList.length
      await new Promise(r => setTimeout(r, 50))

      expect(w.vm.themeList.length).toBe(baseLen)
    })

    it('loadThemesFromDisk extracts label from CSS comment', async () => {
      window.fileUtils.isDirectory = vi.fn(() => true)
      window.fileUtils.readdir = vi.fn(async () => ['fancy.css'])
      window.fileUtils.isFile = vi.fn(() => true)
      window.fileUtils.readFile = vi.fn(async () => '/** Fancy Theme */\nbody {}')

      const w = mount()
      await new Promise(r => setTimeout(r, 50))

      const entry = w.vm.themeList.find(t => t.value === 'fancy.css')
      expect(entry).toBeTruthy()
      expect(entry.label.trim()).toBe('Fancy Theme')
    })

    it('onBeforeUnmount removes listeners', () => {
      const w = mount()
      w.unmount()
      expect(bus.on.mock.calls.some(call => call[0] === 'showExportDialog')).toBe(false)
      expect(bus.off).toHaveBeenCalledWith('language-changed', expect.any(Function))
    })

    it('updateTranslations refreshes the option lists', () => {
      const w = mount()
      const langHandler = bus.on.mock.calls.find(c => c[0] === 'language-changed')[1]
      langHandler()
      expect(w.vm.themeList).toBeTruthy()
      expect(w.vm.pageSizeList).toBeTruthy()
      expect(w.vm.marginPresetList).toBeTruthy()
    })
  })
})
