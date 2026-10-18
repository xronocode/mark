#!/usr/bin/env node
// FILE: site/scripts/check-dist.mjs
// VERSION: 1.4.0
// START_MODULE_CONTRACT
//   PURPOSE: Gate the built site before deploy — every internal link/asset in
//            every dist HTML page must resolve to a file in dist, and the
//            built /diagrams/ gallery must be complete and self-contained.
//   SCOPE: walk dist HTML; resolve href/src under the base (cleanUrls aware);
//          fail on misses, leftover %BASE%/<!--SITE_HEAD--> tokens, or missing
//          index.html/sitemap.xml/robots.txt; check the gallery page (one SVG
//          per example, no PeleError, size under 400 KB, no external
//          script/style hosts beyond the site's configured analytics); check
//          the SEO set (llms.txt sections, .well-known/security.txt contact +
//          expiry, landing apple-itunes-app / og-card / parseable JSON-LD
//          SoftwareApplication at the released version, track.js iff GA4);
//          check the CSP (every page has the meta, every inline script hash
//          present — scripts/csp.mjs verifyCsp).
//   DEPENDS: ../.vitepress/landing.mjs (resolveSiteSettings, appVersion),
//            ./csp.mjs (verifyCsp), ../gallery/examples.mjs (example count)
//   LINKS: M-053 SiteBuild; C-22; C-58 R-6; C-64 T-003 R-8/R-9;
//          .github/workflows/site.yml
//   ROLE: SCRIPT
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   dist - absolute path of the built site
//   base - site base path from resolveSiteSettings(process.env)
//   walk - recursive list of dist files
//   resolveTarget - URL path -> candidate dist file (dir index, .html, as-is)
//   analytics - analytics settings from resolveSiteSettings (provider ids)
//   GALLERY_MAX_BYTES - size budget of the built /diagrams/ page (400 KB)
//   analyticsHosts - external script/style hosts the analytics config may emit
//   main - run the checks, print [SiteBuild][checkDist] markers, exit 1 on failure
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: [v1.4.0 - 2026-10-18 C-64 T-007: the track.js gate accepts the ?v= content-hash query]
//   PREV: [v1.3.0 - 2026-10-18 C-64 T-006: the llms.txt gate pins the
//                 canonical tap-free one-liner "brew install --cask
//                 xronocode/mark/mark" (F-1).]
//   PREV: [v1.2.0 - 2026-10-18 C-64 T-003: new BLOCK_CHECK_SEO and
//                 BLOCK_CHECK_CSP gates — llms.txt + security.txt exist with
//                 the required sections/lines, the landing head carries
//                 apple-itunes-app, og-card.png and a parseable JSON-LD
//                 SoftwareApplication whose softwareVersion equals the root
//                 package.json, track.js appears exactly when GA4 is
//                 configured, and every built page has a CSP meta covering
//                 every inline script hash.]
//   PREV: [v1.1.0 - 2026-10-18 C-58 T-004: new BLOCK_CHECK_GALLERY
//                 gate — dist/diagrams/index.html must exist, contain one
//                 <svg> per gallery example, no PeleError text, stay under
//                 400 KB, and load scripts/styles only from the site itself
//                 (plus the analytics hosts the env actually configures).]
//   PREV: [v1.0.0 - C-22: initial dist link/token checker]
// END_CHANGE_SUMMARY

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { appVersion, resolveSiteSettings } from '../.vitepress/landing.mjs'
import { verifyCsp } from './csp.mjs'
import { EXAMPLES } from '../gallery/examples.mjs'

const dist = fileURLToPath(new URL('../.vitepress/dist/', import.meta.url))
const { base, analytics } = resolveSiteSettings(process.env)

const GALLERY_MAX_BYTES = 400 * 1024

function walk (dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    return statSync(p).isDirectory() ? walk(p) : [p]
  })
}

function resolveTarget (urlPath) {
  const rel = decodeURIComponent(urlPath.slice(base.length))
  const candidates = rel === '' || rel.endsWith('/')
    ? [join(dist, rel, 'index.html')]
    : [join(dist, rel), join(dist, rel + '.html')]
  return candidates.some((c) => existsSync(c) && statSync(c).isFile())
}

// The only external script/style hosts a page may reference: the hosts the
// configured analytics providers actually load from (GA4 loads through the
// local consent.js; Cloudflare and Umami load from their CDNs).
function analyticsHosts () {
  const hosts = new Set()
  for (const a of analytics) {
    if (a.provider === 'cloudflare') hosts.add('static.cloudflareinsights.com')
    if (a.provider === 'umami') hosts.add(new URL(a.src || 'https://cloud.umami.is/script.js').host)
  }
  return hosts
}

function main () {
  // START_BLOCK_CHECK_REQUIRED
  const problems = []
  if (!existsSync(dist)) {
    console.error('[SiteBuild][checkDist][BLOCK_CHECK_REQUIRED] dist missing — run `npm run build` first')
    process.exit(1)
  }
  for (const f of ['index.html', 'sitemap.xml', 'robots.txt', '404.html']) {
    if (!existsSync(join(dist, f))) problems.push(`missing ${f}`)
  }
  // END_BLOCK_CHECK_REQUIRED

  // START_BLOCK_CHECK_LINKS
  const pages = walk(dist).filter((f) => f.endsWith('.html'))
  let checked = 0
  for (const page of pages) {
    const html = readFileSync(page, 'utf8')
    const where = relative(dist, page)
    if (html.includes('%BASE%') || html.includes('<!--SITE_HEAD-->') || /<!--(DIAGRAM:|THEME_INIT|BRAND_CSS|THEME_VARS_JSON)/.test(html)) {
      problems.push(`${where}: unrendered landing token`)
    }
    for (const [, url] of html.matchAll(/\s(?:href|src)="([^"#?]+)[^"]*"/g)) {
      if (!url.startsWith('/') || url.startsWith('//')) continue
      checked++
      if (!url.startsWith(base)) {
        problems.push(`${where}: ${url} is outside base ${base}`)
      } else if (!resolveTarget(url)) {
        problems.push(`${where}: ${url} does not resolve`)
      }
    }
  }
  // END_BLOCK_CHECK_LINKS

  // START_BLOCK_CHECK_GALLERY
  const galleryPage = join(dist, 'diagrams', 'index.html')
  const galleryProblems = []
  if (!existsSync(galleryPage)) {
    galleryProblems.push('missing diagrams/index.html (gallery not emitted)')
  } else {
    const html = readFileSync(galleryPage, 'utf8')
    // One diagram per card: count cards that carry a rendered SVG (some
    // types, e.g. architecture, nest icon <svg> elements inside theirs).
    const cards = html.split('<article').slice(1)
    const svgs = cards.filter((c) => /<svg[\s>]/.test(c)).length
    if (cards.length !== EXAMPLES.length || svgs !== EXAMPLES.length) {
      galleryProblems.push(`diagrams/index.html has ${svgs}/${cards.length} rendered cards, expected ${EXAMPLES.length} (one per example)`)
    }
    if (/PeleError/i.test(html)) {
      galleryProblems.push('diagrams/index.html contains a Pele error render')
    }
    const size = statSync(galleryPage).size
    if (size >= GALLERY_MAX_BYTES) {
      galleryProblems.push(`diagrams/index.html is ${Math.round(size / 1024)} KB (limit ${GALLERY_MAX_BYTES / 1024} KB)`)
    }
    const allowed = analyticsHosts()
    // Loads only: <script src> and <link> stylesheets/preloads. Canonical,
    // OG and apple-touch-icon links carry URLs without loading them.
    for (const [, host] of html.matchAll(/<script\b[^>]*?\ssrc="(?:https?:)?\/\/([^/"?#]+)/g)) {
      if (!allowed.has(host)) galleryProblems.push(`diagrams/index.html loads a script from external host ${host}`)
    }
    for (const [tag] of html.matchAll(/<link\b[^>]*>/g)) {
      if (!/rel="(?:stylesheet|preload|modulepreload|prefetch)"/.test(tag)) continue
      const host = /href="(?:https?:)?\/\/([^/"?#]+)/.exec(tag)?.[1]
      if (host && !allowed.has(host)) galleryProblems.push(`diagrams/index.html loads a stylesheet/asset from external host ${host}`)
    }
    if (galleryProblems.length) {
      console.error(`[SiteBuild][checkDist][BLOCK_CHECK_GALLERY] FAIL problems=${galleryProblems.length}`)
    } else {
      console.log(`[SiteBuild][checkDist][BLOCK_CHECK_GALLERY] OK svgs=${svgs} size=${Math.round(size / 1024)}KB externalHosts=${allowed.size}`)
    }
  }
  problems.push(...galleryProblems)
  // END_BLOCK_CHECK_GALLERY

  // START_BLOCK_CHECK_SEO
  const seoProblems = []
  const llmsPath = join(dist, 'llms.txt')
  if (!existsSync(llmsPath)) {
    seoProblems.push('missing llms.txt')
  } else {
    const llms = readFileSync(llmsPath, 'utf8')
    if (!llms.startsWith('# Mark')) seoProblems.push('llms.txt must start with "# Mark"')
    for (const section of ['## Install', '## Docs', '## Source']) {
      if (!llms.includes(section)) seoProblems.push(`llms.txt missing the "${section}" section`)
    }
    if (!llms.includes('brew install --cask xronocode/mark/mark')) seoProblems.push('llms.txt missing the Homebrew one-liner')
    if (/\]\((?!https:)/.test(llms)) seoProblems.push('llms.txt has non-absolute links')
  }
  const securityPath = join(dist, '.well-known', 'security.txt')
  if (!existsSync(securityPath)) {
    seoProblems.push('missing .well-known/security.txt')
  } else {
    const security = readFileSync(securityPath, 'utf8')
    if (!security.includes('Contact: https://github.com/xronocode/mark/security/advisories/new')) seoProblems.push('security.txt missing the Contact line')
    if (!security.includes('Canonical:')) seoProblems.push('security.txt missing the Canonical line')
    const expires = /Expires: (\S+)/.exec(security)?.[1]
    const expiresAt = expires ? Date.parse(expires) : NaN
    if (Number.isNaN(expiresAt)) seoProblems.push('security.txt missing a parseable Expires date')
    else if (expiresAt <= Date.now()) seoProblems.push('security.txt Expires is not in the future')
  }
  if (existsSync(join(dist, 'index.html'))) {
    const landingHtml = readFileSync(join(dist, 'index.html'), 'utf8')
    if (!landingHtml.includes('apple-itunes-app')) seoProblems.push('index.html missing apple-itunes-app')
    if (!/og:image" content="[^"]*\/og-card\.png(\?v=[0-9a-f]+)?"/.test(landingHtml)) seoProblems.push('index.html og:image must point at og-card.png')
    // The JSON-LD must parse and place SoftwareApplication at the released version.
    let graph = []
    let parseFailed = false
    try {
      graph = [...landingHtml.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
        .flatMap((m) => JSON.parse(m[1])['@graph'] || [])
    } catch (e) {
      parseFailed = true
      seoProblems.push(`index.html JSON-LD does not parse: ${e.message}`)
    }
    const app = graph.find((n) => n['@type'] === 'SoftwareApplication')
    if (!app) {
      if (!parseFailed) seoProblems.push('index.html JSON-LD has no SoftwareApplication node')
    } else if (app.softwareVersion !== appVersion()) {
      seoProblems.push(`index.html softwareVersion ${app.softwareVersion} != package.json ${appVersion()}`)
    }
    const hasGa4 = analytics.some((a) => a.provider === 'ga4')
    const hasTrack = /<script\b[^>]*\ssrc="[^"]*track\.js(\?v=[0-9a-f]+)?"/.test(landingHtml)
    if (hasGa4 !== hasTrack) seoProblems.push(hasTrack ? 'track.js present without GA4 configured' : 'track.js missing while GA4 is configured')
  } else {
    seoProblems.push('missing index.html')
  }
  if (seoProblems.length) {
    console.error(`[SiteBuild][checkDist][BLOCK_CHECK_SEO] FAIL problems=${seoProblems.length}`)
  } else {
    console.log('[SiteBuild][checkDist][BLOCK_CHECK_SEO] OK llms.txt security.txt head version=' + appVersion())
  }
  problems.push(...seoProblems)
  // END_BLOCK_CHECK_SEO

  // START_BLOCK_CHECK_CSP
  const cspProblems = []
  let cspPages = 0
  for (const page of pages) {
    const html = readFileSync(page, 'utf8')
    if (!/<meta\s+http-equiv=["']?Content-Security-Policy["']?/i.test(html)) {
      cspProblems.push(`${relative(dist, page)}: no CSP meta`)
      continue
    }
    for (const missing of verifyCsp(html)) {
      cspProblems.push(`${relative(dist, page)}: inline script ${missing} not pinned by the CSP meta`)
    }
    cspPages++
  }
  if (cspProblems.length) {
    console.error(`[SiteBuild][checkDist][BLOCK_CHECK_CSP] FAIL problems=${cspProblems.length}`)
  } else {
    console.log(`[SiteBuild][checkDist][BLOCK_CHECK_CSP] OK pages=${cspPages}/${pages.length}`)
  }
  problems.push(...cspProblems)
  // END_BLOCK_CHECK_CSP

  if (problems.length) {
    console.error(`[SiteBuild][checkDist][BLOCK_CHECK_LINKS] FAIL problems=${problems.length}`)
    for (const p of problems) console.error('  - ' + p)
    process.exit(1)
  }
  console.log(`[SiteBuild][checkDist][BLOCK_CHECK_LINKS] OK pages=${pages.length} links=${checked} base=${base}`)
}

main()
