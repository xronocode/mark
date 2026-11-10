// FILE: tests/renderer/store/editor-format.test.js
// START_MODULE_CONTRACT
//   PURPOSE: Pin complete format changes through the real editor store.
//   SCOPE: Dirty/no-op, bus routes, IME refusal, text/history and autosave.
//   DEPENDS: Pinia setup, document factories/surfaces, typed save double.
//   LINKS: V-M-011; C-METADATA-SAVE-SAFETY T-002.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
// START_MODULE_MAP
//   transport - correlated save transport double.
//   fixture - real store and a fresh saved document checkpoint.
// END_MODULE_MAP
import { describe, it, expect, vi, afterEach } from 'vitest'
import { setupTestPinia } from '../pinia'
import { captureDocumentFormat } from '@/util/documentFormat'
import { documentOwner, registerDocumentSurface } from '@/util/documentSnapshot'
import bus from '@/bus'
const transport = vi.hoisted(() => ({ chooseTarget: vi.fn(), writeSnapshot: vi.fn() }))
vi.mock('@/ipc/runtime/documentSave', () => ({ ipcDocumentSave: transport }))
vi.mock('@/services/notification', () => ({ default: { notify: vi.fn() } }))
const fixture = async (pathname = '/tmp/format.md') => {
  setupTestPinia(); bus.all.clear()
  const { createDocumentState } = await import('@/store/help')
  const { useEditorStore } = await import('@/store/editor')
  const { usePreferencesStore } = await import('@/store/preferences')
  const store = useEditorStore(); store.END_BOOT_PHASE()
  const tab = createDocumentState({ markdown: 'A?\n\n', pathname, filename: 'format.md', encoding: { encoding: 'utf8', isBom: false }, lineEnding: 'lf', trimTrailingNewline: 3 }, 'format-tab')
  store.tabs = [tab]; store.currentFile = tab; store.updateTabIdToIndex()
  const prefs = usePreferencesStore(); prefs.autoSave = false; prefs.autoSaveDelay = 20
  transport.writeSnapshot.mockReset().mockImplementation(async r => ({ ...r, pathname: r.targetPath, filename: 'format.md' }))
  transport.chooseTarget.mockReset().mockResolvedValue(null)
  return { store, tab: store.currentFile, prefs }
}
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers() })
describe('editor text and format ownership', () => {
  it.each(['', '/tmp/format.md'])('keeps dirty text/history/cursor through every format action on %s', async pathname => {
    const { store, tab } = await fixture(pathname)
    store.LISTEN_FOR_CONTENT_CHANGE({ id: tab.id, markdown: 'NEW?\n\n' })
    const history = tab.history; const cursor = tab.cursor; const revision = tab.contentRevision
    expect(store.SET_LINE_ENDING('crlf')).toBe(true)
    expect(store.SET_FILE_ENCODING({ encoding: 'utf16le', isBom: true })).toBe(true)
    expect(store.SET_FINAL_NEWLINE(0)).toBe(true)
    expect(tab.markdown).toBe('NEW?\n\n'); expect(tab.history).toBe(history); expect(tab.cursor).toBe(cursor)
    expect(tab.contentRevision).toBe(revision + 3); expect(tab.isSaved).toBe(false)
    expect(store.SET_LINE_ENDING('crlf')).toBe(false); expect(store.SET_FILE_ENCODING({ encoding: 'utf16le', isBom: true })).toBe(false); expect(store.SET_FINAL_NEWLINE(0)).toBe(false)
    expect(tab.contentRevision).toBe(revision + 3); expect(tab.isSaved).toBe(false)
  })
  it('navigation does not advance revision; undo text cannot clear a format choice', async () => {
    const { store, tab } = await fixture(); const revision = tab.contentRevision
    store.LISTEN_FOR_CONTENT_CHANGE({ id: tab.id, markdown: tab.markdown, cursor: { line: 1 } })
    expect(tab.contentRevision).toBe(revision); expect(tab.isSaved).toBe(true)
    store.SET_FINAL_NEWLINE(0)
    store.LISTEN_FOR_CONTENT_CHANGE({ id: tab.id, markdown: 'changed?' })
    store.LISTEN_FOR_CONTENT_CHANGE({ id: tab.id, markdown: tab.savedMarkdown })
    expect(tab.isSaved).toBe(false); expect(tab.markdown).toBe('A?\n\n')
  })
  it('Save establishes text plus format and only a matching text undo becomes clean', async () => {
    const { store, tab } = await fixture(); store.SET_LINE_ENDING('crlf')
    expect((await store.FILE_SAVE()).status).toBe('completed')
    expect(tab.savedFormat).toEqual(captureDocumentFormat(tab)); expect(tab.savedMarkdown).toBe(tab.markdown)
    store.LISTEN_FOR_CONTENT_CHANGE({ id: tab.id, markdown: 'other' }); expect(tab.isSaved).toBe(false)
    store.LISTEN_FOR_CONTENT_CHANGE({ id: tab.id, markdown: tab.savedMarkdown }); expect(tab.isSaved).toBe(true)
  })
  it.each(['encoding','eol','final'])('refuses %s before extracting or altering active preedit', async kind => {
    const { store, tab } = await fixture(); const before = structuredClone(JSON.parse(JSON.stringify(tab))); let captures = 0
    const stop = registerDocumentSurface(documentOwner(tab), { isComposing: () => true, captureCommitted: () => { captures++; return 'preedit' } })
    try {
      const changed = kind === 'encoding' ? store.SET_FILE_ENCODING('cp1251') : kind === 'eol' ? store.SET_LINE_ENDING('crlf') : store.SET_FINAL_NEWLINE(1)
      expect(changed).toBe(false); expect(JSON.parse(JSON.stringify(tab))).toEqual(before); expect(captures).toBe(0)
      expect(store.CAN_CHANGE_DOCUMENT_FORMAT()).toBe(false)
    } finally { stop() }
  })
  it('routes native/bus changes through the same validated state action', async () => {
    const { store, tab } = await fixture()
    store.LINTEN_FOR_SET_ENCODING(); store.LINTEN_FOR_SET_LINE_ENDING(); store.LINTEN_FOR_SET_FINAL_NEWLINE()
    bus.emit('mt::set-file-encoding', { encoding: 'utf8', isBom: true }); bus.emit('mt::set-line-ending', 'crlf'); bus.emit('mt::set-final-newline', 1)
    expect(captureDocumentFormat(tab)).toEqual({ encoding: 'utf8', isBom: true, lineEnding: 'crlf', finalNewline: 1 })
    expect(tab.contentRevision).toBe(3); expect(tab.isSaved).toBe(false)
    const before = JSON.parse(JSON.stringify(tab)); bus.emit('mt::set-file-encoding', 'gb2312')
    expect(JSON.parse(JSON.stringify(tab))).toEqual(before)
  })
  it('autosaves format-only changes while respecting a newly disabled preference', async () => {
    const { store, tab, prefs } = await fixture(); vi.useFakeTimers(); prefs.autoSave = true
    store.SET_LINE_ENDING('crlf'); await vi.advanceTimersByTimeAsync(20)
    expect(transport.writeSnapshot).toHaveBeenCalledTimes(1); expect(tab.isSaved).toBe(true)
    expect(transport.writeSnapshot.mock.calls[0][0].format.lineEnding).toBe('crlf')
    store.SET_FINAL_NEWLINE(0); prefs.autoSave = false; await vi.advanceTimersByTimeAsync(20)
    expect(transport.writeSnapshot).toHaveBeenCalledTimes(1); expect(tab.isSaved).toBe(false)
  })
})
it('keeps empty pristine documents clean on import and makes real format choices dirty', async () => {
  const { store, tab } = await fixture(''); tab.markdown = ''; tab.savedMarkdown = ''
  const revision = tab.contentRevision
  store.LISTEN_FOR_CONTENT_CHANGE({ id:tab.id,markdown:'\n',toc:[] })
  expect(tab.contentRevision).toBe(revision); expect(tab.isSaved).toBe(true)
  store.SET_FINAL_NEWLINE(1); expect(tab.isSaved).toBe(false); expect(tab.markdown).toBe('\n')
})
it('does not let queued autosave or later history silently retry a stale acknowledgement', async () => {
  const { store, tab, prefs } = await fixture(); vi.useFakeTimers(); prefs.autoSave = true
  let resolve; const delayed = new Promise(done => { resolve = done })
  transport.writeSnapshot.mockImplementationOnce(async r => { await delayed; return { ...r, pathname:r.targetPath } })
  store.SET_LINE_ENDING('crlf'); const attempt = store.FILE_SAVE()
  expect(transport.writeSnapshot).toHaveBeenCalledTimes(1)
  store.SET_FINAL_NEWLINE(0); resolve()
  expect((await attempt).status).toBe('blocked'); expect(tab.requiresExplicitSave).toBe(true)
  store.LISTEN_FOR_CONTENT_CHANGE({ id:tab.id,markdown:tab.markdown,history:{stack:[],lastEditIndex:-1} })
  await vi.advanceTimersByTimeAsync(100)
  expect(transport.writeSnapshot).toHaveBeenCalledTimes(1); expect(tab.isSaved).toBe(false)
  expect((await store.FILE_SAVE()).status).toBe('completed'); expect(tab.requiresExplicitSave).toBe(false)
})
it('refuses a cached unavailable default without creating a tab or migrating the preference', async () => {
  const { store, prefs } = await fixture(); prefs.defaultEncoding = 'gb2312'
  const tabs = [...store.tabs]
  expect(store.NEW_UNTITLED_TAB({})).toBe(false)
  expect(store.tabs).toEqual(tabs); expect(prefs.defaultEncoding).toBe('gb2312')
})
