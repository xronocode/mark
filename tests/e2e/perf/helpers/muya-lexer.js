// FILE: tests/e2e/perf/helpers/muya-lexer.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Node-side access to the REAL muya marked Lexer for progressive-mount.spec.ts's fixture block counts — Playwright compiles specs per-file (no bundling), so the muya ESM sources cannot be imported directly; this helper bundles lexer.js in-process with the repo's own esbuild (a vite dependency) and evaluates it once with minimal Node globals.
//   SCOPE: Test-side Node computation only. Returns the real Lexer class (muya's own block segmentation — no reimplementation); top-level blocks = non-space top-level tokens, proven equal to muya's contentState.blocks on the Stage 0 evidence shapes (mixed-100k 367, size-1mb 3706) and re-proven against the app's legacy mount in every suite run.
//   DEPENDS: esbuild (repo node_modules, vite's dependency), muya's parser/marked sources (read-only), Node globals shim (window/navigator/document stand-ins — muya's config module reads window.navigator at module scope).
//   LINKS: tests/e2e/perf/progressive-mount.spec.ts (nodeTopLevelBlocks); src/muya/lib/parser/marked/lexer.js; .grace/changes/active/C-LARGE-DOC-WAVE-A plan T-006.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   HERE - this helper's directory (for repo-relative muya source resolution).
//   LEXER_ENTRY - repository path of muya's lexer.js (the real block segmentation source).
//   installNodeGlobals - one-time window/navigator/document stand-ins so the bundled muya config module's module-scope browser reads initialize under Node.
//   cachedLexer - one-shot cache of the bundled Lexer class (bundling is esbuild-sync; never repeat it per fixture).
//   muyaLexer - lazily bundles the real muya Lexer with esbuild (IIFE, in-memory, evaluated once) and returns the class.
//   nodeTopLevelBlocks - top-level markdown block count of a fixture text computed in Node through the real Lexer (non-space top-level tokens).
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - 2026-11-02 C-LARGE-DOC-WAVE-A T-006: initial
//   in-process muya Lexer access for the Node-computed block-count oracle.
// END_CHANGE_SUMMARY

import { buildSync } from 'esbuild'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const LEXER_ENTRY = path.resolve(HERE, '../../../../src/muya/lib/parser/marked/lexer.js')

function installNodeGlobals () {
  if (typeof globalThis.window === 'undefined') globalThis.window = globalThis
  if (typeof globalThis.navigator === 'undefined') {
    globalThis.navigator = { platform: 'MacIntel', userAgent: 'node' }
  }
  if (typeof globalThis.document === 'undefined') {
    globalThis.document = { createElement: () => ({ style: {} }), querySelector: () => null }
  }
}

let cachedLexer = null
function muyaLexer () {
  if (cachedLexer) return cachedLexer
  installNodeGlobals()
  const result = buildSync({
    entryPoints: [LEXER_ENTRY],
    bundle: true,
    format: 'iife',
    platform: 'node',
    write: false,
    globalName: '__MUYA_LEXER__',
    logLevel: 'silent'
  })
  const run = new Function(`${result.outputFiles[0].text}\nreturn __MUYA_LEXER__`)
  const bundleExports = run()
  const Lexer = bundleExports.Lexer || bundleExports.default
  if (typeof Lexer !== 'function') {
    throw new Error('muya lexer bundle did not export a Lexer class')
  }
  cachedLexer = Lexer
  return Lexer
}

function nodeTopLevelBlocks (text) {
  const Lexer = muyaLexer()
  const tokens = new Lexer().lex(text)
  return tokens.filter((t) => t.type !== 'space').length
}

export { muyaLexer, nodeTopLevelBlocks }
