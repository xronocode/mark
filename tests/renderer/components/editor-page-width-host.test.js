// FILE: tests/renderer/components/editor-page-width-host.test.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Pin the C-PAGE-WIDTH-TABLES host wiring in editorWithTabs/editor.vue — the open/tab-switch funnel that resolves the active document's pageWidths entry through the width pipeline onto the single inline --editorAreaWidth property, the entry-less/untitled clear back to the global tier, the canvas-change re-applies (window resize from the cache with one property write + one trailing re-read; sidebar show/drag commits), the R-4 pinned themeOverride application to the document surface (apply, restore on switch/unmount, global cycle re-assert), the panel's mt::document-page-state-changed announcement, the editorLineWidth re-read, and the mirror-pane opt-out.
//   SCOPE: editor.vue START_BLOCK_PAGE_WIDTH_HOST only (the pipeline/store maths are pinned in page-width.test.js / page-width-store.test.js, the rename move in store/editor-page-width.test.js).
//   DEPENDS: Vue Test Utils, Vitest, Pinia test setup, the editor-coverage mock pattern (mocked Muya, bus, theme module with an addThemeStyle spy), util/pageWidthStore mocked with a scripted loadPageWidthFor, the REAL util/pageWidth pipeline (the box arithmetic is asserted for real).
//   LINKS: .grace/changes/archive/C-PAGE-WIDTH-TABLES (plan T-002/T-005, corners C-1/C-2/C-3, R-4); util/pageWidth.js; util/pageWidthStore.js; util/theme.js; components/editorWithTabs/editor.vue START_BLOCK_PAGE_WIDTH_HOST.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   EditorComponent - the editor.vue component loaded once at file scope (after all mocks register).
//   HOST_FRESHEN_DELAY - the host's trailing re-read delay (mirrors editor.vue HOST_WIDTH_FRESHEN_DELAY_MS).
//   MockMuya - mocked Muya class (editor-coverage pattern) with the progressive surface editor.vue touches.
//   addCommonStyleMock - GRACE 4 synchronized symbol
//   addThemeStyleMock - the pinned-theme application spy (GRACE 4 synchronized symbol).
//   animatedScrollToMock - GRACE 4 synchronized symbol
//   appliedWidth - reads the inline --editorAreaWidth custom property off the document root.
//   busMock - GRACE 4 synchronized symbol
//   getCssForOptionsMock - GRACE 4 synchronized symbol
//   getHtmlTocMock - GRACE 4 synchronized symbol
//   i18n - the vue-i18n instance the component mounts with.
//   loadPageWidthForMock - the scripted per-document entry source (GRACE 4 synchronized symbol).
//   loadTableLayoutsForMock - GRACE 4 synchronized symbol
//   logMock - GRACE 4 synchronized symbol
//   makeTab - active-tab fixture factory ({ id, pathname, ... } with defaults).
//   markedMock - GRACE 4 synchronized symbol
//   mockEditorInstance - Muya mock; setOptions records the diagram classification.
//   mockPrinter - GRACE 4 synchronized symbol
//   mockSpellchecker - GRACE 4 synchronized symbol
//   moveImageToFolderMock - GRACE 4 synchronized symbol
//   noticeMock - GRACE 4 synchronized symbol
//   pictureExportMock - C-70 stubbed muya table/diagram export helpers (import-preservation only here)
//   progressiveInfoMock - the muya.progressive.info() mock (the hydration path probes it).
//   resolveImageFolderMock - C-24 global image folder resolver mock
//   sanitizeMock - GRACE 4 synchronized symbol
//   saveImageToRelativeFolderMock - C-24 relative-folder image save mock
//   saveImageWithFolderAccessMock - C-24 sandbox folder-access wrapper mock
//   saveTableLayoutsForMock - GRACE 4 synchronized symbol
//   setEditorWidthMock - GRACE 4 synchronized symbol
//   setWrapCodeBlocksMock - GRACE 4 synchronized symbol
//   uploadImageMock - GRACE 4 synchronized symbol
//   writeHtmlMock - GRACE 4 synchronized symbol
//   writeImageMock - C-70 clipboard writeImage mock
//   writeTextMock - GRACE 4 synchronized symbol
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - 2026-11-03 C-PAGE-WIDTH-TABLES host wiring: new —
//   the editor.vue page-width host block (open/switch funnel, clear
//   semantics, canvas re-applies, pinned theme application/restore/
//   re-assert, panel announcement, mirror opt-out).
// END_CHANGE_SUMMARY

import { shallowMount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'
import { setupTestPinia } from '../pinia'
import { createI18n } from 'vue-i18n'
import { applyEditorWidth, clearAppliedEditorWidth, getLastAppliedEditorWidth } from '@/util/pageWidth'

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
const addThemeStyleMock = vi.hoisted(() => vi.fn())
const loadPageWidthForMock = vi.hoisted(() => vi.fn(async () => null))
const loadTableLayoutsForMock = vi.hoisted(() => vi.fn(async () => ({})))
const saveTableLayoutsForMock = vi.hoisted(() => vi.fn(async () => true))
const moveImageToFolderMock = vi.hoisted(() => vi.fn())
const saveImageToRelativeFolderMock = vi.hoisted(() => vi.fn())
const resolveImageFolderMock = vi.hoisted(() => vi.fn())
const saveImageWithFolderAccessMock = vi.hoisted(() => vi.fn())
const uploadImageMock = vi.hoisted(() => vi.fn())
const getCssForOptionsMock = vi.hoisted(() => vi.fn(async () => ''))
const getHtmlTocMock = vi.hoisted(() => vi.fn(() => ''))
const writeHtmlMock = vi.hoisted(() => vi.fn(async () => undefined))
const writeTextMock = vi.hoisted(() => vi.fn(async () => undefined))
const writeImageMock = vi.hoisted(() => vi.fn(async () => undefined))
const markedMock = vi.hoisted(() => vi.fn((text) => `<p>${text}</p>`))
const sanitizeMock = vi.hoisted(() => vi.fn((html) => `clean:${html}`))
const pictureExportMock = vi.hoisted(() => ({
  buildTableSvg: vi.fn(),
  resolveTableExportTable: vi.fn(),
  diagramExportSvg: vi.fn(),
  buildStandaloneSvg: vi.fn(),
  rasterizeSvg: vi.fn(),
  suggestFileName: vi.fn(),
  nearestHeadingText: vi.fn()
}))

const progressiveInfoMock = vi.hoisted(() => vi.fn(() => null))

const mockEditorInstance = vi.hoisted(() => ({
  container: null,
  contentState: { getBlocks: vi.fn(() => []), selectedTableCells: false, getMuyaIndexCursor: vi.fn(() => null) },
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

const MockMuya = vi.hoisted(() => {
  return class MockMuya {
    constructor(el, opts) {
      this.container = el
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

/* ── mocks ──────────────────────────────────────────────────────── */
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
vi.mock('muya/lib/ui/blockViewer', () => ({ default: {} }))
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
  addThemeStyle: addThemeStyleMock,
  setEditorWidth: setEditorWidthMock,
  setWrapCodeBlocks: setWrapCodeBlocksMock
}))
// The per-document store is scripted; the pipeline (util/pageWidth) and the
// Auto-theme resolver stay REAL so the box arithmetic is asserted for real.
vi.mock('@/util/pageWidthStore', () => ({
  loadPageWidthFor: loadPageWidthForMock,
  movePageWidthEntry: vi.fn(async () => true)
}))
vi.mock('@/util/tableLayoutStore', () => ({
  loadTableLayoutsFor: loadTableLayoutsForMock,
  saveTableLayoutsFor: saveTableLayoutsForMock,
  moveTableLayoutsEntry: vi.fn(async () => true)
}))
vi.mock('@/config', () => ({
  DEFAULT_EDITOR_FONT_FAMILY: 'sans-serif'
}))
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(async () => () => {}),
  emit: vi.fn(async () => undefined)
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

// The host's trailing re-read delay (mirror of editor.vue's constant).
const HOST_FRESHEN_DELAY = 150

// jsdom's default viewport is 1024 — the canvas all box assertions ride.
const appliedWidth = () =>
  document.documentElement.style.getPropertyValue('--editorAreaWidth')

const makeTab = (overrides = {}) => ({
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
})

describe('editor.vue — C-PAGE-WIDTH-TABLES host wiring', () => {
  let pinia, editorStore, preferencesStore, layoutStore, projectStore
  let wrapper = null
  let innerWidthOverride = null

  const seedStores = async () => {
    pinia = setupTestPinia()
    const { useEditorStore } = await import('@/store/editor')
    const { usePreferencesStore } = await import('@/store/preferences')
    const { useLayoutStore } = await import('@/store/layout')
    const { useProjectStore } = await import('@/store/project')
    editorStore = useEditorStore()
    preferencesStore = usePreferencesStore()
    layoutStore = useLayoutStore()
    projectStore = useProjectStore()

    const tab = makeTab()
    editorStore.currentFile = tab
    editorStore.tabs = [tab]

    // Stub the store actions the render handlers touch (the harness set).
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
    wrapper = shallowMount(EditorComponent.default, {
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
    await flushPromises()
    return wrapper
  }

  const getBusHandler = (eventName) => {
    const call = busMock.on.mock.calls.find((c) => c[0] === eventName)
    return call ? call[1] : null
  }

  const setWindowWidth = (px) => {
    innerWidthOverride = px
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: px })
    window.dispatchEvent(new Event('resize'))
  }

  beforeEach(async () => {
    mockEditorInstance.on.mockReset()
    mockEditorInstance.off.mockReset()
    mockEditorInstance.setOptions.mockReset()
    mockEditorInstance.setMarkdown.mockReset()
    mockEditorInstance.setCursor.mockReset()
    mockEditorInstance.clearHistory.mockReset()
    mockEditorInstance.setHistory.mockReset()
    mockEditorInstance.destroy.mockReset()
    progressiveInfoMock.mockReset().mockReturnValue(null)
    busMock.on.mockReset()
    busMock.off.mockReset()
    busMock.emit.mockReset()
    addThemeStyleMock.mockReset()
    setEditorWidthMock.mockReset()
    setWrapCodeBlocksMock.mockReset()
    addCommonStyleMock.mockReset()
    loadTableLayoutsForMock.mockReset().mockResolvedValue({})
    saveTableLayoutsForMock.mockReset().mockResolvedValue(true)
    loadPageWidthForMock.mockReset().mockResolvedValue(null)
    noticeMock.notify.mockReset()
    // The REAL pipeline module remembers its last applied value across
    // tests — clear it and any inline property left on the root.
    clearAppliedEditorWidth()
    document.documentElement.style.removeProperty('--editorAreaWidth')
    await seedStores()
  })

  afterEach(() => {
    if (wrapper) {
      wrapper.unmount()
      wrapper = null
    }
    // jsdom owns window.innerWidth as an own accessor — deleting it leaves
    // a 0-canvas for every later test; restore the default instead.
    if (innerWidthOverride !== null) {
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1024 })
      innerWidthOverride = null
    }
    vi.useRealTimers()
    document.documentElement.style.removeProperty('--editorAreaWidth')
  })

  /* ── open / switch funnel ─────────────────────────────────────── */

  it('a stored per-document width applies through the pipeline on open (80ch → 850px box)', async () => {
    loadPageWidthForMock.mockResolvedValue({ value: 80, unit: 'ch', themeOverride: null, savedAt: 1 })
    await mountEditor()
    // jsdom canvas 1024: 80ch = 750px setting, maxColumn 924, box 850.
    expect(appliedWidth()).toBe('850px')
    expect(getLastAppliedEditorWidth()).toMatchObject({ boxPx: 850, source: 'document' })
    expect(loadPageWidthForMock).toHaveBeenCalledWith('/tmp/test.md')
  })

  it('a document without an entry clears the pipeline variable — the legacy writer owns the global tier', async () => {
    // Simulate the previous document's pipeline value being on the root.
    applyEditorWidth({ boxPx: 850, source: 'document' })
    expect(appliedWidth()).toBe('850px')
    await mountEditor()
    expect(loadPageWidthForMock).toHaveBeenCalledWith('/tmp/test.md')
    expect(appliedWidth()).toBe('')
    expect(getLastAppliedEditorWidth()).toBeNull()
  })

  it('untitled documents never consult the store and stay on the global tier', async () => {
    editorStore.currentFile = makeTab({ id: 'tab-u', pathname: '' })
    editorStore.tabs = [editorStore.currentFile]
    applyEditorWidth({ boxPx: 850, source: 'document' })
    await mountEditor({ markdown: '# Untitled' })
    expect(loadPageWidthForMock).not.toHaveBeenCalled()
    expect(appliedWidth()).toBe('')
  })

  it('a tab switch applies the next document\'s width', async () => {
    loadPageWidthForMock.mockImplementation(async (pathname) => {
      if (pathname === '/tmp/a.md') return { value: 80, unit: 'ch', savedAt: 1 }
      if (pathname === '/tmp/b.md') return { value: 50, unit: '%', savedAt: 2 }
      return null
    })
    editorStore.currentFile = makeTab({ id: 'tab-a', pathname: '/tmp/a.md' })
    editorStore.tabs = [editorStore.currentFile]
    await mountEditor({ markdown: '# A' })
    expect(appliedWidth()).toBe('850px')
    editorStore.currentFile = makeTab({ id: 'tab-b', pathname: '/tmp/b.md' })
    editorStore.tabs.push(editorStore.currentFile)
    await flushPromises()
    await nextTick()
    // 50% of canvas 1024 = 512px column, box 612.
    expect(appliedWidth()).toBe('612px')
  })

  it('a slow entry load landing after a tab switch is dropped (seq guard)', async () => {
    let resolveA
    loadPageWidthForMock.mockImplementation(async (pathname) => {
      if (pathname === '/tmp/a.md') {
        return new Promise((resolve) => { resolveA = resolve })
      }
      if (pathname === '/tmp/b.md') return { value: 50, unit: '%', savedAt: 2 }
      return null
    })
    editorStore.currentFile = makeTab({ id: 'tab-a', pathname: '/tmp/a.md' })
    editorStore.tabs = [editorStore.currentFile]
    await mountEditor({ markdown: '# A' })
    expect(appliedWidth()).toBe('')
    editorStore.currentFile = makeTab({ id: 'tab-b', pathname: '/tmp/b.md' })
    editorStore.tabs.push(editorStore.currentFile)
    await flushPromises()
    expect(appliedWidth()).toBe('612px')
    // The late A load must not paint A's width over B.
    resolveA({ value: 80, unit: 'ch', savedAt: 1 })
    await flushPromises()
    await nextTick()
    expect(appliedWidth()).toBe('612px')
  })

  /* ── canvas re-applies (corner C-3) ───────────────────────────── */

  it('a window resize re-applies from the cache with one property write, then one trailing re-read', async () => {
    vi.useFakeTimers()
    loadPageWidthForMock.mockResolvedValue({ value: 100, unit: '%', savedAt: 1 })
    await mountEditor()
    // 100% of canvas 1024 clamps to canvas − indent: box 1024.
    expect(appliedWidth()).toBe('1024px')
    const setPropertySpy = vi.spyOn(document.documentElement.style, 'setProperty')
    setWindowWidth(800)
    await vi.advanceTimersByTimeAsync(0)
    // One custom-property write per relayout event — never a re-render.
    const widthWrites = setPropertySpy.mock.calls.filter((c) => c[0] === '--editorAreaWidth')
    expect(widthWrites).toHaveLength(1)
    expect(appliedWidth()).toBe('800px')
    const readsBefore = loadPageWidthForMock.mock.calls.length
    await vi.advanceTimersByTimeAsync(HOST_FRESHEN_DELAY)
    expect(loadPageWidthForMock.mock.calls.length).toBeGreaterThan(readsBefore)
    setPropertySpy.mockRestore()
  })

  it('a sidebar show/drag commit re-applies the clamped box', async () => {
    loadPageWidthForMock.mockResolvedValue({ value: 100, unit: '%', savedAt: 1 })
    await mountEditor()
    expect(appliedWidth()).toBe('1024px')
    layoutStore.showSideBar = true
    layoutStore.sideBarWidth = 280
    await flushPromises()
    await nextTick()
    // canvas 744 → box 744.
    expect(appliedWidth()).toBe('744px')
  })

  it('an editorLineWidth change re-reads the document tier (panel global-write freshness)', async () => {
    vi.useFakeTimers()
    loadPageWidthForMock.mockResolvedValue({ value: 80, unit: 'ch', savedAt: 1 })
    await mountEditor()
    expect(appliedWidth()).toBe('850px')
    // The panel's global write deleted the entry and moved the setting.
    loadPageWidthForMock.mockResolvedValue(null)
    preferencesStore.editorLineWidth = '700px'
    await vi.advanceTimersByTimeAsync(HOST_FRESHEN_DELAY)
    expect(appliedWidth()).toBe('')
    vi.useRealTimers()
  })

  /* ── R-4 pinned per-document theme ────────────────────────────── */

  it('a pinned themeOverride applies to the surface on open; switching to an unpinned document restores the global theme', async () => {
    preferencesStore.followSystemTheme = false
    preferencesStore.theme = 'paper'
    loadPageWidthForMock.mockImplementation(async (pathname) => {
      if (pathname === '/tmp/pinned.md') {
        return { value: 80, unit: 'ch', themeOverride: 'graphite-dark', savedAt: 1 }
      }
      return null
    })
    editorStore.currentFile = makeTab({ id: 'tab-p', pathname: '/tmp/pinned.md' })
    editorStore.tabs = [editorStore.currentFile]
    await mountEditor({ markdown: '# Pinned' })
    expect(addThemeStyleMock).toHaveBeenCalledWith('graphite-dark')
    // The muya diagram classification mirrors the shipped watch(theme)
    // branch (/dark/i) for the applied surface theme.
    expect(mockEditorInstance.setOptions).toHaveBeenCalledWith(
      { mermaidTheme: 'dark', vegaTheme: 'dark' },
      true
    )
    editorStore.currentFile = makeTab({ id: 'tab-g', pathname: '/tmp/plain.md' })
    editorStore.tabs.push(editorStore.currentFile)
    await flushPromises()
    await nextTick()
    expect(addThemeStyleMock).toHaveBeenLastCalledWith('paper')
  })

  it('a global theme cycle while pinned re-asserts the pin and never re-reads the store', async () => {
    preferencesStore.followSystemTheme = false
    preferencesStore.theme = 'paper'
    loadPageWidthForMock.mockResolvedValue({ value: 80, unit: 'ch', themeOverride: 'ink', savedAt: 1 })
    await mountEditor()
    expect(addThemeStyleMock).toHaveBeenLastCalledWith('ink')
    const readsAfterOpen = loadPageWidthForMock.mock.calls.length
    // The title bar cycle / Auto resolution / cross-window echo moves the
    // global theme — the pinned document's surface must not follow.
    preferencesStore.theme = 'graphite'
    await flushPromises()
    await nextTick()
    expect(addThemeStyleMock).toHaveBeenLastCalledWith('ink')
    expect(loadPageWidthForMock.mock.calls.length).toBe(readsAfterOpen)
  })

  it('the panel announcement re-reads the entry so a fresh pin reaches the surface without a tab switch', async () => {
    preferencesStore.followSystemTheme = false
    preferencesStore.theme = 'paper'
    await mountEditor()
    expect(appliedWidth()).toBe('')
    const announce = getBusHandler('mt::document-page-state-changed')
    expect(announce).toBeTruthy()
    loadPageWidthForMock.mockResolvedValue({
      value: 80, unit: 'ch', themeOverride: 'ink', savedAt: 2
    })
    announce({ pathname: '/tmp/test.md' })
    await flushPromises()
    await nextTick()
    expect(appliedWidth()).toBe('850px')
    expect(addThemeStyleMock).toHaveBeenCalledWith('ink')
  })

  it('an announcement for another document is ignored', async () => {
    await mountEditor()
    const announce = getBusHandler('mt::document-page-state-changed')
    loadPageWidthForMock.mockResolvedValue({ value: 80, unit: 'ch', savedAt: 2 })
    const readsBefore = loadPageWidthForMock.mock.calls.length
    announce({ pathname: '/tmp/other.md' })
    await flushPromises()
    expect(loadPageWidthForMock.mock.calls.length).toBe(readsBefore)
    expect(appliedWidth()).toBe('')
  })

  it('unmount clears the pipeline width and restores the global theme', async () => {
    preferencesStore.followSystemTheme = false
    preferencesStore.theme = 'paper'
    loadPageWidthForMock.mockResolvedValue({ value: 80, unit: 'ch', themeOverride: 'ink', savedAt: 1 })
    await mountEditor()
    expect(appliedWidth()).toBe('850px')
    expect(addThemeStyleMock).toHaveBeenCalledWith('ink')
    wrapper.unmount()
    wrapper = null
    expect(appliedWidth()).toBe('')
    expect(addThemeStyleMock).toHaveBeenLastCalledWith('paper')
    expect(getLastAppliedEditorWidth()).toBeNull()
  })

  it('the Auto mode restore resolves the family member (followSystemTheme on)', async () => {
    preferencesStore.followSystemTheme = true
    preferencesStore.lightModeTheme = 'paper'
    preferencesStore.darkModeTheme = 'ink'
    loadPageWidthForMock.mockResolvedValue({ value: 80, unit: 'ch', themeOverride: null, savedAt: 1 })
    await mountEditor()
    // Unpinned document: no pin was on the surface, nothing to restore.
    expect(addThemeStyleMock).not.toHaveBeenCalled()
    editorStore.currentFile = makeTab({ id: 'tab-p2', pathname: '/tmp/p2.md' })
    editorStore.tabs.push(editorStore.currentFile)
    loadPageWidthForMock.mockResolvedValue({ value: 80, unit: 'ch', themeOverride: 'ink', savedAt: 2 })
    await flushPromises()
    await nextTick()
    expect(addThemeStyleMock).toHaveBeenCalledWith('ink')
    wrapper.unmount()
    wrapper = null
    // Auto is on and jsdom is light: the light member is restored.
    expect(addThemeStyleMock).toHaveBeenLastCalledWith('paper')
  })

  /* ── mirror opt-out ───────────────────────────────────────────── */

  it('the Split View mirror pane never applies the page state', async () => {
    loadPageWidthForMock.mockResolvedValue({ value: 80, unit: 'ch', themeOverride: 'ink', savedAt: 1 })
    await mountEditor({ mirror: true })
    expect(loadPageWidthForMock).not.toHaveBeenCalled()
    expect(appliedWidth()).toBe('')
    expect(addThemeStyleMock).not.toHaveBeenCalled()
    layoutStore.showSideBar = true
    layoutStore.sideBarWidth = 280
    await flushPromises()
    expect(appliedWidth()).toBe('')
  })
})
