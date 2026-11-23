// FILE: tests/renderer/components/editor-export-images.test.js
// VERSION: 1.1.0
// START_MODULE_CONTRACT
//   PURPOSE: Pin the C-SELF-CONTAINED-HTML-EXPORT wiring in editor.vue's handleExport — the styledHtml branch runs embedLocalImages with the active document's directory before EXPORT and warns on skips; the pdf and print branches never run the pass (design-context corner C-12); an untitled document passes no directory. C-EXPORT-BOUNDARIES adds the two consent-gate wiring pins: the PlantUML card ('export-plantuml-consent') raised before exportStyledHTML in the styledHtml and docx branches with the decision riding plantumlRemoteConsent, the embed card ('export-embed-consent') granting exactly the listed files through requestScopeConsent, the rollbackConfirm-pattern card shape, the ten-locale editor.export consent-key completeness pin and the count-only console-privacy pin.
//   SCOPE: The bus 'export' handler branch wiring only — the embedding semantics themselves live in tests/renderer/util/exportImages.test.js (M-065 unit matrix) and the pure PlantUML gate helpers in tests/renderer/util/export-plantuml-gate.test.js.
//   DEPENDS: Vitest, editor.vue (mounted with the editor-print-clearup harness: mocked Muya/Printer/Tauri surfaces, global @tauri-apps mocks from tests/renderer/setup.ts), a mocked '@/util/exportImages', node:fs for the locale-table pin.
//   LINKS: .grace/verification/features.xml V-M-065; .grace/changes/archive/C-SELF-CONTAINED-HTML-EXPORT (R-4/R-5/R-6, corners C-9/C-12); .grace/changes/active/C-EXPORT-BOUNDARIES.
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
//   i18n - test i18n instance with the export keys incl. the eight C-EXPORT-BOUNDARIES consent keys.
//   (per-describe fixtures: PLANTUML_DOC one-fence markdown; CONSENT_KEYS nested key list) - the PlantUML gate wiring pins and the ten-locale editor.export consent-key completeness pin.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   - 2026-11-21 v1.1.0 C-EXPORT-BOUNDARIES T-004: the two consent-gate
//   wiring pins (export-plantuml-consent before exportStyledHTML in both
//   branches with the plantumlRemoteConsent decision; export-embed-consent
//   granting exactly the listed files through the requestScopeConsent
//   third argument), the rollbackConfirm-pattern card shape pin, the
//   count-only console-privacy pin and the ten-locale editor.export
//   eight-key completeness pin with the en placeholder sets; the
//   two-arg embedMock pins updated to the three-arg shape (corner C-9
//   arity-only) — every semantic assertion of the pre-existing pins is
//   unchanged.
//   LAST_CHANGE: 2026-10-22 v1.0.0 - C-SELF-CONTAINED-HTML-EXPORT T-002:
//   initial file — branch wiring pin for the styledHtml image-embedding
//   pass (call args, skipped-notice gate, pdf/print non-invocation,
//   untitled no-directory passthrough).
// END_CHANGE_SUMMARY

import { shallowMount } from '@vue/test-utils'
import { setupTestPinia } from '../pinia'
import { createI18n } from 'vue-i18n'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

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
vi.mock('muya/lib', () => ({
  default: MockMuya,
  // C-LARGE-DOC-WAVE-A T-004: the content-free open-path marker names
  // editor.vue subscribes to.
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

// Minimal en messages for the export keys so the warning assertion
// exercises the real placeholder shape ({embedded}/{total}) the ten
// locales must use, and the consent-card assertions read the same
// interpolated copy the ten locales carry (mirrors static/locales/en.json).
const i18n = createI18n({
  legacy: false,
  locale: 'en',
  messages: {
    en: {
      editor: {
        export: {
          imagesEmbeddedTitle: 'Some images were not embedded',
          imagesEmbeddedMessage: '{embedded} of {total} images embedded',
          embedConsentTitle: 'Embed images from outside the document folder?',
          embedConsentMessage: '{count} image file(s) outside the document directory ({dir}) would be read and embedded: {paths}',
          embedConsentConfirm: 'Embed these files',
          embedConsentCancel: 'Skip them',
          plantumlConsentTitle: 'PlantUML diagrams are rendered by plantuml.com',
          plantumlConsentMessage: '{count} PlantUML diagram(s) would be sent to {address} for rendering — the diagram source text leaves this machine',
          plantumlConsentConfirm: 'Send to plantuml.com',
          plantumlConsentCancel: 'Keep source local',
          pinMismatchTitle: 'Export stopped — the document changed',
          pinMismatchMessage: 'The document being exported changed (a tab switch or an edit) while the export was waiting — nothing was exported. Start the export again.',
          pinDiskChangedTitle: 'Export stopped — the file changed on disk',
          pinDiskChangedMessage: 'The file {name} changed on disk after you approved the export — nothing was exported.'
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

  // C-EXPORT-BOUNDARIES: a one-fence document for the PlantUML gate pins.
  const PLANTUML_DOC = ['# Doc', '', '```plantuml', '@startuml', 'A -> B', '@enduml', '```', ''].join('\n')
  const flushAsync = () => new Promise((resolve) => setTimeout(resolve, 0))

  let consoleDebugSpy

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
    // C-EXPORT-BOUNDARIES: the gate wiring reads the document markdown and
    // asserts on exportStyledHTML calls — reset both between tests.
    mockEditorInstance.getMarkdown.mockReturnValue('')
    mockEditorInstance.exportStyledHTML.mockClear()
    mockEditorInstance.exportStyledHTML.mockResolvedValue('<html><body>doc</body></html>')
    consoleDebugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {})

    const { save } = await import('@tauri-apps/plugin-dialog')
    save.mockReset()
    save.mockResolvedValue(null)
  })

  afterEach(() => {
    consoleDebugSpy.mockRestore()
  })

  it('styledHtml: runs the pass with the generated HTML and the document directory, then EXPORT (R-6)', async () => {
    await mountEditor()

    await getBusHandler('export')({ type: 'styledHtml', ...exportOptions })

    expect(embedMock).toHaveBeenCalledTimes(1)
    // C-EXPORT-BOUNDARIES: the pass receives the requestScopeConsent
    // callback as its third argument.
    expect(embedMock).toHaveBeenCalledWith(
      '<html><body>doc</body></html>',
      '/tmp',
      { requestScopeConsent: expect.any(Function) }
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

    // C-EXPORT-BOUNDARIES: arity-only update — the null directory and the
    // export itself are pinned exactly as before.
    expect(embedMock).toHaveBeenCalledWith(
      '<html><body>doc</body></html>',
      null,
      expect.objectContaining({ requestScopeConsent: expect.any(Function) })
    )
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

// ──────────────────────────────────────────────────────────────────────
// START_BLOCK_CONSENT_WIRING_PINS
// C-EXPORT-BOUNDARIES T-004: the two consent-gate wiring pins — the
// PlantUML card raised before exportStyledHTML in the styledHtml and
// docx branches with the decision riding plantumlRemoteConsent, the
// embed card granting exactly the listed files through the third
// argument, the rollbackConfirm-pattern card shape and the count-only
// console-privacy convention.
// ──────────────────────────────────────────────────────────────────────
describe('editor.vue — C-EXPORT-BOUNDARIES consent gate wiring', () => {
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

  const PLANTUML_DOC = ['# Doc', '', '```plantuml', '@startuml', 'A -> B', '@enduml', '```', ''].join('\n')
  const flushAsync = () => new Promise((resolve) => setTimeout(resolve, 0))

  const findCard = (dedupKey) => {
    const call = noticeMock.notify.mock.calls.find((c) => c[0].dedupKey === dedupKey)
    return call ? call[0] : null
  }

  let consoleDebugSpy

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
    mockEditorInstance.getMarkdown.mockReturnValue('')
    mockEditorInstance.exportStyledHTML.mockClear()
    mockEditorInstance.exportStyledHTML.mockResolvedValue('<html><body>doc</body></html>')
    consoleDebugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {})

    const { save } = await import('@tauri-apps/plugin-dialog')
    save.mockReset()
    save.mockResolvedValue(null)
  })

  afterEach(() => {
    consoleDebugSpy.mockRestore()
  })

  it('plantuml gate: a plantuml fence raises export-plantuml-consent before exportStyledHTML; Confirm passes plantumlRemoteConsent: true', async () => {
    mockEditorInstance.getMarkdown.mockReturnValue(PLANTUML_DOC)
    await mountEditor()

    const done = getBusHandler('export')({ type: 'styledHtml', ...exportOptions })
    await flushAsync()

    const card = findCard('export-plantuml-consent')
    expect(card).not.toBeNull()
    expect(card.sticky).toBe(true)
    expect(card.message).toContain('https://www.plantuml.com/plantuml')
    expect(card.message).toContain('1')
    // Raised BEFORE the export call.
    expect(mockEditorInstance.exportStyledHTML).not.toHaveBeenCalled()

    card.actions.find((a) => a.style === 'primary').handler()
    await done

    expect(mockEditorInstance.exportStyledHTML).toHaveBeenCalledWith(
      expect.objectContaining({ plantumlRemoteConsent: true })
    )
    // Count-only marker: diagrams=N, never diagram text.
    const logged = consoleDebugSpy.mock.calls.map((args) => args.map(String).join(' ')).join('\n')
    expect(logged).toContain('[export][plantuml][BLOCK_PLANTUML_EXPORT_CONSENT diagrams=1]')
  })

  it('plantuml gate: Cancel passes plantumlRemoteConsent: false with the declined marker', async () => {
    mockEditorInstance.getMarkdown.mockReturnValue(PLANTUML_DOC)
    await mountEditor()

    const done = getBusHandler('export')({ type: 'styledHtml', ...exportOptions })
    await flushAsync()

    const card = findCard('export-plantuml-consent')
    expect(card).not.toBeNull()
    card.actions.find((a) => a.style !== 'primary').handler()
    await done

    expect(mockEditorInstance.exportStyledHTML).toHaveBeenCalledWith(
      expect.objectContaining({ plantumlRemoteConsent: false })
    )
    const logged = consoleDebugSpy.mock.calls.map((args) => args.map(String).join(' ')).join('\n')
    expect(logged).toContain('[export][plantuml][BLOCK_PLANTUML_EXPORT_DECLINED diagrams=1]')
  })

  it('plantuml gate: a document without plantuml fences raises no card and passes plantumlRemoteConsent: false', async () => {
    mockEditorInstance.getMarkdown.mockReturnValue('# Doc\n\n```mermaid\ngraph TD; A-->B\n```\n')
    await mountEditor()

    await getBusHandler('export')({ type: 'styledHtml', ...exportOptions })

    expect(findCard('export-plantuml-consent')).toBeNull()
    expect(mockEditorInstance.exportStyledHTML).toHaveBeenCalledWith(
      expect.objectContaining({ plantumlRemoteConsent: false })
    )
  })

  it('plantuml gate: the docx branch raises the same card and passes the decision into exportStyledHTML', async () => {
    mockEditorInstance.getMarkdown.mockReturnValue(PLANTUML_DOC)
    await mountEditor()

    const done = getBusHandler('export')({ type: 'docx', ...exportOptions })
    await flushAsync()

    const card = findCard('export-plantuml-consent')
    expect(card).not.toBeNull()
    expect(mockEditorInstance.exportStyledHTML).not.toHaveBeenCalled()

    card.actions.find((a) => a.style === 'primary').handler()
    await done

    expect(mockEditorInstance.exportStyledHTML).toHaveBeenCalledWith(
      expect.objectContaining({ plantumlRemoteConsent: true })
    )
    // The docx branch consumed the same post-consent HTML through the
    // embed pass (M-066 unchanged in code — no gate of its own here).
    expect(embedMock).toHaveBeenCalledTimes(1)
  })

  it('embed gate: the pass receives a requestScopeConsent function; Confirm grants exactly the listed files', async () => {
    embedMock.mockImplementation(async (html, dir, { requestScopeConsent }) => {
      const granted = await requestScopeConsent(['/vault/pics/outside.png'])
      return { html, embedded: granted.length, total: 1, skipped: 0 }
    })
    await mountEditor()

    const done = getBusHandler('export')({ type: 'styledHtml', ...exportOptions })
    await flushAsync()

    const card = findCard('export-embed-consent')
    expect(card).not.toBeNull()
    expect(card.sticky).toBe(true)
    // The card names the resolved path, its count and the document directory.
    expect(card.message).toContain('/vault/pics/outside.png')
    expect(card.message).toContain('/tmp')

    card.actions.find((a) => a.style === 'primary').handler()
    await done

    expect(embedMock).toHaveBeenCalledWith(
      '<html><body>doc</body></html>',
      '/tmp',
      { requestScopeConsent: expect.any(Function) }
    )
  })

  it('embed gate: Cancel grants the empty list', async () => {
    let grantedList = ['sentinel']
    embedMock.mockImplementation(async (html, dir, { requestScopeConsent }) => {
      grantedList = await requestScopeConsent(['/vault/pics/outside.png'])
      return { html, embedded: grantedList.length, total: 1, skipped: 1 }
    })
    await mountEditor()

    const done = getBusHandler('export')({ type: 'styledHtml', ...exportOptions })
    await flushAsync()

    const card = findCard('export-embed-consent')
    expect(card).not.toBeNull()
    card.actions.find((a) => a.style !== 'primary').handler()
    await done

    expect(grantedList).toEqual([])
  })

  it('consent card shape: sticky dedupKey singleton with two decision actions (rollbackConfirm pattern)', async () => {
    mockEditorInstance.getMarkdown.mockReturnValue(PLANTUML_DOC)
    await mountEditor()

    const done = getBusHandler('export')({ type: 'styledHtml', ...exportOptions })
    await flushAsync()

    const card = findCard('export-plantuml-consent')
    expect(card.dedupKey).toBe('export-plantuml-consent')
    expect(card.sticky).toBe(true)
    expect(card.actions).toHaveLength(2)
    for (const action of card.actions) {
      expect(typeof action.handler).toBe('function')
    }
    expect(card.actions[0].style).toBe('primary')

    // The awaited decision resolves through the handlers — dismissing
    // the card after the decision completes the export.
    card.actions[0].handler()
    await done
    expect(mockEditorInstance.exportStyledHTML).toHaveBeenCalledTimes(1)
  })

  it('privacy: consent markers log counts only — no resolved path and no diagram text', async () => {
    mockEditorInstance.getMarkdown.mockReturnValue(PLANTUML_DOC)
    await mountEditor()

    const done = getBusHandler('export')({ type: 'styledHtml', ...exportOptions })
    await flushAsync()
    const card = findCard('export-plantuml-consent')
    card.actions.find((a) => a.style === 'primary').handler()
    await done

    const logged = consoleDebugSpy.mock.calls.map((args) => args.map(String).join(' ')).join('\n')
    expect(logged).toContain('BLOCK_PLANTUML_EXPORT_CONSENT diagrams=1')
    expect(logged).not.toContain('/tmp/test.md')
    expect(logged).not.toContain('@startuml')
    expect(logged).not.toContain('A -> B')
  })
})
// END_BLOCK_CONSENT_WIRING_PINS

// ──────────────────────────────────────────────────────────────────────
// START_BLOCK_LOCALE_CONSENT_PINS
// C-EXPORT-BOUNDARIES T-004: the ten-locale editor.export consent-key
// completeness pin (existing V-M-065 locale convention) with the en
// placeholder sets.
// ──────────────────────────────────────────────────────────────────────
describe('editor.export consent keys — ten-locale completeness (C-EXPORT-BOUNDARIES)', () => {
  const ROOT = process.cwd()
  const LOCALES = ['de', 'en', 'es', 'fr', 'ja', 'ko', 'pt', 'ru', 'zh-CN', 'zh-TW']
  const CONSENT_KEYS = [
    'embedConsentTitle',
    'embedConsentMessage',
    'embedConsentConfirm',
    'embedConsentCancel',
    'plantumlConsentTitle',
    'plantumlConsentMessage',
    'plantumlConsentConfirm',
    'plantumlConsentCancel'
  ]

  const readTable = (locale) =>
    JSON.parse(readFileSync(join(ROOT, 'static/locales', `${locale}.json`), 'utf8'))

  it('every locale carries all eight consent keys with non-empty copy', () => {
    for (const locale of LOCALES) {
      const table = readTable(locale).editor?.export
      for (const key of CONSENT_KEYS) {
        expect(typeof table?.[key], `${locale}.${key}`).toBe('string')
        expect(table[key].trim().length, `${locale}.${key}`).toBeGreaterThan(0)
      }
    }
  })

  it('en pins the consent placeholder sets', () => {
    const table = readTable('en').editor.export
    for (const token of ['{count}', '{dir}', '{paths}']) {
      expect(table.embedConsentMessage).toContain(token)
    }
    for (const token of ['{count}', '{address}']) {
      expect(table.plantumlConsentMessage).toContain(token)
    }
  })

  it('every locale keeps the same placeholders as en', () => {
    for (const locale of LOCALES) {
      const table = readTable(locale).editor.export
      for (const token of ['{count}', '{dir}', '{paths}']) {
        expect(table.embedConsentMessage.includes(token), `${locale} ${token}`).toBe(true)
      }
      for (const token of ['{count}', '{address}']) {
        expect(table.plantumlConsentMessage.includes(token), `${locale} ${token}`).toBe(true)
      }
    }
  })
})
// END_BLOCK_LOCALE_CONSENT_PINS

// ──────────────────────────────────────────────────────────────────────
// START_BLOCK_EXPORT_DOCUMENT_PIN
// C-EXPORT-DOCUMENT-PIN T-001: the failing-first pin-seam pins — the
// export pin is captured at handleExport entry (before the first
// consent raise) with the owner identity, the content revision, the
// pathname/directory and the baseline digest through the file-read
// facade; the embed directory is sourced from the pin, not a live
// currentFile re-read; an identity mismatch after consent aborts with
// the localized editor.export.pinMismatch refusal, no EXPORT dispatch
// and no embed pass; a consent decision is never applied to another
// document; and the four new editor.export refusal keys are complete
// across the ten locales with the en placeholder sets.
// ──────────────────────────────────────────────────────────────────────
describe('editor.vue — C-EXPORT-DOCUMENT-PIN pin seams', () => {
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

  const PLANTUML_DOC = ['# Doc', '', '```plantuml', '@startuml', 'A -> B', '@enduml', '```', ''].join('\n')
  const flushAsync = () => new Promise((resolve) => setTimeout(resolve, 0))

  const findCard = (dedupKey) => {
    const call = noticeMock.notify.mock.calls.find((c) => c[0].dedupKey === dedupKey)
    return call ? call[0] : null
  }

  const refusalCards = () =>
    noticeMock.notify.mock.calls.filter((c) => c[0].title === 'Export stopped — the document changed')

  let consoleDebugSpy
  let pinOrder
  let readCalls

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
    mockEditorInstance.getMarkdown.mockReturnValue('')
    mockEditorInstance.exportStyledHTML.mockClear()
    mockEditorInstance.exportStyledHTML.mockResolvedValue('<html><body>doc</body></html>')
    consoleDebugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {})

    // C-EXPORT-DOCUMENT-PIN: the capture seam rides the binary-bridge read
    // (ipc.fs.read_binary) — record every read and the pin-vs-card ordering
    // through one sequence. (The notify double stays a vi.fn; only its
    // implementation records.)
    pinOrder = []
    readCalls = []
    const { invoke } = await import('@tauri-apps/api/core')
    invoke.mockImplementation(async (cmd, args) => {
      // ipcInvoke translates mt::fs::read_binary to the Rust-side
      // mt_fs_read_binary before dispatch — record the translated name.
      if (cmd === 'mt_fs_read_binary' || cmd === 'mt::fs::read_binary') {
        readCalls.push(args?.path)
        pinOrder.push('pin:read')
        return new TextEncoder().encode('# Hello')
      }
      return undefined
    })
    noticeMock.notify.mockImplementation(async (entry) => {
      if (entry.dedupKey) pinOrder.push(entry.dedupKey)
      return undefined
    })

    const { save } = await import('@tauri-apps/plugin-dialog')
    save.mockReset()
    save.mockResolvedValue(null)
  })

  afterEach(() => {
    consoleDebugSpy.mockRestore()
  })

  it('captures the export pin before the first consent raise', async () => {
    mockEditorInstance.getMarkdown.mockReturnValue(PLANTUML_DOC)
    await mountEditor()

    const done = getBusHandler('export')({ type: 'styledHtml', ...exportOptions })
    await flushAsync()

    // The capture seam read the pinned document BEFORE the plantuml card.
    expect(readCalls).toEqual(['/tmp/test.md'])
    expect(pinOrder.indexOf('pin:read')).toBeGreaterThanOrEqual(0)
    expect(pinOrder.indexOf('export-plantuml-consent')).toBeGreaterThan(pinOrder.indexOf('pin:read'))

    // Mutating the store after capture does not alter the pinned values.
    editorStore.currentFile.pathname = '/elsewhere/moved.md'
    editorStore.currentFile.filename = 'moved.md'
    await flushAsync()

    const card = findCard('export-plantuml-consent')
    card.actions.find((a) => a.style === 'primary').handler()
    await done

    // The pinned directory (captured at entry) survives the mutation.
    expect(embedMock).toHaveBeenCalledWith(
      '<html><body>doc</body></html>',
      '/tmp',
      expect.objectContaining({ requestScopeConsent: expect.any(Function) })
    )
  })

  it('sources the embed directory from the pin, not a live currentFile re-read', async () => {
    mockEditorInstance.getMarkdown.mockReturnValue(PLANTUML_DOC)
    await mountEditor()

    const done = getBusHandler('export')({ type: 'styledHtml', ...exportOptions })
    await flushAsync()

    // The live currentFile moves between consent raise and resolution.
    editorStore.currentFile.pathname = '/elsewhere/moved.md'
    await flushAsync()

    const card = findCard('export-plantuml-consent')
    card.actions.find((a) => a.style === 'primary').handler()
    await done

    // Pre-fix the branch re-reads the live currentFile directory
    // ('/elsewhere'); the pin keeps the captured one.
    expect(embedMock).toHaveBeenCalledWith(
      '<html><body>doc</body></html>',
      '/tmp',
      { requestScopeConsent: expect.any(Function) }
    )
  })

  it('aborts on identity mismatch after consent without EXPORT or embed', async () => {
    mockEditorInstance.getMarkdown.mockReturnValue(PLANTUML_DOC)
    await mountEditor()

    const exportSpy = vi.spyOn(editorStore, 'EXPORT')
    const done = getBusHandler('export')({ type: 'styledHtml', ...exportOptions })
    await flushAsync()

    // The active document's identity moves between consent raise and confirm.
    editorStore.currentFile.documentToken = 'token-rotated-after-consent'
    await flushAsync()

    const card = findCard('export-plantuml-consent')
    card.actions.find((a) => a.style === 'primary').handler()
    await done

    expect(embedMock).not.toHaveBeenCalled()
    expect(exportSpy).not.toHaveBeenCalled()
    expect(mockEditorInstance.exportStyledHTML).not.toHaveBeenCalled()
    expect(refusalCards()).toHaveLength(1)
    const refusal = refusalCards()[0][0]
    expect(refusal.type).toBe('error')
    expect(refusal.message).toContain('nothing was exported')
    const logged = consoleDebugSpy.mock.calls.map((args) => args.map(String).join(' ')).join('\n')
    expect(logged).toContain('[export][pin][BLOCK_EXPORT_PIN_MISMATCH class=identity]')
  })

  it('never applies a consent decision to another document', async () => {
    mockEditorInstance.getMarkdown.mockReturnValue(PLANTUML_DOC)
    let granted = null
    embedMock.mockImplementation(async (html, dir, { requestScopeConsent }) => {
      granted = await requestScopeConsent(['/vault/pics/outside.png'])
      return { html, embedded: granted.length, total: 1, skipped: 0 }
    })
    await mountEditor()

    const exportSpy = vi.spyOn(editorStore, 'EXPORT')
    const done = getBusHandler('export')({ type: 'styledHtml', ...exportOptions })
    await flushAsync()

    // The pinned document's identity moves before its consent is confirmed:
    // the decision resolved for the pinned candidates must never feed a
    // pass rendered against another document — post-mismatch no pass runs.
    editorStore.currentFile.documentToken = 'token-rotated-before-confirm'
    await flushAsync()

    const card = findCard('export-plantuml-consent')
    card.actions.find((a) => a.style === 'primary').handler()
    await done

    expect(embedMock).not.toHaveBeenCalled()
    expect(exportSpy).not.toHaveBeenCalled()
    expect(findCard('export-embed-consent')).toBeNull()
    expect(granted).toBeNull()
    expect(refusalCards()).toHaveLength(1)
  })
})

// ──────────────────────────────────────────────────────────────────────
// START_BLOCK_EXPORT_PIN_LOCALE_PINS
// C-EXPORT-DOCUMENT-PIN T-001: the ten-locale completeness pin for the
// four new editor.export refusal keys (existing V-M-065 locale
// convention) with the en placeholder sets.
// ──────────────────────────────────────────────────────────────────────
describe('editor.export pin refusal keys — ten-locale completeness (C-EXPORT-DOCUMENT-PIN)', () => {
  const ROOT = process.cwd()
  const LOCALES = ['de', 'en', 'es', 'fr', 'ja', 'ko', 'pt', 'ru', 'zh-CN', 'zh-TW']
  const PIN_KEYS = [
    'pinMismatchTitle',
    'pinMismatchMessage',
    'pinDiskChangedTitle',
    'pinDiskChangedMessage'
  ]

  const readTable = (locale) =>
    JSON.parse(readFileSync(join(ROOT, 'static/locales', `${locale}.json`), 'utf8'))

  it('every locale carries all four pin refusal keys with non-empty copy', () => {
    for (const locale of LOCALES) {
      const table = readTable(locale).editor?.export
      for (const key of PIN_KEYS) {
        expect(typeof table?.[key], `${locale}.${key}`).toBe('string')
        expect(table[key].trim().length, `${locale}.${key}`).toBeGreaterThan(0)
      }
    }
  })

  it('en pins the pin-refusal placeholder sets', () => {
    const table = readTable('en').editor.export
    expect(table.pinMismatchMessage.match(/\{\w+\}/)).toBeNull()
    expect(table.pinDiskChangedMessage).toContain('{name}')
  })

  it('every locale keeps the {name} placeholder in pinDiskChangedMessage', () => {
    for (const locale of LOCALES) {
      const table = readTable(locale).editor.export
      expect(table.pinDiskChangedMessage.includes('{name}'), `${locale} {name}`).toBe(true)
    }
  })
})
// END_BLOCK_EXPORT_PIN_LOCALE_PINS
// END_BLOCK_EXPORT_DOCUMENT_PIN
