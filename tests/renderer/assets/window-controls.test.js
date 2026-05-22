/**
 * Tests for src/renderer/src/assets/window-controls.js
 *
 * Exports SVG path strings for window control icons.
 */

import { closePath, restorePath, maximizePath, minimizePath } from '@/assets/window-controls'

describe('window-controls.js', () => {
  it('exports closePath as a non-empty string', () => {
    expect(typeof closePath).toBe('string')
    expect(closePath.length).toBeGreaterThan(0)
  })

  it('exports restorePath as a non-empty string', () => {
    expect(typeof restorePath).toBe('string')
    expect(restorePath.length).toBeGreaterThan(0)
  })

  it('exports maximizePath as a non-empty string', () => {
    expect(typeof maximizePath).toBe('string')
    expect(maximizePath.length).toBeGreaterThan(0)
  })

  it('exports minimizePath as a non-empty string', () => {
    expect(typeof minimizePath).toBe('string')
    expect(minimizePath.length).toBeGreaterThan(0)
  })

  it('closePath contains SVG path commands', () => {
    expect(closePath).toMatch(/^M\s/)
  })

  it('maximizePath contains SVG path commands', () => {
    expect(maximizePath).toMatch(/^M\s/)
  })

  it('minimizePath contains SVG path commands', () => {
    expect(minimizePath).toMatch(/^M\s/)
  })

  it('restorePath contains SVG path commands', () => {
    expect(restorePath).toMatch(/^m\s/)
  })

  it('all paths are distinct', () => {
    const paths = [closePath, restorePath, maximizePath, minimizePath]
    const unique = new Set(paths)
    expect(unique.size).toBe(4)
  })
})
