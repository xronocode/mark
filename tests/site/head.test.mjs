// @vitest-environment node
// FILE: tests/site/head.test.mjs
// VERSION: 1.2.0
// START_MODULE_CONTRACT
//   PURPOSE: Verify the C-64 head/consent/analytics/SEO/CSP/FAQ surface —
//            the shared head's SEO tags, the JSON-LD @graph (version from
//            the root package.json, install facts, publisher org, '<'
//            escaped), the docs BreadcrumbList, the FAQPage node against
//            site/guide/faq.md, docsHeadTags, the GA4 consent.js+track.js
//            pair, the llms.txt / security.txt builders, and the meta CSP
//            (exact-text sha256 hashing, ld+json exclusion, provider host
//            toggles, first-in-head idempotent injection, tamper
//            detection) plus the runtime behaviour of public/track.js and
//            public/consent.js (grant-gated GA load, undecided click
//            queue) booted on fake window/document globals.
//   SCOPE: site/.vitepress/landing.mjs (jsonLd, breadcrumbJsonLd, FAQ_ITEMS,
//          faqJsonLd, sharedHeadTags, docsHeadTags, analyticsTags,
//          appVersion), site/scripts/csp.mjs, site/scripts/seo-files.mjs,
//          site/guide/faq.md, site/public/{consent.js,track.js}.
//   DEPENDS: Vitest (node env; scripts are evaluated via new Function with
//          injected globals, no DOM).
//   LINKS: M-053 SiteBuild; V-M-053; C-64 T-003 (R-5 meta, R-6, R-7, R-8,
//          R-9), T-006, T-007 (M-2/P-1, G-2, G-1); corner-6, corner-7
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   PKG - root package.json (the one version source)
//   SETTINGS - default settings fixture (root base)
//   BASE_SETTINGS - /mark/ base settings fixture
//   PROVIDERS - settings fixture with GA + CF configured
//   TRACK_SRC - public/track.js source
//   OUTLINK - fake GitHub repository link element (outbound_click)
//   CONSENT_SRC - public/consent.js source
//   LINK - fake [data-track] element fixture
//   FAQ_MD - site/guide/faq.md source (the human-readable FAQ)
//   clickOn - dispatch a fake click through the captured document listener
//   makeStorage - fake localStorage with an optional saved consent value
//   bootTrack - fake window/document + new Function(public/track.js) harness (captures consent onChange listeners, flips granted/decided via set())
//   bootConsent - fake window/document/localStorage + new Function(public/consent.js) harness
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: [v1.2.0 - 2026-10-18 C-64 T-007: consent.js never injects
//                 the gtag script while undecided/denied (only a saved
//                 grant, the geo auto-grant or the Allow click schedules
//                 it — still load + idle) and exposes decided(); track.js
//                 queues undecided events in memory (flushed on grant,
//                 cleared on deny, capped at 10); the SoftwareApplication
//                 node gains screenshot/fileSize/softwareRequirements/
//                 releaseNotes + an author/publisher Organization;
//                 breadcrumbJsonLd and FAQ_ITEMS/faqJsonLd (pinned against
//                 site/guide/faq.md) are covered.]
//   PREV: [v1.1.0 - 2026-10-18 C-64 T-006: llms.txt pins the tap-free
//                 brew one-liner; track.js gains an outbound_click
//                 (link_target + placement) case; the consent harness
//                 captures injected setTimeouts and requestIdleCallback
//                 slots, and the GA tests assert the gtag script injects
//                 only after window load + an idle slot (2 s timeout
//                 fallback).]
//   PREV: [v1.0.0 - 2026-10-18 C-64 T-003: first version.]
// END_CHANGE_SUMMARY

import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import {
  analyticsTags,
  appVersion,
  breadcrumbJsonLd,
  docsHeadTags,
  faqJsonLd,
  jsonLd,
  resolveSiteSettings,
  sharedHeadTags
} from '../../site/.vitepress/landing.mjs'
import { cspFor, injectCsp, verifyCsp } from '../../site/scripts/csp.mjs'
import { llmsTxt, securityTxt } from '../../site/scripts/seo-files.mjs'

const PKG = JSON.parse(readFileSync(resolve(import.meta.dirname, '../../package.json'), 'utf8'))
const FAQ_MD = readFileSync(resolve(import.meta.dirname, '../../site/guide/faq.md'), 'utf8')
const SETTINGS = resolveSiteSettings({})
const BASE_SETTINGS = resolveSiteSettings({ SITE_URL: 'https://xronocode.github.io/mark', SITE_BASE: 'mark' })
const PROVIDERS = resolveSiteSettings({
  GA_MEASUREMENT_ID: 'G-KW57Y3CRPY',
  CF_BEACON_TOKEN: '0123456789abcdef0123456789abcdef'
}).analytics

describe('appVersion', () => {
  it('reads the version from the root package.json (one source)', () => {
    expect(appVersion()).toBe(PKG.version)
  })
})

describe('jsonLd', () => {
  it('builds a SoftwareApplication + WebSite graph with the install facts', () => {
    const ld = JSON.parse(jsonLd(SETTINGS))
    expect(ld['@context']).toBe('https://schema.org')
    expect(ld['@graph'].map((n) => n['@type'])).toEqual(['SoftwareApplication', 'WebSite'])
    const app = ld['@graph'][0]
    expect(app.name).toBe('Mark')
    expect(app.softwareVersion).toBe(PKG.version)
    expect(app.applicationCategory).toBe('DeveloperApplication')
    expect(app.operatingSystem).toBe('macOS, Windows')
    expect(app.offers).toEqual({ '@type': 'Offer', price: '0', priceCurrency: 'USD' })
    expect(app.downloadUrl).toContain('https://apps.apple.com/app/id6814590464')
    expect(app.downloadUrl).toContain('https://github.com/xronocode/mark/releases/latest')
    expect(app.installUrl).toBe('https://apps.apple.com/app/id6814590464')
    expect(app.image).toBe('https://mark.xronocode.com/og-card.png')
    expect(app.license).toBe('https://opensource.org/licenses/MIT')
    expect(app.sameAs).toContain('https://github.com/xronocode/mark')
    expect(ld['@graph'][1].url).toBe('https://mark.xronocode.com/')
  })

  it('adds the C-64 T-007 G-2 facts: screenshot, DMG size, requirements, release notes, publisher', () => {
    const app = JSON.parse(jsonLd(SETTINGS))['@graph'][0]
    expect(app.screenshot).toBe('https://mark.xronocode.com/shots/01-agents.jpg')
    // The landing's "≈ 15 MB" DMG figure; the repo states no Windows minimum,
    // so softwareRequirements stays macOS-only.
    expect(app.fileSize).toBe('15MB')
    expect(app.softwareRequirements).toBe('macOS 12 or later')
    expect(app.releaseNotes).toBe('https://mark.xronocode.com/changelog')
    const org = {
      '@type': 'Organization',
      name: 'xronocode',
      url: 'https://mark.xronocode.com/',
      logo: 'https://mark.xronocode.com/mark-icon.svg',
      sameAs: ['https://github.com/xronocode/mark']
    }
    expect(app.author).toEqual(org)
    expect(app.publisher).toEqual(org)
    expect(JSON.parse(jsonLd(SETTINGS))['@graph'][1].publisher).toEqual(org)
  })

  it('escapes < so the JSON cannot close its own script host', () => {
    const raw = jsonLd(SETTINGS, { description: 'a <script>alert(1)</script> b' })
    expect(raw).not.toContain('<')
    expect(JSON.parse(raw)['@graph'][0].description).toBe('a <script>alert(1)</script> b')
  })

  it('can emit the WebSite node only (docs pages)', () => {
    const ld = JSON.parse(jsonLd(SETTINGS, {}, { websiteOnly: true }))
    expect(ld['@graph'].map((n) => n['@type'])).toEqual(['WebSite'])
  })
})

describe('breadcrumbJsonLd (docs pages, C-64 T-007 G-2)', () => {
  it('builds Home → Guide → page, collapsing to two crumbs on the section index', () => {
    const ld = JSON.parse(breadcrumbJsonLd(SETTINGS, { path: 'guide/installation', title: 'Installation' }))
    expect(ld['@type']).toBe('BreadcrumbList')
    expect(ld.itemListElement.map((i) => i.name)).toEqual(['Home', 'Guide', 'Installation'])
    expect(ld.itemListElement[0].item).toBe('https://mark.xronocode.com/')
    expect(ld.itemListElement[1].item).toBe('https://mark.xronocode.com/guide/')
    expect(ld.itemListElement[2].item).toBe('https://mark.xronocode.com/guide/installation')
    const idx = JSON.parse(breadcrumbJsonLd(SETTINGS, { path: 'guide/', title: 'Guide' }))
    expect(idx.itemListElement.map((i) => i.name)).toEqual(['Home', 'Guide'])
  })

  it("escapes '<' like every ld+json body this module emits", () => {
    expect(breadcrumbJsonLd(SETTINGS, { path: 'guide/a<b', title: 'T<i>' })).not.toContain('<')
  })
})

describe('FAQ page + FAQPage JSON-LD (C-64 T-007 G-1)', () => {
  const questions = (FAQ_MD.match(/^## /gm) || []).length

  it('exists as a guide page with at least 8 questions', () => {
    expect(questions).toBeGreaterThanOrEqual(8)
  })

  it('mirrors exactly the markdown questions and answers in plain text', () => {
    const ld = JSON.parse(faqJsonLd())
    expect(ld['@type']).toBe('FAQPage')
    expect(ld.mainEntity).toHaveLength(questions)
    for (const q of ld.mainEntity) {
      expect(FAQ_MD, q.name).toContain(q.name)
      expect(q.acceptedAnswer.text, q.name).not.toMatch(/[[\]]|\*\*/)
    }
  })

  it("escapes '<' in questions and answers", () => {
    expect(faqJsonLd([{ q: 'a <b>', a: 'c <d>' }])).not.toContain('<')
    expect(JSON.parse(faqJsonLd([{ q: 'a <b>', a: 'c <d>' }])).mainEntity[0].name).toBe('a <b>')
  })
})

describe('sharedHeadTags', () => {
  const head = sharedHeadTags(SETTINGS, { path: 'diagrams/', title: 'T', description: 'D' })

  it('carries the App Store banner, brand theme-color pair and referrer policy', () => {
    expect(head).toContain('<meta name="apple-itunes-app" content="app-id=6814590464">')
    expect(head).toContain('<meta name="theme-color" content="#F5EFE4" media="(prefers-color-scheme: light)">')
    expect(head).toContain('<meta name="theme-color" content="#17191E" media="(prefers-color-scheme: dark)">')
    expect(head).not.toContain('#07090c')
    expect(head).toContain('<meta name="referrer" content="strict-origin-when-cross-origin">')
  })

  it('pairs hreflang en and x-default with the canonical URL', () => {
    expect(head).toContain('<link rel="canonical" href="https://mark.xronocode.com/diagrams/">')
    expect(head).toContain('<link rel="alternate" hreflang="en" href="https://mark.xronocode.com/diagrams/">')
    expect(head).toContain('<link rel="alternate" hreflang="x-default" href="https://mark.xronocode.com/diagrams/">')
  })

  it('points OG/Twitter at the brand card with dimensions and alt', () => {
    expect(head).toContain('<meta property="og:image" content="https://mark.xronocode.com/og-card.png">')
    expect(head).toContain('<meta property="og:image:width" content="1200">')
    expect(head).toContain('<meta property="og:image:height" content="630">')
    expect(head).toContain('og:image:alt')
    expect(head).toContain('<meta name="twitter:card" content="summary_large_image">')
  })

  it('embeds parseable JSON-LD at the released version', () => {
    const body = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(head)?.[1]
    expect(JSON.parse(body)['@graph'][0].softwareVersion).toBe(PKG.version)
  })
})

describe('docsHeadTags', () => {
  it('is the docs subset: banner, theme pair, referrer, WebSite-only JSON-LD', () => {
    const tags = docsHeadTags(SETTINGS)
    expect(tags[0]).toEqual(['meta', { name: 'apple-itunes-app', content: 'app-id=6814590464' }])
    expect(tags).toContainEqual(['meta', { name: 'theme-color', content: '#F5EFE4', media: '(prefers-color-scheme: light)' }])
    expect(tags).toContainEqual(['meta', { name: 'theme-color', content: '#17191E', media: '(prefers-color-scheme: dark)' }])
    expect(tags).toContainEqual(['meta', { name: 'referrer', content: 'strict-origin-when-cross-origin' }])
    const ld = tags.find(([tag]) => tag === 'script')
    expect(ld[1]).toEqual({ type: 'application/ld+json' })
    expect(JSON.parse(ld[2])['@graph'].map((n) => n['@type'])).toEqual(['WebSite'])
  })
})

describe('analyticsTags', () => {
  it('loads track.js beside consent.js for GA4 only, base-aware', () => {
    expect(analyticsTags([])).toEqual([])
    const tags = analyticsTags([{ provider: 'ga4', measurementId: 'G-KW57Y3CRPY' }], '/mark/')
    expect(tags[0].attrs.src).toBe('/mark/consent.js')
    expect(tags[0].attrs['data-ga']).toBe('G-KW57Y3CRPY')
    expect(tags[0].attrs['data-geo']).toBe('https://avenex.xronocode.com/api/geo')
    expect(tags[1]).toEqual({ attrs: { defer: '', src: '/mark/track.js' }, body: '' })
  })
})

describe('cspFor / injectCsp / verifyCsp', () => {
  const TEXT = "console.log('hi');\n"
  const HASH = createHash('sha256').update(TEXT, 'utf8').digest('base64')
  const PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>t</title><script>${TEXT}</script><script type="application/ld+json">{"a":"<b>"}</script><script src="/app.js"></script></head><body></body></html>`

  it('hashes the exact inline script text and excludes ld+json / external scripts', () => {
    const policy = cspFor(PAGE)
    expect(policy).toContain(`'sha256-${HASH}'`)
    expect(policy.match(/'sha256-/g)).toHaveLength(1)
    expect(policy).toContain("default-src 'self'")
    expect(policy).toContain("style-src 'self' 'unsafe-inline'")
    expect(policy).toContain('upgrade-insecure-requests')
    expect(policy).toContain("connect-src 'self' https://avenex.xronocode.com")
    expect(policy).not.toContain('frame-ancestors')
  })

  it('adds analytics hosts only when the providers are configured', () => {
    const off = cspFor(PAGE)
    expect(off).not.toContain('googletagmanager.com')
    expect(off).not.toContain('cloudflareinsights.com')
    const on = cspFor(PAGE, { analytics: PROVIDERS })
    expect(on).toContain('https://www.googletagmanager.com')
    expect(on).toContain('https://static.cloudflareinsights.com')
    expect(on).toContain('https://*.analytics.google.com')
    expect(on).toContain('https://cloudflareinsights.com')
    expect(on).toMatch(/img-src [^;]*data:/)
  })

  it('injects the meta as the first child of <head>, before any script, idempotently', () => {
    const withCsp = injectCsp(PAGE)
    expect(withCsp.indexOf('<head>')).toBeLessThan(withCsp.indexOf('<meta http-equiv="Content-Security-Policy"'))
    expect(withCsp.indexOf('<meta http-equiv="Content-Security-Policy"')).toBeLessThan(withCsp.indexOf('<script'))
    expect(withCsp.slice(withCsp.indexOf('<head>') + '<head>'.length).startsWith('<meta http-equiv="Content-Security-Policy"')).toBe(true)
    expect(injectCsp(withCsp)).toBe(withCsp)
    expect(verifyCsp(withCsp)).toEqual([])
  })

  it('replaces an existing CSP meta instead of stacking a second one', () => {
    const stale = PAGE.replace('<meta charset="utf-8">', '<meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src self">')
    const fixed = injectCsp(stale)
    expect(fixed.match(/<meta http-equiv="Content-Security-Policy"/g)).toHaveLength(1)
    expect(fixed).toContain(`'sha256-${HASH}'`)
  })

  it('verifyCsp flags a tampered inline script and a missing meta', () => {
    const withCsp = injectCsp(PAGE)
    const tampered = withCsp.replace(TEXT, "console.log('pwned');\n")
    expect(verifyCsp(tampered)).toHaveLength(1)
    expect(verifyCsp(tampered)[0]).toMatch(/^sha256-/)
    expect(verifyCsp(PAGE)).toHaveLength(1)
  })
})

describe('llmsTxt / securityTxt', () => {
  it('builds llms.txt with the install facts and only absolute doc links', () => {
    const txt = llmsTxt(BASE_SETTINGS)
    expect(txt.startsWith('# Mark')).toBe(true)
    for (const section of ['## Install', '## Docs', '## Source']) expect(txt).toContain(section)
    expect(txt).toContain('brew install --cask xronocode/mark/mark')
    expect(txt).toContain('https://apps.apple.com/app/id6814590464')
    expect(txt).toContain('https://github.com/xronocode/mark/releases/latest')
    const links = [...txt.matchAll(/\((https:\/\/[^)]+)\)/g)].map((m) => m[1])
    expect(links.length).toBeGreaterThanOrEqual(11)
    for (const link of links) expect(link.startsWith('https://xronocode.github.io/mark/')).toBe(true)
  })

  it('builds security.txt with a 365-day expiry after now', () => {
    const now = new Date('2026-10-18T12:00:00.000Z')
    const txt = securityTxt(SETTINGS, now)
    expect(txt).toContain('Contact: https://github.com/xronocode/mark/security/advisories/new')
    expect(txt).toContain('Canonical: https://mark.xronocode.com/.well-known/security.txt')
    expect(txt).toContain('Preferred-Languages: en, ru')
    expect(txt).toContain('Policy: https://github.com/xronocode/mark/security/policy')
    expect(Date.parse(/Expires: (\S+)/.exec(txt)[1])).toBe(now.getTime() + 365 * 24 * 60 * 60 * 1000)
  })
})

/* ---------- public/track.js on fake globals (no DOM) ---------- */

const TRACK_SRC = readFileSync(resolve(import.meta.dirname, '../../site/public/track.js'), 'utf8')

function bootTrack ({ granted = false, decided = true, withGtag = true } = {}) {
  const calls = []
  const docListeners = {}
  const consentListeners = []
  const document = { addEventListener (type, cb) { docListeners[type] = cb } }
  const markConsent = {
    granted: () => granted,
    // A harness without `decided` (undefined) behaves like a decided state,
    // matching embeds that run an older consent.js: undecided() is false.
    ...(decided === null ? {} : { decided: () => decided }),
    onChange: (cb) => { consentListeners.push(cb) }
  }
  const window = {
    document,
    markConsent,
    ...(withGtag ? { gtag: (...args) => calls.push(args) } : {})
  }
  new Function('window', 'document', TRACK_SRC)(window, document)
  return {
    calls,
    docListeners,
    window,
    consentListeners,
    set: (g, d) => { granted = g; decided = d }
  }
}

function clickOn (docListeners, el) {
  docListeners.click({ target: { closest: (sel) => (sel === '[data-track]' ? el : null) } })
}

const LINK = {
  getAttribute: (n) => ({ 'data-track': 'download_click', 'data-method': 'app_store', 'data-placement': 'hero' })[n] ?? null,
  hasAttribute: () => false
}

const OUTLINK = {
  getAttribute: (n) => ({ 'data-track': 'outbound_click', 'data-target': 'github', 'data-placement': 'nav' })[n] ?? null,
  hasAttribute: () => false
}

describe('public/track.js', () => {
  it('sends download_click with method/placement and beacon transport, only when granted', () => {
    const off = bootTrack({ granted: false })
    clickOn(off.docListeners, LINK)
    expect(off.calls).toEqual([])
    const on = bootTrack({ granted: true })
    clickOn(on.docListeners, LINK)
    expect(on.calls).toHaveLength(1)
    expect(on.calls[0]).toEqual(['event', 'download_click', { method: 'app_store', placement: 'hero', transport_type: 'beacon' }])
  })

  it('waits for the is-copied signal on copy buttons before firing', () => {
    const on = bootTrack({ granted: true })
    let copied = false
    const copyButton = {
      classList: { contains: (c) => c === 'is-copied' && copied },
      getAttribute: (n) => ({ 'data-track': 'download_click', 'data-method': 'homebrew_copy', 'data-placement': 'install' })[n] ?? null,
      hasAttribute: (n) => n === 'data-copy'
    }
    vi.useFakeTimers()
    try {
      clickOn(on.docListeners, copyButton)
      expect(on.calls).toHaveLength(0)
      copied = true
      vi.advanceTimersByTime(150)
      expect(on.calls).toHaveLength(1)
      expect(on.calls[0][2]).toMatchObject({ method: 'homebrew_copy', placement: 'install' })
    } finally {
      vi.useRealTimers()
    }
  })

  it('sends outbound_click with link_target and placement (C-64 T-006 M-1)', () => {
    const off = bootTrack({ granted: false })
    clickOn(off.docListeners, OUTLINK)
    expect(off.calls).toEqual([])
    const on = bootTrack({ granted: true })
    clickOn(on.docListeners, OUTLINK)
    expect(on.calls).toHaveLength(1)
    expect(on.calls[0]).toEqual(['event', 'outbound_click', { link_target: 'github', placement: 'nav', transport_type: 'beacon' }])
  })

  it('markTrack sends code-driven events and is a no-op without gtag or consent', () => {
    const on = bootTrack({ granted: true })
    on.window.markTrack('share_to_mac', { result: 'shared' })
    expect(on.calls[0]).toEqual(['event', 'share_to_mac', { result: 'shared', transport_type: 'beacon' }])
    expect(bootTrack({ granted: true, withGtag: false }).window.markTrack('share_to_mac', {})).toBe(false)
    expect(bootTrack({ granted: false }).window.markTrack('share_to_mac', {})).toBe(false)
  })

  it('ignores non-tracked clicks without throwing', () => {
    const on = bootTrack({ granted: true })
    expect(() => on.docListeners.click({ target: {} })).not.toThrow()
    expect(on.calls).toHaveLength(0)
  })

  it('queues undecided events in memory and flushes them on grant (C-64 T-007 P-1)', () => {
    const t = bootTrack({ granted: false, decided: false })
    clickOn(t.docListeners, LINK)
    clickOn(t.docListeners, OUTLINK)
    expect(t.calls).toEqual([])
    t.set(true, true)                                    // the visitor clicked Allow
    for (const cb of t.consentListeners) cb(true)
    expect(t.calls.map((c) => c[1])).toEqual(['download_click', 'outbound_click'])
    expect(t.calls[0][2]).toMatchObject({ method: 'app_store', placement: 'hero', transport_type: 'beacon' })
    // Nothing was stored anywhere: the flush happened purely in page memory.
    expect(t.window.markTrack('share_to_mac', { result: 'shared' })).toBe(true)
    expect(t.calls).toHaveLength(3)
  })

  it('clears the queue on deny and drops events fired after an explicit deny', () => {
    const t = bootTrack({ granted: false, decided: false })
    clickOn(t.docListeners, LINK)
    for (const cb of t.consentListeners) cb(false)       // deny: the held event is discarded
    t.set(false, true)                                   // the deny made the choice explicit
    clickOn(t.docListeners, LINK)                        // decided-denied: dropped, not queued
    t.set(true, true)                                    // a later re-grant has nothing to flush
    for (const cb of t.consentListeners) cb(true)
    expect(t.calls).toEqual([])
  })

  it('caps the undecided queue at 10 events', () => {
    const t = bootTrack({ granted: false, decided: false })
    for (let i = 0; i < 12; i++) t.window.markTrack('share_to_mac', { result: 'shared' })
    t.set(true, true)
    for (const cb of t.consentListeners) cb(true)
    expect(t.calls).toHaveLength(10)
  })
})

/* ---------- public/consent.js on fake globals (no DOM) ---------- */

const CONSENT_SRC = readFileSync(resolve(import.meta.dirname, '../../site/public/consent.js'), 'utf8')

function makeStorage (initial) {
  const map = initial ? { 'consent.v1': initial } : {}
  return {
    getItem: (k) => (k in map ? map[k] : null),
    setItem: (k, v) => { map[k] = String(v) }
  }
}

async function bootConsent ({ geo = { consent: false }, saved = null, noRic = false } = {}) {
  const dataLayer = []
  const created = []
  const docListeners = {}
  const winListeners = {}
  const timeouts = []
  const idle = []
  const document = {
    currentScript: {
      getAttribute: (n) => ({
        'data-ga': 'G-TEST00000',
        'data-geo': 'https://avenex.xronocode.com/api/geo',
        'data-privacy': '/privacy'
      })[n] ?? null
    },
    documentElement: { lang: 'en', appendChild () {} },
    addEventListener: (t, cb) => { docListeners[t] = cb },
    getElementById: () => null,
    createElement: () => {
      const node = { style: {}, setAttribute () {}, appendChild () {}, remove () {} }
      created.push(node)
      return node
    },
    head: { appendChild () {} },
    querySelector: () => null
  }
  const window = {
    document,
    dataLayer,
    gtag: function (...args) { dataLayer.push(args) },
    addEventListener: (t, cb) => { winListeners[t] = cb },
    removeEventListener: () => {},
    fetch: () => Promise.resolve({ json: () => Promise.resolve(geo) }),
    ...(noRic ? {} : { requestIdleCallback: (fn, opts) => { idle.push({ fn, opts }); return idle.length } })
  }
  window.__flushIdle = () => { while (idle.length) idle.shift().fn() }
  // consent.js calls the bare fetch global: hand it the fake, never the network.
  new Function('window', 'document', 'localStorage', 'setTimeout', 'fetch', CONSENT_SRC)(
    window, document, makeStorage(saved), (fn, ms) => { timeouts.push({ fn, ms }); return 0 }, window.fetch
  )
  await new Promise((r) => setTimeout(r, 5))
  return { dataLayer, created, docListeners, winListeners, window, timeouts }
}

describe('public/consent.js', () => {
  it('defaults every consent signal to denied with wait_for_update', () => {
    return bootConsent().then(({ dataLayer }) => {
      const call = dataLayer.find((c) => c[0] === 'consent' && c[1] === 'default')
      expect(call).toBeTruthy()
      expect(call[2]).toMatchObject({ ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied', analytics_storage: 'denied', wait_for_update: 1500 })
    })
  })

  it('auto-grants analytics (never advertising) outside the gate and exposes markConsent', () => {
    return bootConsent().then(({ dataLayer, window }) => {
      const updates = dataLayer.filter((c) => c[0] === 'consent' && c[1] === 'update')
      expect(updates.at(-1)[2]).toEqual({ ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied', analytics_storage: 'granted' })
      expect(window.markConsent.granted()).toBe(true)
      expect(window.avenexConsent).toBe(window.markConsent)
      expect(window.avenexConsent.required).toBe(false)
    })
  })

  it('injects the gtag script only after window load plus an idle slot (C-64 T-006 R-1)', async () => {
    const { dataLayer, created, winListeners, window } = await bootConsent()
    // The boot auto-grant primes js/config into dataLayer — a local push
    // that makes no request (C-64 T-007 M-2); the script tag itself still
    // waits for window load + an idle slot, so nothing is fetched on the
    // critical path.
    expect(created.length).toBe(0)
    expect(dataLayer.some((c) => c[0] === 'config' && c[1] === 'G-TEST00000')).toBe(true)
    winListeners.load()
    expect(created.length).toBe(0)             // load fired, still waiting for idle
    window.__flushIdle()
    expect(created[0].src).toBe('https://www.googletagmanager.com/gtag/js?id=G-TEST00000')
  })

  it('falls back to a 2 s setTimeout when requestIdleCallback is missing', async () => {
    const { created, winListeners, timeouts } = await bootConsent({ noRic: true })
    winListeners.load()
    const slot = timeouts.find((t) => t.ms === 2000)
    expect(slot).toBeTruthy()
    expect(created.length).toBe(0)
    slot.fn()
    expect(created[0].src).toBe('https://www.googletagmanager.com/gtag/js?id=G-TEST00000')
  })

  it('arms the delayed card inside the gate and never shows it on boot', () => {
    return bootConsent({ geo: { consent: true } }).then(({ window, docListeners }) => {
      expect(window.markConsent.granted()).toBe(false)
      expect(window.avenexConsent.required).toBe(true)
      expect(docListeners.DOMContentLoaded).toBeUndefined()
    })
  })

  it('keeps a saved denial instead of re-asking', () => {
    return bootConsent({ saved: 'denied' }).then(({ dataLayer, window }) => {
      expect(window.markConsent.granted()).toBe(false)
      expect(dataLayer.filter((c) => c[0] === 'consent' && c[1] === 'update').at(-1)[2].analytics_storage).toBe('denied')
    })
  })

  it('never injects the gtag script while the card is unanswered (C-64 T-007 M-2)', async () => {
    const { created, dataLayer, winListeners, window, timeouts } = await bootConsent({ geo: { consent: true } })
    winListeners.load?.()
    window.__flushIdle()
    for (const t of timeouts) t.fn()          // even the delayed card-show timer must not fetch GA
    expect(created.filter((n) => n.src)).toEqual([])
    expect(dataLayer.some((c) => c[0] === 'js' || c[0] === 'config')).toBe(false)
  })

  it('never injects the gtag script after a saved denial (C-64 T-007 M-2)', async () => {
    const { created, dataLayer, winListeners, window, timeouts } = await bootConsent({ saved: 'denied' })
    winListeners.load?.()
    window.__flushIdle()
    for (const t of timeouts) t.fn()
    expect(created.filter((n) => n.src)).toEqual([])
    expect(dataLayer.some((c) => c[0] === 'js' || c[0] === 'config')).toBe(false)
  })

  it('injects the gtag script at boot only on a saved grant (still load + idle)', async () => {
    const { created, dataLayer, winListeners, window } = await bootConsent({ saved: 'granted' })
    expect(created.length).toBe(0)
    // js/config are primed into dataLayer at boot (local push, no request),
    // so even a pre-load click keeps the js → config → events order.
    expect(dataLayer.some((c) => c[0] === 'config' && c[1] === 'G-TEST00000')).toBe(true)
    winListeners.load()
    expect(created.length).toBe(0)
    window.__flushIdle()
    expect(created[0].src).toBe('https://www.googletagmanager.com/gtag/js?id=G-TEST00000')
  })

  it('schedules GA when the visitor clicks Allow in the gated card (decide → loadGA)', async () => {
    const { created, dataLayer, winListeners, window } = await bootConsent({ geo: { consent: true } })
    // track.js flushes through the same onChange listeners: prove js/config
    // land in dataLayer before any grant listener can push events.
    window.markConsent.onChange(function (on) { if (on) dataLayer.push(['marker', 'listener-ran']) })
    window.markConsent.open()
    const allow = created.find((n) => n.className === 'y')
    allow.onclick()
    expect(window.markConsent.granted()).toBe(true)
    expect(window.markConsent.decided()).toBe(true)
    const configAt = dataLayer.findIndex((c) => c[0] === 'config')
    expect(configAt).toBeGreaterThanOrEqual(0)
    expect(dataLayer.findIndex((c) => c[0] === 'marker')).toBeGreaterThan(configAt)
    winListeners.load()
    window.__flushIdle()
    const scripts = created.filter((n) => n.src)
    expect(scripts).toHaveLength(1)
    expect(scripts[0].src).toBe('https://www.googletagmanager.com/gtag/js?id=G-TEST00000')
  })

  it('exposes decided(): false only while the card is unanswered', async () => {
    const gated = await bootConsent({ geo: { consent: true } })
    expect(gated.window.markConsent.decided()).toBe(false)
    const auto = await bootConsent()
    expect(auto.window.markConsent.decided()).toBe(true)
    const savedDeny = await bootConsent({ saved: 'denied' })
    expect(savedDeny.window.markConsent.decided()).toBe(true)
    const savedGrant = await bootConsent({ saved: 'granted' })
    expect(savedGrant.window.markConsent.decided()).toBe(true)
  })
})
