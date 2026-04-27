// step-8i: ripgrep spawn + parsing relocated to src/main/search/.
// This file is now a thin IPC client preserving the original API
// surface (search() returns a thenable with .cancel()) so callers
// (commands/quickOpen, store/search) need no changes.
//
// Per-search lifecycle: a unique searchId is generated, attached to
// each event, and used for cancellation. The renderer subscribes to
// `mt::search-event` once per search and dispatches based on searchId.
//
// Original copyright header (preserved at the relocated source under
// src/main/search/index.js):
//   Modified version of https://github.com/atom/atom/blob/master/src/ripgrep-directory-searcher.js
//   Copyright (c) 2011-2019 GitHub Inc.

let searchSeq = 0
const generateSearchId = () => {
  searchSeq = (searchSeq + 1) >>> 0
  return `r-${Date.now().toString(36)}-${searchSeq}`
}

class RipgrepDirectorySearcher {
  search(directories, pattern, options) {
    return this._spawn('content', directories, pattern, options)
  }

  _spawn(mode, directories, pattern, options) {
    const searchId = generateSearchId()
    const didMatch = (options && options.didMatch) || (() => {})
    const didSearchPaths = (options && options.didSearchPaths) || (() => {})

    let resolveOuter
    let rejectOuter
    const outerPromise = new Promise((resolve, reject) => {
      resolveOuter = resolve
      rejectOuter = reject
    })

    let unsubscribe = null
    let settled = false
    const settle = (kind, value) => {
      if (settled) return
      settled = true
      if (typeof unsubscribe === 'function') {
        try { unsubscribe() } catch {}
      }
      if (kind === 'resolve') resolveOuter(value)
      else rejectOuter(value)
    }

    const handler = (_event, msg) => {
      if (!msg || msg.searchId !== searchId) return
      switch (msg.type) {
        case 'match':
          try { didMatch(msg.payload) } catch (err) { console.warn('search didMatch threw:', err) }
          break
        case 'searchedPaths':
          try { didSearchPaths(msg.payload) } catch {}
          break
        case 'error':
          settle('reject', new Error(msg.payload && msg.payload.message ? msg.payload.message : 'search error'))
          break
        case 'complete':
          settle('resolve')
          break
      }
    }

    // Subscribe before dispatching the spawn so we never miss the
    // 'complete' event for an empty result set.
    const off = window.electron.ipcRenderer.on('mt::search-event', handler)
    unsubscribe = typeof off === 'function' ? off : () => {
      window.electron.ipcRenderer.removeListener('mt::search-event', handler)
    }

    // step-8z follow-up (v1.2.3): JSON round-trip the entire payload.
    // Under contextIsolation:true, Vue reactive proxies (e.g. Pinia
    // `preferencesStore.searchExclusions`) and contextBridge-wrapped
    // frozen arrays (e.g. `window.fileUtils.MARKDOWN_INCLUSIONS`) can
    // both fail structuredClone when passed to ipcRenderer.invoke,
    // surfacing as `Error: An object could not be cloned.`. JSON
    // serialization flattens to plain primitives — safe for our
    // search options which are all strings/numbers/booleans/arrays.
    const payload = JSON.parse(JSON.stringify({
      mode,
      searchId,
      directories,
      pattern,
      options: this._serializeOptions(options)
    }))
    window.electron.ipcRenderer
      .invoke('mt::search-spawn', payload)
      .catch((err) => settle('reject', err))

    outerPromise.cancel = () => {
      window.electron.ipcRenderer.send('mt::search-cancel', { searchId })
      settle('resolve')
    }
    return outerPromise
  }

  // Strip non-serializable fields (callbacks) before crossing the IPC
  // boundary. Main only needs the boolean / numeric / string options.
  _serializeOptions(options) {
    if (!options) return {}
    const out = {}
    for (const k of [
      'isRegexp', 'isCaseSensitive', 'isWholeWord', 'followSymlinks',
      'maxFileSize', 'includeHidden', 'noIgnore',
      'leadingContextLineCount', 'trailingContextLineCount',
      'inclusions', 'exclusions'
    ]) {
      if (options[k] !== undefined) out[k] = options[k]
    }
    return out
  }
}

export default RipgrepDirectorySearcher
