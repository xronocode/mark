// FILE: tests/renderer/store/diff-snapshots.test.js
// VERSION: 1.1.0
// START_MODULE_CONTRACT
//   PURPOSE: Unit tests for store/diffSnapshots.js — the C-43 per-tab pre-reload snapshot ring (record/latest/clear, dedupe, 5-per-tab cap, independent tabs, copy contract) and the C-68 «opened» slot (record/replace/clear, isolation from the ring).
//   SCOPE: The snapshots module only — editor.js wiring is covered by tests/renderer/store/live-reload-snapshots.test.js (ring) and tests/renderer/store/opened-snapshots.test.js (opened slot).
//   DEPENDS: src/renderer/src/store/diffSnapshots.js
//   LINKS: .grace/changes/archive/C-43 R-1/R-4; .grace/changes/active/C-68 R-1; .grace/verification/runtime.xml V-M-011 scenario-39/scenario-67
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   TAB_A - id of the first fixture tab.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.1.0 - 2026-10-19 C-68 T-001: opened-slot suite (single replaceable slot, ring isolation, clear-with-tab).
//   v1.0.0 - 2026-10-15 C-43 S1 initial ring tests.
// END_CHANGE_SUMMARY

import {
  recordSnapshot,
  recordOpenedSnapshot,
  latestSnapshot,
  openedSnapshot,
  snapshotCount,
  clearSnapshots,
  __resetDiffSnapshots,
  SNAPSHOT_LIMIT
} from '@/store/diffSnapshots'

const TAB_A = 'tab-a'

describe('store/diffSnapshots — C-43 snapshot ring', () => {
  beforeEach(() => {
    __resetDiffSnapshots()
  })

  // Record N distinct markdowns (v1..vN) for one tab, oldest first.
  const ring = (tabId, n) => {
    for (let i = 1; i <= n; i++) {
      recordSnapshot(tabId, `# version ${i}`, 1_000 * i)
    }
  }

  it('records and returns the latest { markdown, takenAt }', () => {
    recordSnapshot('tab-1', '# original', 42)

    const snap = latestSnapshot('tab-1')
    expect(snap).toEqual({ markdown: '# original', takenAt: 42 })
    expect(snapshotCount('tab-1')).toBe(1)
  })

  it('stamps takenAt with Date.now when no timestamp is given', () => {
    const before = Date.now()
    recordSnapshot('tab-1', '# original')
    const after = Date.now()

    const snap = latestSnapshot('tab-1')
    expect(snap.takenAt).toBeGreaterThanOrEqual(before)
    expect(snap.takenAt).toBeLessThanOrEqual(after)
  })

  it('recording the same markdown as the newest snapshot is a no-op', () => {
    recordSnapshot('tab-1', '# original', 42)
    recordSnapshot('tab-1', '# original', 99)

    expect(snapshotCount('tab-1')).toBe(1)
    // The no-op must not refresh takenAt either.
    expect(latestSnapshot('tab-1').takenAt).toBe(42)
  })

  it('caps the ring at SNAPSHOT_LIMIT snapshots, dropping the oldest', () => {
    expect(SNAPSHOT_LIMIT).toBe(5)
    ring('tab-1', 7)

    expect(snapshotCount('tab-1')).toBe(SNAPSHOT_LIMIT)
    // Newest kept, oldest two dropped.
    expect(latestSnapshot('tab-1').markdown).toBe('# version 7')
  })

  it('a dropped-oldest markdown is recordable again (ring forgets it)', () => {
    ring('tab-1', 6) // ring now holds v2..v6; v1 was dropped

    recordSnapshot('tab-1', '# version 1', 9_999)

    expect(snapshotCount('tab-1')).toBe(SNAPSHOT_LIMIT)
    expect(latestSnapshot('tab-1')).toEqual({ markdown: '# version 1', takenAt: 9_999 })
  })

  it('clearSnapshots drops the whole ring for one tab', () => {
    ring('tab-1', 2)
    clearSnapshots('tab-1')

    expect(latestSnapshot('tab-1')).toBeNull()
    expect(snapshotCount('tab-1')).toBe(0)
  })

  it('keeps tabs independent', () => {
    recordSnapshot('tab-1', '# one', 1)
    recordSnapshot('tab-2', '# two', 2)

    expect(latestSnapshot('tab-1').markdown).toBe('# one')
    expect(latestSnapshot('tab-2').markdown).toBe('# two')

    clearSnapshots('tab-1')
    expect(latestSnapshot('tab-1')).toBeNull()
    expect(latestSnapshot('tab-2').markdown).toBe('# two')
  })

  it('latestSnapshot returns a copy — mutating it cannot corrupt the ring', () => {
    recordSnapshot('tab-1', '# original', 42)

    const snap = latestSnapshot('tab-1')
    snap.markdown = '# tampered'
    snap.takenAt = 0

    expect(latestSnapshot('tab-1')).toEqual({ markdown: '# original', takenAt: 42 })
  })

  it('ignores a missing tab id or non-string markdown', () => {
    recordSnapshot('', '# x')
    recordSnapshot(null, '# x')
    recordSnapshot('tab-1', undefined)
    recordSnapshot('tab-1', 123)

    expect(snapshotCount('tab-1')).toBe(0)
    expect(latestSnapshot('tab-1')).toBeNull()
  })
})

describe('store/diffSnapshots — C-68 opened slot', () => {
  beforeEach(() => {
    __resetDiffSnapshots()
  })

  it('records and returns the single { markdown, takenAt, kind: "opened" } slot', () => {
    recordOpenedSnapshot('tab-1', '# from disk', 42)

    expect(openedSnapshot('tab-1')).toEqual({
      markdown: '# from disk',
      takenAt: 42,
      kind: 'opened'
    })
  })

  it('a second record replaces the slot (one per tab), refreshing takenAt', () => {
    recordOpenedSnapshot('tab-1', '# first load', 42)
    recordOpenedSnapshot('tab-1', '# second load', 99)

    expect(openedSnapshot('tab-1')).toEqual({
      markdown: '# second load',
      takenAt: 99,
      kind: 'opened'
    })
  })

  it('stamps takenAt with Date.now when no timestamp is given', () => {
    const before = Date.now()
    recordOpenedSnapshot('tab-1', '# from disk')
    const after = Date.now()

    const snap = openedSnapshot('tab-1')
    expect(snap.takenAt).toBeGreaterThanOrEqual(before)
    expect(snap.takenAt).toBeLessThanOrEqual(after)
  })

  it('an unknown tab has no opened snapshot', () => {
    expect(openedSnapshot('never-seen')).toBeNull()
  })

  it('ring pressure never evicts the opened slot, and the slot never touches the ring', () => {
    recordOpenedSnapshot('tab-1', '# opened', 10)
    for (let i = 1; i <= SNAPSHOT_LIMIT + 2; i++) {
      recordSnapshot('tab-1', `# external ${i}`, 1_000 * i)
    }

    expect(snapshotCount('tab-1')).toBe(SNAPSHOT_LIMIT)
    expect(latestSnapshot('tab-1').markdown).toBe(`# external ${SNAPSHOT_LIMIT + 2}`)
    // The slot survived the full ring churn…
    expect(openedSnapshot('tab-1').markdown).toBe('# opened')

    // …and re-recording the slot does not add to or trim the ring.
    recordOpenedSnapshot('tab-1', '# reopened', 20)
    expect(snapshotCount('tab-1')).toBe(SNAPSHOT_LIMIT)
    expect(latestSnapshot('tab-1').markdown).toBe(`# external ${SNAPSHOT_LIMIT + 2}`)
    expect(openedSnapshot('tab-1').markdown).toBe('# reopened')
  })

  it('clearSnapshots drops the ring AND the opened slot for one tab only', () => {
    recordSnapshot('tab-1', '# external', 1)
    recordOpenedSnapshot('tab-1', '# opened', 2)
    recordOpenedSnapshot('tab-2', '# other tab', 3)
    recordSnapshot('tab-2', '# other external', 4)
    clearSnapshots('tab-1')

    expect(openedSnapshot('tab-1')).toBeNull()
    expect(latestSnapshot('tab-1')).toBeNull()
    expect(openedSnapshot('tab-2').markdown).toBe('# other tab')
    expect(latestSnapshot('tab-2').markdown).toBe('# other external')
  })

  it('openedSnapshot returns a copy — mutating it cannot corrupt the slot', () => {
    recordOpenedSnapshot('tab-1', '# from disk', 42)

    const snap = openedSnapshot('tab-1')
    snap.markdown = '# tampered'
    snap.takenAt = 0

    expect(openedSnapshot('tab-1')).toEqual({
      markdown: '# from disk',
      takenAt: 42,
      kind: 'opened'
    })
  })

  it('ignores a missing tab id or non-string markdown', () => {
    recordOpenedSnapshot('', '# x')
    recordOpenedSnapshot(null, '# x')
    recordOpenedSnapshot('tab-1', undefined)
    recordOpenedSnapshot('tab-1', 123)

    expect(openedSnapshot('tab-1')).toBeNull()
  })
})
