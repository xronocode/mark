// FILE: tests/renderer/components/document-save-surfaces.test.js
// VERSION: 1.1.0
// START_MODULE_CONTRACT
//   PURPOSE: Verify actual mounted rich/source snapshot adapters against the collector.
//   SCOPE: Split preference/focus authority, exact committed text/format, owner lifetimes, mirrors and IME-first capture.
//   DEPENDS: Vue Test Utils, Pinia, editor.vue, sourceCode.vue, documentSnapshot.
//   LINKS: M-011, M-012; C-SPLIT-SAVE-AUTHORITY.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
// START_MODULE_MAP
//   harness - Instrumented Muya and CodeMirror surface buffers.
//   i18n - Minimal editor translation provider.
//   DOC - Initial canonical document text.
//   FORMAT - Exact byte policy fixture.
//   wrappers - Mounted surface cleanup stack.
//   store - Real Pinia editor fixture.
//   preferences - Live mode and save preferences.
//   settle - Flush Vue ownership and queued layout frames.
//   mountSurfaces - Register both actual component adapters for one owned document.
// END_MODULE_MAP
// START_CHANGE_SUMMARY
//   LAST_CHANGE: 2026-11-11 C-SPLIT-SAVE-AUTHORITY: mounted dual-surface regression matrix.
// END_CHANGE_SUMMARY
import { shallowMount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { createI18n } from 'vue-i18n'
import { setupTestPinia } from '../pinia'
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest'

const harness = vi.hoisted(() => ({ instance: null, echoRender: false, frames: [], assetResult: 'assets/pasted.png', cm: null }))
vi.mock('@/bus', async () => ({ default: (await import('mitt')).default() }))
vi.mock('electron-log', () => ({ default: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }))
vi.mock('@tauri-apps/plugin-clipboard-manager', () => ({ writeText: vi.fn(async () => {}), writeHtml: vi.fn(async () => {}), writeImage: vi.fn(async () => {}) }))
vi.mock('@/services/notification', () => ({ default: { notify: vi.fn() } }))
vi.mock('@/services/printService', () => ({ default: class { renderMarkdown() {} clearup() {} } }))
vi.mock('@/spellchecker', () => ({ SpellChecker: class { switchLanguage() { return Promise.resolve('en') } } }))
vi.mock('@/commands', () => ({ SpellcheckerLanguageCommand: class {} }))
vi.mock('@/config', () => ({ DEFAULT_EDITOR_FONT_FAMILY: 'sans-serif', oneDarkThemes: [], railscastsThemes: [] }))
vi.mock('@/util/theme', () => ({ addCommonStyle: vi.fn(), setEditorWidth: vi.fn(), setWrapCodeBlocks: vi.fn(), addThemeStyle: vi.fn() }))
vi.mock('@/util', () => ({ adjustCursor: cursor => cursor, isOsx: true, animatedScrollTo: vi.fn(), hasKeys: value => !!value && Object.keys(value).length > 0, getUniqueId: () => 'fixture-id', deepClone: value => JSON.parse(JSON.stringify(value)) }))
vi.mock('@/util/fileSystem', () => ({
  resolveImageFolder: (value, userData) => value || `${userData}/images`,
  moveImageToFolder: vi.fn(async () => harness.assetResult),
  saveImageToRelativeFolder: vi.fn(async () => harness.assetResult),
  saveImageWithFolderAccess: vi.fn(async options => options.save()),
  uploadImage: vi.fn(async () => harness.assetResult)
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
vi.mock('muya/lib', async () => {
  const { default: History } = await import('muya/lib/contentState/history')
  class Surface {
    constructor(container, options) {
      harness.instance = this
      this.container = container
      this.options = options
      this.listeners = new Map()
      this.indexCursor = { anchor: { line: 2, ch: 4 }, focus: { line: 2, ch: 4 } }
      this.text = options.markdown
      container.innerHTML = '<div id="ag-editor-id"><p>Rich document</p></div>'
      this.contentState = {
        blocks: [{ key: 'rich', text: this.text }], renderRange: null,
        cursor: { start: { key: 'rich', offset: 0 }, end: { key: 'rich', offset: 0 }, isEdit: false },
        getBlocks: () => this.contentState.blocks,
        getMuyaIndexCursor: vi.fn(() => JSON.parse(JSON.stringify(this.indexCursor))),
        render: vi.fn(), muya: this
      }
      this.contentState.history = new History(this.contentState)
      this.getHistory = () => {
        const { stack, index, lastEditIndex, unified } = this.contentState.history
        return { stack, index, lastEditIndex, ...(unified ? { unified: true } : {}) }
      }
      this.setHistory = history => {
        Object.assign(this.contentState.history, { ...history, unified: !!history.unified, pendingIndex: -1 })
        this.contentState.history.id = Math.max(-1, ...history.stack.map(entry => entry.id))
      }
      this.getMarkdown = vi.fn(() => this.text)
      this.getWordCount = (markdown) => ({ word: 4, character: markdown.length })
      this.getCursor = vi.fn(() => this.contentState.cursor)
      this.getSelection = vi.fn(() => ({ cursorCoords: { y: 200 }, selectedText: '' }))
      this.getCopyData = vi.fn(() => ({ text: 'rich selection' }))
      this.getTOC = vi.fn(() => [])
      this.setMarkdown = vi.fn((text, cursor, renderCursor, indexCursor, blocks, flags = {}) => {
        // A surface may serialize '*' as '-'; foreign renders must never
        // replace the store's exact raw Markdown with that serialization.
        this.text = text.replace(/^\* /gm, '- ')
        this.contentState.blocks = blocks || [{ key: 'rich', text: this.text }]
        if (indexCursor?.anchor && indexCursor?.focus) this.indexCursor = JSON.parse(JSON.stringify(indexCursor))
        if (!flags.renderOnly && !this.contentState.history.unified) {
          this.contentState.history.push({ blocks: this.contentState.blocks, cursor: this.contentState.cursor, renderRange: null })
        }
        if (harness.echoRender) this.dispatchChange()
      })
      this.clearHistory = () => this.contentState.history.clearHistory()
      this.dispatchChange = () => {
        const history = this.contentState.history
        const markdown = history.replayMarkdown ?? this.text
        const historyRestore = !!history.replaying
        delete history.replayMarkdown
        delete history.replaying
        this.emit('change', { markdown, history: this.getHistory(), cursor: this.getCursor(), muyaIndexCursor: JSON.parse(JSON.stringify(this.indexCursor)), wordCount: this.getWordCount(markdown), toc: [], ...(historyRestore ? { historyRestore: true } : {}) })
      }
      this.userEdit = (text, indexCursor = this.indexCursor) => {
        this.text = text
        this.indexCursor = JSON.parse(JSON.stringify(indexCursor))
        this.dispatchChange()
      }
      this.undo = vi.fn(() => { this.contentState.history.undo(); this.dispatchChange() })
      this.redo = vi.fn(() => { this.contentState.history.redo(); this.dispatchChange() })
      this.focus = vi.fn(() => container.focus())
      this.progressive = { info: () => ({ status: 'done' }) }
      for (const name of ['destroy', 'setFocusMode', 'setFont', 'setOptions', 'refreshCodeBlockLineNumbers', 'setTabSize', 'setListIndentation', 'hideAllFloatTools', 'blur', 'selectAll', 'format', 'createTable', 'setCursor', 'updateParagraph', 'duplicate', 'insertParagraph', 'deleteParagraph', 'insertImage', 'invalidateImageCache', 'copyAsRich', 'copyAsHtml', 'pasteAsPlainText']) this[name] = vi.fn()
    }
    static use() {}
    on(name, listener) { if (!this.listeners.has(name)) this.listeners.set(name, new Set()); this.listeners.get(name).add(listener) }
    off(name, listener) { this.listeners.get(name)?.delete(listener) }
    emit(name, payload) { this.listeners.get(name)?.forEach(listener => listener(payload)) }
  }
  return { default: Surface, BLOCK_MOUNT_SERVED: 'BLOCK_MOUNT_SERVED', BLOCK_SYNC_REGION_DONE: 'BLOCK_SYNC_REGION_DONE', BLOCK_TAIL_MOUNT_DONE: 'BLOCK_TAIL_MOUNT_DONE' }
})

import bus from '@/bus'
import { useEditorStore, __resetBootPhase } from '@/store/editor'
import { usePreferencesStore } from '@/store/preferences'


import { documentOwner, captureDocumentSnapshot } from '@/util/documentSnapshot'
vi.mock('@/codeMirror', async () => {
  const { default: NativeCodeMirror } = await import('codemirror/lib/codemirror')
  return ({
  default: vi.fn((container, config) => {
    const input = document.createElement('textarea'); container.appendChild(input)
    let doc = new NativeCodeMirror.Doc(config.value)
    const cm = {
      on: vi.fn(), off: vi.fn(), getValue: vi.fn(() => doc.getValue()), setValue: value => { doc.setValue(value) },
      getDoc: () => doc, swapDoc: next => { const old = doc; doc = next; return old },
      setOption: vi.fn(), getOption: vi.fn(), getCursor: () => ({ line: 0, ch: 0 }),
      getLine: line => doc.getLine(line), getSelection: () => '', setSelection: vi.fn(), setCursor: vi.fn(),
      getInputField: () => input, hasFocus: () => false, execCommand: vi.fn(),
      getScrollInfo: () => ({ left: 0, top: 0 }), clearHistory: vi.fn(), refresh: vi.fn()
    }
    harness.cm = cm
    return cm
  }), setMode: vi.fn(), setCursorAtFirstLine: vi.fn(), setTextDirection: vi.fn()
})
})
const i18n = createI18n({ legacy: false, locale: 'en', messages: { en: {} } })
const DOC = '# Owned\n\nold\n'
const FORMAT = { encoding: 'utf8', isBom: false, lineEnding: 'lf', finalNewline: 3 }
let wrappers = []
let store
let preferences
const settle = async () => {
  await nextTick()
  for (let frame = 0; frame < 3; frame++) {
    harness.frames.splice(0).forEach(callback => callback(0))
    await nextTick()
  }
}
const mountSurfaces = async ({ sourceCode = true, splitActive = true, focus = 'rich', mirror = false, unified = true } = {}) => {
  const pinia = setupTestPinia()
  store = useEditorStore(); preferences = usePreferencesStore()
  preferences.sourceCode = sourceCode; preferences.autoSave = false; preferences.spellcheckerEnabled = false
  store.currentFile = { id: 'owned', filename: 'owned.md', pathname: '/fixture/owned.md', markdown: DOC,
    savedMarkdown: DOC, savedFormat: FORMAT, encoding: { encoding: 'utf8', isBom: false },
    lineEnding: 'lf', trimTrailingNewline: 3, history: { stack: [], index: -1, lastEditIndex: -1 },
    contentRevision: 0, isSaved: true, notifications: [], previewMode: false,
    ...(unified ? { splitSession: { unified: true, focused: focus, source: null } } : {}) }
  store.tabs = [store.currentFile]; store.updateTabIdToIndex(); store.END_BOOT_PHASE()
  vi.spyOn(store, 'HANDLE_AUTO_SAVE').mockImplementation(() => {})
  vi.spyOn(store, 'SAVE_ACTIVE_FILE_POSITION').mockResolvedValue(undefined)
  const Editor = (await import('@/components/editorWithTabs/editor.vue')).default
  wrappers.push(shallowMount(Editor, { attachTo: document.body,
    props: { markdown: DOC, cursor: null, textDirection: 'ltr', platform: 'darwin', splitActive, mirror },
    global: { plugins: [pinia, i18n], stubs: { ElDialog: true, ElForm: true, ElFormItem: true, ElInputNumber: true, ElButton: true, EditorSearch: true } } }))
  if (splitActive || sourceCode) {
    const Source = (await import('@/components/editorWithTabs/sourceCode.vue')).default
    wrappers.push(shallowMount(Source, { attachTo: document.body,
      props: { markdown: DOC, textDirection: 'ltr', splitActive, splitEdit: splitActive, mirror },
      global: { plugins: [pinia, i18n] } }))
  }
  await settle()
  if (unified && splitActive) bus.emit('split:focus', focus)
  await settle()
  harness.instance.getMarkdown.mockClear(); harness.cm?.getValue.mockClear()
  return documentOwner(store.currentFile)
}
beforeEach(() => {
  vi.useFakeTimers(); __resetBootPhase(); bus.all.clear()
  harness.instance = null; harness.cm = null; harness.frames = []; harness.echoRender = false
  vi.spyOn(window, 'getSelection').mockReturnValue(null)
  globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} }
  vi.stubGlobal('requestAnimationFrame', callback => { harness.frames.push(callback); return harness.frames.length })
  vi.stubGlobal('cancelAnimationFrame', vi.fn())
})
afterEach(() => {
  wrappers.reverse().forEach(wrapper => wrapper.unmount()); wrappers = []
  bus.all.clear(); vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks()
  document.body.innerHTML = ''
})
for (const sourceCode of [false, true]) for (const focus of ['rich', 'source']) {
  it(`captures exactly the owning Split pane with sourceCode=${sourceCode}, focus=${focus}`, async () => {
    const owner = await mountSurfaces({ sourceCode, focus })
    const expected = '# Owned\n\nNEW LOCAL ' + focus + '\n'
    if (focus === 'rich') harness.instance.text = expected
    else harness.cm.setValue(expected)
    const result = captureDocumentSnapshot(store, owner)
    expect(result.status).toBe('ready')
    expect(result.snapshot).toMatchObject({ ...owner, markdown: expected, sourcePath: '/fixture/owned.md', format: FORMAT, isSaved: false })
    expect(preferences.sourceCode).toBe(sourceCode)
    expect(harness.instance.getMarkdown).toHaveBeenCalledTimes(focus === 'rich' ? 1 : 0)
    expect(harness.cm.getValue).toHaveBeenCalledTimes(focus === 'source' ? 1 : 0)
  })
}
for (const sourceCode of [false, true]) for (const unified of [false, true]) {
  it(`keeps ordinary mode authority with sourceCode=${sourceCode}, unified=${unified}`, async () => {
    const owner = await mountSurfaces({ sourceCode, splitActive: false, unified })
    const expected = '# Owned\n\nORDINARY LOCAL\n'
    if (sourceCode) harness.cm.setValue(expected)
    else harness.instance.text = expected
    expect(captureDocumentSnapshot(store, owner)).toMatchObject({ status: 'ready', snapshot: { markdown: expected, format: FORMAT } })
    expect(harness.instance.getMarkdown).toHaveBeenCalledTimes(sourceCode ? 0 : 1)
  })
}
it('rejects mirrors without extracting either buffer', async () => {
  const owner = await mountSurfaces({ mirror: true })
  expect(captureDocumentSnapshot(store, owner).status).toBe('unavailable')
  expect(harness.instance.getMarkdown).not.toHaveBeenCalled(); expect(harness.cm.getValue).not.toHaveBeenCalled()
})
it('rejects stale and unrelated document owners without extracting mounted text', async () => {
  const owner = await mountSurfaces()
  expect(captureDocumentSnapshot(store, { ...owner, documentToken: 'retired' }).status).toBe('stale')
  expect(captureDocumentSnapshot(store, { ...owner, id: 'unrelated' }).status).toBe('stale')
  expect(harness.instance.getMarkdown).not.toHaveBeenCalled(); expect(harness.cm.getValue).not.toHaveBeenCalled()
})
for (const pane of ['rich', 'source']) it(`fences ${pane} composition before extracting either committed model`, async () => {
  const owner = await mountSurfaces({ sourceCode: false, focus: pane })
  const input = pane === 'rich' ? harness.instance.container : harness.cm.getInputField()
  input.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }))
  const committed = '# Owned\n\n完成\n'
  if (pane === 'rich') harness.instance.text = committed
  else harness.cm.setValue(committed)
  harness.instance.getMarkdown.mockClear(); harness.cm.getValue.mockClear()
  expect(captureDocumentSnapshot(store, owner).status).toBe('composing')
  expect(store.currentFile.markdown).toBe(DOC)
  expect(harness.instance.getMarkdown).not.toHaveBeenCalled(); expect(harness.cm.getValue).not.toHaveBeenCalled()
  input.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }))
  expect(captureDocumentSnapshot(store, owner)).toMatchObject({ status: 'ready', snapshot: { markdown: committed, format: FORMAT } })
})
it('cannot use the outgoing mounted surfaces for a newly selected unrelated document', async () => {
  await mountSurfaces()
  const incoming = { ...store.currentFile, id: 'incoming', documentToken: 'incoming-lifetime', pathname: '/fixture/incoming.md', markdown: '# Incoming\n' }
  store.tabs.push(incoming)
  store.currentFile = incoming
  expect(captureDocumentSnapshot(store, documentOwner(incoming)).status).toBe('unavailable')
  expect(harness.instance.getMarkdown).not.toHaveBeenCalled(); expect(harness.cm.getValue).not.toHaveBeenCalled()
  await settle()
})
