// FILE: src/muya/lib/progressive/regions.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Pure region math for the progressive mount subsystem
//            (C-LARGE-DOC-WAVE-A T-003, R-1/R-2/R-3): top-level block-range
//            computation, frozen-region bookkeeping predicates, guarded
//            block-content sizing, and oversized-block single-unit handling.
//   SCOPE: Pure functions over the parsed block tree — no DOM, no muya
//            instance, no scheduling. Boundaries are ALWAYS top-level block
//            indexes of the parsed tree (never character offsets — R-2);
//            oversized single blocks (content above the byte threshold) mount
//            through the same range machinery as ONE unit — a mount range is
//            never cut INSIDE a block; the depth/traversal guard bounds every
//            walk (a subtree deeper than the cap, or a walk past the node cap,
//            is treated as oversized so it degrades to a single as-is mount
//            unit instead of an unbounded traversal).
//   DEPENDS: none (leaf module; TextEncoder lazily when the engine provides
//            it, otherwise a character-count byte approximation).
//   LINKS: .grace/changes/active/C-LARGE-DOC-WAVE-A (spec R-1/R-2/R-3; plan
//          T-003 corners 4 and 6); M-063 routing lands with T-008.
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   OVERSIZED_BLOCK_BYTES - content threshold (64 KB) above which a single top-level block mounts as its own one-block range.
//   DEPTH_CAP - mount-walk guard: maximum subtree depth (64) for the guarded size walk.
//   NODE_CAP - mount-walk guard: maximum nodes visited per size walk (200000); a guard trip sizes the block as oversized single-unit.
//   contentBytes - guarded UTF-8-aware content size of a block subtree (TextEncoder bytes).
//   nextRange - the next top-level range to mount from an index: a bounded chunk of normal blocks, or a one-block range for an oversized block.
//   isMountedIndex - frozen-region predicate: whether a top-level index sits inside any recorded [start, end) mount range.
//   frozenRangesAreValid - bookkeeping invariant: ranges are half-open, ordered, non-overlapping and only extend forward.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: [1.0.0 - 2026-11-02 - C-LARGE-DOC-WAVE-A T-003: initial
//                 region math — boundaries at top-level block indexes,
//                 oversized single-unit ranges, depth/node-guarded sizing,
//                 frozen-range predicates.]
// END_CHANGE_SUMMARY

// T-002 grounded defaults: the synchronous region is the first ~100 blocks
// (~11 ms at both measured shapes) and background chunks are 50–100 blocks.
// The oversized threshold is the task-fixed example (64 KB).
export const OVERSIZED_BLOCK_BYTES = 64 * 1024
export const DEPTH_CAP = 64
export const NODE_CAP = 200000

let textEncoder = null
const getEncoder = () => {
  if (textEncoder === null) {
    textEncoder = typeof TextEncoder === 'function' ? new TextEncoder() : false
  }
  return textEncoder
}

const textBytes = (text) => {
  if (!text) return 0
  const encoder = getEncoder()
  // No TextEncoder (exotic engine): approximate bytes with code units — the
  // threshold is a coarse guard, never a split point (we never cut inside a
  // block), so the approximation only shifts which blocks get isolated.
  if (!encoder) return text.length
  return encoder.encode(text).length
}

/**
 * Guarded content size of a block subtree, in bytes (UTF-8 aware).
 *
 * Depth/traversal guard (R-3): a subtree deeper than `depthCap`, or a walk
 * that would visit more than `nodeCap` nodes, returns POSITIVE_INFINITY —
 * the caller treats the block as oversized, mounts it as-is as a single
 * unit, and never recurses further. `counters` (optional, { nodes }) lets
 * tests observe that the walk really was bounded.
 */
export function contentBytes (block, { depthCap = DEPTH_CAP, nodeCap = NODE_CAP, counters } = {}) {
  if (!block || typeof block !== 'object') return 0
  let nodes = 0
  const walk = (node, depth) => {
    nodes++
    if (counters && Number.isFinite(counters.nodes)) counters.nodes = nodes
    if (depth > depthCap || nodes > nodeCap) return Number.POSITIVE_INFINITY
    let total = textBytes(node.text)
    const children = node.children
    if (Array.isArray(children)) {
      for (const child of children) {
        const childTotal = walk(child, depth + 1)
        if (!Number.isFinite(childTotal)) return Number.POSITIVE_INFINITY
        total += childTotal
      }
    }
    return total
  }
  return walk(block, 0)
}

/**
 * The next mount range starting at top-level index `fromIndex`.
 *
 * Returns { start, end, oversizedUnits } (half-open [start, end)) or null
 * when fromIndex is past the end. An oversized block always becomes a
 * one-block range of its own (a giant paragraph/code block is ONE mount
 * unit — content is never chunked inside a block); a normal chunk stops
 * BEFORE a following oversized block so the giant one is isolated next.
 */
export function nextRange (blocks, fromIndex, { chunkBlocks = 50, oversizedBytes = OVERSIZED_BLOCK_BYTES, depthCap = DEPTH_CAP, nodeCap = NODE_CAP, counters } = {}) {
  if (!Array.isArray(blocks) || fromIndex < 0 || fromIndex >= blocks.length) return null
  if (contentBytes(blocks[fromIndex], { depthCap, nodeCap, counters }) > oversizedBytes) {
    return { start: fromIndex, end: fromIndex + 1, oversizedUnits: 1 }
  }
  const maxEnd = Math.min(blocks.length, fromIndex + Math.max(1, chunkBlocks))
  let end = fromIndex + 1
  while (end < maxEnd) {
    if (contentBytes(blocks[end], { depthCap, nodeCap, counters }) > oversizedBytes) break
    end++
  }
  return { start: fromIndex, end, oversizedUnits: 0 }
}

/**
 * Frozen-region predicate: true when top-level index `index` lies inside any
 * recorded half-open [start, end) mount range.
 */
export function isMountedIndex (frozenRanges, index) {
  return (frozenRanges || []).some(({ start, end }) => index >= start && index < end)
}

/**
 * Bookkeeping invariant for the frozen-region log (used by tests and by the
 * controller after every extension): ranges are ordered by start, each range
 * starts exactly where the previous one ended (forward extensions only) and
 * none is empty. Mounted regions are frozen — the log only ever grows
 * forward, never re-covers, never re-orders. NOTE: this is the NO-EDIT
 * invariant — accepted edits insert/delete top-level blocks and shift the
 * index space, so a session that took edits mid-tail may record ranges whose
 * indexes are no longer contiguous; frozen semantics still hold (block keys
 * already mounted are never re-sent as new ranges).
 */
export function frozenRangesAreValid (frozenRanges) {
  const ranges = frozenRanges || []
  let expectedStart = 0
  for (const range of ranges) {
    const { start, end } = range
    if (!Number.isInteger(start) || !Number.isInteger(end)) return false
    if (start !== expectedStart || end <= start) return false
    expectedStart = end
  }
  return true
}
