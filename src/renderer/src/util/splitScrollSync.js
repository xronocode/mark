// FILE: src/renderer/src/util/splitScrollSync.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: C-SPLIT-SCROLL-SYNC — proportional scroll pairing of the two Split View panes plus the pure anchor/fraction math used on layout transitions.
//   SCOPE: Pure helpers (fraction, clamping, anchor target, content offset of a viewport rect) and a createScrollSync factory that pairs two scroller elements: user scrolls of either pane drive the other on the next animation frame, programmatic writes echo-guarded so the pair never fights. The exported splitScrollSync singleton pairs the muya container ('rich') with the source-code container ('source').
//   DEPENDS: none (DOM passed in; rAF injectable for tests).
//   LINKS: .grace/changes/archive/C-SPLIT-SCROLL-SYNC; components editor.vue, sourceCode.vue, index.vue.
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   clampFraction - clamp any number into [0, 1] (NaN-safe, returns 0).
//   maxScrollOf - scrollHeight - clientHeight, floored at 0.
//   scrollFraction - current scrolled fraction of an element (0 when unscrollable).
//   setScrollFraction - set scrollTop to a fraction of the scrollable range, returns the applied pixel offset.
//   computeAnchorTarget - typewriter-style scrollTop that centers an anchor offset in the viewport, clamped to the document edges.
//   contentOffsetOfRect - convert a viewport-space rect into a content (document) offset inside a scroller.
//   createScrollSync - factory: attach/detach panes, rAF-coalesced bidirectional sync, echo guard, align()/fractionOf() for transitions.
//   splitScrollSync - the app singleton (rich <-> source).
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.1.0 - C-SPLIT-SCROLL-SYNC recovery fix: the flush defers a fraction write while the target pane's scrollable range is unmeasurable (mounting surface), bounded to 40 frames; a fresh user scroll resets the budget.
// END_CHANGE_SUMMARY

// START_BLOCK_SYNC_PURE_HELPERS
export const clampFraction = (value) => {
  const n = Number(value)
  if (!Number.isFinite(n)) return 0
  return Math.min(1, Math.max(0, n))
}

export const maxScrollOf = (el) => {
  if (!el) return 0
  return Math.max(0, el.scrollHeight - el.clientHeight)
}

export const scrollFraction = (el) => {
  if (!el) return 0
  const max = maxScrollOf(el)
  if (max <= 0) return 0
  return clampFraction(el.scrollTop / max)
}

export const setScrollFraction = (el, fraction) => {
  if (!el) return 0
  const target = Math.round(maxScrollOf(el) * clampFraction(fraction))
  el.scrollTop = target
  return target
}

// Typewriter centering: the scrollTop that puts anchorOffset in the middle
// of the viewport, clamped so short documents and edge anchors never
// overscroll.
export const computeAnchorTarget = ({ anchorOffset, viewportHeight, scrollHeight }) => {
  const viewport = Number.isFinite(viewportHeight) ? viewportHeight : 0
  if (viewport <= 0) return 0
  const max = Math.max(0, scrollHeight - viewport)
  return Math.round(Math.min(max, Math.max(0, anchorOffset - viewport / 2)))
}

// A viewport rect (getBoundingClientRect / cursorCoords 'window') to a
// content offset: scrollTop at the moment of measurement plus the rect's
// distance below the container's visible top edge.
export const contentOffsetOfRect = (el, rect) => {
  if (!el || !rect || !Number.isFinite(rect.top)) return null
  const containerRect = el.getBoundingClientRect()
  return el.scrollTop + (rect.top - containerRect.top)
}
// END_BLOCK_SYNC_PURE_HELPERS

// START_BLOCK_SCROLL_PAIR_CONTROLLER
// Pairing contract:
// - attach(name, el): register a pane scroller and listen to its scroll
//   events. Sync runs only while BOTH panes are attached.
// - user scroll of either pane -> on the next animation frame the other
//   pane is set to the same fraction (reads coalesced off the event path).
// - align(name, fraction) and fractionOf(name): transition APIs used by
//   the components on toggle/mount/anchor re-centering; writes go through
//   the echo guard.
// - echo guard: a programmatic write to a pane arms the guard for that
//   pane until the next animation frame; the scroll event the write
//   provokes arrives before that frame and is swallowed, so the pair
//   never feeds back on itself.
export const createScrollSync = ({ raf = (fn) => requestAnimationFrame(fn) } = {}) => {
  const entries = new Map()
  const echoGuarded = new Set()
  let frame = null
  let queuedFrom = null
  // A pane whose scrollable range is not measurable yet (a mounting
  // CodeMirror surface) cannot take a fraction — the write would clamp to
  // 0 and be lost. The flush retries a bounded number of frames until the
  // target has a layout; a fresh user scroll resets the budget.
  let flushAttempts = 0
  const MAX_FLUSH_ATTEMPTS = 40

  const other = (name) => (name === 'rich' ? 'source' : 'rich')

  const readFraction = (name) => {
    const entry = entries.get(name)
    return entry ? scrollFraction(entry.el) : null
  }

  const writeFraction = (name, fraction) => {
    const entry = entries.get(name)
    if (!entry || fraction === null || fraction === undefined) return
    echoGuarded.add(name)
    setScrollFraction(entry.el, fraction)
    raf(() => echoGuarded.delete(name))
  }

  const flush = () => {
    frame = null
    if (queuedFrom === null) return
    const from = queuedFrom
    const to = other(from)
    const entry = entries.get(to)
    if (!entry) {
      queuedFrom = null
      flushAttempts = 0
      return
    }
    if (maxScrollOf(entry.el) <= 0 && flushAttempts < MAX_FLUSH_ATTEMPTS) {
      flushAttempts += 1
      frame = raf(flush)
      return
    }
    flushAttempts = 0
    queuedFrom = null
    writeFraction(to, readFraction(from))
  }

  const handleScroll = (name) => (event) => {
    if (echoGuarded.has(name)) return
    if (!entries.has(other(name))) return
    flushAttempts = 0
    queuedFrom = name
    if (frame === null) frame = raf(flush)
  }

  return {
    attach (name, el) {
      if (!el) return
      this.detach(name)
      const handler = handleScroll(name)
      entries.set(name, { el, handler })
      el.addEventListener('scroll', handler)
    },
    detach (name) {
      const entry = entries.get(name)
      if (!entry) return
      entry.el.removeEventListener('scroll', entry.handler)
      entries.delete(name)
      echoGuarded.delete(name)
      if (queuedFrom === name) queuedFrom = null
      flushAttempts = 0
    },
    isPaired () {
      return entries.has('rich') && entries.has('source')
    },
    fractionOf (name) {
      return readFraction(name)
    },
    align (name, fraction) {
      if (!entries.has(name)) return
      writeFraction(name, clampFraction(fraction))
    },
    dispose () {
      for (const name of [...entries.keys()]) {
        this.detach(name)
      }
      if (frame !== null) {
        frame = null
        queuedFrom = null
      }
      flushAttempts = 0
    }
  }
}
// END_BLOCK_SCROLL_PAIR_CONTROLLER

// The app pair: 'rich' is the muya container (editor.vue), 'source' is the
// .source-code container (sourceCode.vue). Both surfaces exist for the
// whole editor lifetime, so a singleton is safe; the pair only syncs while
// both are attached.
export const splitScrollSync = createScrollSync()
