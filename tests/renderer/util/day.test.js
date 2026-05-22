/**
 * Tests for src/renderer/src/util/day.js
 *
 * Covers: dayjs export with relativeTime plugin
 */

import dayjs from '@/util/day'

describe('util/day', () => {
  it('should export dayjs as default', () => {
    expect(typeof dayjs).toBe('function')
  })

  it('should be able to create a dayjs instance', () => {
    const d = dayjs()
    expect(d).toBeDefined()
    expect(typeof d.format).toBe('function')
  })

  it('should support format method', () => {
    const d = dayjs('2024-01-15')
    expect(d.format('YYYY-MM-DD')).toBe('2024-01-15')
  })

  it('should have relativeTime plugin (fromNow)', () => {
    const d = dayjs('2020-01-01')
    expect(typeof d.fromNow).toBe('function')
    const result = d.fromNow()
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(0)
  })

  it('should support toNow method from relativeTime', () => {
    const d = dayjs('2020-01-01')
    expect(typeof d.toNow).toBe('function')
  })

  it('should support from method from relativeTime', () => {
    const d1 = dayjs('2024-01-01')
    const d2 = dayjs('2024-06-01')
    const result = d1.from(d2)
    expect(typeof result).toBe('string')
  })

  it('should support to method from relativeTime', () => {
    const d1 = dayjs('2024-01-01')
    const d2 = dayjs('2024-06-01')
    const result = d1.to(d2)
    expect(typeof result).toBe('string')
  })
})
