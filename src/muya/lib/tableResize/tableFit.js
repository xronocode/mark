// FILE: src/muya/lib/tableResize/tableFit.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: C-PAGE-WIDTH-TABLES-REV1 T-102/T-103 — the pure column-width
//   algorithm behind the mode-split degradation and the Fit drag: measure
//   min/max content widths, distribute free space slack-proportionally,
//   degrade by mode (Fit wraps and compresses with a 22 px floor and never
//   scrolls; Full keeps minimal sizes with an exact-overflow scroll as the
//   last resort), and compute drag targets whose floors can never force a
//   first-move jump, with incremental re-fitting of the remaining columns
//   and manual-share persistence through the tight branch.
//   SCOPE: Pure functions only — no DOM reads, no muya imports, no state.
//   Callers own measurement (cell text, fonts, container width W) and DOM
//   application; this module turns numbers into decisions. Exports:
//   distribute, degradeFit, degradeFull, dragFloor, dragTarget — the exact
//   REV1 R-2/R-3 semantics, deterministic and unit-pinned.
//   DEPENDS: nothing (pure; ES module).
//   LINKS: C-PAGE-WIDTH-TABLES-REV1 R-2/R-3 (the bundle lives untracked in the main checkout while the amendment line settles — reference by change id);
//   tableResize/index.js fit path (DOM application — wired in the next
//   sub-stage); tests/renderer/muya/table-fit.test.js (pins).
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   FIT_FLOOR_PX - the per-column absolute floor of the Fit compression (22).
//   DRAG_CONTENT_FLOOR_PX - the drag content floor base (48, MIN_COLUMN_WIDTH).
//   distribute - slack-proportional distribution capped at maxContent with an even split of the leftover (the parent R-9 core).
//   degradeFit - mode-split Fit: renormalized minima scaled to W, 22 px floor, terminal proportional yield below it; never reports scrolling; returns widths, tight and badge.
//   degradeFull - mode-split Full: minimal sizes plus the exact overflow in px; scrolling only as the last resort.
//   dragFloor - the effective floor that never exceeds the starting width (no first-move jump, R-3).
//   dragTarget - the clamped drag target and the incremental rescale of the remaining columns from their current widths.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - 2026-10-31 C-PAGE-WIDTH-TABLES-REV1 T-102/T-103:
//   new pure module — the REV1 R-2 mode-split degradation and R-3 drag
//   mechanics as deterministic functions (DOM application wired later).
//   PREV: none.
// END_CHANGE_SUMMARY

// The Fit compression floor and the drag content-floor base. 22 px is the
// REV1 R-2 per-column absolute floor; 48 px is the shipped MIN_COLUMN_WIDTH
// that the drag content floor builds on (tableResize/index.js).
export const FIT_FLOOR_PX = 22
export const DRAG_CONTENT_FLOOR_PX = 48

// Slack-proportional distribution capped at maxContent with an even split
// of whatever remains after all caps (the CSS auto-layout behaviour the
// parent R-9 pins). Deterministic: rounding leftovers go to the frontmost
// columns.
export function distribute (W, mins, maxs) {
  const n = mins.length
  if (n === 0) return []
  if (W <= 0) return mins.map(() => 0)
  const sumMin = mins.reduce((a, b) => a + b, 0)
  if (sumMin >= W) return mins.map(m => Math.round((m / sumMin) * W))
  const slack = mins.map((m, i) => Math.max(0, (maxs[i] || m) - m))
  const totalSlack = slack.reduce((a, b) => a + b, 0)
  const widths = mins.slice()
  const free = W - sumMin
  if (totalSlack > 0) {
    for (let i = 0; i < n; i++) {
      widths[i] += Math.min(slack[i], Math.floor((slack[i] / totalSlack) * free))
    }
  }
  // the post-cap leftover splits evenly regardless of slack (single-token
  // columns have mins == maxs: totalSlack === 0 and the whole free space
  // is leftover — the parent R-9 even split)
  let leftover = free - (widths.reduce((a, b) => a + b, 0) - sumMin)
  for (let i = 0; leftover > 0 && n > 0; i = (i + 1) % n) { widths[i] += 1; leftover-- }
  return widths.map(Math.round)
}

// Floor-preserving normalization to exactly Σ == W: lift nothing below the
// floor, shave the excess from the widest columns, distribute any deficit
// round-robin. Only when even Σfloor exceeds W (the terminal case) do the
// floors yield, proportionally. Shared by degradeFit and dragTarget.
function normalizeTo (w, W, floor) {
  const total = w.reduce((a, b) => a + b, 0) || 1
  let out = w.map(x => Math.max(floor, Math.round((x / total) * W)))
  let s = out.reduce((a, b) => a + b, 0)
  while (s > W) {
    const i = out.indexOf(Math.max(...out))
    if (out[i] <= floor) break // terminal: even the floors exceed W
    out[i]--; s--
  }
  if (s > W) { // terminal proportional yield below the floor
    out = out.map(x => Math.round((x * W) / s))
    s = out.reduce((a, b) => a + b, 0)
  }
  for (let i = 0; s < W && out.length; i = (i + 1) % out.length) { out[i]++; s++ }
  while (s > W) { const i = out.indexOf(Math.max(...out)); out[i]--; s-- }
  return out
}

// REV1 R-2, Fit page: renormalized minima scaled to W with a 22 px floor;
// in the terminal case (Σ22 > W) the floors yield proportionally below 22 —
// Fit NEVER scrolls. tight=true whenever the input minima did not fit.
export function degradeFit (W, mins) {
  const sumMin = mins.reduce((a, b) => a + b, 0)
  if (sumMin <= W) return { widths: mins.map(Math.round), tight: false, badge: null }
  return {
    widths: normalizeTo(mins, W, FIT_FLOOR_PX),
    tight: true,
    badge: 'tight: not enough room — text wraps in cells, no scrolling'
  }
}

// REV1 R-2, Full width: minimal sizes; scrolling plus the exact-overflow
// badge ONLY as the last resort (Σmin > W). scrollPx === 0 means no scroll.
export function degradeFull (W, mins) {
  const sumMin = mins.reduce((a, b) => a + b, 0)
  if (sumMin <= W) return { widths: mins.map(Math.round), scrollPx: 0, badge: null }
  return {
    widths: mins.map(Math.round),
    scrollPx: sumMin - W,
    badge: 'does not fit by ' + (sumMin - W) + ' px — column scrolling instead of hiding data'
  }
}

// REV1 R-3: the effective floor can never exceed the starting width — the
// first pointer move never jumps a squeezed column up to its content floor.
export function dragFloor (minContent, startingWidth) {
  const contentFloor = Math.max(DRAG_CONTENT_FLOOR_PX, minContent)
  return Math.min(contentFloor, Math.round(startingWidth))
}

// REV1 R-3 mechanics: the clamped target, and the OTHER columns rescaled
// incrementally from their CURRENT widths toward (W − target) with 22 px
// floors — never re-derived from stale content minima. Manual shares are
// the caller's persistence concern (renormalized identities per R-3 tail).
export function dragTarget (W, cur, ci, target, minContent) {
  const n = cur.length
  const floor = dragFloor(minContent, cur[ci])
  let t = Math.max(floor, Math.round(target))
  t = Math.min(t, Math.max(floor, W - FIT_FLOOR_PX * (n - 1)))
  const rest = cur.reduce((a, b) => a + b, 0) - cur[ci]
  const k = rest > 0 ? (W - t) / rest : 1
  // normalize ONLY the remaining columns to (W - t): the dragged column
  // keeps its clamped target exactly, so Σwidths == W for n >= 2 (a
  // single-column drag is a degenerate frame underfill the caller owns)
  const scaledOthers = []
  cur.forEach((w, i) => { if (i !== ci) scaledOthers.push(w * k) })
  const normalized = normalizeTo(scaledOthers, W - t, FIT_FLOOR_PX)
  let j = 0
  return cur.map((w, i) => (i === ci ? t : normalized[j++]))
}
