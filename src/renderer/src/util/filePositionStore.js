// FILE: src/renderer/src/util/filePositionStore.js
// VERSION: 1.1.0
// START_MODULE_CONTRACT
//   PURPOSE: C-FILE-POSITION-MEMORY the per-file reading position store — one prefs key (filePositions) holding per-file entries of the last scrollTop and muyaIndexCursor (line/ch), so reopening a file or relaunching the app returns the reader to where they were.
//   SCOPE: Pure store transforms (sanitizeEntry, normalizeStore, storeWithEntry, capStoreFiles, moveFileEntry, clampEntryToMarkdown) plus the IO-bound high-level flows (loadFilePosition = read + prune missing files + cap + write-back when changed; saveFilePosition = write one file's entry; moveFilePositionsEntry = the Mark-rename move). All three flows serialize through one module-level mutation queue (a concurrent quit-flush of N tabs must not interleave read→transform→write and drop all but the last tab's entry) and never persist a store derived from a failed read. The muyaIndexCursor semantics belong to muya — this module stays schema-only and pure apart from the IO flows, mirroring tableLayoutStore.js.
//   DEPENDS: @/ipc/runtime ipcPrefs (mt::prefs::get / mt::prefs::set — the existing loose-typed prefs IPC; the renderer holds the schema, so no backend change); window.fileUtils.stat for the prune — the tri-state verdict (confirmed-missing only via MT_FS_NOT_FOUND / isFile:false) keeps entries whenever the answer is «cannot tell» (absent capability, thrown stat, flagless shape).
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
//   readStore - async: prefs get of the single key (normalize on read; a failed read degrades to the empty store — for PURE reads only; the mutation flows use an internal strict reader that rethrows so a failed read can never become the base of a wipe).
//   writeStore - async: prefs set of the whole store (the mutation flows run on an internal promise-chain queue so concurrent flushes compose instead of racing).
//   pruneMissingFiles - async: drop entries whose file is CONFIRMED missing; «cannot tell» keeps the entry. The default checker is the internal tri-state stat: true (exists) / false (isFile:false answer or MT_FS_NOT_FOUND rejection) / undefined (no capability, other rejection, flagless answer) — only false prunes.
//   loadFilePosition - async: the restore path — read, prune, cap, write back when the store changed, return the file's entry (null when none). The stat checker is injectable like pruneMissingFiles's.
//   saveFilePosition - async: write one file's entry, never pruning (the load path owns that).
//   moveFilePositionsEntry - async: the rename move — the position follows the new path; a Finder move does NOT go through here.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.1.0 - 2026-10-26 C-FILE-POSITION-MEMORY review wave:
//                (1) all store mutations serialize through one promise
//                queue — the multi-tab quit-flush (_saveSessionState fires
//                N saves via Promise.allSettled) used to interleave
//                read→transform→write and keep only the last tab's entry;
//                (2) stat verdicts are tri-state — only a confirmed
//                missing file (isFile:false answer or MT_FS_NOT_FOUND
//                rejection) prunes; an evicted iCloud volume, EACCES, a
//                thrown or flagless stat keeps the entry instead of
//                erasing it forever; (3) a failed prefs read aborts the
//                mutation without writing (a degraded read can never
//                become the base of a store-wiping write).
//   v1.0.0 - 2026-10-23 C-FILE-POSITION-MEMORY: new module.
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

// The mutation flows must never build a write on top of a failed read —
// a degraded read that silently becomes the base of the next save wipes
// every other file's remembered position. This reader rethrows; callers
// abort the mutation (no write) on failure.
const readStoreStrict = async (io = defaultIo) => {
  try {
    return normalizeStore(await io.get(FILE_POSITIONS_PREFS_KEY))
  } catch (e) {
    console.warn(`[FilePositionStore][readStore][BLOCK_POSITION_READ_FAILED] ${e}`)
    throw e
  }
}

export const writeStore = async (store, io = defaultIo) => {
  await io.set(FILE_POSITIONS_PREFS_KEY, store)
}

// START_BLOCK_POSITION_MUTEX
// One queue for every read→transform→write of the prefs key. The quit
// flush fires one save per open tab concurrently (Promise.allSettled);
// without serialization each save read the same base store and the last
// write won, silently dropping every other tab's position. Chained
// promises preserve per-caller results while composing the writes.
let storeMutationQueue = Promise.resolve()
const serializedStoreMutation = (run) => {
  const next = storeMutationQueue.then(run, run)
  storeMutationQueue = next.then(
    () => {},
    () => {}
  )
  return next
}
// END_BLOCK_POSITION_MUTEX

// Tri-state «does this file exist»: true = exists; false = CONFIRMED
// not-a-file (the stat answered isFile:false, or the backend rejected
// with MT_FS_NOT_FOUND — m013b maps io::ErrorKind::NotFound to that
// code); undefined = cannot tell (no stat capability, any other
// rejection such as EACCES/evicted volume, or a flagless answer). Only
// a false verdict may prune — «cannot tell» keeps the entry so a
// transient failure can never erase positions forever.
const STAT_NOT_FOUND_HINT = 'MT_FS_NOT_FOUND'

const statFileExists = async (pathname) => {
  const stat = typeof window !== 'undefined' &&
    window.fileUtils &&
    typeof window.fileUtils.stat === 'function'
    ? window.fileUtils.stat
    : null
  if (!stat) return undefined
  let info
  try {
    info = await stat(pathname)
  } catch (e) {
    const code = String((e && (e.code || e.id || e.message)) || e || '')
    return code.includes(STAT_NOT_FOUND_HINT) ? false : undefined
  }
  if (!info) return undefined
  if (typeof info.isFile === 'boolean' || typeof info.is_file === 'boolean') {
    return !!(info.isFile || info.is_file)
  }
  return undefined
}

export const pruneMissingFiles = async (store, statExists = statFileExists) => {
  const base = normalizeStore(store)
  const paths = Object.keys(base.files)
  // «Cannot tell» (undefined / throw) keeps the entry; only an explicit
  // false verdict from the checker prunes.
  const verdicts = await Promise.all(paths.map(path =>
    Promise.resolve().then(() => statExists(path)).catch(() => undefined)))
  const files = {}
  const pruned = []
  paths.forEach((pathname, index) => {
    if (verdicts[index] !== false) {
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
// A failed read aborts the restore (null) without any write-back.
export const loadFilePosition = (pathname, io = defaultIo, statExists = statFileExists) =>
  serializedStoreMutation(async () => {
    if (!pathname) return null
    let rawStore
    try {
      rawStore = await readStoreStrict(io)
    } catch (e) {
      return null
    }
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
  })

// The save path: replace ONE file's entry (the recorder flush owns
// coalescing; this write is the debounced/close/quit boundary). Runs on
// the serialization queue; a failed read aborts without writing.
export const saveFilePosition = (pathname, entry, io = defaultIo) =>
  serializedStoreMutation(async () => {
    if (!pathname) return false
    let rawStore
    try {
      rawStore = await readStoreStrict(io)
    } catch (e) {
      return false
    }
    const nextStore = storeWithEntry(rawStore, pathname, entry)
    try {
      await writeStore(nextStore, io)
      return true
    } catch (e) {
      console.warn(`[FilePositionStore][saveFilePosition][BLOCK_POSITION_WRITE_FAILED] ${e}`)
      return false
    }
  })

// The rename move: the position follows the new path; a Finder move does
// not (it never runs through here — the next load prunes the orphan).
export const moveFilePositionsEntry = (from, to, io = defaultIo) =>
  serializedStoreMutation(async () => {
    if (!from || !to || from === to) return false
    let rawStore
    try {
      rawStore = await readStoreStrict(io)
    } catch (e) {
      return false
    }
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
  })
// END_BLOCK_POSITION_IO
