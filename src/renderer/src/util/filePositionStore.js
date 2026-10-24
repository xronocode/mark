// FILE: src/renderer/src/util/filePositionStore.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: C-FILE-POSITION-MEMORY the per-file reading position store — one prefs key (filePositions) holding per-file entries of the last scrollTop and muyaIndexCursor (line/ch), so reopening a file or relaunching the app returns the reader to where they were.
//   SCOPE: Pure store transforms (sanitizeEntry, normalizeStore, storeWithEntry, capStoreFiles, moveFileEntry, clampEntryToMarkdown) plus the IO-bound high-level flows (loadFilePosition = read + prune missing files + cap + write-back when changed; saveFilePosition = write one file's entry; moveFilePositionsEntry = the Mark-rename move). The muyaIndexCursor semantics belong to muya — this module stays schema-only and pure apart from the three IO flows, mirroring tableLayoutStore.js.
//   DEPENDS: @/ipc/runtime ipcPrefs (mt::prefs::get / mt::prefs::set — the existing loose-typed prefs IPC; the renderer holds the schema, so no backend change); window.fileUtils.stat for the prune (absent stat → pruning is skipped, entries kept).
//   LINKS: .grace/changes/active/C-FILE-POSITION-MEMORY (spec D-2/D-3, corners C-5/C-6/C-8); .grace/graph/runtime.xml M-011 (store/editor.js recorder + restore wiring); store/editor.js NEW_TAB_WITH_CONTENT (restore), FORCE_CLOSE_TAB/_saveSessionState (flushes), RENAME/RENAME_IF_NEEDED (moves); tableLayoutStore.js (the pattern this module mirrors).
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   FILE_POSITIONS_PREFS_KEY - the single prefs key holding the whole store ("filePositions").
//   MAX_POSITION_FILES - cap on remembered files (200, newest by savedAt kept).
//   EMPTY_STORE - the canonical empty store shape ({ version: 1, files: {} }).
//   sanitizeEntry - pure: coerce one raw entry into { scrollTop, muyaIndexCursor, savedAt } or null (a null muyaIndexCursor is valid — scroll-only memory).
//   normalizeStore - pure: any raw prefs value → a valid store (invalid shapes collapse to EMPTY_STORE).
//   storeWithEntry - pure: set/replace/delete one file's entry with a fresh savedAt stamp.
//   capStoreFiles - pure: keep at most max files, newest savedAt first (ties by path for determinism).
//   moveFileEntry - pure: move one file's entry from one path to another (absent source → unchanged store; destination clobbered).
//   clampEntryToMarkdown - pure: clamp the entry's muyaIndexCursor into the given markdown's real line/ch range (a file shortened while closed must not feed muya an out-of-range position — muya's setMarkdown branch ignores addCursorToMarkdown's isValid:false). scrollTop is left as-is: the browser clamps it into the real scrollable range at restore.
//   defaultIo - the ipcPrefs-backed IO the high-level flows use when none is injected.
//   readStore - async: prefs get of the single key (normalize on read; a failed read degrades to the empty store).
//   writeStore - async: prefs set of the whole store.
//   pruneMissingFiles - async: drop entries whose file no longer exists; a missing stat capability keeps everything.
//   loadFilePosition - async: the restore path — read, prune, cap, write back when the store changed, return the file's entry (null when none). The stat checker is injectable like pruneMissingFiles's.
//   saveFilePosition - async: write one file's entry, never pruning (the load path owns that).
//   moveFilePositionsEntry - async: the rename move — the position follows the new path; a Finder move does NOT go through here.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - 2026-10-23 C-FILE-POSITION-MEMORY: new module.
//   Persisted values are numbers only (scrollTop, line, ch, savedAt) keyed
//   by pathname — never document content (corner C-8). Loads prune entries
//   whose file no longer exists and cap the store at 200 files; saves touch
//   one file's entry; renames through Mark move the entry. The cursor clamp
//   is pure so every rule is unit-pinnable with a fake IO.
// END_CHANGE_SUMMARY

import { ipcPrefs } from '@/ipc/runtime'

export const FILE_POSITIONS_PREFS_KEY = 'filePositions'
export const MAX_POSITION_FILES = 200

export const EMPTY_STORE = { version: 1, files: {} }

// START_BLOCK_POSITION_TRANSFORMS
// Pure store maths — every rule below is unit-pinned with plain objects.
const sanitizePoint = (raw) => {
  if (!raw || typeof raw !== 'object') return null
  const { line, ch } = raw
  if (!Number.isFinite(line) || line < 0 || !Number.isFinite(ch) || ch < 0) return null
  return { line: Math.round(line), ch: Math.round(ch) }
}

export const sanitizeEntry = (raw) => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const scrollTop = Number.isFinite(raw.scrollTop) && raw.scrollTop > 0 ? Math.round(raw.scrollTop) : 0
  const savedAt = Number.isFinite(raw.savedAt) ? Math.round(raw.savedAt) : 0
  let muyaIndexCursor = null
  if (raw.muyaIndexCursor) {
    const anchor = sanitizePoint(raw.muyaIndexCursor.anchor)
    const focus = sanitizePoint(raw.muyaIndexCursor.focus)
    if (anchor && focus) muyaIndexCursor = { anchor, focus }
  }
  if (scrollTop === 0 && !muyaIndexCursor) return null
  return { scrollTop, muyaIndexCursor, savedAt }
}

export const normalizeStore = (raw) => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || !raw.files || typeof raw.files !== 'object') {
    return { version: 1, files: {} }
  }
  const files = {}
  for (const pathname of Object.keys(raw.files)) {
    const entry = sanitizeEntry(raw.files[pathname])
    if (entry) files[pathname] = entry
  }
  return { version: 1, files }
}

export const storeWithEntry = (store, pathname, entry, now = Date.now()) => {
  const base = normalizeStore(store)
  const files = Object.assign({}, base.files)
  if (!pathname) return base
  const clean = sanitizeEntry(entry)
  if (clean) {
    files[pathname] = Object.assign({}, clean, { savedAt: now })
  } else {
    delete files[pathname]
  }
  return { version: 1, files }
}

export const capStoreFiles = (store, max = MAX_POSITION_FILES) => {
  const base = normalizeStore(store)
  const paths = Object.keys(base.files)
  if (paths.length <= max) return { store: base, capped: false }
  paths.sort((a, b) => {
    const ta = base.files[a].savedAt || 0
    const tb = base.files[b].savedAt || 0
    if (ta !== tb) return tb - ta
    return a < b ? -1 : 1
  })
  const files = {}
  for (const pathname of paths.slice(0, max)) files[pathname] = base.files[pathname]
  return { store: { version: 1, files }, capped: true }
}

export const moveFileEntry = (store, from, to) => {
  if (!from || !to || from === to) return normalizeStore(store)
  const base = normalizeStore(store)
  if (!base.files[from]) return base
  const files = Object.assign({}, base.files)
  const entry = files[from]
  delete files[from]
  files[to] = entry
  return { version: 1, files }
}

// Corner C-5: an entry saved on a longer revision must never feed muya an
// out-of-range line/ch — muya's setMarkdown branch does not check
// addCursorToMarkdown's isValid:false, so the clamp lives renderer-side
// and pure. scrollTop needs no clamp here: scrollToCords sets it onto the
// container and the browser clamps into the real scrollable range.
export const clampEntryToMarkdown = (entry, markdown) => {
  const clean = sanitizeEntry(entry)
  if (!clean || !clean.muyaIndexCursor || typeof markdown !== 'string') return clean
  const lines = markdown.split('\n')
  const clampPoint = (point) => ({
    line: Math.min(point.line, lines.length - 1),
    ch: Math.min(point.ch, (lines[Math.min(point.line, lines.length - 1)] || '').length)
  })
  return Object.assign({}, clean, {
    muyaIndexCursor: {
      anchor: clampPoint(clean.muyaIndexCursor.anchor),
      focus: clampPoint(clean.muyaIndexCursor.focus)
    }
  })
}
// END_BLOCK_POSITION_TRANSFORMS

// START_BLOCK_POSITION_IO
// The injected IO is { get(key), set(key, value) } — the prefs facade by
// default, fakes in tests. A failed read degrades to the empty store (a
// corrupted profile never blocks editing); a failed write warns with the
// anchored marker and resolves (a position is a convenience, never a
// blocker).
export const defaultIo = {
  get: (key) => ipcPrefs.get(key),
  set: (key, value) => ipcPrefs.set(key, value)
}

export const readStore = async (io = defaultIo) => {
  try {
    return normalizeStore(await io.get(FILE_POSITIONS_PREFS_KEY))
  } catch (e) {
    console.warn(`[FilePositionStore][readStore][BLOCK_POSITION_READ_FAILED] ${e}`)
    return { version: 1, files: {} }
  }
}

export const writeStore = async (store, io = defaultIo) => {
  await io.set(FILE_POSITIONS_PREFS_KEY, store)
}

// stat resolves "this file exists" — the shared fileUtils bridge shape
// ({ isFile } or { is_file }); anything else means "cannot tell" and the
// prune keeps the entry (a missing capability must not eat positions).
const statFileExists = async (pathname) => {
  const stat = typeof window !== 'undefined' &&
    window.fileUtils &&
    typeof window.fileUtils.stat === 'function'
    ? window.fileUtils.stat
    : null
  if (!stat) return true
  try {
    const info = await stat(pathname)
    return !!(info && (info.isFile || info.is_file))
  } catch (_) {
    return false
  }
}

export const pruneMissingFiles = async (store, statExists = statFileExists) => {
  const base = normalizeStore(store)
  const paths = Object.keys(base.files)
  // A throwing stat counts as «gone», for injected checkers too.
  const verdicts = await Promise.all(paths.map(path =>
    Promise.resolve().then(() => statExists(path)).catch(() => false)))
  const files = {}
  const pruned = []
  paths.forEach((pathname, index) => {
    if (verdicts[index]) {
      files[pathname] = base.files[pathname]
    } else {
      pruned.push(pathname)
    }
  })
  return { store: { version: 1, files }, pruned }
}

// The C-FILE-POSITION-MEMORY restore path: prune entries whose file no
// longer exists, cap the store size, write the corrected store back when
// anything changed, and hand the caller the file's entry (null when none).
export const loadFilePosition = async (pathname, io = defaultIo, statExists = statFileExists) => {
  if (!pathname) return null
  const rawStore = await readStore(io)
  const { store: prunedStore, pruned } = await pruneMissingFiles(rawStore, statExists)
  const { store: cappedStore, capped } = capStoreFiles(prunedStore)
  if (pruned.length > 0 || capped) {
    try {
      await writeStore(cappedStore, io)
      console.debug(
        `[FilePositionStore][loadFilePosition][BLOCK_POSITION_PRUNED files=${pruned.length} capped=${capped}]`
      )
    } catch (e) {
      console.warn(`[FilePositionStore][loadFilePosition][BLOCK_POSITION_WRITE_FAILED] ${e}`)
    }
  }
  return cappedStore.files[pathname] || null
}

// The save path: replace ONE file's entry (the recorder flush owns
// coalescing; this write is the debounced/close/quit boundary).
export const saveFilePosition = async (pathname, entry, io = defaultIo) => {
  if (!pathname) return false
  const rawStore = await readStore(io)
  const nextStore = storeWithEntry(rawStore, pathname, entry)
  if (nextStore === rawStore) return true
  try {
    await writeStore(nextStore, io)
    return true
  } catch (e) {
    console.warn(`[FilePositionStore][saveFilePosition][BLOCK_POSITION_WRITE_FAILED] ${e}`)
    return false
  }
}

// The rename move: the position follows the new path; a Finder move does
// not (it never runs through here — the next load prunes the orphan).
export const moveFilePositionsEntry = async (from, to, io = defaultIo) => {
  if (!from || !to || from === to) return false
  const rawStore = await readStore(io)
  if (!rawStore.files[from]) return false
  const nextStore = moveFileEntry(rawStore, from, to)
  try {
    await writeStore(nextStore, io)
    console.debug(
      `[FilePositionStore][moveFilePositionsEntry][BLOCK_POSITION_MOVED] ${from} -> ${to}`
    )
    return true
  } catch (e) {
    console.warn(`[FilePositionStore][moveFilePositionsEntry][BLOCK_POSITION_WRITE_FAILED] ${e}`)
    return false
  }
}
// END_BLOCK_POSITION_IO
