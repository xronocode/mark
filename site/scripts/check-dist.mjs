#!/usr/bin/env node
// FILE: site/scripts/check-dist.mjs
// VERSION: 1.1.0
// START_MODULE_CONTRACT
//   PURPOSE: Gate the built site before deploy — every internal link/asset in
//            every dist HTML page must resolve to a file in dist, and the
//            built /diagrams/ gallery must be complete and self-contained.
//   SCOPE: walk dist HTML; resolve href/src under the base (cleanUrls aware);
//          fail on misses, leftover %BASE%/<!--SITE_HEAD--> tokens, or missing
//          index.html/sitemap.xml/robots.txt; check the gallery page (one SVG
//          per example, no PeleError, size under 400 KB, no external
//          script/style hosts beyond the site's configured analytics).
//   DEPENDS: ../.vitepress/landing.mjs (resolveSiteSettings),
//            ../gallery/examples.mjs (the example count)
//   LINKS: M-053 SiteBuild; C-22; C-58 R-6; .github/workflows/site.yml
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
//   LAST_CHANGE: [v1.1.0 - 2026-10-18 C-58 T-004: new BLOCK_CHECK_GALLERY
//                 gate — dist/diagrams/index.html must exist, contain one
//                 <svg> per gallery example, no PeleError text, stay under
//                 400 KB, and load scripts/styles only from the site itself
//                 (plus the analytics hosts the env actually configures).]
//   PREV: [v1.0.0 - C-22: initial dist link/token checker]
// END_CHANGE_SUMMARY

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveSiteSettings } from '../.vitepress/landing.mjs'
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
    if (html.includes('%BASE%') || html.includes('<!--SITE_HEAD-->')) {
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

  if (problems.length) {
    console.error(`[SiteBuild][checkDist][BLOCK_CHECK_LINKS] FAIL problems=${problems.length}`)
    for (const p of problems) console.error('  - ' + p)
    process.exit(1)
  }
  console.log(`[SiteBuild][checkDist][BLOCK_CHECK_LINKS] OK pages=${pages.length} links=${checked} base=${base}`)
}

main()
