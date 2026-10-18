// @vitest-environment node
// FILE: tests/site/head.test.mjs
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Verify the C-64 T-003 head/consent/analytics/SEO/CSP surface
//            — the shared head's SEO tags, the JSON-LD @graph (version from
//            the root package.json, '<' escaped), docsHeadTags, the GA4
//            consent.js+track.js pair, the llms.txt / security.txt
//            builders, and the meta CSP (exact-text sha256 hashing,
//            ld+json exclusion, provider host toggles, first-in-head
//            idempotent injection, tamper detection) plus the runtime
//            behaviour of public/track.js and public/consent.js booted on
//            fake window/document globals.
//   SCOPE: site/.vitepress/landing.mjs (jsonLd, sharedHeadTags,
//          docsHeadTags, analyticsTags, appVersion), site/scripts/csp.mjs,
//          site/scripts/seo-files.mjs, site/public/{consent.js,track.js}.
//   DEPENDS: Vitest (node env; scripts are evaluated via new Function with
//          injected globals, no DOM).
//   LINKS: M-053 SiteBuild; V-M-053; C-64 T-003 (R-5 meta, R-6, R-7, R-8,
//          R-9); corner-6, corner-7
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   PKG - root package.json (the one version source)
//   SETTINGS / BASE_SETTINGS / PROVIDERS - settings fixtures (root, /mark/, GA+CF)
//   PAGE - a small HTML fixture with one inline script, one ld+json, one external script
//   bootTrack - fake window/document + new Function(public/track.js) harness
//   bootConsent - fake window/document/localStorage + new Function(public/consent.js) harness
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - 2026-10-18 C-64 T-003: first version.
// END_CHANGE_SUMMARY

import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import {
  analyticsTags,
  appVersion,
  docsHeadTags,
  jsonLd,
  resolveSiteSettings,
  sharedHeadTags
} from '../../site/.vitepress/landing.mjs'
import { cspFor, injectCsp, verifyCsp } from '../../site/scripts/csp.mjs'
import { llmsTxt, securityTxt } from '../../site/scripts/seo-files.mjs'

const PKG = JSON.parse(readFileSync(resolve(import.meta.dirname, '../../package.json'), 'utf8'))
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
    expect(txt).toContain('brew tap xronocode/mark && brew install --cask mark')
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

function bootTrack ({ granted = false, withGtag = true } = {}) {
  const calls = []
  const docListeners = {}
  const document = { addEventListener (type, cb) { docListeners[type] = cb } }
  const window = {
    document,
    markConsent: { granted: () => granted },
    ...(withGtag ? { gtag: (...args) => calls.push(args) } : {})
  }
  new Function('window', 'document', TRACK_SRC)(window, document)
  return { calls, docListeners, window }
}

function clickOn (docListeners, el) {
  docListeners.click({ target: { closest: (sel) => (sel === '[data-track]' ? el : null) } })
}

const LINK = {
  getAttribute: (n) => ({ 'data-track': 'download_click', 'data-method': 'app_store', 'data-placement': 'hero' })[n] ?? null,
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

async function bootConsent ({ geo = { consent: false }, saved = null } = {}) {
  const dataLayer = []
  const created = []
  const docListeners = {}
  const winListeners = {}
  const document = {
    currentScript: {
      getAttribute: (n) => ({
        'data-ga': 'G-TEST00000',
        'data-geo': 'https://avenex.xronocode.com/api/geo',
        'data-privacy': '/privacy'
      })[n] ?? null
    },
    documentElement: { lang: 'en' },
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
    fetch: () => Promise.resolve({ json: () => Promise.resolve(geo) })
  }
  new Function('window', 'document', 'localStorage', 'setTimeout', CONSENT_SRC)(window, document, makeStorage(saved), () => 0)
  await new Promise((r) => setTimeout(r, 5))
  return { dataLayer, created, docListeners, winListeners, window }
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

  it('loads GA through the tag manager and configures it', () => {
    return bootConsent().then(({ dataLayer, created }) => {
      expect(created[0].src).toBe('https://www.googletagmanager.com/gtag/js?id=G-TEST00000')
      expect(dataLayer.some((c) => c[0] === 'config' && c[1] === 'G-TEST00000')).toBe(true)
    })
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
})
