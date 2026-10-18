// FILE: tests/renderer/store/table-layout-store.test.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Pin the C-65 T-001 per-file table layout profile store — sanitize/normalize, the file-entries set/replace/delete transform, the bounded size cap, the missing-file prune (stat false / stat throws / no stat capability), the rename move, and the three IO flows (load prunes+caps+writes back, save replaces one file, move follows a rename) with an injected fake prefs IO.
//   SCOPE: src/renderer/src/util/tableLayoutStore.js (pure transforms + IO flows with defaultIo swapped by injection).
//   DEPENDS: Vitest, a fake { get, set } IO recording writes.
//   LINKS: .grace/changes/active/C-65 R-1/R-2 (T-001); .grace/verification/runtime.xml V-M-012 scenario-66; the muya twin tests/renderer/muya/table-layout-persistence.test.js; the host wiring in editor.vue (BLOCK_TABLE_LAYOUTS_HOST) and store/editor.js RENAME/RENAME_IF_NEEDED.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   makeIo - fake prefs IO: a backing object for get, a writes recorder for set.
//   ENTRY - one valid persisted entry fixture.
//   entryFor - a widths+manual entry fixture builder.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - 2026-10-18 C-65: new — every transform and IO
//   rule of the store is pinned against a fake IO; the prune/cap cases
//   fail without their filters, the rename case fails without the move.
// END_CHANGE_SUMMARY

import { describe, expect, it, vi } from 'vitest'

vi.mock('@/ipc/runtime', () => ({
  ipcPrefs: { get: vi.fn(async () => null), set: vi.fn(async () => {}), getAll: vi.fn(async () => ({})) }
}))

import {
  EMPTY_STORE,
  MAX_TABLE_LAYOUT_FILES,
  TABLE_LAYOUTS_PREFS_KEY,
  capStoreFiles,
  loadTableLayoutsFor,
  moveFileEntry,
  moveTableLayoutsEntry,
  normalizeStore,
  pruneMissingFiles,
  saveTableLayoutsFor,
  sanitizeEntry,
  storeWithFileEntries
} from '@/util/tableLayoutStore'

const entryFor = (widths, manual, fullWidth = false) => ({ widths, manual, fullWidth })

const makeIo = (initial = null) => {
  const backing = { [TABLE_LAYOUTS_PREFS_KEY]: initial }
  const writes = []
  return {
    backing,
    writes,
    get: async (key) => backing[key],
    set: async (key, value) => {
      writes.push({ key, value })
      backing[key] = value
    }
  }
}

const ENTRY = entryFor([120, 80], [true, false])

describe('pure store transforms (C-65 T-001)', () => {
  it('sanitizes entries: positive finite widths kept, invalid dropped, fullWidth-only kept', () => {
    expect(sanitizeEntry(ENTRY)).toEqual(ENTRY)
    expect(sanitizeEntry({ widths: [120.4, -5], manual: [true], fullWidth: false })).toEqual({
      widths: [120], manual: [true], fullWidth: false
    })
    expect(sanitizeEntry({ widths: [], manual: [], fullWidth: false })).toBeNull()
    expect(sanitizeEntry({ widths: [], manual: [], fullWidth: true })).toEqual({
      widths: [], manual: [], fullWidth: true
    })
    expect(sanitizeEntry(null)).toBeNull()
    expect(sanitizeEntry([1, 2])).toBeNull()
  })

  it('normalizes any raw prefs value into a valid store', () => {
    expect(normalizeStore(null)).toEqual(EMPTY_STORE)
    expect(normalizeStore('junk')).toEqual(EMPTY_STORE)
    expect(normalizeStore({ version: 9, files: [] })).toEqual(EMPTY_STORE)
    const store = normalizeStore({
      files: {
        '/a.md': { '0#2:x': ENTRY, junk: 'not-an-entry' },
        '/gone.md': 'husk'
      }
    })
    expect(Object.keys(store.files)).toEqual(['/a.md'])
    expect(store.files['/a.md']['0#2:x']).toEqual(ENTRY)
    expect(store.version).toBe(1)
  })

  it('storeWithFileEntries sets, replaces and deletes (empty entries delete the file entry)', () => {
    const store = storeWithFileEntries(null, '/a.md', { '0#2:x': ENTRY }, 1000)
    expect(store.files['/a.md']['0#2:x']).toEqual(ENTRY)
    expect(store.files['/a.md'].updatedAt).toBe(1000)

    const replaced = storeWithFileEntries(store, '/a.md', { '0#2:y': entryFor([50], [true]) }, 2000)
    expect(Object.keys(replaced.files['/a.md'])).toEqual(['updatedAt', '0#2:y'])
    expect(replaced.files['/a.md'].updatedAt).toBe(2000)

    const emptied = storeWithFileEntries(replaced, '/a.md', {}, 3000)
    expect(emptied.files['/a.md']).toBeUndefined()

    const sanitizedAway = storeWithFileEntries(replaced, '/a.md', { bad: { widths: [] } }, 4000)
    expect(sanitizedAway.files['/a.md']).toBeUndefined()
  })

  it('caps the store at MAX_TABLE_LAYOUT_FILES, keeping the newest by updatedAt', () => {
    const files = {}
    for (let i = 0; i < MAX_TABLE_LAYOUT_FILES + 2; i++) {
      files[`/f${i}.md`] = { updatedAt: i, '0#1:x': ENTRY }
    }
    const { store, capped } = capStoreFiles({ version: 1, files })
    expect(capped).toBe(true)
    expect(Object.keys(store.files).length).toBe(MAX_TABLE_LAYOUT_FILES)
    // The two oldest are gone; the newest survive.
    expect(store.files['/f0.md']).toBeUndefined()
    expect(store.files['/f1.md']).toBeUndefined()
    expect(store.files[`/f${MAX_TABLE_LAYOUT_FILES + 1}.md`]).toBeTruthy()

    const small = capStoreFiles(normalizeStore({ files: { '/only.md': { '0#1:x': ENTRY } } }))
    expect(small.capped).toBe(false)
    expect(small.store.files['/only.md']).toBeTruthy()
  })

  it('moveFileEntry moves one path\'s entry and never invents one', () => {
    const base = normalizeStore({ files: { '/old.md': { '0#1:x': ENTRY }, '/other.md': { '0#1:y': ENTRY } } })
    const moved = moveFileEntry(base, '/old.md', '/new.md')
    expect(moved.files['/old.md']).toBeUndefined()
    expect(moved.files['/new.md']).toEqual(base.files['/old.md'])
    expect(moved.files['/other.md']).toBeTruthy()

    expect(moveFileEntry(base, '/absent.md', '/x.md')).toEqual(base)
    expect(moveFileEntry(base, '/old.md', '/old.md')).toEqual(base)
    expect(moveFileEntry(base, '', '/x.md')).toEqual(base)
  })
})

describe('prune + IO flows (C-65 R-1/R-2, corner-3)', () => {
  it('prunes entries whose file no longer exists; a throwing stat counts as gone', async () => {
    const store = normalizeStore({
      files: { '/there.md': { '0#1:x': ENTRY }, '/gone.md': { '0#1:y': ENTRY }, '/boom.md': { '0#1:z': ENTRY } }
    })
    const stat = async (p) => {
      if (p === '/boom.md') throw new Error('ENOENT')
      return p === '/there.md'
    }
    const { store: pruned, pruned: paths } = await pruneMissingFiles(store, stat)
    expect(paths.sort()).toEqual(['/boom.md', '/gone.md'])
    expect(Object.keys(pruned.files)).toEqual(['/there.md'])
  })

  it('loadTableLayoutsFor prunes, caps, writes back when changed and returns the file\'s entries', async () => {
    // The global test shim's stat says everything exists — pin the real
    // verdicts per path (the shared fileUtils bridge shape).
    ;(window.fileUtils.stat).mockImplementation(async (p) =>
      p === '/doc.md' ? { isFile: true } : { isFile: false })
    const io = makeIo({
      files: {
        '/doc.md': { '0#2:x': ENTRY },
        '/gone.md': { '0#1:y': ENTRY }
      }
    })
    const entries = await loadTableLayoutsFor('/doc.md', io)
    expect(entries['0#2:x']).toEqual(ENTRY)
    expect(io.writes.length).toBe(1)
    expect(io.writes[0].key).toBe(TABLE_LAYOUTS_PREFS_KEY)
    expect(io.writes[0].value.files['/gone.md']).toBeUndefined()
    expect(io.writes[0].value.files['/doc.md']).toBeTruthy()

    // Unchanged store → no write-back.
    const again = await loadTableLayoutsFor('/doc.md', io)
    expect(again['0#2:x']).toEqual(ENTRY)
    expect(io.writes.length).toBe(1)

    // Unknown file → empty entries, no invention.
    expect(await loadTableLayoutsFor('/nope.md', io)).toEqual({})
    expect(await loadTableLayoutsFor('', io)).toEqual({})
  })

  it('a corrupted prefs read degrades to the empty store and never throws out of load', async () => {
    const io = { get: async () => { throw new Error('prefs down') }, set: async () => {} }
    await expect(loadTableLayoutsFor('/doc.md', io)).resolves.toEqual({})
  })

  it('saveTableLayoutsFor replaces one file\'s entries and deletes the husk when empty', async () => {
    const io = makeIo({ files: { '/doc.md': { '0#2:old': ENTRY }, '/other.md': { '0#1:y': ENTRY } } })
    await saveTableLayoutsFor('/doc.md', { '0#1:new': entryFor([90], [true]) }, io)
    expect(io.backing[TABLE_LAYOUTS_PREFS_KEY].files['/doc.md']['0#1:new']).toEqual(entryFor([90], [true]))
    expect(io.backing[TABLE_LAYOUTS_PREFS_KEY].files['/doc.md']['0#2:old']).toBeUndefined()
    expect(io.backing[TABLE_LAYOUTS_PREFS_KEY].files['/other.md']).toBeTruthy()

    await saveTableLayoutsFor('/doc.md', {}, io)
    expect(io.backing[TABLE_LAYOUTS_PREFS_KEY].files['/doc.md']).toBeUndefined()

    expect(await saveTableLayoutsFor('', ENTRY, io)).toBe(false)
  })

  it('a failed save warns and resolves false (a layout is a convenience, never a blocker)', async () => {
    const io = { get: async () => null, set: async () => { throw new Error('disk full') } }
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await expect(saveTableLayoutsFor('/doc.md', { '0#1:x': ENTRY }, io)).resolves.toBe(false)
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('moveTableLayoutsEntry moves the entry through the real IO flow', async () => {
    const io = makeIo({ files: { '/old.md': { '0#1:x': ENTRY } } })
    expect(await moveTableLayoutsEntry('/old.md', '/new.md', io)).toBe(true)
    expect(io.backing[TABLE_LAYOUTS_PREFS_KEY].files['/new.md']).toEqual({ '0#1:x': ENTRY })
    expect(io.backing[TABLE_LAYOUTS_PREFS_KEY].files['/old.md']).toBeUndefined()
    // Absent source / same path / bad input → no write, false.
    expect(await moveTableLayoutsEntry('/absent.md', '/x.md', io)).toBe(false)
    expect(await moveTableLayoutsEntry('/new.md', '/new.md', io)).toBe(false)
    expect(await moveTableLayoutsEntry('', '/x.md', io)).toBe(false)
    expect(io.writes.length).toBe(1)
  })

  it('a failed move warns and resolves false', async () => {
    const io = { get: async () => ({ files: { '/old.md': { '0#1:x': ENTRY } } }), set: async () => { throw new Error('nope') } }
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await expect(moveTableLayoutsEntry('/old.md', '/new.md', io)).resolves.toBe(false)
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })
})
