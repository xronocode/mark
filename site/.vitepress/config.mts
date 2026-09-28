// FILE: site/.vitepress/config.mts
// VERSION: 2.2.0
// START_MODULE_CONTRACT
//   PURPOSE: VitePress config for the Mark site — docs, shared head, and the
//            landing served at the site root in both dev and build.
//   SCOPE: nav/sidebar, base + sitemap from env, per-page canonical/OG,
//          dev middleware for the landing, buildEnd emission of landing,
//          robots.txt and CNAME.
//   DEPENDS: vitepress, ./landing.mjs
//   LINKS: M-053 SiteBuild; C-22; .github/workflows/site.yml
//   ROLE: CONFIG
//   MAP_MODE: NONE
// END_MODULE_CONTRACT
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: [v2.2.0 - docs head analytics from the shared analyticsTags list]
//   PREV: [v2.1.0 - GA4 analytics provider in the docs head]
//   PREV: [v2.0.0 - C-22: env-driven base/URL, landing via buildEnd + dev
//                 middleware (replaces CI cp), SEO head, sitemap, opt-in analytics]
// END_CHANGE_SUMMARY

import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { defineConfig, type HeadConfig } from 'vitepress'
import {
  SITE_META,
  analyticsTags,
  cnameFor,
  renderLanding,
  resolveSiteSettings,
  robotsTxt
} from './landing.mjs'

const settings = resolveSiteSettings(process.env)
const { siteUrl, base, analytics } = settings
const landingTemplate = new URL('../landing/index.html', import.meta.url)
const loadLanding = () => renderLanding(readFileSync(landingTemplate, 'utf8'), settings)

// START_BLOCK_DOCS_HEAD
const head: HeadConfig[] = [
  ['link', { rel: 'icon', type: 'image/png', href: `${base}${SITE_META.favicon}` }],
  ['meta', { name: 'theme-color', content: '#07090c' }],
  ['meta', { property: 'og:type', content: 'website' }],
  ['meta', { property: 'og:site_name', content: SITE_META.name }],
  ['meta', { property: 'og:image', content: `${siteUrl}/${SITE_META.ogImage}` }],
  ['meta', { name: 'twitter:card', content: 'summary_large_image' }]
]
// Page views on client-side navigation come from GA4 enhanced measurement
// and the Cloudflare beacon (both watch history events): no router hook.
for (const { attrs, body } of analyticsTags(analytics)) {
  head.push(body ? ['script', attrs, body] : ['script', attrs])
}
// END_BLOCK_DOCS_HEAD

export default defineConfig({
  title: 'Mark',
  description: SITE_META.description,
  base,
  cleanUrls: true,
  sitemap: { hostname: siteUrl + '/' },
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
  // edits to site/landing/index.html show up on reload.
  vite: {
    plugins: [{
      name: 'mark-landing-dev',
      enforce: 'pre',
      configureServer (server) {
        server.middlewares.use((req, res, next) => {
          const path = (req.url || '').split('?')[0]
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
    console.log(`[SiteBuild][buildEnd][BLOCK_BUILD_END] landing written siteUrl=${siteUrl} base=${base} cname=${cname ? cname.trim() : 'none'} analytics=${analytics.map((a) => a.provider).join('+') || 'off'}`)
  },
  // END_BLOCK_BUILD_END

  themeConfig: {
    logo: `/${SITE_META.favicon}`,
    nav: [
      { text: 'Guide', link: '/guide/' },
      { text: 'Reference', link: '/reference/' },
      { text: 'Changelog', link: '/changelog' },
      { text: 'Privacy', link: '/privacy' },
      { text: 'GitHub', link: 'https://github.com/xronocode/mark' }
    ],
    sidebar: {
      '/guide/': [
        {
          text: 'Getting Started',
          items: [
            { text: 'Introduction', link: '/guide/' },
            { text: 'Installation', link: '/guide/installation' },
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
