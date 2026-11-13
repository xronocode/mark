// FILE: tests/renderer/perf/progressive-equivalence.test.js
// VERSION: 1.0.0
// @vitest-environment jsdom
// START_MODULE_CONTRACT
//   PURPOSE: C-LARGE-DOC-WAVE-A T-003 tier-1 unit suite for the progressive
//            mount subsystem (R-1/R-2/R-3, corners 3/4/6): region bookkeeping
//            (frozen ranges, boundaries, index math), oversized-block
//            single-unit handling, depth/traversal guard caps, scheduler
//            budget/yield logic with injected clock and captured lanes,
//            fallback-preserves-model on injected failure (also after an
//            accepted edit), content-free marker payloads, prefix-mismatch
//            reset, on-demand navigation mounts, and model completeness for
//            consumers before tail completion.
//   SCOPE: TWO MODES, stated per suite:
//            (a) PURE-LOGIC — regions.js/scheduler arithmetic on synthetic
//                block trees, no DOM;
//            (b) REAL-MOUNT jsdom — full real Muya instances with REAL
//                snabbdom patching (proven feasible: full render, region
//                render and anchored extension all work under jsdom) and the
//                progressive controller driven through manually captured
//                scheduler lanes with an injected fake clock, so budget and
//                yield behavior is deterministic (machine-speed independent).
//            Real keyboard input is NOT simulated here (jsdom lacks
//            execCommand/insertText default actions); input-during-tail is
//            proven at the e2e tier via the bench page probe (T-003 proof)
//            and the typing injector (T-005/T-006). The edit-during-tail
//            suites below simulate the edit path at its model+render seam
//            (the same seam muya's inputCtrl drives).
//   DEPENDS: muya/lib (Muya, progressive subsystem, markers), real corpus
//            fixture mixed-100k.md for the equivalence oracle.
//   LINKS: .grace/changes/archive/C-LARGE-DOC-WAVE-A plan T-003; M-063/V-M-063
//          routing lands with T-008; V-M-060 perf tier.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   corpusDir - committed large-doc corpus directory.
//   fixture - corpus file reader.
//   blockDoc - synthetic many-block fixture builder.
//   giantDoc - synthetic oversized-paragraph fixture builder.
//   deepBlock - synthetic deep-nesting fixture builder.
//   instances - auto-cleanup registry of real Muya instances.
//   makeInstance - real Muya instance on a fresh body div, registered for cleanup.
//   rootOf - own-container root helper.
//   topLevelCount - top-level DOM block count helper.
//   manualLanes - captured scheduler lanes + fake clock for manual pumping.
//   starvingLanes - input-starved lanes proving the timer completion guarantee.
//   collectMarkers - subscribe the three content-free markers on an instance.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: [1.0.0 - 2026-11-02 - C-LARGE-DOC-WAVE-A T-003: initial
//                 progressive-equivalence unit suite.]
// END_CHANGE_SUMMARY

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it, expect, afterEach } from 'vitest'

import Muya from 'muya/lib'
import {
  BLOCK_MOUNT_SERVED,
  BLOCK_SYNC_REGION_DONE,
  BLOCK_TAIL_MOUNT_DONE
} from 'muya/lib/progressive/markers'
import {
  nextRange,
  contentBytes,
  isMountedIndex,
  frozenRangesAreValid,
  DEPTH_CAP
} from 'muya/lib/progressive/regions'

const corpusDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../e2e/fixtures/large-doc')
const fixture = (name) => readFileSync(path.join(corpusDir, name), 'utf8')

// ── fixtures ───────────────────────────────────────────────────────────────

// ~n top-level blocks of mixed shapes (paragraphs, headings, lists, code).
function blockDoc (n) {
  const parts = ['# ZYNQSENTINEL doc start', '']
  for (let i = 1; i < n; i++) {
    const kind = i % 5
    if (kind === 0) parts.push(`## Section ${i}`, '')
    else if (kind === 1) parts.push(`Paragraph ${i} with some words to render.`, '')
    else if (kind === 2) parts.push(`- list item ${i}a`, `- list item ${i}b`, '')
    else if (kind === 3) parts.push('```', `code line ${i}`, '```', '')
    else parts.push(`> Quote ${i} text.`, '')
  }
  return parts.join('\n')
}

// One oversized (>64 KB) paragraph buried mid-document.
function giantDoc () {
  const giant = 'giant '.repeat(11000) // ~77 KB — above the 64 KB threshold
  return blockDoc(6) + '\n' + giant + '\n\n' + blockDoc(6).slice('# ZYNQSENTINEL doc start\n\n'.length)
}

// Synthetic deep subtree (no DOM): a chain `depth` levels deep.
function deepBlock (depth) {
  let node = { key: 'leaf', text: 'x', children: [] }
  for (let i = 1; i < depth; i++) {
    node = { key: `d${i}`, text: '', children: [node] }
  }
  return node
}

// ── real-mount plumbing ────────────────────────────────────────────────────

const instances = []
function makeInstance (markdown = '') {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const editor = new Muya(host, { markdown, t: (k) => k })
  instances.push(editor)
  return editor
}

afterEach(() => {
  for (const editor of instances.splice(0)) {
    try {
      editor.destroy()
    } catch {
      /* teardown isolation only */
    }
    if (editor.container && editor.container.remove) editor.container.remove()
  }
  document.body.innerHTML = ''
})

function rootOf (editor) {
  return editor.container.querySelector('div#ag-editor-id')
}

function topLevelCount (editor) {
  const root = rootOf(editor)
  return root ? root.children.length : -1
}

// Captured scheduler lanes + fake clock: fully deterministic tail driving.
function manualLanes () {
  const yieldQ = []
  const timers = []
  return {
    scheduler: {
      requestIdle: null, // force the message lane
      postYield: (cb) => {
        yieldQ.push(cb)
        return () => {
          const at = yieldQ.indexOf(cb)
          if (at > -1) yieldQ.splice(at, 1)
        }
      },
      setTimer: (cb) => {
        timers.push(cb)
        return () => {
          const at = timers.indexOf(cb)
          if (at > -1) timers.splice(at, 1)
        }
      }
    },
    driveYield: () => {
      const cb = yieldQ.shift()
      if (cb) cb()
    },
    driveTimers: () => {
      for (const cb of [...timers]) cb()
    },
    pendingYields: () => yieldQ.length,
    pendingTimers: () => timers.length
  }
}

// requestIdleCallback lane that NEVER fires: only the timer lane can work.
function starvingLanes () {
  const lanes = manualLanes()
  lanes.scheduler.requestIdle = () => 1
  lanes.scheduler.postYield = null
  return lanes
}

function collectMarkers (editor) {
  const events = []
  editor.on(BLOCK_MOUNT_SERVED, (payload) => events.push({ name: BLOCK_MOUNT_SERVED, payload }))
  editor.on(BLOCK_SYNC_REGION_DONE, (payload) => events.push({ name: BLOCK_SYNC_REGION_DONE, payload }))
  editor.on(BLOCK_TAIL_MOUNT_DONE, (payload) => events.push({ name: BLOCK_TAIL_MOUNT_DONE, payload }))
  return events
}

// ── MODE (a): PURE-LOGIC — regions math ────────────────────────────────────

describe('T-003 regions (pure logic)', () => {
  const blocks = (n, text = 'word ') => Array.from({ length: n }, (_, i) => ({ key: `k${i}`, text: text + i, children: [] }))

  it('chunks at top-level block boundaries only', () => {
    const bs = blocks(12)
    expect(nextRange(bs, 0, { chunkBlocks: 5 })).toEqual({ start: 0, end: 5, oversizedUnits: 0 })
    expect(nextRange(bs, 5, { chunkBlocks: 5 })).toEqual({ start: 5, end: 10, oversizedUnits: 0 })
    expect(nextRange(bs, 10, { chunkBlocks: 5 })).toEqual({ start: 10, end: 12, oversizedUnits: 0 })
    expect(nextRange(bs, 12, { chunkBlocks: 5 })).toBe(null)
    expect(nextRange(bs, -1, { chunkBlocks: 5 })).toBe(null)
  })

  it('frozen-range bookkeeping: coverage and the no-edit invariant', () => {
    const frozen = [
      { start: 0, end: 10 },
      { start: 10, end: 25 }
    ]
    expect(isMountedIndex(frozen, 0)).toBe(true)
    expect(isMountedIndex(frozen, 24)).toBe(true)
    expect(isMountedIndex(frozen, 25)).toBe(false)
    expect(isMountedIndex(frozen, 99)).toBe(false)
    expect(frozenRangesAreValid(frozen)).toBe(true)
    // Re-covering or out-of-order ranges are invalid — frozen means forward only.
    expect(frozenRangesAreValid([{ start: 0, end: 10 }, { start: 5, end: 12 }])).toBe(false)
    expect(frozenRangesAreValid([{ start: 0, end: 10 }, { start: 12, end: 20 }])).toBe(false)
    expect(frozenRangesAreValid([{ start: 0, end: 0 }])).toBe(false)
  })

  it('oversized single blocks mount as ONE unit — never split inside a block', () => {
    const giantText = 'x'.repeat(70 * 1024)
    const bs = blocks(6)
    bs[3] = { key: 'giant', text: giantText, children: [] }
    const opts = { chunkBlocks: 5, oversizedBytes: 64 * 1024 }
    // The chunk stops BEFORE the giant block.
    expect(nextRange(bs, 0, opts)).toEqual({ start: 0, end: 3, oversizedUnits: 0 })
    // The giant is its own single-block range.
    expect(nextRange(bs, 3, opts)).toEqual({ start: 3, end: 4, oversizedUnits: 1 })
    // A giant at the head is immediately isolated.
    expect(nextRange(bs, 3, opts).oversizedUnits).toBe(1)
    expect(nextRange(bs, 4, opts)).toEqual({ start: 4, end: 6, oversizedUnits: 0 })
  })

  it('depth guard: subtrees deeper than the cap are oversized as-is, with bounded traversal', () => {
    const deep = deepBlock(DEPTH_CAP + 40)
    const counters = { nodes: 0 }
    expect(contentBytes(deep, { counters })).toBe(Number.POSITIVE_INFINITY)
    // The walk stopped at the cap — it never visited the 100+ chain to the end.
    expect(counters.nodes).toBeLessThanOrEqual(DEPTH_CAP + 2)

    // A shallow block sizes normally (bytes ≥ its text).
    const flat = { key: 'f', text: 'hello', children: [] }
    expect(contentBytes(flat)).toBeGreaterThanOrEqual(5)

    // Node cap: a walk that would visit too many nodes trips the guard.
    const wide = { key: 'w', text: '', children: blocks(10) }
    expect(contentBytes(wide, { nodeCap: 5 })).toBe(Number.POSITIVE_INFINITY)
  })
})

// ── MODE (b): REAL-MOUNT jsdom — scheduler budget/yield + lanes ───────────

describe('T-003 scheduler + controller (real-mount jsdom, captured lanes, fake clock)', () => {
  it('budget: a slice yields after one range once the ~12 ms budget is exhausted', () => {
    const editor = makeInstance()
    const doc = blockDoc(80)
    let clock = 0
    const lanes = manualLanes()
    const { done } = editor.progressiveMount(doc, {
      syncRegionBlocks: 10,
      tailChunkBlocks: 5,
      sliceBudgetMs: 12,
      sliceCeilingMs: 300,
      now: () => clock,
      onRangeMounted: () => {
        clock += 15 // each range "costs" 15 ms of fake main-thread time
      },
      scheduler: lanes.scheduler
    })
    const info0 = editor.progressive.info()
    expect(info0.status).toBe('tailing')
    expect(info0.syncRegionBlocks).toBe(10) // jsdom: not measurable -> default region
    expect(topLevelCount(editor)).toBe(10)

    // First driven slice: range 1 (15 ms) exhausts the 12 ms budget -> yield.
    lanes.driveYield()
    expect(editor.progressive.info().mountedThrough).toBe(15)
    lanes.driveYield()
    expect(editor.progressive.info().mountedThrough).toBe(20)
    // ...and the tail still completes by pumping the lane.
    let drives = 2
    while (editor.progressive.info().status === 'tailing') {
      lanes.driveYield()
      drives++
      if (drives > 500) throw new Error('tail did not complete')
    }
    const info = editor.progressive.info()
    expect(info.status).toBe('done')
    expect(info.mountedThrough).toBe(info.totalBlocks)
    expect(topLevelCount(editor)).toBe(info.totalBlocks)
    // No slice ever mounted more than one range while the budget tripped:
    // every drive advanced exactly 5 blocks.
    expect(drives).toBeGreaterThan(5)
    return done
  })

  it('hard ceiling: a slice never STARTS a range past the 300 ms ceiling (budget cannot override it)', () => {
    const editor = makeInstance()
    let clock = 0
    const lanes = manualLanes()
    editor.progressiveMount(blockDoc(60), {
      syncRegionBlocks: 10,
      tailChunkBlocks: 5,
      sliceBudgetMs: 10_000, // budget deliberately huge — the ceiling must bind
      sliceCeilingMs: 300,
      now: () => clock,
      onRangeMounted: () => {
        clock += 310
      },
      scheduler: lanes.scheduler
    })
    lanes.driveYield()
    expect(editor.progressive.info().mountedThrough).toBe(15) // exactly one range
    lanes.driveYield()
    expect(editor.progressive.info().mountedThrough).toBe(20)
  })

  it('starvation guarantee: with the idle lane never firing, the timer lane completes the tail', async () => {
    const editor = makeInstance()
    let clock = 0
    const lanes = starvingLanes()
    const events = collectMarkers(editor)
    const { done } = editor.progressiveMount(blockDoc(50), {
      syncRegionBlocks: 10,
      tailChunkBlocks: 5,
      now: () => clock,
      onRangeMounted: () => {
        clock += 15 // each range costs 15 ms of fake time -> one range per slice
      },
      scheduler: { ...lanes.scheduler, timeoutLaneMs: 100 }
    })
    expect(editor.progressive.info().status).toBe('tailing')
    expect(lanes.pendingYields()).toBe(0) // no message lane at all
    let ticks = 0
    while (editor.progressive.info().status === 'tailing' && ticks < 500) {
      clock += 101 // the timer lane sees no progress within 100 ms -> runs a slice
      lanes.driveTimers()
      ticks++
    }
    const info = editor.progressive.info()
    expect(info.status).toBe('done')
    expect(info.mountedThrough).toBe(info.totalBlocks)
    expect(topLevelCount(editor)).toBe(info.totalBlocks)
    expect(ticks).toBeGreaterThan(2) // progress really came from the timer lane
    await done
    expect(events.some((e) => e.name === BLOCK_TAIL_MOUNT_DONE)).toBe(true)
  })

  it('default engine lanes also complete the tail (real MessageChannel lane)', async () => {
    const editor = makeInstance()
    const events = collectMarkers(editor)
    const { done } = editor.progressiveMount(blockDoc(45), {
      syncRegionBlocks: 10,
      tailChunkBlocks: 5
    })
    await done
    const info = editor.progressive.info()
    expect(info.status).toBe('done')
    expect(info.mountedThrough).toBe(info.totalBlocks)
    expect(topLevelCount(editor)).toBe(info.totalBlocks)
    const names = events.map((e) => e.name)
    expect(names).toContain(BLOCK_SYNC_REGION_DONE)
    expect(names).toContain(BLOCK_TAIL_MOUNT_DONE)
    expect(events.filter((e) => e.name === BLOCK_MOUNT_SERVED)).toEqual([
      { name: BLOCK_MOUNT_SERVED, payload: { served: 'progressive' } }
    ])
  })
})

// ── MODE (b): REAL-MOUNT — equivalence, markers, guards via the real pipeline ──

describe('T-003 equivalence and model completeness (real-mount jsdom)', () => {
  it('sync region mounts first, model is WHOLE from parse on, round-trip is byte-identical to legacy', async () => {
    const corpus = fixture('mixed-100k.md')
    // Legacy reference instance (constructor open = the legacy mount path).
    const legacy = makeInstance(corpus)
    const canon = legacy.getMarkdown()
    expect(canon.length).toBeGreaterThan(1000)
    // Isolate: remove the legacy root before the second instance (the
    // document-global editor-root id is the proven multi-instance trap).
    legacy.container.remove()

    const editor = makeInstance()
    const events = collectMarkers(editor)
    let clock = 0
    const lanes = manualLanes()
    const { done } = editor.progressiveMount(corpus, {
      syncRegionBlocks: 20,
      tailChunkBlocks: 15,
      now: () => clock,
      scheduler: lanes.scheduler
    })

    const info0 = editor.progressive.info()
    const total = info0.totalBlocks
    expect(total).toBeGreaterThan(100)
    // Sync region mounted synchronously; DOM has exactly that many blocks.
    expect(info0.status).toBe('tailing')
    expect(topLevelCount(editor)).toBe(20)
    // Corner 6: model-reading consumers see the COMPLETE document before the
    // tail finishes (only DOM mounting is progressive).
    expect(editor.getMarkdown()).toBe(canon)
    expect(editor.contentState.getBlocks().length).toBe(total)
    const syncMarker = events.find((e) => e.name === BLOCK_SYNC_REGION_DONE)
    expect(syncMarker.payload).toEqual({ blocks: 20 })

    // Complete the tail through the captured lane.
    let drives = 0
    while (editor.progressive.info().status === 'tailing' && drives < 2000) {
      lanes.driveYield()
      drives++
    }
    await done
    const info = editor.progressive.info()
    expect(info.status).toBe('done')
    expect(info.mountedThrough).toBe(total)
    // Final DOM top-level count equals the model's top-level block count.
    expect(topLevelCount(editor)).toBe(total)
    // Canonical Markdown is byte-identical to the legacy round-trip.
    expect(editor.getMarkdown()).toBe(canon)
    // Region bookkeeping: frozen ranges are contiguous from 0 and cover everything.
    expect(frozenRangesAreValid(info.frozen)).toBe(true)
    expect(info.frozen[info.frozen.length - 1].end).toBe(total)
    for (let i = 0; i < total; i++) expect(editor.progressive.isMountedIndex(i)).toBe(true)
    expect(editor.progressive.isMountedIndex(total)).toBe(false)
  }, 120_000)

  it('markers are content-free: payloads carry counters and enums only', async () => {
    const editor = makeInstance()
    const events = collectMarkers(editor)
    const lanes = manualLanes()
    let clock = 0
    const { done } = editor.progressiveMount(blockDoc(40), {
      syncRegionBlocks: 10,
      tailChunkBlocks: 5,
      now: () => clock,
      scheduler: lanes.scheduler
    })
    while (editor.progressive.info().status === 'tailing') lanes.driveYield()
    await done
    expect(events.length).toBeGreaterThanOrEqual(3)
    for (const { name, payload } of events) {
      expect([BLOCK_MOUNT_SERVED, BLOCK_SYNC_REGION_DONE, BLOCK_TAIL_MOUNT_DONE]).toContain(name)
      for (const value of Object.values(payload)) {
        expect(['number', 'string']).toContain(typeof value)
        if (typeof value === 'string') expect(['progressive', 'legacy']).toContain(value)
        if (typeof value === 'number') expect(Number.isFinite(value)).toBe(true)
      }
    }
    // No document text leaks into any payload (sentinel from the fixture).
    expect(JSON.stringify(events)).not.toContain('ZYNQSENTINEL')
    expect(JSON.stringify(events)).not.toContain('Paragraph')
  })

  it('oversized single blocks: the giant paragraph is one mount unit inside the same machinery', async () => {
    const editor = makeInstance()
    const lanes = manualLanes()
    let clock = 0
    const { done } = editor.progressiveMount(giantDoc(), {
      syncRegionBlocks: 3,
      tailChunkBlocks: 4,
      now: () => clock,
      scheduler: lanes.scheduler
    })
    while (editor.progressive.info().status === 'tailing') lanes.driveYield()
    await done
    const info = editor.progressive.info()
    expect(info.status).toBe('done')
    expect(info.oversizedUnits).toBe(1)
    // Exactly one frozen range is a single-block oversized unit; a giant
    // block is never split — it occupies its own range in the log.
    const units = info.frozen.filter((r) => r.oversizedUnits === 1)
    expect(units).toHaveLength(1)
    expect(units[0].end - units[0].start).toBe(1)
    // Full document still mounted and round-trips.
    expect(topLevelCount(editor)).toBe(info.totalBlocks)
    const legacy = makeInstance(giantDoc())
    expect(editor.getMarkdown()).toBe(legacy.getMarkdown())
  })

  it('guard caps on the real path: a 100-deep nested quote document still opens and completes', async () => {
    // nested quote chain: each "> " level nests one deeper
    const parts = []
    for (let d = 1; d <= 100; d++) parts.push('> '.repeat(d) + `level ${d}`)
    const deepDoc = parts.join('\n') + '\n\n' + blockDoc(10)
    const editor = makeInstance()
    const lanes = manualLanes()
    let clock = 0
    const { done } = editor.progressiveMount(deepDoc, {
      syncRegionBlocks: 5,
      tailChunkBlocks: 5,
      now: () => clock,
      scheduler: lanes.scheduler
    })
    while (editor.progressive.info().status === 'tailing') lanes.driveYield()
    await done
    const info = editor.progressive.info()
    expect(info.status).toBe('done')
    expect(topLevelCount(editor)).toBe(info.totalBlocks)
    const legacy = makeInstance(deepDoc)
    expect(editor.getMarkdown()).toBe(legacy.getMarkdown())
  })
})

// ── MODE (b): REAL-MOUNT — fallback (corner 3) ─────────────────────────────

describe('T-003 fallback preserves the model and accepted edits (real-mount jsdom)', () => {
  it('a chunking failure mid-tail abandons progressive, completes legacy, preserves accepted edits', async () => {
    const editor = makeInstance()
    const events = collectMarkers(editor)
    const lanes = manualLanes()
    let clock = 0
    const doc = blockDoc(60)
    const { done } = editor.progressiveMount(doc, {
      syncRegionBlocks: 10,
      tailChunkBlocks: 5,
      now: () => clock,
      scheduler: lanes.scheduler
    })
    expect(editor.progressive.info().status).toBe('tailing')

    // Simulate an ACCEPTED EDIT at the model seam (what inputCtrl commits):
    // append text to the first paragraph's content block.
    const first = editor.contentState.getFirstBlock()
    const firstText = first.text || ''
    first.text = firstText + ' ZYNQEDIT'
    expect(editor.getMarkdown()).toContain('ZYNQEDIT')

    // Inject the chunking failure at the mount seam.
    const stateRender = editor.contentState.stateRender
    const realExtend = stateRender.extendRegion.bind(stateRender)
    let injected = false
    stateRender.extendRegion = (...args) => {
      if (injected) throw new Error('injected chunking failure')
      injected = true
      return realExtend(...args)
    }

    // Drive the tail: the next extension throws -> fallback fires.
    let guard = 0
    while (!injected && guard++ < 200) lanes.driveYield()
    await done

    const info = editor.progressive.info()
    expect(info.status).toBe('fallback')
    // Legacy completion: everything mounted through the legacy path.
    expect(topLevelCount(editor)).toBe(info.totalBlocks)
    // The accepted edit survived (the legacy remount rendered the CURRENT model).
    expect(editor.getMarkdown()).toContain('ZYNQEDIT')
    // Exactly one served marker, and it records legacy.
    const served = events.filter((e) => e.name === BLOCK_MOUNT_SERVED)
    expect(served).toEqual([{ name: BLOCK_MOUNT_SERVED, payload: { served: 'legacy' } }])
    // No blank/partial editor: every top-level block is in the DOM.
    expect(topLevelCount(editor)).toBe(editor.contentState.getBlocks().length)
  })

  it('a failure in the SYNC region also falls back and never leaves a blank editor', async () => {
    const editor = makeInstance()
    const events = collectMarkers(editor)
    const stateRender = editor.contentState.stateRender
    stateRender.renderRegion = () => {
      throw new Error('injected sync-region failure')
    }
    const { done } = editor.progressiveMount(blockDoc(30), { syncRegionBlocks: 10 })
    await done
    const info = editor.progressive.info()
    expect(info.status).toBe('fallback')
    expect(info.totalBlocks).toBe(editor.contentState.getBlocks().length)
    expect(topLevelCount(editor)).toBe(info.totalBlocks)
    expect(events.filter((e) => e.name === BLOCK_MOUNT_SERVED)).toEqual([
      { name: BLOCK_MOUNT_SERVED, payload: { served: 'legacy' } }
    ])
    const legacy = makeInstance(blockDoc(30))
    expect(editor.getMarkdown()).toBe(legacy.getMarkdown())
  })
})

// ── MODE (b): REAL-MOUNT — prefix-mismatch reset, on-demand mounts, edits ──

describe('T-003 prefix-mismatch reset, on-demand mounts, edit-during-tail (real-mount jsdom)', () => {
  it('a setMarkdown content replacement cancels the pending tail and proceeds fresh', async () => {
    const editor = makeInstance()
    const events = collectMarkers(editor)
    const lanes = manualLanes()
    let clock = 0
    const { done } = editor.progressiveMount(blockDoc(60), {
      syncRegionBlocks: 10,
      tailChunkBlocks: 5,
      now: () => clock,
      scheduler: lanes.scheduler
    })
    expect(editor.progressive.info().status).toBe('tailing')
    const pendingBefore = lanes.pendingYields()

    // Document replaced above the mounted regions while the tail is pending.
    editor.setMarkdown(blockDoc(25))

    const info = editor.progressive.info()
    expect(info.status).toBe('cancelled')
    // The pending tail never emits its completion marker.
    expect(events.some((e) => e.name === BLOCK_TAIL_MOUNT_DONE)).toBe(false)
    // The scheduler lanes were cancelled (disposers ran).
    expect(lanes.pendingYields()).toBe(0)
    expect(pendingBefore).toBeGreaterThan(0)
    // The replacement content load itself records served=legacy (plain load).
    expect(events.filter((e) => e.name === BLOCK_MOUNT_SERVED)).toEqual([
      { name: BLOCK_MOUNT_SERVED, payload: { served: 'legacy' } }
    ])
    // The new document is fully mounted through the legacy path.
    expect(topLevelCount(editor)).toBe(editor.contentState.getBlocks().length)
    await done

    // A fresh progressive open on the same instance works from scratch.
    const events2 = collectMarkers(editor)
    const lanes2 = manualLanes()
    const { done: done2 } = editor.progressiveMount(blockDoc(35), {
      syncRegionBlocks: 10,
      tailChunkBlocks: 5,
      now: () => clock,
      scheduler: lanes2.scheduler
    })
    while (editor.progressive.info().status === 'tailing') lanes2.driveYield()
    await done2
    expect(editor.progressive.info().status).toBe('done')
    expect(topLevelCount(editor)).toBe(editor.progressive.info().totalBlocks)
    expect(events2.some((e) => e.name === BLOCK_TAIL_MOUNT_DONE)).toBe(true)
  })

  it('mountToBlockKey mounts the target region on demand; mountToOffset handles both ends', async () => {
    const editor = makeInstance()
    const lanes = manualLanes()
    let clock = 0
    editor.progressiveMount(blockDoc(120), {
      syncRegionBlocks: 10,
      tailChunkBlocks: 5,
      now: () => clock, // static clock: elapsed stays 0, the ceiling cannot trip
      scheduler: lanes.scheduler
    })
    expect(editor.progressive.info().status).toBe('tailing')

    // Unknown keys report unknown-key while the tail is pending (after
    // completion the done-branch answers "already mounted" for any key).
    expect(editor.mountToBlockKey('no-such-key')).toMatchObject({ mounted: false, reason: 'unknown-key' })

    // Already-mounted key: no-op success.
    const firstKey = editor.contentState.blocks[0].key
    expect(editor.mountToBlockKey(firstKey)).toMatchObject({ mounted: true, already: true })

    // A key deep in the unmounted tail mounts through to its region.
    const target = editor.contentState.blocks[100]
    const res = editor.mountToBlockKey(target.key)
    expect(res.mounted).toBe(true)
    expect(editor.progressive.info().mountedThrough).toBeGreaterThan(100)
    expect(rootOf(editor).querySelector(`#${target.key}`)).toBeTruthy()
    // Everything between the old boundary and the target is mounted (no holes).
    expect(topLevelCount(editor)).toBeGreaterThanOrEqual(101)

    // Offset 0 -> already mounted; huge offset -> mounts to the end.
    expect(editor.mountToOffset(0)).toMatchObject({ mounted: true })
    const end = editor.mountToOffset(Number.MAX_SAFE_INTEGER)
    expect(end.mounted).toBe(true)
    const info = editor.progressive.info()
    expect(info.mountedThrough).toBe(info.totalBlocks)
    expect(info.status).toBe('done')
    expect(topLevelCount(editor)).toBe(info.totalBlocks)
  })

  it('the edit path works while the tail is pending, and the tail still completes byte-identically', async () => {
    const editor = makeInstance()
    const lanes = manualLanes()
    let clock = 0
    const doc = blockDoc(50)
    const legacy = makeInstance(doc)
    const canon = legacy.getMarkdown()
    legacy.container.remove()

    const { done } = editor.progressiveMount(doc, {
      syncRegionBlocks: 10,
      tailChunkBlocks: 5,
      now: () => clock,
      scheduler: lanes.scheduler
    })
    expect(editor.progressive.info().status).toBe('tailing')

    // Simulate the edit path at its real seam: cursor into a MOUNTED
    // paragraph (block 1), model text edit, then the contentState
    // partialRender the input controller runs. This must not disturb the
    // pending tail.
    const state = editor.contentState
    const para = state.blocks[1]
    const content = para.children[0]
    content.text = content.text + ' ZYNQEDIT'
    state.cursor = {
      start: { key: content.key, offset: content.text.length },
      end: { key: content.key, offset: content.text.length },
      isEdit: true
    }
    expect(() => state.partialRender()).not.toThrow()
    expect(rootOf(editor).querySelector(`#${para.key}`)).toBeTruthy()

    // Complete the tail after the edit.
    while (editor.progressive.info().status === 'tailing') lanes.driveYield()
    await done
    const info = editor.progressive.info()
    expect(info.status).toBe('done')
    expect(topLevelCount(editor)).toBe(info.totalBlocks)
    // The accepted edit survived tail completion; everything else is canon.
    const out = editor.getMarkdown()
    expect(out).toContain('ZYNQEDIT')
    expect(out.replace(' ZYNQEDIT', '')).toBe(canon)
  })

  it('destroy() cancels a pending tail without firing further lanes', async () => {
    const editor = makeInstance()
    const lanes = manualLanes()
    let clock = 0
    const { done } = editor.progressiveMount(blockDoc(40), {
      syncRegionBlocks: 10,
      tailChunkBlocks: 5,
      now: () => clock,
      scheduler: lanes.scheduler
    })
    expect(editor.progressive.info().status).toBe('tailing')
    const pending = lanes.pendingYields()
    expect(pending).toBeGreaterThan(0)
    editor.destroy()
    expect(editor.progressive.info().status).toBe('cancelled')
    expect(lanes.pendingYields()).toBe(0)
    await done
  })
})
