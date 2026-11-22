// FILE: src/renderer/src/_shims/search-event-translation.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Pure mt::search-event payload translation (C-SEARCH-RESULT-CONTRACT) — map one backend SearchEvent into the dispatch payloads the v1.2.3 window.electron.ipcRenderer.on consumers read: per-path grouped match envelopes carrying the single array-pair range form, and the honest complete/cancelled/error terminals with the additive partial flag.
//   SCOPE: Zero-dependency pure mapping — no imports, no window readers, no side effects; extracted from _shims/install-window-globals.js so jsdom can behavior-test the mapping without importing the top-level-await boot shim (the C-52 test contract). The boot shim statically imports ONLY this helper; its zero-import shape keeps the C-52 chunk-pull failure mode impossible.
//   DEPENDS: none (deliberate — pinned by tests/renderer/_shims/install-window-globals.test.js).
//   LINKS: M-011, M-004, C-SEARCH-RESULT-CONTRACT, tests/renderer/_shims/install-window-globals.test.js (shim-range-array-form).
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   translateSearchEvent - Translate one backend SearchEvent payload into the consumer dispatch payloads (returns an array; empty when nothing to dispatch).
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: 1.0.0 - C-SEARCH-RESULT-CONTRACT T-003: extracted the mt::search-event translation funnel from install-window-globals.js as a pure zero-import helper; match rows now carry the honest array-pair range [[row, start], [row, end]] built from the backend's matchStart/matchEnd UTF-16 bounds over the delivered snippet (absent or half-present bounds map to the no-highlight, line-start-cursor zero pair), and the fabricated column + snippet.length end is gone.
// END_CHANGE_SUMMARY

// START_BLOCK_SEARCH_RANGE_TRANSLATION
export function translateSearchEvent (m) {
  if (!m || typeof m !== 'object') return []
  const sid = m.searchId
  if (m.kind === 'match' && Array.isArray(m.hits) && m.hits.length) {
    const byPath = new Map()
    for (const h of m.hits) {
      if (!byPath.has(h.path)) byPath.set(h.path, [])
      const row = Math.max(0, (h.line || 1) - 1)
      // Honest-or-absent bounds: present matchStart/matchEnd (UTF-16
      // code units over the delivered snippet, computed by the backend)
      // become the single array-pair range form the component reads;
      // absent or half-present bounds map to the no-highlight,
      // line-start-cursor zero pair — never a fabricated span.
      const hasBounds =
        typeof h.matchStart === 'number' && typeof h.matchEnd === 'number'
      const start = hasBounds ? h.matchStart : 0
      const end = hasBounds ? h.matchEnd : 0
      byPath.get(h.path).push({
        matchText: h.snippet || '',
        lineText: h.snippet || '',
        range: [[row, start], [row, end]],
        leadingContextLines: [],
        trailingContextLines: []
      })
    }
    const dispatches = []
    for (const [filePath, matches] of byPath) {
      dispatches.push({ searchId: sid, type: 'match', payload: { filePath, matches } })
    }
    return dispatches
  }
  // Terminal envelopes keep today's shapes exactly: cancelled still
  // surfaces as the complete terminal type, and the additive optional
  // partial flag is forwarded on terminals only.
  if (m.kind === 'complete') {
    return [{ searchId: sid, type: 'complete', partial: m.partial === true }]
  }
  if (m.kind === 'cancelled') {
    return [{ searchId: sid, type: 'complete', partial: m.partial === true }]
  }
  if (m.kind === 'error') {
    return [{ searchId: sid, type: 'error', payload: { message: m.error || 'search error' }, partial: m.partial === true }]
  }
  return []
}
// END_BLOCK_SEARCH_RANGE_TRANSLATION
