// FILE: tests/renderer/components/sourceCode.test.js
// VERSION: 1.1.0
// START_MODULE_CONTRACT
//   PURPOSE: Verify ordinary Source lifetime ownership through the mounted adapter and actual CodeMirror history.
//   SCOPE: Real Doc undo/redo, tab activation, selection retention, lifetime replacement, remount and composition.
//   DEPENDS: Vue Test Utils, Pinia, CodeMirror 5, sourceCode.vue.
//   LINKS: M-011, M-012; C-SOURCE-HISTORY-OWNERSHIP.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
// START_MODULE_MAP
//   i18n - Minimal component translations.
//   FORMAT - Exact saved byte policy.
//   wrapper - Mounted Source lifecycle owner.
//   store - Actual Pinia document store.
//   makeTab - Live lifetime fixture with independent saved checkpoint.
//   mountSource - Mount the real Source adapter with actual CodeMirror.
//   selectTab - Deliver tab activation through the public bus.
//   edit - Enter one separately undoable native CodeMirror operation.
// END_MODULE_MAP
// START_CHANGE_SUMMARY
//   LAST_CHANGE: 2026-11-11 C-SOURCE-HISTORY-OWNERSHIP: failing-first actual CodeMirror document ownership regressions.
// END_CHANGE_SUMMARY
import { shallowMount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'
import { setupTestPinia } from '../pinia'
import { createI18n } from 'vue-i18n'
import { documentOwner } from '@/util/documentSnapshot'
vi.mock('@/bus', async () => ({ default: (await import('mitt')).default() }))
vi.mock('@/codeMirror', async () => {
  const { default: CodeMirror } = await import('codemirror/lib/codemirror')
  return { default: vi.fn((container, config) => CodeMirror(container, config)),
    setMode: vi.fn(), setCursorAtFirstLine: cm => cm.setCursor(0, 0), setTextDirection: (cm, direction) => cm.setOption('direction', direction) }
})
vi.mock('muya/lib/utils', () => ({ debounce: fn => fn, wordCount: () => ({ word: 1, character: 10, paragraph: 1 }) }))
vi.mock('@/util', () => ({ adjustCursor: cursor => cursor, isOsx: true }))
vi.mock('@tauri-apps/plugin-clipboard-manager', () => ({ readText: vi.fn() }))
vi.mock('@/config', () => ({ oneDarkThemes: [], railscastsThemes: [] }))
import SourceCode from '@/components/editorWithTabs/sourceCode.vue'
import codeMirror from '@/codeMirror'
import bus from '@/bus'
import { readText } from '@tauri-apps/plugin-clipboard-manager'
import { useEditorStore, __resetBootPhase } from '@/store/editor'
import { usePreferencesStore } from '@/store/preferences'
const i18n = createI18n({ legacy: false, locale: 'en', messages: { en: {} } })
const FORMAT = { encoding: 'utf8', isBom: false, lineEnding: 'lf', finalNewline: 3 }
let wrapper
let store
const makeTab = (id, markdown, pathname = '/fixture/' + id + '.md') => ({ id, markdown, pathname,
  filename: id + '.md', savedMarkdown: markdown, savedFormat: { ...FORMAT },
  encoding: { encoding: 'utf8', isBom: false }, lineEnding: 'lf', trimTrailingNewline: 3,
  isSaved: true, contentRevision: 0, notifications: [], history: { stack: [], index: -1, lastEditIndex: -1 } })
const mountSource = async (tab = makeTab('a', '# A\n\nONLY A\n'), existingPinia = null, errorHandler = null) => {
  const pinia = existingPinia || setupTestPinia()
  store = useEditorStore()
  usePreferencesStore().sourceCode = true; usePreferencesStore().autoSave = false
  if (!existingPinia) { store.tabs = [tab]; store.currentFile = tab; store.updateTabIdToIndex(); store.END_BOOT_PHASE() }
  wrapper = shallowMount(SourceCode, { attachTo: document.body,
    props: { markdown: store.currentFile.markdown, textDirection: 'ltr' }, global: { plugins: [pinia, i18n], config: errorHandler ? { errorHandler } : {} } })
  await nextTick()
  return { cm: codeMirror.mock.results.at(-1).value, pinia }
}
const selectTab = async tab => {
  if (!store.tabs.some(t => t.id === tab.id)) store.tabs.push(tab)
  store.currentFile = store.tabs.find(t => t.id === tab.id)
  store.updateTabIdToIndex()
  bus.emit('file-changed', store.currentFile)
  await nextTick()
}
const edit = (cm, suffix) => {
  cm.changeGeneration(true)
  const end = cm.posFromIndex(cm.getValue().length - 1)
  cm.replaceRange(suffix, end, end, '+input')
}
beforeEach(() => {
  vi.useFakeTimers(); __resetBootPhase(); bus.all.clear()
  globalThis.ResizeObserver = class { observe() {} disconnect() {} }
  Object.defineProperty(Range.prototype, 'getBoundingClientRect', { configurable: true, value: () => ({ left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 }) })
  Object.defineProperty(Range.prototype, 'getClientRects', { configurable: true, value: () => [] })
})
afterEach(() => {
  wrapper?.unmount(); wrapper = null; bus.all.clear(); vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks()
  delete Range.prototype.getBoundingClientRect; delete Range.prototype.getClientRects
  document.body.innerHTML = ''
})
it('a fresh Source B has no import undo or redo from A', async () => {
  const { cm } = await mountSource()
  const b = makeTab('b', '# B\n\nONLY B\n')
  await selectTab(b)
  cm.undo()
  expect(cm.getValue()).toBe(b.savedMarkdown)
  expect(store.currentFile.markdown).toBe(b.savedMarkdown)
  expect(store.currentFile.pathname).toBe('/fixture/b.md')
  cm.redo()
  expect(cm.getValue()).toBe(b.savedMarkdown)
  expect(cm.historySize()).toEqual({ undo: 0, redo: 0 })
})
it('retains each document redo branch and reversed selection across A to B to A', async () => {
  const { cm } = await mountSource()
  const a = store.currentFile
  edit(cm, ' ONE'); edit(cm, ' TWO'); cm.undo()
  const aOne = '# A\n\nONLY A ONE\n'
  expect(cm.getValue()).toBe(aOne)
  cm.setSelection({ line: 2, ch: 8 }, { line: 2, ch: 2 })
  const b = makeTab('b', '# B\n\nONLY B\n')
  await selectTab(b); edit(cm, ' B EDIT')
  expect(store.currentFile.isSaved).toBe(false)
  await selectTab(a)
  expect(cm.getValue()).toBe(aOne)
  expect(cm.getCursor('anchor')).toMatchObject({ line: 2, ch: 8 })
  expect(cm.getCursor('head')).toMatchObject({ line: 2, ch: 2 })
  cm.redo(); expect(cm.getValue()).toBe('# A\n\nONLY A ONE TWO\n')
  cm.undo(); expect(cm.getValue()).toBe(aOne)
  await selectTab(b); cm.undo()
  expect(cm.getValue()).toBe(b.savedMarkdown)
  expect(store.currentFile.isSaved).toBe(true)
  expect(a.savedMarkdown).toBe('# A\n\nONLY A\n')
})
it('remounts the same live ordinary document with its own undo/redo and selection', async () => {
  const { cm, pinia } = await mountSource()
  edit(cm, ' ONE'); edit(cm, ' TWO'); cm.undo()
  cm.setSelection({ line: 2, ch: 7 }, { line: 2, ch: 1 })
  wrapper.unmount(); wrapper = null
  const next = (await mountSource(null, pinia)).cm
  expect(next.getValue()).toBe('# A\n\nONLY A ONE\n')
  expect(next.getCursor('anchor')).toMatchObject({ line: 2, ch: 7 })
  expect(next.getCursor('head')).toMatchObject({ line: 2, ch: 1 })
  next.redo(); expect(next.getValue()).toBe('# A\n\nONLY A ONE TWO\n')
})
it('retires a same-id, same-path replacement token instead of committing outgoing text to it', async () => {
  const { cm } = await mountSource(); edit(cm, ' OLD')
  const retired = { ...documentOwner(store.currentFile) }
  const replacement = makeTab('a', '# REOPENED\n', store.currentFile.pathname)
  documentOwner(replacement)
  store.tabs = [replacement]; store.currentFile = replacement; store.updateTabIdToIndex()
  bus.emit('file-changed', store.currentFile); await nextTick()
  expect(cm.getValue()).toBe('# REOPENED\n')
  cm.undo(); expect(cm.getValue()).toBe('# REOPENED\n')
  bus.emit('file-changed', { ...retired, markdown: 'STALE OUTGOING' })
  expect(cm.getValue()).toBe('# REOPENED\n')
  expect(store.currentFile.markdown).toBe('# REOPENED\n')
  expect(store.currentFile.isSaved).toBe(true)
})
it('does not bind a late outgoing file event while another document is selected', async () => {
  const { cm } = await mountSource(); const a = store.currentFile
  await selectTab(makeTab('b', '# B\n'))
  bus.emit('file-changed', { ...a, markdown: 'FOREIGN LATE A' })
  expect(cm.getValue()).toBe('# B\n')
  cm.undo(); expect(cm.getValue()).toBe('# B\n')
})
it('replaces history on canonical reload without a false dirty checkpoint', async () => {
  const { cm } = await mountSource(); edit(cm, ' OLD')
  store.currentFile.markdown = store.currentFile.savedMarkdown = '# RELOADED\n'
  store.currentFile.isSaved = true
  bus.emit('file-changed', { ...store.currentFile, contentReloaded: true })
  await nextTick(); cm.undo()
  expect(cm.getValue()).toBe('# RELOADED\n'); expect(store.currentFile.isSaved).toBe(true)
})
it('blocks extraction during IME and commits only the outgoing owner before deferred activation', async () => {
  const { cm } = await mountSource(); const a = store.currentFile
  cm.getInputField().dispatchEvent(new CompositionEvent('compositionstart'))
  edit(cm, ' 漢')
  expect(a.markdown).toBe(a.savedMarkdown)
  const reads = vi.spyOn(cm, 'getValue')
  const b = makeTab('b', '# B\n')
  await selectTab(b)
  // Composition-first admission checks must not extract the outgoing model.
  expect(a.markdown).toBe(a.savedMarkdown)
  expect(reads).not.toHaveBeenCalled()
  cm.getInputField().dispatchEvent(new CompositionEvent('compositionend'))
  await nextTick()
  expect(a.markdown).toBe('# A\n\nONLY A 漢\n')
  expect(store.currentFile.markdown).toBe('# B\n'); expect(cm.getValue()).toBe('# B\n')
  cm.undo(); expect(cm.getValue()).toBe('# B\n')
})
it('adopts unified history without importing an old ordinary branch or blanking the source', async () => {
  const { cm } = await mountSource(); edit(cm, ' OWN')
  store.currentFile.splitSession = { unified: true, focused: 'source', source: null }
  await nextTick()
  expect(cm.getValue()).toBe('# A\n\nONLY A OWN\n')
  expect(cm.historySize()).toEqual({ undo: 0, redo: 0 })
  expect(cm.getOption('undoDepth')).toBe(0)
  const undo = vi.fn(); bus.on('undo', undo)
  cm.getOption('extraKeys')['Cmd-Z'](cm)
  expect(undo).toHaveBeenCalledOnce()
  delete store.currentFile.splitSession; await nextTick()
  bus.emit('file-changed', store.currentFile)
  cm.undo(); expect(cm.getValue()).toBe('# A\n\nONLY A OWN\n')
})
it('retains exact CRLF canonical bytes across ordinary mount and unmount', async () => {
  const canonical = '# A\r\n\r\nEXACT SOURCE\r\n'
  await mountSource(makeTab('a', canonical))
  const outgoing = vi.fn(); bus.on('file-changed', outgoing)
  wrapper.unmount(); wrapper = null
  expect(outgoing).toHaveBeenCalledWith(expect.objectContaining({ markdown: canonical }))
  expect(store.currentFile.markdown).toBe(canonical)
  expect(store.currentFile.savedMarkdown).toBe(canonical)
  expect(store.currentFile.isSaved).toBe(true)
})
it('closing A while Source is absent retires its history before reopening the same path', async () => {
  const { cm, pinia } = await mountSource(); const pathname = store.currentFile.pathname
  edit(cm, ' OLD'); wrapper.unmount(); wrapper = null
  store.tabs = []; store.currentFile = {}
  const reopened = makeTab('reopened', '# DISK CONTENT\n', pathname)
  documentOwner(reopened); store.tabs = [reopened]; store.currentFile = reopened; store.updateTabIdToIndex()
  const next = (await mountSource(null, pinia)).cm
  next.undo(); expect(next.getValue()).toBe('# DISK CONTENT\n')
  expect(store.currentFile.pathname).toBe(pathname)
})
it('keeps a locked ordinary Source view readonly while binding an independent document', async () => {
  const tab = { ...makeTab('a', '# LOCKED\n'), locked: true }
  const { cm } = await mountSource(tab)
  expect(cm.getOption('readOnly')).toBe(true)
  await selectTab({ ...makeTab('b', '# B\n'), locked: true })
  expect(cm.getOption('readOnly')).toBe(true)
  expect(cm.historySize()).toEqual({ undo: 0, redo: 0 })
  expect(store.currentFile.isSaved).toBe(true)
})
it('refuses pending asset and clipboard completions after same-id lifetime replacement', async () => {
  const a = { ...makeTab('a', '# A\n'), splitSession: { unified: true, focused: 'source', source: null } }
  const { cm } = await mountSource(a)
  let completeAsset
  bus.on('split:insert-asset', request => { completeAsset = request.complete })
  bus.emit('split:source-command', { command: 'insertAsset', payload: { image: 'synthetic-image', alt: 'owned' } })
  expect(completeAsset).toBeTypeOf('function')
  let resolveClipboard
  readText.mockReturnValue(new Promise(resolve => { resolveClipboard = resolve }))
  bus.emit('split:source-command', { command: 'pasteAsPlainText' })
  await flushPromises()
  expect(readText).toHaveBeenCalledOnce()
  const b = makeTab('a', '# NEW LIFETIME\n', '/fixture/a.md')
  documentOwner(b); store.tabs = [b]; store.currentFile = b; store.updateTabIdToIndex()
  bus.emit('file-changed', store.currentFile); await nextTick()
  completeAsset('foreign-asset.png'); resolveClipboard('FOREIGN CLIPBOARD')
  await flushPromises(); await nextTick()
  expect(cm.getValue()).toBe('# NEW LIFETIME\n')
  expect(store.currentFile.markdown).toBe('# NEW LIFETIME\n')
  expect(store.currentFile.isSaved).toBe(true)
})
it('normalizes only the outgoing Muya cursor while preserving the reversed native selection', async () => {
  const { cm, pinia } = await mountSource()
  cm.setSelection({ line: 2, ch: 5 }, { line: 2, ch: 1 })
  const outgoing = vi.fn(); bus.on('file-changed', outgoing)
  wrapper.unmount(); wrapper = null
  expect(outgoing).toHaveBeenCalledWith(expect.objectContaining({ muyaIndexCursor: { anchor: { line: 2, ch: 1 }, focus: { line: 2, ch: 5 } } }))
  bus.off('file-changed', outgoing)
  const next = (await mountSource(null, pinia)).cm
  expect(next.getCursor('anchor')).toMatchObject({ line: 2, ch: 5 })
  expect(next.getCursor('head')).toMatchObject({ line: 2, ch: 1 })
})
it('detaches the retained Doc even if a sibling file-change consumer throws during unmount', async () => {
  const errors = []
  const { cm, pinia } = await mountSource(undefined, null, error => errors.push(error)); edit(cm, ' OWN')
  const fail = () => { throw Error('synthetic sibling failure') }
  bus.on('file-changed', fail)
  wrapper.unmount(); wrapper = null
  expect(errors.map(error => error.message)).toEqual(['synthetic sibling failure'])
  bus.off('file-changed', fail)
  const next = (await mountSource(null, pinia)).cm
  expect(next.getValue()).toBe('# A\n\nONLY A OWN\n')
  next.undo(); expect(next.getValue()).toBe('# A\n\nONLY A\n')
})
it('reapplies the live text direction when a retained Doc is reactivated', async () => {
  const { cm } = await mountSource(); const a = store.currentFile
  const b = makeTab('b', '# B\n')
  await selectTab(b); await selectTab(a)
  await wrapper.setProps({ textDirection: 'rtl' })
  expect(cm.getOption('direction')).toBe('rtl')
  await selectTab(b)
  expect(cm.getOption('direction')).toBe('rtl')
  expect(cm.getValue()).toBe('# B\n')
})
it('rejects a tokenless stale payload that disagrees with the selected canonical document', async () => {
  const { cm } = await mountSource()
  const replacement = makeTab('a', '# CURRENT LIFETIME\n')
  documentOwner(replacement); store.tabs = [replacement]; store.currentFile = replacement; store.updateTabIdToIndex()
  bus.emit('file-changed', store.currentFile); await nextTick()
  bus.emit('file-changed', { id: 'a', markdown: '# RETIRED PAYLOAD\n' })
  expect(cm.getValue()).toBe('# CURRENT LIFETIME\n')
  expect(store.currentFile.markdown).toBe('# CURRENT LIFETIME\n')
  cm.undo(); expect(cm.getValue()).toBe('# CURRENT LIFETIME\n')
})
