// FILE: site/.vitepress/config.mts
// VERSION: 2.9.0
// START_MODULE_CONTRACT
//   PURPOSE: VitePress config for the Mark site — docs, shared head, the
//            landing served at the site root, and the diagram gallery at
//            /diagrams/ (both emitted at build time and served in dev).
//   SCOPE: nav/sidebar, base + sitemap (lastmod from git via lastUpdated)
//          from env, latest-GitHub-release resolution at config load
//          (setReleaseVersion pins appVersion; the facts feed fillLanding;
//          SITE_RELEASE=offline skips the API call), per-page canonical/OG
//          plus guide BreadcrumbList and the FAQPage JSON-LD, dev middleware
//          for the landing and /diagrams/, buildEnd emission of landing +
//          gallery (+ theme-vars refresh), robots.txt and CNAME.
//   DEPENDS: vitepress, ./landing.mjs, ../scripts/build-gallery.mjs,
//            ../scripts/gallery-theme-vars.mjs, ../scripts/release.mjs,
//            ../shared/theme-init.mjs
//   LINKS: M-053 SiteBuild; C-22; C-58; C-64 T-001, T-007, version sync;
//          .github/workflows/site.yml
//   ROLE: CONFIG
//   MAP_MODE: NONE
// END_MODULE_CONTRACT
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: [v2.9.0 - 2026-10-19 C-64 version sync: the config resolves
//                 the latest GitHub release once at load (package.json
//                 fallback, SITE_RELEASE=offline skips the API), pins it via
//                 setReleaseVersion so JSON-LD/llms.txt agree with the page,
//                 logs [SiteBuild][release] and passes the facts into
//                 fillLanding for the %VERSION%/%DMG_*/%EXE_* tokens.]
//   PREV: [v2.8.0 - 2026-10-18 C-64 T-007: lastUpdated: true gives
//                 the sitemap a per-page lastmod from git (the docs theme
//                 showing "Last updated" is accepted); guide pages carry a
//                 Home → Guide → page BreadcrumbList and guide/faq.md the
//                 FAQPage JSON-LD through transformHead; the guide sidebar
//                 gains the FAQ page after Editions (and in the sitemap).]
//   PREV: [v2.7.0 - 2026-10-18 C-64 T-002: the landing template goes
//                 through fillLanding (diagram SVGs, brand CSS, theme init).]
//   PREV: [v2.6.0 - 2026-10-18 C-64 T-003 wiring: docsHeadTags in the
//                 docs head; buildEnd emits llms.txt + .well-known/security.txt
//                 and runs applyCsp over every built page last.]
//   PREV: [v2.5.0 - 2026-10-18 C-64 T-001: the docs wear the brand —
//                 theme/ extends DefaultTheme over site/shared/brand.css;
//                 head gains the shared no-flash THEME_INIT_JS script, the
//                 paper/ink theme-color pair and font preloads; nav is
//                 Diagrams/Guide/Reference/Changelog (+ GitHub icon) with
//                 Privacy and Support moved to the footer.]
//   PREV: [v2.4.0 - 2026-10-18 C-58 T-003: the sitemap lists the
//                 buildEnd-emitted diagrams/ gallery (a docs nav entry was
//                 dropped: an eighth item overflows the phone nav bar).]
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
  appVersion,
  ogImageUrl,
  analyticsTags,
  breadcrumbJsonLd,
  cnameFor,
  docsHeadTags,
  faqJsonLd,
  renderLanding,
  resolveSiteSettings,
  robotsTxt,
  setReleaseVersion
} from './landing.mjs'
import { renderGallery } from '../scripts/build-gallery.mjs'
import { writeThemeVarsFile } from '../scripts/gallery-theme-vars.mjs'
import { THEME_INIT_JS } from '../shared/theme-init.mjs'
import { applyCsp } from '../scripts/csp.mjs'
import { fillLanding } from '../scripts/landing-fill.mjs'
import { llmsTxt, securityTxt } from '../scripts/seo-files.mjs'
import { latestRelease, releaseFacts } from '../scripts/release.mjs'

// C-64 version sync: one version source for the whole site — the latest
// published GitHub release, with the root package.json as the fallback so
// offline builds still ship. SITE_RELEASE=offline skips the API call.
const release = releaseFacts(process.env.SITE_RELEASE === 'offline' ? null : await latestRelease(), appVersion())
setReleaseVersion(release.version)
console.log(`[SiteBuild][release] version=${release.version} source=${release.source}`)

const settings = resolveSiteSettings(process.env)
const { siteUrl, base, analytics } = settings
const landingTemplate = new URL('../landing/index.html', import.meta.url)
const loadLanding = () => renderLanding(fillLanding(readFileSync(landingTemplate, 'utf8'), undefined, release), settings)

// START_BLOCK_DOCS_HEAD
const head: HeadConfig[] = [
  // C-64 R-2: resolve the saved/system theme before first paint — same
  // script the gallery inlines; VitePress's own check-dark-mode runs after
  // it and agrees (same storage key, same resolution).
  ['script', {}, THEME_INIT_JS],
  ['style', {}, '.vp-doc div[class*=language-] > span.lang{color:var(--vp-c-text-2)}'],
  ['link', { rel: 'icon', href: `${base}favicon.ico?v=2`, sizes: '48x48' }],
  ['link', { rel: 'icon', type: 'image/svg+xml', href: `${base}favicon.svg?v=2` }],
  ['link', { rel: 'apple-touch-icon', href: `${base}apple-touch-icon.png?v=2` }],
  // C-64 T-003: App Store banner (Safari/macOS), paper/ink theme-color
  // pair, strict referrer, WebSite JSON-LD.
  ...(docsHeadTags(settings) as HeadConfig[]),
  ['meta', { property: 'og:type', content: 'website' }],
  ['meta', { property: 'og:site_name', content: SITE_META.name }],
  ['meta', { property: 'og:image', content: ogImageUrl(siteUrl) }],
  ['meta', { name: 'twitter:card', content: 'summary_large_image' }],
  // Above-the-fold brand faces (display headings + body text).
  ['link', { rel: 'preload', href: `${base}fonts/brand/BricolageGrotesque-800.woff2`, as: 'font', type: 'font/woff2', crossorigin: '' }],
  ['link', { rel: 'preload', href: `${base}fonts/brand/IBMPlexSans-400.woff2`, as: 'font', type: 'font/woff2', crossorigin: '' }]
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
  // C-64 T-007 S-3: lastUpdated feeds the sitemap's per-page lastmod from
  // git; the docs theme then also shows "Last updated" — accepted.
  lastUpdated: true,
  // /diagrams/ is emitted by buildEnd outside VitePress, so markdown links
  // to it (e.g. guide/themes.md) look dead to the checker but are alive in
  // the served site.
  ignoreDeadLinks: [/^\/diagrams\b/],
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
    const head: HeadConfig[] = [
      ['link', { rel: 'canonical', href: url }],
      ['meta', { property: 'og:url', content: url }],
      ['meta', { property: 'og:title', content: title }],
      ['meta', { property: 'og:description', content: pageData.description || SITE_META.description }]
    ]
    // C-64 T-007 G-2: guide pages carry a Home → Guide → page breadcrumb;
    // the FAQ page adds its FAQPage node (same Q&As as the markdown).
    if (path.startsWith('guide/')) {
      head.push(['script', { type: 'application/ld+json' }, breadcrumbJsonLd(settings, { path, title: pageData.title })])
    }
    if (pageData.relativePath === 'guide/faq.md') {
      head.push(['script', { type: 'application/ld+json' }, faqJsonLd()])
    }
    return head
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
    // C-64 T-003: llms.txt + security.txt, then the meta CSP — last, so
    // every page (docs, landing, gallery, 404) is on disk and gets pinned.
    writeFileSync(join(outDir, 'llms.txt'), llmsTxt(settings))
    mkdirSync(join(outDir, '.well-known'), { recursive: true })
    writeFileSync(join(outDir, '.well-known', 'security.txt'), securityTxt(settings, new Date()))
    const csp = applyCsp(outDir, { analytics })
    console.log(`[SiteBuild][buildEnd][BLOCK_BUILD_END] seo+csp files=${csp.files} inlineScripts=${csp.hashes}`)
  },
  // END_BLOCK_BUILD_END

  themeConfig: {
    // The ¶ icon + "Mark" in Bricolage (theme/index.ts + custom.css).
    logo: { src: '/mark-icon.svg', alt: 'Mark' },
    // C-64: five items max — the bar must fit 390 px with zero overflow
    // (extra items collapse into VitePress's hamburger on phones, but the
    // desktop bar + search + appearance still need headroom). /diagrams/
    // is emitted outside VitePress: a plain same-tab link (any `target`
    // attribute opts out of the SPA router) that dead-link checks ignore.
    nav: [
      { text: 'Diagrams', link: `${base}diagrams/`, target: '_self' },
      { text: 'Guide', link: '/guide/' },
      { text: 'Reference', link: '/reference/' },
      { text: 'Changelog', link: '/changelog' }
    ],
    sidebar: {
      '/guide/': [
        {
          text: 'Getting Started',
          items: [
            { text: 'Introduction', link: '/guide/' },
            { text: 'Installation', link: '/guide/installation' },
            { text: 'Editions', link: '/guide/editions' },
            { text: 'FAQ', link: '/guide/faq' },
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
    // C-64: Privacy and Support moved here from the nav; the theme renders
    // the rows mono/uppercase over a rule (proof-sheet footer).
    footer: {
      message:
        `<a href="${base}guide/">Docs</a> · <a href="${base}diagrams/">Diagrams</a> · ` +
        `<a href="${base}changelog">Changelog</a> · <a href="${base}privacy">Privacy</a> · ` +
        '<a href="https://ko-fi.com/xronocode">Support</a> · ' +
        '<a href="https://github.com/xronocode/mark">GitHub</a>',
      copyright:
        'Released under the MIT License. Copyright 2017+ Jocs, 2024+ tkaixiang, 2026+ xronocode'
    }
  }
})
