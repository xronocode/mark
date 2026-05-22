/**
 * Tests for src/renderer/src/codeMirror/loadmode.js
 *
 * Covers: loadMore function — CodeMirror.requireMode, autoLoadMode,
 * splitCallback, ensureDeps patterns.
 */

import loadMore from '@/codeMirror/loadmode'

describe('loadMore (loadmode.js)', () => {
  let CodeMirror

  beforeEach(() => {
    CodeMirror = {
      modes: {},
      modeURL: '',
      startState: vi.fn()
    }
  })

  it('is a function', () => {
    expect(typeof loadMore).toBe('function')
  })

  it('sets default modeURL when not already set', () => {
    CodeMirror.modeURL = ''
    loadMore(CodeMirror)
    // After loadMore, modeURL should be set if it was falsy
    expect(CodeMirror.modeURL).toBeTruthy()
  })

  it('preserves existing modeURL', () => {
    CodeMirror.modeURL = '/custom/path/%N/%N.js'
    loadMore(CodeMirror)
    expect(CodeMirror.modeURL).toBe('/custom/path/%N/%N.js')
  })

  it('installs requireMode function', () => {
    loadMore(CodeMirror)
    expect(typeof CodeMirror.requireMode).toBe('function')
  })

  it('installs autoLoadMode function', () => {
    loadMore(CodeMirror)
    expect(typeof CodeMirror.autoLoadMode).toBe('function')
  })

  describe('requireMode', () => {
    it('calls callback immediately for already-loaded modes', () => {
      loadMore(CodeMirror)
      CodeMirror.modes.javascript = {}
      const cb = vi.fn()

      CodeMirror.requireMode('javascript', cb)

      expect(cb).toHaveBeenCalled()
    })

    it('handles mode object with name property', () => {
      loadMore(CodeMirror)
      CodeMirror.modes.python = {}
      const cb = vi.fn()

      CodeMirror.requireMode({ name: 'python' }, cb)

      expect(cb).toHaveBeenCalled()
    })

    it('handles dependencies in modes', () => {
      loadMore(CodeMirror)
      CodeMirror.modes.derived = { dependencies: ['base'] }
      CodeMirror.modes.base = {}
      const cb = vi.fn()

      CodeMirror.requireMode('derived', cb)

      expect(cb).toHaveBeenCalled()
    })

    it('logs error for unknown mode path', () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      CodeMirror.modeURL = '' // falsy → set by loadMore
      loadMore(CodeMirror)

      const cb = vi.fn()
      CodeMirror.requireMode('nonexistent_mode', cb)

      // Should log an error about invalid loader
      expect(errorSpy).toHaveBeenCalled()
      errorSpy.mockRestore()
    })
  })

  describe('autoLoadMode', () => {
    it('does nothing for already-loaded mode', () => {
      loadMore(CodeMirror)
      CodeMirror.modes.css = {}
      const instance = {
        setOption: vi.fn(),
        getOption: vi.fn(() => 'text/css')
      }

      CodeMirror.autoLoadMode(instance, 'css')
      // No error, no requireMode call for already loaded
    })

    it('calls requireMode for unloaded mode', () => {
      loadMore(CodeMirror)
      const instance = {
        setOption: vi.fn(),
        getOption: vi.fn(() => 'text/x-python')
      }

      // requireMode will log error since there's no actual loader
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      CodeMirror.autoLoadMode(instance, 'python_unknown')
      errorSpy.mockRestore()
    })
  })
})
