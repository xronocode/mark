// FILE: site/.vitepress/landing.mjs
// VERSION: 1.9.0
// START_MODULE_CONTRACT
//   PURPOSE: Single source of site settings and the static-page renderers
//            shared by the VitePress config (dev middleware + buildEnd) and
//            unit tests.
//   SCOPE: resolve SITE_URL/SITE_BASE and analytics env (GA_MEASUREMENT_ID,
//          CF_BEACON_TOKEN, UMAMI_*) into settings; render static pages
//          (landing + the C-58 /diagrams/ gallery) from templates with the
//          shared head (per-page canonical/OG, hreflang, apple-itunes-app,
//          theme-color pair, referrer, JSON-LD @graph) and base token; emit
//          robots.txt and CNAME content; expose the docs-only head list, the
//          docs BreadcrumbList and FAQPage JSON-LD generators, the plain-text
//          FAQ mirror for site/guide/faq.md, and the app version read from
//          the root package.json.
//   DEPENDS: node:fs (appVersion reads the root package.json; everything
//            else stays pure over strings/env)
//   LINKS: M-053 SiteBuild; C-22; C-58; C-64 T-003, T-007;
//          site/landing/index.html; site/public/{consent.js,track.js};
//          site/guide/faq.md (the human-readable FAQ FAQ_ITEMS mirrors);
//          site/scripts/{build-gallery.mjs,check-dist.mjs,csp.mjs} (consumers)
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   SITE_META - product name/description/og image used by landing and docs
//   APP_STORE_ID - Mac App Store app id (banner meta, JSON-LD)
//   APP_STORE_URL - Mac App Store product URL
//   GITHUB_REPO - repository URL
//   GITHUB_RELEASES - latest-release URL (DMG, Windows setup.exe)
//   appVersion - memoized read of the root package.json version (one source for softwareVersion)
//   resolveSiteSettings - env -> { siteUrl, base, analytics[] }
//   GA_ID_RE - accepted GA4 measurement id shape, checked before inlining
//   CF_TOKEN_RE - accepted Cloudflare beacon token shape, checked before inlining
//   CONSENT_GEO_URL - shared country lookup that decides whether the cookie banner is needed
//   assetVersion - public/ file name -> 10-hex content hash for ?v= cache-busting ('' when unreadable)
//   ogImageUrl - siteUrl -> absolute og-card.png URL with its ?v= content hash
//   analyticsTags - analytics[], base -> [{ attrs, body }] script tags (landing + docs; GA4 adds consent.js + track.js, hash-versioned)
//   analyticsScript - analyticsTags serialized to HTML, '' when analytics is off
//   jsonLd - settings + page -> JSON-LD @graph body (SoftwareApplication + WebSite; '<' escaped)
//   breadcrumbJsonLd - settings + { path, title } -> BreadcrumbList body for docs pages (Home → Guide → page)
//   FAQ_ITEMS - plain-text mirror of site/guide/faq.md for FAQPage structured data
//   faqJsonLd - FAQ items -> FAQPage JSON-LD body (plain-text answers, '<' escaped)
//   sharedHeadTags - settings + { path, title, description } -> meta/OG/twitter/favicon/JSON-LD/analytics HTML
//   docsHeadTags - settings -> VitePress HeadConfig list for the docs pages (WebSite JSON-LD only)
//   renderSharedHead - sharedHeadTags for the site root (landing default meta)
//   renderPage - template + settings + page meta -> final HTML (head + base)
//   renderLanding - template -> final landing HTML (renderPage with root meta, comments stripped, <!doctype first — C-64 T-006)
//   robotsTxt - robots.txt body pointing at the sitemap
//   cnameFor - custom-domain CNAME body, or null for github.io/sub-path hosting
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: [v1.9.0 - 2026-10-19 C-64: og:image and the JSON-LD image carry a ?v= content hash (ogImageUrl) so link previews pick up a new card.]
//   PREV: [v1.8.0 - 2026-10-18 C-64 T-007: consent.js/track.js URLs carry a ?v= content hash (assetVersion) so the Cloudflare cache cannot serve a stale consent script]
//   PREV: [v1.7.0 - 2026-10-18 C-64 T-007: the SoftwareApplication
//                 node gains screenshot (/shots/01-agents.jpg), fileSize
//                 ("15MB" — the landing's ≈15 MB DMG figure), releaseNotes
//                 (/changelog) and softwareRequirements ("macOS 12 or
//                 later" only — the repo states no Windows minimum), plus
//                 an author/publisher Organization (xronocode, site url,
//                 /mark-icon.svg logo) shared with the WebSite node;
//                 breadcrumbJsonLd powers the docs BreadcrumbList (Home →
//                 Guide → page) and FAQ_ITEMS + faqJsonLd back the new
//                 /guide/faq FAQPage structured data.]
//   PREV: [v1.6.0 - 2026-10-18 C-64 T-006: renderLanding strips every
//                 HTML comment (except IE-style conditional ones, of which
//                 there are none) from the final output and trims leading
//                 whitespace, so the served page starts with <!doctype and
//                 <meta charset> sits at the top of <head> instead of after
//                 ~6.9 KB of GRACE headers (S-4). renderPage is unchanged:
//                 the gallery template carries no comment header.]
//   PREV: [v1.5.0 - 2026-10-18 C-64 T-003: the shared head carries the
//                 Avenex-grade SEO set (apple-itunes-app banner, light/dark
//                 theme-color pair from the brand tokens, strict referrer,
//                 hreflang en + x-default, 1200x630 og-card.png with
//                 width/height/alt, JSON-LD @graph SoftwareApplication +
//                 WebSite with softwareVersion from the root package.json);
//                 GA4 also loads public/track.js (download_click);
//                 SITE_META.description loses the stale 11 MB claim;
//                 docsHeadTags exports the docs-page subset.]
//   PREV: [v1.4.0 - 2026-10-18 C-58 T-002: the shared head and the
//                 template render are generalized into sharedHeadTags +
//                 renderPage (per-page path/title/description) so the
//                 /diagrams/ gallery page gets the same SEO/analytics/
//                 consent treatment; renderLanding/renderSharedHead keep
//                 their exact previous output for the root page.]
//   PREV: [2026-10-12 - Defer the self-contained analytics loader to keep first paint unblocked.]
//   PREV: [v1.3.0 - GA4 loads through public/consent.js: Consent Mode v2 + cookie banner only for EEA/UK/CH visitors]
//   PREV: [v1.2.0 - analytics is a list; GA4, Cloudflare Web Analytics and Umami can run together]
//   PREV: [v1.1.0 - GA4 provider via GA_MEASUREMENT_ID]
//   PREV: [v1.0.0 - C-22: replaces the CI `cp` overlay and hard-coded /mark/ paths]
// END_CHANGE_SUMMARY

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createHash } from 'node:crypto'

export const SITE_META = {
  name: 'Mark',
  title: 'Mark — The Markdown Editor for AI Agents',
  description:
    'Mark is a native Markdown editor for macOS and Windows that renders what your AI agents write: tables, 32 diagram types, math, and reloads on every save.',
  ogImage: 'og-card.png',
  ogImageAlt: 'Mark, a native Markdown editor: agents write Markdown, Mark draws it.',
  favicon: 'logo-96px.png'
}

export const APP_STORE_ID = '6814590464'
export const APP_STORE_URL = `https://apps.apple.com/app/id${APP_STORE_ID}`
export const GITHUB_REPO = 'https://github.com/xronocode/mark'
export const GITHUB_RELEASES = 'https://github.com/xronocode/mark/releases/latest'

// START_CONTRACT: appVersion
//   PURPOSE: One source for the shipped version: the root package.json
//            (kept in sync with the release by the M-046 preflight).
//   INPUTS: {}
//   OUTPUTS: { string - semver, e.g. "2.5.0" }
//   SIDE_EFFECTS: reads ../../package.json once, memoized in module state
// END_CONTRACT: appVersion
let APP_VERSION
export function appVersion () {
  if (APP_VERSION === undefined) {
    // vitest's jsdom env serves modules from an http: URL — map it onto the
    // repo checkout so the one-source version read works everywhere.
    const pkg = new URL('../../package.json', import.meta.url)
    const pkgPath = pkg.protocol === 'file:' ? pkg : join(process.cwd(), decodeURIComponent(pkg.pathname))
    APP_VERSION = JSON.parse(readFileSync(pkgPath, 'utf8')).version
  }
  return APP_VERSION
}

// Cache-busting for public/ scripts: Cloudflare keeps /consent.js and
// /track.js for hours, so the URL carries a short content hash and every
// deploy that changes a script gets a fresh URL. '' when unreadable.
const ASSET_VERSIONS = {}
export function assetVersion (name) {
  if (ASSET_VERSIONS[name] === undefined) {
    try {
      const u = new URL(`../public/${name}`, import.meta.url)
      const path = u.protocol === 'file:' ? u : join(process.cwd(), decodeURIComponent(u.pathname))
      ASSET_VERSIONS[name] = createHash('sha256').update(readFileSync(path)).digest('hex').slice(0, 10)
    } catch (e) { ASSET_VERSIONS[name] = '' }
  }
  return ASSET_VERSIONS[name]
}
// og:image too: link-preview scrapers and the CDN cache it by URL.
export const ogImageUrl = (siteUrl) => `${siteUrl}/${versioned('', SITE_META.ogImage)}`
const versioned = (base, name) => `${base}${name}${assetVersion(name) ? `?v=${assetVersion(name)}` : ''}`

const DEFAULT_SITE_URL = 'https://mark.xronocode.com'
const DEFAULT_UMAMI_SRC = 'https://cloud.umami.is/script.js'
const BASE_TOKEN = /%BASE%/g
const HEAD_PLACEHOLDER = '<!--SITE_HEAD-->'
export const GA_ID_RE = /^G-[A-Z0-9]{4,16}$/
export const CF_TOKEN_RE = /^[a-f0-9]{32}$/

// START_CONTRACT: resolveSiteSettings
//   PURPOSE: Normalize deployment settings from the environment.
//   INPUTS: { env: Record<string,string|undefined> - usually process.env }
//   OUTPUTS: { {siteUrl, base, analytics} - siteUrl has no trailing slash and
//              already includes the base path; base starts and ends with '/';
//              analytics is a list of enabled providers, [] when none }
//   SIDE_EFFECTS: throws on a malformed GA / Cloudflare id (never inlined)
// END_CONTRACT: resolveSiteSettings
export function resolveSiteSettings (env = {}) {
  // START_BLOCK_RESOLVE_BASE
  let base = (env.SITE_BASE || '/').trim()
  if (!base.startsWith('/')) base = '/' + base
  if (!base.endsWith('/')) base += '/'
  const siteUrl = (env.SITE_URL || DEFAULT_SITE_URL).trim().replace(/\/+$/, '')
  // END_BLOCK_RESOLVE_BASE

  // START_BLOCK_RESOLVE_ANALYTICS
  const read = (key) => (env[key] || '').trim()
  const checked = (key, re, shape) => {
    const value = read(key)
    if (value && !re.test(value)) {
      throw new Error(`[SiteBuild][resolveSiteSettings][BLOCK_RESOLVE_ANALYTICS] ${key} must look like ${shape}, got "${value}"`)
    }
    return value
  }
  const measurementId = checked('GA_MEASUREMENT_ID', GA_ID_RE, 'G-XXXXXXXX')
  const token = checked('CF_BEACON_TOKEN', CF_TOKEN_RE, '32 lowercase hex chars')
  const websiteId = read('UMAMI_WEBSITE_ID')
  const analytics = []
  if (measurementId) analytics.push({ provider: 'ga4', measurementId })
  if (token) analytics.push({ provider: 'cloudflare', token })
  if (websiteId) analytics.push({ provider: 'umami', websiteId, src: read('UMAMI_SRC') || DEFAULT_UMAMI_SRC })
  // END_BLOCK_RESOLVE_ANALYTICS

  return { siteUrl, base, analytics }
}

function escapeAttr (value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

export const CONSENT_GEO_URL = 'https://avenex.xronocode.com/api/geo'

// START_CONTRACT: analyticsTags
//   PURPOSE: One description of every analytics <script>, shared by the
//            landing (serialized) and the VitePress docs head (HeadConfig).
//   INPUTS: { analytics: resolveSiteSettings().analytics, base: site base path ('/' by default) }
//   OUTPUTS: { Array<{ attrs: Record<string,string>, body: string }> }
//   SIDE_EFFECTS: none. GA ids passed GA_ID_RE, so they are safe in attributes.
//            GA4 loads through public/consent.js (Consent Mode v2; banner
//            only where opt-in is required) plus public/track.js (the
//            consent-gated download_click / share_to_mac events).
// END_CONTRACT: analyticsTags
export function analyticsTags (analytics = [], base = '/') {
  return analytics.flatMap((a) => {
    if (a.provider === 'ga4') {
      return [{
        attrs: { defer: '', src: versioned(base, 'consent.js'), 'data-ga': a.measurementId, 'data-geo': CONSENT_GEO_URL, 'data-privacy': `${base}privacy` },
        body: ''
      }, {
        attrs: { defer: '', src: versioned(base, 'track.js') },
        body: ''
      }]
    }
    if (a.provider === 'cloudflare') {
      // Cookieless; SPA route changes are tracked by the beacon itself.
      return [{ attrs: { defer: '', src: 'https://static.cloudflareinsights.com/beacon.min.js', 'data-cf-beacon': JSON.stringify({ token: a.token }) }, body: '' }]
    }
    return [{ attrs: { defer: '', src: a.src, 'data-website-id': a.websiteId }, body: '' }]
  })
}

export function analyticsScript (analytics, base = '/') {
  return analyticsTags(analytics, base).map(({ attrs, body }) => {
    const a = Object.entries(attrs).map(([k, v]) => (v === '' ? ` ${k}` : ` ${k}="${escapeAttr(v)}"`)).join('')
    return `<script${a}>${body}</script>`
  }).join('\n    ')
}

// START_CONTRACT: jsonLd
//   PURPOSE: The schema.org document for the site — a SoftwareApplication
//            (name/version/offers/downloadUrls from the install facts) and
//            the WebSite node — serialized with '<' escaped so the JSON can
//            never close its own <script> host.
//   INPUTS: { settings: resolveSiteSettings() output,
//             page: { description?: string } - per-page description for the
//                    SoftwareApplication node (defaults to SITE_META),
//             opts: { websiteOnly?: boolean } - docs pages emit the WebSite
//                    node only (C-64 T-003 head split) }
//   OUTPUTS: { string - the JSON body of a <script type="application/ld+json"> }
//   SIDE_EFFECTS: none (appVersion reads the root package.json once)
// END_CONTRACT: jsonLd
// START_BLOCK_JSON_LD
export function jsonLd (settings, page = {}, opts = {}) {
  const org = {
    '@type': 'Organization',
    name: 'xronocode',
    url: settings.siteUrl + '/',
    logo: `${settings.siteUrl}/mark-icon.svg`,
    sameAs: [GITHUB_REPO]
  }
  const software = {
    '@type': 'SoftwareApplication',
    name: SITE_META.name,
    description: page.description ?? SITE_META.description,
    applicationCategory: 'DeveloperApplication',
    operatingSystem: 'macOS, Windows',
    softwareVersion: appVersion(),
    // The repo states only the macOS 12 minimum (the App Store card on the
    // landing); no Windows minimum is claimed anywhere, so it stays macOS-only.
    softwareRequirements: 'macOS 12 or later',
    // The landing's DMG figure ("≈ 15 MB") as schema.org expects it (digits + unit).
    fileSize: '15MB',
    screenshot: `${settings.siteUrl}/shots/01-agents.jpg`,
    releaseNotes: `${settings.siteUrl}/changelog`,
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    downloadUrl: [APP_STORE_URL, GITHUB_RELEASES],
    installUrl: APP_STORE_URL,
    image: ogImageUrl(settings.siteUrl),
    license: 'https://opensource.org/licenses/MIT',
    author: org,
    publisher: org,
    sameAs: [GITHUB_REPO]
  }
  const website = {
    '@type': 'WebSite',
    url: settings.siteUrl + '/',
    name: SITE_META.name,
    publisher: org
  }
  const graph = opts.websiteOnly ? [website] : [software, website]
  return JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }).replace(/</g, '\\u003c')
}
// END_BLOCK_JSON_LD

// START_CONTRACT: breadcrumbJsonLd
//   PURPOSE: BreadcrumbList JSON-LD for the docs pages (Home → Guide →
//            page) so search results can show the section path.
//   INPUTS: { settings: resolveSiteSettings() output,
//             page: { path: string - 'guide/installation' (a trailing
//                     slash is fine; 'guide/' = the section index),
//                     title: string - the page's own H1 for the last crumb }
//   OUTPUTS: { string - JSON body of a <script type="application/ld+json">,
//              '<' escaped like every ld+json this module emits }
//   SIDE_EFFECTS: none
// END_CONTRACT: breadcrumbJsonLd
export function breadcrumbJsonLd (settings, page = {}) {
  const path = (page.path || '').replace(/(^|\/)index$/, '').replace(/\/+$/, '')
  const items = [
    { '@type': 'ListItem', position: 1, name: 'Home', item: settings.siteUrl + '/' },
    { '@type': 'ListItem', position: 2, name: 'Guide', item: settings.siteUrl + '/guide/' }
  ]
  const slug = path === 'guide' ? '' : path.replace(/^guide\//, '')
  if (slug) {
    items.push({ '@type': 'ListItem', position: 3, name: page.title || slug, item: `${settings.siteUrl}/${path}` })
  }
  return JSON.stringify({ '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: items }).replace(/</g, '\\u003c')
}

// START_BLOCK_FAQ_JSON_LD
// The plain-text mirror of site/guide/faq.md for FAQPage structured data:
// the same questions and answers with the markdown links stripped (the
// JSON-LD answer text must be plain). faq.md stays the human-readable
// source; tests/site/head.test.mjs pins the two in sync.
export const FAQ_ITEMS = [
  { q: 'What is Mark, and who is it for?',
    a: 'Mark is a free, open-source WYSIWYG Markdown editor for macOS and Windows. It is built for people who read and edit the Markdown files AI agents write — plans, specs and reports — rendered as a finished page while the agent is still working.' },
  { q: 'Does the document reload when my agent saves the file?',
    a: 'Yes. Every save on disk reloads the open tab in place and keeps your scroll position. Press ⌘D to see exactly what changed since you last looked, against a snapshot Mark takes before every reload.' },
  { q: 'Which diagrams can Mark draw?',
    a: 'Any Mermaid-style fenced code block: 32 diagram types, from flowcharts and sequence diagrams to sankey, venn, radar and kanban, drawn in the colours of the current theme. Every type is shown in the online diagram gallery.' },
  { q: 'Is Mark native? How big and fast is it?',
    a: 'Mark is built on Tauri 2 and renders with the system WebView — WebKit on macOS, WebView2 on Windows — instead of shipping its own browser engine. Measured on 2.3.0: a first window in about 0.4 s, about 30 MB on disk, and about 150 MB of memory with a plain document.' },
  { q: 'Which systems does Mark run on?',
    a: 'macOS — Homebrew or the .dmg download on Apple silicon, or the Mac App Store edition on macOS 12 or later — and Windows x64 via the installer from GitHub Releases. The Homebrew cask and .dmg are Apple-silicon only; Intel Macs are not supported by the cask.' },
  { q: 'What is the difference between the App Store and the Homebrew/download editions?',
    a: 'The editor is the same. The App Store edition is sandboxed and reviewed by Apple; the Homebrew/download edition adds pandoc export, insert screenshot, the default-Markdown-app setting, git diff, a local live server for agents and the in-app updater.' },
  { q: 'Is Mark free and open source?',
    a: 'Yes. Mark is released under the MIT licence and the source is on GitHub.' },
  { q: 'Does the app collect any data?',
    a: 'No. The app itself has no analytics, no telemetry, no advertising and no account system; your documents never leave your machine. The website measures visits separately, as described on the privacy page.' },
  { q: 'How do I open a file from a terminal or an agent?',
    a: "On macOS, run 'open -a Mark report.md' — it launches Mark if it is not running. Agents hand off documents the same way, and '--preview' opens a read-only tab that reloads on every save." },
  { q: 'What does Mark have to do with Mark Text?',
    a: 'Mark is inspired by Mark Text and began as a port of it; it is a different technical take on the same idea, rebuilt on Tauri 2 and Vue 3.' }
]

export function faqJsonLd (items = FAQ_ITEMS) {
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a }
    }))
  }).replace(/</g, '\\u003c')
}
// END_BLOCK_FAQ_JSON_LD

// START_CONTRACT: sharedHeadTags
//   PURPOSE: The shared head for any static site page — description,
//            per-page canonical/OG URL and title, hreflang (en +
//            x-default, single language per C-64 D-5), favicon, the
//            brand theme-color pair, referrer policy, the App Store
//            banner, twitter card, the JSON-LD @graph and the site's
//            analytics/consent scripts.
//   INPUTS: { settings: resolveSiteSettings() output,
//             page: { path?: string - URL path after the host with a trailing
//                     slash ('' = site root), title?: string,
//                     description?: string } - defaults to the landing meta }
//   OUTPUTS: { string - the head tags joined with newlines }
//   SIDE_EFFECTS: none
// END_CONTRACT: sharedHeadTags
export function sharedHeadTags (settings, page = {}) {
  const { siteUrl, base } = settings
  const path = page.path ?? ''
  const title = page.title ?? SITE_META.title
  const description = page.description ?? SITE_META.description
  const pageUrl = path ? `${siteUrl}/${path}` : siteUrl + '/'
  const image = ogImageUrl(siteUrl)
  const tags = [
    `<meta name="description" content="${escapeAttr(description)}">`,
    `<link rel="canonical" href="${escapeAttr(pageUrl)}">`,
    `<link rel="alternate" hreflang="en" href="${escapeAttr(pageUrl)}">`,
    `<link rel="alternate" hreflang="x-default" href="${escapeAttr(pageUrl)}">`,
    `<link rel="icon" href="${base}favicon.ico?v=2" sizes="48x48">`,
    `<link rel="icon" type="image/svg+xml" href="${base}favicon.svg?v=2">`,
    `<link rel="apple-touch-icon" href="${base}apple-touch-icon.png?v=2">`,
    `<meta name="apple-itunes-app" content="app-id=${APP_STORE_ID}">`,
    '<meta name="theme-color" content="#F5EFE4" media="(prefers-color-scheme: light)">',
    '<meta name="theme-color" content="#17191E" media="(prefers-color-scheme: dark)">',
    '<meta name="referrer" content="strict-origin-when-cross-origin">',
    '<meta property="og:type" content="website">',
    `<meta property="og:site_name" content="${SITE_META.name}">`,
    `<meta property="og:title" content="${escapeAttr(title)}">`,
    `<meta property="og:description" content="${escapeAttr(description)}">`,
    `<meta property="og:url" content="${escapeAttr(pageUrl)}">`,
    `<meta property="og:image" content="${escapeAttr(image)}">`,
    '<meta property="og:image:width" content="1200">',
    '<meta property="og:image:height" content="630">',
    `<meta property="og:image:alt" content="${escapeAttr(SITE_META.ogImageAlt)}">`,
    '<meta name="twitter:card" content="summary_large_image">',
    `<meta name="twitter:image" content="${escapeAttr(image)}">`,
    `<script type="application/ld+json">${jsonLd(settings, page)}</script>`,
    analyticsScript(settings.analytics, settings.base)
  ].filter(Boolean)
  return tags.join('\n    ')
}

export function renderSharedHead (settings) {
  return sharedHeadTags(settings)
}

// START_CONTRACT: docsHeadTags
//   PURPOSE: The docs-page subset of the shared head as a VitePress
//            HeadConfig list — everything the VitePress transformHead
//            cannot express per page (banner, theme colors, referrer) plus
//            the WebSite-only JSON-LD (the SoftwareApplication node stays
//            on the landing/gallery where the product story lives).
//   INPUTS: { settings: resolveSiteSettings() output }
//   OUTPUTS: { Array<[tag, attrs, body?]> - spread into the config head[] }
//   SIDE_EFFECTS: none
// END_CONTRACT: docsHeadTags
// START_BLOCK_DOCS_HEAD_TAGS
export function docsHeadTags (settings) {
  return [
    ['meta', { name: 'apple-itunes-app', content: `app-id=${APP_STORE_ID}` }],
    ['meta', { name: 'theme-color', content: '#F5EFE4', media: '(prefers-color-scheme: light)' }],
    ['meta', { name: 'theme-color', content: '#17191E', media: '(prefers-color-scheme: dark)' }],
    ['meta', { name: 'referrer', content: 'strict-origin-when-cross-origin' }],
    ['script', { type: 'application/ld+json' }, jsonLd(settings, {}, { websiteOnly: true })]
  ]
}
// END_BLOCK_DOCS_HEAD_TAGS

// START_CONTRACT: renderPage
//   PURPOSE: Turn a static site page template into servable HTML — the
//            shared head (per-page meta) in place of <!--SITE_HEAD--> and
//            the site base substituted for %BASE%. Used by the landing and
//            the C-58 /diagrams/ gallery.
//   INPUTS: { template: string - the page template, settings: resolveSiteSettings(),
//             page: { path, title, description } - sharedHeadTags page meta }
//   OUTPUTS: { string - HTML with the head injected and %BASE% substituted }
//   SIDE_EFFECTS: none; throws if the head placeholder is missing
// END_CONTRACT: renderPage
export function renderPage (template, settings, page = {}) {
  // START_BLOCK_RENDER_PAGE
  if (!template.includes(HEAD_PLACEHOLDER)) {
    throw new Error(`[SiteBuild][renderPage][BLOCK_RENDER_PAGE] template is missing ${HEAD_PLACEHOLDER}`)
  }
  return template
    .replace(HEAD_PLACEHOLDER, sharedHeadTags(settings, page))
    .replace(BASE_TOKEN, settings.base)
  // END_BLOCK_RENDER_PAGE
}

// START_CONTRACT: renderLanding
//   PURPOSE: Turn the landing template into the served root page.
//   INPUTS: { template: string - site/landing/index.html, settings: resolveSiteSettings() }
//   OUTPUTS: { string - HTML with %BASE% substituted, shared head injected,
//              every HTML comment stripped and leading whitespace trimmed,
//              so the output starts with <!doctype html> (C-64 T-006 S-4) }
//   SIDE_EFFECTS: none; throws if the head placeholder is missing
// END_CONTRACT: renderLanding
// START_BLOCK_RENDER_LANDING
const LANDING_COMMENT_RE = /<!--(?!\[if)[\s\S]*?-->/g

function stripLandingComments (html) {
  // The template's GRACE header and build notes are source-only markup;
  // the built page keeps IE-style conditional comments if any ever appear.
  return html.replace(LANDING_COMMENT_RE, '').replace(/^\s+/, '')
}

export function renderLanding (template, settings) {
  if (!template.includes(HEAD_PLACEHOLDER)) {
    throw new Error(`[SiteBuild][renderLanding][BLOCK_RENDER_LANDING] template is missing ${HEAD_PLACEHOLDER}`)
  }
  return stripLandingComments(
    template
      .replace(HEAD_PLACEHOLDER, renderSharedHead(settings))
      .replace(BASE_TOKEN, settings.base)
  )
}
// END_BLOCK_RENDER_LANDING

export function robotsTxt (settings) {
  return `User-agent: *\nAllow: /\n\nSitemap: ${settings.siteUrl}/sitemap.xml\n`
}

export function cnameFor (settings) {
  if (settings.base !== '/') return null
  const host = new URL(settings.siteUrl).hostname
  return host.endsWith('.github.io') ? null : host + '\n'
}
