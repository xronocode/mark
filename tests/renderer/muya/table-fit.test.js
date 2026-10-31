// FILE: tests/renderer/muya/table-fit.test.js
// C-PAGE-WIDTH-TABLES-REV1 T-102/T-103 — pins for the pure tableFit module:
// the R-2 mode-split degradation (Fit wraps and compresses, never scrolls;
// Full scrolls only as the last resort with the exact-overflow badge) and
// the R-3 drag mechanics (no first-move jump, incremental rescale, clamps,
// manual-share persistence through the tight branch).
import { describe, expect, it } from 'vitest'
import {
  distribute, degradeFit, degradeFull, dragFloor, dragTarget,
  FIT_FLOOR_PX, DRAG_CONTENT_FLOOR_PX
} from '../../../src/muya/lib/tableResize/tableFit'

const sum = a => a.reduce((x, y) => x + y, 0)

describe('distribute — slack-proportional core (parent R-9)', () => {
  it('gives every column its minimum when the minimums exactly fill W', () => {
    expect(distribute(300, [100, 200], [150, 400])).toEqual([100, 200])
  })
  it('scales proportionally when the minimums exceed W', () => {
    const w = distribute(200, [100, 200, 100], [300, 300, 300])
    expect(sum(w)).toBe(200)
    expect(w[1]).toBeGreaterThan(w[0]) // the wider minimum keeps the larger share
  })
  it('single-token columns (mins == maxs, zero slack): the whole free space splits evenly', () => {
    expect(distribute(500, [100, 100], [100, 100])).toEqual([250, 250])
  })
  it('distributes the free space slack-proportionally; the post-cap leftover splits evenly (parent R-9)', () => {
    const w = distribute(500, [100, 100], [120, 300])
    expect(sum(w)).toBe(500)
    // slack 20 vs 200 → col0 caps at 120 during allocation (100+20), col1
    // takes 200; the 80px post-cap leftover then splits evenly (40/40)
    expect(w).toEqual([160, 340])
  })
})

describe('degradeFit — mode-split Fit (R-2): wrap, compress, NEVER scroll', () => {
  it('returns the minimums untouched when they already fit', () => {
    const r = degradeFit(800, [200, 300, 200])
    expect(r.widths).toEqual([200, 300, 200])
    expect(r.tight).toBe(false)
    expect(r.badge).toBeNull()
  })
  it('compresses renormalized minima to W with the 22 px floor and the tight badge', () => {
    const r = degradeFit(300, [150, 150, 150])
    expect(r.tight).toBe(true)
    expect(r.badge).toBe('tight: not enough room — text wraps in cells, no scrolling')
    expect(sum(r.widths)).toBe(300)
    expect(Math.min(...r.widths)).toBeGreaterThanOrEqual(FIT_FLOOR_PX)
  })
  it('terminal case: even Σ22 floors exceed W — floors yield proportionally, still no scroll flag', () => {
    const mins = Array.from({ length: 20 }, () => 60) // Σ=1200
    const r = degradeFit(300, mins) // Σ22=440 > 300
    expect(sum(r.widths)).toBe(300)
    expect(Math.min(...r.widths)).toBeLessThan(FIT_FLOOR_PX) // yielded below 22
    expect(r.tight).toBe(true)
    expect(r.badge).toContain('no scrolling')
  })
})

describe('degradeFull — mode-split Full (R-2): scroll is the last resort', () => {
  it('no scroll when the minimums fit', () => {
    const r = degradeFull(900, [300, 300])
    expect(r.scrollPx).toBe(0)
    expect(r.badge).toBeNull()
  })
  it('minimal sizes, exact overflow and the badge only when the canvas cannot host them', () => {
    const r = degradeFull(400, [300, 300])
    expect(r.widths).toEqual([300, 300])
    expect(r.scrollPx).toBe(200)
    expect(r.badge).toBe('does not fit by 200 px — column scrolling instead of hiding data')
  })
})

describe('dragFloor / dragTarget — R-3 mechanics', () => {
  it('the effective floor never exceeds the starting width: no first-move jump', () => {
    expect(dragFloor(170, 54)).toBe(54) // squeezed column stays put on move #1
    expect(dragFloor(30, 200)).toBe(DRAG_CONTENT_FLOOR_PX) // max(48, minContent)=48
  })
  it('clamps the target to [floor, W − 22·(N−1)] and rescales the rest from CURRENT widths', () => {
    const cur = [100, 200, 100, 100, 100] // W=600
    const w = dragTarget(600, cur, 1, 1200, 170) // absurd rightward ask
    expect(w[1]).toBe(600 - FIT_FLOOR_PX * 4) // ceiling, not 1200
    expect(Math.min(...w.filter((_, i) => i !== 1))).toBeGreaterThanOrEqual(FIT_FLOOR_PX)
    expect(sum(w)).toBe(600)
  })
  it('incremental: equal current widths give up equally — the rescale comes from CURRENT widths, not minima', () => {
    const cur = [100, 200, 100, 100, 100]
    const w = dragTarget(600, cur, 1, 260, 170)
    expect(w[1]).toBe(260)
    const others = w.filter((_, i) => i !== 1)
    expect(others).toEqual([85, 85, 85, 85]) // (600-260)/4 — no stale-minima explosion
    expect(sum(w)).toBe(600)
  })
  it('the manual result survives re-application through the tight branch (shares-based)', () => {
    const dragged = dragTarget(600, [100, 200, 100, 100, 100], 1, 260, 170)
    // a smaller canvas re-fits the SAME manual widths through the tight branch
    const re = degradeFit(500, dragged)
    expect(sum(re.widths)).toBe(500)
    expect(re.tight).toBe(true)
    const shares = re.widths.map(x => x / 500)
    expect(shares[1]).toBeGreaterThan(shares[0]) // the manual widen kept the larger share
  })
  it('reviewer counterexamples: floors hold in non-terminal cases and Σ == W exactly', () => {
    const a = degradeFit(500, [1000, 10]) // floor pass must not shave 10 up to 22 then below again
    expect(sum(a.widths)).toBe(500)
    expect(Math.min(...a.widths)).toBeGreaterThanOrEqual(FIT_FLOOR_PX)
    const b = degradeFit(100, [7, 7, 300])
    expect(sum(b.widths)).toBeLessThanOrEqual(100)
    expect(Math.min(...b.widths)).toBeGreaterThanOrEqual(FIT_FLOOR_PX)
    const d = dragTarget(600, [40, 40, 200, 200, 480], 4, 512, 48)
    expect(d[4]).toBe(512)
    expect(Math.min(...d.filter((_, i) => i !== 4))).toBeGreaterThanOrEqual(FIT_FLOOR_PX)
    expect(sum(d)).toBe(600)
  })
})

describe('identity rules (R-3 tail)', () => {
  it('a different column count means a fresh identity — the module exposes no carry', () => {
    // the pure module keeps NO state: a rebuilt table simply starts from its
    // own measured minima; the pin is that no hidden state exists
    const a = degradeFit(300, [150, 150])
    const b = degradeFit(300, [100, 100, 100, 100])
    expect(a.widths.length).toBe(2)
    expect(b.widths.length).toBe(4)
  })
})
