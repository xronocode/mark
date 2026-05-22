/**
 * Tests for src/renderer/src/util/fs-shim.js
 *
 * Covers: all named exports and default export stubs
 */

import fsShim, {
  readFileSync,
  writeFileSync,
  existsSync,
  statSync,
  readdirSync,
  constants
} from '@/util/fs-shim'

describe('util/fs-shim', () => {
  describe('named exports', () => {
    it('readFileSync should throw', () => {
      expect(() => readFileSync('/some/path')).toThrow(
        'fs is not available in the renderer process'
      )
    })

    it('writeFileSync should throw', () => {
      expect(() => writeFileSync('/some/path', 'data')).toThrow(
        'fs is not available in the renderer process'
      )
    })

    it('existsSync should return false', () => {
      expect(existsSync('/some/path')).toBe(false)
    })

    it('statSync should throw', () => {
      expect(() => statSync('/some/path')).toThrow(
        'fs is not available in the renderer process'
      )
    })

    it('readdirSync should return empty array', () => {
      expect(readdirSync('/some/path')).toEqual([])
    })

    it('constants should be empty object', () => {
      expect(constants).toEqual({})
    })
  })

  describe('default export', () => {
    it('should have readFileSync that throws', () => {
      expect(() => fsShim.readFileSync()).toThrow()
    })

    it('should have writeFileSync that throws', () => {
      expect(() => fsShim.writeFileSync()).toThrow()
    })

    it('should have existsSync that returns false', () => {
      expect(fsShim.existsSync()).toBe(false)
    })

    it('should have statSync that throws', () => {
      expect(() => fsShim.statSync()).toThrow()
    })

    it('should have readdirSync that returns empty array', () => {
      expect(fsShim.readdirSync()).toEqual([])
    })

    it('should have constants as empty object', () => {
      expect(fsShim.constants).toEqual({})
    })

    it('should have promises.readFile that throws', () => {
      expect(() => fsShim.promises.readFile()).toThrow()
    })

    it('should have promises.writeFile that throws', () => {
      expect(() => fsShim.promises.writeFile()).toThrow()
    })

    it('should have promises.stat that throws', () => {
      expect(() => fsShim.promises.stat()).toThrow()
    })

    it('should have promises.readdir that throws', () => {
      expect(() => fsShim.promises.readdir()).toThrow()
    })
  })
})
