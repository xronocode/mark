// MODULE_CONTRACT
//   PURPOSE: V-M-013 deterministic surface check for the M-013b runtime
//            facade. Type-only — no Tauri runtime required. Asserts:
//              (1) ipc.fs / ipc.watch / ipc.search namespaces export the
//                  expected method shapes,
//              (2) RipgrepDirectorySearcher class has the v1.2.3-compatible
//                  search(directories, pattern, options) signature,
//              (3) WATCH_EVENT_CHANNEL + SEARCH_EVENT_CHANNEL are stable
//                  string literals matching the Rust-side constants.
//   STATUS:  Phase-B2 step-5. Runtime tests (real Tauri commands) ship
//            in B3 once the dev URL boots end-to-end with M-005 prefs.
//
// CHANGE_SUMMARY:
//   - 2026-04-28 B2-step-5: initial type surface check.

import {
  ipc,
  ipcFs,
  ipcWatch,
  ipcSearch,
  RipgrepDirectorySearcher,
  WATCH_EVENT_CHANNEL,
  SEARCH_EVENT_CHANNEL,
  type WatchEvent,
  type SearchHit,
  type SearcherOptions,
  type CancelablePromise
} from './index'
import type { FsStat, SearchOptions } from '../contract'

// ─── (1) namespace shape ─────────────────────────────────────────
const _fs_read: (p: string) => Promise<string> = ipcFs.read
const _fs_write: (p: string, c: string) => Promise<void> = ipcFs.write
const _fs_stat: (p: string) => Promise<FsStat> = ipcFs.stat
const _fs_readdir: (p: string) => Promise<string[]> = ipcFs.readdir
const _fs_unlink: (p: string) => Promise<void> = ipcFs.unlink
void _fs_read
void _fs_write
void _fs_stat
void _fs_readdir
void _fs_unlink

const _watch_subscribe: (
  p: string,
  h: (e: WatchEvent) => void
) => Promise<() => void> = ipcWatch.subscribe
void _watch_subscribe

const _search_factory: () => RipgrepDirectorySearcher = ipcSearch.newSearcher
void _search_factory

// `ipc` convenience namespace mirrors the per-module exports.
const _ns_fs: typeof ipcFs = ipc.fs
const _ns_watch: typeof ipcWatch = ipc.watch
const _ns_search: typeof ipcSearch = ipc.search
void _ns_fs
void _ns_watch
void _ns_search

// ─── (2) RipgrepDirectorySearcher v1.2.3 compat ──────────────────
async function _searcher_shape() {
  const s = new RipgrepDirectorySearcher()
  const opts: SearcherOptions = {
    isRegexp: true,
    isCaseSensitive: false,
    isWholeWord: true,
    didMatch: (hit: SearchHit) => {
      const _p: string = hit.path
      const _l: number = hit.line
      const _c: number = hit.column
      const _s: string = hit.snippet
      const _t: boolean = hit.truncated
      void _p
      void _l
      void _c
      void _s
      void _t
    },
    didSearchPaths: (n: number) => {
      const _n: number = n
      void _n
    }
  }
  const promise: CancelablePromise<void> = s.search(['/work'], 'pattern', opts)
  // .cancel() exists on the returned thenable.
  promise.cancel()
  await promise
}
void _searcher_shape

// ─── (3) channel constants stable ─────────────────────────────────
const _watch_ch: 'mt::watch::event' = WATCH_EVENT_CHANNEL
const _search_ch: 'mt::search-event' = SEARCH_EVENT_CHANNEL
void _watch_ch
void _search_ch

// SearchOptions is the camelCase shape Rust serde rename_all expects.
const _opts: SearchOptions = {
  isRegexp: false,
  isCaseSensitive: true,
  isWholeWord: false,
  followSymlinks: false,
  maxFileSize: 1024,
  includeHidden: false,
  noIgnore: false,
  inclusions: ['*.md'],
  exclusions: ['node_modules']
}
void _opts

// FsStat is camelCase — mirrors Rust serde rename_all + v1.2.3
// contextBridge structured-clone shape.
const _stat: FsStat = {
  size: 0,
  mode: 0,
  mtimeMs: 0,
  isFile: true,
  isDirectory: false,
  isSymbolicLink: false
}
void _stat
