import Prism from 'prismjs'
import { filter } from 'fuzzaldrin'
import initLoadLanguage, { loadedLanguages, transformAliasToOrigin } from './loadLanguage'
import { languages } from 'prismjs/components.js'

// START_CHANGE_SUMMARY
//   - 2026-09-21: extend prism-r grammar with builtin + function rules —
//     stock grammar has no function token so R code rendered flat.
//     Pinned by tests/e2e/r-highlight.spec.ts.
// END_CHANGE_SUMMARY

const prism = Prism
window.Prism = Prism
/* eslint-disable */
import('prismjs/plugins/keep-markup/prism-keep-markup')
/* eslint-enable */
const langs = []

for (const name of Object.keys(languages)) {
  const lang = languages[name]
  langs.push({
    name,
    ...lang
  })
  if (lang.alias) {
    if (typeof lang.alias === 'string') {
      langs.push({
        name: lang.alias,
        ...lang
      })
    } else if (Array.isArray(lang.alias)) {
      langs.push(
        ...lang.alias.map((a) => ({
          name: a,
          ...lang
        }))
      )
    }
  }
}

const loadLanguage = initLoadLanguage(Prism)

// START_BLOCK_R_GRAMMAR_EXTENSION
// Stock prism-r ships no `function` token: R call sites (library(…),
// data.frame(…), ggplot(…)) render uncolored, which reads as flat/
// broken highlighting next to JS or Rust blocks. After the stock
// grammar loads, add a function-call rule (identifier followed by an
// opening paren) plus a small builtin set. Key order matters in Prism:
// inserted LAST so the stock `keyword` rule (which owns the reserved
// word `function`) still wins.
const R_BUILTINS = [
  'library', 'require', 'attach', 'detach', 'source', 'install.packages',
  'c', 'list', 'data.frame', 'tibble', 'matrix', 'vector', 'factor',
  'mean', 'median', 'sum', 'min', 'max', 'sd', 'var', 'length', 'nrow', 'ncol',
  'names', 'colnames', 'rownames', 'head', 'tail', 'str', 'summary', 'print',
  'cat', 'paste', 'paste0', 'sprintf', 'format',
  'ggplot', 'aes', 'geom_line', 'geom_point', 'geom_bar', 'ggtitle',
  'mutate', 'filter', 'select', 'group_by', 'summarise', 'summarize',
  'arrange', 'join', 'left_join', 'read.csv', 'read.table', 'write.csv'
].join('|')

const extendedGrammars = new WeakSet()
function extendRGrammar () {
  const r = Prism.languages.r
  if (!r || extendedGrammars.has(r)) return
  r.builtin = new RegExp(`\\b(?:${R_BUILTINS})\\b`)
  r.function = {
    // greedy:true is REQUIRED: a non-greedy rule whose match sits before
    // the current tokenization point (identifier + lookahead paren) is
    // deferred and silently dropped by prism-core (verified in isolation).
    pattern: /\b[A-Za-z._][\w.]*(?=\s*\()/,
    greedy: true
  }
  extendedGrammars.add(r)
}
// END_BLOCK_R_GRAMMAR_EXTENSION

const search = (text) => {
  return filter(langs, text, { key: 'name' })
}

// pre load latex and yaml and html for `math block` \ `front matter` and `html block`
loadLanguage('latex')
loadLanguage('yaml')

// Apply the R grammar extension once the language actually loads
// (prism components are async chunks; hooking loadLanguage's result).
const origLoad = loadLanguage
function loadLanguageWithExtensions (langsArg) {
  if (langsArg && (langsArg === 'r' || (Array.isArray(langsArg) && langsArg.includes('r')))) {
    if (loadedLanguages.has('r')) {
      extendRGrammar() // already loaded (e.g. re-render): extend synchronously
    }
    const p = origLoad(langsArg)
    Promise.resolve(p).then(() => extendRGrammar()).catch(() => {})
    return p
  }
  return origLoad(langsArg)
}

export { search, loadLanguageWithExtensions as loadLanguage, loadedLanguages, transformAliasToOrigin }

export default prism
