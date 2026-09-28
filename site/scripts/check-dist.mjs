#!/usr/bin/env node
// FILE: site/scripts/check-dist.mjs
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Gate the built site before deploy — every internal link/asset in
//            every dist HTML page must resolve to a file in dist.
//   SCOPE: walk dist HTML; resolve href/src under the base (cleanUrls aware);
//          fail on misses, leftover %BASE%/<!--SITE_HEAD--> tokens, or missing
//          index.html/sitemap.xml/robots.txt.
//   DEPENDS: ../.vitepress/landing.mjs (resolveSiteSettings)
//   LINKS: M-053 SiteBuild; C-22; .github/workflows/site.yml
//   ROLE: SCRIPT
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   dist - absolute path of the built site
//   base - site base path from resolveSiteSettings(process.env)
//   walk - recursive list of dist files
//   resolveTarget - URL path -> candidate dist file (dir index, .html, as-is)
//   main - run the checks, print [SiteBuild][checkDist] markers, exit 1 on failure
// END_MODULE_MAP

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveSiteSettings } from '../.vitepress/landing.mjs'

const dist = fileURLToPath(new URL('../.vitepress/dist/', import.meta.url))
const { base } = resolveSiteSettings(process.env)

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

  if (problems.length) {
    console.error(`[SiteBuild][checkDist][BLOCK_CHECK_LINKS] FAIL problems=${problems.length}`)
    for (const p of problems) console.error('  - ' + p)
    process.exit(1)
  }
  console.log(`[SiteBuild][checkDist][BLOCK_CHECK_LINKS] OK pages=${pages.length} links=${checked} base=${base}`)
}

main()
