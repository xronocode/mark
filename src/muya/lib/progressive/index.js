// FILE: src/muya/lib/progressive/index.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: The progressive mount controller (C-LARGE-DOC-WAVE-A T-003,
//            R-1/R-2/R-3): parse the document WHOLE, mount the synchronous
//            region (first ~100 top-level blocks, extended to cover the
//            viewport when layout is measurable) so the editor is visible and
//            input-ready immediately, then mount the remaining tail in
//            bounded cooperative slices through the scheduler — frozen
//            regions, top-level-block boundaries only, oversized single
//            blocks as one mount unit, on-demand region mounting for
//            navigation, a prefix-mismatch reset on content replacement, and
//            a catch-all fallback that abandons any failed attempt and
//            completes the open through the legacy single-pass mount from the
//            CURRENT model (accepted edits survive).
//   SCOPE: Session state machine ('sync' → 'tailing' → 'done' | 'fallback' |
//            'cancelled'), range mounting through the instance-scoped
//            StateRender entries (renderRegion/extendRegion — never the
//            document-global root query, see the T-002 trap note), the
//            content-free marker dispatches (BLOCK_SYNC_REGION_DONE /
//            BLOCK_TAIL_MOUNT_DONE / BLOCK_MOUNT_SERVED), budget/ceiling slice
//            arithmetic (yield between ranges at ~12 ms; never START a range
//            past the 300 ms hard ceiling), O(1) anchor tracking with a
//            single bounded rescan when an accepted edit moved the boundary,
//            and the public Muya surface wiring (progressiveMount /
//            mountToBlockKey / mountToOffset / cancelProgressive). The model
//            is NEVER sliced: every model-reading consumer (save, word count,
//            TOC, search) sees the complete document from parse onward —
//            only DOM mounting is progressive.
//   DEPENDS: ./markers, ./regions, ./scheduler; muya.contentState (blocks,
//            importMarkdown, importCursor, searchMatches, postRender, render),
//            muya.contentState.stateRender (collectLabels, renderRegion,
//            extendRegion, resolveOwnRoot), muya.eventCenter,
//            utils/exportMarkdown (mountToOffset's block-length walk).
//   LINKS: .grace/changes/active/C-LARGE-DOC-WAVE-A (spec R-1/R-2/R-3; plan
//          T-003, corners 3/4/6; T-002 Evidence records the proven
//          range-mount primitives these build on); M-063 routing lands with
//          T-008; consumers: bench driver (T-005), editor.vue (T-004).
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   PROGRESSIVE_DEFAULTS - grounded defaults (T-002): sync region 100 blocks, tail chunks 50, ~12 ms slice budget, 300 ms hard ceiling, 64 KB oversized threshold, depth cap 64.
//   createProgressiveMount - per-instance controller: open() (the progressiveMount entry), mountToBlockKey/mountToOffset (on-demand navigation mounts, ceiling-bounded), cancel(), info(); marker names are re-exported for muya/lib/index.js.
//   BLOCK_MOUNT_SERVED - re-exported content-free marker name (which path served an open).
//   BLOCK_SYNC_REGION_DONE - re-exported content-free marker name (synchronous region mounted).
//   BLOCK_TAIL_MOUNT_DONE - re-exported content-free marker name (whole document mounted).
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: [1.0.0 - 2026-11-02 - C-LARGE-DOC-WAVE-A T-003: initial
//                 progressive mount controller.]
// END_CHANGE_SUMMARY

import ExportMarkdown from '../utils/exportMarkdown'
import { BLOCK_MOUNT_SERVED, BLOCK_SYNC_REGION_DONE, BLOCK_TAIL_MOUNT_DONE } from './markers'
import { nextRange, contentBytes, isMountedIndex, OVERSIZED_BLOCK_BYTES, DEPTH_CAP, NODE_CAP } from './regions'
import { createScheduler, SCHEDULER_DEFAULTS } from './scheduler'

export { BLOCK_MOUNT_SERVED, BLOCK_SYNC_REGION_DONE, BLOCK_TAIL_MOUNT_DONE } from './markers'

// T-002 measurement (plan Evidence): first 100 top-level blocks mount in
// ~11 ms at both measured shapes; background chunks of 50-100 blocks run
// ~13 ms median. The slice budget (~12 ms under a 16 ms frame) and the hard
// ceiling (300 ms = the contract's longest-task budget at the stress shape)
// are the plan-time decisions recorded in the plan's Execution section.
export const PROGRESSIVE_DEFAULTS = {
  syncRegionBlocks: 100,
  // T-007 tune (50 -> 100): the stress shape (19k blocks) needed 382 ranges
  // at 50 blocks and its idle-sliced tail wall-clock exceeded the proposed
  // 6s ceiling; 100 halves the range count while every measured range stays
  // far under the 300ms ceiling (T-002: chunk-100 median ~13ms, spikes ~100ms).
  tailChunkBlocks: 100,
  oversizedBytes: OVERSIZED_BLOCK_BYTES,
  depthCap: DEPTH_CAP,
  nodeCap: NODE_CAP,
  sliceBudgetMs: 12,
  sliceCeilingMs: 300,
  viewportCoverage: 1.5,
  scheduler: { ...SCHEDULER_DEFAULTS }
}

const defaultNow = () =>
  (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now())

let sessionCounter = 0

export function createProgressiveMount (muya, opts = {}) {
  const baseConf = { ...PROGRESSIVE_DEFAULTS, ...opts }
  let conf = { ...baseConf }
  const now = () => (conf.now ? conf.now() : defaultNow())

  let session = null
  let scheduler = null

  const cs = () => muya.contentState
  const dispatch = (event, payload) => muya.eventCenter.dispatch(event, payload)

  // ── mount primitives (T-002 proven shapes, instance-scoped) ────────────

  // Fresh region mount [start, end): replaces the editor root's content with
  // exactly this slice (the StateRender.render semantics, own-container
  // scoped). Used once per open for the synchronous region.
  function mountRangeFresh (start, end) {
    const state = cs()
    const blocks = state.blocks
    const slice = blocks.slice(start, end)
    state.stateRender.renderRegion(slice, [blocks[start]], state.searchMatches.matches)
    state.postRender()
    session.anchorIdx = end - 1
    session.anchorKey = blocks[end - 1].key
    session.mountedThrough = end
    session.frozen.push({ start, end, oversizedUnits: 0 })
  }

  // Anchored extension (T-002 proven primitive): the slice INCLUDES the last
  // mounted block (the splice anchor — it is re-patched, which also keeps
  // partialRender's cursor patch suppressed via the non-empty activeBlocks),
  // and the renderer replaces the anchor onwards in THIS instance's DOM with
  // the slice. Frozen semantics: mounted regions are never re-mounted — the
  // single anchor splice block is the one deliberate exception, recorded by
  // T-002 as the range primitive itself.
  function mountRangeExtend (range) {
    const state = cs()
    const blocks = state.blocks
    if (
      session.anchorIdx < 0 ||
      !blocks[session.anchorIdx] ||
      blocks[session.anchorIdx].key !== session.anchorKey
    ) {
      resyncAnchor()
    }
    const anchorIdx = session.anchorIdx
    const anchorBlock = blocks[anchorIdx]
    const slice = blocks.slice(anchorIdx, range.end)
    state.stateRender.extendRegion(
      slice,
      [anchorBlock],
      state.searchMatches.matches,
      anchorBlock.key,
      null
    )
    state.postRender()
    session.mountedThrough = range.end
    session.anchorIdx = range.end - 1
    session.anchorKey = blocks[range.end - 1].key
    session.frozen.push({
      start: range.start,
      end: range.end,
      oversizedUnits: range.oversizedUnits
    })
    if (range.oversizedUnits) session.oversizedUnits += range.oversizedUnits
  }

  // O(1) anchor validity: the tracked index still holds the anchor key. An
  // accepted edit that moved the boundary trips this and gets ONE bounded
  // rescan (never a per-range scan); an edit that removed the boundary block
  // entirely escalates to the legacy fallback (R-2's bounded worst case).
  function resyncAnchor () {
    const blocks = cs().blocks
    if (
      session.anchorIdx >= 0 &&
      blocks[session.anchorIdx] &&
      blocks[session.anchorIdx].key === session.anchorKey
    ) {
      return
    }
    const idx = blocks.findIndex((b) => b.key === session.anchorKey)
    if (idx === -1) {
      const err = new Error('progressive: boundary block no longer at top level')
      err.reasonCode = 'anchor-lost'
      throw err
    }
    session.anchorIdx = idx
    session.mountedThrough = idx + 1
  }

  function rangeOpts () {
    return {
      chunkBlocks: conf.tailChunkBlocks,
      oversizedBytes: conf.oversizedBytes,
      depthCap: conf.depthCap,
      nodeCap: conf.nodeCap
    }
  }

  // ── viewport coverage (R-1: "enough to cover the viewport if measurable,
  //    else 100"). jsdom/hidden editors measure 0 height and keep the
  //    default region — the measurable branch is browser-only. ────────────

  function extendForViewport (sliceStart) {
    const state = cs()
    const blocks = state.blocks
    if (session.mountedThrough >= blocks.length) return
    const root = state.stateRender.resolveOwnRoot && state.stateRender.resolveOwnRoot()
    const viewport = (typeof window !== 'undefined' && window && window.innerHeight) || 0
    if (!root || !viewport) return
    let height = root.scrollHeight || 0
    if (!height) return // no layout yet — not measurable
    const target = viewport * conf.viewportCoverage
    const rOpts = rangeOpts()
    while (
      session.mountedThrough < blocks.length &&
      height < target &&
      now() - sliceStart < conf.sliceCeilingMs
    ) {
      const range = nextRange(blocks, session.mountedThrough, rOpts)
      if (!range) break
      mountRangeExtend(range)
      if (typeof conf.onRangeMounted === 'function') conf.onRangeMounted(range)
      height = root.scrollHeight || 0
    }
  }

  // ── the slice worker: bounded mount loop shared by the scheduler tail and
  //    the on-demand navigation mounts. Yields (returns more=true) whenever
  //    the ~12 ms budget is exhausted after a finished range; never STARTS a
  //    range once accumulated work passed the 300 ms ceiling. ─────────────

  function runSlice (stopAfterIndex, own) {
    if (!session || session !== own || session.status !== 'tailing') return false
    const state = cs()
    const sliceStart = now()
    let more = false
    while (session.mountedThrough < state.blocks.length) {
      const elapsed = now() - sliceStart
      if (elapsed >= conf.sliceCeilingMs) {
        more = true
        break
      }
      if (elapsed >= conf.sliceBudgetMs) {
        more = true
        break
      }
      const range = nextRange(state.blocks, session.mountedThrough, rangeOpts())
      if (!range) break
      mountRangeExtend(range)
      session.ranges++
      if (typeof conf.onRangeMounted === 'function') conf.onRangeMounted(range)
      if (stopAfterIndex != null && session.mountedThrough > stopAfterIndex) {
        break
      }
    }
    more = session.status === 'tailing' && session.mountedThrough < state.blocks.length
    if (!more) {
      finishProgressive()
    }
    return more
  }

  function finishProgressive () {
    session.status = 'done'
    session.served = 'progressive'
    if (scheduler) {
      scheduler.cancel()
      scheduler = null
    }
    dispatch(BLOCK_TAIL_MOUNT_DONE, {
      blocks: session.mountedThrough,
      ms: Math.max(0, Math.round(now() - session.startedAt))
    })
    dispatch(BLOCK_MOUNT_SERVED, { served: 'progressive' })
    session.resolve()
  }

  // R-3 catch-all: abandon the attempt, clear progressive state, complete the
  // open through the legacy single-pass mount from the CURRENT model, and
  // record served=legacy. Never leaves a blank/partial editor without the
  // marker — the legacy marker is dispatched even if the legacy render
  // itself throws (the error is recorded and surfaced through info()).
  function fallback (err) {
    if (!session || session.status === 'done' || session.status === 'cancelled') return
    const own = session
    if (scheduler) {
      scheduler.cancel()
      scheduler = null
    }
    own.status = 'fallback'
    own.served = 'legacy'
    own.error = err
    // Clear partial progressive state: region bookkeeping is void after the
    // full remount (everything is mounted through the legacy path).
    own.frozen = []
    own.anchorKey = null
    own.anchorIdx = -1
    own.mountedThrough = 0
    // eslint-disable-next-line no-console
    console.warn(
      `[Muya][progressive][BLOCK_PROGRESSIVE_FALLBACK] reason=${err && err.reasonCode ? err.reasonCode : 'unexpected'}`
    )
    try {
      // Legacy completion: renders the CURRENT model — accepted edits typed
      // since open are part of the model and survive (R-3/corner-3).
      cs().render(true)
    } catch (legacyErr) {
      own.error = legacyErr
    } finally {
      dispatch(BLOCK_MOUNT_SERVED, { served: 'legacy' })
      own.resolve()
    }
  }

  // The scheduler worker: exception-safe — a throw from any mount primitive
  // (chunking, guard, unexpected) is owned by the catch-all fallback, never
  // propagated into a scheduler lane.
  function makeWorker (own) {
    return () => {
      try {
        return runSlice(null, own)
      } catch (err) {
        fallback(err)
        return false
      }
    }
  }

  // ── public surface ──────────────────────────────────────────────────────

  function open (markdown, openOpts = {}) {
    conf = { ...baseConf, ...openOpts }
    if (session && (session.status === 'sync' || session.status === 'tailing')) {
      cancel('superseded')
    }
    const own = {
      id: ++sessionCounter,
      status: 'sync',
      startedAt: now(),
      mountedThrough: 0,
      anchorIdx: -1,
      anchorKey: null,
      frozen: [],
      oversizedUnits: 0,
      ranges: 0,
      syncRegionBlocks: 0,
      totalBlocks: 0,
      served: null,
      error: null,
      resolve: null
    }
    session = own
    let doneResolve
    const done = new Promise((resolve) => {
      doneResolve = resolve
    })
    own.resolve = doneResolve

    try {
      const state = cs()
      // Parse the document WHOLE (R-1): the model is complete from here on.
      state.importMarkdown(markdown)
      // Parity with the legacy setMarkdown content-load path (FIX-019 stale
      // selection invalidation + input-ready cursor at document start).
      state.selectedTableCells = null
      state.selectedImage = null
      state.importCursor(null)

      const blocks = state.blocks
      own.totalBlocks = blocks.length
      // Whole-model reference labels — links in the unmounted tail resolve.
      state.stateRender.collectLabels(blocks)

      // Synchronous region: first syncRegionBlocks top-level blocks (T-002:
      // ~11 ms at both measured shapes).
      const initial = Math.min(Math.max(1, conf.syncRegionBlocks), blocks.length)
      mountRangeFresh(0, initial)
      if (typeof conf.onRangeMounted === 'function') {
        conf.onRangeMounted({ start: 0, end: initial })
      }

      // Viewport coverage when layout is measurable (browser only).
      extendForViewport(own.startedAt)

      own.syncRegionBlocks = own.mountedThrough
      own.status = own.mountedThrough < blocks.length ? 'tailing' : 'done'
      // Content-free marker: counters only.
      dispatch(BLOCK_SYNC_REGION_DONE, { blocks: own.mountedThrough })
      // dispatchChange parity with setMarkdown: model readers (word count,
      // TOC, search, save) get complete-document results immediately (R-2
      // corner-6), even while the DOM tail is still pending.
      setTimeout(() => {
        try {
          if (typeof muya.dispatchChange === 'function') muya.dispatchChange()
        } catch {
          /* advisory only; an editor mid-fallback re-renders */
        }
      }, 0)

      if (own.status === 'done') {
        finishProgressive()
      } else {
        scheduler = createScheduler({ ...conf.scheduler, now })
        scheduler.start(makeWorker(own))
      }
    } catch (err) {
      fallback(err)
    }
    return { done, info: snapshot }
  }

  // On-demand region mount for navigation (R-2): mounts the target region
  // synchronously-ish — the same bounded loop, bounded by the same ceiling —
  // then either returns mounted:true or leaves the tail scheduler resuming
  // toward the target. The destination is never left blank: if the ceiling
  // stops the loop short, the scheduler keeps extending toward the target.
  function mountToIndex (index) {
    if (!session) return { mounted: false, reason: 'no-session' }
    if (session.status === 'done') {
      return { mounted: true, already: true, mountedThrough: session.mountedThrough }
    }
    if (session.status !== 'tailing') return { mounted: false, reason: session.status }
    const own = session
    try {
      const blocks = cs().blocks
      if (index < own.mountedThrough) {
        return { mounted: true, already: true, mountedThrough: own.mountedThrough }
      }
      if (index >= blocks.length) index = blocks.length - 1
      runSlice(index, own)
      const mounted = own.mountedThrough > index
      return { mounted, mountedThrough: own.mountedThrough }
    } catch (err) {
      fallback(err)
      return { mounted: session.status === 'done', mountedThrough: session.mountedThrough, fallback: true }
    }
  }

  function mountToBlockKey (key) {
    if (!session) return { mounted: false, reason: 'no-session' }
    if (session.status === 'done') return { mounted: true, already: true }
    if (session.status !== 'tailing') return { mounted: false, reason: session.status }
    const state = cs()
    let block = state.getBlock(key)
    if (!block) return { mounted: false, reason: 'unknown-key' }
    while (block.parent) block = block.parent
    const index = state.blocks.indexOf(block)
    if (index === -1) return { mounted: false, reason: 'unknown-key' }
    return mountToIndex(index)
  }

  // Offset variant (best-effort): maps a serialized-markdown character offset
  // onto a top-level block by accumulating per-block ExportMarkdown output
  // (exact per block, early exit). Offsets are advisory for navigation — the
  // mounted region carries the margin.
  function mountToOffset (offset) {
    if (!session) return { mounted: false, reason: 'no-session' }
    if (session.status === 'done') return { mounted: true, already: true }
    if (session.status !== 'tailing') return { mounted: false, reason: session.status }
    const blocks = cs().blocks
    let acc = 0
    let target = blocks.length - 1
    for (let i = 0; i < blocks.length; i++) {
      const len = new ExportMarkdown([blocks[i]]).generate().length + 1
      if (offset <= acc + len) {
        target = i
        break
      }
      acc += len
    }
    return mountToIndex(target)
  }

  // R-2 prefix-mismatch reset: a content replacement (setMarkdown called
  // again) or teardown cancels the pending tail; the new open proceeds fresh
  // through whatever path serves it.
  function cancel (reason = 'api') {
    if (!session) return
    const own = session
    if (scheduler) {
      scheduler.cancel()
      scheduler = null
    }
    if (own.status === 'sync' || own.status === 'tailing') {
      own.status = 'cancelled'
      own.cancelReason = reason
      own.resolve()
    }
  }

  function snapshot () {
    if (!session) return null
    return {
      id: session.id,
      status: session.status,
      served: session.served,
      totalBlocks: session.totalBlocks,
      mountedThrough: session.mountedThrough,
      syncRegionBlocks: session.syncRegionBlocks,
      frozen: session.frozen.map((r) => ({ ...r })),
      oversizedUnits: session.oversizedUnits,
      ranges: session.ranges,
      elapsedMs: session.startedAt ? Math.round(now() - session.startedAt) : 0,
      error: session.error ? String(session.error.reasonCode || session.error.message) : null
    }
  }

  return {
    open,
    mountToBlockKey,
    mountToOffset,
    cancel,
    info: snapshot,
    // Test/diagnostic helpers (content-free; pure region-math re-exports).
    isMountedIndex: (index) => isMountedIndex(session ? session.frozen : [], index),
    contentBytes
  }
}
