import { defineStore } from 'pinia'
import log from 'electron-log'
import { usePreferencesStore } from './preferences'
import { useProjectStore } from './project'
import RipgrepDirectorySearcher from '../node/ripgrepSearcher'

// v1.1.0: shared search state — split out from sideBar/search.vue so the
// always-visible SearchToolbar (top of sidebar) and SearchResults panel
// (below, shown only when there's a query) consume the same source of
// truth and the searcher instance is owned in one place.

// Lazy: RipgrepDirectorySearcher's constructor reads
// `global.marktext.paths.ripgrepBinaryPath`, which is only populated after
// the renderer bootstrap completes. Constructing at module-load time
// (when the Pinia plugin imports stores eagerly) crashes with
// "Cannot read properties of undefined (reading 'paths')".
let directorySearcher = null
let activeCancel = null
const getSearcher = () => {
  if (!directorySearcher) directorySearcher = new RipgrepDirectorySearcher()
  return directorySearcher
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
    showCancel: false
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
        this.running = false
        return
      }
      if (this.running && activeCancel) activeCancel()
      this.error = ''
      activeCancel = null
      if (!this.keyword) {
        this.results = []
        this.running = false
        return
      }
      let canceled = false
      this.running = true
      const collected = []
      // eslint-disable-next-line no-console
      console.debug(`[SearchStore][runSearch][BLOCK_DISPATCH] roots=[${rootPathnames.join(',')}] keyword=${JSON.stringify(this.keyword)} cs=${this.isCaseSensitive} ww=${this.isWholeWord} re=${this.isRegexp}`)
      const promises = getSearcher().search(rootPathnames, this.keyword, {
        didMatch: (res) => {
          if (canceled) return
          collected.push(res)
        },
        didSearchPaths: (n) => {
          if (!canceled && n > 100) {
            canceled = true
            if (promises.cancel) promises.cancel()
            this.error = `Showing first 100 results only`
          }
        },
        isCaseSensitive: this.isCaseSensitive,
        isWholeWord: this.isWholeWord,
        isRegexp: this.isRegexp,
        exclusions: preferencesStore.searchExclusions,
        maxFileSize: preferencesStore.searchMaxFileSize || null,
        includeHidden: preferencesStore.searchIncludeHidden,
        noIgnore: preferencesStore.searchNoIgnore,
        followSymlinks: preferencesStore.searchFollowSymlinks,
        inclusions: window.fileUtils.MARKDOWN_INCLUSIONS
      })
        .then(() => {
          // Defense in depth: a root may have been CLOSE_PROJECTed mid-search.
          // Filter collected results to those still under an active root.
          const liveRoots = (projectStore.projectTrees || [])
            .map((r) => r && r.pathname)
            .filter(Boolean)
          this.results = collected.filter((r) => {
            const path = r && (r.filePath || r.pathname)
            return path && liveRoots.some((root) => path === root || path.startsWith(root + '/'))
          })
          this.running = false
          activeCancel = null
          // eslint-disable-next-line no-console
          console.debug(`[SearchStore][runSearch][BLOCK_RESULT] count=${this.results.length} canceled=${canceled}`)
        })
        .catch((err) => {
          canceled = true
          if (promises.cancel) promises.cancel()
          log.error('Error while searching in directory:', err)
          // eslint-disable-next-line no-console
          console.debug(`[SearchStore][runSearch][BLOCK_ERROR] err=${err && err.message}`)
          this.results = []
          this.running = false
          activeCancel = null
        })
      if (promises.cancel) activeCancel = promises.cancel
    }
  }
})
