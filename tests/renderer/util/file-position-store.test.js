// FILE: tests/renderer/util/file-position-store.test.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Pin util/filePositionStore.js — the C-FILE-POSITION-MEMORY per-file reading position store: pure transforms (sanitize/normalize/cap/move/clamp), the numbers-only payload schema (corner C-8) and the IO flows with a fake prefs IO (prune/cap write-back, save, rename move — corners C-5/C-6).
//   SCOPE: The module's exports; every rule is pure-object or fake-IO pinned, mirroring table-layout-store.test.js.
//   DEPENDS: Vitest; util/filePositionStore.js; @/ipc/runtime mocked.
//   LINKS: .grace/changes/active/C-FILE-POSITION-MEMORY (spec D-3); store/editor.js (the flush/restore host); util/tableLayoutStore.js (the mirrored pattern).
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   fakeIo - in-memory prefs IO with call logging.
//   aPoint - {line, ch} fixture factory.
//   anEntry - full entry fixture ({scrollTop, muyaIndexCursor, savedAt} with overrides).
//   load - lazy module import after the ipc mock.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - 2026-10-23 C-FILE-POSITION-MEMORY: new —
//   transforms, clamp, cap/prune/move IO flows, payload schema.
// END_CHANGE_SUMMARY

vi.mock('@/ipc/runtime', () => ({
  ipcPrefs: { get: vi.fn(async () => null), set: vi.fn(async () => {}) }
}))

const load = async () => await import('@/util/filePositionStore')

const fakeIo = () => {
  const data = new Map()
  const calls = []
  return {
    calls,
    get: async (key) => {
      calls.push(['get', key])
      return data.has(key) ? JSON.parse(JSON.stringify(data.get(key))) : null
    },
    set: async (key, value) => {
      calls.push(['set', key])
      data.set(key, JSON.parse(JSON.stringify(value)))
    },
    dump: () => data
  }
}

const aPoint = (line, ch) => ({ line, ch })
const anEntry = (over = {}) => ({
  scrollTop: 3778,
  muyaIndexCursor: { anchor: aPoint(120, 5), focus: aPoint(120, 5) },
  savedAt: 1,
  ...over
})

describe('util/filePositionStore (C-FILE-POSITION-MEMORY)', () => {
  it('sanitizeEntry keeps only numeric scrollTop/line/ch/savedAt — no content rides along (C-8)', async () => {
    const { sanitizeEntry } = await load()
    const clean = sanitizeEntry({
      scrollTop: 3778.6,
      muyaIndexCursor: { anchor: aPoint(10.4, 3.2), focus: aPoint(10.4, 3.2) },
      savedAt: 123.7,
      markdown: '# should not survive',
      selectionText: 'nope'
    })
    expect(clean).toEqual({
      scrollTop: 3779,
      muyaIndexCursor: { anchor: aPoint(10, 3), focus: aPoint(10, 3) },
      savedAt: 124
    })
    expect(JSON.stringify(clean)).not.toContain('markdown')
    expect(sanitizeEntry(null)).toBeNull()
    expect(sanitizeEntry({ scrollTop: 0 })).toBeNull() // scroll-only at top with no cursor = nothing to remember
    expect(sanitizeEntry({ scrollTop: 0, muyaIndexCursor: { anchor: aPoint(0, 0), focus: aPoint(0, 0) } })).not.toBeNull()
    // A broken cursor does not kill the scroll memory — the entry survives scroll-only.
    expect(sanitizeEntry({ scrollTop: 100, muyaIndexCursor: { anchor: aPoint(-1, 0), focus: aPoint(0, 0) } })).toEqual({ scrollTop: 100, muyaIndexCursor: null, savedAt: 0 })
  })

  it('normalizeStore collapses junk and keeps valid entries', async () => {
    const { normalizeStore } = await load()
    expect(normalizeStore(null)).toEqual({ version: 1, files: {} })
    expect(normalizeStore('nope')).toEqual({ version: 1, files: {} })
    expect(normalizeStore({ files: [] })).toEqual({ version: 1, files: {} })
    const store = normalizeStore({
      files: {
        '/a.md': anEntry(),
        '/bad.md': { scrollTop: 'x' },
        '/scroll-only.md': { scrollTop: 900, savedAt: 5 }
      }
    })
    expect(Object.keys(store.files).sort()).toEqual(['/a.md', '/scroll-only.md'])
    expect(store.files['/scroll-only.md'].muyaIndexCursor).toBeNull()
  })

  it('clampEntryToMarkdown pulls a stale entry inside the real document (C-5)', async () => {
    const { clampEntryToMarkdown } = await load()
    const md = '# t\n\nabc\n' // lines: 0..3 ('' trailing)
    const clamped = clampEntryToMarkdown(
      anEntry({ muyaIndexCursor: { anchor: aPoint(999, 99), focus: aPoint(999, 99) } }),
      md
    )
    expect(clamped.muyaIndexCursor.anchor.line).toBeLessThan(md.split('\n').length)
    expect(clamped.muyaIndexCursor.anchor.ch).toBe(md.split('\n')[clamped.muyaIndexCursor.anchor.line].length)
    // In-range entries pass through untouched.
    const ok = clampEntryToMarkdown(anEntry({ muyaIndexCursor: { anchor: aPoint(2, 1), focus: aPoint(2, 1) } }), md)
    expect(ok.muyaIndexCursor).toEqual({ anchor: aPoint(2, 1), focus: aPoint(2, 1) })
    // scrollTop is NOT clamped here — the browser clamps it at restore.
    expect(ok.scrollTop).toBe(3778)
    expect(clampEntryToMarkdown(null, md)).toBeNull()
    // A cursor-less entry passes through — the restore applies the scroll only.
    expect(clampEntryToMarkdown({ scrollTop: 50 }, md)).toEqual({ scrollTop: 50, muyaIndexCursor: null, savedAt: 0 })
  })

  it('capStoreFiles keeps the newest 200 by savedAt (C-6)', async () => {
    const { capStoreFiles, normalizeStore } = await load()
    const files = {}
    for (let i = 0; i < 205; i++) files[`/f${i}.md`] = anEntry({ savedAt: i })
    const { store, capped } = capStoreFiles({ version: 1, files })
    expect(capped).toBe(true)
    expect(Object.keys(store.files)).toHaveLength(200)
    expect(store.files['/f204.md']).toBeTruthy()
    expect(store.files['/f0.md']).toBeUndefined()
    expect(capStoreFiles(normalizeStore(null)).capped).toBe(false)
  })

  it('storeWithEntry replaces one file and stamps savedAt; moveFileEntry follows renames', async () => {
    const { storeWithEntry, moveFileEntry } = await load()
    const base = storeWithEntry(null, '/a.md', anEntry(), 10)
    expect(base.files['/a.md'].savedAt).toBe(10)
    const replaced = storeWithEntry(base, '/a.md', anEntry({ scrollTop: 5 }), 20)
    expect(replaced.files['/a.md'].savedAt).toBe(20)
    expect(replaced.files['/a.md'].scrollTop).toBe(5)
    const moved = moveFileEntry(replaced, '/a.md', '/b.md')
    expect(moved.files['/a.md']).toBeUndefined()
    expect(moved.files['/b.md'].savedAt).toBe(20)
    expect(moveFileEntry(moved, '/missing.md', '/c.md').files['/c.md']).toBeUndefined()
  })

  it('loadFilePosition prunes missing files and writes the corrected store back (C-6)', async () => {
    const { loadFilePosition, FILE_POSITIONS_PREFS_KEY } = await load()
    const io = fakeIo()
    io.dump().set(FILE_POSITIONS_PREFS_KEY, {
      version: 1,
      files: { '/gone.md': anEntry(), '/kept.md': anEntry({ scrollTop: 42 }) }
    })
    const statExists = async (p) => p === '/kept.md'
    const entry = await loadFilePosition('/kept.md', io, statExists)
    expect(entry.scrollTop).toBe(42)
    const written = io.dump().get(FILE_POSITIONS_PREFS_KEY)
    expect(written.files['/gone.md']).toBeUndefined()
    expect(io.calls.filter(([op]) => op === 'set')).toHaveLength(1)
    // A missing stat capability keeps every entry (prune skipped).
    const io2 = fakeIo()
    io2.dump().set(FILE_POSITIONS_PREFS_KEY, { version: 1, files: { '/x.md': anEntry() } })
    await loadFilePosition('/x.md', io2, async () => true)
    expect(io2.calls.filter(([op]) => op === 'set')).toHaveLength(0)
  })

  it('saveFilePosition writes one entry; moveFilePositionsEntry moves it (C-6/C-7)', async () => {
    const { saveFilePosition, moveFilePositionsEntry, FILE_POSITIONS_PREFS_KEY } = await load()
    const io = fakeIo()
    expect(await saveFilePosition('/a.md', anEntry(), io)).toBe(true)
    expect(await moveFilePositionsEntry('/a.md', '/b.md', io)).toBe(true)
    const store = io.dump().get(FILE_POSITIONS_PREFS_KEY)
    expect(store.files['/a.md']).toBeUndefined()
    expect(store.files['/b.md']).toBeTruthy()
    expect(await moveFilePositionsEntry('/nope.md', '/c.md', io)).toBe(false)
    expect(await saveFilePosition('', anEntry(), io)).toBe(false)
  })
})
