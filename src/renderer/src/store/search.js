import { defineStore } from 'pinia'
import log from 'electron-log'
import { usePreferencesStore } from './preferences'
import { useProjectStore } from './project'
import RipgrepDirectorySearcher from '../node/ripgrepSearcher'

// START_MODULE_CONTRACT
//   PURPOSE: The project-search store — keyword/options/results state plus
//            the honest error/partial voice for the ProjectSearch overlay.
//   SCOPE: runSearch dispatch through the shared searcher with a
//          generation guard, parseSearchMaxFileSize at the boundary,
//          quiet cancel, error/partialResults states; no UI, no IPC
//          surface of its own.
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
// END_MODULE_MAP
//

// v1.1.0: shared search state — one store owning project-search state
// (keyword, options, results, running/error) for the live ProjectSearch
// overlay (components/projectSearch, mounted from pages/app.vue), so the
// searcher instance is owned in one place.
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: 2026-11-21 - C-SEARCH-ERROR-VISIBILITY T-002:
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
      // Claim this generation BEFORE spawning: any completion that
      // arrives for an older generation (already superseded by a newer
      // keystroke) is dropped without writing state.
      const generation = ++this._searchGeneration
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
          if (canceled) return
          collected.push(res)
        },
        didComplete: ({ partial } = {}) => {
          terminalPartial = partial === true
        },
        didSearchPaths: (n) => {
          if (!canceled && n > 100) {
            canceled = true
            if (searchPromise.cancel) searchPromise.cancel()
            this.error = `Showing first 100 results only`
          }
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
          // deliver a partial flag, so this stays false for quiet cancels.
          this.partialResults = terminalPartial
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
