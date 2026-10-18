// FILE: site/scripts/csp.mjs
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Content-Security-Policy for every built page — GitHub Pages
//            cannot send headers (C-64 D-1), so the policy travels as the
//            first <meta> of <head>, pinning every inline script by its
//            exact-content sha256 hash instead of 'unsafe-inline'.
//   SCOPE: collect the inline <script> texts of an HTML document (skipping
//          external scripts and application/ld+json), hash them, build the
//          provider-aware policy (GA4 / Cloudflare beacon / Umami hosts
//          only when configured), inject/replace the meta, and re-verify a
//          built page against its own policy. No frame-ancestors (a meta
//          CSP cannot carry it).
//   DEPENDS: node:crypto (sha256), node:fs + node:path (applyCsp walk)
//   LINKS: M-053 SiteBuild; C-64 T-003 R-9/D-1;
//          site/.vitepress/config.mts buildEnd (applyCsp call site);
//          site/scripts/check-dist.mjs (verifyCsp gate)
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   collectInlineScripts - html -> [{ text, hash }] for every hashable inline script
//   cspFor - html + { analytics } -> policy string (provider hosts toggle with config)
//   injectCsp - html + opts -> html with the CSP meta as the first child of <head> (idempotent)
//   verifyCsp - html -> hashes of inline scripts missing from the page's own CSP meta
//   applyCsp - outDir + opts -> rewrite every built .html in place, { files, hashes }
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: [v1.0.0 - 2026-10-18 C-64 T-003: first version.]
// END_CHANGE_SUMMARY

import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const INLINE_SCRIPT_RE = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi
const CSP_META_RE = /[ \t]*<meta\s+http-equiv=["']?Content-Security-Policy["']?[^>]*>/gi
const GEO_HOST = 'https://avenex.xronocode.com'
const DEFAULT_UMAMI_SRC = 'https://cloud.umami.is/script.js'

// START_CONTRACT: collectInlineScripts
//   PURPOSE: Every inline script a meta CSP must pin: no src attribute and
//            not application/ld+json (JSON data, never executed).
//   INPUTS: { html: string }
//   OUTPUTS: { Array<{ text: string, hash: string }> - exact text between
//              the tags and its base64 sha256 digest, document order }
//   SIDE_EFFECTS: none
// END_CONTRACT: collectInlineScripts
// START_BLOCK_COLLECT_INLINE
export function collectInlineScripts (html) {
  const scripts = []
  for (const [, attrs, text] of html.matchAll(INLINE_SCRIPT_RE)) {
    if (/\ssrc\s*=/i.test(attrs)) continue
    if (/type\s*=\s*["']?application\/ld\+json/i.test(attrs)) continue
    scripts.push({ text, hash: createHash('sha256').update(text, 'utf8').digest('base64') })
  }
  return scripts
}
// END_BLOCK_COLLECT_INLINE

// START_CONTRACT: cspFor
//   PURPOSE: Build the page policy: default 'self'; script-src 'self' plus
//            a sha256 per inline script plus the analytics loader hosts
//            (GA4 tag manager, Cloudflare beacon CDN, Umami) only when
//            those providers are configured; styles inline (VitePress and
//            the pages carry inline styles); GA image/connect hosts; the
//            consent geo endpoint in connect-src.
//   INPUTS: { html: string, opts: { analytics?: resolveSiteSettings().analytics } }
//   OUTPUTS: { string - the CSP directive list }
//   SIDE_EFFECTS: none
// END_CONTRACT: cspFor
// START_BLOCK_CSP_FOR
export function cspFor (html, { analytics = [] } = {}) {
  const ga = analytics.some((a) => a.provider === 'ga4')
  const cf = analytics.some((a) => a.provider === 'cloudflare')
  const umamiHosts = analytics
    .filter((a) => a.provider === 'umami')
    .map((a) => new URL(a.src || DEFAULT_UMAMI_SRC).host)

  const scriptSrc = ["'self'", ...collectInlineScripts(html).map((s) => `'sha256-${s.hash}'`)]
  if (ga) scriptSrc.push('https://www.googletagmanager.com')
  if (cf) scriptSrc.push('https://static.cloudflareinsights.com')
  scriptSrc.push(...umamiHosts)

  const imgSrc = ["'self'", 'data:']
  if (ga) imgSrc.push('https://www.googletagmanager.com', 'https://*.google-analytics.com')

  // The landing refreshes the release tag from the GitHub API (non-blocking).
  const connectSrc = ["'self'", GEO_HOST, 'https://api.github.com']
  if (ga) connectSrc.push('https://*.google-analytics.com', 'https://*.analytics.google.com', 'https://*.googletagmanager.com')
  if (cf) connectSrc.push('https://cloudflareinsights.com')
  connectSrc.push(...umamiHosts)

  return [
    "default-src 'self'",
    `script-src ${scriptSrc.join(' ')}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src ${imgSrc.join(' ')}`,
    "font-src 'self'",
    `connect-src ${connectSrc.join(' ')}`,
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    'upgrade-insecure-requests'
  ].join('; ')
}
// END_BLOCK_CSP_FOR

function escapeAttr (value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

// START_CONTRACT: injectCsp
//   PURPOSE: Put the policy on the page as <meta http-equiv="Content-
//            Security-Policy"> directly after the <head> open tag (before
//            any script), replacing any CSP meta already there.
//   INPUTS: { html: string, opts: passed through to cspFor }
//   OUTPUTS: { string - html with exactly one CSP meta, first in <head> }
//   SIDE_EFFECTS: none (pure; applyCsp writes)
// END_CONTRACT: injectCsp
// START_BLOCK_INJECT_CSP
export function injectCsp (html, opts = {}) {
  const meta = `<meta http-equiv="Content-Security-Policy" content="${escapeAttr(cspFor(html, opts))}">`
  const stripped = html.replace(CSP_META_RE, '')
  const headOpen = /<head\b[^>]*>/i.exec(stripped)
  if (!headOpen) return meta + stripped
  const at = headOpen.index + headOpen[0].length
  return stripped.slice(0, at) + meta + stripped.slice(at)
}
// END_BLOCK_INJECT_CSP

// START_CONTRACT: verifyCsp
//   PURPOSE: Post-build truth check — every hashable inline script's hash
//            must appear in the page's own CSP meta (corner-6: an edited
//            inline script without a rebuilt CSP fails here).
//   INPUTS: { html: string - the built page }
//   OUTPUTS: { string[] - 'sha256-…' hashes missing from the meta; [] = pass }
//   SIDE_EFFECTS: none
// END_CONTRACT: verifyCsp
export function verifyCsp (html) {
  const meta = /<meta\s+http-equiv=["']?Content-Security-Policy["']?[^>]*>/i.exec(html)?.[0] || ''
  // The injected meta is double-quoted; the policy itself carries only the
  // CSP's own single quotes ('self', 'sha256-…'), so capture to the closing ".
  const policy = /content="([^"]*)"/i.exec(meta)?.[1] || ''
  return collectInlineScripts(html)
    .filter((s) => !policy.includes(`'sha256-${s.hash}'`))
    .map((s) => `sha256-${s.hash}`)
}

function htmlFiles (dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    return statSync(p).isDirectory() ? htmlFiles(p) : (p.endsWith('.html') ? [p] : [])
  })
}

// START_CONTRACT: applyCsp
//   PURPOSE: Rewrite every .html in the build output (landing, /diagrams/,
//            all VitePress pages, 404) with its own hashed policy.
//   INPUTS: { outDir: string - dist path, opts: { analytics } for cspFor }
//   OUTPUTS: { { files: number, hashes: number } - pages rewritten and
//              inline scripts pinned }
//   SIDE_EFFECTS: writes the .html files in place
// END_CONTRACT: applyCsp
// START_BLOCK_APPLY_CSP
export function applyCsp (outDir, opts = {}) {
  let files = 0
  let hashes = 0
  for (const file of htmlFiles(outDir)) {
    const html = readFileSync(file, 'utf8')
    hashes += collectInlineScripts(html).length
    const next = injectCsp(html, opts)
    if (next !== html) writeFileSync(file, next)
    files++
  }
  console.log(`[SiteBuild][applyCsp][BLOCK_CSP] files=${files} inlineScripts=${hashes}`)
  return { files, hashes }
}
// END_BLOCK_APPLY_CSP
