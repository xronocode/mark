// FILE: src/renderer/src/util/tableLayoutStore.js
// VERSION: 2.0.0
// START_MODULE_CONTRACT
//   PURPOSE: The per-file table layout profile store — one prefs key (tableLayouts) holding per-file entries of persisted table column widths, the stored ratios + explicit table width (schema v2, C-PAGE-WIDTH-TABLES T-008) and the per-table mode ('fit' | 'full'; absent = Auto), with sanitize/normalize, the one-way idempotent v1→v2 migration of the legacy fullWidth/fit booleans, missing-file pruning, a bounded size cap and the rename move.
//   SCOPE: Pure store transforms (normalizeStore, storeWithFileEntries, capStoreFiles, moveFileEntry, sanitizeEntry over util/tableLayoutRatios.migrateTableEntry) plus the IO-bound high-level flows (loadTableLayoutsFor = read + prune + cap + write-back when changed; saveTableLayoutsFor = write one file's entries, deleting the file entry when empty; moveTableLayoutsEntry = the Mark-rename move). The persistent table identities (ordinal#headerSignature strings) are opaque to this module — muya's TableResize mints and consumes them. Reads of version-1 stores normalize to version 2 (the write-back on the next save/load re-shapes the persisted data; the legacy fake-fit flags never come back).
//   DEPENDS: @/ipc/runtime ipcPrefs (mt::prefs::get / mt::prefs::set — the existing loose-typed prefs IPC; the renderer holds the schema, so no backend change); util/tableLayoutRatios (migrateTableEntry, the schema v2 entry rules); window.fileUtils.stat for the prune (absent stat → pruning is skipped, entries kept).
//   LINKS: .grace/changes/archive/C-65 R-1/R-2 (T-001); .grace/changes/archive/C-PAGE-WIDTH-TABLES (plan T-008, spec R-8/R-10, corners C-8/C-9; graph/performance.xml M-061); .grace/graph/runtime.xml M-012 fn-tableResize (muya counterpart) and M-011 (editor.vue host wiring BLOCK_TABLE_LAYOUTS_HOST); .grace/verification/runtime.xml V-M-012 scenario-66 and verification/performance.xml V-M-061; util/tableLayoutRatios.js (the entry/migration maths); store/editor.js RENAME + RENAME_IF_NEEDED (the rename move hooks); components/editorWithTabs/editor.vue (load/save host).
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   TABLE_LAYOUTS_PREFS_KEY - the single prefs key holding the whole store ("tableLayouts").
//   MAX_TABLE_LAYOUT_FILES - cap on remembered files (30, newest by updatedAt kept).
//   EMPTY_STORE - the canonical empty store shape ({ version: 2, files: {} }).
//   sanitizeEntry - pure: one raw entry through the schema-v2 rules (util/tableLayoutRatios migrateTableEntry): { widths, manual, mode?, ratios?, tableWidth? } or null; the legacy fullWidth/fit booleans migrate one-way.
//   normalizeStore - pure: any raw prefs value (v1 or v2) → a valid version-2 store (invalid shapes collapse to EMPTY_STORE).
//   storeWithFileEntries - pure: set/replace/delete one file's entries (empty entries delete the file entry) with an updatedAt stamp.
//   capStoreFiles - pure: keep at most max files, newest updatedAt first (ties by path for determinism).
//   moveFileEntry - pure: move one file's entry from one path to another (absent source → unchanged store; destination clobbered).
//   pruneMissingFiles - async: drop entries whose file no longer exists (stat resolves false or throws); a missing stat capability keeps everything.
//   defaultIo - the ipcPrefs-backed IO the high-level flows use when none is injected.
//   readStore / writeStore - async: prefs get/set of the single key (normalize on read).
//   loadTableLayoutsFor - async: the C-65 load path — read, prune, cap, write back when the store changed, return the file's entries ({} when none).
//   saveTableLayoutsFor - async: write the file's entries (delete the file entry when empty), never pruning (the load path owns that).
//   moveTableLayoutsEntry - async: the R-2 rename move — entries follow the new path; a Finder move does NOT go through here.
//   writeStore - exported helper (writeStore).
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v2.0.0 - 2026-11-02 C-PAGE-WIDTH-TABLES T-008: schema
//   v2. Entries carry ratios (fractions of the table width) and an
//   optional explicit tableWidth next to the px widths, and the mode
//   field ('fit' | 'full') replaces the legacy fullWidth/fit booleans —
//   stored fit:true (the retired fake fit) migrates one-way to the honest
//   Fit page and re-running the migration changes nothing (corner C-8).
//   The header-signature identity rules, the 30-file cap and the
//   sanitize-what-is-invalid posture are unchanged.
//   PREV: v1.1.0 - 2026-10-20 C-TABLE-FIT-PERSISTENCE: the
//   sanitizer keeps muya's fit flag, so an explicit «Fit to page» choice
//   survives the host save/load path (the native owner review showed the
//   flag was silently dropped here and a wide table reverted to Full
//   width after reload; muya's own sanitizer always kept it). Full width
//   still wins a contradictory entry.
//   PREV: v1.0.0 - 2026-10-18 C-65 T-001: new module. Widths and
//   the per-table Full width mode persist per FILE in the Mark profile —
//   never written into the Markdown. Loads prune missing files and cap
//   the store at 30; renames through Mark move the entry (R-2).
// END_CHANGE_SUMMARY

import { ipcPrefs } from '@/ipc/runtime'
import { migrateTableEntry } from './tableLayoutRatios'

export const TABLE_LAYOUTS_PREFS_KEY = 'tableLayouts'
export const MAX_TABLE_LAYOUT_FILES = 30

export const EMPTY_STORE = { version: 2, files: {} }

// START_BLOCK_STORE_TRANSFORMS
// Pure store maths — every rule below is unit-pinned with plain objects.
// The entry rules (widths clamping, the legacy boolean → mode migration,
// ratios/tableWidth validation, husk dropping) live in util/tableLayoutRatios
// so muya's sanitizer and this store share one normative description.
export const sanitizeEntry = (raw) => migrateTableEntry(raw)

export const normalizeStore = (raw) => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || !raw.files || typeof raw.files !== 'object') {
    return { version: 2, files: {} }
  }
  const files = {}
  for (const pathname of Object.keys(raw.files)) {
    const entries = raw.files[pathname]
    if (!entries || typeof entries !== 'object') continue
    const clean = {}
    for (const pid of Object.keys(entries)) {
      if (pid === 'updatedAt') continue
      const entry = sanitizeEntry(entries[pid])
      if (entry) clean[pid] = entry
    }
    // updatedAt survives normalization: capStoreFiles keeps the newest
    // files by it (dropping it made the cap fall back to name order).
    if (Object.keys(clean).length > 0) {
      files[pathname] = Number.isFinite(entries.updatedAt)
        ? Object.assign({ updatedAt: entries.updatedAt }, clean)
        : clean
    }
  }
  return { version: 2, files }
}

export const storeWithFileEntries = (store, pathname, entries, now = Date.now()) => {
  const base = normalizeStore(store)
  const files = Object.assign({}, base.files)
  if (entries && Object.keys(entries).length > 0) {
    const clean = {}
    for (const pid of Object.keys(entries)) {
      const entry = sanitizeEntry(entries[pid])
      if (entry) clean[pid] = entry
    }
    if (Object.keys(clean).length > 0) {
      files[pathname] = Object.assign({ updatedAt: now }, clean)
    } else {
      delete files[pathname]
    }
  } else {
    delete files[pathname]
  }
  return { version: 2, files }
}

export const capStoreFiles = (store, max = MAX_TABLE_LAYOUT_FILES) => {
  const base = normalizeStore(store)
  const paths = Object.keys(base.files)
  if (paths.length <= max) return { store: base, capped: false }
  paths.sort((a, b) => {
    const ta = base.files[a].updatedAt || 0
    const tb = base.files[b].updatedAt || 0
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
// END_BLOCK_STORE_TRANSFORMS

// START_BLOCK_STORE_IO
// The injected IO is { get(key), set(key, value) } — the prefs facade by
// default, fakes in tests. A failed read degrades to the empty store (a
// corrupted profile never blocks editing); a failed write warns with the
// anchored marker and resolves (a layout is a convenience, never a
// blocker).
export const defaultIo = {
  get: (key) => ipcPrefs.get(key),
  set: (key, value) => ipcPrefs.set(key, value)
}

export const readStore = async (io = defaultIo) => {
  try {
    return normalizeStore(await io.get(TABLE_LAYOUTS_PREFS_KEY))
  } catch (e) {
    console.warn(`[TableLayoutStore][readStore][BLOCK_TABLE_LAYOUTS_READ_FAILED] ${e}`)
    return { version: 1, files: {} }
  }
}

export const writeStore = async (store, io = defaultIo) => {
  await io.set(TABLE_LAYOUTS_PREFS_KEY, store)
}

// stat resolves "this file exists" — the shared fileUtils bridge shape
// ({ isFile } or { is_file }); anything else means "cannot tell" and the
// prune keeps the entry (a missing capability must not eat layouts).
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

// The C-65 load path (R-1): prune entries whose file no longer exists,
// cap the store size, write the corrected store back when anything
// changed, and hand the caller the file's entries ({} when none).
export const loadTableLayoutsFor = async (pathname, io = defaultIo) => {
  if (!pathname) return {}
  const rawStore = await readStore(io)
  const { store: prunedStore, pruned } = await pruneMissingFiles(rawStore)
  const { store: cappedStore, capped } = capStoreFiles(prunedStore)
  if (pruned.length > 0 || capped) {
    try {
      await writeStore(cappedStore, io)
      console.debug(
        `[TableLayoutStore][loadTableLayoutsFor][BLOCK_TABLE_LAYOUTS_PRUNED files=${pruned.length} capped=${capped}]`
      )
    } catch (e) {
      console.warn(`[TableLayoutStore][loadTableLayoutsFor][BLOCK_TABLE_LAYOUTS_WRITE_FAILED] ${e}`)
    }
  }
  const entries = cappedStore.files[pathname]
  if (!entries) return {}
  // Hand muya only the table entries, never the bookkeeping timestamp.
  const { updatedAt, ...tables } = entries
  return tables
}

// The C-65 save path: replace ONE file's entries; an empty entries object
// (no table carries a user layout anymore) deletes the file entry so the
// store never accumulates husks.
export const saveTableLayoutsFor = async (pathname, entries, io = defaultIo) => {
  if (!pathname) return false
  const rawStore = await readStore(io)
  const nextStore = storeWithFileEntries(rawStore, pathname, entries)
  try {
    await writeStore(nextStore, io)
    return true
  } catch (e) {
    console.warn(`[TableLayoutStore][saveTableLayoutsFor][BLOCK_TABLE_LAYOUTS_WRITE_FAILED] ${e}`)
    return false
  }
}

// R-2: a rename through Mark (title-bar card › Rename… / the sidebar
// rename) moves the stored layouts to the new path; a Finder move does
// not (it never runs through here — the next load prunes the orphan).
export const moveTableLayoutsEntry = async (from, to, io = defaultIo) => {
  if (!from || !to || from === to) return false
  const rawStore = await readStore(io)
  if (!rawStore.files[from]) return false
  const nextStore = moveFileEntry(rawStore, from, to)
  try {
    await writeStore(nextStore, io)
    console.debug(
      `[TableLayoutStore][moveTableLayoutsEntry][BLOCK_TABLE_LAYOUTS_MOVED] ${from} -> ${to}`
    )
    return true
  } catch (e) {
    console.warn(`[TableLayoutStore][moveTableLayoutsEntry][BLOCK_TABLE_LAYOUTS_WRITE_FAILED] ${e}`)
    return false
  }
}
// END_BLOCK_STORE_IO
