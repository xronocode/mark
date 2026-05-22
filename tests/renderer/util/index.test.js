/**
 * Tests for src/renderer/src/util/index.js
 *
 * Covers: delay, serialize, merge, dataURItoBlob, adjustCursor,
 *         animatedScrollTo, getUniqueId, hasKeys, cloneObj,
 *         cloneObject, deepClone, isOsx, isWindows, isLinux
 */

// util/index.js reads window.electron.process.platform at module scope,
// so we must ensure it exists before the import is evaluated.
vi.hoisted(() => {
  if (!globalThis.window) globalThis.window = {}
  if (!window.electron) {
    window.electron = {
      process: { platform: 'darwin', versions: {}, env: {} }
    }
  } else if (!window.electron.process) {
    window.electron.process = { platform: 'darwin', versions: {}, env: {} }
  }
})

import {
  delay,
  serialize,
  merge,
  dataURItoBlob,
  adjustCursor,
  animatedScrollTo,
  getUniqueId,
  hasKeys,
  cloneObj,
  cloneObject,
  deepClone,
  isOsx,
  isWindows,
  isLinux
} from '@/util/index'

describe('util/index', () => {
  describe('delay', () => {
    it('should resolve after specified time', async () => {
      vi.useFakeTimers()
      const p = delay(100)
      vi.advanceTimersByTime(100)
      await expect(p).resolves.toBeUndefined()
      vi.useRealTimers()
    })

    it('should be cancellable', async () => {
      vi.useFakeTimers()
      const p = delay(100)
      p.cancel()
      await expect(p).rejects.toBeUndefined()
      vi.useRealTimers()
    })

    it('cancel should be no-op after resolve', async () => {
      vi.useFakeTimers()
      const p = delay(50)
      vi.advanceTimersByTime(50)
      await p
      expect(() => p.cancel()).not.toThrow()
      vi.useRealTimers()
    })
  })

  describe('serialize', () => {
    it('should serialize params to query string', () => {
      const result = serialize({ foo: 'bar', baz: 123 })
      expect(result).toBe('foo=bar&baz=123')
    })

    it('should handle empty object', () => {
      expect(serialize({})).toBe('')
    })

    it('should encode URI components', () => {
      const result = serialize({ key: 'hello world' })
      expect(result).toBe('key=hello%20world')
    })
  })

  describe('merge', () => {
    it('should merge multiple objects', () => {
      const result = merge({ a: 1 }, { b: 2 }, { c: 3 })
      expect(result).toEqual({ a: 1, b: 2, c: 3 })
    })

    it('should override earlier props with later ones', () => {
      const result = merge({ a: 1 }, { a: 2 })
      expect(result).toEqual({ a: 2 })
    })

    it('should return new object', () => {
      const a = { x: 1 }
      const result = merge(a)
      expect(result).not.toBe(a)
      expect(result).toEqual({ x: 1 })
    })
  })

  describe('dataURItoBlob', () => {
    it('should convert a data URI to a Blob', () => {
      const dataURI = 'data:text/plain;base64,SGVsbG8='
      const blob = dataURItoBlob(dataURI)
      expect(blob).toBeInstanceOf(Blob)
      expect(blob.type).toBe('text/plain')
    })

    it('should preserve binary data', () => {
      // "AB" in base64 is [0, 0x36] roughly — test basic flow
      const dataURI = 'data:application/octet-stream;base64,AQID'
      const blob = dataURItoBlob(dataURI)
      expect(blob.size).toBe(3)
    })
  })

  describe('adjustCursor', () => {
    it('should return null for non-string line', () => {
      expect(adjustCursor({ line: 0, ch: 0 }, '', undefined, '')).toBeNull()
      expect(adjustCursor({ line: 0, ch: 0 }, '', null, '')).toBeNull()
    })

    it('should return null for blank line', () => {
      expect(adjustCursor({ line: 0, ch: 0 }, '', '   ', '')).toBeNull()
    })

    it('should adjust cursor for table row (not second line)', () => {
      const cursor = { line: 0, ch: 0 }
      const line = '| cell1 | cell2 |'
      const result = adjustCursor(cursor, '', line, '')
      // ch should be moved to after first |
      expect(result.ch).toBe(1) // line.indexOf('|') + 1
    })

    it('should adjust cursor at end of table row', () => {
      const cursor = { line: 0, ch: 17 }
      const line = '| cell1 | cell2 |'
      const result = adjustCursor(cursor, '', line, '')
      expect(result.ch).toBe(15) // line.lastIndexOf('|') - 1
    })

    it('should adjust cursor for table separator line with valid next line', () => {
      const cursor = { line: 1, ch: 0 }
      const line = '| --- | :---: |'
      const nextline = '| data | data |'
      const result = adjustCursor(cursor, '', line, nextline)
      expect(result.line).toBe(2)
    })

    it('should adjust cursor for code block start with content below', () => {
      const cursor = { line: 0, ch: 0 }
      const line = '```javascript'
      const nextline = 'const x = 1'
      const result = adjustCursor(cursor, '', line, nextline)
      expect(result.line).toBe(1)
      expect(result.ch).toBe(0)
    })

    it('should adjust cursor for code block end with content above', () => {
      const cursor = { line: 2, ch: 0 }
      const line = '```'
      const preline = 'const x = 1'
      const result = adjustCursor(cursor, preline, line, '')
      expect(result.line).toBe(1)
      expect(result.ch).toBe(preline.length)
    })

    it('should adjust cursor for math block', () => {
      const cursor = { line: 0, ch: 0 }
      const line = '$$'
      const nextline = 'x^2 + y^2 = z^2'
      const result = adjustCursor(cursor, '', line, nextline)
      expect(result.line).toBe(1)
      expect(result.ch).toBe(0)
    })

    it('should adjust cursor for list items', () => {
      const cursor = { line: 0, ch: 0 }
      const line = '- item text'
      const result = adjustCursor(cursor, '', line, '')
      expect(result.ch).toBe(2)
    })

    it('should adjust cursor for list items with +', () => {
      const cursor = { line: 0, ch: 1 }
      const line = '+ item text'
      const result = adjustCursor(cursor, '', line, '')
      expect(result.ch).toBe(2)
    })

    it('should not adjust cursor for normal text', () => {
      const cursor = { line: 0, ch: 5 }
      const line = 'Hello world'
      const result = adjustCursor(cursor, '', line, '')
      expect(result.line).toBe(0)
      expect(result.ch).toBe(5)
    })
  })

  describe('animatedScrollTo', () => {
    it('should immediately set scrollTop for small changes', () => {
      const el = { scrollTop: 0 }
      animatedScrollTo(el, 3, 300)
      expect(el.scrollTop).toBe(3)
    })

    it('should immediately set scrollTop when duration is 0', () => {
      const el = { scrollTop: 0 }
      animatedScrollTo(el, 100, 0)
      expect(el.scrollTop).toBe(100)
    })

    it('should animate scroll for larger changes', () => {
      vi.useFakeTimers()
      const el = { scrollTop: 0 }
      const callback = vi.fn()

      // Mock requestAnimationFrame
      let rafCallback
      vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((cb) => {
        rafCallback = cb
        return 1
      })

      animatedScrollTo(el, 100, 300, callback)
      // Should have started animation
      expect(rafCallback).toBeDefined()

      vi.useRealTimers()
      vi.restoreAllMocks()
    })
  })

  describe('getUniqueId', () => {
    it('should return string starting with mt-', () => {
      const id = getUniqueId()
      expect(id).toMatch(/^mt-\d+$/)
    })

    it('should return incrementing ids', () => {
      const id1 = getUniqueId()
      const id2 = getUniqueId()
      const num1 = parseInt(id1.replace('mt-', ''))
      const num2 = parseInt(id2.replace('mt-', ''))
      expect(num2).toBe(num1 + 1)
    })
  })

  describe('hasKeys', () => {
    it('should return true for object with keys', () => {
      expect(hasKeys({ a: 1 })).toBe(true)
    })

    it('should return false for empty object', () => {
      expect(hasKeys({})).toBe(false)
    })
  })

  describe('cloneObj', () => {
    it('should deep clone by default', () => {
      const obj = { a: { b: 1 } }
      const clone = cloneObj(obj)
      expect(clone).toEqual(obj)
      expect(clone.a).not.toBe(obj.a)
    })

    it('should shallow clone when deepCopy is false', () => {
      const inner = { b: 1 }
      const obj = { a: inner }
      const clone = cloneObj(obj, false)
      expect(clone.a).toBe(inner)
    })
  })

  describe('cloneObject', () => {
    it('should shallow clone inheriting from Object by default', () => {
      const obj = { a: 1 }
      const clone = cloneObject(obj)
      expect(clone).toEqual(obj)
      expect(clone).not.toBe(obj)
      expect(clone.constructor).toBe(Object)
    })

    it('should create null-prototype clone when inheritFromObject is false', () => {
      const obj = { a: 1 }
      const clone = cloneObject(obj, false)
      expect(clone.a).toBe(1)
      expect(Object.getPrototypeOf(clone)).toBeNull()
    })
  })

  describe('deepClone', () => {
    it('should deep clone object', () => {
      const obj = { a: { b: [1, 2, 3] } }
      const clone = deepClone(obj)
      expect(clone).toEqual(obj)
      expect(clone.a).not.toBe(obj.a)
      expect(clone.a.b).not.toBe(obj.a.b)
    })
  })

  describe('platform constants', () => {
    it('should export platform booleans', () => {
      // window.electron.process.platform is set to 'darwin' in setup
      expect(isOsx).toBe(true)
      expect(isWindows).toBe(false)
      expect(isLinux).toBe(false)
    })
  })
})
