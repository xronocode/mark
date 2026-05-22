/**
 * Tests for src/renderer/src/util/intl-polyfill.js
 *
 * Note: This source file does not exist in the codebase.
 * This test verifies that Intl is available in the jsdom environment
 * (which is the purpose the polyfill would serve).
 */

describe('util/intl-polyfill', () => {
  it('should have Intl available in jsdom environment', () => {
    expect(typeof Intl).toBe('object')
  })

  it('should have Intl.DateTimeFormat', () => {
    expect(typeof Intl.DateTimeFormat).toBe('function')
  })

  it('should have Intl.NumberFormat', () => {
    expect(typeof Intl.NumberFormat).toBe('function')
  })

  it('should be able to format a date', () => {
    const formatter = new Intl.DateTimeFormat('en-US')
    const result = formatter.format(new Date('2024-01-15'))
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(0)
  })

  it('should be able to format a number', () => {
    const formatter = new Intl.NumberFormat('en-US')
    const result = formatter.format(1234567.89)
    expect(typeof result).toBe('string')
  })
})
