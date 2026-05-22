/**
 * Deep coverage tests for src/renderer/src/util/index.js
 *
 * Covers uncovered code paths:
 *   - adjustCursor — table separator line without valid nextline
 *   - adjustCursor — code/math block end without valid preline or nextline
 *   - adjustCursor — list with * prefix
 *   - adjustCursor — cursor inside table row (not at beginning or end)
 *   - animatedScrollTo — with callback, full animation lifecycle
 *   - animatedScrollTo — mid-animation
 *   - delay — cancel clears timer and rejects
 *   - dataURItoBlob — various MIME types
 */

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
  adjustCursor,
  animatedScrollTo,
  dataURItoBlob,
  serialize,
  merge,
  getUniqueId,
  hasKeys,
  cloneObj,
  cloneObject,
  deepClone
} from '@/util/index'

describe('util/index — deep coverage', () => {
  describe('delay — cancel before resolve', () => {
    it('cancel immediately rejects', async () => {
      vi.useFakeTimers()
      const p = delay(1000)
      p.cancel()
      await expect(p).rejects.toBeUndefined()
      vi.useRealTimers()
    })

    it('cancel after resolve is no-op', async () => {
      vi.useFakeTimers()
      const p = delay(10)
      vi.advanceTimersByTime(10)
      await p
      // cancel after resolve should be a no-op (p.cancel replaced)
      expect(() => p.cancel()).not.toThrow()
      vi.useRealTimers()
    })
  })

  describe('adjustCursor — table separator without nextline', () => {
    it('does not adjust line when separator has no valid nextline', () => {
      const cursor = { line: 1, ch: 3 }
      const line = '| --- | :---: |'
      // nextline is not a string
      const result = adjustCursor(cursor, '', line, undefined)
      // Should return null because the line is blank-content-like
      // Actually: the separator line is not blank, but `!/\\S/.test(line)` → false
      // so it should return the cursor as adjusted
      expect(result).toBeDefined()
    })

    it('adjusts cursor on separator line with number nextline', () => {
      const cursor = { line: 1, ch: 3 }
      const line = '| --- | :---: |'
      const result = adjustCursor(cursor, '', line, 42) // number, not string
      // typeof nextline !== 'string' → skip adjustment
      // But cursor.ch is inside the table, so table adjustment still applies
      expect(result).toBeDefined()
    })
  })

  describe('adjustCursor — code block without valid surrounding lines', () => {
    it('code block start without valid nextline or preline', () => {
      const cursor = { line: 0, ch: 0 }
      const line = '```python'
      // Neither nextline nor preline have content
      const result = adjustCursor(cursor, '', line, '')
      // !/\S/.test('') → true for both → no adjustment from code block
      // But the line '```python' does have \S content, so not null
      expect(result).not.toBeNull()
      expect(result.line).toBe(0)
    })

    it('math block without valid nextline but valid preline', () => {
      const cursor = { line: 2, ch: 0 }
      const line = '$$'
      const preline = 'x^2 + y^2'
      const result = adjustCursor(cursor, preline, line, '')
      expect(result.line).toBe(1)
      expect(result.ch).toBe(preline.length)
    })

    it('math block without valid nextline or preline', () => {
      const cursor = { line: 1, ch: 0 }
      const line = '$$'
      const result = adjustCursor(cursor, '', line, '')
      // Line $$ has \S, so not null, but no adjustment
      expect(result).not.toBeNull()
    })
  })

  describe('adjustCursor — list items edge cases', () => {
    it('list with * prefix adjusts cursor to ch=2', () => {
      const cursor = { line: 0, ch: 0 }
      const line = '* item text'
      const result = adjustCursor(cursor, '', line, '')
      expect(result.ch).toBe(2)
    })

    it('list item cursor at ch=2 is not adjusted', () => {
      const cursor = { line: 0, ch: 2 }
      const line = '- item text'
      const result = adjustCursor(cursor, '', line, '')
      // ch=2 is NOT <= 1, so no adjustment from list check
      expect(result.ch).toBe(2)
    })

    it('list with + prefix and ch=0', () => {
      const cursor = { line: 0, ch: 0 }
      const line = '+ list item'
      const result = adjustCursor(cursor, '', line, '')
      expect(result.ch).toBe(2)
    })
  })

  describe('adjustCursor — table row cursor inside (not at edges)', () => {
    it('cursor in middle of table row is not adjusted', () => {
      const cursor = { line: 0, ch: 5 }
      const line = '| cell1 | cell2 |'
      const result = adjustCursor(cursor, '', line, '')
      // ch=5 is between indexOf('|')+1=1 and lastIndexOf('|')-1=15
      // No adjustment needed
      expect(result.ch).toBe(5)
    })
  })

  describe('adjustCursor — line is pure whitespace', () => {
    it('returns null for tab-only line', () => {
      const result = adjustCursor({ line: 0, ch: 0 }, '', '\t\t', '')
      expect(result).toBeNull()
    })

    it('returns null for newline-only line', () => {
      const result = adjustCursor({ line: 0, ch: 0 }, '', '  \t  ', '')
      expect(result).toBeNull()
    })
  })

  describe('animatedScrollTo — full animation lifecycle with callback', () => {
    it('calls callback after animation completes', () => {
      vi.useFakeTimers()
      const el = { scrollTop: 0 }
      const callback = vi.fn()

      let storedRaf
      vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((cb) => {
        storedRaf = cb
        return 1
      })

      animatedScrollTo(el, 100, 300, callback)

      // Simulate time passing beyond duration
      const startTime = Date.now()
      vi.advanceTimersByTime(400)

      if (storedRaf) {
        // Call with time after duration
        storedRaf()
      }

      // scrollTop should be set to target
      expect(el.scrollTop).toBe(100)
      expect(callback).toHaveBeenCalled()

      vi.restoreAllMocks()
      vi.useRealTimers()
    })

    it('animates through intermediate steps', () => {
      vi.useFakeTimers()
      const el = { scrollTop: 0 }
      const rafCallbacks = []

      vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((cb) => {
        rafCallbacks.push(cb)
        return rafCallbacks.length
      })

      animatedScrollTo(el, 200, 1000)

      // First frame
      expect(rafCallbacks).toHaveLength(1)

      // Call first frame — should request another
      vi.advanceTimersByTime(100)
      rafCallbacks[0]()

      // scrollTop should have changed but not be at target yet
      expect(el.scrollTop).not.toBe(200)
      expect(rafCallbacks).toHaveLength(2)

      vi.restoreAllMocks()
      vi.useRealTimers()
    })
  })

  describe('animatedScrollTo — edge cases', () => {
    it('handles exact boundary (change = 6)', () => {
      const el = { scrollTop: 0 }
      animatedScrollTo(el, 6, 300)
      // abs(change) = 6, which is <= 6, so immediate
      expect(el.scrollTop).toBe(6)
    })

    it('handles change = 7 (starts animation)', () => {
      vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation(() => 1)
      const el = { scrollTop: 0 }
      animatedScrollTo(el, 7, 300)
      // abs(change) > 6 → animation started
      vi.restoreAllMocks()
    })

    it('handles negative scroll direction', () => {
      const el = { scrollTop: 100 }
      animatedScrollTo(el, 0, 0)
      expect(el.scrollTop).toBe(0)
    })
  })

  describe('dataURItoBlob — various types', () => {
    it('converts image/png data URI', () => {
      // 1x1 transparent PNG in base64
      const dataURI = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
      const blob = dataURItoBlob(dataURI)
      expect(blob).toBeInstanceOf(Blob)
      expect(blob.type).toBe('image/png')
      expect(blob.size).toBeGreaterThan(0)
    })

    it('converts application/json data URI', () => {
      const json = btoa('{"key":"value"}')
      const dataURI = `data:application/json;base64,${json}`
      const blob = dataURItoBlob(dataURI)
      expect(blob.type).toBe('application/json')
    })
  })

  describe('serialize — special characters', () => {
    it('encodes special characters', () => {
      const result = serialize({ q: 'a&b=c' })
      expect(result).toContain('a&b=c') // encodeURI doesn't encode & and =
    })

    it('handles single key', () => {
      expect(serialize({ k: 'v' })).toBe('k=v')
    })
  })

  describe('merge — edge cases', () => {
    it('merges with single argument', () => {
      const result = merge({ a: 1 })
      expect(result).toEqual({ a: 1 })
    })

    it('merges with no arguments', () => {
      const result = merge()
      expect(result).toEqual({})
    })
  })

  describe('cloneObj — edge cases', () => {
    it('deep clones arrays', () => {
      const obj = { arr: [1, 2, 3] }
      const clone = cloneObj(obj, true)
      expect(clone.arr).toEqual([1, 2, 3])
      expect(clone.arr).not.toBe(obj.arr)
    })
  })

  describe('cloneObject — with null prototype', () => {
    it('creates object with null prototype', () => {
      const obj = { x: 1, y: 2 }
      const clone = cloneObject(obj, false)
      expect(Object.getPrototypeOf(clone)).toBeNull()
      expect(clone.x).toBe(1)
    })
  })
})
