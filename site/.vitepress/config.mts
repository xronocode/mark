// FILE: site/.vitepress/config.mts
// VERSION: 2.4.0
// START_MODULE_CONTRACT
//   PURPOSE: VitePress config for the Mark site — docs, shared head, the
//            landing served at the site root, and the diagram gallery at
//            /diagrams/ (both emitted at build time and served in dev).
//   SCOPE: nav/sidebar, base + sitemap from env, per-page canonical/OG,
//          dev middleware for the landing and /diagrams/, buildEnd emission
//          of landing + gallery (+ theme-vars refresh), robots.txt and CNAME.
//   DEPENDS: vitepress, ./landing.mjs, ../scripts/build-gallery.mjs,
//            ../scripts/gallery-theme-vars.mjs
//   LINKS: M-053 SiteBuild; C-22; C-58; .github/workflows/site.yml
//   ROLE: CONFIG
//   MAP_MODE: NONE
// END_MODULE_CONTRACT
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: [v2.4.0 - 2026-10-18 C-58 T-003: the docs nav links the
//                 /diagrams/ gallery (target _self — a full page load, not
//                 a VitePress route) and the sitemap lists diagrams/.]
//   PREV: [v2.3.0 - 2026-10-18 C-58 T-002: buildEnd also emits the
//                 diagram gallery at /diagrams/ (rendered from
//                 site/gallery/examples.mjs through pele with theme vars
//                 derived fresh from the app theme CSS) and refreshes the
//                 committed site/gallery/theme-vars.json; the dev middleware
//                 serves /diagrams/ the same way as the landing.]
//   PREV: [2026-10-15 - C-42: guide sidebar links the Editions page.]
//   PREV: [2026-10-12 - Readable documentation code-language labels.]
//   PREV: [v2.2.0 - docs head analytics from the shared analyticsTags list]
//   PREV: [v2.1.0 - GA4 analytics provider in the docs head]
//   PREV: [v2.0.0 - C-22: env-driven base/URL, landing via buildEnd + dev
//                 middleware (replaces CI cp), SEO head, sitemap, opt-in analytics]
// END_CHANGE_SUMMARY

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, type HeadConfig } from 'vitepress'
import {
  SITE_META,
  analyticsTags,
  cnameFor,
  renderLanding,
  resolveSiteSettings,
  robotsTxt
} from './landing.mjs'
import { renderGallery } from '../scripts/build-gallery.mjs'
import { writeThemeVarsFile } from '../scripts/gallery-theme-vars.mjs'

const settings = resolveSiteSettings(process.env)
const { siteUrl, base, analytics } = settings
const landingTemplate = new URL('../landing/index.html', import.meta.url)
const loadLanding = () => renderLanding(readFileSync(landingTemplate, 'utf8'), settings)

// START_BLOCK_DOCS_HEAD
const head: HeadConfig[] = [
  ['style', {}, '.vp-doc div[class*=language-] > span.lang{color:var(--vp-c-text-2)}'],
  ['link', { rel: 'icon', type: 'image/png', href: `${base}${SITE_META.favicon}` }],
  ['meta', { name: 'theme-color', content: '#07090c' }],
  ['meta', { property: 'og:type', content: 'website' }],
  ['meta', { property: 'og:site_name', content: SITE_META.name }],
  ['meta', { property: 'og:image', content: `${siteUrl}/${SITE_META.ogImage}` }],
  ['meta', { name: 'twitter:card', content: 'summary_large_image' }]
]
// Page views on client-side navigation come from GA4 enhanced measurement
// and the Cloudflare beacon (both watch history events): no router hook.
for (const { attrs, body } of analyticsTags(analytics, base)) {
  head.push(body ? ['script', attrs, body] : ['script', attrs])
}
// END_BLOCK_DOCS_HEAD

export default defineConfig({
  title: 'Mark',
  description: SITE_META.description,
  base,
  cleanUrls: true,
  // C-58 T-003: the gallery is emitted in buildEnd, not as a VitePress
  // page, so it joins the sitemap here.
  sitemap: {
    hostname: siteUrl + '/',
    transformItems: (items) => [...items, { url: 'diagrams/' }]
  },
  head,

  // Per-page canonical + OG url/title so shared doc links preview correctly.
  transformHead ({ pageData, title }) {
    const path = pageData.relativePath.replace(/(^|\/)index\.md$/, '$1').replace(/\.md$/, '')
    const url = `${siteUrl}/${path}`
    return [
      ['link', { rel: 'canonical', href: url }],
      ['meta', { property: 'og:url', content: url }],
      ['meta', { property: 'og:title', content: title }],
      ['meta', { property: 'og:description', content: pageData.description || SITE_META.description }]
    ]
  },

  // START_BLOCK_DEV_LANDING
  // `vitepress dev` would show index.md at the root; serve the real landing
  // instead so local preview matches production. Re-read on every request so
  // edits to site/landing/index.html show up on reload. The gallery is
  // served the same way at /diagrams/ (rendered on demand — pele is fast
  // enough for dev, and theme CSS edits show up on reload).
  vite: {
    plugins: [{
      name: 'mark-landing-dev',
      enforce: 'pre',
      configureServer (server) {
        server.middlewares.use((req, res, next) => {
          const path = (req.url || '').split('?')[0]
          if (path === `${base}diagrams` || path === `${base}diagrams/` || path === `${base}diagrams/index.html`) {
            res.setHeader('Content-Type', 'text/html; charset=utf-8')
            res.end(renderGallery(settings))
            return
          }
          if (path !== base && path !== `${base}index.html`) return next()
          res.setHeader('Content-Type', 'text/html; charset=utf-8')
          res.end(loadLanding())
        })
      }
    }]
  },
  // END_BLOCK_DEV_LANDING

  // START_BLOCK_BUILD_END
  buildEnd ({ outDir }) {
    writeFileSync(join(outDir, 'index.html'), loadLanding())
    writeFileSync(join(outDir, 'robots.txt'), robotsTxt(settings))
    const cname = cnameFor(settings)
    if (cname) writeFileSync(join(outDir, 'CNAME'), cname)
    // C-58: the diagram gallery — SVGs rendered through pele at build time,
    // theme variables derived fresh from the app's theme CSS (corner-5), and
    // the committed theme-vars.json refreshed so the parity test sees the
    // same table the page was built with.
    mkdirSync(join(outDir, 'diagrams'), { recursive: true })
    writeFileSync(join(outDir, 'diagrams', 'index.html'), renderGallery(settings))
    const vars = writeThemeVarsFile(fileURLToPath(new URL('../gallery', import.meta.url)))
    console.log(`[SiteBuild][buildEnd][BLOCK_BUILD_END] landing written siteUrl=${siteUrl} base=${base} cname=${cname ? cname.trim() : 'none'} analytics=${analytics.map((a) => a.provider).join('+') || 'off'}`)
    console.log(`[SiteBuild][buildEnd][BLOCK_BUILD_END] gallery written path=${base}diagrams/ themes=${vars.themes} themeVarsChanged=${vars.changed}`)
  },
  // END_BLOCK_BUILD_END

  themeConfig: {
    logo: `/${SITE_META.favicon}`,
    nav: [
      { text: 'Guide', link: '/guide/' },
      { text: 'Reference', link: '/reference/' },
{ text: 'Diagrams', link: '/diagrams/', target: '_self' },
      { text: 'Changelog', link: '/changelog' },
      { text: 'Privacy', link: '/privacy' },
      { text: 'GitHub', link: 'https://github.com/xronocode/mark' },
      { text: 'Support', link: 'https://ko-fi.com/xronocode' }
    ],
    sidebar: {
      '/guide/': [
        {
          text: 'Getting Started',
          items: [
            { text: 'Introduction', link: '/guide/' },
            { text: 'Installation', link: '/guide/installation' },
            { text: 'Editions', link: '/guide/editions' },
            { text: 'Quick Start', link: '/guide/quickstart' }
          ]
        },
        {
          text: 'Features',
          items: [
            { text: 'Editor Basics', link: '/guide/editor' },
            { text: 'Keyboard Shortcuts', link: '/guide/shortcuts' },
            { text: 'Themes', link: '/guide/themes' },
            { text: 'Project Sidebar', link: '/guide/project-sidebar' },
            { text: 'Search', link: '/guide/search' },
            { text: 'Diff View', link: '/guide/diff-view' },
            { text: 'CLI Usage', link: '/guide/cli' },
            { text: 'Export', link: '/guide/export' }
          ]
        }
      ],
      '/reference/': [
        {
          text: 'Reference',
          items: [
            { text: 'Overview', link: '/reference/' },
            { text: 'Architecture', link: '/reference/architecture' },
            { text: 'Rust API (cargo doc)', link: '/reference/rust-api' }
          ]
        }
      ]
    },
    search: { provider: 'local' },
    editLink: {
      pattern: 'https://github.com/xronocode/mark/edit/main/site/:path',
      text: 'Edit this page on GitHub'
    },
    socialLinks: [
      { icon: 'github', link: 'https://github.com/xronocode/mark' }
    ],
    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright 2017+ Jocs, 2024+ tkaixiang, 2026+ xronocode'
    }
  }
})
