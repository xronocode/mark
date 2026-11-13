// FILE: tests/renderer/components/editor-progressive-mount.test.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Pin the C-LARGE-DOC-WAVE-A T-004 progressive-mount orchestration in editorWithTabs/editor.vue — the experimental open-path branch, the marker-fed session counters, the ag-tail-pending reserved-space indication and the scroll-driven prefetch.
//   SCOPE: Deterministic Vue/jsdom tests (editor-coverage mock pattern) for: toggle-ON plain content opens routing through muya.progressiveMount instead of legacy setMarkdown (boot hydration, file-loaded and file-changed), toggle-OFF and mirror opens staying legacy, BLOCK_MOUNT_SERVED {served} feeding the preferences-store served-opens counters through the tauri echo listener, the ag-tail-pending class tracking muya.progressive.info() status across BLOCK_SYNC_REGION_DONE / BLOCK_TAIL_MOUNT_DONE / fallback markers and legacy replacements, handleProgressiveScrollPrefetch mounting ~3 viewports ahead via muya.mountToBlockKey with throttle and already-mounted short-circuits, restored opens (cursor / blocks cache / muyaIndexCursor / non-empty history) staying legacy, the BLOCK_PROGRESSIVE_ENTRY_FAILED belt, and the unmount marker unsubscribe function identity.
//   DEPENDS: Vue Test Utils, Vitest, Pinia test setup, mocked Muya (same mock approach as editor-coverage.test.js), mocked @tauri-apps/api/event (listen captures the served handler, emit drives the echo).
//   LINKS: .grace/changes/archive/C-LARGE-DOC-WAVE-A (spec R-2/R-4, plan T-004); .grace/graph/runtime.xml M-011; .grace/verification/runtime.xml V-M-011 and V-M-063.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   EditorComponent - the editor.vue component loaded once at file scope (after all mocks register).
//   MockMuya - mocked Muya class (editor-coverage pattern) with the T-004 progressiveMount/mountToBlockKey/progressive.info surface.
//   addCommonStyleMock - GRACE 4 synchronized symbol
//   animatedScrollToMock - GRACE 4 synchronized symbol (asserts the explicit-scroll gate while a tail is pending)
//   busMock - GRACE 4 synchronized symbol
//   getCssForOptionsMock - GRACE 4 synchronized symbol
//   getHtmlTocMock - GRACE 4 synchronized symbol
//   i18n - GRACE 4 synchronized symbol
//   lastMuyaInstance - the most recent MockMuya instance (per-instance overrides like a deleted progressiveMount).
//   lastMuyaOptions - GRACE 4 synchronized symbol
//   logMock - GRACE 4 synchronized symbol
//   markedMock - GRACE 4 synchronized symbol
//   mockEditorInstance - Muya mock; drives the T-004 orchestration (progressive open branch, markers, prefetch, tail-pending state).
//   mockPrinter - GRACE 4 synchronized symbol
//   mockSpellchecker - GRACE 4 synchronized symbol
//   moveImageToFolderMock - GRACE 4 synchronized symbol
//   moveToRelativeFolderMock - GRACE 4 synchronized symbol
//   noticeMock - GRACE 4 synchronized symbol
//   pictureExportMock - C-70 stubbed muya table/diagram export helpers (import-preservation only here)
//   progressiveInfoMock - the muya.progressive.info() mock; its return value scripts the tail-pending state machine.
//   resolveImageFolderMock - C-24 global image folder resolver mock
//   saveImageToRelativeFolderMock - C-24 relative-folder image save mock
//   saveImageWithFolderAccessMock - C-24 sandbox folder-access wrapper mock
//   sanitizeMock - GRACE 4 synchronized symbol
//   servedEchoHandler - the mt::experimental-progressive-served listener captured from LISTEN_EXPERIMENTAL_PROGRESSIVE_MOUNT.
//   setEditorWidthMock - GRACE 4 synchronized symbol
//   setWrapCodeBlocksMock - GRACE 4 synchronized symbol
//   uploadImageMock - GRACE 4 synchronized symbol
//   writeHtmlMock - GRACE 4 synchronized symbol
//   writeImageMock - C-70 clipboard writeImage mock
//   writeTextMock - GRACE 4 synchronized symbol
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - C-LARGE-DOC-WAVE-A T-004 - unit coverage for the progressive-mount orchestration block in editor.vue (open-path routing, served counters, ag-tail-pending, scroll prefetch, legacy narrowings, entry belt, unsubscribe identity).
// END_CHANGE_SUMMARY

import { shallowMount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { setupTestPinia } from '../pinia'
import { createI18n } from 'vue-i18n'
import { emit, listen } from '@tauri-apps/api/event'

/* ── hoisted mock state (editor-coverage.test.js pattern) ──────── */
const busMock = vi.hoisted(() => ({
  on: vi.fn(),
  off: vi.fn(),
  emit: vi.fn()
}))

const noticeMock = vi.hoisted(() => ({ notify: vi.fn() }))
const logMock = vi.hoisted(() => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn() }))
const animatedScrollToMock = vi.hoisted(() => vi.fn())
const setEditorWidthMock = vi.hoisted(() => vi.fn())
const setWrapCodeBlocksMock = vi.hoisted(() => vi.fn())
const addCommonStyleMock = vi.hoisted(() => vi.fn())
const moveImageToFolderMock = vi.hoisted(() => vi.fn())
const moveToRelativeFolderMock = vi.hoisted(() => vi.fn())
const saveImageToRelativeFolderMock = vi.hoisted(() => vi.fn())
const resolveImageFolderMock = vi.hoisted(() => vi.fn())
const saveImageWithFolderAccessMock = vi.hoisted(() => vi.fn())
const uploadImageMock = vi.hoisted(() => vi.fn())
const getCssForOptionsMock = vi.hoisted(() => vi.fn(async () => ''))
const getHtmlTocMock = vi.hoisted(() => vi.fn(() => ''))
const writeHtmlMock = vi.hoisted(() => vi.fn(async () => undefined))
const writeTextMock = vi.hoisted(() => vi.fn(async () => undefined))
const markedMock = vi.hoisted(() => vi.fn((text) => `<p>${text}</p>`))
const sanitizeMock = vi.hoisted(() => vi.fn((html) => `clean:${html}`))
const writeImageMock = vi.hoisted(() => vi.fn(async () => undefined))
const pictureExportMock = vi.hoisted(() => ({
  buildTableSvg: vi.fn(),
  resolveTableExportTable: vi.fn(),
  diagramExportSvg: vi.fn(),
  buildStandaloneSvg: vi.fn(),
  rasterizeSvg: vi.fn(),
  suggestFileName: vi.fn(),
  nearestHeadingText: vi.fn()
}))

// C-LARGE-DOC-WAVE-A T-004: muya.progressive.info() scripts the tail state
// machine — null (no session) or { status: 'sync'|'tailing'|'done'|'fallback'|
// 'cancelled', mountedThrough, ... } exactly as the T-003 controller reports.
const progressiveInfoMock = vi.hoisted(() => vi.fn(() => null))

const mockEditorInstance = vi.hoisted(() => ({
  container: null,
  contentState: { getBlocks: vi.fn(() => []), selectedTableCells: false, getMuyaIndexCursor: vi.fn(() => null) },
  // T-004: the progressive entry point, the on-demand prefetch mount and
  // the controller info() probe editor.vue coordinates against.
  progressiveMount: vi.fn(),
  mountToBlockKey: vi.fn(),
  progressive: { info: progressiveInfoMock },
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
  getCursor: vi.fn(() => ({ line: 1, ch: 0 })),
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
  _replaceCurrentWordInlineUnsafe: vi.fn(),
  exportStyledHTML: vi.fn(async () => '<html></html>'),
  getTOC: vi.fn(() => []),
  getMarkdown: vi.fn(() => ''),
  getCopyData: vi.fn(() => ({ html: '', text: '' })),
  copyAsRich: vi.fn(),
  copyAsHtml: vi.fn(),
  pasteAsPlainText: vi.fn()
}))

const lastMuyaOptions = vi.hoisted(() => ({ current: null }))
const lastMuyaInstance = vi.hoisted(() => ({ current: null }))

const MockMuya = vi.hoisted(() => {
  return class MockMuya {
    constructor(el, opts) {
      this.container = el
      // Copy all mock methods
      Object.assign(this, mockEditorInstance)
      this.container = el
      this.options = opts || {}
      mockEditorInstance.container = el
      // Store options for test inspection
      lastMuyaOptions.current = opts
      lastMuyaInstance.current = this
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

/* ── mocks ──────────────────────────────────────────────────────── */
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
  default: class { constructor() { Object.assign(this, mockPrinter) } }
}))
vi.mock('@/commands', () => ({ SpellcheckerLanguageCommand: class {} }))
vi.mock('@/spellchecker', () => ({
  SpellChecker: class {
    constructor() { return mockSpellchecker }
  }
}))
vi.mock('@/util', () => ({
  isOsx: false,
  animatedScrollTo: animatedScrollToMock
}))
vi.mock('@/util/fileSystem', () => ({
  moveImageToFolder: moveImageToFolderMock,
  moveToRelativeFolder: moveToRelativeFolderMock,
  saveImageToRelativeFolder: saveImageToRelativeFolderMock,
  resolveImageFolder: resolveImageFolderMock,
  saveImageWithFolderAccess: saveImageWithFolderAccessMock,
  uploadImage: uploadImageMock
}))
vi.mock('@/util/clipboard', () => ({ guessClipboardFilePath: vi.fn() }))
vi.mock('@tauri-apps/plugin-clipboard-manager', () => ({
  writeHtml: writeHtmlMock,
  writeText: writeTextMock,
  writeImage: writeImageMock
}))
// C-70: mocked for import preservation exactly as in editor-coverage.test.js.
vi.mock('muya/lib/utils/tableExport', async (importOriginal) => ({
  ...(await importOriginal()),
  buildTableSvg: pictureExportMock.buildTableSvg,
  resolveTableExportTable: pictureExportMock.resolveTableExportTable
}))
vi.mock('muya/lib/utils/diagramExport', async (importOriginal) => ({
  ...(await importOriginal()),
  diagramExportSvg: pictureExportMock.diagramExportSvg,
  buildStandaloneSvg: pictureExportMock.buildStandaloneSvg,
  rasterizeSvg: pictureExportMock.rasterizeSvg,
  suggestFileName: pictureExportMock.suggestFileName,
  nearestHeadingText: pictureExportMock.nearestHeadingText
}))
vi.mock('muya/lib/parser/marked', () => ({ default: markedMock }))
vi.mock('muya/lib/utils', () => ({ sanitize: sanitizeMock }))
vi.mock('muya/lib/config', () => ({
  EXPORT_DOMPURIFY_CONFIG: { FORBID_ATTR: ['contenteditable'] }
}))
vi.mock('@/util/pdf', () => ({
  getCssForOptions: getCssForOptionsMock,
  getHtmlToc: getHtmlTocMock
}))
vi.mock('@/util/theme', () => ({
  addCommonStyle: addCommonStyleMock,
  setEditorWidth: setEditorWidthMock,
  setWrapCodeBlocks: setWrapCodeBlocksMock
}))
vi.mock('@/config', () => ({
  DEFAULT_EDITOR_FONT_FAMILY: 'sans-serif'
}))

// Polyfill ResizeObserver for jsdom
globalThis.ResizeObserver = class ResizeObserver {
  constructor(cb) { this._cb = cb }
  observe() {}
  unobserve() {}
  disconnect() {}
}

const i18n = createI18n({ legacy: false, locale: 'en', messages: { en: {} } })

// Load the component once at file scope (after every vi.mock above is
// registered): the heavy editor.vue import must not eat the first test's
// 5 s budget on a loaded machine.
const EditorComponent = await import('@/components/editorWithTabs/editor.vue')

// The mt::experimental-progressive-served listener registered by the store
// (the single increment path — RECORD only emits; every window incl. the
// emitter increments on the echo).
let servedEchoHandler = null

describe('editor.vue — C-LARGE-DOC-WAVE-A T-004 progressive mount orchestration', () => {
  let pinia, editorStore, preferencesStore, layoutStore

  const seedStores = async (overrides = {}) => {
    pinia = setupTestPinia()
    const { useEditorStore } = await import('@/store/editor')
    const { usePreferencesStore } = await import('@/store/preferences')
    const { useLayoutStore } = await import('@/store/layout')
    const { useProjectStore } = await import('@/store/project')
    editorStore = useEditorStore()
    preferencesStore = usePreferencesStore()
    layoutStore = useLayoutStore()
    const projectStore = useProjectStore()

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
      previewMode: false,
      ...overrides
    }
    editorStore.tabs = [editorStore.currentFile]

    // Stub store actions (preferences actions stay REAL — the served
    // counter must run through the real RECORD/echo wiring).
    editorStore.FORMAT_LINK_CLICK = vi.fn()
    editorStore.ASK_FOR_IMAGE_AUTO_PATH = vi.fn(async () => [])
    editorStore.ASK_FOR_IMAGE_PATH = vi.fn(async () => '/path/to/img.png')
    editorStore.LISTEN_FOR_CONTENT_CHANGE = vi.fn()
    editorStore.SEARCH = vi.fn()
    editorStore.SHOW_IMAGE_DELETION_URL = vi.fn()
    editorStore.EXPORT = vi.fn()
    editorStore.SELECTION_CHANGE = vi.fn()
    editorStore.SELECTION_FORMATS = vi.fn()
    editorStore.EXIT_PREVIEW_MODE = vi.fn()
    editorStore.updateScrollPosition = vi.fn()
    editorStore.updateCursorPosition = vi.fn()
    editorStore.updateMuyaIndexCursor = vi.fn()
    editorStore.SAVE_ACTIVE_FILE_POSITION = vi.fn(async () => {})
    editorStore.copyGithubSlug = vi.fn()
    layoutStore.TOGGLE_LAYOUT_ENTRY = vi.fn()
  }

  const mountEditor = async (props = {}) => {
    return shallowMount(EditorComponent.default, {
      props: {
        markdown: '# Hello',
        cursor: null,
        textDirection: 'ltr',
        platform: 'darwin',
        ...props
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

  // Bind the real cross-window listeners and capture the served handler
  // (RECORD emits; the listener is the single increment path).
  const bindServedEcho = () => {
    preferencesStore.LISTEN_EXPERIMENTAL_PROGRESSIVE_MOUNT()
    const call = listen.mock.calls.find(([name]) => name === 'mt::experimental-progressive-served')
    servedEchoHandler = call ? call[1] : null
  }

  // Replay every recorded served emit into the captured listener exactly
  // once (simulates the emitter's own window echoing the event back).
  const flushServedEcho = () => {
    expect(servedEchoHandler).toBeTruthy()
    for (const c of emit.mock.calls) {
      if (c[0] === 'mt::experimental-progressive-served') {
        servedEchoHandler({ payload: c[1] })
      }
    }
    emit.mockClear()
  }

  // Helper to get a bus handler by event name
  const getBusHandler = (eventName) => {
    const call = busMock.on.mock.calls.find((c) => c[0] === eventName)
    return call ? call[1] : null
  }

  // Helper to get a muya marker/scroll handler by event name (the mocked
  // muya's on() records the subscriptions editor.vue makes).
  const getMuyaHandler = (eventName) => {
    const call = mockEditorInstance.on.mock.calls.find((c) => c[0] === eventName)
    return call ? call[1] : null
  }

  beforeEach(async () => {
    // Reset hoisted mock state (editor-coverage pattern).
    mockEditorInstance.on.mockReset()
    mockEditorInstance.off.mockReset()
    mockEditorInstance.destroy.mockReset()
    mockEditorInstance.setFocusMode.mockReset()
    mockEditorInstance.setFont.mockReset()
    mockEditorInstance.setOptions.mockReset()
    mockEditorInstance.setTabSize.mockReset()
    mockEditorInstance.setListIndentation.mockReset()
    mockEditorInstance.hideAllFloatTools.mockReset()
    mockEditorInstance.getSelection.mockReturnValue({ cursorCoords: { y: 100 } })
    mockEditorInstance.focus.mockReset()
    mockEditorInstance.blur.mockReset()
    mockEditorInstance.undo.mockReset()
    mockEditorInstance.redo.mockReset()
    mockEditorInstance.selectAll.mockReset()
    mockEditorInstance.hasFocus.mockReturnValue(true)
    mockEditorInstance.format.mockReset()
    mockEditorInstance.createTable.mockReset()
    mockEditorInstance.setMarkdown.mockReset()
    mockEditorInstance.setCursor.mockReset()
    mockEditorInstance.clearHistory.mockReset()
    mockEditorInstance.setHistory.mockReset()
    mockEditorInstance.updateParagraph.mockReset()
    mockEditorInstance.duplicate.mockReset()
    mockEditorInstance.insertParagraph.mockReset()
    mockEditorInstance.deleteParagraph.mockReset()
    mockEditorInstance.insertImage.mockReset()
    mockEditorInstance.search.mockReturnValue({ index: 0, matches: 1 })
    mockEditorInstance.replace.mockReturnValue({ index: 0, matches: 1 })
    mockEditorInstance.find.mockReturnValue({ index: 0, matches: 1 })
    mockEditorInstance.invalidateImageCache.mockReset()
    mockEditorInstance._replaceCurrentWordInlineUnsafe.mockReset()
    mockEditorInstance.exportStyledHTML.mockResolvedValue('<html></html>')
    mockEditorInstance.getTOC.mockReturnValue([])
    mockEditorInstance.getMarkdown.mockReset().mockReturnValue('')
    mockEditorInstance.getCopyData.mockReset().mockReturnValue({ html: '', text: '' })
    mockEditorInstance.copyAsRich.mockReset()
    mockEditorInstance.copyAsHtml.mockReset()
    mockEditorInstance.pasteAsPlainText.mockReset()
    // T-004: progressive surface — fresh entry point, fresh prefetch mount,
    // info() back to "no session".
    mockEditorInstance.progressiveMount.mockReset()
    mockEditorInstance.mountToBlockKey.mockReset()
    progressiveInfoMock.mockReset().mockReturnValue(null)
    mockEditorInstance.contentState.blocks = undefined

    writeHtmlMock.mockReset().mockResolvedValue(undefined)
    markedMock.mockClear().mockImplementation((text) => `<p>${text}</p>`)
    sanitizeMock.mockClear().mockImplementation((html) => `clean:${html}`)

    busMock.on.mockReset()
    busMock.off.mockReset()
    busMock.emit.mockReset()
    noticeMock.notify.mockReset()
    logMock.error.mockReset()
    animatedScrollToMock.mockReset()
    setEditorWidthMock.mockReset()
    setWrapCodeBlocksMock.mockReset()
    addCommonStyleMock.mockReset()
    moveImageToFolderMock.mockReset()
    moveToRelativeFolderMock.mockReset()
    saveImageToRelativeFolderMock.mockReset()
    resolveImageFolderMock.mockReset()
    resolveImageFolderMock.mockImplementation((p) => p || '/userdata/images')
    saveImageWithFolderAccessMock.mockReset()
    saveImageWithFolderAccessMock.mockImplementation((opts) => opts.save())
    uploadImageMock.mockReset()
    mockPrinter.renderMarkdown.mockReset()
    mockPrinter.clearup.mockReset()
    mockSpellchecker.activateSpellchecker.mockReset()
    mockSpellchecker.deactivateSpellchecker.mockReset()
    mockSpellchecker.switchLanguage.mockReset().mockResolvedValue('en')
    mockSpellchecker.isEnabled = false

    // The tauri event mock must keep its factory implementations for the
    // store's un-awaited listen() and RECORD's emit().catch() wiring.
    listen.mockReset().mockImplementation(async () => () => {})
    emit.mockReset().mockImplementation(async () => undefined)
    servedEchoHandler = null

    await seedStores()
  })

  /* ── open-path routing (R-4) ─────────────────────────────────── */

  it('toggle ON: plain opens (boot hydration and file-loaded) mount progressively, never through setMarkdown, and BLOCK_MOUNT_SERVED progressive increments the session counter', async () => {
    preferencesStore.experimentalProgressiveMount = true
    bindServedEcho()
    const wrapper = await mountEditor({ markdown: '# Hello' })

    // The boot hydration itself is a plain open with the toggle ON: it
    // routes through progressiveMount (the marker subscriptions are
    // registered BEFORE the hydration so boot opens count too).
    expect(mockEditorInstance.progressiveMount).toHaveBeenCalledWith('# Hello')
    expect(mockEditorInstance.setMarkdown).not.toHaveBeenCalled()
    // info() reports no session → no tail-pending indication at boot.
    await nextTick()
    expect(wrapper.classes()).not.toContain('ag-tail-pending')

    // A fresh plain open (file-loaded, no cursor) through the same gate.
    mockEditorInstance.progressiveMount.mockClear()
    progressiveInfoMock.mockReturnValue({ status: 'tailing', mountedThrough: 5 })
    getBusHandler('file-loaded')({ id: 'tab-1', markdown: '# Fresh plain open' })
    expect(mockEditorInstance.progressiveMount).toHaveBeenCalledWith('# Fresh plain open')
    expect(mockEditorInstance.setMarkdown).not.toHaveBeenCalled()
    await nextTick()
    expect(wrapper.classes()).toContain('ag-tail-pending')

    // The served marker feeds the store counter through the real
    // RECORD action and the echo listener.
    getMuyaHandler('BLOCK_MOUNT_SERVED')({ served: 'progressive' })
    flushServedEcho()
    expect(preferencesStore.progressiveMountServedProgressiveCount).toBe(1)
    expect(preferencesStore.progressiveMountServedLegacyCount).toBe(0)

    wrapper.unmount()
  })

  it('toggle OFF: plain opens keep the legacy setMarkdown path and BLOCK_MOUNT_SERVED legacy counts legacy', async () => {
    bindServedEcho()
    const wrapper = await mountEditor()

    // Boot hydration without the toggle: legacy restore semantics.
    expect(mockEditorInstance.setMarkdown).toHaveBeenCalled()
    expect(mockEditorInstance.progressiveMount).not.toHaveBeenCalled()

    mockEditorInstance.setMarkdown.mockClear()
    getBusHandler('file-loaded')({ id: 'tab-1', markdown: '# Legacy open' })
    expect(mockEditorInstance.setMarkdown).toHaveBeenCalledWith('# Legacy open')
    expect(mockEditorInstance.progressiveMount).not.toHaveBeenCalled()

    getMuyaHandler('BLOCK_MOUNT_SERVED')({ served: 'legacy' })
    flushServedEcho()
    expect(preferencesStore.progressiveMountServedLegacyCount).toBe(1)
    expect(preferencesStore.progressiveMountServedProgressiveCount).toBe(0)
    // No tail pending on the legacy path.
    await nextTick()
    expect(wrapper.classes()).not.toContain('ag-tail-pending')

    wrapper.unmount()
  })

  it('mirror pane: plain opens stay legacy even with the toggle ON and the served marker never counts', async () => {
    preferencesStore.experimentalProgressiveMount = true
    bindServedEcho()
    const wrapper = await mountEditor({ mirror: true })

    expect(mockEditorInstance.setMarkdown).toHaveBeenCalled()
    expect(mockEditorInstance.progressiveMount).not.toHaveBeenCalled()
    // The reserved-space indication is mirror-suppressed even if a tail
    // were somehow pending.
    progressiveInfoMock.mockReturnValue({ status: 'tailing', mountedThrough: 5 })
    getMuyaHandler('BLOCK_SYNC_REGION_DONE')({ blocks: 5 })
    await nextTick()
    expect(wrapper.classes()).not.toContain('ag-tail-pending')

    // The mirror never counts opens (views of an already-open document).
    mockEditorInstance.setMarkdown.mockClear()
    getBusHandler('file-changed')({ id: 'tab-1', markdown: '# Mirror open' })
    expect(mockEditorInstance.setMarkdown).toHaveBeenCalled()
    expect(mockEditorInstance.progressiveMount).not.toHaveBeenCalled()
    getMuyaHandler('BLOCK_MOUNT_SERVED')({ served: 'progressive' })
    expect(emit).not.toHaveBeenCalledWith(
      'mt::experimental-progressive-served',
      expect.anything()
    )
    flushServedEcho()
    expect(preferencesStore.progressiveMountServedProgressiveCount).toBe(0)

    wrapper.unmount()
  })

  /* ── tail-pending indication (R-2) ───────────────────────────── */

  it('ag-tail-pending tracks info(): set on a tailing open, kept through BLOCK_SYNC_REGION_DONE, cleared by BLOCK_TAIL_MOUNT_DONE', async () => {
    preferencesStore.experimentalProgressiveMount = true
    const wrapper = await mountEditor()

    progressiveInfoMock.mockReturnValue({ status: 'tailing', mountedThrough: 5 })
    getBusHandler('file-changed')({ id: 'tab-1', markdown: '# Plain change' })
    await nextTick()
    expect(wrapper.classes()).toContain('ag-tail-pending')

    // A sync-region marker while still tailing keeps the indication.
    getMuyaHandler('BLOCK_SYNC_REGION_DONE')({ blocks: 50 })
    await nextTick()
    expect(wrapper.classes()).toContain('ag-tail-pending')

    // Tail completion clears it.
    progressiveInfoMock.mockReturnValue({ status: 'done', mountedThrough: 500 })
    getMuyaHandler('BLOCK_TAIL_MOUNT_DONE')({ blocks: 500, ms: 42 })
    await nextTick()
    expect(wrapper.classes()).not.toContain('ag-tail-pending')

    // info() with no session at all (old muya / destroyed controller)
    // never raises the flag.
    progressiveInfoMock.mockReturnValue(null)
    getMuyaHandler('BLOCK_SYNC_REGION_DONE')({ blocks: 50 })
    await nextTick()
    expect(wrapper.classes()).not.toContain('ag-tail-pending')

    wrapper.unmount()
  })

  it('ag-tail-pending clears after a mid-tail fallback (BLOCK_MOUNT_SERVED served=legacy while tailing)', async () => {
    preferencesStore.experimentalProgressiveMount = true
    bindServedEcho()
    const wrapper = await mountEditor()

    progressiveInfoMock.mockReturnValue({ status: 'tailing', mountedThrough: 5 })
    getBusHandler('file-changed')({ id: 'tab-1', markdown: '# Plain change' })
    await nextTick()
    expect(wrapper.classes()).toContain('ag-tail-pending')

    // The controller fell back mid-tail: served=legacy arrives and info()
    // now reports the fallback — the marker refresh drops the indication
    // and still counts the legacy serve.
    progressiveInfoMock.mockReturnValue({ status: 'fallback', mountedThrough: 0 })
    getMuyaHandler('BLOCK_MOUNT_SERVED')({ served: 'legacy' })
    await nextTick()
    expect(wrapper.classes()).not.toContain('ag-tail-pending')
    flushServedEcho()
    expect(preferencesStore.progressiveMountServedLegacyCount).toBe(1)

    wrapper.unmount()
  })

  it('the pending flag survives a reactive re-render and is dropped by a legacy setMarkdown replacement (cancellation wiring)', async () => {
    preferencesStore.experimentalProgressiveMount = true
    const wrapper = await mountEditor()

    progressiveInfoMock.mockReturnValue({ status: 'tailing', mountedThrough: 5 })
    getBusHandler('file-changed')({ id: 'tab-1', markdown: '# Plain change' })
    await nextTick()
    expect(wrapper.classes()).toContain('ag-tail-pending')

    // Re-render through a template-bound reactive pref (the :style
    // lineHeight binding) — the indication must survive it.
    preferencesStore.lineHeight = 2.4
    await nextTick()
    await nextTick()
    expect(wrapper.classes()).toContain('ag-tail-pending')

    // A legacy setMarkdown replacement cancels the pending tail (the
    // T-003 setMarkdown wiring) — the post-load refresh reads the now-
    // cancelled controller and drops the indication.
    progressiveInfoMock.mockReturnValue({ status: 'cancelled', mountedThrough: 0 })
    const cursor = { line: 2, ch: 0 }
    getBusHandler('file-changed')({ id: 'tab-1', markdown: '# Replacement', cursor })
    await nextTick()
    expect(mockEditorInstance.setMarkdown).toHaveBeenCalledWith(
      '# Replacement', cursor, undefined, undefined, undefined
    )
    expect(wrapper.classes()).not.toContain('ag-tail-pending')

    wrapper.unmount()
  })

  /* ── scroll-driven prefetch (R-2) ────────────────────────────── */

  it('scroll prefetch mounts ~3 viewports ahead through mountToBlockKey and throttles repeat scrolls', async () => {
    preferencesStore.experimentalProgressiveMount = true
    const wrapper = await mountEditor()

    // Script the mounted surface: one mounted child of height 1000 in the
    // container (root.offsetHeight / children → average block height),
    // clientHeight 500, 20 parsed blocks (contentState.blocks, keys only).
    const container = mockEditorInstance.container
    const root = document.createElement('div')
    root.appendChild(document.createElement('p'))
    container.appendChild(root)
    Object.defineProperty(root, 'offsetHeight', { value: 1000, configurable: true })
    Object.defineProperty(container, 'clientHeight', { value: 500, configurable: true })
    mockEditorInstance.contentState.blocks = Array.from({ length: 20 }, (_, i) => ({ key: `b${i}` }))

    progressiveInfoMock.mockReturnValue({ status: 'tailing', mountedThrough: 2 })
    getBusHandler('file-changed')({ id: 'tab-1', markdown: '# Scroll doc' })
    container.scrollTop = 0
    await nextTick()
    expect(wrapper.classes()).toContain('ag-tail-pending')

    const scrollHandler = getMuyaHandler('scroll')
    expect(scrollHandler).toBeTruthy()
    scrollHandler({ scrollTop: 0 })

    // viewportBottom(500) + 3 viewports(1500) at 1000px/block → block 2.
    expect(mockEditorInstance.mountToBlockKey).toHaveBeenCalledTimes(1)
    expect(mockEditorInstance.mountToBlockKey).toHaveBeenCalledWith('b2')
    // While pending, the explicit animated cursor scroll stays gated.
    await nextTick()
    expect(animatedScrollToMock).not.toHaveBeenCalled()

    // An immediate second scroll is throttled (150 ms) — no second mount.
    scrollHandler({ scrollTop: 20 })
    expect(mockEditorInstance.mountToBlockKey).toHaveBeenCalledTimes(1)
    // The scroll handler still reports the scroll position to the store.
    expect(editorStore.updateScrollPosition).toHaveBeenCalledWith('tab-1', 0)

    wrapper.unmount()
  })

  it('scroll prefetch self-heals when info() no longer reports tailing (no mount, flag cleared)', async () => {
    preferencesStore.experimentalProgressiveMount = true
    const wrapper = await mountEditor()

    progressiveInfoMock.mockReturnValue({ status: 'tailing', mountedThrough: 2 })
    getBusHandler('file-changed')({ id: 'tab-1', markdown: '# Scroll doc' })
    await nextTick()
    expect(wrapper.classes()).toContain('ag-tail-pending')

    // The tail finished between the open and the scroll event: the
    // handler drops the stale flag and does nothing else.
    progressiveInfoMock.mockReturnValue({ status: 'done', mountedThrough: 20 })
    const scrollHandler = getMuyaHandler('scroll')
    scrollHandler({ scrollTop: 100 })
    expect(mockEditorInstance.mountToBlockKey).not.toHaveBeenCalled()
    await nextTick()
    expect(wrapper.classes()).not.toContain('ag-tail-pending')

    wrapper.unmount()
  })

  it('scroll prefetch is a no-op when the tail already covers the target block', async () => {
    preferencesStore.experimentalProgressiveMount = true
    const wrapper = await mountEditor()

    const container = mockEditorInstance.container
    const root = document.createElement('div')
    root.appendChild(document.createElement('p'))
    container.appendChild(root)
    Object.defineProperty(root, 'offsetHeight', { value: 1000, configurable: true })
    Object.defineProperty(container, 'clientHeight', { value: 500, configurable: true })
    mockEditorInstance.contentState.blocks = Array.from({ length: 20 }, (_, i) => ({ key: `b${i}` }))

    // mountedThrough past the ~3-viewport target (block 2): nothing to do.
    progressiveInfoMock.mockReturnValue({ status: 'tailing', mountedThrough: 20 })
    getBusHandler('file-changed')({ id: 'tab-1', markdown: '# Scroll doc' })
    container.scrollTop = 0
    await nextTick()

    getMuyaHandler('scroll')({ scrollTop: 0 })
    expect(mockEditorInstance.mountToBlockKey).not.toHaveBeenCalled()
    // Still tailing → the indication itself stays.
    expect(wrapper.classes()).toContain('ag-tail-pending')

    wrapper.unmount()
  })

  /* ── restored opens stay legacy ──────────────────────────────── */

  it('restored opens stay legacy with the toggle ON: cursor, blocks cache, muyaIndexCursor, non-empty history; an empty history stack still routes progressively', async () => {
    preferencesStore.experimentalProgressiveMount = true
    const wrapper = await mountEditor()
    // The boot hydration already routed progressively — reset the calls.
    mockEditorInstance.progressiveMount.mockClear()
    mockEditorInstance.setMarkdown.mockClear()

    // file-loaded with a cursor to restore: legacy restore semantics.
    const cursor = { line: 3, ch: 2 }
    getBusHandler('file-loaded')({ id: 'tab-1', markdown: '# Cursor restore', cursor })
    expect(mockEditorInstance.setMarkdown).toHaveBeenCalledWith('# Cursor restore', cursor, true)
    expect(mockEditorInstance.progressiveMount).not.toHaveBeenCalled()

    // file-changed with a blocks cache: legacy.
    const blocks = [{ key: 'k0' }, { key: 'k1' }]
    getBusHandler('file-changed')({ id: 'tab-1', markdown: '# Blocks restore', blocks })
    expect(mockEditorInstance.setMarkdown).toHaveBeenCalledWith(
      '# Blocks restore', undefined, undefined, undefined, blocks
    )
    expect(mockEditorInstance.progressiveMount).not.toHaveBeenCalled()

    // file-changed with a muyaIndexCursor position restore: legacy.
    const muyaIndexCursor = { anchor: { key: 'a' }, focus: { key: 'f' } }
    getBusHandler('file-changed')({ id: 'tab-1', markdown: '# Index restore', muyaIndexCursor })
    expect(mockEditorInstance.setMarkdown).toHaveBeenCalledWith(
      '# Index restore', undefined, undefined, muyaIndexCursor, undefined
    )
    expect(mockEditorInstance.progressiveMount).not.toHaveBeenCalled()

    // A real undo history references old block keys: legacy render-only restore
    // must not append a cursor import snapshot to that cached history.
    const history = { stack: [{ type: 'insert' }] }
    getBusHandler('file-changed')({ id: 'tab-1', markdown: '# History restore', history })
    expect(mockEditorInstance.setMarkdown).toHaveBeenCalledWith(
      '# History restore', undefined, undefined, undefined, undefined, { renderOnly: true }
    )
    expect(mockEditorInstance.progressiveMount).not.toHaveBeenCalled()

    // Boundary: an EMPTY history stack carries no stale keys — plain
    // content still mounts progressively.
    getBusHandler('file-changed')({ id: 'tab-1', markdown: '# Empty history', history: { stack: [] } })
    expect(mockEditorInstance.progressiveMount).toHaveBeenCalledWith('# Empty history')

    wrapper.unmount()
  })

  /* ── entry belt + unsubscribe identity ───────────────────────── */

  it('a throwing progressiveMount entry falls back to setMarkdown (BLOCK_PROGRESSIVE_ENTRY_FAILED belt)', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      preferencesStore.experimentalProgressiveMount = true
      const wrapper = await mountEditor()

      mockEditorInstance.progressiveMount.mockImplementation(() => {
        throw new Error('entry broken')
      })
      getBusHandler('file-loaded')({ id: 'tab-1', markdown: '# Belt' })
      expect(warnSpy).toHaveBeenCalledWith(
        '[Editor][progressive][BLOCK_PROGRESSIVE_ENTRY_FAILED]',
        expect.any(Error)
      )
      // A broken entry must never leave a blank editor.
      expect(mockEditorInstance.setMarkdown).toHaveBeenCalledWith('# Belt')

      wrapper.unmount()
    } finally {
      warnSpy.mockRestore()
    }
  })

  it('a missing progressiveMount entry is a silent no-op (no crash, no legacy rewrite)', async () => {
    preferencesStore.experimentalProgressiveMount = true
    const wrapper = await mountEditor()
    // The T-004 guard: an entry-less muya must not break the open path.
    delete lastMuyaInstance.current.progressiveMount

    getBusHandler('file-loaded')({ id: 'tab-1', markdown: '# Entry-less' })
    expect(mockEditorInstance.setMarkdown).not.toHaveBeenCalled()

    wrapper.unmount()
  })

  it('unmount unsubscribes the three open-path markers by the same handler identities', async () => {
    preferencesStore.experimentalProgressiveMount = true
    const wrapper = await mountEditor()

    const served = getMuyaHandler('BLOCK_MOUNT_SERVED')
    const syncDone = getMuyaHandler('BLOCK_SYNC_REGION_DONE')
    const tailDone = getMuyaHandler('BLOCK_TAIL_MOUNT_DONE')
    expect(served).toBeTruthy()
    expect(syncDone).toBeTruthy()
    expect(tailDone).toBeTruthy()

    wrapper.unmount()
    // muya's unsubscribe matches on function identity — the off() calls
    // must carry the exact subscription references.
    const offName = (name) => mockEditorInstance.off.mock.calls.find((c) => c[0] === name)
    expect(offName('BLOCK_MOUNT_SERVED')[1]).toBe(served)
    expect(offName('BLOCK_SYNC_REGION_DONE')[1]).toBe(syncDone)
    expect(offName('BLOCK_TAIL_MOUNT_DONE')[1]).toBe(tailDone)
  })
})
