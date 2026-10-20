// FILE: tests/site/track-p3.test.mjs
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: C-64 T-009 — the P3 (deep) GA4 layer of site/public/track.js on
//            fake browser globals: os stamping with mobile precedence,
//            hero_alt placements, nav_click targets, section_view,
//            stage_drag, prompt_open, appearance_toggle, scroll_depth,
//            code_copy, doc_nav (window capture), diagram_code_view,
//            not_found, per-route re-arm and the consent queue.
//   SCOPE: evaluates track.js with new Function on a hand-built window /
//          document; no DOM, no network. The portfolio-level track.js and
//          consent.js tests stay in tests/site/head.test.mjs.
//   DEPENDS: vitest; site/public/track.js
//   LINKS: M-053 SiteBuild; V-M-053; C-64 T-009
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   TRACK_SRC - public/track.js source
//   bootTrack - evaluate track.js on fake globals; returns calls, listeners and the fakes
//   clickOn - dispatch a fake click on a tracked element through the document listener
//   LINK - fake App Store download link element
//   OUTLINK - fake GitHub repository link element (outbound_click)
//   mkEl - small fake element with closest/getAttribute for P3 click fixtures
//   mkIO - fake IntersectionObserver that records observed nodes and lets tests fire entries
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: [v1.0.0 - 2026-10-21 C-64 T-009: first version (split out of head.test.mjs).]
// END_CHANGE_SUMMARY

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

const TRACK_SRC = readFileSync(resolve(import.meta.dirname, '../../site/public/track.js'), 'utf8')

function bootTrack (opts = {}) {
  let { granted = false, decided = true } = opts
  const {
    withGtag = true,
    pathname = '/', search = '',
    htmlClassList = null,           // fake documentElement.classList (os-* / ios / android)
    documentElement = null,         // full documentElement override (dark flag, scroll geometry)
    querySelector = null,           // (.NotFound) fixture
    querySelectorAll = null,        // ([data-section]) fixture
    IntersectionObserver = null,
    innerHeight = 0,
    pageYOffset = 0,
    history = false                 // true: fake history whose pushState mutates location
  } = opts
  const calls = []
  const docListeners = {}
  const winListeners = {}
  const consentListeners = []
  const document = {
    addEventListener: (type, cb) => { docListeners[type] = cb },
    querySelector: (sel) => (querySelector ? querySelector(sel) : null),
    querySelectorAll: (sel) => (querySelectorAll ? querySelectorAll(sel) : []),
    documentElement: documentElement || (htmlClassList
      ? { classList: htmlClassList }
      : { classList: { contains: () => false }, scrollTop: 0, scrollHeight: 0 })
  }
  // track.js reads location at load (route/page-type checks) and on every
  // route change — hand it a fake instead of the missing Node global.
  const location = { origin: 'https://mark.xronocode.com', pathname, search, href: 'https://mark.xronocode.com' + pathname + search }
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
    location,
    addEventListener: (t, cb) => { winListeners[t] = cb },
    innerHeight,
    pageYOffset,
    ...(withGtag ? { gtag: (...args) => calls.push(args) } : {}),
    ...(IntersectionObserver ? { IntersectionObserver } : {})
  }
  if (history === true) window.history = { pushState: (s, t, url) => { location.pathname = new URL(url, location.origin).pathname } }
  else if (history) window.history = history
  new Function('window', 'document', 'location', TRACK_SRC)(window, document, location)
  return {
    calls,
    docListeners,
    winListeners,
    window,
    location,
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

const mkEl = (attrs) => ({
  getAttribute: (n) => attrs[n] ?? null,
  hasAttribute: (n) => n in attrs
})

function mkIO () {
  const ios = []
  const observed = []
  class FakeIO {
    constructor (cb, opts) { ios.push({ cb, opts }) }
    observe (el) { observed.push(el) }
    disconnect () {}
  }
  return { FakeIO, ios, observed }
}


describe('public/track.js P3 layer (C-64 T-009)', () => {
  // 80% depth geometry: pageYOffset 300 + innerHeight 500 over 1000px.
  const GEO = { innerHeight: 500, pageYOffset: 300, documentElement: { classList: { contains: () => false }, scrollTop: 300, scrollHeight: 1000 } }

  it('stamps os on download_click and share_to_mac from the html classes, mobile classes winning over os-*', () => {
    const win = bootTrack({ granted: true, htmlClassList: { contains: (c) => c === 'os-win' } })
    clickOn(win.docListeners, LINK)
    win.window.markTrack('share_to_mac', { result: 'shared' })
    expect(win.calls[0][2]).toMatchObject({ method: 'app_store', placement: 'hero', os: 'win' })
    expect(win.calls[1][2]).toMatchObject({ result: 'shared', os: 'win' })
    const android = bootTrack({ granted: true, htmlClassList: { contains: (c) => c === 'android' || c === 'os-linux' } })
    clickOn(android.docListeners, LINK)
    expect(android.calls[0][2].os).toBe('android')
    const ipad = bootTrack({ granted: true, htmlClassList: { contains: (c) => c === 'ios' || c === 'os-mac' } })
    clickOn(ipad.docListeners, LINK)
    expect(ipad.calls[0][2].os).toBe('ios')
  })

  it('omits os where no os classes exist (docs pages keep the old param set)', () => {
    const on = bootTrack({ granted: true })
    clickOn(on.docListeners, LINK)
    expect(on.calls[0][2]).not.toHaveProperty('os')
  })

  it('sends nav_click with data-target, or a target derived from the href path (unknown -> other)', () => {
    const on = bootTrack({ granted: true })
    const cases = [
      [{ 'data-track': 'nav_click', 'data-target': 'diagrams', 'data-placement': 'nav', href: '/diagrams/' }, 'diagrams'],
      [{ 'data-track': 'nav_click', 'data-placement': 'footer', href: '/guide/editions' }, 'editions'],
      [{ 'data-track': 'nav_click', 'data-placement': 'footer', href: '/guide/' }, 'docs'],
      [{ 'data-track': 'nav_click', 'data-placement': 'hero_alt', href: '#all-downloads' }, 'all_downloads'],
      [{ 'data-track': 'nav_click', 'data-placement': 'footer', href: '/guide/quickstart' }, 'guide'],
      [{ 'data-track': 'nav_click', 'data-placement': 'gallery_nav', href: '/reference/architecture' }, 'other'],
      [{ 'data-track': 'nav_click', 'data-placement': 'gallery_nav', href: '/constructor' }, 'other']
    ]
    for (const [attrs] of cases) clickOn(on.docListeners, mkEl(attrs))
    expect(on.calls.map((c) => c[2].target)).toEqual(cases.map((c) => c[1]))
    expect(on.calls[0][2].placement).toBe('nav')
  })

  it('fires section_view once per section once at least half of it is visible', () => {
    const { FakeIO, ios, observed } = mkIO()
    const sec = (id) => ({ getAttribute: (n) => (n === 'data-section' ? id : null) })
    const on = bootTrack({
      granted: true,
      IntersectionObserver: FakeIO,
      querySelectorAll: (sel) => (sel === '[data-section]' ? [sec('hero'), sec('agents')] : [])
    })
    expect(observed).toHaveLength(2)
    expect(ios[0].opts).toMatchObject({ threshold: 0.5 })
    for (const io of ios) {
      io.cb([{ target: observed[0], intersectionRatio: 0.6 }])
      io.cb([{ target: observed[0], intersectionRatio: 0.9 }, { target: observed[1], intersectionRatio: 0.49 }])
    }
    expect(on.calls.filter((c) => c[1] === 'section_view').map((c) => c[2].section)).toEqual(['hero'])
  })

  it('sends scroll_depth thresholds once per page, page_type by path, and never on /guide/* (doc_read owns those)', () => {
    const landing = bootTrack({ granted: true, pathname: '/', ...GEO })
    landing.winListeners.scroll()
    landing.winListeners.scroll()
    expect(landing.calls.filter((c) => c[1] === 'scroll_depth').map((c) => c[2].percent)).toEqual([25, 50, 75])
    const guide = bootTrack({ granted: true, pathname: '/guide/quickstart', ...GEO })
    guide.winListeners.scroll()
    expect(guide.calls.filter((c) => c[1] === 'scroll_depth')).toHaveLength(0)
    expect(guide.calls.filter((c) => c[1] === 'doc_read').map((c) => c[2].doc_id)).toEqual(['quickstart'])
    for (const [page, type] of [['/diagrams/', 'gallery'], ['/changelog', 'changelog']]) {
      const t = bootTrack({ granted: true, pathname: page, ...GEO })
      t.winListeners.scroll()
      expect(t.calls.find((c) => c[1] === 'scroll_depth')[2].page_type).toBe(type)
    }
  })

  it('derives code_copy lang from the language- wrapper class and doc_id from the page slug', () => {
    const on = bootTrack({ granted: true, pathname: '/guide/cli' })
    const copyClick = (cls) => on.docListeners.click({
      target: {
        closest: (sel) => (sel === '.vp-doc button.copy'
          ? { closest: (s2) => (s2 === 'div[class*="language-"]' ? { className: cls } : null) }
          : null)
      }
    })
    copyClick('language-js vp-adaptive-theme')
    copyClick('language-C++')
    expect(on.calls.map((c) => [c[1], c[2]])).toEqual([
      ['code_copy', { doc_id: 'cli', lang: 'js', transport_type: 'beacon' }],
      ['code_copy', { doc_id: 'cli', lang: 'c', transport_type: 'beacon' }]
    ])
  })

  it('sends doc_nav for sidebar, prev_next and outline links with the current page slug', () => {
    const on = bootTrack({ granted: true, pathname: '/guide/themes' })
    // doc_nav listens on window in the capture phase (the VitePress router
    // swallows internal-link clicks before they reach document).
    const navClick = (boxCls) => on.winListeners.click({
      target: {
        closest: (sel) => (sel === '.VPSidebar a, .VPDocFooter .pager a, .VPDocAsideOutline a'
          ? { closest: (s2) => (s2 === '.VPSidebar, .VPDocFooter .pager, .VPDocAsideOutline' ? { classList: { contains: (c) => c === boxCls } } : null) }
          : null)
      }
    })
    navClick('VPSidebar')
    navClick('pager')
    navClick('VPDocAsideOutline')
    expect(on.calls.map((c) => c[2])).toEqual([
      { kind: 'sidebar', doc_id: 'themes', transport_type: 'beacon' },
      { kind: 'prev_next', doc_id: 'themes', transport_type: 'beacon' },
      { kind: 'outline', doc_id: 'themes', transport_type: 'beacon' }
    ])
  })

  it('reads appearance_toggle mode after the click and places it landing/gallery/docs', () => {
    const switchClick = (isVp) => ({
      target: {
        closest: (sel) => (sel === '.toggle, .VPSwitchAppearance'
          ? { classList: { contains: (c) => isVp && c === 'VPSwitchAppearance' } }
          : null)
      }
    })
    const dark = { classList: { contains: (c) => c === 'dark' } }
    const landing = bootTrack({ granted: true, documentElement: dark })
    landing.docListeners.click(switchClick(false))
    expect(landing.calls[0][2]).toMatchObject({ mode: 'dark', placement: 'landing' })
    const gallery = bootTrack({ granted: true, pathname: '/diagrams/', documentElement: dark })
    gallery.docListeners.click(switchClick(false))
    expect(gallery.calls[0][2]).toMatchObject({ mode: 'dark', placement: 'gallery' })
    const docs = bootTrack({ granted: true, pathname: '/reference/overview', documentElement: dark })
    docs.docListeners.click(switchClick(true))
    expect(docs.calls[0][2]).toMatchObject({ mode: 'dark', placement: 'docs' })
    const light = bootTrack({ granted: true })
    light.docListeners.click(switchClick(false))
    expect(light.calls[0][2]).toMatchObject({ mode: 'light', placement: 'landing' })
  })

  it('re-arms doc_read and scroll_depth per route (pushState wrapped once, popstate watched)', () => {
    vi.useFakeTimers()
    try {
      const on = bootTrack({ granted: true, pathname: '/guide/search', ...GEO })
      on.winListeners.scroll()
      on.location.pathname = '/guide/diff-view'      // SPA back/forward
      on.winListeners.popstate()
      vi.advanceTimersByTime(1)
      on.winListeners.scroll()
      expect(on.calls.filter((c) => c[1] === 'doc_read').map((c) => c[2].doc_id)).toEqual(['search', 'diff-view'])
      const spa = bootTrack({ granted: true, pathname: '/', history: true, ...GEO })
      spa.winListeners.scroll()
      spa.window.history.pushState({}, '', '/diagrams/')
      vi.advanceTimersByTime(1)
      spa.winListeners.scroll()
      expect(spa.calls.filter((c) => c[1] === 'scroll_depth').map((c) => c[2].page_type)).toEqual(['landing', 'landing', 'landing', 'gallery', 'gallery', 'gallery'])
    } finally {
      vi.useRealTimers()
    }
  })

  it('sends not_found once per route when the 404 layout is up, and never the path', async () => {
    const hard = bootTrack({ granted: true, pathname: '/missing', querySelector: (sel) => (sel === '.NotFound' ? { className: 'NotFound' } : null) })
    expect(hard.calls.filter((c) => c[1] === 'not_found')).toHaveLength(1)
    let up = false
    const spa = bootTrack({ granted: true, pathname: '/guide/missing', querySelector: (sel) => (sel === '.NotFound' && up ? { className: 'NotFound' } : null) })
    expect(spa.calls.filter((c) => c[1] === 'not_found')).toHaveLength(0)
    up = true                                          // the SPA paints the 404 layout after the route change
    spa.location.pathname = '/nope'
    spa.winListeners.popstate()
    await new Promise((r) => setTimeout(r, 5))         // the deferred re-check may be the one that sees it
    const nf = spa.calls.filter((c) => c[1] === 'not_found')
    expect(nf).toHaveLength(1)
    expect(nf[0][2]).toEqual({ transport_type: 'beacon' })
    spa.winListeners.popstate()                        // same route again: still once
    await new Promise((r) => setTimeout(r, 5))
    expect(spa.calls.filter((c) => c[1] === 'not_found')).toHaveLength(1)
  })

  it('holds P3 events in the undecided queue too — nothing sends before consent', () => {
    const t = bootTrack({ granted: false, decided: false })
    clickOn(t.docListeners, mkEl({ 'data-track': 'nav_click', 'data-target': 'docs', 'data-placement': 'footer', href: '/guide/' }))
    clickOn(t.docListeners, LINK)
    expect(t.calls).toEqual([])
    t.set(true, true)
    for (const cb of t.consentListeners) cb(true)
    expect(t.calls.map((c) => c[1])).toEqual(['nav_click', 'download_click'])
  })
})
