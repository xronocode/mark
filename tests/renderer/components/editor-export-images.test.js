// FILE: tests/renderer/components/editor-export-images.test.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Pin the C-SELF-CONTAINED-HTML-EXPORT wiring in editor.vue's handleExport — the styledHtml branch runs embedLocalImages with the active document's directory before EXPORT and warns on skips; the pdf and print branches never run the pass (design-context corner C-12); an untitled document passes no directory.
//   SCOPE: The bus 'export' handler branch wiring only — the embedding semantics themselves live in tests/renderer/util/exportImages.test.js (M-065 unit matrix).
//   DEPENDS: Vitest, editor.vue (mounted with the editor-print-clearup harness: mocked Muya/Printer/Tauri surfaces, global @tauri-apps mocks from tests/renderer/setup.ts), a mocked '@/util/exportImages'.
//   LINKS: .grace/verification/features.xml V-M-065; .grace/changes/active/C-SELF-CONTAINED-HTML-EXPORT (R-4/R-5/R-6, corners C-9/C-12).
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   embedMock - embedLocalImages double returning configurable { html, embedded, total, skipped }.
//   MockMuya - Muya class double.
//   mockEditorInstance - the Muya instance double exposing exportStyledHTML.
//   mockPrinter - printService double (renderMarkdown / clearup counters).
//   mockSpellchecker - spellchecker double.
//   busMock - renderer bus double.
//   logMock - logger double.
//   noticeMock - notice double.
//   getCssForOptionsMock - export CSS helper double.
//   getHtmlTocMock - export TOC helper double.
//   animatedScrollToMock - @/util scroll double.
//   i18n - test i18n instance with the two export keys.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: 2026-10-22 v1.0.0 - C-SELF-CONTAINED-HTML-EXPORT T-002:
//   initial file — branch wiring pin for the styledHtml image-embedding
//   pass (call args, skipped-notice gate, pdf/print non-invocation,
//   untitled no-directory passthrough).
// END_CHANGE_SUMMARY

import { shallowMount } from '@vue/test-utils'
import { setupTestPinia } from '../pinia'
import { createI18n } from 'vue-i18n'

/* ── hoisted mock state (editor-print-clearup harness) ────────────── */
const busMock = vi.hoisted(() => ({ on: vi.fn(), off: vi.fn(), emit: vi.fn() }))
const noticeMock = vi.hoisted(() => ({ notify: vi.fn(async () => undefined) }))
const logMock = vi.hoisted(() => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn() }))
const animatedScrollToMock = vi.hoisted(() => vi.fn())
const getCssForOptionsMock = vi.hoisted(() => vi.fn(async () => ''))
const getHtmlTocMock = vi.hoisted(() => vi.fn(() => ''))
const embedMock = vi.hoisted(() => vi.fn(async (html) => ({
  html: `${html}<!--embedded-->`,
  embedded: 1,
  total: 2,
  skipped: 1
})))

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
  exportStyledHTML: vi.fn(async () => '<html><body>doc</body></html>'),
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

/* ── mocks — identical to editor-print-clearup.test.js ────────────── */
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
vi.mock('@/util', async (importOriginal) => ({
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
  uploadImage: vi.fn(),
  arrayBufferToBase64: vi.fn()
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
vi.mock('@/util/exportImages', () => ({
  embedLocalImages: embedMock
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

// Minimal en messages for the two export keys so the warning assertion
// exercises the real placeholder shape ({embedded}/{total}) the ten
// locales must use.
const i18n = createI18n({
  legacy: false,
  locale: 'en',
  messages: {
    en: {
      editor: {
        export: {
          imagesEmbeddedTitle: 'Some images were not embedded',
          imagesEmbeddedMessage: '{embedded} of {total} images embedded'
        }
      }
    }
  }
})

describe('editor.vue — C-SELF-CONTAINED-HTML-EXPORT styledHtml wiring', () => {
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

  const exportOptions = {
    header: '',
    footer: '',
    headerFooterStyled: false,
    htmlTitle: '',
    theme: null
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
    embedMock.mockClear()
    embedMock.mockResolvedValue({ html: '<html>embedded</html>', embedded: 2, total: 2, skipped: 0 })

    const { save } = await import('@tauri-apps/plugin-dialog')
    save.mockReset()
    save.mockResolvedValue(null)
  })

  it('styledHtml: runs the pass with the generated HTML and the document directory, then EXPORT (R-6)', async () => {
    await mountEditor()

    await getBusHandler('export')({ type: 'styledHtml', ...exportOptions })

    expect(embedMock).toHaveBeenCalledTimes(1)
    expect(embedMock).toHaveBeenCalledWith(
      '<html><body>doc</body></html>',
      '/tmp'
    )
  })

  it('styledHtml: a skipped count warns with the embedded/total counts (R-5)', async () => {
    embedMock.mockResolvedValue({ html: '<html>partial</html>', embedded: 3, total: 5, skipped: 2 })
    await mountEditor()

    await getBusHandler('export')({ type: 'styledHtml', ...exportOptions })

    expect(noticeMock.notify).toHaveBeenCalledTimes(1)
    const notice = noticeMock.notify.mock.calls[0][0]
    expect(notice.type).toBe('warning')
    expect(notice.title).toBe('Some images were not embedded')
    expect(notice.message).toBe('3 of 5 images embedded')
  })

  it('styledHtml: no notice when nothing was skipped (success path unchanged)', async () => {
    embedMock.mockResolvedValue({ html: '<html>all</html>', embedded: 2, total: 2, skipped: 0 })
    await mountEditor()

    await getBusHandler('export')({ type: 'styledHtml', ...exportOptions })

    expect(noticeMock.notify).not.toHaveBeenCalled()
  })

  it('styledHtml: an untitled document passes no directory and still exports (corner C-9)', async () => {
    editorStore.currentFile.pathname = null
    editorStore.currentFile.filename = 'Untitled-1'
    await mountEditor()

    await getBusHandler('export')({ type: 'styledHtml', ...exportOptions })

    expect(embedMock).toHaveBeenCalledWith('<html><body>doc</body></html>', null)
  })

  it('pdf: never runs the embedding pass (corner C-12)', async () => {
    await mountEditor()

    await getBusHandler('export')({
      type: 'pdf',
      ...exportOptions,
      pageMarginTop: 20,
      pageMarginRight: 15,
      pageMarginBottom: 20,
      pageMarginLeft: 15
    })

    expect(embedMock).not.toHaveBeenCalled()
    expect(mockPrinter.renderMarkdown).toHaveBeenCalledTimes(1)
  })

  it('print: never runs the embedding pass (corner C-12)', async () => {
    const { invoke } = await import('@tauri-apps/api/core')
    invoke.mockReset()
    invoke.mockResolvedValue(undefined)
    await mountEditor()

    await getBusHandler('export')({ type: 'print', ...exportOptions })

    expect(embedMock).not.toHaveBeenCalled()
    expect(mockPrinter.renderMarkdown).toHaveBeenCalledTimes(1)
  })
})
