// FILE: site/shared/theme-init.mjs
// VERSION: 1.1.0
// START_MODULE_CONTRACT
//   PURPOSE: Node-side export of the shared no-flash theme script so the
//            gallery build and the VitePress head config inline the exact
//            same bytes as site/shared/theme-init.js (one source, no drift).
//   SCOPE: THEME_INIT_JS — the trimmed contents of theme-init.js.
//   DEPENDS: node:fs (read-only, at import time)
//   LINKS: site/shared/theme-init.js (the source of truth);
//          site/scripts/build-gallery.mjs; site/.vitepress/config.mts;
//          tests/site/brand.test.mjs
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   THEME_INIT_JS - the theme-init.js IIFE (header comment stripped) to inline before any CSS
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: [v1.1.0 - 2026-10-18 C-64 T-001: resolve theme-init.js
//                 against both module locations — this file is also bundled
//                 by esbuild into a temp config next to site/.vitepress/,
//                 where './theme-init.js' no longer sits beside the module.]
//   PREV: [v1.0.0 - 2026-10-18 C-64 T-001: first version.]
// END_CHANGE_SUMMARY

import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// Unbundled (vitest, plain node) this module lives in site/shared/ and the
// script sits next to it. VitePress loads its config through esbuild into a
// temp .mjs placed in site/.vitepress/, which flattens this module into a
// different directory — hence the second candidate one level up.
const SOURCE = [
  new URL('./theme-init.js', import.meta.url),
  new URL('../shared/theme-init.js', import.meta.url)
].find((url) => existsSync(fileURLToPath(url)))

// Only the IIFE is inlined: the file's GRACE header stays out of every page.
const source = readFileSync(new URL('./theme-init.js', import.meta.url), 'utf8')
export const THEME_INIT_JS = source.slice(source.indexOf('(function')).trim()
