// FILE: tests/renderer/components/split-dual-edit.test.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Execute source component lifecycle, change routing, render guards, IME, readonly and command behavior.
//   SCOPE: Mounted Vue component with a synchronous instrumented CodeMirror adapter; actual editors run in Playwright.
//   DEPENDS: Vue Test Utils, Vitest, Pinia, sourceCode.vue.
//   LINKS: C-STABILIZE-SPLIT-DUAL-EDIT R-1..R-7.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
// START_MODULE_MAP
//   adapter - Instrumented CodeMirror state and native callback registry.
//   wrapper - Mounted component lifecycle owner.
//   store - Current tab store fixture.
//   mountSource - Unified tab and mounted component fixture.
// END_MODULE_MAP
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - Recovery missing component suite.
// END_CHANGE_SUMMARY
import { shallowMount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { createI18n } from 'vue-i18n'
import { setupTestPinia } from '../pinia'
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest'

const adapter = vi.hoisted(() => ({ callbacks: new Map(), bus: new Map(), text: '', selection: null, options: {}, input: null, config: null }))
vi.mock('@/bus', () => ({ default: {
  on: (name, fn) => adapter.bus.set(name, fn),
  off: (name, fn) => { if (adapter.bus.get(name) === fn) adapter.bus.delete(name) },
  emit: vi.fn((name, payload) => adapter.bus.get(name)?.(payload))
} }))
vi.mock('@/services/notification', () => ({ default: { notify: vi.fn() } }))
vi.mock('@/config', () => ({ oneDarkThemes: [], railscastsThemes: [] }))
vi.mock('@/util', () => ({ adjustCursor: cursor => cursor, isOsx: true }))
vi.mock('@/codeMirror', () => {
  const cm = {
    on: (name, fn) => adapter.callbacks.set(name, fn),
    getValue: () => adapter.text,
    setValue: value => { adapter.text = value; adapter.callbacks.get('changes')?.(cm); adapter.callbacks.get('cursorActivity')?.(cm) },
    getCursor: which => adapter.selection[which === 'anchor' ? 'anchor' : 'head'],
    getSelection: () => adapter.text.slice(adapter.selection.anchor.ch, adapter.selection.head.ch),
    getLine: line => adapter.text.split('\n')[line] || '',
    setSelection: (anchor, head) => { adapter.selection = { anchor, head }; adapter.callbacks.get('cursorActivity')?.(cm) },
    getScrollInfo: () => ({ top: 0, left: 0 }), scrollTo: vi.fn(),
    setOption: (key, value) => { adapter.options[key] = value }, getOption: key => adapter.options[key],
    getInputField: () => adapter.input, clearHistory: vi.fn(), refresh: vi.fn(),
    focus: () => adapter.callbacks.get('focus')?.(cm), execCommand: vi.fn(),
    cursorCoords: () => ({ top: 0 }), invalidateImageCache: vi.fn()
  }
  return { default: vi.fn((container, config) => { adapter.config = config; adapter.text = config.value; return cm }), setMode: vi.fn(), setCursorAtFirstLine: vi.fn(), setTextDirection: vi.fn() }
})
import SourceCode from '@/components/editorWithTabs/sourceCode.vue'
import bus from '@/bus'
import { useEditorStore } from '@/store/editor'
import { usePreferencesStore } from '@/store/preferences'
import codeMirror from '@/codeMirror'

let wrapper
let store
const mountSource = () => {
  const pinia = setupTestPinia()
  store = useEditorStore()
  usePreferencesStore().sourceCode = false
  store.currentFile = { id: 'a', markdown: '* one\ntarget', splitSession: { unified: true, focused: 'source', source: { anchor: { line: 1, ch: 4 }, head: { line: 1, ch: 2 } } } }
  store.tabs = [store.currentFile]
  store.LISTEN_FOR_CONTENT_CHANGE = vi.fn()
  wrapper = shallowMount(SourceCode, { props: { markdown: store.currentFile.markdown, textDirection: 'ltr', splitActive: true, splitEdit: true }, global: { plugins: [pinia, createI18n({ legacy: false, locale: 'en', messages: { en: {} } })] } })
  return codeMirror.mock.results.at(-1).value
}
beforeEach(() => {
  vi.useFakeTimers()
  adapter.callbacks.clear(); adapter.bus.clear(); adapter.options = {}; adapter.selection = { anchor: { line: 0, ch: 0 }, head: { line: 0, ch: 0 } }
  adapter.input = document.createElement('textarea')
  globalThis.ResizeObserver = class { observe() {} disconnect() {} }
  bus.emit.mockClear()
})
afterEach(() => { wrapper?.unmount(); wrapper = null; vi.useRealTimers() })

describe('unified source component', () => {
  it('routes one real content operation once; caret-only movement never commits', () => {
    const cm = mountSource()
    adapter.text = '* one\ntarget edited'
    adapter.callbacks.get('changes')(cm)
    expect(bus.emit.mock.calls.filter(([name]) => name === 'split:source-edit')).toHaveLength(1)
    adapter.callbacks.get('cursorActivity')(cm)
    expect(bus.emit.mock.calls.filter(([name]) => name === 'split:source-edit')).toHaveLength(1)
    expect(store.LISTEN_FOR_CONTENT_CHANGE).not.toHaveBeenCalled()
  })
  it('translates reversed selection on render-only updates without a content echo', async () => {
    const cm = mountSource()
    store.currentFile.markdown = 'new\n* one\ntarget'
    await wrapper.setProps({ markdown: store.currentFile.markdown })
    vi.advanceTimersByTime(150)
    expect(adapter.selection).toEqual({ anchor: { line: 2, ch: 4 }, head: { line: 2, ch: 2 } })
    expect(cm.clearHistory).toHaveBeenCalled()
    expect(bus.emit.mock.calls.filter(([name]) => name === 'split:source-edit')).toHaveLength(0)
  })
  it('reconciles a new tab after Vue ownership changes even if its early bus event was missed', async () => {
    mountSource()
    store.currentFile = { id: 'b', markdown: '# Tab B', splitSession: { unified: true, focused: 'source', source: { anchor: { line: 0, ch: 3 }, head: { line: 0, ch: 1 } } } }
    await nextTick()
    expect(adapter.text).toBe('# Tab B')
    expect(adapter.selection).toEqual(store.currentFile.splitSession.source)
    expect(bus.emit.mock.calls.filter(([name]) => name === 'split:source-edit')).toHaveLength(0)
  })
  it('rejects a stale unified event while switching into a never-unified tab', async () => {
    mountSource()
    const outgoing = store.currentFile
    const incoming = { id: 'plain', markdown: '# Plain source' }
    store.tabs = [outgoing, incoming]
    store.currentFile = incoming
    adapter.bus.get('file-changed')({ id: outgoing.id, markdown: '# Stale outgoing text' })
    expect(adapter.text).toBe('* one\ntarget')
    await nextTick()
    expect(adapter.text).toBe(incoming.markdown)
    expect(store.LISTEN_FOR_CONTENT_CHANGE).not.toHaveBeenCalled()
  })
  it('routes keymap and residual native undo/redo to the single owner in every unified mode', async () => {
    const cm = mountSource()
    expect(adapter.options.undoDepth).toBe(0)
    adapter.config.extraKeys['Cmd-Z'](cm)
    expect(bus.emit).toHaveBeenCalledWith('undo')
    const cancel = vi.fn()
    adapter.callbacks.get('beforeChange')(cm, { origin: 'redo', cancel })
    expect(cancel).toHaveBeenCalledOnce()
    await Promise.resolve()
    expect(bus.emit).toHaveBeenCalledWith('redo')
    await wrapper.setProps({ splitActive: false, splitEdit: false })
    adapter.config.extraKeys['Ctrl-Z'](cm)
    expect(bus.emit.mock.calls.filter(([name]) => name === 'undo')).toHaveLength(2)
  })
  it('fences its own composition and applies the latest deferred render exactly at compositionend', async () => {
    mountSource()
    adapter.input.dispatchEvent(new Event('compositionstart'))
    store.currentFile.markdown = '* latest'
    await wrapper.setProps({ markdown: '* latest' })
    vi.advanceTimersByTime(150)
    expect(adapter.text).toBe('* one\ntarget')
    adapter.input.dispatchEvent(new Event('compositionend'))
    expect(adapter.text).toBe('* latest')
    expect(bus.emit.mock.calls.filter(([name]) => name === 'split:source-edit')).toHaveLength(0)
  })
  it('applies document lock and preview readonly while preserving selection/copy', async () => {
    mountSource()
    store.currentFile.locked = true; await nextTick()
    expect(adapter.options.readOnly).toBe(true)
    store.currentFile.locked = false; store.currentFile.previewMode = true; await nextTick()
    expect(adapter.options.readOnly).toBe(true)
    const event = { preventDefault: vi.fn(), stopPropagation: vi.fn() }
    const cm = codeMirror.mock.results.at(-1).value
    adapter.callbacks.get('paste')(cm, event)
    expect(event.preventDefault).toHaveBeenCalledOnce()
    expect(event.stopPropagation).toHaveBeenCalledOnce()
    expect(adapter.bus.has('split:source-selection')).toBe(true)
  })
  it('releases bus and composition listeners without re-emitting stale text on unmount', () => {
    mountSource()
    wrapper.unmount(); wrapper = null
    expect(adapter.bus.has('split:source-command')).toBe(false)
    expect(adapter.bus.has('split:history-restored')).toBe(false)
    expect(bus.emit.mock.calls.filter(([name]) => name === 'file-changed')).toHaveLength(0)
    adapter.input.dispatchEvent(new Event('compositionend'))
  })
})
