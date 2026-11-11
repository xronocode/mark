// FILE: tests/renderer/components/split-source-commands.test.js
// START_MODULE_CONTRACT
//   PURPOSE: Verify mounted source-pane command, search, selection, asset and lifecycle effects through public bus and CodeMirror events.
//   SCOPE: Stateful CodeMirror view adapter with real sourceCode.vue, Pinia search state, command transforms, formatter and composition/caret helpers; no component-private calls.
//   DEPENDS: Vue Test Utils, Pinia, Vitest and sourceCode.vue; clipboard and peer-scroll services are controlled boundaries.
//   LINKS: M-011, M-012
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
// C-SOURCE-HISTORY-OWNERSHIP: model public Doc/getDoc/swapDoc while retaining all command and lifetime assertions.
// START_MODULE_MAP
//   adapter - Stateful public CodeMirror view, event callbacks and peer-service fixtures.
//   wrapper - Mounted source view lifecycle owner.
//   store - Actual editor store with an observed content-change boundary.
//   mountSource - Mount a saved synthetic tab; acknowledge emitted document edits without introducing a second history owner.
//   command - Dispatch a focused-source public command.
//   sourceEdits - Observe source operations sent to the document owner.
//   assets - Observe requests to the existing image transport owner.
//   geometry - Set measurable source-pane layout for resize/scroll events.
// END_MODULE_MAP
import { shallowMount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'
import { createI18n } from 'vue-i18n'
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest'
import { setupTestPinia } from '../pinia'

const adapter = vi.hoisted(() => ({ callbacks: new Map(), bus: new Map(), state: null, cm: null, input: null,
  config: null, marks: [], bookmarks: [], observers: [], contentAnchor: 360, coordinates: true }))
vi.mock('@/bus', () => ({ default: {
  on: (name, handler) => { if (!adapter.bus.has(name)) adapter.bus.set(name, new Set()); adapter.bus.get(name).add(handler) },
  off: (name, handler) => { adapter.bus.get(name)?.delete(handler); if (adapter.bus.get(name)?.size === 0) adapter.bus.delete(name) },
  emit: vi.fn((name, payload) => { let result; for (const handler of [...(adapter.bus.get(name) || [])]) result = handler(payload); return result })
} }))
vi.mock('@/services/notification', () => ({ default: { notify: vi.fn() } }))
vi.mock('@/config', () => ({ oneDarkThemes: ['dark'], railscastsThemes: ['contrast'] }))
vi.mock('@/util', () => ({ adjustCursor: cursor => ({ ...cursor }), isOsx: true }))
vi.mock('@tauri-apps/plugin-clipboard-manager', () => ({ readText: vi.fn() }))
vi.mock('@/util/splitScrollSync', async importActual => ({ ...(await importActual()), splitScrollSync: {
  attach: vi.fn(), detach: vi.fn(), align: vi.fn(), fractionOf: vi.fn(() => 0.5)
} }))
vi.mock('@/codeMirror', async () => {
  const { default: NativeCodeMirror } = await import('codemirror/lib/codemirror')
  const clone = pos => ({ line: pos.line, ch: pos.ch })
  const index = pos => {
    const lines = adapter.state.text.split('\n')
    const line = Math.max(0, Math.min(pos.line, lines.length - 1))
    return lines.slice(0, line).reduce((sum, text) => sum + text.length + 1, 0) + Math.max(0, Math.min(pos.ch, lines[line].length))
  }
  const position = offset => {
    const lines = adapter.state.text.slice(0, Math.max(0, Math.min(offset, adapter.state.text.length))).split('\n')
    return { line: lines.length - 1, ch: lines.at(-1).length }
  }
  const cursorEvent = () => adapter.callbacks.get('cursorActivity')?.(adapter.cm)
  const changed = () => {
    if (adapter.doc.getValue() !== adapter.state.text) adapter.doc.setValue(adapter.state.text)
    if (adapter.state.depth) { adapter.state.pending = true; return }
    adapter.callbacks.get('changes')?.(adapter.cm)
    cursorEvent()
  }
  const factory = vi.fn((container, config) => {
    adapter.config = config
    adapter.doc = new NativeCodeMirror.Doc(config.value)
    adapter.state = { text: config.value, anchor: { line: 0, ch: 0 }, head: { line: 0, ch: 0 }, options: { ...config }, depth: 0, pending: false }
    adapter.input = document.createElement('textarea')
    container.appendChild(adapter.input)
    const cm = {
      on: (name, handler) => adapter.callbacks.set(name, handler),
      getDoc: () => adapter.doc,
      swapDoc: next => {
        const old = adapter.doc; adapter.doc = next
        adapter.state.text = next.getValue()
        adapter.state.anchor = clone(next.getCursor('anchor')); adapter.state.head = clone(next.getCursor('head'))
        return old
      },
      getValue: () => adapter.state.text,
      setValue: vi.fn(value => {
        adapter.bookmarks.forEach(bookmark => { bookmark.cleared = true })
        adapter.state.text = value
        adapter.state.anchor = adapter.state.head = { line: 0, ch: 0 }
        changed()
      }),
      getLine: line => adapter.state.text.split('\n')[line] || '',
      getCursor: which => clone(adapter.state[which === 'anchor' ? 'anchor' : 'head']),
      getSelection: () => {
        const a = index(adapter.state.anchor); const h = index(adapter.state.head)
        return adapter.state.text.slice(Math.min(a, h), Math.max(a, h))
      },
      somethingSelected: () => index(adapter.state.anchor) !== index(adapter.state.head),
      posFromIndex: position,
      setSelection: vi.fn((anchor, head = anchor) => {
        adapter.state.anchor = clone(anchor); adapter.state.head = clone(head); cursorEvent()
      }),
      setCursor: pos => cm.setSelection(pos, pos),
      replaceRange: vi.fn((value, from, to = from, origin = '+input') => {
        let cancelled = false
        adapter.callbacks.get('beforeChange')?.(cm, { origin, cancel: () => { cancelled = true } })
        if (cancelled) return
        const a = index(from); const b = index(to); const first = Math.min(a, b); const last = Math.max(a, b)
        for (const bookmark of adapter.bookmarks) {
          if (bookmark.index >= last) bookmark.index += value.length - (last - first)
          else if (bookmark.index >= first) bookmark.index = first + value.length
        }
        adapter.state.text = adapter.state.text.slice(0, first) + value + adapter.state.text.slice(last)
        adapter.state.anchor = adapter.state.head = position(first + value.length)
        changed()
      }),
      replaceSelection: vi.fn((value, _collapse, origin) => cm.replaceRange(value, cm.getCursor('anchor'), cm.getCursor('head'), origin)),
      operation: vi.fn(fn => {
        adapter.state.depth++
        try { return fn() } finally {
          adapter.state.depth--
          if (!adapter.state.depth && adapter.state.pending) { adapter.state.pending = false; changed() }
        }
      }),
      setBookmark: pos => {
        const bookmark = { index: index(pos), cleared: false }
        bookmark.find = () => bookmark.cleared ? undefined : position(bookmark.index)
        bookmark.clear = vi.fn(() => { bookmark.cleared = true })
        adapter.bookmarks.push(bookmark)
        return bookmark
      },
      markText: (start, end, options) => {
        const mark = { start, end, options, clear: vi.fn() }; adapter.marks.push(mark); return mark
      },
      scrollIntoView: vi.fn(),
      getScrollInfo: () => ({ top: container.scrollTop, left: container.scrollLeft }),
      scrollTo: vi.fn((left, top) => { container.scrollLeft = left; container.scrollTop = top }),
      cursorCoords: () => adapter.coordinates ? { top: container.getBoundingClientRect().top + adapter.contentAnchor - container.scrollTop } : null,
      setOption: (name, value) => { adapter.state.options[name] = value }, getOption: name => adapter.state.options[name],
      getInputField: () => adapter.input,
      clearHistory: vi.fn(), refresh: vi.fn(), invalidateImageCache: vi.fn(),
      execCommand: vi.fn(name => { if (name === 'selectAll') cm.setSelection({ line: 0, ch: 0 }, position(adapter.state.text.length)) })
    }
    adapter.cm = cm
    for (const name of ['focus', 'paste', 'drop', 'contextmenu']) {
      adapter.input.addEventListener(name, event => adapter.callbacks.get(name)?.(cm, event))
    }
    return cm
  })
  factory.Pass = 'CodeMirror.Pass'
  return { default: factory, setMode: vi.fn(), setTextDirection: vi.fn(),
    setCursorAtFirstLine: vi.fn(cm => cm.setCursor({ line: 0, ch: 0 })) }
})

import SourceCode from '@/components/editorWithTabs/sourceCode.vue'
import bus from '@/bus'
import notice from '@/services/notification'
import codeMirror, { setTextDirection } from '@/codeMirror'
import { readText } from '@tauri-apps/plugin-clipboard-manager'
import { splitScrollSync } from '@/util/splitScrollSync'
import { useEditorStore } from '@/store/editor'
import { usePreferencesStore } from '@/store/preferences'

let wrapper
let store
const mountSource = ({ markdown = 'alpha beta alpha\nALPHA', focused = 'source', unified = true,
  locked = false, previewMode = false, sourceCode = false, splitActive = true, splitEdit = true, theme = 'light' } = {}) => {
  const pinia = setupTestPinia()
  store = useEditorStore()
  const preferences = usePreferencesStore()
  preferences.sourceCode = sourceCode; preferences.autoSave = false; preferences.theme = theme
  const tab = { id: 'a', markdown, locked, previewMode, isSaved: true, scrollTop: 70,
    cursor: { saved: true }, blocks: ['saved blocks'], history: { stack: [], lastEditIndex: -1 } }
  if (unified) tab.splitSession = { unified: true, focused, source: { anchor: { line: 0, ch: 0 }, head: { line: 0, ch: 0 } } }
  store.currentFile = tab; store.tabs = [store.currentFile]; store.updateTabIdToIndex()
  store.LISTEN_FOR_CONTENT_CHANGE = vi.fn()
  vi.spyOn(store, 'SEARCH'); vi.spyOn(store, 'updateScrollPosition')
  // The peer document owner acknowledges delivered text/focus. Source must
  // still emit one operation and must never commit directly through the store.
  bus.on('split:source-edit', payload => { if (payload.id === store.currentFile.id) store.currentFile.markdown = payload.markdown })
  bus.on('split:focus', focused => { if (store.currentFile.splitSession) store.currentFile.splitSession.focused = focused })
  wrapper = shallowMount(SourceCode, { attachTo: document.body,
    props: { markdown, textDirection: 'ltr', splitActive, splitEdit },
    global: { plugins: [pinia, createI18n({ legacy: false, locale: 'en', messages: { en: {} } })] } })
  return adapter.cm
}
const command = (name, payload) => bus.emit('split:source-command', { command: name, payload })
const sourceEdits = () => bus.emit.mock.calls.filter(([name]) => name === 'split:source-edit').map(([, value]) => value)
const assets = () => bus.emit.mock.calls.filter(([name]) => name === 'split:insert-asset').map(([, value]) => value)
const geometry = ({ width = 600, height = 200, scrollHeight = 1000, top = 20 } = {}) => {
  Object.defineProperties(wrapper.element, { clientWidth: { configurable: true, get: () => width },
    clientHeight: { configurable: true, value: height }, scrollHeight: { configurable: true, value: scrollHeight } })
  wrapper.element.getBoundingClientRect = () => ({ top })
}

beforeEach(() => {
  vi.useFakeTimers()
  adapter.callbacks.clear(); adapter.bus.clear(); adapter.marks = []; adapter.bookmarks = []; adapter.observers = []
  adapter.contentAnchor = 360; adapter.coordinates = true
  vi.stubGlobal('ResizeObserver', class {
    constructor(callback) { this.callback = callback; adapter.observers.push(this) }
    observe = vi.fn()
    disconnect = vi.fn()
    deliver() { this.callback([]) }
  })
  vi.stubGlobal('requestAnimationFrame', fn => setTimeout(() => fn(0), 16))
  vi.stubGlobal('cancelAnimationFrame', id => clearTimeout(id))
  bus.emit.mockClear(); readText.mockResolvedValue(''); splitScrollSync.fractionOf.mockReturnValue(0.5)
})
afterEach(() => {
  wrapper?.unmount(); wrapper = null
  vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals()
})

describe('mounted focused source commands', () => {
  it('ignores rich-focused commands and selection requests until a real source focus event', async () => {
    const cm = mountSource({ focused: 'rich' })
    const untouched = { text: 'rich selection', selected: 'rich' }
    await command('format', 'strong'); await command('search', { value: 'alpha', opt: {} })
    bus.emit('split:source-selection', untouched)
    expect(untouched).toEqual({ text: 'rich selection', selected: 'rich' })
    expect(cm.getValue()).toBe('alpha beta alpha\nALPHA')
    expect(store.SEARCH).not.toHaveBeenCalled(); expect(sourceEdits()).toHaveLength(0)
    adapter.input.focus()
    expect(bus.emit).toHaveBeenCalledWith('split:focus', 'source')
    const focus = vi.spyOn(adapter.input, 'focus')
    await command('focus')
    expect(focus).toHaveBeenCalledWith({ preventScroll: true })
    await command('selectAll')
    expect(cm.getSelection()).toBe('alpha beta alpha\nALPHA')
    const selected = {}; bus.emit('split:source-selection', selected)
    expect(selected).toEqual({ selected: 'alpha beta alpha\nALPHA', text: 'alpha beta alpha\nALPHA' })
    expect(sourceEdits()).toHaveLength(0)
  })

  it('routes the source context menu from the pane actually clicked and suppresses the ancestor menu', async () => {
    const cm = mountSource({ markdown: 'word', focused: 'rich' })
    const parent = vi.fn(); wrapper.element.addEventListener('contextmenu', parent)
    const event = new Event('contextmenu', { bubbles: true, cancelable: true })
    adapter.input.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true); expect(parent).not.toHaveBeenCalled()
    expect(bus.emit).toHaveBeenCalledWith('split:contextmenu', event)
    expect(store.currentFile.splitSession.focused).toBe('source')
    await command('insert', 'new ')
    expect(cm.getValue()).toBe('new word'); expect(sourceEdits()).toHaveLength(1)
  })

  it.each([['dark', 'one-dark'], ['contrast', 'railscasts']])('keeps %s theme/gutter configuration without stealing the rich caret', (theme, expected) => {
    mountSource({ theme, focused: 'rich' })
    expect(adapter.config.theme).toBe(expected); expect(adapter.config.autofocus).toBe(false)
    expect(adapter.config.lineNumberFormatter(1)).toBe(1)
    expect(adapter.config.lineNumberFormatter(10)).toBe(10)
    expect(adapter.config.lineNumberFormatter(2)).toBe('')
    expect(bus.emit.mock.calls.some(([name]) => name === 'split:focus')).toBe(false)
  })

  it('reports reversed multiline selection, and falls back to the document for an empty caret', () => {
    const cm = mountSource({ markdown: 'first\nsecond' })
    cm.setSelection({ line: 1, ch: 3 }, { line: 0, ch: 2 })
    const selection = {}; bus.emit('split:source-selection', selection)
    expect(selection).toEqual({ selected: 'rst\nsec', text: 'rst\nsec' })
    expect(store.currentFile.splitSession.selectedSourceText).toBe('rst\nsec')
    cm.setCursor({ line: 1, ch: 3 })
    const document = {}; bus.emit('split:source-selection', document)
    expect(document).toEqual({ selected: '', text: 'first\nsecond' })
    expect(sourceEdits()).toHaveLength(0); expect(store.LISTEN_FOR_CONTENT_CHANGE).not.toHaveBeenCalled()
  })

  it('searches, wraps focused navigation, replaces one match and then all remaining matches as one operation', async () => {
    const cm = mountSource()
    await command('search', { value: 'alpha', opt: {} })
    expect(store.currentFile.searchMatches).toMatchObject({ value: 'alpha', index: 0, matches: [
      { start: { line: 0, ch: 0 }, end: { line: 0, ch: 5 } },
      { start: { line: 0, ch: 11 }, end: { line: 0, ch: 16 } },
      { start: { line: 1, ch: 0 }, end: { line: 1, ch: 5 } }
    ] })
    expect(adapter.marks.every(mark => mark.options.className === 'ag-highlight')).toBe(true)
    await command('find', 'next'); expect(cm.getCursor('anchor')).toEqual({ line: 0, ch: 11 })
    await command('find', 'prev'); await command('find', 'prev')
    expect(cm.getSelection()).toBe('ALPHA'); expect(cm.scrollIntoView).toHaveBeenLastCalledWith({ line: 1, ch: 0 })
    await command('replace', { value: 'OMEGA', opt: { isSingle: true } })
    expect(cm.getValue()).toBe('alpha beta alpha\nOMEGA'); expect(sourceEdits()).toHaveLength(1)
    expect(store.currentFile.searchMatches.matches).toHaveLength(2)
    bus.emit.mockClear(); cm.operation.mockClear()
    await command('replace', { value: 'A', opt: { isSingle: false } })
    expect(cm.getValue()).toBe('A beta A\nOMEGA')
    expect(sourceEdits()).toMatchObject([{ id: 'a', markdown: 'A beta A\nOMEGA' }])
    expect(cm.operation).toHaveBeenCalledOnce(); expect(store.currentFile.searchMatches.matches).toEqual([])
    expect(store.LISTEN_FOR_CONTENT_CHANGE).not.toHaveBeenCalled()
  })

  it('clears old highlights for empty/invalid searches and removes live marks/listeners on unmount', async () => {
    const cm = mountSource()
    await command('search', { value: 'alpha', opt: { isCaseSensitive: true, isWholeWord: true } })
    const first = [...adapter.marks]; expect(first).toHaveLength(2)
    await command('search', { value: '', opt: {} })
    expect(first.every(mark => mark.clear.mock.calls.length === 1)).toBe(true)
    expect(store.currentFile.searchMatches).toMatchObject({ matches: [], index: -1 })
    cm.scrollIntoView.mockClear(); await command('find', 'next'); expect(cm.scrollIntoView).not.toHaveBeenCalled()
    await command('search', { value: '[', opt: { isRegexp: true } })
    expect(store.currentFile.searchMatches.matches).toEqual([])
    bus.emit.mockClear(); await command('replace', { value: 'unused', opt: { isSingle: true } })
    expect(cm.getValue()).toBe('alpha beta alpha\nALPHA'); expect(sourceEdits()).toHaveLength(0)
    await command('search', { value: 'alpha', opt: {} })
    const live = adapter.marks.slice(-3)
    wrapper.unmount(); wrapper = null
    expect(live.every(mark => mark.clear.mock.calls.length === 1)).toBe(true)
    expect(adapter.bus.has('split:source-command')).toBe(false)
    expect(adapter.bus.has('split:source-selection')).toBe(false)
    expect(splitScrollSync.detach).toHaveBeenCalledWith('source')
    await command('insert', 'late')
    expect(cm.getValue()).toBe('alpha beta alpha\nALPHA')
  })

  it.each([
    ['format', 'strong', '**word**'], ['paragraph', 'heading 2', '## word'],
    ['duplicate', undefined, 'word\nword'],
    ['table', { rows: 2, columns: 2 }, '|   |   |\n| --- | --- |\n|   |   |\n']
  ])('executes %s through the source bus with one document-owner operation', async (name, payload, expected) => {
    const cm = mountSource({ markdown: 'word' }); cm.setSelection({ line: 0, ch: 0 }, { line: 0, ch: 4 })
    bus.emit.mockClear()
    await command(name, payload)
    expect(cm.getValue()).toBe(expected)
    expect(sourceEdits()).toMatchObject([{ id: 'a', markdown: expected }])
    const names = bus.emit.mock.calls.map(([name]) => name)
    expect(names.indexOf('split:flush')).toBeLessThan(names.indexOf('split:source-edit'))
    expect(store.LISTEN_FOR_CONTENT_CHANGE).not.toHaveBeenCalled()
  })

  it('formats via the source keymap, exposes unavailable commands and never edits on a declined transform', async () => {
    const cm = mountSource({ markdown: 'word' }); cm.setSelection({ line: 0, ch: 0 }, { line: 0, ch: 4 })
    adapter.config.extraKeys['Cmd-B'](cm)
    expect(cm.getValue()).toBe('**word**'); expect(cm.getSelection()).toBe('word')
    bus.emit.mockClear(); await command('paragraph', 'loose-list-item')
    expect(notice.notify).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'info', message: expect.stringMatching(/requires.*list/) }))
    await command('format', 'unsupported')
    expect(notice.notify).toHaveBeenLastCalledWith(expect.objectContaining({ message: expect.stringMatching(/unavailable.*unsupported/) }))
    expect(cm.getValue()).toBe('**word**'); expect(sourceEdits()).toHaveLength(0)
  })

  it('transforms the selected range or whole document, and format-document is idempotent', async () => {
    const cm = mountSource({ markdown: 'one two' }); cm.setSelection({ line: 0, ch: 4 }, { line: 0, ch: 7 })
    await command('transform', 'THREE'); expect(cm.getValue()).toBe('one THREE')
    cm.setCursor({ line: 0, ch: 0 }); await command('transform', 'Title\n=====\ntext  ')
    expect(cm.getValue()).toBe('Title\n=====\ntext  ')
    await command('formatDocument')
    expect(cm.getValue()).toBe('# Title\n\ntext')
    bus.emit.mockClear(); await command('formatDocument')
    expect(sourceEdits()).toHaveLength(0); expect(cm.getValue()).toBe('# Title\n\ntext')
  })

  it('keeps readonly selection/search available but blocks every mutating command and image input', async () => {
    const cm = mountSource({ locked: true })
    await command('selectAll'); const selection = {}; bus.emit('split:source-selection', selection)
    expect(selection.text).toBe('alpha beta alpha\nALPHA')
    await command('search', { value: 'alpha', opt: {} }); await command('find', 'next')
    expect(cm.getSelection()).toBe('alpha')
    bus.emit.mockClear()
    for (const name of ['replace', 'transform', 'formatDocument', 'insertAsset', 'pasteAsPlainText']) await command(name, {})
    const event = new Event('paste', { bubbles: true, cancelable: true })
    Object.defineProperty(event, 'clipboardData', { value: { files: [new File(['x'], 'photo.png', { type: 'image/png' })] } })
    adapter.input.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true); expect(assets()).toHaveLength(0)
    expect(readText).not.toHaveBeenCalled(); expect(sourceEdits()).toHaveLength(0)
    expect(bus.emit.mock.calls.some(([name]) => name === 'split:flush')).toBe(false)
    expect(cm.getValue()).toBe('alpha beta alpha\nALPHA')
  })

  it('pastes clipboard text once and rejects an empty result or completion for a newly readonly tab', async () => {
    const cm = mountSource({ markdown: 'word' }); cm.setSelection({ line: 0, ch: 0 }, { line: 0, ch: 4 })
    readText.mockResolvedValueOnce('plain\ntext'); await command('pasteAsPlainText')
    expect(cm.getValue()).toBe('plain\ntext'); expect(sourceEdits()).toHaveLength(1)
    bus.emit.mockClear(); await command('pasteAsPlainText'); expect(sourceEdits()).toHaveLength(0)
    let resolve; readText.mockImplementationOnce(() => new Promise(done => { resolve = done }))
    const pending = command('pasteAsPlainText'); await flushPromises()
    store.currentFile.locked = true; await nextTick(); resolve('late clipboard'); await pending
    expect(cm.getValue()).toBe('plain\ntext'); expect(sourceEdits()).toHaveLength(0)
  })

  it('rejects clipboard completion after tab ownership changes', async () => {
    const cm = mountSource({ markdown: 'outgoing' })
    const outgoing = store.currentFile
    let resolve; readText.mockImplementationOnce(() => new Promise(done => { resolve = done }))
    const pending = command('pasteAsPlainText'); await flushPromises()
    store.currentFile = { id: 'b', markdown: 'incoming', splitSession: { unified: true, focused: 'source' } }
    store.tabs.push(store.currentFile); await nextTick()
    resolve('stale clipboard'); await pending
    expect(cm.getValue()).toBe('incoming'); expect(outgoing.markdown).toBe('outgoing')
    expect(sourceEdits()).toHaveLength(0)
  })
})

describe('source asset ownership and asynchronous completion', () => {
  it.each(['paste', 'drop'])('owns image %s once and prevents the ancestor pipeline from processing it again', name => {
    const cm = mountSource({ markdown: 'before ' }); cm.setCursor({ line: 0, ch: 7 })
    const parent = vi.fn(); wrapper.element.addEventListener(name, parent)
    const event = new Event(name, { bubbles: true, cancelable: true })
    const image = new File(['pixels'], 'diagram.png', { type: 'image/png' })
    Object.defineProperty(event, name === 'paste' ? 'clipboardData' : 'dataTransfer', { value: { files: [image, new File(['text'], 'notes.txt', { type: 'text/plain' })] } })
    adapter.input.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true); expect(parent).not.toHaveBeenCalled()
    expect(assets()).toHaveLength(1); const upload = assets()[0]
    expect(upload).toMatchObject({ id: 'a', image, alt: 'diagram' })
    expect(sourceEdits()).toHaveLength(0)
    cm.replaceRange('typed ', { line: 0, ch: 0 }); bus.emit.mockClear()
    const request = adapter.bookmarks[0]
    expect(request.cleared).toBe(false)
    upload.complete('images/diagram.png')
    expect(cm.getValue()).toBe('typed before ![diagram](images/diagram.png)')
    expect(sourceEdits()).toMatchObject([{ id: 'a', markdown: 'typed before ![diagram](images/diagram.png)' }])
    expect(request.clear).toHaveBeenCalledOnce(); expect(store.LISTEN_FOR_CONTENT_CHANGE).not.toHaveBeenCalled()
  })

  it('handles nameless clipboard images and an omitted command alt without duplicate commits', async () => {
    const cm = mountSource({ markdown: '' })
    const image = new Blob(['pixels'], { type: 'image/png' })
    const paste = new Event('paste', { bubbles: true, cancelable: true })
    Object.defineProperty(paste, 'clipboardData', { value: { files: [image] } })
    adapter.input.dispatchEvent(paste)
    expect(assets()).toHaveLength(1); expect(assets()[0].alt).toBe('')
    assets()[0].complete('images/paste.png')
    expect(cm.getValue()).toBe('![](images/paste.png)')
    await command('insertAsset', { image })
    expect(assets()).toHaveLength(2); expect(assets()[1].alt).toBe('')
    assets()[1].complete('images/insert.png')
    expect(cm.getValue()).toBe('![](images/paste.png)![](images/insert.png)')
    expect(sourceEdits()).toHaveLength(2)
    expect(store.LISTEN_FOR_CONTENT_CHANGE).not.toHaveBeenCalled()
  })

  it('preserves never-unified native image and undo ownership', () => {
    const cm = mountSource({ unified: false, sourceCode: true, splitActive: false, splitEdit: false })
    const parent = vi.fn(); wrapper.element.addEventListener('paste', parent)
    const event = new Event('paste', { bubbles: true, cancelable: true })
    Object.defineProperty(event, 'clipboardData', { value: { files: [new File(['x'], 'a.png', { type: 'image/png' })] } })
    adapter.input.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(false); expect(parent).toHaveBeenCalledOnce()
    expect(assets()).toHaveLength(0)
    adapter.config.extraKeys['Cmd-Z'](cm)
    expect(cm.execCommand).toHaveBeenCalledWith('undo'); expect(cm.getOption('undoDepth')).toBe(200)
    expect(bus.emit.mock.calls.some(([name]) => name === 'undo')).toBe(false)
  })

  it.each([
    [{ line: 0, ch: 2 }, { line: 0, ch: 2 }],
    [{ line: 0, ch: 10 }, { line: 0, ch: 17 }],
    [{ line: 0, ch: 25 }, { line: 0, ch: 20 }],
    [{ line: 1, ch: 2 }, { line: 1, ch: 2 }]
  ])('completes a visible image placeholder while preserving the caret at %j', (before, after) => {
    const cm = mountSource({ markdown: 'pre ![upload](loading) tail\nnext' }); cm.setCursor(before)
    bus.emit('image-action', { id: 'upload', alt: 'x', result: 'img.png' })
    expect(cm.getValue()).toBe('pre ![x](img.png) tail\nnext')
    expect(cm.getCursor('head')).toEqual(after); expect(cm.getCursor('anchor')).toEqual(after)
    expect(sourceEdits()).toHaveLength(1)
    bus.emit.mockClear(); bus.emit('image-action', { id: 'removed', alt: 'late', result: 'unused.png' })
    expect(cm.getValue()).toBe('pre ![x](img.png) tail\nnext'); expect(sourceEdits()).toHaveLength(0)
  })

  it('leaves non-image native input with its original owner', () => {
    mountSource()
    const plain = new Event('paste', { bubbles: true, cancelable: true })
    Object.defineProperty(plain, 'clipboardData', { value: { files: [new File(['text'], 'notes.txt', { type: 'text/plain' })] } })
    adapter.input.dispatchEvent(plain)
    expect(plain.defaultPrevented).toBe(false); expect(assets()).toHaveLength(0)
    const absent = new Event('drop', { bubbles: true, cancelable: true }); adapter.input.dispatchEvent(absent)
    expect(absent.defaultPrevented).toBe(false)
  })

  it.each(['locked', 'previewMode', 'tab-switch', 'outgoing-before-vue', 'cleared-bookmark', 'unmounted', 'empty-result'])('discards %s asset completion without mutating either document', async boundary => {
    const cm = mountSource({ markdown: 'original' }); cm.setCursor({ line: 0, ch: 8 })
    await command('insertAsset', { image: new File(['x'], 'a.png', { type: 'image/png' }), alt: 'alt' })
    const request = assets()[0]; const bookmark = adapter.bookmarks[0]
    if (boundary === 'locked' || boundary === 'previewMode') { store.currentFile[boundary] = true; await nextTick() }
    if (boundary === 'tab-switch' || boundary === 'outgoing-before-vue') {
      store.currentFile = { id: 'b', markdown: 'other tab', splitSession: { unified: true, focused: 'source' } }
      store.tabs.push(store.currentFile); if (boundary === 'tab-switch') await nextTick()
    }
    if (boundary === 'cleared-bookmark') {
      store.currentFile.markdown = 'external reload'; bus.emit('file-changed', { id: 'a', markdown: 'external reload', contentReloaded: true })
    }
    if (boundary === 'unmounted') { wrapper.unmount(); wrapper = null }
    const before = cm.getValue(); bus.emit.mockClear(); request.complete(boundary === 'empty-result' ? null : 'late.png')
    expect(cm.getValue()).toBe(before); expect(sourceEdits()).toHaveLength(0)
    expect(bookmark.clear).toHaveBeenCalledOnce(); expect(store.LISTEN_FOR_CONTENT_CHANGE).not.toHaveBeenCalled()
  })
})

describe('source focus, scroll and composition lifecycle', () => {
  it('centers the focused caret on split activation/resize while rich-focused resize aligns without moving its selection', async () => {
    const cm = mountSource({ markdown: 'word', splitActive: false }); geometry(); wrapper.element.scrollTop = 60
    await wrapper.setProps({ splitActive: true }); await nextTick(); await vi.advanceTimersByTimeAsync(48)
    expect(wrapper.element.scrollTop).toBe(260)
    expect(splitScrollSync.align).toHaveBeenCalledWith('rich', 0.325)
    const selection = { anchor: cm.getCursor('anchor'), head: cm.getCursor('head') }
    adapter.observers[0].deliver(); vi.advanceTimersByTime(16)
    expect(cm.refresh).toHaveBeenCalledOnce(); expect(wrapper.element.scrollTop).toBe(260)
    expect({ anchor: cm.getCursor('anchor'), head: cm.getCursor('head') }).toEqual(selection)
    store.currentFile.splitSession.focused = 'rich'; geometry({ width: 640 }); adapter.observers[0].deliver(); vi.advanceTimersByTime(16)
    expect(splitScrollSync.align).toHaveBeenLastCalledWith('source', 0.5)
    expect(cm.refresh).toHaveBeenCalledTimes(2)
    geometry({ width: 650 }); adapter.observers[0].deliver(); wrapper.unmount(); wrapper = null; vi.advanceTimersByTime(32)
    expect(cm.refresh).toHaveBeenCalledTimes(2); expect(adapter.observers[0].disconnect).toHaveBeenCalledOnce()
  })

  it('does not jump when CodeMirror has no measurable caret during split activation', async () => {
    mountSource({ markdown: 'word', splitActive: false }); geometry(); wrapper.element.scrollTop = 60
    adapter.coordinates = false
    await wrapper.setProps({ splitActive: true }); await nextTick(); await vi.advanceTimersByTimeAsync(48)
    expect(wrapper.element.scrollTop).toBe(60)
    expect(splitScrollSync.align).toHaveBeenCalledWith('rich', 0.075)
    expect(sourceEdits()).toHaveLength(0)
  })

  it('stores source scrolling only for the current owner and cancels no-op width notifications', async () => {
    const cm = mountSource(); geometry()
    adapter.observers[0].deliver(); vi.advanceTimersByTime(16); cm.refresh.mockClear()
    adapter.observers[0].deliver(); vi.advanceTimersByTime(16); expect(cm.refresh).not.toHaveBeenCalled()
    wrapper.element.scrollTop = 240; await wrapper.trigger('scroll'); vi.advanceTimersByTime(100)
    expect(store.currentFile.splitSession.sourceScrollTop).toBe(240)
    expect(store.updateScrollPosition).not.toHaveBeenCalled(); expect(sourceEdits()).toHaveLength(0)
  })

  it('defers a composing surface, merges its real edit with peer text and renders once at compositionend without echo', async () => {
    const cm = mountSource({ markdown: '* item\nword' }); cm.setCursor({ line: 1, ch: 4 })
    adapter.input.dispatchEvent(new Event('compositionstart'))
    store.currentFile.markdown = '# Peer\n* item\nword'; await wrapper.setProps({ markdown: store.currentFile.markdown })
    vi.advanceTimersByTime(150); expect(cm.getValue()).toBe('* item\nword')
    cm.replaceSelection('漢', 'end', '+input')
    expect(sourceEdits()).toMatchObject([{ id: 'a', markdown: '# Peer\n* item\nword漢' }])
    adapter.input.dispatchEvent(new Event('compositionend'))
    expect(cm.getValue()).toBe('# Peer\n* item\nword漢')
    expect(cm.getCursor('head')).toEqual({ line: 2, ch: 5 })
    expect(sourceEdits()).toHaveLength(1); expect(store.LISTEN_FOR_CONTENT_CHANGE).not.toHaveBeenCalled()
  })

  it('retains never-unified cursor/tab commits and its native selection ownership', async () => {
    const cm = mountSource({ markdown: 'plain source', unified: false, sourceCode: true, splitActive: false, splitEdit: false })
    cm.setCursor({ line: 0, ch: 5 })
    expect(store.LISTEN_FOR_CONTENT_CHANGE).not.toHaveBeenCalled()
    expect(store.currentFile.muyaIndexCursor).toEqual({anchor:{line:0,ch:5},focus:{line:0,ch:5}})
    expect(store.currentFile.isSaved).toBe(true)
    expect(adapter.config.extraKeys['Cmd-B'](cm)).toBe(codeMirror.Pass)
    const external = document.createElement('input'); external.value = 'find field'; document.body.appendChild(external); external.focus()
    bus.emit('selectAll'); expect(external.selectionStart).toBe(0); expect(external.selectionEnd).toBe(10)
    expect(cm.execCommand).not.toHaveBeenCalled(); external.remove()
    bus.emit('selectAll'); expect(cm.getSelection()).toBe('plain source')
    store.LISTEN_FOR_CONTENT_CHANGE.mockImplementation(({id,markdown}) => {
      store.tabs.find(tab=>tab.id===id).markdown=markdown
    })
    cm.replaceRange(' draft', { line: 0, ch: 12 })
    expect(store.currentFile.markdown).toBe('plain source draft')
    store.LISTEN_FOR_CONTENT_CHANGE.mockClear()
    store.currentFile = { id: 'b', markdown: 'next source' }; store.tabs.push(store.currentFile); await nextTick()
    expect(store.LISTEN_FOR_CONTENT_CHANGE).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ id: 'a', markdown: 'plain source draft' }))
    expect(cm.getValue()).toBe('next source'); expect(sourceEdits()).toHaveLength(0)
    await wrapper.setProps({ textDirection: 'rtl' }); expect(setTextDirection).toHaveBeenCalledWith(cm, 'rtl')
    bus.emit('invalidate-image-cache'); expect(cm.invalidateImageCache).toHaveBeenCalledOnce()
  })
})
