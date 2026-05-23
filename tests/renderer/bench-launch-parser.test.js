import { describe, it, expect } from 'vitest'
import { parseLine } from '../../tools/bench-launch.mjs'

describe('bench-launch parseLine', () => {
  const T0 = 1000

  it('parses a standard BLOCK marker', () => {
    const line = '[m001][validate][BLOCK_VALIDATE_AGAINST_FIXTURE_OK]'
    const result = parseLine(line, T0)
    expect(result).not.toBeNull()
    expect(result.module).toBe('m001')
    expect(result.sub).toBe('validate')
    expect(result.name).toBe('BLOCK_VALIDATE_AGAINST_FIXTURE_OK')
    expect(result.fullId).toBe('[m001][validate][BLOCK_VALIDATE_AGAINST_FIXTURE_OK]')
  })

  it('extracts key=value params', () => {
    const line = '[m001][save_close][BLOCK_FILE_SAVED id=42 path=/tmp/test.md was_picked=false]'
    const result = parseLine(line, T0)
    expect(result.params.id).toBe('42')
    expect(result.params.path).toBe('/tmp/test.md')
    expect(result.params.was_picked).toBe('false')
  })

  it('uses elapsed_ms param when present', () => {
    const line = '[boot][pending_opens][BLOCK_LISTENERS_READY elapsed_ms=123.4 count=9]'
    const result = parseLine(line, T0)
    expect(result.elapsedMs).toBeCloseTo(123.4)
    expect(result.params.count).toBe('9')
  })

  it('computes elapsed from process start when no elapsed_ms', () => {
    const line = '[m001][security][BLOCK_SECURITY_POSTURE_OK]'
    const now = Date.now()
    const result = parseLine(line, now - 500)
    expect(result.elapsedMs).toBeGreaterThanOrEqual(400)
    expect(result.elapsedMs).toBeLessThan(2000)
  })

  it('returns null for non-BLOCK lines', () => {
    expect(parseLine('some random log line', T0)).toBeNull()
    expect(parseLine('', T0)).toBeNull()
    expect(parseLine('[info] starting up', T0)).toBeNull()
  })

  it('handles nested bracket content correctly', () => {
    const line = '[menu][build][BLOCK_BUILD_NATIVE_MENU] installed'
    const result = parseLine(line, T0)
    expect(result.name).toBe('BLOCK_BUILD_NATIVE_MENU')
    expect(result.module).toBe('menu')
    expect(result.sub).toBe('build')
  })
})
