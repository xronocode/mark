// FILE: tests/renderer/store/live-stream-ownership.test.js
// START_MODULE_CONTRACT
//   PURPOSE: Prove live stream updates remain owned by their session incarnation and tab.
//   SCOPE: Real Pinia store lifecycle, background/closed tabs, stale events and save isolation.
//   DEPENDS: editor/preferences stores, test Pinia setup, renderer bus.
//   LINKS: M-011; V-M-011; C-SEC-STREAM-TABS.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
// START_MODULE_MAP
//   fixture - Real editor store with an unrelated local document and dummy history.
//   open - Session-open payload fixture.
//   patch - Session-patch payload fixture.
// END_MODULE_MAP
import { describe, expect, it, vi } from 'vitest'
import { setupTestPinia } from '../pinia'
import bus from '@/bus'

const open = (sessionEpoch = 1, sessionId = 'stream-a') => ({ sessionId, sessionEpoch, title: 'Dummy stream', markdown: '# Stream\n' })
const patch = (sessionEpoch = 1, sessionId = 'stream-a', revision = 2) => ({ sessionId, sessionEpoch, revision, markdown: '# Latest stream\n' })
const fixture = async () => {
  setupTestPinia()
  const { useEditorStore } = await import('@/store/editor')
  const store = useEditorStore()
  store.END_BOOT_PHASE()
  await store.NEW_TAB_WITH_CONTENT({ markdownDocument: { pathname: '/docs/local.md', filename: 'local.md', markdown: '# Local\n', previewMode: false } })
  store.currentFile.history = { stack: [{ id: 7, blocks: [] }], index: 0 }
  return store
}

describe('live document ownership', () => {
  it.each([false, true])('updates a background stream without changing the selected file or invoking autosave (enabled=%s)', async (autoSave) => {
    const store = await fixture()
    const { usePreferencesStore } = await import('@/store/preferences')
    usePreferencesStore().autoSave = autoSave
    const local = store.currentFile
    const id = store.OPEN_LIVE_DOCUMENT(open())
    const stream = store.currentFile
    expect(id).toBe(stream.id)
    expect(stream.pathname).toBe('')
    expect(stream.requiresExplicitSave).toBe(true)
    store.UPDATE_CURRENT_FILE(local)
    const before = JSON.parse(JSON.stringify(local))
    const save = vi.spyOn(store, 'HANDLE_AUTO_SAVE')
    const emit = vi.spyOn(bus, 'emit')
    emit.mockClear()
    expect(store.PATCH_LIVE_DOCUMENT(patch())).toBe(true)
    expect(local).toEqual(before)
    expect(store.currentFile).toBe(local)
    expect(stream.markdown).toBe('# Latest stream\n')
    expect(save).not.toHaveBeenCalled()
    expect(emit).not.toHaveBeenCalledWith('file-loaded', expect.anything())
    expect(emit).not.toHaveBeenCalledWith('file-changed', expect.anything())
    store.UPDATE_CURRENT_FILE(stream)
    expect(store.currentFile.markdown).toBe('# Latest stream\n')
    expect(emit).toHaveBeenCalledWith('file-changed', expect.objectContaining({ id, markdown: '# Latest stream\n' }))
    save.mockRestore(); emit.mockRestore()
  })

  it('refuses closed-tab patches and recreates only on a later explicit open', async () => {
    const store = await fixture()
    const local = store.currentFile
    const id = store.OPEN_LIVE_DOCUMENT(open())
    store.FORCE_CLOSE_TAB(store.currentFile)
    expect(store.currentFile).toBe(local)
    expect(store.PATCH_LIVE_DOCUMENT(patch())).toBe(false)
    expect(store.OPEN_LIVE_DOCUMENT(open())).toBe(null)
    expect(store.tabs).toHaveLength(1)
    const next = store.OPEN_LIVE_DOCUMENT(open(2))
    expect(next).not.toBe(id)
    expect(store.tabs).toHaveLength(2)
  })

  it('reuses the owned tab on resync and ignores stale/foreign/duplicate events', async () => {
    const store = await fixture()
    const id = store.OPEN_LIVE_DOCUMENT(open())
    expect(store.PATCH_LIVE_DOCUMENT(patch())).toBe(true)
    expect(store.PATCH_LIVE_DOCUMENT({ ...patch(), markdown: 'duplicate' })).toBe(false)
    expect(store.OPEN_LIVE_DOCUMENT(open(2))).toBe(id)
    expect(store.tabs).toHaveLength(2)
    const before = store.currentFile.markdown
    expect(store.PATCH_LIVE_DOCUMENT(patch(1))).toBe(false)
    expect(store.PATCH_LIVE_DOCUMENT(patch(2, 'foreign'))).toBe(false)
    expect(store.CLOSE_LIVE_DOCUMENT({ sessionId: 'stream-a', sessionEpoch: 1 })).toBe(false)
    expect(store.OPEN_LIVE_DOCUMENT(open(1))).toBe(null)
    expect(store.currentFile.markdown).toBe(before)
    expect(store.PATCH_LIVE_DOCUMENT(patch(2))).toBe(true)
    expect(store.CLOSE_LIVE_DOCUMENT({ sessionId: 'stream-a', sessionEpoch: 2 })).toBe(true)
    expect(store.PATCH_LIVE_DOCUMENT({ ...patch(2), revision: 3 })).toBe(false)
  })

  it('emits an identified refresh only for the selected stream and clears only its stale caches', async () => {
    const store = await fixture()
    const id = store.OPEN_LIVE_DOCUMENT(open())
    store.currentFile.blocks = [{ text: 'old' }]
    store.currentFile.splitSession = { unified: true }
    const emit = vi.spyOn(bus, 'emit')
    expect(store.PATCH_LIVE_DOCUMENT(patch())).toBe(true)
    expect(store.currentFile.blocks).toBeUndefined()
    expect(store.currentFile.splitSession).toBeUndefined()
    expect(emit).toHaveBeenCalledWith('file-changed', expect.objectContaining({ id, contentReloaded: true, history: { stack: [], index: -1 } }))
    emit.mockRestore()
  })

  it('keeps window-local bindings separate and refuses malformed event identity', async () => {
    const a = await fixture(); a.OPEN_LIVE_DOCUMENT(open())
    const b = await fixture(); const local = b.currentFile
    expect(b.PATCH_LIVE_DOCUMENT(patch())).toBe(false)
    for (const epoch of [undefined, 0, -1, NaN, '1']) expect(b.OPEN_LIVE_DOCUMENT({ ...open(), sessionEpoch: epoch })).toBe(null)
    expect(b.currentFile).toBe(local)
    expect(a.PATCH_LIVE_DOCUMENT(patch())).toBe(true)
  })
})
