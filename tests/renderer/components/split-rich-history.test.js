// FILE: tests/renderer/components/split-rich-history.test.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Verify the mounted rich pane as the shared split document/history owner.
//   SCOPE: Real bus, Pinia content actions and Muya History with a surface adapter; activation, commits, replay, tab retention, IME and focused commands.
//   DEPENDS: Vue Test Utils, Vitest, Pinia test setup, editor.vue, Muya History.
//   LINKS: M-011, M-012; V-M-011; C-STABILIZE-SPLIT-VERIFICATION.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
// START_MODULE_MAP
//   harness - Surface adapter instance, render echo switch and animation queue.
//   i18n - Minimal editor translation provider.
//   wrapper - Mounted editor lifecycle owner.
//   store - Real editor store for observable content/history effects.
//   preferences - Preferences controlling mode, lock and autosave behavior.
//   DOC - Exact raw source fixture with a star list marker.
//   caret - Independent endpoint fixture constructor.
//   sourceEdit - Emit the public source-to-owner operation.
//   mountOwner - Mount the actual rich owner against one real tab.
//   activate - Enter split through the component prop transition.
//   settle - Flush Vue and the bounded animation queue.
//   snapshots - Read only the observable tab history document sequence.
// END_MODULE_MAP
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - Verify approved unified owner requirements without runtime or coverage-policy changes.
// END_CHANGE_SUMMARY

import { shallowMount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { createI18n } from 'vue-i18n'
import { setupTestPinia } from '../pinia'
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest'

const harness = vi.hoisted(() => ({ instance: null, echoRender: false, frames: [], assetResult: 'assets/pasted.png' }))
vi.mock('@/bus', async () => ({ default: (await import('mitt')).default() }))
vi.mock('electron-log', () => ({ default: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }))
vi.mock('@tauri-apps/plugin-clipboard-manager', () => ({ writeText: vi.fn(async () => {}), writeHtml: vi.fn(async () => {}), writeImage: vi.fn(async () => {}) }))
vi.mock('@/services/notification', () => ({ default: { notify: vi.fn() } }))
vi.mock('@/services/printService', () => ({ default: class { renderMarkdown() {} clearup() {} } }))
vi.mock('@/spellchecker', () => ({ SpellChecker: class { switchLanguage() { return Promise.resolve('en') } } }))
vi.mock('@/commands', () => ({ SpellcheckerLanguageCommand: class {} }))
vi.mock('@/config', () => ({ DEFAULT_EDITOR_FONT_FAMILY: 'sans-serif' }))
vi.mock('@/util/theme', () => ({ addCommonStyle: vi.fn(), setEditorWidth: vi.fn(), setWrapCodeBlocks: vi.fn(), addThemeStyle: vi.fn() }))
vi.mock('@/util', () => ({ isOsx: true, animatedScrollTo: vi.fn(), hasKeys: value => !!value && Object.keys(value).length > 0, getUniqueId: () => 'fixture-id', deepClone: value => JSON.parse(JSON.stringify(value)) }))
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
        this.emit('change', { markdown, history: this.getHistory(), cursor: this.getCursor(), muyaIndexCursor: JSON.parse(JSON.stringify(this.indexCursor)), wordCount: { word: 4, character: markdown.length }, toc: [], ...(historyRestore ? { historyRestore: true } : {}) })
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

const i18n = createI18n({ legacy: false, locale: 'en', messages: { en: {} } })
const DOC = '# Owner\n\nMiddle paragraph.\n\n* untouched\n'
const caret = (line, ch) => ({ anchor: { line, ch }, focus: { line, ch } })
let wrapper
let store
let preferences
const settle = async () => {
  await nextTick()
  for (let frame = 0; frame < 3; frame++) {
    const pending = harness.frames.splice(0)
    pending.forEach(callback => callback(0))
    await nextTick()
  }
}
const mountOwner = async (overrides = {}) => {
  const pinia = setupTestPinia()
  store = useEditorStore()
  preferences = usePreferencesStore()
  preferences.sourceCode = false
  preferences.autoSave = false
  preferences.spellcheckerEnabled = false
  store.currentFile = { id: 'a', filename: 'a.md', pathname: '/fixture/a.md', markdown: DOC, cursor: null, muyaIndexCursor: caret(2, 4), history: { stack: [], index: -1, lastEditIndex: -1 }, contentRevision: 0, isSaved: true, lastSavedHistoryId: -1, notifications: [], scrollTop: 0, previewMode: false, ...overrides }
  store.tabs = [store.currentFile]
  store.updateTabIdToIndex()
  store.END_BOOT_PHASE()
  vi.spyOn(store, 'LISTEN_FOR_CONTENT_CHANGE')
  vi.spyOn(store, 'HANDLE_AUTO_SAVE').mockImplementation(() => {})
  vi.spyOn(store, 'SAVE_ACTIVE_FILE_POSITION').mockResolvedValue(undefined)
  const Editor = (await import('@/components/editorWithTabs/editor.vue')).default
  wrapper = shallowMount(Editor, { attachTo: document.body, props: { markdown: DOC, cursor: null, textDirection: 'ltr', platform: 'darwin', splitActive: false }, global: { plugins: [pinia, i18n], stubs: { ElDialog: true, ElForm: true, ElFormItem: true, ElInputNumber: true, ElButton: true, EditorSearch: true } } })
  await settle()
  return harness.instance
}
const activate = async () => { await wrapper.setProps({ splitActive: true }); await settle() }
const sourceEdit = (markdown, selection = { anchor: { line: 2, ch: 3 }, head: { line: 2, ch: 8 } }, id = store.currentFile.id) => {
  bus.emit('split:source-edit', { id, markdown, selection, cursor: { anchor: selection.anchor, focus: selection.head }, wordCount: { word: 5, character: markdown.length } })
}
const snapshots = () => store.currentFile.history.stack.map(entry => entry.markdown)

beforeEach(() => {
  vi.useFakeTimers()
  __resetBootPhase()
  vi.spyOn(window, 'getSelection').mockReturnValue(null)
  bus.all.clear()
  harness.instance = null
  harness.echoRender = false
  harness.frames = []
  harness.assetResult = 'assets/pasted.png'
  globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} }
  vi.stubGlobal('requestAnimationFrame', callback => { harness.frames.push(callback); return harness.frames.length })
  vi.stubGlobal('cancelAnimationFrame', vi.fn())
})
afterEach(() => {
  wrapper?.unmount(); wrapper = null
  bus.all.clear()
  vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks()
  document.body.innerHTML = ''
})

describe('mounted rich owner — unified split requirements', () => {
  it('activates once, stores one exact raw payload and retains only constant-size caret metadata', async () => {
    const rich = await mountOwner()
    expect(store.currentFile.splitSession).toBeUndefined()
    await activate()
    expect(store.currentFile.splitSession).toMatchObject({ unified: true, focused: 'rich', rich: caret(2, 4) })
    expect(snapshots()).toEqual([DOC])
    expect(store.currentFile.history.stack[0].blocks).toBeUndefined()
    expect(store.LISTEN_FOR_CONTENT_CHANGE).not.toHaveBeenCalled()
    await wrapper.setProps({ splitActive: false }); await wrapper.setProps({ splitActive: true })
    expect(snapshots()).toEqual([DOC])
    expect(rich.contentState.history.unified).toBe(true)
  })

  it('commits source typing once, coalesces it and renders foreign text without a normalized echo or extra autosave', async () => {
    const rich = await mountOwner(); await activate()
    preferences.autoSave = true
    const first = DOC.replace('Middle', 'Source')
    const final = DOC.replace('Middle', 'Source finished')
    sourceEdit(first); sourceEdit(final)
    expect(store.currentFile.markdown).toBe(final)
    expect(store.currentFile.contentRevision).toBe(2)
    expect(store.currentFile.isSaved).toBe(false)
    expect(store.HANDLE_AUTO_SAVE).toHaveBeenCalledTimes(2)
    expect(snapshots()).toEqual([DOC, final])
    expect(store.currentFile.history.stack[1].meta.source).toEqual({ anchor: { line: 2, ch: 3 }, head: { line: 2, ch: 8 } })
    harness.echoRender = true
    rich.container.scrollTop = 170
    await wrapper.setProps({ markdown: final })
    vi.advanceTimersByTime(149)
    expect(rich.text).not.toContain('Source finished')
    vi.advanceTimersByTime(1)
    expect(rich.text).toContain('Source finished')
    expect(rich.container.scrollTop).toBe(170)
    expect(store.currentFile.markdown).toContain('* untouched')
    expect(store.LISTEN_FOR_CONTENT_CHANGE).toHaveBeenCalledTimes(2)
    expect(store.HANDLE_AUTO_SAVE).toHaveBeenCalledTimes(2)
    expect(snapshots()).toEqual([DOC, final])
  })

  it('undoes and redoes exactly one interleaved operation from either focused surface', async () => {
    const rich = await mountOwner(); await activate()
    const a = DOC.replace('Middle', 'A rich')
    const b = a.replace('paragraph.', 'paragraph. B source')
    const c = b.replace('paragraph.', 'paragraph. C rich')
    rich.userEdit(a.replace(/^\* /gm, '- '), caret(2, 6))
    bus.emit('split:focus', 'source')
    sourceEdit(b)
    await wrapper.setProps({ markdown: b }); vi.advanceTimersByTime(150)
    rich.container.dispatchEvent(new FocusEvent('focusin', { bubbles: true }))
    rich.userEdit(c.replace(/^\* /gm, '- '), caret(2, 10))
    expect(snapshots()).toEqual([DOC, a, b, c])
    const length = snapshots().length
    bus.emit('split:focus', 'source')
    const restored = vi.fn(); bus.on('split:history-restored', restored)
    for (const expected of [b, a, DOC]) {
      bus.emit('undo')
      expect(store.currentFile.markdown).toBe(expected)
      expect(store.currentFile.splitSession.focused).toBe('source')
    }
    for (const expected of [a, b, c]) {
      bus.emit('redo')
      expect(store.currentFile.markdown).toBe(expected)
    }
    expect(restored).toHaveBeenCalledTimes(6)
    expect(snapshots()).toHaveLength(length)
    expect(store.currentFile.markdown).toContain('* untouched')
    bus.emit('split:focus', 'rich')
    await wrapper.find('.editor-wrapper').trigger('keydown', { code: 'KeyZ', key: 'z', metaKey: true })
    expect(store.currentFile.markdown).toBe(b)
    expect(rich.focus).toHaveBeenCalled()
    await wrapper.find('.editor-wrapper').trigger('keydown', { code: 'KeyY', key: 'y', metaKey: true })
    expect(store.currentFile.markdown).toBe(c)
  })

  it('keeps navigation metadata out of content revisions and does not record readonly or stale source edits', async () => {
    const rich = await mountOwner(); await activate()
    rich.indexCursor = caret(2, 9)
    rich.dispatchChange()
    expect(store.currentFile.contentRevision).toBe(0)
    expect(store.currentFile.muyaIndexCursor).toEqual(caret(2, 9))
    expect(snapshots()).toEqual([DOC])
    sourceEdit('stale', undefined, 'closed-owner')
    store.currentFile.locked = true; await nextTick()
    sourceEdit('locked edit')
    store.currentFile.locked = false; store.currentFile.previewMode = true; await nextTick()
    sourceEdit('preview edit')
    expect(store.currentFile.markdown).toBe(DOC)
    expect(store.LISTEN_FOR_CONTENT_CHANGE).not.toHaveBeenCalled()
  })

  it('defers the composing rich render, then converges once without another content revision', async () => {
    const rich = await mountOwner(); await activate()
    rich.container.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, data: '文' }))
    const incoming = 'Inserted\n' + DOC
    sourceEdit(incoming)
    await wrapper.setProps({ markdown: incoming }); vi.advanceTimersByTime(150)
    expect(rich.text).not.toContain('Inserted')
    expect(store.currentFile.markdown).toBe(incoming)
    const before = store.currentFile.contentRevision
    // Muya's native composition-end dispatch precedes the owner's bubble
    // listener. Its unchanged serialization must not erase deferred source.
    rich.container.addEventListener('compositionend', () => rich.dispatchChange(), { capture: true, once: true })
    rich.container.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '文' }))
    expect(rich.text).toContain('Inserted')
    expect(store.currentFile.contentRevision).toBe(before)
    expect(store.LISTEN_FOR_CONTENT_CHANGE).toHaveBeenCalledTimes(1)
    expect(store.currentFile.splitSession.rich).toEqual(caret(3, 4))
    rich.container.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }))
    expect(store.currentFile.contentRevision).toBe(before)
  })

  it('translates an inactive reversed rich selection through a source insertion without taking focus', async () => {
    const rich = await mountOwner(); await activate()
    rich.indexCursor = { anchor: { line: 2, ch: 12 }, focus: { line: 2, ch: 3 } }
    bus.emit('split:focus', 'source')
    const sourceSelection = { anchor: { line: 3, ch: 6 }, head: { line: 3, ch: 9 } }
    const incoming = 'Intro\n' + DOC
    sourceEdit(incoming, sourceSelection)
    await wrapper.setProps({ markdown: incoming }); vi.advanceTimersByTime(150)
    expect(store.currentFile.splitSession.rich).toEqual({ anchor: { line: 3, ch: 12 }, focus: { line: 3, ch: 3 } })
    expect(rich.indexCursor).toEqual(store.currentFile.splitSession.rich)
    expect(store.currentFile.splitSession.source).toEqual(sourceSelection)
    expect(store.currentFile.splitSession.focused).toBe('source')
    expect(store.currentFile.contentRevision).toBe(1)
  })

  it('coalesces foreign bursts and caps the follow delay after an expensive render', async () => {
    const rich = await mountOwner(); await activate()
    let clock = 0
    const now = vi.spyOn(performance, 'now').mockImplementation(() => clock)
    const render = rich.setMarkdown.getMockImplementation()
    rich.setMarkdown.mockImplementation((...args) => { render(...args); clock += 1100 })
    sourceEdit(DOC + 'first\n')
    await wrapper.setProps({ markdown: store.currentFile.markdown }); vi.advanceTimersByTime(150)
    expect(rich.text).toContain('first')
    sourceEdit(DOC + 'second\n'); await wrapper.setProps({ markdown: store.currentFile.markdown })
    sourceEdit(DOC + 'latest\n'); await wrapper.setProps({ markdown: store.currentFile.markdown })
    vi.advanceTimersByTime(1999)
    expect(rich.text).toContain('first')
    vi.advanceTimersByTime(1)
    expect(rich.text).toContain('latest')
    expect(rich.text).not.toContain('second')
    expect(snapshots()).toEqual([DOC, DOC + 'latest\n'])
    expect(store.currentFile.contentRevision).toBe(3)
    now.mockRestore()
  })

  it('retains outgoing history and carets per tab and rejects delayed old-owner events', async () => {
    const rich = await mountOwner(); await activate()
    sourceEdit(DOC + '\nA saved session\n')
    bus.emit('split:focus', 'rich')
    rich.indexCursor = caret(2, 12)
    const outgoing = store.currentFile
    const b = { ...outgoing, id: 'b', filename: 'b.md', markdown: '# Other\n', history: { stack: [], index: -1, lastEditIndex: -1 }, splitSession: undefined, isSaved: true, cursor: null }
    store.tabs.push(b); store.updateTabIdToIndex()
    store.UPDATE_CURRENT_FILE(b)
    await settle()
    expect(outgoing.history.unified).toBe(true)
    expect(outgoing.history.stack).toHaveLength(2)
    expect(outgoing.splitSession.rich).toEqual(caret(2, 12))
    expect(outgoing.history.stack[1].markdown).toContain('A saved session')
    bus.emit('file-changed', { id: 'a', markdown: 'late stale text' })
    sourceEdit('late source text', undefined, 'a')
    expect(store.currentFile.markdown).toBe('# Other\n')
    store.UPDATE_CURRENT_FILE(outgoing)
    await settle()
    expect(store.currentFile.markdown).toContain('A saved session')
    expect(rich.contentState.history.unified).toBe(true)
    expect(store.currentFile.splitSession.rich).toEqual(caret(2, 12))
    bus.emit('undo')
    expect(store.currentFile.markdown).toBe(DOC)
  })

  it('keeps one owner through source/rich mode transitions and routes source commands without mutating rich selection', async () => {
    const rich = await mountOwner(); await activate()
    sourceEdit(DOC + '\nsource operation\n')
    const commands = vi.fn(); bus.on('split:source-command', commands)
    const execute = vi.fn(() => bus.emit('format', 'strong'))
    const request = { handled: false, execute }
    bus.emit('split:execute-command', request)
    expect(request.handled).toBe(true)
    expect(execute).toHaveBeenCalledOnce()
    expect(commands).toHaveBeenCalledWith({ command: 'focus', payload: undefined })
    expect(commands).toHaveBeenCalledWith({ command: 'format', payload: 'strong' })
    expect(rich.format).not.toHaveBeenCalled()
    for (const [event, payload, expected] of [['paragraph', 'heading 2', 'paragraph'], ['searchValue', { value: 'Middle', opt: {} }, 'search'], ['replaceValue', { value: 'New', opt: {} }, 'replace'], ['find-action', 'next', 'find'], ['duplicate', 'duplicate', 'duplicate'], ['insert-image', 'assets/i.png', 'insert'], ['formatDocument', undefined, 'formatDocument'], ['selectAll', undefined, 'selectAll']]) {
      bus.emit(event, payload)
      expect(commands.mock.calls.at(-1)[0].command).toBe(expected)
    }
    await wrapper.setProps({ splitActive: false })
    expect(store.currentFile.splitSession.focused).toBe('rich')
    preferences.sourceCode = true; await nextTick()
    expect(store.currentFile.splitSession.focused).toBe('source')
    expect(snapshots()).toEqual([DOC, DOC + '\nsource operation\n'])
    preferences.sourceCode = false; await nextTick()
    bus.emit('format', 'em')
    expect(rich.format).toHaveBeenCalledWith('em')
    bus.emit('undo')
    expect(store.currentFile.markdown).toBe(DOC)
  })

  it('copies from the remembered focused source selection through the owner clipboard route', async () => {
    const rich = await mountOwner(); await activate()
    bus.emit('split:focus', 'source')
    bus.on('split:source-selection', request => { request.selected = '* exact source selection'; request.text = request.selected })
    const { writeText } = await import('@tauri-apps/plugin-clipboard-manager')
    writeText.mockResolvedValue(undefined)
    bus.emit('copyAsMarkdown')
    await vi.dynamicImportSettled()
    expect(writeText).toHaveBeenLastCalledWith('* exact source selection')
    expect(rich.getCopyData).not.toHaveBeenCalled()
    expect(store.currentFile.contentRevision).toBe(0)
    bus.emit('split:focus', 'rich')
    bus.emit('copyAsMarkdown')
    await vi.dynamicImportSettled()
    expect(writeText).toHaveBeenLastCalledWith('rich selection')
  })

  it('delegates current-owner assets once and rejects stale or readonly requests without writing', async () => {
    await mountOwner(); await activate()
    const files = await import('@/util/fileSystem')
    const { default: notice } = await import('@/services/notification')
    files.saveImageWithFolderAccess.mockImplementation(options => options.save())
    files.saveImageToRelativeFolder.mockResolvedValue('assets/pasted.png')
    preferences.imageInsertAction = 'folder'
    preferences.imagePreferRelativeDirectory = true
    preferences.imageRelativeDirectoryName = 'assets'
    const complete = vi.fn()
    bus.emit('split:insert-asset', { image: 'fixture-image.png', alt: 'fixture', id: 'old-owner', complete })
    store.currentFile.locked = true; await nextTick()
    bus.emit('split:insert-asset', { image: 'fixture-image.png', alt: 'fixture', id: 'a', complete })
    expect(files.saveImageToRelativeFolder).not.toHaveBeenCalled()
    expect(complete).not.toHaveBeenCalled()
    store.currentFile.locked = false; await nextTick()
    bus.emit('split:insert-asset', { image: 'fixture-image.png', alt: 'fixture', id: 'a', complete })
    await vi.dynamicImportSettled()
    expect(files.saveImageToRelativeFolder).toHaveBeenCalledOnce()
    expect(complete).toHaveBeenCalledWith('assets/pasted.png')
    expect(store.LISTEN_FOR_CONTENT_CHANGE).not.toHaveBeenCalled()
    files.saveImageToRelativeFolder.mockRejectedValueOnce(new Error('fixture saver denied'))
    bus.emit('split:insert-asset', { image: 'fixture-image.png', alt: 'fixture', id: 'a', complete })
    await vi.dynamicImportSettled()
    expect(notice.notify).toHaveBeenCalledWith(expect.objectContaining({ type: 'warning', message: expect.stringContaining('fixture saver denied') }))
    expect(complete).toHaveBeenCalledOnce()
  })

  it('ignores a late native rich change in the interval before the newly selected owner renders', async () => {
    const rich = await mountOwner(); await activate()
    const incoming = { ...store.currentFile, id: 'b', filename: 'b.md', markdown: '# Current B\n', history: { stack: [], index: -1, lastEditIndex: -1 }, splitSession: undefined, cursor: null }
    store.tabs.push(incoming); store.updateTabIdToIndex()
    bus.emit('split:before-tab-change')
    store.currentFile = incoming
    rich.userEdit('stale native A payload')
    expect(store.LISTEN_FOR_CONTENT_CHANGE).not.toHaveBeenCalled()
    expect(incoming.markdown).toBe('# Current B\n')
    await settle()
    expect(rich.text).toBe('# Current B\n')
    expect(store.currentFile.markdown).toBe('# Current B\n')
  })

  it('leaves never-unified commands to their ordinary owner and releases its bus/DOM listeners on unmount', async () => {
    const rich = await mountOwner()
    const request = { handled: false, execute: vi.fn() }
    bus.emit('split:execute-command', request)
    expect(request.handled).toBe(false)
    expect(request.execute).not.toHaveBeenCalled()
    sourceEdit('outside a unified session')
    expect(store.currentFile.markdown).toBe(DOC)
    await activate()
    const prior = store.currentFile.contentRevision
    wrapper.unmount(); wrapper = null
    sourceEdit('after teardown')
    rich.container.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }))
    expect(store.currentFile.contentRevision).toBe(prior)
    expect(bus.all.get('split:source-edit')).toHaveLength(0)
  })
})
