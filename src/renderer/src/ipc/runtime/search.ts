// MODULE_CONTRACT
//   PURPOSE: M-013b frontend search facade. Provides a
//            RipgrepDirectorySearcher-compatible class so v1.2.3's
//            store/search.js works without changes (variant-(a) port).
//            Also exposes a slim `ipcSearch` namespace for new code.
//   SCOPE:   spawn (returns thenable+cancel) + cancel. Streaming hits
//            arrive on the 'mt::search-event' Tauri channel; we filter
//            by searchId.
//   DEPENDS: M-013a contract (ipcInvoke, useIpcListener).
//   LINKS:   v1.2.3 src/renderer/src/node/ripgrepSearcher.js — the API
//            shape we mirror;
//            src-tauri/src/m013b/search.rs SEARCH_EVENT_CHANNEL.
//   STATUS:  Phase-B2 step-5 shipped.
//
// CHANGE_SUMMARY:
//   - 2026-04-28 B2-step-5: initial facade with RipgrepDirectorySearcher
//     compatibility shim.

import { ipcInvoke, useIpcListener, IpcError, IpcErrorCode, type SearchOptions } from '../contract'

export const SEARCH_EVENT_CHANNEL = 'mt::search-event'

export interface SearchHit {
  path: string
  line: number
  column: number
  snippet: string
  truncated: boolean
}

interface SearchEventEnvelope {
  searchId: string
  /** "match" | "complete" | "error" | "cancelled" */
  kind: string
  hits?: SearchHit[]
  error?: string
  seq: number
}

let searchSeq = 0
function nextSearchId(): string {
  searchSeq = (searchSeq + 1) >>> 0
  return `r-${Date.now().toString(36)}-${searchSeq}`
}

/**
 * v1.2.3-compatible options shape: in addition to SearchOptions the
 * caller may pass didMatch / didSearchPaths callbacks. didMatch fires
 * for each hit (NOT each batch); didSearchPaths fires with running
 * file count for cancellation throttling.
 */
export interface SearcherOptions extends SearchOptions {
  didMatch?: (hit: SearchHit) => void
  didSearchPaths?: (countSoFar: number) => void
}

export interface CancelablePromise<T> extends Promise<T> {
  cancel(): void
}

/**
 * RipgrepDirectorySearcher — drop-in replacement for v1.2.3's class
 * at src/renderer/src/node/ripgrepSearcher.js. Same constructor +
 * search(directories, pattern, options) signature returning a thenable
 * with .cancel().
 */
export class RipgrepDirectorySearcher {
  search(
    directories: string[],
    pattern: string,
    options: SearcherOptions = {}
  ): CancelablePromise<void> {
    const searchId = nextSearchId()
    const didMatch = options.didMatch ?? (() => {})
    const didSearchPaths = options.didSearchPaths ?? (() => {})

    let resolveOuter!: () => void
    let rejectOuter!: (err: unknown) => void
    const outerPromise = new Promise<void>((resolve, reject) => {
      resolveOuter = resolve
      rejectOuter = reject
    }) as CancelablePromise<void>

    let unsubscribe: (() => void) | null = null
    let settled = false
    let searchedFiles = 0

    const settle = (kind: 'resolve' | 'reject', value?: unknown) => {
      if (settled) return
      settled = true
      if (unsubscribe) {
        try {
          unsubscribe()
        } catch {
          // best-effort
        }
        unsubscribe = null
      }
      if (kind === 'resolve') resolveOuter()
      else rejectOuter(value)
    }

    // Subscribe BEFORE invoking spawn so we don't race the first batch.
    useIpcListener<SearchEventEnvelope>(SEARCH_EVENT_CHANNEL, (event) => {
      if (event.searchId !== searchId) return
      switch (event.kind) {
        case 'match':
          for (const hit of event.hits ?? []) {
            try {
              didMatch(hit)
              searchedFiles += 1
              if (searchedFiles % 16 === 0) didSearchPaths(searchedFiles)
            } catch (err) {
              // eslint-disable-next-line no-console
              console.warn('[RipgrepDirectorySearcher] didMatch threw:', err)
            }
          }
          break
        case 'complete':
          settle('resolve')
          break
        case 'cancelled':
          settle('resolve')
          break
        case 'error':
          settle(
            'reject',
            new IpcError(IpcErrorCode.UNKNOWN_COMMAND, event.error ?? 'search error', 'mt::search::spawn')
          )
          break
      }
    })
      .then((u) => {
        unsubscribe = u
        return ipcInvoke('mt::search::spawn', {
          searchId,
          mode: 'content',
          directories,
          pattern,
          options: {
            isRegexp: options.isRegexp,
            isCaseSensitive: options.isCaseSensitive,
            isWholeWord: options.isWholeWord,
            followSymlinks: options.followSymlinks,
            maxFileSize: options.maxFileSize,
            includeHidden: options.includeHidden,
            noIgnore: options.noIgnore,
            leadingContextLineCount: options.leadingContextLineCount,
            trailingContextLineCount: options.trailingContextLineCount,
            inclusions: options.inclusions,
            exclusions: options.exclusions
          }
        })
      })
      .catch((err) => settle('reject', err))

    outerPromise.cancel = () => {
      ipcInvoke('mt::search::cancel', { searchId }).catch(() => {
        // best-effort
      })
      settle('resolve')
    }

    return outerPromise
  }
}

export const ipcSearch = {
  /** Modern API: returns a class instance with .search() / .cancel(). */
  newSearcher(): RipgrepDirectorySearcher {
    return new RipgrepDirectorySearcher()
  },
  RipgrepDirectorySearcher
}
export type IpcSearch = typeof ipcSearch
