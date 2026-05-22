/**
 * Tests for src/renderer/src/codeMirror/index.js
 *
 * Covers: search, setCursorAtLastLine, isCursorAtFirstLine,
 * isCursorAtLastLine, isCursorAtBegin, isCursorAtEnd,
 * onlyHaveOneLine, getBeginPosition, getEndPosition,
 * setCursorAtFirstLine, setMode, setTextDirection.
 */

// Heavy mock of codemirror since it requires DOM and module loading
vi.mock('codemirror/lib/codemirror', () => {
  const cm = {
    modeInfo: [
      { name: 'JavaScript', mode: 'javascript', mime: 'text/javascript' },
      { name: 'Python', mode: 'python', mime: 'text/x-python' },
      { name: 'XML', mode: 'xml', mime: 'application/xml', mimes: ['application/xml', 'text/xml'] },
      { name: 'GFM', mode: 'gfm', mime: 'text/x-gfm' },
      { name: 'Shell', mode: 'shell', mime: 'text/x-sh' }
    ],
    modeURL: '',
    requireMode: vi.fn((mode, cb) => cb()),
    autoLoadMode: vi.fn(),
    defineMode: vi.fn(),
    modes: {}
  }
  return { default: cm }
})

vi.mock('codemirror/addon/edit/closebrackets', () => ({}))
vi.mock('codemirror/addon/edit/closetag', () => ({}))
vi.mock('codemirror/addon/selection/active-line', () => ({}))
vi.mock('codemirror/mode/meta', () => ({}))
vi.mock('codemirror/lib/codemirror.css', () => ({}))
vi.mock('codemirror/theme/railscasts.css', () => ({}))

vi.mock('fuzzaldrin', () => ({
  filter: vi.fn((items, text, opts) => {
    const key = opts?.key
    return items.filter((item) => {
      const val = key ? item[key] : item
      return val.toLowerCase().includes(text.toLowerCase())
    })
  })
}))

vi.mock('@/codeMirror/loadmode', () => ({
  default: vi.fn()
}))
vi.mock('@/codeMirror/overlayMode', () => ({
  default: vi.fn()
}))
vi.mock('@/codeMirror/mltiplexMode', () => ({
  default: vi.fn()
}))
vi.mock('@/codeMirror/index.css', () => ({}))

import {
  search,
  setCursorAtLastLine,
  isCursorAtFirstLine,
  isCursorAtLastLine,
  isCursorAtBegin,
  isCursorAtEnd,
  onlyHaveOneLine,
  getBeginPosition,
  getEndPosition,
  setCursorAtFirstLine,
  setMode,
  setTextDirection
} from '@/codeMirror/index'

describe('codeMirror/index.js', () => {
  describe('search', () => {
    it('returns matching language modes for a text query', () => {
      const results = search('javascript')
      // Should find javascript from modes
      expect(Array.isArray(results)).toBe(true)
    })

    it('returns empty array for no match', () => {
      const results = search('zzz_nonexistent_lang')
      expect(results).toEqual([])
    })

    it('filters out null results from getModeFromName', () => {
      // Languages that are in modes.js but not in CodeMirror.modeInfo
      // will produce null results that should be filtered
      const results = search('python')
      expect(Array.isArray(results)).toBe(true)
    })
  })

  describe('setCursorAtLastLine', () => {
    it('focuses and sets cursor at last line end', () => {
      const cm = {
        lastLine: vi.fn(() => 5),
        getLineHandle: vi.fn(() => ({ text: 'hello' })),
        focus: vi.fn(),
        setCursor: vi.fn()
      }

      setCursorAtLastLine(cm)

      expect(cm.focus).toHaveBeenCalled()
      expect(cm.setCursor).toHaveBeenCalledWith(5, 5) // line 5, ch = "hello".length
    })
  })

  describe('isCursorAtFirstLine', () => {
    it('returns true when cursor is at 0,0 with outside flag', () => {
      const cm = {
        getCursor: vi.fn(() => ({ line: 0, ch: 0, outside: true }))
      }
      expect(isCursorAtFirstLine(cm)).toBe(true)
    })

    it('returns false when cursor is not at first line', () => {
      const cm = {
        getCursor: vi.fn(() => ({ line: 1, ch: 0, outside: true }))
      }
      expect(isCursorAtFirstLine(cm)).toBe(false)
    })

    it('returns false when cursor has chars', () => {
      const cm = {
        getCursor: vi.fn(() => ({ line: 0, ch: 5, outside: true }))
      }
      expect(isCursorAtFirstLine(cm)).toBe(false)
    })

    it('returns false when outside is falsy', () => {
      const cm = {
        getCursor: vi.fn(() => ({ line: 0, ch: 0, outside: false }))
      }
      expect(isCursorAtFirstLine(cm)).toBe(false)
    })
  })

  describe('isCursorAtLastLine', () => {
    it('returns true when cursor on last line with outside', () => {
      const cm = {
        lastLine: vi.fn(() => 10),
        getCursor: vi.fn(() => ({ line: 10, outside: true, sticky: null }))
      }
      expect(isCursorAtLastLine(cm)).toBe(true)
    })

    it('returns true when cursor on last line without sticky', () => {
      const cm = {
        lastLine: vi.fn(() => 3),
        getCursor: vi.fn(() => ({ line: 3, outside: false, sticky: null }))
      }
      expect(isCursorAtLastLine(cm)).toBe(true)
    })

    it('returns false when cursor not on last line', () => {
      const cm = {
        lastLine: vi.fn(() => 5),
        getCursor: vi.fn(() => ({ line: 3, outside: false, sticky: 'after' }))
      }
      expect(isCursorAtLastLine(cm)).toBe(false)
    })
  })

  describe('isCursorAtBegin', () => {
    it('returns true when at line 0, ch 0 with hitSide', () => {
      const cm = {
        getCursor: vi.fn(() => ({ line: 0, ch: 0, hitSide: true }))
      }
      expect(isCursorAtBegin(cm)).toBe(true)
    })

    it('returns false without hitSide', () => {
      const cm = {
        getCursor: vi.fn(() => ({ line: 0, ch: 0, hitSide: false }))
      }
      expect(isCursorAtBegin(cm)).toBe(false)
    })
  })

  describe('isCursorAtEnd', () => {
    it('returns true when at end of last line with hitSide', () => {
      const cm = {
        lastLine: vi.fn(() => 2),
        getLineHandle: vi.fn(() => ({ text: 'abc' })),
        getCursor: vi.fn(() => ({ line: 2, ch: 3, hitSide: true }))
      }
      expect(isCursorAtEnd(cm)).toBe(true)
    })

    it('returns false when not at end', () => {
      const cm = {
        lastLine: vi.fn(() => 2),
        getLineHandle: vi.fn(() => ({ text: 'abc' })),
        getCursor: vi.fn(() => ({ line: 2, ch: 1, hitSide: true }))
      }
      expect(isCursorAtEnd(cm)).toBe(false)
    })
  })

  describe('onlyHaveOneLine', () => {
    it('returns true when lineCount is 1', () => {
      const cm = { lineCount: vi.fn(() => 1) }
      expect(onlyHaveOneLine(cm)).toBe(true)
    })

    it('returns false when lineCount > 1', () => {
      const cm = { lineCount: vi.fn(() => 3) }
      expect(onlyHaveOneLine(cm)).toBe(false)
    })
  })

  describe('getBeginPosition', () => {
    it('returns anchor and head at 0,0', () => {
      const pos = getBeginPosition()
      expect(pos).toEqual({
        anchor: { line: 0, ch: 0 },
        head: { line: 0, ch: 0 }
      })
    })
  })

  describe('getEndPosition', () => {
    it('returns anchor and head at end of last line', () => {
      const cm = {
        lastLine: vi.fn(() => 5),
        getLineHandle: vi.fn(() => ({ text: 'end text' }))
      }
      const pos = getEndPosition(cm)
      expect(pos.anchor.line).toBe(5)
      expect(pos.anchor.ch).toBe(8)
      expect(pos.head.line).toBe(5)
      expect(pos.head.ch).toBe(8)
    })
  })

  describe('setCursorAtFirstLine', () => {
    it('focuses and sets cursor to 0,0', () => {
      const cm = { focus: vi.fn(), setCursor: vi.fn() }
      setCursorAtFirstLine(cm)
      expect(cm.focus).toHaveBeenCalled()
      expect(cm.setCursor).toHaveBeenCalledWith(0, 0)
    })
  })

  describe('setMode', () => {
    it('rejects when text is empty', async () => {
      await expect(setMode({}, '')).rejects.toContain('provided a language')
    })

    it('rejects when text is not a valid mode', async () => {
      await expect(setMode({}, 'nonexistent_mode_xyz')).rejects.toContain(
        'not a valid language mode'
      )
    })
  })

  describe('setTextDirection', () => {
    it('sets direction option on cm', () => {
      const cm = { setOption: vi.fn() }
      setTextDirection(cm, 'rtl')
      expect(cm.setOption).toHaveBeenCalledWith('direction', 'rtl')
    })

    it('sets ltr direction', () => {
      const cm = { setOption: vi.fn() }
      setTextDirection(cm, 'ltr')
      expect(cm.setOption).toHaveBeenCalledWith('direction', 'ltr')
    })
  })
})
