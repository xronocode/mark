// FILE: tests/renderer/components/editor-export-model-pin.test.js
// START_MODULE_CONTRACT
//   PURPOSE: Pin the complexity f-002 residual closure in editor.vue's C-EXPORT-DOCUMENT-PIN — the export pin freezes the muya model snapshot (modelMarkdown) at capture and verifyExportPin re-compares the live model against it, so content committed to the model but never synced into tab.markdown (it moves no contentRevision) can no longer render into the artifact silently; the pinned run without drift still ships.
//   SCOPE: editor.vue handleExport / captureExportPin / verifyExportPin (the model-snapshot terms only) over the docx branch; same harness as editor-print-clearup.test.js.
//   DEPENDS: Vitest, editor.vue (mounted with mocked Muya/Printer/Tauri surfaces), global @tauri-apps mocks from tests/renderer/setup.ts.
//   LINKS: complexity f-002 residual (2026-11-25 audit) documented in the START_BLOCK_EXPORT_DOCUMENT_PIN comment; tests/renderer/store/export-document-pin.test.js (store-side pin contract); tests/e2e/export-document-pin.spec.ts.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   MockMuya - Muya class double.
//   mockEditorInstance - the Muya instance double exposing exportStyledHTML / getMarkdown / getTOC.
//   mockPrinter - printService double (renderMarkdown / clearup counters).
//   mockSpellchecker - spellchecker double.
//   busMock - renderer bus double.
//   logMock - logger double.
//   noticeMock - notice double.
//   getCssForOptionsMock - export CSS helper double (the drift window).
//   getHtmlTocMock - export TOC helper double.
//   animatedScrollToMock - @/util scroll double (the rest of @/util is real).
//   exportToDocxMock - the lazy '@/util/exportDocx' conversion double (the store's Word leg).
//   i18n - test i18n instance.
// END_MODULE_MAP

import { shallowMount } from '@vue/test-utils'
import { setupTestPinia } from '../pinia'
import { createI18n } from 'vue-i18n'

/* ── hoisted mock state (editor-print-clearup harness) ── */
const busMock = vi.hoisted(() => ({ on: vi.fn(), off: vi.fn(), emit: vi.fn() }))
const noticeMock = vi.hoisted(() => ({ notify: vi.fn(async () => undefined) }))
const logMock = vi.hoisted(() => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn() }))
const animatedScrollToMock = vi.hoisted(() => vi.fn())
const getCssForOptionsMock = vi.hoisted(() => vi.fn(async () => ''))
const getHtmlTocMock = vi.hoisted(() => vi.fn(() => ''))
const exportToDocxMock = vi.hoisted(() => vi.fn())

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
  getMarkdown: vi.fn(() => '# Hello'),
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

/* ── mocks — identical to editor-print-clearup.test.js ───────────── */
vi.mock('@/bus', () => ({ default: busMock }))
vi.mock('electron-log', () => ({ default: logMock }))
vi.mock('muya/lib', () => ({
  default: MockMuya,
  BLOCK_MOUNT_SERVED: 'BLOCK_MOUNT_SERVED',
  BLOCK_SYNC_REGION_DONE: 'BLOCK_SYNC_REGION_DONE',
  BLOCK_TAIL_MOUNT_DONE: 'BLOCK_TAIL_MOUNT_DONE'
}))
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
vi.mock('@/util', async (importOriginal) => ({
  ...(await importOriginal()),
  isOsx: false,
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
vi.mock('@/util/exportDocx', () => ({ exportToDocx: (...args) => exportToDocxMock(...args) }))
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

describe('editor.vue — the export pin freezes the muya model (complexity f-002 residual)', () => {
  let pinia, editorStore
  let debugSpy

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
    exportToDocxMock.mockReset()
    getCssForOptionsMock.mockReset()
    getCssForOptionsMock.mockResolvedValue('')
    mockEditorInstance.getMarkdown.mockReset()
    mockEditorInstance.getMarkdown.mockReturnValue('# Hello')
    mockEditorInstance.exportStyledHTML.mockReset()
    mockEditorInstance.exportStyledHTML.mockResolvedValue('<html></html>')
    debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {})
  })

  afterEach(() => {
    debugSpy.mockRestore()
  })

  it('a model-side commit that moves no contentRevision refuses the export (residual closed)', async () => {
    const { save } = await import('@tauri-apps/plugin-dialog')
    save.mockReset()
    save.mockResolvedValue('/tmp/test.docx')
    const wrapper = await mountEditor()
    let releaseCss
    getCssForOptionsMock.mockImplementationOnce(() => new Promise((resolve) => { releaseCss = resolve }))
    const exportSpy = vi.spyOn(editorStore, 'EXPORT')

    const operation = getBusHandler('export')({
      type: 'docx',
      header: '',
      footer: '',
      headerFooterStyled: false,
      htmlTitle: '',
      pageMarginTop: 20,
      pageMarginRight: 15,
      pageMarginBottom: 20,
      pageMarginLeft: 15
    })
    // The pin capture happens before the CSS load; drift the muya model
    // while the export is parked on it — content committed to the model
    // but never synced into tab.markdown, so contentRevision stays put.
    await vi.waitFor(() => expect(typeof releaseCss).toBe('function'))
    mockEditorInstance.getMarkdown.mockReturnValue('# Drifted')
    releaseCss('')
    await operation

    // The rendered model no longer matches the pinned snapshot: exactly
    // one mismatch notice, the count-only marker, no muya render, no
    // store dispatch — the artifact never renders drifted content.
    expect(mockEditorInstance.exportStyledHTML).not.toHaveBeenCalled()
    expect(exportSpy).not.toHaveBeenCalled()
    expect(noticeMock.notify).toHaveBeenCalledTimes(1)
    expect(noticeMock.notify.mock.calls[0][0].title).toBe('editor.export.pinMismatchTitle')
    const logged = debugSpy.mock.calls.map((args) => args.map(String).join(' ')).join('\n')
    expect(logged).toContain('[export][pin][BLOCK_EXPORT_PIN_MISMATCH class=identity]')
    wrapper.unmount()
  })

  it('the pinned run without model drift still ships', async () => {
    const { save } = await import('@tauri-apps/plugin-dialog')
    save.mockReset()
    save.mockResolvedValue('/tmp/test.docx')
    exportToDocxMock.mockResolvedValue(new Uint8Array([1, 2, 3]))
    const postEmbedHtml = '<p>doc body</p>'
    mockEditorInstance.exportStyledHTML.mockResolvedValueOnce(postEmbedHtml)
    const wrapper = await mountEditor()
    const exportSpy = vi.spyOn(editorStore, 'EXPORT')

    await getBusHandler('export')({
      type: 'docx',
      header: '',
      footer: '',
      headerFooterStyled: false,
      htmlTitle: '',
      pageMarginTop: 20,
      pageMarginRight: 15,
      pageMarginBottom: 20,
      pageMarginLeft: 15
    })

    await vi.waitFor(() => expect(exportSpy).toHaveBeenCalledTimes(1))
    expect(exportSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'docx',
        content: postEmbedHtml,
        exportPin: expect.objectContaining({ modelMarkdown: '# Hello' })
      })
    )
    expect(noticeMock.notify).not.toHaveBeenCalled()
    wrapper.unmount()
  })
})
