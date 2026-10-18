// FILE: site/scripts/shots.mjs
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Browser matrix for the built site (C-64 R-11): every key page at
//            320/390/1440 and 844x390 landscape, light and dark, with
//            screenshots and hard checks — no horizontal page scroll, the
//            consent card never intersects the hero, iOS gets the Mac bar
//            path, zero page errors and zero CSP violations.
//   SCOPE: serve site/.vitepress/dist (clean URLs) or a remote --url, drive
//          Playwright chromium, write PNGs + a JSON report, exit 1 on any
//          failed check.
//   DEPENDS: playwright (repo root node_modules), node:http
//   LINKS: M-053 SiteBuild; V-M-053; C-64 T-004/T-005
//   ROLE: SCRIPT
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   arg - read a --flag value from argv
//   DIST - built site directory
//   OUT - screenshot/report directory
//   PAGES - paths checked in every viewport
//   IOS_UA - iPhone Safari user agent for the iOS viewports
//   TYPES - extension -> content type for the static server
//   remote - --url target instead of the local dist
//   server - local static server (null for --url)
//   base - origin under test
//   browser - chromium instance
//   results - per-shot outcome list (also written to report.json)
//   bad - shots with problems
//   home390 - landing at 390 light, for the screen-count readout
//   VIEWPORTS - name, size, mobile/iOS flags
//   serveDist - static server over dist with clean-URL fallback
//   checkPage - open one page in one viewport/theme, screenshot, return problems
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: [v1.0.0 - 2026-10-18 C-64 T-004: first version.]
// END_CHANGE_SUMMARY
//
// Usage: node site/scripts/shots.mjs [--url https://mark.xronocode.com] [--out dir]

import { createServer } from 'node:http'
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const arg = (k) => { const i = process.argv.indexOf(k); return i > -1 ? process.argv[i + 1] : null }
const DIST = fileURLToPath(new URL('../.vitepress/dist', import.meta.url))
const OUT = arg('--out') || fileURLToPath(new URL('../../screenshots/site-matrix', import.meta.url))
const PAGES = ['/', '/guide/', '/guide/editions', '/diagrams/']
const IOS_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
const VIEWPORTS = [
  { name: '320', width: 320, height: 568, mobile: true, ios: true },
  { name: '390', width: 390, height: 844, mobile: true, ios: true },
  { name: 'land', width: 844, height: 390, mobile: true, ios: true },
  { name: '1440', width: 1440, height: 900, mobile: false, ios: false }
]
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.json': 'application/json', '.txt': 'text/plain', '.xml': 'application/xml' }

function serveDist () {
  // START_BLOCK_SERVE
  const server = createServer((req, res) => {
    let p = decodeURIComponent((req.url || '/').split('?')[0])
    let f = join(DIST, p)
    if (existsSync(f) && statSync(f).isDirectory()) f = join(f, 'index.html')
    else if (!existsSync(f) && existsSync(f + '.html')) f += '.html'
    if (!existsSync(f)) { res.statusCode = 404; res.end('404'); return }
    res.setHeader('Content-Type', TYPES[extname(f)] || 'application/octet-stream')
    res.end(readFileSync(f))
  })
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)))
  // END_BLOCK_SERVE
}

async function checkPage (browser, base, path, vp, dark) {
  // START_BLOCK_CHECK_PAGE
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 2,
    isMobile: vp.mobile, hasTouch: vp.mobile, colorScheme: dark ? 'dark' : 'light',
    ...(vp.ios ? { userAgent: IOS_UA } : {})
  })
  const page = await ctx.newPage()
  const problems = []
  page.on('pageerror', (e) => problems.push('pageerror: ' + e.message))
  page.on('console', (m) => { if (/Content Security Policy|Refused to/.test(m.text())) problems.push('csp: ' + m.text().slice(0, 140)) })
  await page.route(/googletagmanager|google-analytics|cloudflareinsights|api\.github\.com/, (r) => r.abort())
  // Inside the consent gate so the card is eligible to show.
  await page.route(/avenex\.xronocode\.com\/api\/geo/, (r) => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '{"consent":true}' }))
  await page.goto(base + path, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1200)
  const r = await page.evaluate(() => {
    const de = document.documentElement
    const vis = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); const s = getComputedStyle(el); return s.display !== 'none' && s.visibility !== 'hidden' && b.width > 0 && b.height > 0 ? b : null }
    const card = vis(document.querySelector('.xcc'))
    const hero = vis(document.querySelector('[data-consent-after]'))
    const overlap = card && hero && card.top < hero.bottom && card.bottom > Math.max(0, hero.top)
    return { overflow: de.scrollWidth - innerWidth, theme: de.dataset.theme, ios: de.classList.contains('ios'), cardOverHero: !!overlap, cardShown: !!card, height: de.scrollHeight }
  })
  if (r.overflow > 0) problems.push(`horizontal overflow ${r.overflow}px`)
  if (r.cardOverHero) problems.push('consent card over the hero')
  if (r.theme !== (dark ? 'dark' : 'light')) problems.push(`theme ${r.theme} != ${dark ? 'dark' : 'light'}`)
  if (path === '/' && vp.ios && !r.ios) problems.push('iOS not detected on the landing')
  const name = `${path.replace(/\//g, '_').replace(/^_|_$/g, '') || 'home'}-${vp.name}-${dark ? 'dark' : 'light'}`
  await page.screenshot({ path: join(OUT, name + '.png') })
  if (path === '/' && vp.name === '390' && !dark) await page.screenshot({ path: join(OUT, name + '-full.png'), fullPage: true })
  await ctx.close()
  return { name, ...r, problems }
  // END_BLOCK_CHECK_PAGE
}

const remote = arg('--url')
mkdirSync(OUT, { recursive: true })
const server = remote ? null : await serveDist()
const base = remote ? remote.replace(/\/$/, '') : `http://127.0.0.1:${server.address().port}`
const browser = await chromium.launch()
const results = []
for (const path of PAGES) for (const vp of VIEWPORTS) for (const dark of [false, true]) {
  results.push(await checkPage(browser, base, remote ? path : path, vp, dark))
}
await browser.close()
server && server.close()
writeFileSync(join(OUT, 'report.json'), JSON.stringify(results, null, 2))
const bad = results.filter((x) => x.problems.length)
const home390 = results.find((x) => x.name === 'home-390-light')
console.log(`[SiteBuild][shots][BLOCK_MATRIX] ${bad.length ? 'FAIL' : 'OK'} shots=${results.length} out=${OUT} home390screens=${home390 ? (home390.height / 844).toFixed(1) : '?'}`)
for (const b of bad) console.log(`  - ${b.name}: ${b.problems.join('; ')}`)
process.exit(bad.length ? 1 : 0)
