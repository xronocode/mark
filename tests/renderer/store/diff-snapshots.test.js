// FILE: tests/renderer/store/diff-snapshots.test.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Unit tests for the C-43 per-tab pre-reload snapshot ring (store/diffSnapshots.js): record/latest/clear, dedupe of an unchanged newest snapshot, the 5-per-tab cap with oldest dropped, independent tabs, and the returned copy contract.
//   SCOPE: The ring module only — editor.js wiring is covered by tests/renderer/store/live-reload-snapshots.test.js.
//   DEPENDS: src/renderer/src/store/diffSnapshots.js
//   LINKS: .grace/changes/active/C-43 R-1/R-4; .grace/verification/runtime.xml V-M-011 scenario-38
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   ring - record N distinct snapshots for a tab id (oldest first).
//   fixedTakenAt - deterministic timestamp for {time} formatting assertions.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - 2026-10-15 C-43 S1 initial ring tests.
// END_CHANGE_SUMMARY

import {
  recordSnapshot,
  latestSnapshot,
  snapshotCount,
  clearSnapshots,
  __resetDiffSnapshots,
  SNAPSHOT_LIMIT
} from '@/store/diffSnapshots'

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
