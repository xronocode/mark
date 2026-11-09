// FILE: tests/renderer/util/split-scroll-sync.test.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Verify C-SPLIT-SCROLL-SYNC T-301 — the pure fraction/anchor
//            helpers and the createScrollSync controller: bidirectional
//            proportional sync, rAF coalescing, the echo guard, transition
//            APIs (align/fractionOf), attach/detach/dispose cleanliness.
//   SCOPE: jsdom element fixtures driven synchronously through an injected
//          rAF queue; no component mounting.
//   DEPENDS: Vitest, src/renderer/src/util/splitScrollSync.js.
//   LINKS: .grace/verification/runtime.xml V-M-011 split scroll scenarios (C-SPLIT-SCROLL-SYNC).
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   makeEl - jsdom scroller fixture with scrollHeight/clientHeight.
//   makeRaf - controllable rAF queue (step() executes pending callbacks).
//   flushMicrotasks - await Promise.resolve() so watchers/promises settle.
//   (deferred-write case) - a mounting target with no scrollable range holds the flush until layout exists.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - C-SPLIT-SCROLL-SYNC T-301 initial pins.
// END_CHANGE_SUMMARY

import { describe, expect, it, vi } from 'vitest'
import {
  clampFraction,
  computeAnchorTarget,
  contentOffsetOfRect,
  createScrollSync,
  maxScrollOf,
  scrollFraction,
  setScrollFraction
} from '@/util/splitScrollSync'

const makeEl = ({ scrollHeight = 1000, clientHeight = 200, scrollTop = 0 } = {}) => {
  const el = document.createElement('div')
  Object.defineProperties(el, {
    scrollHeight: { value: scrollHeight, configurable: true },
    clientHeight: { value: clientHeight, configurable: true },
    scrollTop: { value: scrollTop, writable: true, configurable: true }
  })
  return el
}

const makeRaf = () => {
  const queue = []
  return {
    raf: (fn) => {
      queue.push(fn)
      return queue.length
    },
    step: () => {
      const pending = queue.splice(0, queue.length)
      pending.forEach((fn) => fn())
    },
    isEmpty: () => queue.length === 0
  }
}

const flushMicrotasks = () => Promise.resolve()

describe('splitScrollSync pure helpers', () => {
  it('clampFraction clamps into [0, 1] and maps NaN to 0', () => {
    expect(clampFraction(-1)).toBe(0)
    expect(clampFraction(0.5)).toBe(0.5)
    expect(clampFraction(2)).toBe(1)
    expect(clampFraction(Number.NaN)).toBe(0)
    expect(clampFraction('nope')).toBe(0)
  })

  it('maxScrollOf floors at 0 for missing or unscrollable elements', () => {
    expect(maxScrollOf(null)).toBe(0)
    expect(maxScrollOf(makeEl({ scrollHeight: 100, clientHeight: 200 }))).toBe(0)
    expect(maxScrollOf(makeEl({ scrollHeight: 1000, clientHeight: 200 }))).toBe(800)
  })

  it('scrollFraction returns 0 when unscrollable and the fraction otherwise', () => {
    expect(scrollFraction(null)).toBe(0)
    expect(scrollFraction(makeEl({ scrollHeight: 100, clientHeight: 200 }))).toBe(0)
    expect(scrollFraction(makeEl({ scrollHeight: 1000, clientHeight: 200, scrollTop: 400 }))).toBe(0.5)
  })

  it('setScrollFraction applies the clamped fraction and returns the pixel offset', () => {
    const el = makeEl({ scrollHeight: 1000, clientHeight: 200 })
    expect(setScrollFraction(el, 0.5)).toBe(400)
    expect(el.scrollTop).toBe(400)
    expect(setScrollFraction(el, 5)).toBe(800)
    expect(el.scrollTop).toBe(800)
    expect(setScrollFraction(null, 0.5)).toBe(0)
  })

  it('computeAnchorTarget centers the anchor and clamps to the document edges', () => {
    // anchor 500 in a 200-high viewport over 1000 of content: 500-100=400
    expect(computeAnchorTarget({ anchorOffset: 500, viewportHeight: 200, scrollHeight: 1000 })).toBe(400)
    // near the top: clamps to 0
    expect(computeAnchorTarget({ anchorOffset: 50, viewportHeight: 200, scrollHeight: 1000 })).toBe(0)
    // near the bottom: clamps to max (800)
    expect(computeAnchorTarget({ anchorOffset: 990, viewportHeight: 200, scrollHeight: 1000 })).toBe(800)
    // degenerate viewport
    expect(computeAnchorTarget({ anchorOffset: 500, viewportHeight: 0, scrollHeight: 1000 })).toBe(0)
  })

  it('contentOffsetOfRect converts a viewport rect into a content offset', () => {
    const el = makeEl({ scrollHeight: 2000, clientHeight: 200, scrollTop: 300 })
    vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({ top: 100, height: 200 })
    expect(contentOffsetOfRect(el, { top: 250 })).toBe(300 + (250 - 100))
    expect(contentOffsetOfRect(el, null)).toBe(null)
    expect(contentOffsetOfRect(null, { top: 10 })).toBe(null)
  })
})

describe('createScrollSync controller', () => {
  it('syncs either pane to the other proportionally after one rAF', () => {
    const raf = makeRaf()
    const pair = createScrollSync({ raf: raf.raf })
    const rich = makeEl({ scrollHeight: 2000, clientHeight: 200, scrollTop: 900 })
    const source = makeEl({ scrollHeight: 1000, clientHeight: 200 })
    pair.attach('rich', rich)
    pair.attach('source', source)

    rich.dispatchEvent(new Event('scroll'))
    raf.step()
    // rich fraction 900/1800 = 0.5 -> source max 800 -> 400
    expect(source.scrollTop).toBe(400)

    source.dispatchEvent(new Event('scroll'))
    raf.step()
    // source fraction 400/800 = 0.5 -> rich max 1800 -> 900 (unchanged by
    // the round trip, which is the fixed point of proportional sync)
    expect(rich.scrollTop).toBe(900)
  })

  it('ignores scrolls while only one pane is attached', () => {
    const raf = makeRaf()
    const pair = createScrollSync({ raf: raf.raf })
    const rich = makeEl({ scrollHeight: 2000, clientHeight: 200 })
    pair.attach('rich', rich)
    rich.dispatchEvent(new Event('scroll'))
    raf.step()
    expect(rich.scrollTop).toBe(0)
    expect(pair.isPaired()).toBe(false)
  })

  it('swallows the echo of its own programmatic write (no ping-pong)', () => {
    const raf = makeRaf()
    const pair = createScrollSync({ raf: raf.raf })
    const rich = makeEl({ scrollHeight: 2000, clientHeight: 200, scrollTop: 800 })
    const source = makeEl({ scrollHeight: 1000, clientHeight: 200, scrollTop: 0 })
    pair.attach('rich', rich)
    pair.attach('source', source)

    pair.align('source', 0.4)
    expect(source.scrollTop).toBe(320)
    // The provoked scroll event arrives BEFORE the guard clears on rAF.
    source.dispatchEvent(new Event('scroll'))
    raf.step()
    // The echo did not bounce back to rich: its scrollTop is intact
    // and no further frames are pending.
    expect(rich.scrollTop).toBe(800)
    expect(raf.isEmpty()).toBe(true)

    // After the guard cleared, a genuine user scroll still syncs:
    // source fraction 320/800 = 0.4 -> rich max 1800 -> 720.
    source.dispatchEvent(new Event('scroll'))
    raf.step()
    expect(rich.scrollTop).toBe(720)
  })

  it('defers the write while the target pane has no measurable range yet', () => {
    const raf = makeRaf()
    const pair = createScrollSync({ raf: raf.raf })
    const rich = makeEl({ scrollHeight: 2000, clientHeight: 200, scrollTop: 900 })
    // Mounting surface: no scrollable range at first.
    const source = makeEl({ scrollHeight: 300, clientHeight: 300 })
    pair.attach('rich', rich)
    pair.attach('source', source)

    rich.dispatchEvent(new Event('scroll'))
    raf.step()
    // The write did NOT clamp to 0 — it stays pending until layout exists.
    expect(source.scrollTop).toBe(0)
    raf.step()
    raf.step()
    expect(source.scrollTop).toBe(0)

    // The surface lays out its content: the deferred write now lands.
    Object.defineProperty(source, 'scrollHeight', { value: 1000, configurable: true })
    raf.step()
    // rich fraction 0.5 of the now-measurable max (1000-300=700) = 350.
    expect(source.scrollTop).toBe(350)
    raf.step()
    expect(raf.isEmpty()).toBe(true)
  })

  it('coalesces bursts of scrolls into one write per frame', () => {
    const raf = makeRaf()
    const pair = createScrollSync({ raf: raf.raf })
    const rich = makeEl({ scrollHeight: 2000, clientHeight: 200 })
    const source = makeEl({ scrollHeight: 1000, clientHeight: 200 })
    pair.attach('rich', rich)
    pair.attach('source', source)

    rich.scrollTop = 200
    rich.dispatchEvent(new Event('scroll'))
    rich.scrollTop = 400
    rich.dispatchEvent(new Event('scroll'))
    rich.scrollTop = 600
    rich.dispatchEvent(new Event('scroll'))
    // Still one pending frame for the whole burst.
    raf.step()
    // The LAST fraction (600/1800) won.
    expect(source.scrollTop).toBe(Math.round((600 / 1800) * 800))
    // The write armed the echo guard; its clear lands on the next frame.
    raf.step()
    expect(raf.isEmpty()).toBe(true)
  })

  it('align/fractionOf serve transitions and stay guarded', async () => {
    const raf = makeRaf()
    const pair = createScrollSync({ raf: raf.raf })
    const rich = makeEl({ scrollHeight: 2000, clientHeight: 200, scrollTop: 900 })
    const source = makeEl({ scrollHeight: 1000, clientHeight: 200 })
    pair.attach('rich', rich)
    pair.attach('source', source)

    expect(pair.fractionOf('rich')).toBe(0.5)
    pair.align('source', pair.fractionOf('rich'))
    expect(source.scrollTop).toBe(400)

    await flushMicrotasks()
    raf.step()
    // align on an unattached pane is a no-op, fractionOf is null
    expect(pair.fractionOf('missing')).toBe(null)
    expect(() => pair.align('missing', 0.5)).not.toThrow()
  })

  it('detach and dispose remove listeners and pending frames cleanly', () => {
    const raf = makeRaf()
    const pair = createScrollSync({ raf: raf.raf })
    const rich = makeEl({ scrollHeight: 2000, clientHeight: 200 })
    const source = makeEl({ scrollHeight: 1000, clientHeight: 200 })
    pair.attach('rich', rich)
    pair.attach('source', source)

    rich.dispatchEvent(new Event('scroll'))
    pair.detach('source')
    raf.step()
    expect(source.scrollTop).toBe(0)

    rich.dispatchEvent(new Event('scroll'))
    pair.dispose()
    raf.step()
    expect(source.scrollTop).toBe(0)
    expect(pair.isPaired()).toBe(false)

    // A stale event after dispose does nothing.
    rich.dispatchEvent(new Event('scroll'))
    raf.step()
    expect(rich.scrollTop).toBe(0)
  })
})
