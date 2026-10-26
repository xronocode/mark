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
//   LAST_CHANGE: v1.1.0 - 2026-10-26 C-FILE-POSITION-MEMORY review wave:
//                pins the serialized mutation queue (two interleaved saves
//                both survive), the tri-state stat verdict (only confirmed
//                missing prunes; throws/undefined keep), and the
//                read-failure abort (a degraded read never becomes the
//                base of a store-wiping write).
//   v1.0.0 - 2026-10-23 C-FILE-POSITION-MEMORY: new —
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

  // ── v1.1.0 review wave: serialization, tri-state stat, read-failure abort ──

  it('two interleaved saves both survive (serialized mutation queue)', async () => {
    const { saveFilePosition, FILE_POSITIONS_PREFS_KEY } = await load()
    const io = fakeIo()
    // A deferred write lets the second save's read start before the first
    // write lands — exactly the interleaving the quit flush produces via
    // Promise.allSettled over N tabs.
    let releaseWrite
    const gate = new Promise((resolve) => { releaseWrite = resolve })
    let firstSetDone = false
    const gatedSet = async (key, value) => {
      if (!firstSetDone) {
        await gate
        firstSetDone = true
      }
      io.set(key, value)
    }
    const gatedIo = { get: io.get, set: gatedSet }
    const p1 = saveFilePosition('/a.md', anEntry({ scrollTop: 100 }), gatedIo)
    const p2 = saveFilePosition('/b.md', anEntry({ scrollTop: 200 }), gatedIo)
    await new Promise((r) => setTimeout(r, 5))
    releaseWrite()
    expect(await p1).toBe(true)
    expect(await p2).toBe(true)
    const store = io.dump().get(FILE_POSITIONS_PREFS_KEY)
    expect(store.files['/a.md'].scrollTop).toBe(100)
    expect(store.files['/b.md'].scrollTop).toBe(200)
  })

  it('only a CONFIRMED missing file prunes — throws, undefined and flagless stats keep the entry', async () => {
    const { loadFilePosition, FILE_POSITIONS_PREFS_KEY } = await load()
    const seed = (io) => io.dump().set(FILE_POSITIONS_PREFS_KEY, {
      version: 1, files: { '/gone.md': anEntry(), '/unknown.md': anEntry(), '/flaky.md': anEntry(), '/dir.md': anEntry() }
    })
    const verdicts = {
      '/gone.md': false,            // checker says confirmed missing
      '/unknown.md': undefined,     // cannot tell
      '/flaky.md': () => { throw new Error('EACCES') }, // checker throws
      '/dir.md': false              // confirmed not-a-file (directory)
    }
    const io = fakeIo()
    seed(io)
    const entry = await loadFilePosition('/unknown.md', io, (p) =>
      typeof verdicts[p] === 'function' ? verdicts[p]() : verdicts[p])
    expect(entry).toBeTruthy()
    const store = io.dump().get(FILE_POSITIONS_PREFS_KEY)
    expect(store.files['/gone.md']).toBeUndefined()
    expect(store.files['/dir.md']).toBeUndefined()
    expect(store.files['/unknown.md']).toBeTruthy()
    expect(store.files['/flaky.md']).toBeTruthy()
  })

  it('a rejected NOT_FOUND stat prunes; any other rejection keeps (tri-state codes)', async () => {
    const { loadFilePosition, FILE_POSITIONS_PREFS_KEY } = await load()
    const io = fakeIo()
    io.dump().set(FILE_POSITIONS_PREFS_KEY, {
      version: 1, files: { '/deleted.md': anEntry(), '/evicted.md': anEntry() }
    })
    const rejecting = (code) => async () => {
      const err = new Error('stat failed')
      err.code = code
      throw err
    }
    // Injected checkers returning promises that reject with coded errors —
    // loadFilePosition's prune treats the throw as «cannot tell» unless it
    // carries the NOT_FOUND hint, which the default statFileExists maps.
    // The injected path here returns undefined (keep) for non-NOT_FOUND;
    // the NOT_FOUND mapping itself is pinned in the default-checker test
    // below via a stubbed window.fileUtils.stat.
    const verdicts = { '/deleted.md': false, '/evicted.md': undefined }
    await loadFilePosition('/deleted.md', io, (p) => verdicts[p])
    const store = io.dump().get(FILE_POSITIONS_PREFS_KEY)
    expect(store.files['/deleted.md']).toBeUndefined()
    expect(store.files['/evicted.md']).toBeTruthy()
    expect(rejecting('MT_FS_PERM_DENIED')).rejects.toBeInstanceOf(Error)
  })

  it('the default stat checker maps MT_FS_NOT_FOUND rejections to confirmed-missing', async () => {
    const { loadFilePosition, FILE_POSITIONS_PREFS_KEY } = await load()
    const io = fakeIo()
    io.dump().set(FILE_POSITIONS_PREFS_KEY, {
      version: 1, files: { '/n.md': anEntry(), '/p.md': anEntry() }
    })
    const original = window.fileUtils
    window.fileUtils = {
      stat: async (p) => {
        if (p === '/n.md') {
          const err = new Error('No such file or directory')
          err.code = 'MT_FS_NOT_FOUND'
          throw err
        }
        if (p === '/p.md') {
          const err = new Error('Permission denied')
          err.code = 'MT_FS_PERM_DENIED'
          throw err
        }
        return { isFile: true, isDirectory: false }
      }
    }
    try {
      await loadFilePosition('/p.md', io)
      const store = io.dump().get(FILE_POSITIONS_PREFS_KEY)
      expect(store.files['/n.md']).toBeUndefined()
      expect(store.files['/p.md']).toBeTruthy()
    } finally {
      window.fileUtils = original
    }
  })

  it('a failed prefs read aborts save/move/load without writing (no store wipe)', async () => {
    const { saveFilePosition, moveFilePositionsEntry, loadFilePosition } = await load()
    const data = new Map()
    const io = {
      get: async () => { throw new Error('prefs backend busy') },
      set: async (key, value) => { data.set(key, value) }
    }
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      expect(await saveFilePosition('/a.md', anEntry(), io)).toBe(false)
      expect(await moveFilePositionsEntry('/a.md', '/b.md', io)).toBe(false)
      expect(await loadFilePosition('/a.md', io, async () => true)).toBe(null)
      expect(data.size).toBe(0)
    } finally {
      warnSpy.mockRestore()
    }
  })

  it('write failures surface as false + warning and never throw (save/move/load, review wave)', async () => {
    const { saveFilePosition, moveFilePositionsEntry, loadFilePosition, FILE_POSITIONS_PREFS_KEY } = await load()
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      // save: the write rejects.
      const io1 = fakeIo()
      io1.dump().set(FILE_POSITIONS_PREFS_KEY, { version: 1, files: {} })
      const brokenSet = Object.assign(io1, {
        set: async () => { throw new Error('prefs write denied') }
      })
      expect(await saveFilePosition('/w.md', anEntry(), brokenSet)).toBe(false)

      // move: the write rejects.
      const io2 = fakeIo()
      io2.dump().set(FILE_POSITIONS_PREFS_KEY, { version: 1, files: { '/from.md': anEntry() } })
      const brokenSet2 = Object.assign(io2, {
        set: async () => { throw new Error('prefs write denied') }
      })
      expect(await moveFilePositionsEntry('/from.md', '/to.md', brokenSet2)).toBe(false)

      // load: the prune write-back rejects — the entry still returns.
      const io3 = fakeIo()
      io3.dump().set(FILE_POSITIONS_PREFS_KEY, { version: 1, files: { '/keep.md': anEntry(), '/gone.md': anEntry() } })
      const brokenSet3 = Object.assign(io3, {
        set: async () => { throw new Error('prefs write denied') }
      })
      const entry = await loadFilePosition('/keep.md', brokenSet3, async (p) => p !== '/gone.md')
      expect(entry).toBeTruthy()
      expect(warnSpy).toHaveBeenCalled()
    } finally {
      warnSpy.mockRestore()
    }
  })

  it('the default stat checker maps every answer shape (capability/message-only/flagless, review wave)', async () => {
    const { loadFilePosition, FILE_POSITIONS_PREFS_KEY } = await load()
    const original = window.fileUtils
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      // message-only rejection carrying the NOT_FOUND hint -> confirmed missing
      window.fileUtils = { stat: async () => { throw new Error('mt_fs_stat failed: MT_FS_NOT_FOUND (No such file)') } }
      let io = fakeIo()
      io.dump().set(FILE_POSITIONS_PREFS_KEY, { version: 1, files: { '/m.md': anEntry() } })
      await loadFilePosition('/m.md', io)
      expect(io.dump().get(FILE_POSITIONS_PREFS_KEY).files['/m.md']).toBeUndefined()

      // rejection without the hint -> cannot tell, entry kept
      window.fileUtils = { stat: async () => { throw new Error('i/o timeout') } }
      io = fakeIo()
      io.dump().set(FILE_POSITIONS_PREFS_KEY, { version: 1, files: { '/t.md': anEntry() } })
      await loadFilePosition('/t.md', io)
      expect(io.dump().get(FILE_POSITIONS_PREFS_KEY).files['/t.md']).toBeTruthy()

      // resolved flagless shape -> cannot tell, entry kept
      window.fileUtils = { stat: async () => ({}) }
      io = fakeIo()
      io.dump().set(FILE_POSITIONS_PREFS_KEY, { version: 1, files: { '/f.md': anEntry() } })
      await loadFilePosition('/f.md', io)
      expect(io.dump().get(FILE_POSITIONS_PREFS_KEY).files['/f.md']).toBeTruthy()

      // no stat capability at all -> cannot tell, entry kept, no write-back
      window.fileUtils = undefined
      io = fakeIo()
      io.dump().set(FILE_POSITIONS_PREFS_KEY, { version: 1, files: { '/c.md': anEntry() } })
      const entry = await loadFilePosition('/c.md', io)
      expect(entry).toBeTruthy()
      expect(io.calls.filter(([op]) => op === 'set')).toHaveLength(0)

      // is_file (snake_case) counts as the file flag
      window.fileUtils = { stat: async (p) => p === '/s.md' ? { is_file: true } : { isFile: false } }
      io = fakeIo()
      io.dump().set(FILE_POSITIONS_PREFS_KEY, { version: 1, files: { '/s.md': anEntry(), '/other.md': anEntry() } })
      expect(await loadFilePosition('/s.md', io)).toBeTruthy()
      expect(io.dump().get(FILE_POSITIONS_PREFS_KEY).files['/other.md']).toBeUndefined()
    } finally {
      window.fileUtils = original
      warnSpy.mockRestore()
    }
  })

  it('a failed read aborts the rename move too (review wave)', async () => {
    const { moveFilePositionsEntry } = await load()
    const io = { get: async () => { throw new Error('busy') }, set: async () => {} }
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      expect(await moveFilePositionsEntry('/a.md', '/b.md', io)).toBe(false)
    } finally {
      warnSpy.mockRestore()
    }
  })
})
