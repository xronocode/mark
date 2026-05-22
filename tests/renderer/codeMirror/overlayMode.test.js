/**
 * Tests for src/renderer/src/codeMirror/overlayMode.js
 *
 * Covers: overlayMode — CodeMirror.overlayMode registration,
 * startState, copyState, token, indent, innerMode, blankLine.
 */

import overlayMode from '@/codeMirror/overlayMode'

describe('overlayMode', () => {
  let CodeMirror

  beforeEach(() => {
    CodeMirror = {
      startState: vi.fn((mode) => {
        if (typeof mode.startState === 'function') return mode.startState()
        return {}
      }),
      copyState: vi.fn((mode, state) => ({ ...state })),
      Pass: Symbol('Pass')
    }
  })

  it('is a function', () => {
    expect(typeof overlayMode).toBe('function')
  })

  it('installs overlayMode on CodeMirror', () => {
    overlayMode(CodeMirror)
    expect(typeof CodeMirror.overlayMode).toBe('function')
  })

  describe('CodeMirror.overlayMode(base, overlay, combine)', () => {
    let base, overlay, mode

    beforeEach(() => {
      overlayMode(CodeMirror)

      base = {
        startState: () => ({ base: true }),
        token: vi.fn(() => 'base-token'),
        indent: vi.fn(() => 2),
        blankLine: vi.fn(() => undefined),
        electricChars: '{}',
      }

      overlay = {
        startState: () => ({ overlay: true }),
        token: vi.fn(() => null),
        blankLine: vi.fn(() => undefined)
      }

      mode = CodeMirror.overlayMode(base, overlay, false)
    })

    describe('startState', () => {
      it('creates composite state with base and overlay', () => {
        const state = mode.startState()
        expect(state).toHaveProperty('base')
        expect(state).toHaveProperty('overlay')
        expect(state.basePos).toBe(0)
        expect(state.overlayPos).toBe(0)
        expect(state.streamSeen).toBeNull()
      })
    })

    describe('copyState', () => {
      it('copies both base and overlay states', () => {
        const state = mode.startState()
        const copy = mode.copyState(state)
        expect(copy.baseCur).toBeNull()
        expect(copy.overlayCur).toBeNull()
      })
    })

    describe('token', () => {
      it('returns base token when overlay returns null', () => {
        overlay.token.mockReturnValue(null)
        base.token.mockReturnValue('keyword')

        const state = mode.startState()
        const stream = { start: 0, pos: 5, string: 'hello' }

        const result = mode.token(stream, state)
        expect(result).toBe('keyword')
      })

      it('returns overlay token when overlay returns non-null', () => {
        overlay.token.mockReturnValue('overlay-style')
        base.token.mockReturnValue('base-style')

        const state = mode.startState()
        state.streamSeen = null
        const stream = { start: 0, pos: 5, string: 'hello' }

        const result = mode.token(stream, state)
        expect(result).toBe('overlay-style')
      })

      it('combines tokens when combine is true and combineTokens is null', () => {
        overlayMode(CodeMirror)
        const combinedMode = CodeMirror.overlayMode(base, overlay, true)

        overlay.token.mockReturnValue('ov-token')
        base.token.mockReturnValue('base-token')

        const state = combinedMode.startState()
        // Set combineTokens to null to trigger combination
        state.overlay.combineTokens = null
        const stream = { start: 0, pos: 5, string: 'hello' }

        const result = combinedMode.token(stream, state)
        expect(result).toBe('base-token ov-token')
      })
    })

    describe('indent', () => {
      it('delegates to base indent', () => {
        base.indent.mockReturnValue(4)
        const state = mode.startState()

        const result = mode.indent(state, 'text')
        expect(result).toBe(4)
      })
    })

    describe('electricChars', () => {
      it('uses base electricChars', () => {
        expect(mode.electricChars).toBe('{}')
      })
    })

    describe('innerMode', () => {
      it('returns base state and mode', () => {
        const state = mode.startState()
        const inner = mode.innerMode(state)
        expect(inner.mode).toBe(base)
      })
    })

    describe('blankLine', () => {
      it('calls base.blankLine and overlay.blankLine', () => {
        const state = mode.startState()
        mode.blankLine(state)

        expect(base.blankLine).toHaveBeenCalled()
        expect(overlay.blankLine).toHaveBeenCalled()
      })

      it('returns overlay result when non-null', () => {
        overlay.blankLine.mockReturnValue('ov-blank')
        base.blankLine.mockReturnValue(undefined)

        const state = mode.startState()
        const result = mode.blankLine(state)
        expect(result).toBe('ov-blank')
      })

      it('returns base result when overlay returns null', () => {
        overlay.blankLine.mockReturnValue(null)
        base.blankLine.mockReturnValue('base-blank')

        const state = mode.startState()
        const result = mode.blankLine(state)
        expect(result).toBe('base-blank')
      })

      it('combines results when combine is true', () => {
        overlayMode(CodeMirror)
        const combinedMode = CodeMirror.overlayMode(base, overlay, true)

        overlay.blankLine.mockReturnValue('ov-blank')
        base.blankLine.mockReturnValue('base-blank')

        const state = combinedMode.startState()
        const result = combinedMode.blankLine(state)
        expect(result).toBe('base-blank ov-blank')
      })
    })

    it('handles base without indent', () => {
      const noIndentBase = {
        startState: () => ({}),
        token: vi.fn(() => 'tok')
      }
      const m = CodeMirror.overlayMode(noIndentBase, overlay, false)
      expect(m.indent).toBeFalsy()
    })

    it('handles base without blankLine', () => {
      const noBlanBase = {
        startState: () => ({}),
        token: vi.fn(() => 'tok')
      }
      const m = CodeMirror.overlayMode(noBlanBase, overlay, false)
      const state = m.startState()
      // Should not throw
      m.blankLine(state)
    })

    it('handles overlay without blankLine', () => {
      const noBlankOverlay = {
        startState: () => ({}),
        token: vi.fn(() => null)
      }
      const m = CodeMirror.overlayMode(base, noBlankOverlay, false)
      const state = m.startState()
      m.blankLine(state)
    })
  })
})
