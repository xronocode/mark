// FILE: tests/renderer/site/landing.test.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Verify the site landing renderer and settings resolution (M-053).
//   SCOPE: base normalization, %BASE% substitution, shared head, analytics
//          on/off, CNAME/robots emission, real template compatibility.
//   DEPENDS: site/.vitepress/landing.mjs, site/landing/index.html
//   LINKS: M-053 SiteBuild; V-M-053; C-22
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   TEMPLATE - minimal landing template fixture
// END_MODULE_MAP

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  cnameFor,
  renderLanding,
  resolveSiteSettings,
  robotsTxt
} from '../../../site/.vitepress/landing.mjs'

const TEMPLATE = '<head><title>t</title><!--SITE_HEAD--></head><a href="%BASE%guide/"><img src="%BASE%logo-96px.png">'

describe('resolveSiteSettings', () => {
  it('defaults to the custom domain at the root with analytics off', () => {
    expect(resolveSiteSettings({})).toEqual({ siteUrl: 'https://mark.xronocode.com', base: '/', analytics: null })
  })

  it('normalizes base slashes and trims the url', () => {
    const s = resolveSiteSettings({ SITE_BASE: 'mark', SITE_URL: 'https://xronocode.github.io/mark/' })
    expect(s.base).toBe('/mark/')
    expect(s.siteUrl).toBe('https://xronocode.github.io/mark')
  })

  it('treats empty CI variables as unset', () => {
    expect(resolveSiteSettings({ SITE_URL: '', SITE_BASE: '', UMAMI_WEBSITE_ID: '' }).analytics).toBeNull()
  })

  it('enables umami only when a website id is given', () => {
    const s = resolveSiteSettings({ UMAMI_WEBSITE_ID: 'abc' })
    expect(s.analytics).toEqual({ provider: 'umami', websiteId: 'abc', src: 'https://cloud.umami.is/script.js' })
  })
})

describe('renderLanding', () => {
  it('substitutes the base and injects the shared head', () => {
    const html = renderLanding(TEMPLATE, resolveSiteSettings({ SITE_BASE: '/mark/', SITE_URL: 'https://x.github.io/mark' }))
    expect(html).toContain('href="/mark/guide/"')
    expect(html).toContain('src="/mark/logo-96px.png"')
    expect(html).toContain('<link rel="canonical" href="https://x.github.io/mark/">')
    expect(html).toContain('og:image" content="https://x.github.io/mark/showcase-00-rich-markdown.png"')
    expect(html).not.toMatch(/%BASE%|SITE_HEAD/)
  })

  it('ships no third-party script unless analytics is configured', () => {
    expect(renderLanding(TEMPLATE, resolveSiteSettings({}))).not.toContain('umami')
    const on = renderLanding(TEMPLATE, resolveSiteSettings({ UMAMI_WEBSITE_ID: 'a"b' }))
    expect(on).toContain('data-website-id="a&quot;b"')
  })

  it('refuses a template without the head placeholder', () => {
    expect(() => renderLanding('<head></head>', resolveSiteSettings({}))).toThrow(/BLOCK_RENDER_LANDING/)
  })

  it('renders the real landing template with no leftover tokens or /mark/ paths', () => {
    const tpl = readFileSync(resolve(import.meta.dirname, '../../../site/landing/index.html'), 'utf8')
    const html = renderLanding(tpl, resolveSiteSettings({}))
    expect(html).not.toMatch(/%BASE%|<!--SITE_HEAD-->/)
    expect(html).not.toMatch(/(href|src)="\/mark\//)
  })
})

describe('robotsTxt / cnameFor', () => {
  it('points robots at the sitemap', () => {
    expect(robotsTxt(resolveSiteSettings({}))).toContain('Sitemap: https://mark.xronocode.com/sitemap.xml')
  })

  it('emits CNAME only for a custom domain at the root', () => {
    expect(cnameFor(resolveSiteSettings({}))).toBe('mark.xronocode.com\n')
    expect(cnameFor(resolveSiteSettings({ SITE_BASE: '/mark/' }))).toBeNull()
    expect(cnameFor(resolveSiteSettings({ SITE_URL: 'https://xronocode.github.io' }))).toBeNull()
  })
})
