// FILE: tests/renderer/components/editor-print-clearup.test.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Pin the C-61 macOS print/pdf container lifecycle through editor.vue's handleExport with isOsx=true — the print container is cleared after mt_print_webview resolves (the backend resolves when the panel closes) and after every Export-to-PDF outcome (saved, cancelled, failed).
//   SCOPE: The bus 'export' handler for types print/pdf only; same harness as editor-coverage.test.js but with the macOS util flag.
//   DEPENDS: Vitest, editor.vue (mounted with mocked Muya/Printer/Tauri surfaces), global @tauri-apps mocks from tests/renderer/setup.ts.
//   LINKS: .grace/verification/runtime.xml V-M-052 scenario-2; .grace/changes/active/C-61 (R-1, corner-2).
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   MockMuya - Muya class double.
//   mockEditorInstance - the Muya instance double exposing exportStyledHTML.
//   mockPrinter - printService double (renderMarkdown / clearup counters).
//   mockSpellchecker - spellchecker double.
//   busMock - renderer bus double.
//   logMock - logger double.
//   noticeMock - notice double.
//   getCssForOptionsMock - export CSS helper double.
//   getHtmlTocMock - export TOC helper double.
//   animatedScrollToMock - @/util scroll double (the rest of @/util is real).
//   i18n - test i18n instance.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: 2026-10-18 v1.0.0 - C-61 T-002: initial file — macOS print
//   container clearing (panel closed → clearup) plus the pdf save-cancel
//   integration (real editorStore.EXPORT through the global plugin-dialog
//   mock, nothing written, no notice, container cleared).
// END_CHANGE_SUMMARY

import { shallowMount } from '@vue/test-utils'
import { setupTestPinia } from '../pinia'
import { createI18n } from 'vue-i18n'

/* ── hoisted mock state (trimmed editor-coverage harness, isOsx=true) ── */
const busMock = vi.hoisted(() => ({ on: vi.fn(), off: vi.fn(), emit: vi.fn() }))
const noticeMock = vi.hoisted(() => ({ notify: vi.fn(async () => undefined) }))
const logMock = vi.hoisted(() => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn() }))
const animatedScrollToMock = vi.hoisted(() => vi.fn())
const getCssForOptionsMock = vi.hoisted(() => vi.fn(async () => ''))
const getHtmlTocMock = vi.hoisted(() => vi.fn(() => ''))

const mockEditorInstance = vi.hoisted(() => ({
  container: null,
  contentState: { getBlocks: vi.fn(() => []), selectedTableCells: false },
  on: vi.fn(),
  off: vi.fn(),
  destroy: vi.fn(),
  setFocusMode: vi.fn(),
  setFont: vi.fn(),
  setOptions: vi.fn(),
  refreshCodeBlockLineNumbers: vi.fn(),
  setTabSize: vi.fn(),
  setListIndentation: vi.fn(),
  hideAllFloatTools: vi.fn(),
  getSelection: vi.fn(() => ({ cursorCoords: { y: 100 } })),
  focus: vi.fn(),
  blur: vi.fn(),
  undo: vi.fn(),
  redo: vi.fn(),
  selectAll: vi.fn(),
  hasFocus: vi.fn(() => true),
  format: vi.fn(),
  createTable: vi.fn(),
  setMarkdown: vi.fn(),
  setCursor: vi.fn(),
  clearHistory: vi.fn(),
  setHistory: vi.fn(),
  updateParagraph: vi.fn(),
  duplicate: vi.fn(),
  insertParagraph: vi.fn(),
  deleteParagraph: vi.fn(),
  insertImage: vi.fn(),
  insertImageFromPath: vi.fn(async (p) => p),
  search: vi.fn(() => ({ index: 0, matches: 1 })),
  replace: vi.fn(() => ({ index: 0, matches: 1 })),
  find: vi.fn(() => ({ index: 0, matches: 1 })),
  invalidateImageCache: vi.fn(),
  exportStyledHTML: vi.fn(async () => '<html></html>'),
  getTOC: vi.fn(() => []),
  getMarkdown: vi.fn(() => ''),
  getCopyData: vi.fn(() => ({ html: '', text: '' })),
  copyAsRich: vi.fn(),
  copyAsHtml: vi.fn(),
  pasteAsPlainText: vi.fn()
}))

const MockMuya = vi.hoisted(() => {
  return class MockMuya {
    constructor(el, opts) {
      Object.assign(this, mockEditorInstance)
      this.container = el
      this.options = opts || {}
      mockEditorInstance.container = el
    }
    static use() {}
  }
})

const mockPrinter = vi.hoisted(() => ({
  renderMarkdown: vi.fn(),
  clearup: vi.fn()
}))

const mockSpellchecker = vi.hoisted(() => ({
  isEnabled: false,
  lang: 'en',
  activateSpellchecker: vi.fn(),
  deactivateSpellchecker: vi.fn(),
  switchLanguage: vi.fn(() => Promise.resolve('en'))
}))

/* ── mocks — identical to editor-coverage.test.js except isOsx ───── */
vi.mock('@/bus', () => ({ default: busMock }))
vi.mock('electron-log', () => ({ default: logMock }))
vi.mock('muya/lib', () => ({ default: MockMuya }))
vi.mock('muya/lib/ui/tablePicker', () => ({ default: {} }))
vi.mock('muya/lib/ui/quickInsert', () => ({ default: {} }))
vi.mock('muya/lib/ui/codePicker', () => ({ default: {} }))
vi.mock('muya/lib/ui/emojiPicker', () => ({ default: {} }))
vi.mock('muya/lib/ui/imagePicker', () => ({ default: {} }))
vi.mock('muya/lib/ui/imageSelector', () => ({ default: {} }))
vi.mock('muya/lib/ui/imageToolbar', () => ({ default: {} }))
vi.mock('muya/lib/ui/transformer', () => ({ default: {} }))
vi.mock('muya/lib/ui/formatPicker', () => ({ default: {} }))
vi.mock('muya/lib/ui/linkTools', () => ({ default: {} }))
vi.mock('muya/lib/ui/footnoteTool', () => ({ default: {} }))
vi.mock('muya/lib/ui/tableTools', () => ({ default: {} }))
vi.mock('muya/lib/ui/frontMenu', () => ({ default: {} }))
vi.mock('muya/themes/default.css', () => ({}))
vi.mock('@/assets/themes/codemirror/one-dark.css', () => ({}))
vi.mock('@/services/notification', () => ({ default: noticeMock }))
vi.mock('@/services/printService', () => ({
  default: class {
    constructor() {
      Object.assign(this, mockPrinter)
    }
  }
}))
vi.mock('@/commands', () => ({ SpellcheckerLanguageCommand: class {} }))
vi.mock('@/spellchecker', () => ({
  SpellChecker: class {
    constructor() {
      return mockSpellchecker
    }
  }
}))
// The one deliberate difference from editor-coverage.test.js: macOS, so
// handleExport's post-invoke clearup branch runs (C-61 R-1).
vi.mock('@/util', async (importOriginal) => ({
  // Partial mock: the real store (EXPORT/REMEMBER_EXPORT_OPTIONS) needs the
  // rest of @/util (hasKeys, …); only the platform flag and scroll are faked.
  ...(await importOriginal()),
  isOsx: true,
  animatedScrollTo: animatedScrollToMock
}))
vi.mock('@/util/fileSystem', () => ({
  moveImageToFolder: vi.fn(),
  moveToRelativeFolder: vi.fn(),
  saveImageToRelativeFolder: vi.fn(),
  resolveImageFolder: vi.fn(),
  saveImageWithFolderAccess: vi.fn(),
  uploadImage: vi.fn()
}))
vi.mock('@/util/clipboard', () => ({ guessClipboardFilePath: vi.fn() }))
vi.mock('@tauri-apps/plugin-clipboard-manager', () => ({
  writeHtml: vi.fn(async () => undefined),
  writeText: vi.fn(async () => undefined)
}))
vi.mock('muya/lib/parser/marked', () => ({ default: vi.fn((t) => `<p>${t}</p>`) }))
vi.mock('muya/lib/utils', () => ({ sanitize: vi.fn((h) => h) }))
vi.mock('muya/lib/config', () => ({ EXPORT_DOMPURIFY_CONFIG: {} }))
vi.mock('@/util/pdf', () => ({
  getCssForOptions: getCssForOptionsMock,
  getHtmlToc: getHtmlTocMock
}))
vi.mock('@/util/theme', () => ({
  addCommonStyle: vi.fn(),
  setEditorWidth: vi.fn(),
  setWrapCodeBlocks: vi.fn()
}))
vi.mock('@/config', () => ({ DEFAULT_EDITOR_FONT_FAMILY: 'sans-serif' }))

globalThis.ResizeObserver = class ResizeObserver {
  constructor(cb) {
    this._cb = cb
  }
  observe() {}
  unobserve() {}
  disconnect() {}
}

const i18n = createI18n({ legacy: false, locale: 'en', messages: { en: {} } })

describe('editor.vue — C-61 print/pdf container lifecycle (macOS)', () => {
  let pinia, editorStore

  const mountEditor = async () => {
    const Editor = (await import('@/components/editorWithTabs/editor.vue')).default
    return shallowMount(Editor, {
      props: {
        markdown: '# Hello',
        cursor: null,
        textDirection: 'ltr',
        platform: 'darwin'
      },
      global: {
        plugins: [pinia, i18n],
        stubs: {
          ElDialog: true,
          ElForm: true,
          ElFormItem: true,
          ElInputNumber: true,
          ElButton: true,
          EditorSearch: true,
          CloseIcon: true
        }
      }
    })
  }

  const getBusHandler = (eventName) => {
    const call = busMock.on.mock.calls.find((c) => c[0] === eventName)
    if (!call) throw new Error(`no bus.on handler for ${eventName}`)
    return call[1]
  }

  beforeEach(async () => {
    pinia = setupTestPinia()
    const { useEditorStore } = await import('@/store/editor')
    const { usePreferencesStore } = await import('@/store/preferences')
    const { useLayoutStore } = await import('@/store/layout')
    const { useProjectStore } = await import('@/store/project')
    editorStore = useEditorStore()
    usePreferencesStore()
    useLayoutStore()
    useProjectStore()

    editorStore.currentFile = {
      id: 'tab-1',
      filename: 'test.md',
      pathname: '/tmp/test.md',
      markdown: '# Hello',
      isSaved: true,
      cursor: null,
      wordCount: { word: 1, character: 5, paragraph: 1, all: 7 },
      notifications: [],
      searchMatches: null,
      scrollTop: 0,
      previewMode: false
    }
    editorStore.tabs = [editorStore.currentFile]

    busMock.on.mockClear()
    mockPrinter.renderMarkdown.mockClear()
    mockPrinter.clearup.mockClear()
    noticeMock.notify.mockClear()
  })

  it('print: the container is cleared once mt_print_webview resolves (panel closed)', async () => {
    const { invoke } = await import('@tauri-apps/api/core')
    invoke.mockClear()
    const wrapper = await mountEditor()

    await getBusHandler('export')({
      type: 'print',
      header: '',
      footer: '',
      headerFooterStyled: false,
      htmlTitle: '',
      theme: null,
      pageMarginTop: 20,
      pageMarginRight: 15,
      pageMarginBottom: 20,
      pageMarginLeft: 15
    })

    expect(mockPrinter.renderMarkdown).toHaveBeenCalledTimes(1)
    expect(invoke).toHaveBeenCalledWith('mt_print_webview')
    // macOS: the backend resolves after the modal panel closes, so the
    // renderer clears the print container then (C-61 R-1).
    expect(mockPrinter.clearup).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })

  it('pdf: a cancelled save dialog writes nothing, notifies nobody, and clears the container (corner-2)', async () => {
    const { invoke } = await import('@tauri-apps/api/core')
    const { save } = await import('@tauri-apps/plugin-dialog')
    invoke.mockClear()
    // global setup mock: save resolves null (cancel) unless overridden
    save.mockReset()
    save.mockResolvedValue(null)
    const wrapper = await mountEditor()

    await getBusHandler('export')({
      type: 'pdf',
      header: '',
      footer: '',
      headerFooterStyled: false,
      htmlTitle: '',
      pageSize: 'A4',
      pageSizeWidth: 210,
      pageSizeHeight: 297,
      isLandscape: false,
      pageMarginTop: 20,
      pageMarginRight: 15,
      pageMarginBottom: 20,
      pageMarginLeft: 15
    })

    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({ filters: [{ name: 'PDF', extensions: ['pdf'] }] })
    )
    expect(invoke).not.toHaveBeenCalledWith('mt_export_pdf', expect.anything())
    expect(invoke).not.toHaveBeenCalledWith('mt_print_webview')
    expect(noticeMock.notify).not.toHaveBeenCalled()
    expect(mockPrinter.clearup).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })

  it('pdf: a successful save dialog runs mt_export_pdf and clears the container', async () => {
    const { invoke } = await import('@tauri-apps/api/core')
    const { save } = await import('@tauri-apps/plugin-dialog')
    invoke.mockClear()
    save.mockReset()
    save.mockResolvedValue('/tmp/test.pdf')
    invoke.mockResolvedValue(undefined)
    const wrapper = await mountEditor()

    await getBusHandler('export')({
      type: 'pdf',
      header: '',
      footer: '',
      headerFooterStyled: false,
      htmlTitle: '',
      pageSize: 'A5',
      pageSizeWidth: 148,
      pageSizeHeight: 210,
      isLandscape: true,
      pageMarginTop: 10,
      pageMarginRight: 10,
      pageMarginBottom: 10,
      pageMarginLeft: 10
    })

    expect(invoke).toHaveBeenCalledWith('mt_export_pdf', {
      path: '/tmp/test.pdf',
      pageOptions: {
        pageSize: 'A5',
        pageSizeWidth: 148,
        pageSizeHeight: 210,
        isLandscape: true,
        pageMarginTop: 10,
        pageMarginRight: 10,
        pageMarginBottom: 10,
        pageMarginLeft: 10
      }
    })
    expect(mockPrinter.clearup).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })
})
