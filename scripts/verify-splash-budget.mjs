#!/usr/bin/env node
/**
 * MODULE_CONTRACT
 *   PURPOSE: Build-time guard for M-024 perf-splash size budget.
 *            Asserts the splash stylesheet (src/renderer/static/splash.css)
 *            is ≤4096 bytes minified-equivalent and the inline splash
 *            markup region in src/renderer/index.html (the
 *            <div id="splash-root">…</div> block plus inline <script>
 *            blocks) is ≤2048 bytes. Exits non-zero on overflow.
 *   SCOPE:   File-stat + textual region extraction. Does not run a real
 *            CSS minifier — instead applies a conservative whitespace
 *            and comment strip that overestimates the on-wire size,
 *            keeping the budget honest.
 *   DEPENDS: Node ≥18 fs/path stdlib only.
 *   LINKS:   docs/verification-plan.xml V-M-024.
 *
 * USAGE:    node scripts/verify-splash-budget.mjs
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const repoRoot = resolve(__dirname, '..')

const CSS_BUDGET = 4096 // bytes
const MARKUP_BUDGET = 2048 // bytes

const cssPath = resolve(repoRoot, 'src/renderer/static/splash.css')
const htmlPath = resolve(repoRoot, 'src/renderer/index.html')

const css = readFileSync(cssPath, 'utf8')
const html = readFileSync(htmlPath, 'utf8')

// Conservative minified-size estimator: strip /* ... */ comments,
// collapse runs of whitespace, drop spaces around `{};:,>+~`. This
// overestimates real terser/cssnano output, so a passing budget here
// implies a passing budget after the real bundler.
const minifyCss = (s) =>
  s
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s*([{}:;,>+~])\s*/g, '$1')
    .trim()

const cssMinified = minifyCss(css)
const cssBytes = Buffer.byteLength(cssMinified, 'utf8')

// Parity check: the inline <style id="splash-style">...</style> block in
// index.html must equal the minified canonical CSS. Vite bundles linked
// CSS into the main async chunk, so M-024 inlines the splash CSS for
// synchronous application; the file remains the source of truth.
const styleRe = /<style\s+id="splash-style"\s*>([\s\S]*?)<\/style>/
const styleMatch = html.match(styleRe)
if (!styleMatch) {
  console.error(
    '[verify-splash-budget] index.html: <style id="splash-style"> not found — splash CSS must be inlined for sync apply'
  )
  process.exit(1)
}
const inlineStyle = styleMatch[1].trim()
if (inlineStyle !== cssMinified) {
  console.error(
    '[verify-splash-budget] FAIL — inline <style> drifted from src/renderer/static/splash.css'
  )
  console.error(`  inline length=${inlineStyle.length}B  file-minified length=${cssBytes}B`)
  // Show first divergent byte to aid the human fix.
  const limit = Math.min(inlineStyle.length, cssMinified.length)
  for (let i = 0; i < limit; i++) {
    if (inlineStyle[i] !== cssMinified[i]) {
      const ctx = (s) => s.slice(Math.max(0, i - 20), Math.min(s.length, i + 20))
      console.error(`  first diff at offset ${i}:`)
      console.error(`    inline: ...${ctx(inlineStyle)}...`)
      console.error(`    file:   ...${ctx(cssMinified)}...`)
      break
    }
  }
  process.exit(1)
}

// Extract splash region from index.html: from the first <script> in
// <head> through the closing </script> just after #splash-root markup.
// We bound by the marker comment "M-024 perf-splash" plus the closing
// </body>-1 inline script. To avoid drift, just collect all inline
// <script>...</script> blocks plus the #splash-root <div> tree.

const inlineScripts = []
const scriptRe = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi
let m
while ((m = scriptRe.exec(html)) !== null) {
  const attrs = m[1] || ''
  const body = m[2] || ''
  if (/\bsrc\s*=/.test(attrs)) continue
  inlineScripts.push(`<script>${body}</script>`)
}

const splashDivMatch = html.match(/<div id="splash-root"[\s\S]*?<\/div>/)
if (!splashDivMatch) {
  console.error('[verify-splash-budget] index.html: #splash-root markup not found')
  process.exit(1)
}

const markup =
  splashDivMatch[0] + '\n' + inlineScripts.join('\n')
const markupBytes = Buffer.byteLength(markup, 'utf8')

let fail = false
console.log(
  `[verify-splash-budget] splash.css minified=${cssBytes}B / budget=${CSS_BUDGET}B`
)
if (cssBytes > CSS_BUDGET) {
  console.error(
    `[verify-splash-budget] FAIL — splash.css over budget by ${cssBytes - CSS_BUDGET}B`
  )
  fail = true
}

console.log(
  `[verify-splash-budget] splash markup+inline-scripts=${markupBytes}B / budget=${MARKUP_BUDGET}B`
)
if (markupBytes > MARKUP_BUDGET) {
  console.error(
    `[verify-splash-budget] FAIL — splash markup over budget by ${markupBytes - MARKUP_BUDGET}B`
  )
  fail = true
}

if (fail) process.exit(1)
console.log('[verify-splash-budget] OK')
process.exit(0)
