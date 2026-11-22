// FILE: tests/renderer/_shims/install-window-globals.test.js
// VERSION: 1.2.0
// START_MODULE_CONTRACT
//   PURPOSE: C-52 gate pin — the boot shim must never STATICALLY import
//            the C-52 clipboard modules. The shim installs
//            window.electron at the END of its own body (after several
//            top-level awaits), so every static import evaluates BEFORE
//            the global exists; a static @/util/clipboardPath edge
//            pulled the shared renderer chunk — with import-time
//            window.electron.process readers such as @/util/index.js —
//            into the entry chunk, and the app crashed on every boot
//            (2026-10-17 gate round: every e2e red, «Cannot read
//            properties of undefined (reading 'process')»). The drop
//            handler must keep the dynamic import instead.
//            C-SEARCH-RESULT-CONTRACT: the shim-range-array-form family
//            behavior-tests the mt::search-event payload translation
//            through the extracted pure helper (the shim module itself
//            hosts top-level await plus webview/localeLoader
//            dependencies jsdom cannot provide) and pins the honest
//            array-pair range form.
//   SCOPE: source-level pins for the boot shim; behavior mapping tests
//            through the zero-import sibling helper
//            src/renderer/src/_shims/search-event-translation.js
//            (dynamically imported — no new static imports in the test
//            seam).
//   DEPENDS: vitest, node:fs, node:path, node:url.
//   LINKS: .grace/changes/archive/C-52 (gate fix);
//          .grace/verification/runtime.xml V-M-059, V-M-011;
//          src/renderer/src/_shims/install-window-globals.js
//          START_BLOCK_DROP_FOLDER_WORKSPACE;
//          src/renderer/src/_shims/search-event-translation.js
//          START_BLOCK_SEARCH_RANGE_TRANSLATION.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   SHIM_PATH - absolute path of _shims/install-window-globals.js.
//   MAIN_PATH - absolute path of main.js (pins the shim-first import).
//   TRANSLATION_HELPER_PATH - absolute path of the pure search-event translation helper.
//   loadTranslationHelper - dynamic importer returning the helper's translateSearchEvent.
//   SEARCH_STORE_PATH - absolute path of store/search.js (wire-truth scan).
//   QUICK_OPEN_PATH - absolute path of commands/quickOpen.js (wire-truth scan).
//   RIPGREP_SEARCHER_PATH - absolute path of node/ripgrepSearcher.js (wire-truth scan).
//   readSource - utf8 source reader for the scanned files.
//   STATIC_CLIPBOARD_IMPORT_RE - matches a STATIC import declaration of a C-52 clipboard module.
//   DYNAMIC_CLIPBOARD_IMPORT_RE - matches the drop handler's dynamic import('…clipboardPath').
//   STATIC_IMPORT_DECL_RE - matches any static import declaration (helper must have none).
//   FABRICATED_END_RE - matches the removed fabricated range end in the shim source.
//   SHIM_SEARCH_EVENT_BRANCH_RE - marks the shim's mt::search-event translation branch.
//   SHIM_SEARCHEDPATHS_RE - matches any searchedPaths handling in the shim (must not exist).
//   DID_SEARCH_PATHS_RE - matches a didSearchPaths option in the search surfaces (must not exist).
//   RIPGREP_SEARCHEDPATHS_CASE_RE - matches the dormant searchedPaths dispatch case (must stay present).
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: 1.2.0 - C-SEARCH-LIFECYCLE-DISCARD T-006: wire-truth pins — the shim's mt::search-event branch handles exactly match/complete/cancelled/error (no searchedPaths handling on the wire), the store and quickOpen pass no didSearchPaths option, and the dormant dispatch case in ripgrepSearcher.js stays present (documented dead-parallel, read-only). C-52 boot-order and C-SEARCH-RESULT-CONTRACT translation pins untouched.
//   PREVIOUS: 1.1.0 - C-SEARCH-RESULT-CONTRACT T-003: shim-range-array-form family — behavior-tests translateSearchEvent on a realistic mt::search-event feed (two paths, multi-match line, bounds-absent hit, terminal envelopes) proving honest array-pair ranges, the no-highlight zero pair for absent bounds, unchanged per-path grouping and searchId forwarding, the fabricated end gone from the shim source, and the helper carrying no static imports of its own.
//   PREVIOUS: 1.0.0 - 2026-10-17 C-52 gate fix: initial pin (would have failed before the fix — the shim had `import { openMarkdownFileTab } from '@/util/clipboardPath'` at module top level).
// END_CHANGE_SUMMARY

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, it, expect } from 'vitest'

const SHIM_PATH = resolve(__dirname, '../../../src/renderer/src/_shims/install-window-globals.js')
const MAIN_PATH = resolve(__dirname, '../../../src/renderer/src/main.js')
const TRANSLATION_HELPER_PATH = resolve(
  __dirname,
  '../../../src/renderer/src/_shims/search-event-translation.js'
)
const SEARCH_STORE_PATH = resolve(__dirname, '../../../src/renderer/src/store/search.js')
const QUICK_OPEN_PATH = resolve(__dirname, '../../../src/renderer/src/commands/quickOpen.js')
const RIPGREP_SEARCHER_PATH = resolve(__dirname, '../../../src/renderer/src/node/ripgrepSearcher.js')

const readSource = (p) => readFileSync(p, 'utf8')

// A static import DECLARATION whose specifier ends in clipboardPath or
// clipboardOpen (`import { x } from '…'` / `import '…'`). The [^();]*?
// guard keeps it from crossing into a dynamic import(…) call, and the
// line-start anchor keeps `= await import('…')` out (no whitespace
// between `import` and `(` there either).
const STATIC_CLIPBOARD_IMPORT_RE =
  /^[ \t]*import\s+(?:[^();]*?from\s+)?['"][^'"]*clipboard(Path|Open)['"]/m
// The dynamic form the drop handler must use for dropped Markdown.
const DYNAMIC_CLIPBOARD_IMPORT_RE = /import\(\s*['"][^'"]*clipboardPath['"]\s*\)/

// Wire-truth pins (C-SEARCH-LIFECYCLE-DISCARD T-006): the searchedPaths
// event never exists on the wire — the shim's mt::search-event
// translation branch handles exactly match/complete/cancelled/error.
const SHIM_SEARCH_EVENT_BRANCH_RE = /channel === 'mt::search-event'/
const SHIM_SEARCHEDPATHS_RE = /searchedPaths/
const DID_SEARCH_PATHS_RE = /didSearchPaths/
const RIPGREP_SEARCHEDPATHS_CASE_RE = /case 'searchedPaths':/

describe('_shims/install-window-globals boot-order pins (C-52 gate fix)', () => {
  it('never statically imports the C-52 clipboard modules (window.electron does not exist yet)', () => {
    expect(readSource(SHIM_PATH)).not.toMatch(STATIC_CLIPBOARD_IMPORT_RE)
  })

  it('the drop handler still opens dropped Markdown through the dynamic clipboardPath import', () => {
    expect(readSource(SHIM_PATH)).toMatch(DYNAMIC_CLIPBOARD_IMPORT_RE)
  })

  it('stays the FIRST import of main.js (every static import of it evaluates before window.electron readers)', () => {
    const firstImport = readSource(MAIN_PATH).match(/^[ \t]*import[^\n]*/m)
    expect(firstImport).not.toBeNull()
    expect(firstImport[0]).toContain('./_shims/install-window-globals')
  })
})

// ── C-SEARCH-RESULT-CONTRACT: shim range translation ────────────────
// The boot shim module cannot load under jsdom (top-level await plus
// webview/localeLoader dependencies), so the mapping behavior is tested
// through the extracted pure zero-import helper; the shim source is
// source-scanned for the delegation and the removed fabricated end.

// Matches any static import declaration — the translation helper must
// carry none (zero-dependency by contract).
const STATIC_IMPORT_DECL_RE = /^[ \t]*import\s[^;\n]*from\s|^[ \t]*import\s*['"]/
// The fabricated range end the contract removes (highlight running to
// the end of the line instead of stopping at the match).
const FABRICATED_END_RE = /\(h\.column \|\| 0\) \+ \(h\.snippet \? h\.snippet\.length : 0\)/

const loadTranslationHelper = async () => {
  const mod = await import(pathToFileURL(TRANSLATION_HELPER_PATH).href)
  return mod.translateSearchEvent
}

describe('shim-range-array-form (C-SEARCH-RESULT-CONTRACT mt::search-event translation)', () => {
  // Realistic feed: two paths, a multi-match line, a bounds-absent hit.
  const FEED = {
    searchId: 's-42',
    kind: 'match',
    seq: 1,
    hits: [
      {
        path: '/proj/a.md',
        line: 3,
        column: 7,
        snippet: 'alpha needle beta',
        truncated: false,
        matchStart: 6,
        matchEnd: 12
      },
      {
        path: '/proj/a.md',
        line: 3,
        column: 19,
        snippet: 'alpha needle beta needle more',
        truncated: false,
        matchStart: 18,
        matchEnd: 24
      },
      {
        path: '/proj/заметки.md',
        line: 1,
        column: 21,
        snippet: 'Привет мир иголка',
        truncated: false,
        matchStart: 11,
        matchEnd: 17
      },
      {
        path: '/proj/loose.md',
        line: 5,
        column: 1,
        snippet: 'bounds unavailable line',
        truncated: true
      }
    ]
  }

  const highlightOf = (lineText, range) =>
    lineText.substring(range[0][1], range[1][1])

  it('delivers every match as array pairs with honest bounds (highlight substring equals the matched text)', async () => {
    const translateSearchEvent = await loadTranslationHelper()
    const dispatches = translateSearchEvent(FEED)
    // Per-path grouping: a.md carries both same-line matches, the
    // multi-byte file its own envelope, the bounds-absent hit its own.
    expect(dispatches.length).toBe(3)
    const byPath = dispatches.map((d) => d.payload.filePath).sort()
    expect(byPath).toEqual(['/proj/a.md', '/proj/loose.md', '/proj/заметки.md'])

    const a = dispatches.find((d) => d.payload.filePath === '/proj/a.md')
    expect(a.searchId).toBe('s-42')
    expect(a.type).toBe('match')
    expect(a.payload.matches).toHaveLength(2)
    for (const m of a.payload.matches) {
      expect(Array.isArray(m.range)).toBe(true)
      expect(Array.isArray(m.range[0])).toBe(true)
      expect(Array.isArray(m.range[1])).toBe(true)
      expect(m.range[0][0]).toBe(2)
      expect(m.range[1][0]).toBe(2)
      expect(highlightOf(m.lineText, m.range)).toBe('needle')
    }

    // Multi-byte line: the delivered bounds are UTF-16 units over the
    // delivered snippet — "иголка" in "Привет мир иголка" spans 11..17
    // (a raw byte span would be 20..26: a known-false highlight).
    const ru = dispatches.find((d) => d.payload.filePath === '/proj/заметки.md')
    const ruMatch = ru.payload.matches[0]
    expect(ruMatch.range).toEqual([[0, 11], [0, 17]])
    expect(highlightOf(ruMatch.lineText, ruMatch.range)).toBe('иголка')
  })

  it('maps a bounds-absent hit to the no-highlight, line-start-cursor zero pair', async () => {
    const translateSearchEvent = await loadTranslationHelper()
    const dispatches = translateSearchEvent(FEED)
    const loose = dispatches.find((d) => d.payload.filePath === '/proj/loose.md')
    expect(loose).toBeDefined()
    const m = loose.payload.matches[0]
    expect(m.range).toEqual([[4, 0], [4, 0]])
    // No highlight: empty matched span; the cursor stays defined.
    expect(highlightOf(m.lineText, m.range)).toBe('')
    expect(Number.isFinite(m.range[0][1]) && Number.isFinite(m.range[1][1])).toBe(true)
  })

  it('treats a half-present bounds shape as absent (zero pair)', async () => {
    const translateSearchEvent = await loadTranslationHelper()
    const dispatches = translateSearchEvent({
      searchId: 's-half',
      kind: 'match',
      seq: 2,
      hits: [
        { path: '/proj/half.md', line: 2, column: 1, snippet: 'text', matchStart: 0 }
      ]
    })
    const m = dispatches[0].payload.matches[0]
    expect(m.range).toEqual([[1, 0], [1, 0]])
  })

  it('keeps per-path grouping and searchId forwarding and the terminal envelope shapes unchanged', async () => {
    const translateSearchEvent = await loadTranslationHelper()
    // Complete forwards the additive partial flag only on terminals.
    expect(translateSearchEvent({ searchId: 's-c', kind: 'complete', seq: 3, partial: true }))
      .toEqual([{ searchId: 's-c', type: 'complete', partial: true }])
    // Cancelled maps to the complete terminal type.
    expect(translateSearchEvent({ searchId: 's-x', kind: 'cancelled', seq: 4, partial: false }))
      .toEqual([{ searchId: 's-x', type: 'complete', partial: false }])
    // Error keeps the message payload shape.
    expect(translateSearchEvent({ searchId: 's-e', kind: 'error', seq: 5, error: 'rg exited with code 2', partial: true }))
      .toEqual([{ searchId: 's-e', type: 'error', payload: { message: 'rg exited with code 2' }, partial: true }])
    // A match envelope without hits dispatches nothing (funnel shape).
    expect(translateSearchEvent({ searchId: 's-0', kind: 'match', seq: 6, hits: [] })).toEqual([])
  })

  it('delegates the shim listener branch to the helper and the fabricated end no longer exists in the shim source', () => {
    const shim = readSource(SHIM_PATH)
    expect(shim).toContain('translateSearchEvent(m)')
    expect(shim).not.toMatch(FABRICATED_END_RE)
  })

  it('the translation helper carries no static imports of its own', () => {
    const helper = readSource(TRANSLATION_HELPER_PATH)
    expect(helper).not.toMatch(STATIC_IMPORT_DECL_RE)
    expect(helper).toContain('START_BLOCK_SEARCH_RANGE_TRANSLATION')
    expect(helper).toContain('END_BLOCK_SEARCH_RANGE_TRANSLATION')
  })
})

// C-SEARCH-LIFECYCLE-DISCARD T-006: wire-truth pins. The searchedPaths
// event never exists on the wire (the backend SearchEvent kinds are
// exactly match/complete/cancelled/error), so the shim's
// mt::search-event translation branch handles exactly those kinds, and
// the search surfaces pass no didSearchPaths option. The dormant
// dispatch case in ripgrepSearcher.js stays present as documented
// dead-parallel (read-only, pinned present — not absent).
describe('search wire truth (C-SEARCH-LIFECYCLE-DISCARD)', () => {
  it('the shim mt::search-event branch handles exactly match/complete/cancelled/error — no searchedPaths handling', () => {
    const shim = readSource(SHIM_PATH)
    // The scanned region is really the mt::search-event translation branch.
    expect(shim).toMatch(SHIM_SEARCH_EVENT_BRANCH_RE)
    expect(shim).not.toMatch(SHIM_SEARCHEDPATHS_RE)
  })

  it('store/search.js passes no didSearchPaths option', () => {
    expect(readSource(SEARCH_STORE_PATH)).not.toMatch(DID_SEARCH_PATHS_RE)
  })

  it('commands/quickOpen.js passes no didSearchPaths option', () => {
    expect(readSource(QUICK_OPEN_PATH)).not.toMatch(DID_SEARCH_PATHS_RE)
  })

  it('the dormant searchedPaths dispatch case in ripgrepSearcher.js stays present (documented dead-parallel)', () => {
    expect(readSource(RIPGREP_SEARCHER_PATH)).toMatch(RIPGREP_SEARCHEDPATHS_CASE_RE)
  })
})
