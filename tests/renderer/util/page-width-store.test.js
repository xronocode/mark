// FILE: tests/renderer/util/page-width-store.test.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Pin util/pageWidthStore.js — the C-PAGE-WIDTH-TABLES T-001 (M-061) per-document page width store: pure transforms (sanitize/normalize/set/cap/move), the payload schema (numbers + unit enum + optional theme id only), the untitled/guide refusal, the 200-file cap, the rename move and the IO flows with a fake prefs IO (serialized queue, tri-state prune, failed-read abort).
//   SCOPE: The module's exports; every rule is pure-object or fake-IO pinned, mirroring file-position-store.test.js.
//   DEPENDS: Vitest; util/pageWidthStore.js; @/ipc/runtime mocked.
//   LINKS: .grace/changes/active/C-PAGE-WIDTH-TABLES (plan T-001, corners C-1/C-2); util/pageWidthStore.js; util/filePositionStore.js (the mirrored pattern).
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   fakeIo - in-memory prefs IO with call logging.
//   anEntry - width entry fixture ({ value, unit, themeOverride, savedAt } with overrides).
//   load - lazy module import after the ipc mock.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - 2026-11-02 C-PAGE-WIDTH-TABLES T-001 (M-061):
//   new suite — schema sanitize, store normalize/set/cap/move, untitled
//   and guide refusal, rename move, tri-state prune, serialized queue,
//   failed-read abort, stored-value never clamped (corner C-2).
// END_CHANGE_SUMMARY

vi.mock('@/ipc/runtime', () => ({
  ipcPrefs: { get: vi.fn(async () => null), set: vi.fn(async () => {}) }
}))

const load = async () => await import('@/util/pageWidthStore')

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

const anEntry = (over = {}) => ({
  value: 900,
  unit: 'px',
  themeOverride: null,
  savedAt: 1,
  ...over
})

describe('util/pageWidthStore (C-PAGE-WIDTH-TABLES T-001)', () => {
  it('sanitizeEntry keeps only the value/unit/themeOverride schema — no content, no junk units (M-061 payload note)', async () => {
    const { sanitizeEntry } = await load()
    const clean = sanitizeEntry({
      value: 900.6,
      unit: 'px',
      themeOverride: 'ink',
      savedAt: 123.7,
      markdown: '# must not survive',
      pathname: '/secret.md'
    })
    expect(clean).toEqual({ value: 901, unit: 'px', themeOverride: 'ink', savedAt: 124 })
    expect(JSON.stringify(clean)).not.toContain('markdown')
    // Non-finite, zero and negative values are dropped.
    expect(sanitizeEntry({ value: 0, unit: 'px' })).toBeNull()
    expect(sanitizeEntry({ value: -5, unit: 'px' })).toBeNull()
    expect(sanitizeEntry({ value: '900', unit: 'px' })).toBeNull()
    expect(sanitizeEntry({ value: NaN, unit: 'px' })).toBeNull()
    expect(sanitizeEntry(null)).toBeNull()
    expect(sanitizeEntry('900px')).toBeNull()
    // Only the three units survive.
    expect(sanitizeEntry({ value: 80, unit: 'ch' })).not.toBeNull()
    expect(sanitizeEntry({ value: 80, unit: '%' })).not.toBeNull()
    expect(sanitizeEntry({ value: 80, unit: 'em' })).toBeNull()
    expect(sanitizeEntry({ value: 80 })).toBeNull()
    // themeOverride survives only as a non-empty string; anything else is null.
    expect(sanitizeEntry({ value: 80, unit: 'ch', themeOverride: '  ' }).themeOverride).toBeNull()
    expect(sanitizeEntry({ value: 80, unit: 'ch', themeOverride: 42 }).themeOverride).toBeNull()
    expect(sanitizeEntry({ value: 80, unit: 'ch' }).themeOverride).toBeNull()
  })

  it('normalizeStore collapses junk shapes and keeps valid entries', async () => {
    const { normalizeStore, EMPTY_STORE } = await load()
    expect(normalizeStore(null)).toEqual(EMPTY_STORE)
    expect(normalizeStore('nope')).toEqual(EMPTY_STORE)
    expect(normalizeStore({ files: [] })).toEqual(EMPTY_STORE)
    const store = normalizeStore({
      files: {
        '/a.md': anEntry({ savedAt: 5 }),
        '/bad.md': { value: 'x', unit: 'px' },
        '/orphan.md': null
      }
    })
    expect(Object.keys(store.files)).toEqual(['/a.md'])
    expect(store.files['/a.md'].savedAt).toBe(5)
  })

  it('storeWithEntry sets, replaces and deletes one file entry; a falsy pathname is a no-op', async () => {
    const { storeWithEntry, normalizeStore } = await load()
    const base = normalizeStore({ files: { '/a.md': anEntry({ savedAt: 1 }) } })
    // Replace keeps one entry with the fresh stamp.
    const replaced = storeWithEntry(base, '/a.md', anEntry({ value: 80, unit: 'ch' }), 99)
    expect(replaced.files['/a.md']).toEqual({ value: 80, unit: 'ch', themeOverride: null, savedAt: 99 })
    // An invalid/null entry DELETES the file entry (falling back to theme/global).
    const removed = storeWithEntry(replaced, '/a.md', null, 100)
    expect(removed.files['/a.md']).toBeUndefined()
    expect(Object.keys(removed.files)).toHaveLength(0)
    // Junk deletes too.
    expect(Object.keys(storeWithEntry(base, '/a.md', { value: 'x' }).files)).toHaveLength(0)
    // Untitled (no pathname) never gains an entry.
    const untitled = storeWithEntry(base, '', anEntry(), 7)
    expect(untitled).toEqual(base)
  })

  it('capStoreFiles keeps the newest 200 by savedAt (ties by path)', async () => {
    const { capStoreFiles, normalizeStore, MAX_PAGE_WIDTH_FILES } = await load()
    expect(MAX_PAGE_WIDTH_FILES).toBe(200)
    const files = {}
    for (let i = 0; i < 205; i++) {
      files[`/f${String(i).padStart(3, '0')}.md`] = anEntry({ savedAt: i })
    }
    const { store, capped } = capStoreFiles(normalizeStore({ files }))
    expect(capped).toBe(true)
    expect(Object.keys(store.files)).toHaveLength(200)
    // The oldest five (savedAt 0..4) are gone; the newest survive.
    for (let i = 5; i < 205; i++) {
      expect(store.files[`/f${String(i).padStart(3, '0')}.md`]).toBeDefined()
    }
    expect(store.files['/f000.md']).toBeUndefined()
    // At or below the cap nothing changes.
    const small = capStoreFiles(normalizeStore({ files: { '/a.md': anEntry() } }))
    expect(small.capped).toBe(false)
    // Ties fall back to path order for determinism (the filePositionStore
    // rule): the path-ascending first 200 are kept, the highest paths drop.
    const tied = {}
    for (let i = 0; i < 202; i++) tied[`/t${String(i).padStart(3, '0')}.md`] = anEntry({ savedAt: 42 })
    const tieRun = capStoreFiles(normalizeStore({ files: tied }))
    expect(Object.keys(tieRun.store.files)).toHaveLength(200)
    expect(tieRun.store.files['/t000.md']).toBeDefined()
    expect(tieRun.store.files['/t200.md']).toBeUndefined()
    expect(tieRun.store.files['/t201.md']).toBeUndefined()
  })

  it('moveFileEntry moves the entry to the new path; absent source or same path is unchanged', async () => {
    const { moveFileEntry, normalizeStore } = await load()
    const base = normalizeStore({ files: { '/old.md': anEntry({ savedAt: 3 }) } })
    const moved = moveFileEntry(base, '/old.md', '/new.md')
    expect(moved.files['/old.md']).toBeUndefined()
    expect(moved.files['/new.md']).toEqual({ value: 900, unit: 'px', themeOverride: null, savedAt: 3 })
    expect(moveFileEntry(base, '/missing.md', '/new.md')).toEqual(base)
    expect(moveFileEntry(base, '/old.md', '/old.md')).toEqual(base)
    expect(moveFileEntry(base, '', '/new.md')).toEqual(base)
  })

  it('loadPageWidthFor returns the file entry, refuses falsy pathnames (untitled + guide tabs) without IO', async () => {
    const { loadPageWidthFor } = await load()
    const io = fakeIo()
    io.set('pageWidths', { version: 1, files: { '/a.md': anEntry({ savedAt: 9 }) } })
    expect(await loadPageWidthFor('/a.md', io, async () => true)).toEqual(
      { value: 900, unit: 'px', themeOverride: null, savedAt: 9 }
    )
    // Untitled documents and guide tabs carry no pathname — no entry, no IO at all.
    io.calls.length = 0
    expect(await loadPageWidthFor(null, io, async () => true)).toBeNull()
    expect(await loadPageWidthFor(undefined, io, async () => true)).toBeNull()
    expect(await loadPageWidthFor('', io, async () => true)).toBeNull()
    expect(io.calls).toEqual([])
    // Unknown file → null.
    expect(await loadPageWidthFor('/missing.md', io, async () => true)).toBeNull()
  })

  it('pruneMissingFiles drops only CONFIRMED-missing files; «cannot tell» keeps entries', async () => {
    const { pruneMissingFiles, normalizeStore } = await load()
    const store = normalizeStore({
      files: {
        '/gone.md': anEntry({ savedAt: 1 }),
        '/here.md': anEntry({ savedAt: 2 }),
        '/cannot-tell.md': anEntry({ savedAt: 3 }),
        '/thrown.md': anEntry({ savedAt: 4 })
      }
    })
    const statExists = async (path) => {
      if (path === '/gone.md') return false // confirmed missing (isFile:false / MT_FS_NOT_FOUND)
      if (path === '/here.md') return true
      if (path === '/cannot-tell.md') return undefined // no capability / flagless
      throw new Error('EACCES') // thrown verdict
    }
    const { store: pruned, pruned: dropped } = await pruneMissingFiles(store, statExists)
    expect(dropped).toEqual(['/gone.md'])
    expect(pruned.files['/here.md']).toBeDefined()
    expect(pruned.files['/cannot-tell.md']).toBeDefined()
    expect(pruned.files['/thrown.md']).toBeDefined()
  })

  it('savePageWidth writes one entry and refuses untitled/guide tabs (no pathname, no write)', async () => {
    const { savePageWidth } = await load()
    const io = fakeIo()
    expect(await savePageWidth('/a.md', anEntry({ value: 60, unit: 'ch' }), io)).toBe(true)
    expect(io.dump().get('pageWidths').files['/a.md'].value).toBe(60)
    // Untitled/guide: refused — the store is not even read, and the
    // existing /a.md entry is untouched.
    io.calls.length = 0
    expect(await savePageWidth(null, anEntry(), io)).toBe(false)
    expect(await savePageWidth('', anEntry(), io)).toBe(false)
    expect(io.calls).toEqual([])
    expect(io.dump().get('pageWidths').files['/a.md'].value).toBe(60)
    expect(Object.keys(io.dump().get('pageWidths').files)).toEqual(['/a.md'])
    // A null entry deletes the file entry (back to theme/global tier).
    await savePageWidth('/a.md', null, io)
    expect(io.dump().get('pageWidths').files['/a.md']).toBeUndefined()
  })

  it('two interleaved saves both survive — the mutation queue serializes read→transform→write', async () => {
    const { savePageWidth } = await load()
    const io = fakeIo()
    // Both saves start "simultaneously"; the queue composes them instead of
    // letting the second read a stale base and drop the first entry.
    const [first, second] = await Promise.all([
      savePageWidth('/one.md', anEntry({ value: 60, unit: 'ch' }), io),
      savePageWidth('/two.md', anEntry({ value: 900, unit: 'px' }), io)
    ])
    expect(first).toBe(true)
    expect(second).toBe(true)
    const files = io.dump().get('pageWidths').files
    expect(files['/one.md'].value).toBe(60)
    expect(files['/two.md'].value).toBe(900)
  })

  it('a failed read aborts the mutation without writing — never a wipe base', async () => {
    const { savePageWidth, movePageWidthEntry, loadPageWidthFor } = await load()
    const io = fakeIo()
    io.get = async () => {
      throw new Error('prefs backend gone')
    }
    expect(await savePageWidth('/a.md', anEntry(), io)).toBe(false)
    expect(await movePageWidthEntry('/a.md', '/b.md', io)).toBe(false)
    expect(await loadPageWidthFor('/a.md', io, async () => true)).toBeNull()
    expect(io.dump().has('pageWidths')).toBe(false)
  })

  it('movePageWidthEntry follows the rename; nothing to move is a clean false', async () => {
    const { movePageWidthEntry, savePageWidth } = await load()
    const io = fakeIo()
    await savePageWidth('/old.md', anEntry({ value: 80, unit: '%' }), io)
    expect(await movePageWidthEntry('/old.md', '/new.md', io)).toBe(true)
    const files = io.dump().get('pageWidths').files
    expect(files['/old.md']).toBeUndefined()
    expect(files['/new.md']).toEqual({ value: 80, unit: '%', themeOverride: null, savedAt: expect.any(Number) })
    expect(await movePageWidthEntry('/missing.md', '/x.md', io)).toBe(false)
    expect(await movePageWidthEntry('/new.md', '/new.md', io)).toBe(false)
    expect(await movePageWidthEntry('', '/x.md', io)).toBe(false)
  })

  it('loadPageWidthFor prunes confirmed-missing files, caps, and writes the corrected store back', async () => {
    const { loadPageWidthFor } = await load()
    const io = fakeIo()
    const files = {}
    for (let i = 0; i < 201; i++) {
      files[`/f${String(i).padStart(3, '0')}.md`] = anEntry({ savedAt: i })
    }
    files['/doomed.md'] = anEntry({ savedAt: 999 })
    io.set('pageWidths', { version: 1, files })
    const statExists = async (path) => path !== '/doomed.md'
    const entry = await loadPageWidthFor('/f200.md', io, statExists)
    expect(entry.value).toBe(900)
    const stored = io.dump().get('pageWidths').files
    expect(Object.keys(stored)).toHaveLength(200)
    expect(stored['/doomed.md']).toBeUndefined()
    expect(stored['/f000.md']).toBeUndefined() // oldest, capped away
  })

  it('the store never clamps or converts — the raw setting rides through untouched (corner C-2)', async () => {
    const { sanitizeEntry } = await load()
    // A 900px setting on a 500px canvas is still 900px in the store; the
    // RENDER-side clamp belongs to util/pageWidth.js, never to persistence.
    const huge = sanitizeEntry({ value: 1100, unit: 'px', savedAt: 1 })
    expect(huge.value).toBe(1100)
    const tinyCanvasValue = sanitizeEntry({ value: 40, unit: 'ch', savedAt: 1 })
    expect(tinyCanvasValue).toEqual({ value: 40, unit: 'ch', themeOverride: null, savedAt: 1 })
  })
})
