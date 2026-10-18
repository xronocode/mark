// FILE: site/.vitepress/landing.mjs
// VERSION: 1.5.0
// START_MODULE_CONTRACT
//   PURPOSE: Single source of site settings and the static-page renderers
//            shared by the VitePress config (dev middleware + buildEnd) and
//            unit tests.
//   SCOPE: resolve SITE_URL/SITE_BASE and analytics env (GA_MEASUREMENT_ID,
//          CF_BEACON_TOKEN, UMAMI_*) into settings; render static pages
//          (landing + the C-58 /diagrams/ gallery) from templates with the
//          shared head (per-page canonical/OG, hreflang, apple-itunes-app,
//          theme-color pair, referrer, JSON-LD @graph) and base token; emit
//          robots.txt and CNAME content; expose the docs-only head list and
//          the app version read from the root package.json.
//   DEPENDS: node:fs (appVersion reads the root package.json; everything
//            else stays pure over strings/env)
//   LINKS: M-053 SiteBuild; C-22; C-58; C-64 T-003;
//          site/landing/index.html; site/public/{consent.js,track.js};
//          site/scripts/{build-gallery.mjs,check-dist.mjs,csp.mjs} (consumers)
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   SITE_META - product name/description/og image used by landing and docs
//   APP_STORE_ID / APP_STORE_URL / GITHUB_REPO / GITHUB_RELEASES - install facts shared by head, JSON-LD and llms.txt
//   appVersion - memoized read of the root package.json version (one source for softwareVersion)
//   resolveSiteSettings - env -> { siteUrl, base, analytics[] }
//   GA_ID_RE - accepted GA4 measurement id shape, checked before inlining
//   CF_TOKEN_RE - accepted Cloudflare beacon token shape, checked before inlining
//   CONSENT_GEO_URL - shared country lookup that decides whether the cookie banner is needed
//   analyticsTags - analytics[], base -> [{ attrs, body }] script tags (landing + docs; GA4 adds consent.js + track.js)
//   analyticsScript - analyticsTags serialized to HTML, '' when analytics is off
//   jsonLd - settings + page -> JSON-LD @graph body (SoftwareApplication + WebSite; '<' escaped)
//   sharedHeadTags - settings + { path, title, description } -> meta/OG/twitter/favicon/JSON-LD/analytics HTML
//   docsHeadTags - settings -> VitePress HeadConfig list for the docs pages (WebSite JSON-LD only)
//   renderSharedHead - sharedHeadTags for the site root (landing default meta)
//   renderPage - template + settings + page meta -> final HTML (head + base)
//   renderLanding - template -> final landing HTML (renderPage with root meta)
//   robotsTxt - robots.txt body pointing at the sitemap
//   cnameFor - custom-domain CNAME body, or null for github.io/sub-path hosting
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: [v1.5.0 - 2026-10-18 C-64 T-003: the shared head carries the
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
    APP_VERSION = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).version
  }
  return APP_VERSION
}

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
        attrs: { defer: '', src: `${base}consent.js`, 'data-ga': a.measurementId, 'data-geo': CONSENT_GEO_URL, 'data-privacy': `${base}privacy` },
        body: ''
      }, {
        attrs: { defer: '', src: `${base}track.js` },
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
  const software = {
    '@type': 'SoftwareApplication',
    name: SITE_META.name,
    description: page.description ?? SITE_META.description,
    applicationCategory: 'DeveloperApplication',
    operatingSystem: 'macOS, Windows',
    softwareVersion: appVersion(),
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    downloadUrl: [APP_STORE_URL, GITHUB_RELEASES],
    installUrl: APP_STORE_URL,
    image: `${settings.siteUrl}/${SITE_META.ogImage}`,
    license: 'https://opensource.org/licenses/MIT',
    sameAs: [GITHUB_REPO]
  }
  const website = {
    '@type': 'WebSite',
    url: settings.siteUrl + '/',
    name: SITE_META.name,
    publisher: { '@type': 'Organization', name: 'xronocode', url: GITHUB_REPO }
  }
  const graph = opts.websiteOnly ? [website] : [software, website]
  return JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }).replace(/</g, '\\u003c')
}
// END_BLOCK_JSON_LD

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
  const image = `${siteUrl}/${SITE_META.ogImage}`
  const tags = [
    `<meta name="description" content="${escapeAttr(description)}">`,
    `<link rel="canonical" href="${escapeAttr(pageUrl)}">`,
    `<link rel="alternate" hreflang="en" href="${escapeAttr(pageUrl)}">`,
    `<link rel="alternate" hreflang="x-default" href="${escapeAttr(pageUrl)}">`,
    `<link rel="icon" type="image/png" href="${base}${SITE_META.favicon}">`,
    `<link rel="apple-touch-icon" href="${base}${SITE_META.favicon}">`,
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
//   OUTPUTS: { string - HTML with %BASE% substituted and shared head injected }
//   SIDE_EFFECTS: none; throws if the head placeholder is missing
// END_CONTRACT: renderLanding
export function renderLanding (template, settings) {
  // START_BLOCK_RENDER_LANDING
  if (!template.includes(HEAD_PLACEHOLDER)) {
    throw new Error(`[SiteBuild][renderLanding][BLOCK_RENDER_LANDING] template is missing ${HEAD_PLACEHOLDER}`)
  }
  return template
    .replace(HEAD_PLACEHOLDER, renderSharedHead(settings))
    .replace(BASE_TOKEN, settings.base)
  // END_BLOCK_RENDER_LANDING
}

export function robotsTxt (settings) {
  return `User-agent: *\nAllow: /\n\nSitemap: ${settings.siteUrl}/sitemap.xml\n`
}

export function cnameFor (settings) {
  if (settings.base !== '/') return null
  const host = new URL(settings.siteUrl).hostname
  return host.endsWith('.github.io') ? null : host + '\n'
}
