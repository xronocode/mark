// FILE: site/.vitepress/landing.mjs
// VERSION: 1.2.0
// START_MODULE_CONTRACT
//   PURPOSE: Single source of site settings and the landing renderer shared by
//            the VitePress config (dev middleware + buildEnd) and unit tests.
//   SCOPE: resolve SITE_URL/SITE_BASE and analytics env (GA_MEASUREMENT_ID,
//          CF_BEACON_TOKEN, UMAMI_*) into settings; render the
//          landing template (base token + shared head); emit robots.txt and
//          CNAME content.
//   DEPENDS: none (pure functions over strings/env)
//   LINKS: M-053 SiteBuild; C-22; site/landing/index.html
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   SITE_META - product name/description/og image used by landing and docs
//   resolveSiteSettings - env -> { siteUrl, base, analytics[] }
//   GA_ID_RE / CF_TOKEN_RE - accepted id shapes, checked before inlining
//   analyticsTags - analytics[] -> [{ attrs, body }] script tags (landing + docs)
//   analyticsScript - analyticsTags serialized to HTML, '' when analytics is off
//   renderSharedHead - meta/OG/twitter/favicon/analytics HTML for the landing
//   renderLanding - template -> final landing HTML
//   robotsTxt - robots.txt body pointing at the sitemap
//   cnameFor - custom-domain CNAME body, or null for github.io/sub-path hosting
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: [v1.2.0 - analytics is a list; GA4, Cloudflare Web Analytics and Umami can run together]
//   PREV: [v1.1.0 - GA4 provider via GA_MEASUREMENT_ID]
//   PREV: [v1.0.0 - C-22: replaces the CI `cp` overlay and hard-coded /mark/ paths]
// END_CHANGE_SUMMARY

export const SITE_META = {
  name: 'Mark',
  title: 'Mark — The Markdown Editor for AI Agents',
  description:
    'Native WYSIWYG Markdown editor for macOS. 11 MB download, opens in under a second — built for reviewing what your AI agents write.',
  ogImage: 'showcase-00-rich-markdown.png',
  favicon: 'logo-96px.png'
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

// START_CONTRACT: analyticsTags
//   PURPOSE: One description of every analytics <script>, shared by the
//            landing (serialized) and the VitePress docs head (HeadConfig).
//   INPUTS: { analytics: resolveSiteSettings().analytics }
//   OUTPUTS: { Array<{ attrs: Record<string,string>, body: string }> }
//   SIDE_EFFECTS: none. GA ids passed GA_ID_RE, so inlining them is safe.
// END_CONTRACT: analyticsTags
export function analyticsTags (analytics = []) {
  return analytics.flatMap((a) => {
    if (a.provider === 'ga4') {
      return [
        { attrs: { async: '', src: `https://www.googletagmanager.com/gtag/js?id=${a.measurementId}` }, body: '' },
        { attrs: {}, body: `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','${a.measurementId}');` }
      ]
    }
    if (a.provider === 'cloudflare') {
      // Cookieless; SPA route changes are tracked by the beacon itself.
      return [{ attrs: { defer: '', src: 'https://static.cloudflareinsights.com/beacon.min.js', 'data-cf-beacon': JSON.stringify({ token: a.token }) }, body: '' }]
    }
    return [{ attrs: { defer: '', src: a.src, 'data-website-id': a.websiteId }, body: '' }]
  })
}

export function analyticsScript (analytics) {
  return analyticsTags(analytics).map(({ attrs, body }) => {
    const a = Object.entries(attrs).map(([k, v]) => (v === '' ? ` ${k}` : ` ${k}="${escapeAttr(v)}"`)).join('')
    return `<script${a}>${body}</script>`
  }).join('\n    ')
}

export function renderSharedHead (settings) {
  const { siteUrl, base } = settings
  const pageUrl = siteUrl + '/'
  const image = `${siteUrl}/${SITE_META.ogImage}`
  const tags = [
    `<meta name="description" content="${escapeAttr(SITE_META.description)}">`,
    `<link rel="canonical" href="${escapeAttr(pageUrl)}">`,
    `<link rel="icon" type="image/png" href="${base}${SITE_META.favicon}">`,
    `<link rel="apple-touch-icon" href="${base}${SITE_META.favicon}">`,
    '<meta name="theme-color" content="#07090c">',
    '<meta property="og:type" content="website">',
    `<meta property="og:site_name" content="${SITE_META.name}">`,
    `<meta property="og:title" content="${escapeAttr(SITE_META.title)}">`,
    `<meta property="og:description" content="${escapeAttr(SITE_META.description)}">`,
    `<meta property="og:url" content="${escapeAttr(pageUrl)}">`,
    `<meta property="og:image" content="${escapeAttr(image)}">`,
    '<meta name="twitter:card" content="summary_large_image">',
    `<meta name="twitter:image" content="${escapeAttr(image)}">`,
    analyticsScript(settings.analytics)
  ].filter(Boolean)
  return tags.join('\n    ')
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
