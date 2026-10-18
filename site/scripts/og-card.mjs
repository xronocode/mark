#!/usr/bin/env node
// FILE: site/scripts/og-card.mjs
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Regenerate site/public/og-card.png — the 1200x630 Open Graph
//            card — by screenshotting site/og/card.html in headless
//            Chromium once its self-hosted fonts are ready.
//   SCOPE: open the card via a file URL at exactly 1200x630 (device pixel
//          ratio 1), await document.fonts.ready, screenshot to
//          site/public/og-card.png. Run from the repo root; the committed
//          PNG is the artifact, this script is the refresh path.
//   DEPENDS: playwright (or @playwright/test) from the repo root
//            node_modules — dev tooling only, no site dependency
//   LINKS: M-053 SiteBuild; C-64 T-003 R-8; site/og/card.html;
//          site/.vitepress/landing.mjs SITE_META.ogImage
//   ROLE: SCRIPT
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   chromium - headless browser handle from playwright / @playwright/test
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: [v1.0.0 - 2026-10-18 C-64 T-003: first version.]
// END_CHANGE_SUMMARY

import { fileURLToPath } from 'node:url'

const cardUrl = new URL('../og/card.html', import.meta.url)
const outPng = fileURLToPath(new URL('../public/og-card.png', import.meta.url))

let chromium
try {
  ({ chromium } = await import('playwright'))
} catch {
  ({ chromium } = await import('@playwright/test'))
}

const browser = await chromium.launch()
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 })
  await page.goto(cardUrl.href)
  await page.evaluate(() => document.fonts.ready)
  await page.screenshot({ path: outPng, clip: { x: 0, y: 0, width: 1200, height: 630 } })
  console.log(`[SiteBuild][ogCard][BLOCK_OG_CARD] og-card.png written path=${outPng}`)
} finally {
  await browser.close()
}
