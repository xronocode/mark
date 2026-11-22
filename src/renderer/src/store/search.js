import { defineStore } from 'pinia'
import log from 'electron-log'
import { usePreferencesStore } from './preferences'
import { useProjectStore } from './project'
import RipgrepDirectorySearcher from '../node/ripgrepSearcher'

// START_MODULE_CONTRACT
//   PURPOSE: The project-search store — keyword/options/results state plus
//            the honest error/partial voice for the ProjectSearch overlay.
//   SCOPE: runSearch dispatch through the shared searcher with a
//          generation claimed exactly once per runSearch invocation
//          (ahead of every early return, so a late completion can never
//          overwrite a reset), parseSearchMaxFileSize at the boundary,
//          quiet cancel, the honest delivered-match cap
//          (SEARCH_RESULT_CAP, marked through partialResults), and the
//          error/partialResults states; no UI, no IPC surface of its own.
//   DEPENDS: stores/preferences (search options), stores/project (roots),
//          node/ripgrepSearcher (searcher + didComplete terminal).
//   LINKS: .grace/graph/runtime.xml M-011; components/projectSearch;
//          tests/renderer/store/search.test.ts, search-coverage.test.js.
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
// START_MODULE_MAP
//   useSearchStore - the Pinia store (keyword, results, running, error,
//                    partialResults, runSearch, cancelRunning).
//   parseSearchMaxFileSize - documented size-string parser at the store boundary.
//   SEARCH_RESULT_CAP - honest delivered-match cap (100): the displayed
//                       set truncates to exactly this many delivered
//                       matches and is marked partial through
//                       partialResults; a cap is not a failure.
// END_MODULE_MAP
//

// v1.3.0: search lifecycle — one generation claim per runSearch
// invocation (every early return supersedes) and an honest
// delivered-match cap in the partial voice; the dead didSearchPaths
// wire limits are removed (C-SEARCH-LIFECYCLE-DISCARD).
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: 2026-11-23 - C-SEARCH-LIFECYCLE-DISCARD T-002:
//     the generation is claimed exactly once at runSearch entry, ahead
//     of every early return — clearing the keyword, losing the roots or
//     an invalid max file size now supersedes an in-flight generation,
//     so its late completion can never resurrect cleared results (the
//     empty-keyword reset also clears partialResults). The unreachable
//     didSearchPaths limit (the searchedPaths event never exists on the
//     wire; the hardcoded English promise wrote the failure voice) is
//     replaced by an honest delivered-match cap: SEARCH_RESULT_CAP = 100
//     delivered matches, the crossing envelope sliced to the exact
//     remaining count, the walk cancelled through the existing
//     raw-promise seam, and the truncated set marked partial through
//     partialResults — a cap is not a failure, the error voice stays
//     empty.
//   PREVIOUS: 2026-11-21 - C-SEARCH-ERROR-VISIBILITY T-002:
//     parseSearchMaxFileSize at the store boundary (documented
//     "1048576"/"1K"/"2M"/"3G"/empty schema; an invalid limit fails the
//     search BEFORE any searcher call or spawn), and the rejection path
//     stops swallowing — this.error carries a stable class message and
//     already-streamed results are kept only when the terminal marked
//     them partial (partialResults; never silently kept or dropped).
//     Cancelled searches still resolve quietly.
//   PREVIOUS: v1.2.0 - 2026-10-22 C-MULTI-SOURCE-WORKSPACE fix wave:
//     generation guard in runSearch — a keystroke-canceled generation's
//     completion no longer writes partial results over the newest
//     generation nor stomps running/activeCancel. Before the fix, typing
//     a query char-by-char could end with only the first root's matches
//     visible (roots are searched sequentially; an interleaved stale
//     write kept the late root out). Found live during owner acceptance
//     (С4): paste-as-one-event found both roots, char typing lost one.
// END_CHANGE_SUMMARY

// Lazy: RipgrepDirectorySearcher's constructor reads
// `window.marktext.paths.ripgrepBinaryPath`, which is only populated after
// the renderer bootstrap completes. Constructing at module-load time
// (when the Pinia plugin imports stores eagerly) crashes with
// "Cannot read properties of undefined (reading 'paths')".
let directorySearcher = null
let activeCancel = null
const getSearcher = () => {
  if (!directorySearcher) directorySearcher = new RipgrepDirectorySearcher()
  return directorySearcher
}

// C-SEARCH-ERROR-VISIBILITY T-002: the documented preferences schema
// stores searchMaxFileSize as a string — "1048576", "1K", "2M", "3G"
// (bytes with an optional K/M/G suffix) or empty for no limit. The store
// parses it BEFORE any searcher call so an invalid value fails the
// search at the boundary instead of spawning with garbage.
//   returns  number     byte limit
//            null       no limit (empty/absent value)
//            undefined  invalid — the caller must fail without spawning
const SEARCH_MAX_FILE_SIZE_PATTERN = /^\d+[KMG]?$/
const SEARCH_SIZE_UNIT_MULTIPLIERS = { K: 1024, M: 1024 * 1024, G: 1024 * 1024 * 1024 }
export const parseSearchMaxFileSize = (raw) => {
  if (raw === null || raw === undefined || raw === '') return null
  if (typeof raw === 'number') {
    return Number.isFinite(raw) && raw >= 0 ? Math.floor(raw) : undefined
  }
  if (typeof raw !== 'string') return undefined
  const text = raw.trim()
  if (text === '') return null
  if (!SEARCH_MAX_FILE_SIZE_PATTERN.test(text)) return undefined
  const suffix = text[text.length - 1]
  const multiplier = suffix in SEARCH_SIZE_UNIT_MULTIPLIERS ? SEARCH_SIZE_UNIT_MULTIPLIERS[suffix] : 1
  const digits = multiplier === 1 ? text : text.slice(0, -1)
  return Number(digits) * multiplier
}

// C-SEARCH-LIFECYCLE-DISCARD T-002: the honest delivered-match cap,
// preserving the number the removed dead limit promised ("first 100
// results"). Counted on DELIVERED matches — the grouped envelopes'
// matches summed, the same unit the overlay's resultSummary reports —
// so the promise is executable: the crossing envelope is sliced to the
// exact remaining count, later envelopes are dropped, the in-flight
// walk is cancelled through the existing raw-promise seam and the
// truncated set is marked partial through partialResults (the overlay's
// existing localized notice). A cap is not a failure: the error voice
// stays empty.
const SEARCH_RESULT_CAP = 100

export const useSearchStore = defineStore('search', {
  state: () => ({
    keyword: '',
    isCaseSensitive: false,
    isWholeWord: false,
    isRegexp: false,
    results: [],
    running: false,
    error: '',
    // C-SEARCH-ERROR-VISIBILITY T-002: whether the currently displayed
    // result set is honest-partial (an error terminal or cancellation
    // already streamed hits, or a size limit / exclusion mask was
    // active). The overlay renders a dedicated partial notice.
    partialResults: false,
    showCancel: false,
    // C-MULTI-SOURCE-WORKSPACE fix wave: monotonic search generation.
    // Every runSearch bumps it; a completion handler that belongs to an
    // older generation must not write results nor touch running/
    // activeCancel. Without the guard, a keystroke-canceled generation
    // resolved immediately and its .then() wrote a PARTIAL collected set
    // (roots are searched sequentially, so later roots were missing)
    // over the newest generation's write — and stomped running=false /
    // activeCancel=null, leaving later generations uncancellable.
    _searchGeneration: 0
  }),
  getters: {
    hasQuery: (s) => s.keyword.length > 0,
    matchCount: (s) => s.results.reduce((acc, r) => acc + r.matches.length, 0)
  },
  actions: {
    SET_KEYWORD(value) {
      this.keyword = value
      this.runSearch()
    },
    TOGGLE_OPTION(name) {
      if (name === 'isCaseSensitive') this.isCaseSensitive = !this.isCaseSensitive
      if (name === 'isWholeWord') this.isWholeWord = !this.isWholeWord
      if (name === 'isRegexp') this.isRegexp = !this.isRegexp
      this.runSearch()
    },
    cancelRunning() {
      if (this.running && activeCancel) activeCancel()
    },
    runSearch() {
      const projectStore = useProjectStore()
      const preferencesStore = usePreferencesStore()
      // v1.1.0 Phase-A6: range over ALL opened roots, not the legacy single one.
      // Filter out empty/falsy paths defensively (paranoia in case a transient
      // store state pushes a partial root).
      const rootPathnames = (projectStore.projectTrees || [])
        .map((r) => r && r.pathname)
        .filter(Boolean)
      // C-SEARCH-LIFECYCLE-DISCARD T-002: claim this generation exactly
      // once per runSearch invocation, ahead of EVERY early return —
      // clearing the keyword, losing the roots or an invalid max file
      // size now supersedes an in-flight generation, so its late
      // completion (the searcher settles a cancel with resolve) can
      // never write results, partialResults, running or activeCancel
      // over the just-reset state.
      const generation = ++this._searchGeneration
      if (rootPathnames.length === 0) {
        // eslint-disable-next-line no-console
        console.debug(`[SearchStore][runSearch][BLOCK_EMPTY_ROOTS] projectTrees.length=0`)
        this.results = []
        this.partialResults = false
        this.running = false
        return
      }
      if (this.running && activeCancel) activeCancel()
      this.error = ''
      this.partialResults = false
      activeCancel = null
      if (!this.keyword) {
        this.results = []
        // A cleared query cannot leave a stale partial notice beside the
        // empty list.
        this.partialResults = false
        this.running = false
        return
      }
      // C-SEARCH-ERROR-VISIBILITY T-002: parse the documented size string
      // at the store boundary — an invalid limit fails the search here,
      // before any searcher call, with no spawn and running stays false.
      const maxFileSize = parseSearchMaxFileSize(preferencesStore.searchMaxFileSize)
      if (maxFileSize === undefined) {
        // eslint-disable-next-line no-console
        console.debug(`[SearchStore][runSearch][BLOCK_INVALID_MAX_FILE_SIZE] raw=${JSON.stringify(preferencesStore.searchMaxFileSize)}`)
        this.error = `Invalid max file size: ${preferencesStore.searchMaxFileSize}`
        this.results = []
        this.partialResults = false
        this.running = false
        return
      }
      let canceled = false
      // C-SEARCH-ERROR-VISIBILITY T-002: the terminal's honest partial
      // marker arrives exactly once via the searcher's didComplete.
      let terminalPartial = false
      // C-SEARCH-LIFECYCLE-DISCARD T-002: per-run delivered-match cap
      // state. capReached is set synchronously in this run's own
      // didMatch path — the truncation never depends on the backend
      // terminal (a UI-cancelled search settles before the terminal can
      // deliver a partial flag) — and the run's .then folds it into the
      // honest partial voice.
      let capReached = false
      let deliveredMatches = 0
      this.running = true
      const collected = []
      // eslint-disable-next-line no-console
      console.debug(`[SearchStore][runSearch][BLOCK_DISPATCH] roots=[${rootPathnames.join(',')}] keyword=${JSON.stringify(this.keyword)} cs=${this.isCaseSensitive} ww=${this.isWholeWord} re=${this.isRegexp}`)
      // C-SEARCH-ERROR-VISIBILITY: wire the cancellable handle from the
      // RAW searcher promise — attaching .then()/.catch() returns a new
      // plain Promise and silently drops the searcher's .cancel, which
      // had left cancelRunning dead (a latent bug the honest cancel test
      // exposed).
      const searchPromise = getSearcher().search(rootPathnames, this.keyword, {
        didMatch: (res) => {
          if (canceled || capReached) return
          const matches = Array.isArray(res && res.matches) ? res.matches : []
          // A zero-match entry is never emitted.
          if (matches.length === 0) return
          const remaining = SEARCH_RESULT_CAP - deliveredMatches - matches.length
          if (remaining >= 0) {
            collected.push(res)
            deliveredMatches += matches.length
            return
          }
          // Honest delivered-match cap: the crossing envelope is sliced
          // to the exact remaining count (the displayed sum equals
          // SEARCH_RESULT_CAP precisely), later envelopes are dropped,
          // and the in-flight walk is cancelled through the existing
          // raw-promise seam — the same seam the removed dead limit
          // used. No generation bump: this is a same-generation honest
          // finalization riding the current deal's .then.
          const keep = SEARCH_RESULT_CAP - deliveredMatches
          collected.push({ ...res, matches: matches.slice(0, keep) })
          deliveredMatches = SEARCH_RESULT_CAP
          capReached = true
          if (searchPromise.cancel) searchPromise.cancel()
        },
        didComplete: ({ partial } = {}) => {
          terminalPartial = partial === true
        },
        isCaseSensitive: this.isCaseSensitive,
        isWholeWord: this.isWholeWord,
        isRegexp: this.isRegexp,
        exclusions: preferencesStore.searchExclusions,
        maxFileSize,
        includeHidden: preferencesStore.searchIncludeHidden,
        noIgnore: preferencesStore.searchNoIgnore,
        followSymlinks: preferencesStore.searchFollowSymlinks,
        inclusions: window.fileUtils.MARKDOWN_INCLUSIONS
      })
      if (searchPromise.cancel) activeCancel = searchPromise.cancel
      searchPromise
        .then(() => {
          // Generation guard (C-MULTI-SOURCE-WORKSPACE fix wave): a newer
          // keystroke already claimed the store — this generation's
          // partial results must NOT overwrite the newest write, and it
          // must not reset running/activeCancel owned by the new one.
          if (generation !== this._searchGeneration) {
            // eslint-disable-next-line no-console
            console.debug(`[SearchStore][runSearch][BLOCK_STALE_GENERATION_DROPPED] gen=${generation} current=${this._searchGeneration}`)
            return
          }
          // Defense in depth: a root may have been CLOSE_PROJECTed mid-search.
          // Filter collected results to those still under an active root.
          const liveRoots = (projectStore.projectTrees || [])
            .map((r) => r && r.pathname)
            .filter(Boolean)
          this.results = collected.filter((r) => {
            const path = r && (r.filePath || r.pathname)
            return path && liveRoots.some((root) => path === root || path.startsWith(root + '/'))
          })
          // A UI-cancelled search settles before the backend terminal can
          // deliver a partial flag, so terminalPartial stays false for
          // quiet cancels; a capped run is honest-partial on its own
          // (C-SEARCH-LIFECYCLE-DISCARD T-002) — a capped set is never
          // presented as complete.
          this.partialResults = terminalPartial || capReached
          this.running = false
          activeCancel = null
          // eslint-disable-next-line no-console
          console.debug(`[SearchStore][runSearch][BLOCK_RESULT] count=${this.results.length} canceled=${canceled}`)
        })
        .catch((err) => {
          if (generation !== this._searchGeneration) return
          canceled = true
          if (searchPromise.cancel) searchPromise.cancel()
          log.error('Error while searching in directory:', err)
          // eslint-disable-next-line no-console
          console.debug(`[SearchStore][runSearch][BLOCK_ERROR] err=${err && err.message}`)
          // C-SEARCH-ERROR-VISIBILITY T-002: the rejection stops being
          // swallowed — a stable class message surfaces, and
          // already-streamed results are kept only when the terminal
          // marked them partial (never silently kept, never silently
          // dropped, never rendered as the plain empty state).
          const errorMessage = typeof (err && err.message) === 'string' && err.message.trim()
            ? err.message
            : 'Search failed'
          this.error = errorMessage
          const liveRoots = (projectStore.projectTrees || [])
            .map((r) => r && r.pathname)
            .filter(Boolean)
          this.results = terminalPartial
            ? collected.filter((r) => {
                const path = r && (r.filePath || r.pathname)
                return path && liveRoots.some((root) => path === root || path.startsWith(root + '/'))
              })
            : []
          this.partialResults = terminalPartial
          this.running = false
          activeCancel = null
        })
    }
  }
})
