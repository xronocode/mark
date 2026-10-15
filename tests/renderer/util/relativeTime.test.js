// FILE: tests/renderer/util/relativeTime.test.js
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Pin the C-46 relative mtime labels used by the welcome screen rows.
//   SCOPE: pure formatRelativeTime behaviour with a stubbed t().
//   DEPENDS: vitest, util/relativeTime.
//   LINKS: .grace/verification/runtime.xml V-M-011 scenario-47.
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   tStub - i18n double rendering the five time keys with their params.
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - 2026-10-15 C-46: initial pins.
// END_CHANGE_SUMMARY

import { describe, it, expect } from 'vitest'
import { formatRelativeTime } from '@/util/relativeTime'

const tStub = (key, params) => {
  switch (key) {
    case 'recent.time.justNow':
      return 'just now'
    case 'recent.time.minutesAgo':
      return `${params.count} min ago`
    case 'recent.time.todayAt':
      return `today ${params.time}`
    case 'recent.time.yesterday':
      return 'yesterday'
    case 'recent.time.daysAgo':
      return `${params.count} days ago`
    default:
      return key
  }
}

const MIN = 60_000
const HOUR = 60 * MIN
const DAY = 24 * HOUR
// A fixed Wednesday noon so calendar-day math is deterministic.
const NOW = new Date(2026, 9, 15, 12, 0, 0).getTime()

describe('formatRelativeTime', () => {
  it('returns empty string for unknown, zero, negative or future mtimes', () => {
    expect(formatRelativeTime(undefined, NOW, tStub)).toBe('')
    expect(formatRelativeTime(NaN, NOW, tStub)).toBe('')
    expect(formatRelativeTime(0, NOW, tStub)).toBe('')
    expect(formatRelativeTime(-1, NOW, tStub)).toBe('')
    expect(formatRelativeTime(NOW + MIN, NOW, tStub)).toBe('')
  })

  it('labels sub-minute ages as just now and older same-day minutes as N min ago', () => {
    expect(formatRelativeTime(NOW - 5_000, NOW, tStub)).toBe('just now')
    expect(formatRelativeTime(NOW - 3 * MIN, NOW, tStub)).toBe('3 min ago')
    expect(formatRelativeTime(NOW - 59 * MIN, NOW, tStub)).toBe('59 min ago')
  })

  it('uses today HH:MM for same-day ages of an hour or more', () => {
    expect(formatRelativeTime(NOW - 2 * HOUR, NOW, tStub)).toBe('today 10:00')
    // Yesterday-evening mtime is still within 24h but on another day.
    expect(formatRelativeTime(new Date(2026, 9, 14, 23, 5).getTime(), NOW, tStub)).toBe('yesterday')
  })

  it('uses calendar days: yesterday, N days ago up to 7, empty beyond', () => {
    expect(formatRelativeTime(NOW - DAY, NOW, tStub)).toBe('yesterday')
    expect(formatRelativeTime(NOW - 2 * DAY, NOW, tStub)).toBe('2 days ago')
    expect(formatRelativeTime(NOW - 7 * DAY, NOW, tStub)).toBe('7 days ago')
    expect(formatRelativeTime(NOW - 8 * DAY, NOW, tStub)).toBe('')
  })
})
