/**
 * Tests for src/renderer/src/codeMirror/mltiplexMode.js
 *
 * Covers: multiplexMode — CodeMirror.multiplexingMode registration,
 * startState, copyState, token, indent, blankLine, innerMode.
 */

import multiplexMode from '@/codeMirror/mltiplexMode'

describe('multiplexMode', () => {
  let CodeMirror

  beforeEach(() => {
    CodeMirror = {
      startState: vi.fn((mode, indent) => {
        if (typeof mode.startState === 'function') return mode.startState()
        return {}
      }),
      copyState: vi.fn((mode, state) => ({ ...state })),
      Pass: Symbol('Pass')
    }
  })

  it('is a function', () => {
    expect(typeof multiplexMode).toBe('function')
  })

  it('installs multiplexingMode on CodeMirror', () => {
    multiplexMode(CodeMirror)
    expect(typeof CodeMirror.multiplexingMode).toBe('function')
  })

  describe('CodeMirror.multiplexingMode(outer, ...others)', () => {
    let outer, inner, mode

    beforeEach(() => {
      multiplexMode(CodeMirror)

      outer = {
        startState: () => ({ outer: true }),
        token: vi.fn((stream) => {
          stream.pos = stream.string.length
          return 'outer-token'
        }),
        indent: vi.fn(() => 0),
        blankLine: vi.fn(),
        electricChars: '{}'
      }

      inner = {
        open: '```',
        close: '```',
        mode: {
          startState: () => ({ inner: true }),
          token: vi.fn((stream) => {
            stream.pos = stream.string.length
            return 'inner-token'
          })
        }
      }

      mode = CodeMirror.multiplexingMode(outer, inner)
    })

    describe('startState', () => {
      it('creates state with outer, innerActive, inner', () => {
        const state = mode.startState()
        expect(state.outer).toBeDefined()
        expect(state.innerActive).toBeNull()
        expect(state.inner).toBeNull()
      })
    })

    describe('copyState', () => {
      it('copies outer state', () => {
        const state = mode.startState()
        const copy = mode.copyState(state)
        expect(copy.outer).toBeDefined()
        expect(copy.innerActive).toBeNull()
      })

      it('copies inner state when active', () => {
        const state = mode.startState()
        state.innerActive = inner
        state.inner = { inner: true }

        const copy = mode.copyState(state)
        expect(copy.innerActive).toBe(inner)
      })
    })

    describe('token', () => {
      it('returns outer token when no inner mode active', () => {
        const state = mode.startState()
        const stream = {
          start: 0,
          pos: 0,
          string: 'hello world',
          sol: vi.fn(() => false),
          match: vi.fn()
        }

        const result = mode.token(stream, state)
        expect(result).toBe('outer-token')
      })

      it('enters inner mode when open delimiter found at pos', () => {
        const state = mode.startState()
        const stream = {
          start: 0,
          pos: 0,
          string: '```code```',
          sol: vi.fn(() => false),
          match: vi.fn(() => true)
        }

        mode.token(stream, state)
        expect(state.innerActive).toBe(inner)
      })

      it('applies delimStyle when entering inner mode', () => {
        const styledInner = {
          open: '```',
          close: '```',
          delimStyle: 'delim',
          mode: {
            startState: () => ({}),
            token: vi.fn((s) => { s.pos = s.string.length; return null })
          }
        }

        const styledMode = CodeMirror.multiplexingMode(outer, styledInner)
        const state = styledMode.startState()
        const stream = {
          start: 0,
          pos: 0,
          string: '```code',
          sol: vi.fn(() => false),
          match: vi.fn(() => true)
        }

        const result = styledMode.token(stream, state)
        expect(result).toContain('delim')
      })
    })

    describe('indent', () => {
      it('returns outer indent when no inner active', () => {
        outer.indent.mockReturnValue(4)
        const state = mode.startState()

        const result = mode.indent(state, 'text')
        expect(result).toBe(4)
      })

      it('returns inner indent when inner mode active and has indent', () => {
        const innerWithIndent = {
          open: '```',
          close: '```',
          mode: {
            startState: () => ({}),
            token: vi.fn(() => null),
            indent: vi.fn(() => 8)
          }
        }

        const m = CodeMirror.multiplexingMode(outer, innerWithIndent)
        const state = m.startState()
        state.innerActive = innerWithIndent
        state.inner = {}

        const result = m.indent(state, 'text')
        expect(result).toBe(8)
      })

      it('returns Pass when mode has no indent', () => {
        const noIndentOuter = {
          startState: () => ({}),
          token: vi.fn(() => null)
        }
        const m = CodeMirror.multiplexingMode(noIndentOuter, inner)
        const state = m.startState()

        const result = m.indent(state, '')
        expect(result).toBe(CodeMirror.Pass)
      })
    })

    describe('blankLine', () => {
      it('calls outer blankLine when no inner active', () => {
        const state = mode.startState()
        mode.blankLine(state)
        expect(outer.blankLine).toHaveBeenCalled()
      })

      it('activates inner mode on blankLine when open is newline', () => {
        const newlineInner = {
          open: '\n',
          close: '\n',
          mode: {
            startState: () => ({ nl: true }),
            token: vi.fn(() => null)
          }
        }

        const m = CodeMirror.multiplexingMode(outer, newlineInner)
        const state = m.startState()

        m.blankLine(state)

        expect(state.innerActive).toBe(newlineInner)
      })

      it('deactivates inner mode on blankLine when close is newline', () => {
        const newlineClose = {
          open: '```',
          close: '\n',
          mode: {
            startState: () => ({}),
            token: vi.fn(() => null),
            blankLine: vi.fn()
          }
        }

        const m = CodeMirror.multiplexingMode(outer, newlineClose)
        const state = m.startState()
        state.innerActive = newlineClose
        state.inner = {}

        m.blankLine(state)

        expect(state.innerActive).toBeNull()
        expect(state.inner).toBeNull()
      })
    })

    describe('innerMode', () => {
      it('returns outer when no inner active', () => {
        const state = mode.startState()
        const result = mode.innerMode(state)
        expect(result.mode).toBe(outer)
      })

      it('returns inner when active', () => {
        const state = mode.startState()
        state.inner = { active: true }
        state.innerActive = inner

        const result = mode.innerMode(state)
        expect(result.mode).toBe(inner.mode)
      })
    })

    describe('electricChars', () => {
      it('uses outer electricChars', () => {
        expect(mode.electricChars).toBe('{}')
      })
    })
  })
})
