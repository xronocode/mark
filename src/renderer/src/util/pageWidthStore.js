// FILE: src/renderer/src/util/pageWidthStore.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: C-PAGE-WIDTH-TABLES T-001 (M-061) the per-document page width store — one prefs key (pageWidths) holding per-file entries of the document width ({ value, unit, themeOverride? }) so a width pinned on one file follows that file through renames and never leaks into untitled documents.
//   SCOPE: Pure store transforms (sanitizeEntry, normalizeStore, storeWithEntry, capStoreFiles, moveFileEntry) plus the IO-bound high-level flows (loadPageWidthFor = read + prune missing files + cap + write-back when changed; savePageWidth = write (or delete) one file's entry; movePageWidthEntry = the Mark-rename move). All three flows serialize through one module-level mutation queue (concurrent tab flushes must not interleave read→transform→write and drop all but the last writer) and never persist a store derived from a failed read. The payload is numbers, the ch/px/% unit enum and an optional theme id — never document content, never paths beyond the pathname keys (spec R-14 security note). Mirrors filePositionStore.js; tableLayoutStore.js is the sibling store on the same rename flows.
//   DEPENDS: @/ipc/runtime ipcPrefs (mt::prefs::get / mt::prefs::set — the existing loose-typed prefs IPC; the renderer holds the schema, so no backend change); window.fileUtils.stat for the prune — the tri-state verdict (confirmed-missing only via MT_FS_NOT_FOUND / isFile:false) keeps entries whenever the answer is «cannot tell».
//   LINKS: .grace/changes/archive/C-PAGE-WIDTH-TABLES (plan T-001, corners C-1/C-2); util/pageWidth.js (the resolution pipeline consuming these entries); util/filePositionStore.js and util/tableLayoutStore.js (the pattern this module mirrors; the same store/editor.js RENAME / RENAME_IF_NEEDED flows own this module's move); .grace/graph/performance.xml M-061.
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   PAGE_WIDTHS_PREFS_KEY - the single prefs key holding the whole store ("pageWidths").
//   MAX_PAGE_WIDTH_FILES - cap on remembered files (200, newest by savedAt kept).
//   WIDTH_UNITS - the three stored units ("ch", "px", "%") — anything else is dropped on read.
//   EMPTY_STORE - the canonical empty store shape ({ version: 1, files: {} }).
//   sanitizeEntry - pure: coerce one raw entry into { value, unit, themeOverride, savedAt } or null (finite positive integer value, one of the three units, themeOverride kept only as a non-empty string — R-4's optional per-document theme id).
//   normalizeStore - pure: any raw prefs value → a valid store (invalid shapes collapse to EMPTY_STORE).
//   storeWithEntry - pure: set/replace/delete one file's entry (a null/invalid entry deletes the file entry) with a fresh savedAt stamp.
//   capStoreFiles - pure: keep at most max files, newest savedAt first (ties by path for determinism).
//   moveFileEntry - pure: move one file's entry from one path to another (absent source → unchanged store; destination clobbered).
//   defaultIo - the ipcPrefs-backed IO the high-level flows use when none is injected.
//   readStore - async: prefs get of the single key (normalize on read; a failed read degrades to the empty store — for PURE reads only; the mutation flows use an internal strict reader that rethrows so a failed read can never become the base of a wipe).
//   writeStore - async: prefs set of the whole store (the mutation flows run on an internal promise-chain queue so concurrent flushes compose instead of racing).
//   pruneMissingFiles - async: drop entries whose file is CONFIRMED missing; «cannot tell» keeps the entry. The default checker is the internal tri-state stat: true (exists) / false (isFile:false answer or MT_FS_NOT_FOUND rejection) / undefined (no capability, other rejection, flagless answer) — only false prunes.
//   loadPageWidthFor - async: the restore path — read, prune, cap, write back when the store changed, return the file's entry (null when none, also for a falsy pathname: untitled and guide tabs carry no pathname and never get an entry).
//   savePageWidth - async: write one file's entry (null deletes it — removing the entry falls the document back to the theme/global tier), never pruning (the load path owns that). A falsy pathname is refused: untitled and guide tabs never get an entry.
//   movePageWidthEntry - async: the rename move — the width follows the new path; a Finder move does NOT go through here.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - 2026-11-02 C-PAGE-WIDTH-TABLES T-001 (M-061):
//   new module. Per-document page width ({ value, unit } ch/px/% plus the
//   optional R-4 themeOverride id) persists per FILE under one prefs key —
//   never written into the Markdown. Loads prune entries whose file no
//   longer exists (tri-state stat: only a confirmed missing file prunes)
//   and cap the store at 200 files; saves touch one file's entry and
//   refuse falsy pathnames so untitled and guide tabs never gain one;
//   renames through Mark move the entry. All mutations serialize through
//   one queue and a failed prefs read aborts the mutation without writing
//   (the filePositionStore review lessons). The stored value is raw —
//   clamping to the visible canvas happens only in the resolution
//   pipeline (util/pageWidth.js) and never writes back here (corner C-2).
// END_CHANGE_SUMMARY

import { ipcPrefs } from '@/ipc/runtime'

export const PAGE_WIDTHS_PREFS_KEY = 'pageWidths'
export const MAX_PAGE_WIDTH_FILES = 200

export const WIDTH_UNITS = ['ch', 'px', '%']

export const EMPTY_STORE = { version: 1, files: {} }

// START_BLOCK_WIDTH_TRANSFORMS
// Pure store maths — every rule below is unit-pinnable with plain objects.
// The stored value is the USER SETTING in its own unit; the pipeline, not
// this store, owns any conversion or clamping (corner C-2: clamping never
// mutates the setting).
export const sanitizeEntry = (raw) => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const { value, unit } = raw
  if (!Number.isFinite(value) || value <= 0) return null
  if (!WIDTH_UNITS.includes(unit)) return null
  const themeOverride = typeof raw.themeOverride === 'string' && raw.themeOverride.trim() !== ''
    ? raw.themeOverride
    : null
  const savedAt = Number.isFinite(raw.savedAt) ? Math.round(raw.savedAt) : 0
  return { value: Math.round(value), unit, themeOverride, savedAt }
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

export const capStoreFiles = (store, max = MAX_PAGE_WIDTH_FILES) => {
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
// END_BLOCK_WIDTH_TRANSFORMS

// START_BLOCK_WIDTH_IO
// The injected IO is { get(key), set(key, value) } — the prefs facade by
// default, fakes in tests. A failed read degrades to the empty store (a
// corrupted profile never blocks editing); a failed write warns with the
// anchored marker and resolves (a width is a convenience, never a
// blocker).
export const defaultIo = {
  get: (key) => ipcPrefs.get(key),
  set: (key, value) => ipcPrefs.set(key, value)
}

export const readStore = async (io = defaultIo) => {
  try {
    return normalizeStore(await io.get(PAGE_WIDTHS_PREFS_KEY))
  } catch (e) {
    console.warn(`[PageWidthStore][readStore][BLOCK_PAGE_WIDTH_READ_FAILED] ${e}`)
    return { version: 1, files: {} }
  }
}

// The mutation flows must never build a write on top of a failed read —
// a degraded read that silently becomes the base of the next save wipes
// every other file's stored width. This reader rethrows; callers abort
// the mutation (no write) on failure.
const readStoreStrict = async (io = defaultIo) => {
  try {
    return normalizeStore(await io.get(PAGE_WIDTHS_PREFS_KEY))
  } catch (e) {
    console.warn(`[PageWidthStore][readStore][BLOCK_PAGE_WIDTH_READ_FAILED] ${e}`)
    throw e
  }
}

export const writeStore = async (store, io = defaultIo) => {
  await io.set(PAGE_WIDTHS_PREFS_KEY, store)
}

// START_BLOCK_WIDTH_MUTEX
// One queue for every read→transform→write of the prefs key (the
// filePositionStore lesson: concurrent tab flushes chained through
// Promise.allSettled used to interleave and keep only the last write).
let storeMutationQueue = Promise.resolve()
const serializedStoreMutation = (run) => {
  const next = storeMutationQueue.then(run, run)
  storeMutationQueue = next.then(
    () => {},
    () => {}
  )
  return next
}
// END_BLOCK_WIDTH_MUTEX

// Tri-state «does this file exist»: true = exists; false = CONFIRMED
// not-a-file (the stat answered isFile:false, or the backend rejected
// with MT_FS_NOT_FOUND); undefined = cannot tell (no stat capability, any
// other rejection such as EACCES/evicted volume, or a flagless answer).
// Only a false verdict may prune — «cannot tell» keeps the entry so a
// transient failure can never erase widths forever.
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

// The restore path: prune entries whose file no longer exists, cap the
// store size, write the corrected store back when anything changed, and
// hand the caller the file's entry (null when none). A falsy pathname
// (untitled and guide tabs carry none) short-circuits without any IO. A
// failed read aborts the restore (null) without any write-back.
export const loadPageWidthFor = (pathname, io = defaultIo, statExists = statFileExists) =>
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
          `[PageWidthStore][loadPageWidthFor][BLOCK_PAGE_WIDTH_PRUNED files=${pruned.length} capped=${capped}]`
        )
      } catch (e) {
        console.warn(`[PageWidthStore][loadPageWidthFor][BLOCK_PAGE_WIDTH_WRITE_FAILED] ${e}`)
      }
    }
    return cappedStore.files[pathname] || null
  })

// The save path: replace ONE file's entry; a null entry deletes it (the
// document falls back to the theme/global tier). Runs on the
// serialization queue; a failed read aborts without writing; a falsy
// pathname (untitled / guide tab) is refused — those documents resolve
// through the global tier and never gain an entry.
export const savePageWidth = (pathname, entry, io = defaultIo) =>
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
      console.warn(`[PageWidthStore][savePageWidth][BLOCK_PAGE_WIDTH_WRITE_FAILED] ${e}`)
      return false
    }
  })

// The rename move: the width follows the new path (the same
// store/editor.js RENAME / RENAME_IF_NEEDED flows that move tableLayouts
// and filePositions); a Finder move does not (it never runs through
// here — the next load prunes the orphan).
export const movePageWidthEntry = (from, to, io = defaultIo) =>
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
        `[PageWidthStore][movePageWidthEntry][BLOCK_PAGE_WIDTH_MOVED] ${from} -> ${to}`
      )
      return true
    } catch (e) {
      console.warn(`[PageWidthStore][movePageWidthEntry][BLOCK_PAGE_WIDTH_WRITE_FAILED] ${e}`)
      return false
    }
  })
// END_BLOCK_WIDTH_IO
