// @vitest-environment node
// FILE: tests/site/analytics.test.mjs
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Verify the C-SITE-COUNTERS contract — the collector settings
//            resolved from the public key, one tag description shared by the
//            docs head and the landing, the CSP connect-src allowance derived
//            from the same endpoint, and the runtime behaviour of
//            public/analytics.js (no request without a key, one beacon batch
//            to the configured endpoint carrying the key and a pageview).
//   SCOPE: site/.vitepress/landing.mjs (resolveSiteSettings, collectTags,
//          collectScript, DEFAULT_COLLECT_ENDPOINT, COLLECT_KEY_RE),
//          site/scripts/csp.mjs (cspFor), site/public/analytics.js booted on
//          fake browser globals via new Function.
//   DEPENDS: Vitest (node env), the site modules under test.
//   LINKS: M-053 SiteBuild; V-M-053 scenario-15; C-SITE-COUNTERS.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   COLLECT - Default configured-collector fixture (key + default endpoint).
//   boot - Fake window/document/navigator harness for public/analytics.js.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   - 2026-10-27 v1.0.0 C-SITE-COUNTERS: initial suite.
// END_CHANGE_SUMMARY

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  COLLECT_KEY_RE,
  DEFAULT_COLLECT_ENDPOINT,
  collectScript,
  collectTags,
  resolveSiteSettings
} from '../../site/.vitepress/landing.mjs'
import { cspFor } from '../../site/scripts/csp.mjs'

const COLLECT = { key: 'demo-key', endpoint: DEFAULT_COLLECT_ENDPOINT }

// ─── fake browser for public/analytics.js ────────────────────────────
function boot ({ key = '', endpoint = DEFAULT_COLLECT_ENDPOINT } = {}) {
  const source = readFileSync(resolve('site/public/analytics.js'), 'utf8')
  const sends = []
  const timers = []
  const storage = new Map()
  const attributes = { 'data-key': key, 'data-endpoint': endpoint }

  const document = {
    currentScript: { getAttribute: (name) => (name in attributes ? attributes[name] : null) },
    documentElement: { getAttribute: () => 'en', lang: 'en' },
    body: null,
    referrer: '',
    addEventListener: () => {},
    querySelectorAll: () => []
  }
  const window = { addEventListener: () => {}, innerHeight: 800 }
  const location = {
    pathname: '/guide/',
    search: '?utm_source=test',
    href: 'https://mark.example.test/guide/',
    host: 'mark.example.test'
  }
  const sessionStorage = {
    getItem: (name) => (storage.has(name) ? storage.get(name) : null),
    setItem: (name, value) => storage.set(name, String(value))
  }
  const navigator = {
    sendBeacon: (url, blob) => {
      sends.push({ url, body: blob.__body })
      return true
    }
  }
  class Blob {
    constructor (parts) {
      this.__body = parts.join('')
    }
  }
  const setTimeout = (fn) => {
    timers.push(fn)
    return timers.length
  }

  new Function(
    'window',
    'document',
    'location',
    'navigator',
    'sessionStorage',
    'Blob',
    'setTimeout',
    source
  )(window, document, location, navigator, sessionStorage, Blob, setTimeout)

  return { window, sends, timers }
}

describe('C-SITE-COUNTERS — resolveSiteSettings', () => {
  it('returns null when no key is configured', () => {
    expect(resolveSiteSettings({}).collect).toBeNull()
    expect(resolveSiteSettings({ PUBLIC_COLLECT_KEY: '  ' }).collect).toBeNull()
  })

  it('returns the key with the default endpoint', () => {
    expect(resolveSiteSettings({ PUBLIC_COLLECT_KEY: 'demo-key' }).collect).toEqual({
      key: 'demo-key',
      endpoint: DEFAULT_COLLECT_ENDPOINT
    })
    expect(DEFAULT_COLLECT_ENDPOINT).toBe('https://dash.xronocode.com/api/v1/collect')
  })

  it('accepts an explicit endpoint', () => {
    const settings = resolveSiteSettings({
      PUBLIC_COLLECT_KEY: 'demo-key',
      PUBLIC_COLLECT_ENDPOINT: 'https://collect.example.test/v1/collect'
    })
    expect(settings.collect.endpoint).toBe('https://collect.example.test/v1/collect')
  })

  it('fails the build on a malformed key or endpoint', () => {
    expect(COLLECT_KEY_RE.test('demo-key')).toBe(true)
    expect(() => resolveSiteSettings({ PUBLIC_COLLECT_KEY: 'a b' })).toThrow(
      /BLOCK_RESOLVE_ANALYTICS/
    )
    expect(() => resolveSiteSettings({ PUBLIC_COLLECT_KEY: 'short' })).toThrow(
      /BLOCK_RESOLVE_ANALYTICS/
    )
    expect(() =>
      resolveSiteSettings({ PUBLIC_COLLECT_KEY: 'demo-key', PUBLIC_COLLECT_ENDPOINT: 'not-a-url' })
    ).toThrow(/PUBLIC_COLLECT_ENDPOINT/)
    expect(() =>
      resolveSiteSettings({
        PUBLIC_COLLECT_KEY: 'demo-key',
        PUBLIC_COLLECT_ENDPOINT: 'ftp://collect.example.test/collect'
      })
    ).toThrow(/absolute http\(s\) URL/)
  })
})

describe('C-SITE-COUNTERS — collector tag', () => {
  it('emits nothing when no collector is configured', () => {
    expect(collectTags(null)).toEqual([])
    expect(collectScript(null)).toBe('')
    expect(collectScript(undefined, '/mark/')).toBe('')
  })

  it('emits one base-aware tag with key and endpoint', () => {
    expect(collectTags(COLLECT, '/')).toEqual([
      {
        attrs: {
          src: '/analytics.js',
          'data-key': 'demo-key',
          'data-endpoint': DEFAULT_COLLECT_ENDPOINT,
          defer: ''
        }
      }
    ])
    expect(collectTags(COLLECT, '/mark/')[0].attrs.src).toBe('/mark/analytics.js')
    expect(collectScript(COLLECT, '/mark/')).toBe(
      '<script src="/mark/analytics.js" data-key="demo-key" data-endpoint="https://dash.xronocode.com/api/v1/collect" defer></script>'
    )
  })

  it('escapes attribute values instead of emitting raw markup', () => {
    const script = collectScript({
      key: 'demo-key',
      endpoint: 'https://collect.example.test/v1/collect?a=1&b=2'
    })
    expect(script).toContain('a=1&amp;b=2')
    expect(script).not.toContain('a=1&b=2')
  })
})

describe('C-SITE-COUNTERS — CSP allowance', () => {
  const directive = (policy, name) => policy.split('; ').find((part) => part.startsWith(name))

  it('admits the configured collector origin and nothing extra', () => {
    const policy = cspFor('<html></html>', { collect: COLLECT })
    expect(directive(policy, 'connect-src')).toBe(
      "connect-src 'self' https://avenex.xronocode.com https://api.github.com https://dash.xronocode.com"
    )
  })

  it('keeps an unconfigured build free of any collector origin', () => {
    const policy = cspFor('<html></html>', {})
    expect(directive(policy, 'connect-src')).toBe(
      "connect-src 'self' https://avenex.xronocode.com https://api.github.com"
    )
  })

  it('follows a custom endpoint instead of hardcoding the dash host', () => {
    const policy = cspFor('<html></html>', {
      collect: { key: 'demo-key', endpoint: 'https://collect.example.test/v1/collect' }
    })
    const connect = directive(policy, 'connect-src')
    expect(connect).toContain('https://collect.example.test')
    expect(connect).not.toContain('dash.xronocode.com')
  })

  it('keeps script-src at self — the counter is a same-origin asset', () => {
    const policy = cspFor('<html></html>', { collect: COLLECT })
    expect(directive(policy, 'script-src')).toBe("script-src 'self'")
  })
})

describe('C-SITE-COUNTERS — public/analytics.js', () => {
  it('does nothing without a key', () => {
    const { window, sends } = boot({ key: '' })
    expect(sends).toEqual([])
    expect(window.avenexTrack).toBeUndefined()
  })

  it('sends one beacon batch to the configured endpoint with the key', () => {
    const { window, sends } = boot({ key: 'demo-key' })
    expect(typeof window.avenexTrack).toBe('function')
    // The pageview is queued at boot; nine more events reach the ten-event batch.
    for (let i = 0; i < 9; i++) window.avenexTrack('probe', { index: i })

    expect(sends).toHaveLength(1)
    expect(sends[0].url).toBe(`${DEFAULT_COLLECT_ENDPOINT}?key=demo-key`)

    const body = JSON.parse(sends[0].body)
    expect(body.events).toHaveLength(10)
    expect(body.events[0]).toMatchObject({ name: 'pageview', path: '/guide/' })
    expect(body.events[0].props).toMatchObject({ utm_source: 'test', lang: 'en' })
    expect(body.events[9]).toMatchObject({ name: 'probe', path: '/guide/' })
  })

  it('honours the endpoint the tag carries', () => {
    const { window, sends } = boot({
      key: 'demo-key',
      endpoint: 'https://collect.example.test/v1/collect'
    })
    for (let i = 0; i < 9; i++) window.avenexTrack('probe', {})
    expect(sends[0].url).toBe('https://collect.example.test/v1/collect?key=demo-key')
  })

  it('drops unknown property names and caps long strings', () => {
    const { window, sends } = boot({ key: 'demo-key' })
    for (let i = 0; i < 9; i++) {
      window.avenexTrack('probe', { Bad: 'x', ok: 'y'.repeat(300), count: 2, flag: true })
    }
    const props = JSON.parse(sends[0].body).events[9].props
    expect(props).toEqual({ ok: 'y'.repeat(120), count: 2, flag: true })
  })
})
